import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import {
  batch2AMaintenancePaths,
  batch2BAcceptanceMetadataPaths,
  batch2BImplementationPaths,
  batch2BVerificationPaths,
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

  test('renders Batch 2B evidence paths and pending acceptance without a false completion', () => {
    const input = structuredClone(ledger)
    const batch2B = input.entries.find(({ batch }) => batch === '2B')!
    Object.assign(batch2B, {
      status: 'complete',
      implementationSha: 'a'.repeat(40),
    })
    Object.assign(batch2B, {
      status: 'in-progress',
      implementationPaths: [...batch2BImplementationPaths],
      verificationPaths: [...batch2BVerificationPaths],
      acceptanceMetadataPaths: [...batch2BAcceptanceMetadataPaths],
      fixtureManifestHash: 'f'.repeat(64),
      verification: [],
    })
    delete batch2B.implementationSha
    delete batch2B.acceptanceBoundary
    delete batch2B.boundaryMaintenance

    const rendered = renderLedger(migrationLedgerSchema.parse(input))

    expect(rendered).toContain('## Batch 2B — in-progress')
    expect(rendered).toContain('### Implementation paths')
    expect(rendered).toContain('`packages/classification-core/src/persistence/**`')
    expect(rendered).toContain('### Verification paths')
    expect(rendered).toContain('### Acceptance metadata paths')
    expect(rendered).toContain(`- Persistence fixture manifest hash: \`${'f'.repeat(64)}\``)
    expect(rendered).not.toContain('Batch 2B — complete')
  })

  test('renders the immutable Batch 2B boundary and in-progress maintenance distinctly', () => {
    const rendered = renderLedger(ledger)

    expect(rendered).toContain('## Batch 2B — complete')
    expect(rendered).toContain('### Accepted Batch 2B boundary')
    expect(rendered).toContain(
      '- Accepted metadata SHA: `6fba4c0dc384d3cfa27b627db6ae373f56c8b6d4`',
    )
    expect(rendered).toContain(
      '- Accepted implementation SHA: `30b71e3305b0e48a7c77e4869e2411c17941ebb8`',
    )
    expect(rendered).toContain('`batch2b-acceptance-boundary-remote-ci`')
    expect(rendered).toContain(
      'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/29411764507',
    )
    expect(rendered).toContain('### Boundary maintenance')
    expect(rendered).toContain('- Status: `in-progress`')
    expect(rendered).toContain('#### Boundary maintenance verification')
    expect(rendered).not.toContain('- Boundary maintenance SHA:')
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
