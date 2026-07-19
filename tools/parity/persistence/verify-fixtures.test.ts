import { createHash } from 'node:crypto'

import { describe, expect, test } from 'vitest'

import {
  buildPersistenceFixtureManifest,
  legacyPersistenceSourceIdentity,
  persistenceExtractorAuthoringSourcePaths,
  serializePersistenceCases,
  serializePersistenceManifest,
  validatePersistenceCases,
} from './extractor.js'
import {
  parseLegacyPersistenceSeedFile,
  type LegacyPersistenceObservationCase,
} from './contracts.js'
import {
  verifyPersistenceFixtureSet,
  type PersistenceFixtureVerificationInput,
} from './verify-fixtures.js'

const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex')

const seedFile = {
  schemaVersion: 1,
  cases: [
    {
      id: 'write-initial-shapes',
      kind: 'legacy-write-observation',
      actions: [{ type: 'start' }],
    },
    {
      id: 'write-single-multiple-shapes',
      kind: 'legacy-write-observation',
      actions: [{ type: 'start' }, { type: 'select', optionIndex: 0 }],
    },
    {
      id: 'write-forced-answer',
      kind: 'legacy-write-observation',
      actions: [{ type: 'start' }, { type: 'select', optionIndex: 1 }],
    },
    {
      id: 'restore-seafood',
      kind: 'legacy-restore-observation',
      legacyInput: { exclusions: ['seafood'] },
    },
    {
      id: 'restore-empty-initial-arrays',
      kind: 'legacy-restore-observation',
      legacyInput: { exclusions: [] },
    },
    {
      id: 'restore-exclusive-normalization',
      kind: 'legacy-restore-observation',
      legacyInput: { exclusions: ['none', 'fish-seafood'] },
    },
  ],
} as const

function observedCases(): readonly LegacyPersistenceObservationCase[] {
  return [
    {
      ...seedFile.cases[0],
      observedAnswers: { source: [], signature: [], exclusions: ['none'] },
    },
    {
      ...seedFile.cases[1],
      observedAnswers: { form: 'soup', source: ['pork', 'chicken'] },
    },
    {
      ...seedFile.cases[2],
      observedAnswers: { form: 'tsukemen', tare: 'miso' },
    },
    {
      ...seedFile.cases[3],
      observedLegacyOutput: {
        source: [],
        signature: [],
        exclusions: ['fish-seafood', 'shellfish', 'shrimp-crab'],
      },
    },
    {
      ...seedFile.cases[4],
      observedLegacyOutput: { source: [], signature: [], exclusions: ['none'] },
    },
    {
      ...seedFile.cases[5],
      observedLegacyOutput: { exclusions: ['fish-seafood'] },
    },
  ]
}

function validVerificationInput(): PersistenceFixtureVerificationInput {
  const seeds = parseLegacyPersistenceSeedFile(seedFile).cases
  const cases = validatePersistenceCases(observedCases(), seeds)
  const seedBytes = Buffer.from(`${JSON.stringify(seedFile, null, 2)}\n`)
  const instrumentationBytes = Buffer.from('instrumentation-v1\n')
  const authoringSources = persistenceExtractorAuthoringSourcePaths.map((path, index) => ({
    path,
    bytes: Buffer.from(`source-${index}\n`),
  }))
  const sourceIdentities = authoringSources.map(({ path, bytes }) => ({
    path,
    hash: sha256(bytes),
  }))
  const expected = {
    identity: legacyPersistenceSourceIdentity.repository,
    commit: legacyPersistenceSourceIdentity.commit,
    treeHash: legacyPersistenceSourceIdentity.treeHash,
    trackedSourceHashes: { 'src/App.tsx': 'a'.repeat(64) },
    lockfilePath: 'package-lock.json',
    lockfileHash: 'b'.repeat(64),
    patchHash: sha256(instrumentationBytes),
    seedsHash: sha256(seedBytes),
    nodeVersion: '24.14.0',
    npmVersion: '11.12.1',
  } as const
  const manifest = buildPersistenceFixtureManifest({
    cases,
    fixtureContentHash: sha256(serializePersistenceCases(cases)),
    expected,
    authoringSources: sourceIdentities,
    instrumentationHash: expected.patchHash,
  })
  return {
    casesBytes: serializePersistenceCases(cases),
    manifestBytes: serializePersistenceManifest(manifest),
    instrumentationBytes,
    seedBytes,
    expectedSeedHash: sha256(seedBytes),
    expectedSource: manifest.source,
    expectedRuntime: manifest.runtime,
    authoringSources,
  }
}

describe('offline persistence fixture verification', () => {
  test('validates committed evidence without any legacy checkout input', () => {
    const input = validVerificationInput()
    const result = verifyPersistenceFixtureSet(input)

    expect(result).toMatchObject({
      status: 'pass',
      caseCount: 6,
      instrumentationHash: sha256(input.instrumentationBytes),
      manifestHash: sha256(input.manifestBytes),
    })
    expect(Object.keys(input)).not.toContain('legacyCheckout')
  })

  test('rejects corpus byte drift and semantic content drift', () => {
    const input = validVerificationInput()
    expect(() => verifyPersistenceFixtureSet({
      ...input,
      casesBytes: Buffer.concat([input.casesBytes, Buffer.from('\n')]),
    })).toThrow()

    const parsed = JSON.parse(Buffer.from(input.casesBytes).toString('utf8')) as unknown[]
    parsed.reverse()
    expect(() => verifyPersistenceFixtureSet({
      ...input,
      casesBytes: Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`),
    })).toThrow()
  })

  test('rejects manifest byte/schema, count, ordered-ID, and casesHash drift', () => {
    const input = validVerificationInput()
    expect(() => verifyPersistenceFixtureSet({
      ...input,
      manifestBytes: Buffer.concat([input.manifestBytes, Buffer.from('\n')]),
    })).toThrow()

    for (const mutation of [
      (manifest: Record<string, unknown>) => { manifest.caseCount = 5 },
      (manifest: Record<string, unknown>) => {
        manifest.orderedCaseIds = [...(manifest.orderedCaseIds as unknown[])].reverse()
      },
      (manifest: Record<string, unknown>) => { manifest.casesHash = '0'.repeat(64) },
    ]) {
      const manifest = JSON.parse(
        Buffer.from(input.manifestBytes).toString('utf8'),
      ) as Record<string, unknown>
      mutation(manifest)
      expect(() => verifyPersistenceFixtureSet({
        ...input,
        manifestBytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      })).toThrow()
    }
  })

  test('rejects instrumentation, seed, and authoring-source identity drift', () => {
    const input = validVerificationInput()
    expect(() => verifyPersistenceFixtureSet({
      ...input,
      instrumentationBytes: Buffer.from('changed-instrumentation\n'),
    })).toThrow()
    expect(() => verifyPersistenceFixtureSet({
      ...input,
      seedBytes: Buffer.from(Buffer.from(input.seedBytes).toString('utf8').replace(
        '"optionIndex": 0',
        '"optionIndex": 2',
      )),
    })).toThrow()
    expect(() => verifyPersistenceFixtureSet({
      ...input,
      seedBytes: Buffer.concat([input.seedBytes, Buffer.from('\n')]),
    })).toThrow()
    expect(() => verifyPersistenceFixtureSet({
      ...input,
      authoringSources: input.authoringSources.map((source, index) => index === 0
        ? { ...source, bytes: Buffer.from('changed-source\n') }
        : source),
    })).toThrow()
  })

  test('rejects source commit, tree, lockfile, tracked-source, and forbidden metadata drift', () => {
    const input = validVerificationInput()
    for (const mutation of [
      (manifest: Record<string, unknown>) => {
        (manifest.source as Record<string, unknown>).commit = '0'.repeat(40)
      },
      (manifest: Record<string, unknown>) => {
        (manifest.source as Record<string, unknown>).treeHash = '0'.repeat(40)
      },
      (manifest: Record<string, unknown>) => {
        (manifest.source as Record<string, unknown>).lockfileHash = '0'.repeat(64)
      },
      (manifest: Record<string, unknown>) => {
        (manifest.source as Record<string, unknown>).trackedSourceHashes = {
          'src/App.tsx': '0'.repeat(64),
        }
      },
      (manifest: Record<string, unknown>) => { manifest.savedAt = '2026-07-15T00:00:00Z' },
      (manifest: Record<string, unknown>) => { manifest.currentImplementationSha = '0'.repeat(40) },
      (manifest: Record<string, unknown>) => { manifest.temporaryPath = '/Users/local/tmp' },
    ]) {
      const manifest = JSON.parse(
        Buffer.from(input.manifestBytes).toString('utf8'),
      ) as Record<string, unknown>
      mutation(manifest)
      expect(() => verifyPersistenceFixtureSet({
        ...input,
        manifestBytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      })).toThrow()
    }
  })

  test('rejects exact extractor runtime version drift', () => {
    const input = validVerificationInput()
    for (const [field, version] of [
      ['nodeVersion', '24.99.0'],
      ['npmVersion', '11.99.0'],
    ] as const) {
      const manifest = JSON.parse(
        Buffer.from(input.manifestBytes).toString('utf8'),
      ) as Record<string, unknown>
      const runtime = manifest.runtime as Record<string, unknown>
      runtime[field] = version
      expect(() => verifyPersistenceFixtureSet({
        ...input,
        manifestBytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      })).toThrow()
    }
  })
})
