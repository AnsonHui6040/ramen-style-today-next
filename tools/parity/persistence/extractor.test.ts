import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import {
  buildPersistenceFixtureManifest,
  computePersistenceExtractorHash,
  legacyPersistenceSourceIdentity,
  parsePersistenceRawCases,
  persistenceExtractorAuthoringSourcePaths,
  serializePersistenceCases,
  serializePersistenceManifest,
  validatePersistenceCases,
} from './extractor.js'
import {
  parseExtractArguments,
  projectPersistenceExtractorResultForCli,
} from './extract.js'
import {
  computeLegacyPersistenceCasesHash,
  legacyPersistenceCaseIds,
  parseLegacyPersistenceSeedFile,
  type LegacyPersistenceObservationCase,
} from './contracts.js'

const seeds = parseLegacyPersistenceSeedFile(JSON.parse(
  readFileSync(new URL('./seeds.json', import.meta.url), 'utf8'),
))

function validCases(): readonly LegacyPersistenceObservationCase[] {
  return [
    {
      id: 'write-initial-shapes',
      kind: 'legacy-write-observation',
      actions: [{ type: 'start' }],
      observedAnswers: {
        source: [],
        signature: [],
        exclusions: ['none'],
      },
    },
    {
      id: 'write-single-multiple-shapes',
      kind: 'legacy-write-observation',
      actions: [
        { type: 'start' },
        { type: 'select', optionIndex: 0 },
        { type: 'continue' },
        { type: 'select', optionIndex: 0 },
        { type: 'continue' },
        { type: 'select', optionIndex: 0 },
        { type: 'continue' },
        { type: 'select', optionIndex: 0 },
        { type: 'select', optionIndex: 1 },
      ],
      observedAnswers: {
        form: 'soup',
        archetype: 'chintan',
        tare: 'shoyu',
        source: ['pork', 'chicken'],
        signature: [],
        exclusions: ['none'],
      },
    },
    {
      id: 'write-forced-answer',
      kind: 'legacy-write-observation',
      actions: [
        { type: 'start' },
        { type: 'select', optionIndex: 1 },
        { type: 'continue' },
        { type: 'select', optionIndex: 2 },
        { type: 'continue' },
      ],
      observedAnswers: {
        form: 'tsukemen',
        archetype: 'miso-rich',
        tare: 'miso',
        source: [],
        signature: [],
        exclusions: ['none'],
      },
    },
    {
      id: 'restore-seafood',
      kind: 'legacy-restore-observation',
      legacyInput: {
        source: [],
        signature: [],
        exclusions: ['seafood'],
      },
      observedLegacyOutput: {
        source: [],
        signature: [],
        exclusions: ['fish-seafood', 'shellfish', 'shrimp-crab'],
      },
    },
    {
      id: 'restore-empty-initial-arrays',
      kind: 'legacy-restore-observation',
      legacyInput: {
        source: [],
        signature: [],
        exclusions: [],
      },
      observedLegacyOutput: {
        source: [],
        signature: [],
        exclusions: ['none'],
      },
    },
    {
      id: 'restore-exclusive-normalization',
      kind: 'legacy-restore-observation',
      legacyInput: {
        source: ['unsure', 'pork'],
        signature: ['no-preference', 'chashu'],
        exclusions: ['none', 'fish-seafood'],
      },
      observedLegacyOutput: {
        source: ['pork'],
        signature: ['chashu'],
        exclusions: ['fish-seafood'],
      },
    },
  ]
}

const sha = (character: string) => character.repeat(64)

const expectedLineage = {
  identity: legacyPersistenceSourceIdentity.repository,
  commit: legacyPersistenceSourceIdentity.commit,
  treeHash: legacyPersistenceSourceIdentity.treeHash,
  trackedSourceHashes: {
    'src/App.tsx': sha('a'),
    'src/domain/schema.ts': sha('b'),
  },
  lockfilePath: 'package-lock.json',
  lockfileHash: sha('c'),
  patchHash: sha('d'),
  seedsHash: sha('e'),
  nodeVersion: '24.14.0',
  npmVersion: '11.12.1',
} as const

const authoringSources = persistenceExtractorAuthoringSourcePaths.map((path, index) => ({
  path,
  hash: String(index + 1).repeat(64),
}))

describe('persistence extraction adapter', () => {
  test('parses the strict raw envelope and canonical frozen array', () => {
    const cases = validCases()
    expect(parsePersistenceRawCases({ schemaVersion: 1, cases })).toEqual(cases)
    expect(parsePersistenceRawCases(cases)).toEqual(cases)
    expect(() => parsePersistenceRawCases({
      schemaVersion: 1,
      cases,
      normalizedPayload: {},
    })).toThrow()
  })

  test('binds every output to the exact ordered seed and input', () => {
    const cases = validCases()
    const validated = validatePersistenceCases(cases, seeds.cases)

    expect(validated.map(({ id }) => id)).toEqual(legacyPersistenceCaseIds)
    expect(Object.isFrozen(validated)).toBe(true)
    expect(() => validatePersistenceCases([
      cases[1]!,
      cases[0]!,
      ...cases.slice(2),
    ], seeds.cases)).toThrow()
    const restoreCase = cases[5]!
    expect(restoreCase.kind).toBe('legacy-restore-observation')
    if (restoreCase.kind !== 'legacy-restore-observation') return
    expect(() => validatePersistenceCases([
      ...cases.slice(0, 5),
      {
        ...restoreCase,
        legacyInput: { exclusions: ['none'] },
      },
    ], seeds.cases)).toThrow()
  })

  test.each([
    ['normalizedPayload', {}],
    ['migrations', []],
    ['repairs', []],
    ['diagnostics', []],
    ['flowState', {}],
    ['resumeQuestionId', 'form'],
    ['writeBackRequired', true],
    ['questionSemanticHash', 'f'.repeat(64)],
    ['savedAt', '2026-07-15T00:00:00.000Z'],
    ['sourcePath', '/Users/local/private.json'],
  ])('rejects frozen-only boundary field %s even when nested', (field, value) => {
    const cases = validCases()
    const writeCase = cases[0]!
    expect(writeCase.kind).toBe('legacy-write-observation')
    if (writeCase.kind !== 'legacy-write-observation') return
    expect(() => validatePersistenceCases([
      {
        ...writeCase,
        observedAnswers: { [field]: value },
      },
      ...cases.slice(1),
    ], seeds.cases)).toThrow()
  })

  test('canonicalizes object keys but preserves every observable array', () => {
    const cases = validatePersistenceCases(validCases(), seeds.cases)
    const reorderedObject = cases.map((entry, index) => index === 0 ? {
      ...entry,
      observedAnswers: {
        exclusions: ['none'],
        signature: [],
        source: [],
      },
    } : entry) as readonly LegacyPersistenceObservationCase[]
    const reorderedArray = cases.map((entry, index) => index === 1 ? {
      ...entry,
      observedAnswers: {
        form: 'soup',
        archetype: 'chintan',
        tare: 'shoyu',
        source: ['chicken', 'pork'],
        signature: [],
        exclusions: ['none'],
      },
    } : entry) as readonly LegacyPersistenceObservationCase[]

    expect(computeLegacyPersistenceCasesHash(cases)).toBe(
      computeLegacyPersistenceCasesHash(reorderedObject),
    )
    expect(computeLegacyPersistenceCasesHash(cases)).not.toBe(
      computeLegacyPersistenceCasesHash(reorderedArray),
    )
    const reparsed = parsePersistenceRawCases(JSON.parse(
      serializePersistenceCases(cases).toString('utf8'),
    ))
    expect(validatePersistenceCases(reparsed, seeds.cases)).toEqual(cases)
  })

  test('builds a complete exact manifest with no current implementation identity', () => {
    const cases = validatePersistenceCases(validCases(), seeds.cases)
    const manifest = buildPersistenceFixtureManifest({
      cases,
      fixtureContentHash: sha('f'),
      expected: expectedLineage,
      authoringSources,
      instrumentationHash: expectedLineage.patchHash,
    })

    expect(manifest).toMatchObject({
      fixtureSchemaVersion: '1',
      extractor: {
        version: '1',
        sources: authoringSources,
        hash: computePersistenceExtractorHash(authoringSources),
      },
      instrumentation: { version: '1', hash: expectedLineage.patchHash },
      source: {
        repository: legacyPersistenceSourceIdentity.repository,
        commit: legacyPersistenceSourceIdentity.commit,
        treeHash: legacyPersistenceSourceIdentity.treeHash,
      },
      orderedCaseIds: legacyPersistenceCaseIds,
      caseCount: 6,
      casesHash: computeLegacyPersistenceCasesHash(cases),
    })
    expect(JSON.stringify(manifest)).not.toMatch(
      /implementationSha|questionSemanticHash|savedAt|timestamp|\/Users\//,
    )
    expect(serializePersistenceCases(cases).toString('utf8').trimStart().startsWith('['))
      .toBe(true)
    expect(serializePersistenceManifest(manifest).toString('utf8')).not.toContain('/Users/')
  })
})

describe('persistence extraction CLI boundary', () => {
  test('accepts only the explicit legacy-checkout authoring modes', () => {
    expect(parseExtractArguments([
      '--legacy-checkout',
      '/tmp/legacy',
      '--replace',
    ])).toEqual({ legacyCheckout: '/tmp/legacy', replace: true, verifyOnly: false })
    expect(() => parseExtractArguments(['--legacy', '/tmp/legacy'])).toThrow()
    expect(() => parseExtractArguments([
      '--legacy-checkout',
      '/tmp/legacy',
      '--replace',
      '--verify-only',
    ])).toThrow()
  })

  test('preserves shared cleanup warnings without leaking them into fixtures', () => {
    const cases = validatePersistenceCases(validCases(), seeds.cases)
    const manifest = buildPersistenceFixtureManifest({
      cases,
      fixtureContentHash: sha('f'),
      expected: expectedLineage,
      authoringSources,
      instrumentationHash: expectedLineage.patchHash,
    })
    const warning = {
      code: 'backup-cleanup-failed' as const,
      recoveryBackupPath: '/tmp/recovery.json',
      cleanupAttempts: 3,
      message: 'Published fixtures; retained recovery evidence.',
    }
    expect(projectPersistenceExtractorResultForCli({
      status: 'published-with-cleanup-warning',
      published: true,
      cases,
      manifest,
      ignoredFingerprintsBefore: [],
      ignoredFingerprintsAfter: [],
      warning,
    }, 'replace')).toMatchObject({
      mode: 'replace',
      status: 'published-with-cleanup-warning',
      published: true,
      caseCount: 6,
      casesHash: manifest.casesHash,
      warning,
    })
  })

  test('uses a domain-separated authoring hash with ordered sources', () => {
    const hash = computePersistenceExtractorHash(authoringSources)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toBe(createHash('sha256')
      .update(JSON.stringify(authoringSources))
      .digest('hex'))
    expect(computePersistenceExtractorHash([...authoringSources].reverse())).not.toBe(hash)
  })
})
