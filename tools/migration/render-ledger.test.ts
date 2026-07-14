import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import {
  batch2AMaintenancePaths,
  migrationLedgerSchema,
  protectedQuestionBaseline,
} from './ledger-schema.js'
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

  test('renders in-progress maintenance without claiming semantic completion', () => {
    const input = structuredClone(ledger)
    const batch2A = input.entries[2] as typeof input.entries[number] & {
      maintenance?: unknown
    }
    batch2A.maintenance = {
      status: 'in-progress',
      paths: [...batch2AMaintenancePaths],
      baseline: protectedQuestionBaseline,
      verification: [],
    }

    const rendered = renderLedger(migrationLedgerSchema.parse(input))

    expect(rendered).toContain('### Controlled maintenance')
    expect(rendered).toContain('- Status: `in-progress`')
    expect(rendered).toContain(
      '- Historical Batch 2A semantic implementation remains unchanged.',
    )
    expect(rendered).not.toContain('- Maintenance SHA:')
  })

  test('rejects a duplicate batch independently', () => {
    const duplicateBatch = structuredClone(ledger)
    const duplicateEntry = structuredClone(duplicateBatch.entries[0]!)
    duplicateEntry.newOwners = duplicateEntry.newOwners.map((owner) => `duplicate-batch/${owner}`)
    duplicateBatch.entries.push(duplicateEntry)

    expect(() => migrationLedgerSchema.parse(duplicateBatch)).toThrow(/duplicate batch/)
  })

  test('rejects a duplicate owner independently', () => {
    const duplicateOwner = structuredClone(ledger)
    const duplicateEntry = structuredClone(duplicateOwner.entries[0]!)
    duplicateEntry.batch = 'duplicate-owner-only'
    duplicateOwner.entries.push(duplicateEntry)

    expect(() => migrationLedgerSchema.parse(duplicateOwner)).toThrow(/duplicate owner/)
  })

  test('rejects empty completion evidence', () => {
    const emptyEvidence = structuredClone(ledger)
    emptyEvidence.entries[0]!.verification = []

    expect(() => migrationLedgerSchema.parse(emptyEvidence)).toThrow(/require verification evidence/)
  })

  test('requires the approved exact completion gates for Batch 1', () => {
    const missingRemote = structuredClone(ledger)
    missingRemote.entries[1]!.verification = missingRemote.entries[1]!.verification.filter(
      (item) => item.gate !== 'batch1-remote-ci',
    )
    expect(() => migrationLedgerSchema.parse(missingRemote)).toThrow(
      /complete Batch 1 requires exact verification gates/,
    )

    const weakenedBatchZero = structuredClone(ledger)
    weakenedBatchZero.entries[0]!.verification = weakenedBatchZero.entries[0]!.verification.filter(
      (item) => item.gate !== 'written-approval',
    )
    expect(() => migrationLedgerSchema.parse(weakenedBatchZero)).toThrow(
      /complete Batch 0 requires exact verification gates/,
    )
  })

  test('rejects control characters in repository paths', () => {
    const newlineOwner = structuredClone(ledger)
    newlineOwner.entries[0]!.newOwners[0] = 'line\nbreak.md'

    expect(() => migrationLedgerSchema.parse(newlineOwner)).toThrow(/control characters/)
  })

  test('orders non-ASCII batch names by Unicode code point', () => {
    const unordered = structuredClone(ledger)
    unordered.entries[0]!.batch = 'é'
    unordered.entries[1]!.batch = 'z'

    const rendered = renderLedger(unordered)

    expect(rendered.indexOf('## Batch z')).toBeLessThan(rendered.indexOf('## Batch é'))
  })
})
