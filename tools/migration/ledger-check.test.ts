import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { checkLedger, recordSuccessfulCi } from './ledger-check.js'
import { migrationLedgerSchema } from './ledger-schema.js'
import { renderLedger } from './render-ledger.js'

const ledger = migrationLedgerSchema.parse(JSON.parse(readFileSync(
  new URL('../../docs/migration/ledger.json', import.meta.url),
  'utf8',
)) as unknown)
const declaredFiles = new Set(ledger.entries.flatMap((entry) => entry.newOwners))

describe('migration ledger repository checks', () => {
  test('accepts exact owners and current generated Markdown', () => {
    const result = checkLedger({
      input: ledger,
      repoFiles: declaredFiles,
      existingFiles: declaredFiles,
      currentMarkdown: renderLedger(ledger),
    })
    expect(result).toMatchObject({ ok: true, errors: [] })
  })

  test('rejects a missing owner and an unregistered file inside an owned scope', () => {
    const existingFiles = new Set(declaredFiles)
    existingFiles.delete('docs/superpowers/plans/2026-07-11-batch-1-compiler-foundation.md')
    const repoFiles = new Set([
      ...declaredFiles,
      'UNREGISTERED.md',
      'docs/superpowers/plans/unregistered.md',
    ])
    const result = checkLedger({
      input: ledger,
      repoFiles,
      existingFiles,
      currentMarkdown: undefined,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('not an existing repository file'))).toBe(true)
    expect(result.errors).toContain('Repository file has no migration-ledger owner: UNREGISTERED.md')
    expect(result.errors.some((error) => error.includes('not registered in owned scope'))).toBe(true)
  })

  test('rejects stale generated Markdown', () => {
    const result = checkLedger({
      input: ledger,
      repoFiles: declaredFiles,
      existingFiles: declaredFiles,
      currentMarkdown: 'stale\n',
    })
    expect(result.errors).toContain('generated ledger Markdown is stale')
  })

  test('binds remote CI evidence to the accepted commit and workflow run', () => {
    const reviewLedger = structuredClone(ledger)
    reviewLedger.entries[0]!.status = 'in-review'
    const updated = recordSuccessfulCi(
      reviewLedger,
      '0',
      'a'.repeat(40),
      'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
    )
    const entry = updated.entries[0]!
    expect(entry.status).toBe('complete')
    expect(entry.verification.at(-1)).toMatchObject({
      gate: 'batch0-remote-ci',
      commitSha: 'a'.repeat(40),
      runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
    })
  })
})
