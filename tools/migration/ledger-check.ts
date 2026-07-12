import { z } from 'zod'

import type { MigrationLedger } from './ledger-schema.js'
import { migrationLedgerSchema } from './ledger-schema.js'
import { compareCodePoints, renderLedger } from './render-ledger.js'

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

const successfulCiProofSchema = z.strictObject({
  schemaVersion: z.literal(1),
  repository: z.string().min(1),
  workflow: z.string().min(1),
  event: z.string().min(1),
  status: z.string().min(1),
  conclusion: z.string().min(1),
  candidateSha: fullShaSchema,
  headSha: fullShaSchema,
  runId: z.number().int().positive(),
  runUrl: z.string().url(),
})

export type SuccessfulCiProof = z.infer<typeof successfulCiProofSchema>

export function recordSuccessfulCi(
  input: unknown,
  batch: string,
  proofInput: unknown,
): MigrationLedger {
  const ledger = migrationLedgerSchema.parse(input)
  const proofResult = successfulCiProofSchema.safeParse(proofInput)
  if (!proofResult.success) {
    throw new Error(`Invalid verified CI proof: ${proofResult.error.issues[0]?.message ?? 'unknown error'}`)
  }
  const proof = proofResult.data
  if (proof.repository !== 'AnsonHui6040/ramen-style-today-next'
    || proof.workflow !== 'ci.yml'
    || proof.event !== 'push'
    || proof.status !== 'completed'
    || proof.conclusion !== 'success') {
    throw new Error('CI proof must describe this repository ci.yml completed successful push run')
  }
  if (proof.candidateSha !== proof.headSha) {
    throw new Error('CI proof candidate SHA must match CI head SHA')
  }
  const parsedUrl = new URL(proof.runUrl)
  const expectedPath = `/AnsonHui6040/ramen-style-today-next/actions/runs/${proof.runId}`
  if (parsedUrl.origin !== 'https://github.com'
    || parsedUrl.pathname.replace(/\/$/u, '') !== expectedPath) {
    throw new Error('CI proof run URL must match CI run ID for this repository')
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
          commitSha: proof.candidateSha,
          runUrl: proof.runUrl,
        },
      ],
    } : entry),
  })
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
