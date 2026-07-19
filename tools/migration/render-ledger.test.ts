import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import {
  batch2AMaintenancePaths,
  batch2BAcceptanceMetadataPaths,
  batch2BBoundaryMaintenancePaths,
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
    delete batch2B.persistenceIdentityMaintenance
    input.entries = input.entries.filter(({ batch }) => batch !== '3A')

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
    const input = structuredClone(ledger)
    const batch2B = input.entries.find(({ batch }) => batch === '2B')!
    batch2B.boundaryMaintenance = {
      status: 'in-progress',
      paths: [...batch2BBoundaryMaintenancePaths],
      verification: [],
    }

    const rendered = renderLedger(migrationLedgerSchema.parse(input))

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

  test('renders completed Batch 2B boundary maintenance from an explicit fixture', () => {
    const maintenanceSha = 'a'.repeat(40)
    const runUrl =
      'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123'
    const input = structuredClone(ledger)
    const batch2B = input.entries.find(({ batch }) => batch === '2B')!
    batch2B.boundaryMaintenance = {
      status: 'complete',
      maintenanceSha,
      paths: [...batch2BBoundaryMaintenancePaths],
      verification: [
        {
          gate: 'batch2b-boundary-maintenance-local-verify',
          command: 'npm run verify',
          outcome: 'passed',
          evidence: 'local boundary-maintenance verification passed',
        },
        {
          gate: 'batch2b-boundary-maintenance-remote-ci',
          command: 'GitHub Actions CI / verify',
          outcome: 'passed',
          evidence: 'remote boundary-maintenance verification passed',
          commitSha: maintenanceSha,
          runUrl,
        },
      ],
    }

    const rendered = renderLedger(migrationLedgerSchema.parse(input))

    expect(rendered).toContain('- Status: `complete`')
    expect(rendered).toContain(`- Boundary maintenance SHA: \`${maintenanceSha}\``)
    expect(rendered).toContain('`batch2b-boundary-maintenance-local-verify`')
    expect(rendered).toContain('`batch2b-boundary-maintenance-remote-ci`')
    expect(rendered).toContain(`- Commit: \`${maintenanceSha}\``)
    expect(rendered).toContain(`- Run: ${runUrl}`)
  })

  test('renders Batch 3A style identity and the reviewed persistence identity binding distinctly', () => {
    const input = structuredClone(ledger) as unknown as {
      entries: Array<Record<string, unknown>>
      [key: string]: unknown
    }
    const batch2B = input.entries.find(({ batch }) => batch === '2B')!
    batch2B.fixtureManifestHash =
      '71eac8596e3e79b04b26c8dde64e7c2a0df247383de851eb8ed33dd4928dd7fd'
    batch2B.persistenceIdentityMaintenance = {
      status: 'in-progress',
      changeSha: '2f445f99de924f5ba428967ff68869d4d46b593f',
      changeParentSha: '1adc6b54decc08e11bdc03f9665a8f82033fb126',
      paths: ['tools/parity/fixtures/persistence/legacy-unversioned/manifest.json'],
      acceptedFixtureManifestHash:
        '6c697167052690a8b01830fbceada056e1cbb39879fc879c34394e84e2237226',
      maintainedFixtureManifestHash:
        '71eac8596e3e79b04b26c8dde64e7c2a0df247383de851eb8ed33dd4928dd7fd',
      casesHash: 'c97bb63d57773c3dec0db9eaa43b94fb4a08c40b4bfa17139746048e7370bf89',
      acceptedExtractorHash:
        '4efdee45410516ead5e39dcb3db6950453312221a89682e173772a36e05df12d',
      maintainedExtractorHash:
        '650552a696aa5f7a769fde01707427bf1d2f6ca1f10a1dcd4a919d1ad0799706',
      verification: [],
    }
    input.entries.push({
      batch: '3A',
      status: 'in-progress',
      implementationPaths: [
        'docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md',
      ],
      verificationPaths: ['package.json'],
      acceptanceMetadataPaths: [...batch2BAcceptanceMetadataPaths],
      fixtureManifestHash:
        'fa1a4714a77ce70489b56c54b82a812b28cd18dbc31a668a62ae51cc12e9586b',
      legacySources: ['src/data/styles.json'],
      ownedScopes: [],
      newOwners: [
        'docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md',
        'docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md',
      ],
      transformation: 'Compiled legacy styles into inert runtime data.',
      behavior: 'no-production-runtime-change',
      verification: [],
    })

    const rendered = renderLedger(input as never)

    expect(rendered).toContain('## Batch 3A — in-progress')
    expect(rendered).toContain(
      '- Style fixture manifest hash: `fa1a4714a77ce70489b56c54b82a812b28cd18dbc31a668a62ae51cc12e9586b`',
    )
    expect(rendered).toContain('### Persistence identity maintenance')
    expect(rendered).toContain(
      '- Accepted fixture manifest hash: `6c697167052690a8b01830fbceada056e1cbb39879fc879c34394e84e2237226`',
    )
    expect(rendered).toContain(
      '- Maintained fixture manifest hash: `71eac8596e3e79b04b26c8dde64e7c2a0df247383de851eb8ed33dd4928dd7fd`',
    )
    expect(rendered).not.toContain('- Candidate SHA:')
    expect(rendered).not.toContain('- Remote evidence gate:')
  })

  test('rejects a duplicate batch independently', () => {
    const duplicateBatch = structuredClone(ledger)
    const duplicateEntry = structuredClone(duplicateBatch.entries[0]!)
    duplicateEntry.newOwners = duplicateEntry.newOwners.map((owner) => `duplicate-batch/${owner}`)
    duplicateBatch.entries.push(duplicateEntry)

    expect(() => migrationLedgerSchema.parse(duplicateBatch)).toThrow(/duplicate batch/)
  })

  test('reports a duplicate owner even when the closed batch ID is also duplicated', () => {
    const duplicateOwner = structuredClone(ledger)
    const duplicateEntry = structuredClone(duplicateOwner.entries[0]!)
    duplicateOwner.entries.push(duplicateEntry)

    const result = migrationLedgerSchema.safeParse(duplicateOwner)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some(
      ({ message }) => message.includes('duplicate owner'),
    )).toBe(true)
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
    const unordered = structuredClone(ledger) as unknown as {
      entries: Array<{ batch: string }>
    }
    unordered.entries[0]!.batch = 'é'
    unordered.entries[1]!.batch = 'z'

    const rendered = renderLedger(unordered as never)

    expect(rendered.indexOf('## Batch z')).toBeLessThan(rendered.indexOf('## Batch é'))
  })
})
