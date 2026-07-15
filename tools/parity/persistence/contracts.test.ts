import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import {
  computeLegacyPersistenceCasesHash,
  legacyPersistenceCaseIds,
  parseLegacyPersistenceObservation,
  parseLegacyPersistenceObservationCase,
  parseLegacyPersistenceSeedFile,
} from './contracts.js'

const seedsJson: unknown = JSON.parse(
  readFileSync(new URL('./seeds.json', import.meta.url), 'utf8'),
)

function validWriteObservation() {
  return {
    kind: 'legacy-write-observation',
    actions: [
      { type: 'start' },
      { type: 'select', optionIndex: 0 },
      { type: 'continue' },
    ],
    observedAnswers: {
      source: ['pork', 'chicken'],
      exclusions: ['none'],
    },
  } as const
}

function validRestoreObservation() {
  return {
    kind: 'legacy-restore-observation',
    legacyInput: {
      source: ['unsure', 'pork'],
      exclusions: ['seafood'],
    },
    observedLegacyOutput: {
      source: ['pork'],
      signature: [],
      exclusions: ['fish-seafood', 'shellfish', 'shrimp-crab'],
    },
  } as const
}

describe('legacy persistence observation contracts', () => {
  test('accepts only the two observation variants and freezes parsed data', () => {
    const write = parseLegacyPersistenceObservation(validWriteObservation())
    const restore = parseLegacyPersistenceObservation(validRestoreObservation())

    expect(write).toEqual(validWriteObservation())
    expect(restore).toEqual(validRestoreObservation())
    expect(Object.isFrozen(write)).toBe(true)
    expect(write.kind).toBe('legacy-write-observation')
    expect(restore.kind).toBe('legacy-restore-observation')
    if (write.kind !== 'legacy-write-observation') return
    if (restore.kind !== 'legacy-restore-observation') return
    expect(Object.isFrozen(write.actions)).toBe(true)
    expect(Object.isFrozen(write.observedAnswers)).toBe(true)
    expect(Object.isFrozen(restore.legacyInput)).toBe(true)
    expect(Object.isFrozen(restore.observedLegacyOutput)).toBe(true)
  })

  test.each([
    'normalizedPayload',
    'migrations',
    'repairs',
    'diagnostics',
    'flowState',
    'resumeQuestionId',
    'writeBackRequired',
  ])('rejects new runtime field %s from legacy observations', (field) => {
    expect(() => parseLegacyPersistenceObservation({
      ...validWriteObservation(),
      [field]: {},
    })).toThrow()
  })

  test('rejects cross-variant, extra, and non-JSON observation data', () => {
    expect(() => parseLegacyPersistenceObservation({
      ...validWriteObservation(),
      legacyInput: {},
    })).toThrow()
    expect(() => parseLegacyPersistenceObservation({
      ...validRestoreObservation(),
      actions: [],
    })).toThrow()
    expect(() => parseLegacyPersistenceObservation({
      ...validWriteObservation(),
      observedAnswers: { invalid: undefined },
    })).toThrow()
    expect(() => parseLegacyPersistenceObservation({
      ...validRestoreObservation(),
      legacyInput: { invalid: Number.POSITIVE_INFINITY },
    })).toThrow()
  })

  test('preserves observable action and answer-array order', () => {
    const parsed = parseLegacyPersistenceObservation(validWriteObservation())

    expect(parsed.kind).toBe('legacy-write-observation')
    if (parsed.kind !== 'legacy-write-observation') return
    expect(parsed.actions.map((action) => action.type)).toEqual([
      'start',
      'select',
      'continue',
    ])
    expect(parsed.observedAnswers).toEqual({
      source: ['pork', 'chicken'],
      exclusions: ['none'],
    })
  })

  test('canonical hashing ignores object insertion order but preserves arrays', () => {
    const first = parseLegacyPersistenceObservationCase({
      id: 'write-initial-shapes',
      ...validWriteObservation(),
    })
    const reorderedObject = parseLegacyPersistenceObservationCase({
      observedAnswers: {
        exclusions: ['none'],
        source: ['pork', 'chicken'],
      },
      actions: validWriteObservation().actions,
      kind: 'legacy-write-observation',
      id: 'write-initial-shapes',
    })
    const reorderedArray = parseLegacyPersistenceObservationCase({
      id: 'write-initial-shapes',
      kind: 'legacy-write-observation',
      actions: validWriteObservation().actions,
      observedAnswers: {
        source: ['chicken', 'pork'],
        exclusions: ['none'],
      },
    })

    expect(computeLegacyPersistenceCasesHash([first])).toBe(
      computeLegacyPersistenceCasesHash([reorderedObject]),
    )
    expect(computeLegacyPersistenceCasesHash([first])).not.toBe(
      computeLegacyPersistenceCasesHash([reorderedArray]),
    )
  })
})

describe('legacy persistence authoring seeds', () => {
  test('uses the exact six unique IDs in deterministic order', () => {
    const seeds = parseLegacyPersistenceSeedFile(seedsJson)

    expect(seeds.schemaVersion).toBe(1)
    expect(seeds.cases.map(({ id }) => id)).toEqual(legacyPersistenceCaseIds)
    expect(new Set(seeds.cases.map(({ id }) => id)).size).toBe(
      legacyPersistenceCaseIds.length,
    )
  })

  test('covers both kinds without storing expected current or legacy output', () => {
    const seeds = parseLegacyPersistenceSeedFile(seedsJson)

    expect(seeds.cases.map(({ kind }) => kind)).toEqual([
      'legacy-write-observation',
      'legacy-write-observation',
      'legacy-write-observation',
      'legacy-restore-observation',
      'legacy-restore-observation',
      'legacy-restore-observation',
    ])
    expect(JSON.stringify(seeds)).not.toMatch(
      /normalizedPayload|observedAnswers|observedLegacyOutput|canonicalAnswers|currentV1|writeBackRequired/,
    )
  })

  test('requires public actions for writes and exact legacy input for restores', () => {
    const seeds = parseLegacyPersistenceSeedFile(seedsJson)

    for (const seedCase of seeds.cases) {
      if (seedCase.kind === 'legacy-write-observation') {
        expect(seedCase.actions.length).toBeGreaterThan(0)
        expect(Object.keys(seedCase).sort()).toEqual(['actions', 'id', 'kind'])
      } else {
        expect(Object.keys(seedCase).sort()).toEqual(['id', 'kind', 'legacyInput'])
      }
    }
  })
})
