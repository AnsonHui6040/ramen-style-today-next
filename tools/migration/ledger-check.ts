import type { MigrationLedger } from './ledger-schema.js'
import { migrationLedgerSchema } from './ledger-schema.js'
import { renderLedger } from './render-ledger.js'

export interface LedgerCheckInput {
  input: unknown
  repoFiles: ReadonlySet<string>
  existingFiles: ReadonlySet<string>
  currentMarkdown: string | undefined
}

export interface LedgerCheckResult {
  ok: boolean
  errors: readonly string[]
  ledger: MigrationLedger | undefined
  markdown: string | undefined
}

export function recordSuccessfulCi(
  input: unknown,
  batch: string,
  commitSha: string,
  runUrl: string,
): MigrationLedger {
  const ledger = migrationLedgerSchema.parse(input)
  if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('CI commit must be a full SHA')
  const parsedUrl = new URL(runUrl)
  if (parsedUrl.origin !== 'https://github.com'
    || !/^\/AnsonHui6040\/ramen-style-today-next\/actions\/runs\/\d+\/?$/.test(parsedUrl.pathname)) {
    throw new Error('CI run URL must identify this repository workflow run')
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
          commitSha,
          runUrl,
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
      const scopedFiles = [...input.repoFiles].filter(
        (file) => file === scope || file.startsWith(`${scope}/`),
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
    errors: errors.sort(),
    ledger: parsed.data,
    markdown,
  }
}
