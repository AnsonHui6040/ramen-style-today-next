import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { migrationLedgerSchema } from './ledger-schema.js'
import { renderLedger } from './render-ledger.js'

const ledger = migrationLedgerSchema.parse(JSON.parse(readFileSync(
  new URL('../../docs/migration/ledger.json', import.meta.url),
  'utf8',
)) as unknown)

describe('migration ledger', () => {
  test('parses the canonical ledger and renders stable Markdown', () => {
    const rendered = renderLedger(ledger)
    expect(rendered).toContain('## Batch 0 — complete')
    expect(rendered).toContain('`docs/migration/ledger.json`')
    expect(rendered.endsWith('\n')).toBe(true)
  })

  test('rejects duplicate batches, duplicate owners, and empty completion evidence', () => {
    const duplicate = structuredClone(ledger)
    duplicate.entries.push(structuredClone(duplicate.entries[0]!))
    expect(() => migrationLedgerSchema.parse(duplicate)).toThrow()

    const emptyEvidence = structuredClone(ledger)
    emptyEvidence.entries[0]!.verification = []
    expect(() => migrationLedgerSchema.parse(emptyEvidence)).toThrow()
  })
})
