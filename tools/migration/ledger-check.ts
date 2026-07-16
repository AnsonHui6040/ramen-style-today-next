import { z } from 'zod'
import { compareCodePoints } from '@ramen-style/classification-core/compiler'

import type { MigrationLedger } from './ledger-schema.js'
import { migrationLedgerSchema } from './ledger-schema.js'
import { renderLedger } from './render-ledger.js'

export interface LedgerCheckInput {
  input: unknown
  repoFiles: ReadonlySet<string>
  existingFiles: ReadonlySet<string>
  repoDirectories: ReadonlySet<string>
  currentMarkdown: string | undefined
}

export interface LedgerCheckResult {
  ok: boolean
  errors: readonly string[]
  ledger: MigrationLedger | undefined
  markdown: string | undefined
}

const fullShaSchema = z.string().regex(/^[0-9a-f]{40}$/)
const githubRepository = 'AnsonHui6040/ramen-style-today-next'
const githubApiOrigin = 'https://api.github.com'
const githubHtmlOrigin = 'https://github.com'
const workflowPath = '.github/workflows/ci.yml'
const authenticatedRun = Symbol('authenticated GitHub Actions run')

const successfulCiProofSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sha: fullShaSchema,
  runId: z.number().int().positive(),
  runUrl: z.string().url(),
})

export type SuccessfulCiProof = z.infer<typeof successfulCiProofSchema>

const githubActionsRunSchema = z.object({
  id: z.number().int().positive(),
  workflow_id: z.number().int().positive(),
  html_url: z.string().url(),
  head_sha: fullShaSchema,
  head_branch: z.string().nullable(),
  event: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  path: z.string(),
  repository: z.object({
    full_name: z.string(),
  }),
})

const githubWorkflowSchema = z.object({
  id: z.number().int().positive(),
  path: z.string(),
})

function hasWorkflowPathAmbiguity(value: string) {
  return value.includes('@') || Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint <= 31 || codePoint === 127
  })
}

function canonicalWorkflowPathStatus(
  run: z.infer<typeof githubActionsRunSchema>,
): 'match' | 'ambiguous' | 'mismatch' {
  if (run.head_branch && hasWorkflowPathAmbiguity(run.head_branch)) return 'ambiguous'
  if (run.path.startsWith(`${workflowPath}@`)) {
    const suffix = run.path.slice(workflowPath.length + 1)
    if (suffix.length === 0 || hasWorkflowPathAmbiguity(suffix)) return 'ambiguous'
  }
  const expectedPaths = new Set([
    workflowPath,
    `${workflowPath}@${run.head_sha}`,
  ])
  if (run.head_branch) {
    expectedPaths.add(`${workflowPath}@${run.head_branch}`)
    expectedPaths.add(`${workflowPath}@refs/heads/${run.head_branch}`)
    expectedPaths.add(`${workflowPath}@refs/tags/${run.head_branch}`)
  }
  return expectedPaths.has(run.path) ? 'match' : 'mismatch'
}

interface AuthenticatedSuccessfulCiRun {
  readonly [authenticatedRun]: true
  readonly sha: string
  readonly runId: number
  readonly runUrl: string
}

export async function verifySuccessfulCiProof(
  proofInput: unknown,
  expectedCandidateSha: string,
  fetchImplementation: typeof fetch,
  githubToken?: string,
): Promise<AuthenticatedSuccessfulCiRun> {
  const proofResult = successfulCiProofSchema.safeParse(proofInput)
  if (!proofResult.success) {
    throw new Error(`Invalid CI proof: ${proofResult.error.issues[0]?.message ?? 'unknown error'}`)
  }
  if (!fullShaSchema.safeParse(expectedCandidateSha).success) {
    throw new Error('Current candidate SHA must be a full lowercase SHA')
  }
  const proof = proofResult.data
  if (proof.sha !== expectedCandidateSha) {
    throw new Error('CI proof SHA must match current candidate SHA')
  }

  const apiUrl = `${githubApiOrigin}/repos/${githubRepository}/actions/runs/${proof.runId}`
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ramen-style-today-next',
  }
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`
  let response: Response
  try {
    response = await fetchImplementation(apiUrl, {
      headers,
      redirect: 'error',
    })
  } catch (error) {
    throw new Error('Unable to verify GitHub Actions run', { cause: error })
  }
  if (response.redirected) throw new Error('Rejected redirected GitHub API response')
  if (response.url !== apiUrl) throw new Error('Rejected unexpected GitHub API response URL')
  if (response.status === 404) {
    throw new Error(`GitHub Actions run ${proof.runId} was not found`)
  }
  if (!response.ok) throw new Error(`GitHub API ${response.status}`)

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new Error('Received malformed GitHub Actions run response', { cause: error })
  }
  const runResult = githubActionsRunSchema.safeParse(payload)
  if (!runResult.success) throw new Error('Received malformed GitHub Actions run response')
  const run = runResult.data

  const workflowApiUrl = `${githubApiOrigin}/repos/${githubRepository}/actions/workflows/ci.yml`
  let workflowResponse: Response
  try {
    workflowResponse = await fetchImplementation(workflowApiUrl, {
      headers,
      redirect: 'error',
    })
  } catch (error) {
    throw new Error('Unable to verify canonical GitHub Actions workflow', { cause: error })
  }
  if (workflowResponse.redirected) {
    throw new Error('Rejected redirected GitHub workflow API response')
  }
  if (workflowResponse.url !== workflowApiUrl) {
    throw new Error('Rejected unexpected GitHub workflow API response URL')
  }
  if (!workflowResponse.ok) throw new Error(`GitHub workflow API ${workflowResponse.status}`)
  let workflowPayload: unknown
  try {
    workflowPayload = await workflowResponse.json()
  } catch (error) {
    throw new Error('Received malformed GitHub workflow response', { cause: error })
  }
  const workflowResult = githubWorkflowSchema.safeParse(workflowPayload)
  if (!workflowResult.success) throw new Error('Received malformed GitHub workflow response')
  const workflow = workflowResult.data
  if (workflow.path !== workflowPath) throw new Error('canonical workflow path mismatch')

  if (run.repository.full_name !== githubRepository) {
    throw new Error('GitHub Actions run repository mismatch')
  }
  if (run.workflow_id !== workflow.id) throw new Error('GitHub Actions run workflow ID mismatch')
  if (run.id !== proof.runId) throw new Error('GitHub Actions run ID mismatch')
  if (run.head_sha !== proof.sha) throw new Error('GitHub Actions run head SHA mismatch')
  const expectedRunUrl = `${githubHtmlOrigin}/${githubRepository}/actions/runs/${proof.runId}`
  if (proof.runUrl !== expectedRunUrl || run.html_url !== proof.runUrl) {
    throw new Error('GitHub Actions run URL mismatch')
  }
  if (run.event !== 'push') throw new Error('GitHub Actions run event must be push')
  if (run.status !== 'completed') throw new Error('GitHub Actions run status must be completed')
  if (run.conclusion !== 'success') throw new Error('GitHub Actions run conclusion must be success')
  const workflowPathStatus = canonicalWorkflowPathStatus(run)
  if (workflowPathStatus === 'ambiguous') {
    throw new Error('GitHub Actions run workflow path is ambiguous')
  }
  if (workflowPathStatus === 'mismatch') {
    throw new Error('GitHub Actions run workflow must be ci.yml')
  }

  return Object.freeze({
    [authenticatedRun]: true as const,
    sha: proof.sha,
    runId: proof.runId,
    runUrl: proof.runUrl,
  })
}

type CommitAncestryCheck = (
  evidenceSha: string,
  currentHeadSha: string,
) => boolean | Promise<boolean>

function proofFromRecordedEvidence(
  evidence: { commitSha?: string | undefined; runUrl?: string | undefined },
): SuccessfulCiProof {
  if (!evidence.commitSha || !evidence.runUrl) {
    throw new Error('Recorded remote CI evidence is missing commit SHA or run URL')
  }
  let runUrl: URL
  try {
    runUrl = new URL(evidence.runUrl)
  } catch (error) {
    throw new Error('Recorded remote CI run URL is malformed', { cause: error })
  }
  const match = /^\/AnsonHui6040\/ramen-style-today-next\/actions\/runs\/([1-9][0-9]*)$/.exec(
    runUrl.pathname,
  )
  if (runUrl.origin !== githubHtmlOrigin
    || runUrl.username
    || runUrl.password
    || runUrl.search
    || runUrl.hash
    || !match) {
    throw new Error('Recorded remote CI run URL must be the canonical repository run URL')
  }
  const runId = Number(match[1])
  if (!Number.isSafeInteger(runId)) {
    throw new Error('Recorded remote CI run ID is not a safe positive integer')
  }
  return successfulCiProofSchema.parse({
    schemaVersion: 1,
    sha: evidence.commitSha,
    runId,
    runUrl: evidence.runUrl,
  })
}

export async function authenticateLedgerRemoteCiEvidence(
  input: unknown,
  currentHeadSha: string,
  fetchImplementation: typeof fetch,
  isCommitAncestor: CommitAncestryCheck,
  githubToken?: string,
): Promise<void> {
  if (!fullShaSchema.safeParse(currentHeadSha).success) {
    throw new Error('Current repository HEAD must be a full lowercase SHA')
  }
  const ledger = migrationLedgerSchema.parse(input)
  for (const entry of ledger.entries) {
    for (const evidence of entry.verification) {
      if (!evidence.gate.endsWith('-remote-ci')) continue
      const proof = proofFromRecordedEvidence(evidence)
      if (!await isCommitAncestor(proof.sha, currentHeadSha)) {
        throw new Error(
          `Recorded remote CI commit ${proof.sha} is not an ancestor of current HEAD ${currentHeadSha}`,
        )
      }
      await verifySuccessfulCiProof(
        proof,
        proof.sha,
        fetchImplementation,
        githubToken,
      )
    }
  }
}

export function recordSuccessfulCi(
  input: unknown,
  batch: string,
  verifiedRun: AuthenticatedSuccessfulCiRun,
): MigrationLedger {
  const ledger = migrationLedgerSchema.parse(input)
  if (typeof verifiedRun !== 'object'
    || verifiedRun === null
    || verifiedRun[authenticatedRun] !== true) {
    throw new Error('CI promotion requires an authenticated GitHub Actions run')
  }
  const target = ledger.entries.find((entry) => entry.batch === batch)
  if (!target) throw new Error(`Unknown ledger batch ${batch}`)
  if (target.status !== 'in-review') throw new Error(`Batch ${batch} is not in review`)
  const gate = `batch${batch.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-remote-ci`
  if (target.verification.some((item) => item.gate === gate)) {
    throw new Error(`Batch ${batch} already records remote CI`)
  }

  return migrationLedgerSchema.parse({
    ...ledger,
    entries: ledger.entries.map((entry) => entry.batch === batch ? {
      ...entry,
      status: 'complete',
      verification: [
        ...entry.verification,
        {
          gate,
          command: 'GitHub Actions CI / verify',
          outcome: 'passed',
          evidence: 'the pushed acceptance candidate completed the Node 24 verify job successfully',
          commitSha: verifiedRun.sha,
          runUrl: verifiedRun.runUrl,
        },
      ],
    } : entry),
  })
}

export async function verifyAndRecordSuccessfulCi(
  input: unknown,
  batch: string,
  proofInput: unknown,
  expectedCandidateSha: string,
): Promise<MigrationLedger> {
  const verifiedRun = await verifySuccessfulCiProof(
    proofInput,
    expectedCandidateSha,
    globalThis.fetch,
  )
  return recordSuccessfulCi(input, batch, verifiedRun)
}

export function checkLedger(input: LedgerCheckInput): LedgerCheckResult {
  const parsed = migrationLedgerSchema.safeParse(input.input)
  if (!parsed.success) return {
    ok: false,
    errors: parsed.error.issues.map((issue) => (
      `schema /${issue.path.map(String).join('/')}: ${issue.message}`
    )),
    ledger: undefined,
    markdown: undefined,
  }

  const errors: string[] = []
  const allOwners = new Set(parsed.data.entries.flatMap((entry) => entry.newOwners))
  for (const entry of parsed.data.entries) {
    for (const owner of entry.newOwners) {
      if (!input.repoFiles.has(owner) || !input.existingFiles.has(owner)) {
        errors.push(`Batch ${entry.batch} owner is not an existing repository file: ${owner}`)
      }
    }
    for (const scope of entry.ownedScopes) {
      if (!input.repoDirectories.has(scope)) {
        errors.push(`Batch ${entry.batch} owned scope is not a repository directory: ${scope}`)
        continue
      }
      const scopedFiles = [...input.repoFiles].filter(
        (file) => file.startsWith(`${scope}/`),
      )
      if (scopedFiles.length === 0) {
        errors.push(`Batch ${entry.batch} owned scope contains no repository files: ${scope}`)
      }
      for (const file of scopedFiles) {
        if (!allOwners.has(file)) {
          errors.push(`Repository file is not registered in owned scope ${scope}: ${file}`)
        }
      }
    }
  }
  for (const file of input.repoFiles) {
    if (!allOwners.has(file)) {
      errors.push(`Repository file has no migration-ledger owner: ${file}`)
    }
  }

  const markdown = renderLedger(parsed.data)
  if (input.currentMarkdown !== undefined && input.currentMarkdown !== markdown) {
    errors.push('generated ledger Markdown is stale')
  }
  return {
    ok: errors.length === 0,
    errors: errors.sort(compareCodePoints),
    ledger: parsed.data,
    markdown,
  }
}
