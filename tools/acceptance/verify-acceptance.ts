import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import { z } from 'zod'

import { migrationLedgerSchema } from '../migration/ledger-schema.js'

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

export interface AuthenticatedSuccessfulCiRun {
  readonly [authenticatedRun]: true
  readonly sha: string
  readonly runId: number
  readonly runUrl: string
}

export function assertAuthenticatedSuccessfulCiRun(
  value: unknown,
): asserts value is AuthenticatedSuccessfulCiRun {
  if (typeof value !== 'object'
    || value === null
    || !(authenticatedRun in value)
    || value[authenticatedRun] !== true) {
    throw new Error('CI promotion requires an authenticated GitHub Actions run')
  }
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
  if (!githubToken || githubToken.trim() !== githubToken
    || Array.from(githubToken).some((character) => character.codePointAt(0)! <= 32)) {
    throw new Error('GITHUB_TOKEN is required to authenticate recorded remote CI evidence')
  }

  const apiUrl = `${githubApiOrigin}/repos/${githubRepository}/actions/runs/${proof.runId}`
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${githubToken}`,
    'User-Agent': 'ramen-style-today-next',
  }
  let response: Response
  try {
    response = await fetchImplementation(apiUrl, {
      headers,
      redirect: 'error',
    })
  } catch {
    throw new Error('Unable to verify GitHub Actions run')
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
  } catch {
    throw new Error('Received malformed GitHub Actions run response')
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
  } catch {
    throw new Error('Unable to verify canonical GitHub Actions workflow')
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
  } catch {
    throw new Error('Received malformed GitHub workflow response')
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

function proofFromRecordedEvidence(
  evidence: { commitSha?: string | undefined; runUrl?: string | undefined },
): SuccessfulCiProof {
  if (!evidence.commitSha || !evidence.runUrl) {
    throw new Error('Recorded remote CI evidence is missing commit SHA or run URL')
  }
  let runUrl: URL
  try {
    runUrl = new URL(evidence.runUrl)
  } catch {
    throw new Error('Recorded remote CI run URL is malformed')
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

export async function verifyAcceptance(
  input: unknown,
  fetchImplementation: typeof fetch,
  githubToken?: string,
): Promise<void> {
  const ledger = migrationLedgerSchema.parse(input)
  const proofs: SuccessfulCiProof[] = []
  const proofIdentities = new Set<string>()
  for (const entry of ledger.entries) {
    const registeredEvidence = [
      entry.verification,
      entry.acceptanceBoundary?.verification ?? [],
      entry.boundaryMaintenance?.verification ?? [],
    ]
    for (const evidence of registeredEvidence.flat()) {
      if (!evidence.gate.endsWith('-remote-ci')) continue
      const proof = proofFromRecordedEvidence(evidence)
      const identity = `${proof.sha}\u0000${proof.runUrl}`
      if (proofIdentities.has(identity)) {
        throw new Error('Recorded remote CI evidence is duplicated')
      }
      proofIdentities.add(identity)
      proofs.push(proof)
    }
  }
  if (proofs.length === 0) return
  if (!githubToken || githubToken.trim() !== githubToken
    || Array.from(githubToken).some((character) => character.codePointAt(0)! <= 32)) {
    throw new Error('GITHUB_TOKEN is required to authenticate recorded remote CI evidence')
  }
  for (const proof of proofs) {
    await verifySuccessfulCiProof(
      proof,
      proof.sha,
      fetchImplementation,
      githubToken,
    )
  }
}

async function run() {
  const repoRoot = resolve(import.meta.dirname, '../..')
  const input = JSON.parse(readFileSync(
    resolve(repoRoot, 'docs/migration/ledger.json'),
    'utf8',
  )) as unknown
  await verifyAcceptance(input, globalThis.fetch, process.env.GITHUB_TOKEN)
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined
if (invokedPath === import.meta.url) {
  void run().catch((error: unknown) => {
    console.error(`ACCEPTANCE_INVALID ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
