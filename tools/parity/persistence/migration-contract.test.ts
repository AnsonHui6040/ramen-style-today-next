import { readFileSync } from 'node:fs'

import {
  questionModel,
  restoreClassification,
  type ClassificationRestoreSource,
  type RestoreResult,
} from '@ramen-style/classification-core'
import { describe, expect, test } from 'vitest'

import {
  legacyPersistenceCaseIds,
  parseLegacyPersistenceObservationCase,
  type LegacyPersistenceCaseId,
  type LegacyPersistenceObservationCase,
} from './contracts.js'

const verifiedLegacySourceId =
  'ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37' as const

interface SuccessfulCurrentExpectation {
  readonly status: 'restored-with-changes'
  readonly submittedAnswers: Readonly<Record<string, readonly string[]>>
  readonly flowStatus: 'incomplete' | 'complete'
  readonly resumeQuestionId?: string
  readonly repairCodes: readonly string[]
}

interface InvalidCurrentExpectation {
  readonly status: 'invalid'
  readonly diagnostics: readonly {
    readonly stage: string
    readonly code: string
    readonly path: string
  }[]
}

type CurrentContractExpectation =
  | SuccessfulCurrentExpectation
  | InvalidCurrentExpectation

type VerifiedLegacyRestoreSource = Extract<
  ClassificationRestoreSource,
  { readonly kind: 'legacy-unversioned' }
>

const fixtureRoot = new URL(
  '../fixtures/persistence/legacy-unversioned/',
  import.meta.url,
)
const manifest = JSON.parse(
  readFileSync(new URL('manifest.json', fixtureRoot), 'utf8'),
) as { readonly caseCount: number; readonly orderedCaseIds: readonly string[] }
const observations = (JSON.parse(
  readFileSync(new URL('cases.json', fixtureRoot), 'utf8'),
) as unknown[]).map(parseLegacyPersistenceObservationCase)

const currentContractExpectations = Object.freeze({
  'write-initial-shapes': {
    status: 'restored-with-changes',
    submittedAnswers: { exclusions: ['none'] },
    flowStatus: 'incomplete',
    resumeQuestionId: 'form',
    repairCodes: [],
  },
  'write-single-multiple-shapes': {
    status: 'restored-with-changes',
    submittedAnswers: {
      form: ['soup'],
      archetype: ['chintan'],
      tare: ['shoyu'],
      source: ['pork', 'chicken'],
      exclusions: ['none'],
    },
    flowStatus: 'incomplete',
    resumeQuestionId: 'body',
    repairCodes: [],
  },
  'write-forced-answer': {
    status: 'restored-with-changes',
    submittedAnswers: {
      form: ['tsukemen'],
      archetype: ['miso-rich'],
      exclusions: ['none'],
    },
    flowStatus: 'incomplete',
    resumeQuestionId: 'source',
    repairCodes: ['remove-submitted-forced-answer'],
  },
  'restore-seafood': {
    status: 'restored-with-changes',
    submittedAnswers: {
      exclusions: ['fish-seafood', 'shellfish', 'shrimp-crab'],
    },
    flowStatus: 'incomplete',
    resumeQuestionId: 'form',
    repairCodes: [],
  },
  'restore-empty-initial-arrays': {
    status: 'invalid',
    diagnostics: [{
      stage: 'schema-migration',
      code: 'PERSISTENCE_LEGACY_EMPTY_SELECTION_INVALID',
      path: '/exclusions',
    }],
  },
  'restore-exclusive-normalization': {
    status: 'invalid',
    diagnostics: [
      {
        stage: 'answer-decode',
        code: 'ANSWER_EXCLUSIVE_CONFLICT',
        path: '/submittedAnswers/exclusions',
      },
      {
        stage: 'answer-decode',
        code: 'ANSWER_EXCLUSIVE_CONFLICT',
        path: '/submittedAnswers/signature',
      },
      {
        stage: 'answer-decode',
        code: 'ANSWER_UNKNOWN_OPTION',
        path: '/submittedAnswers/signature/1',
      },
      {
        stage: 'answer-decode',
        code: 'ANSWER_EXCLUSIVE_CONFLICT',
        path: '/submittedAnswers/source',
      },
    ],
  },
} as const satisfies Record<LegacyPersistenceCaseId, CurrentContractExpectation>)

function observationById(
  caseId: LegacyPersistenceCaseId,
): LegacyPersistenceObservationCase {
  const index = manifest.orderedCaseIds.indexOf(caseId)
  const observation = observations[index]
  if (!observation || observation.id !== caseId) {
    throw new Error(`Missing ordered legacy persistence observation ${caseId}`)
  }
  return observation
}

function legacySourceFromObservation(
  observation: LegacyPersistenceObservationCase,
): VerifiedLegacyRestoreSource {
  const answers = observation.kind === 'legacy-write-observation'
    ? observation.observedAnswers
    : observation.legacyInput
  return {
    kind: 'legacy-unversioned',
    sourceId: verifiedLegacySourceId,
    answers,
  }
}

function restoreLegacyAnswers(answers: unknown): RestoreResult {
  return restoreClassification(questionModel, {
    kind: 'legacy-unversioned',
    sourceId: verifiedLegacySourceId,
    answers,
  })
}

function expectSuccessfulFixedPoint(
  first: Extract<RestoreResult, { readonly status: 'restored-with-changes' }>,
): void {
  const second = restoreClassification(questionModel, {
    kind: 'versioned',
    payload: first.normalizedPayload,
  })

  expect(second).toMatchObject({
    status: 'restored',
    submittedAnswers: first.submittedAnswers,
    flowState: first.flowState,
    migrations: [],
    repairs: [],
    changes: [],
    writeBackRequired: false,
  })
  if (second.status !== 'restored') return
  expect(second.resumeQuestionId).toBe(first.resumeQuestionId)
}

describe('frozen legacy persistence migration contract', () => {
  test('binds all current-only expectations to exact manifest order', () => {
    expect(manifest.caseCount).toBe(legacyPersistenceCaseIds.length)
    expect(manifest.orderedCaseIds).toEqual(legacyPersistenceCaseIds)
    expect(observations.map(({ id }) => id)).toEqual(manifest.orderedCaseIds)
    expect(Object.keys(currentContractExpectations)).toEqual(manifest.orderedCaseIds)
  })

  test.each(legacyPersistenceCaseIds)(
    'restores frozen observation %s through its current-only contract',
    (caseId) => {
      const observation = observationById(caseId)
      const expectation = currentContractExpectations[caseId]
      const source = legacySourceFromObservation(observation)

      if (observation.kind === 'legacy-restore-observation') {
        expect(source.answers).toBe(observation.legacyInput)
        expect(source.answers).not.toBe(observation.observedLegacyOutput)
      } else {
        expect(source.answers).toBe(observation.observedAnswers)
      }

      const result = restoreClassification(questionModel, source)
      expect(result.status).toBe(expectation.status)
      if (expectation.status === 'invalid') {
        expect(result.status).toBe('invalid')
        if (result.status !== 'invalid') return
        expect(result.diagnostics).toEqual(expectation.diagnostics.map((diagnostic) => (
          expect.objectContaining(diagnostic)
        )))
        expect(result).not.toHaveProperty('normalizedPayload')
        return
      }

      expect(result.status).toBe('restored-with-changes')
      if (result.status !== 'restored-with-changes') return
      expect(result.submittedAnswers).toEqual(expectation.submittedAnswers)
      expect(result.flowState.status).toBe(expectation.flowStatus)
      expect(result.resumeQuestionId).toBe(expectation.resumeQuestionId)
      expect(result.migrations).toEqual([{
        kind: 'legacy-lineage',
        fromSourceId: verifiedLegacySourceId,
        toSchemaVersion: 1,
        toQuestionModelVersion: questionModel.metadata.modelVersion,
        toQuestionSemanticHash: questionModel.metadata.semanticHash,
      }])
      expect(result.repairs.map(({ code }) => code)).toEqual(expectation.repairCodes)
      expect(result.changes.length).toBeGreaterThan(0)
      expect(result.writeBackRequired).toBe(true)
      expect(result.normalizedPayload).toEqual({
        schemaVersion: 1,
        questionModelVersion: questionModel.metadata.modelVersion,
        questionSemanticHash: questionModel.metadata.semanticHash,
        submittedAnswers: expectation.submittedAnswers,
      })
      expect(result.normalizedPayload).not.toHaveProperty('canonicalAnswers')
      expect(result.normalizedPayload).not.toHaveProperty('cursorQuestionId')
      expectSuccessfulFixedPoint(result)
    },
  )

  test('uses observed restore outputs only as legacy oracle evidence', () => {
    const seafood = observationById('restore-seafood')
    const empty = observationById('restore-empty-initial-arrays')
    const exclusive = observationById('restore-exclusive-normalization')
    if (
      seafood.kind !== 'legacy-restore-observation'
      || empty.kind !== 'legacy-restore-observation'
      || exclusive.kind !== 'legacy-restore-observation'
    ) throw new Error('Expected ordered restore observations')

    expect(seafood.observedLegacyOutput).toEqual({
      source: [],
      signature: [],
      exclusions: ['fish-seafood', 'shellfish', 'shrimp-crab'],
    })
    expect(empty.observedLegacyOutput).toEqual({
      source: [],
      signature: [],
      exclusions: ['none'],
    })
    expect(exclusive.observedLegacyOutput).toEqual({
      source: ['pork'],
      signature: ['no-preference'],
      exclusions: ['fish-seafood'],
    })

    expect(legacySourceFromObservation(seafood).answers).toBe(seafood.legacyInput)
    expect(legacySourceFromObservation(empty).answers).toBe(empty.legacyInput)
    expect(legacySourceFromObservation(exclusive).answers).toBe(exclusive.legacyInput)
    expect(restoreLegacyAnswers(empty.legacyInput).status).toBe('invalid')
    expect(restoreLegacyAnswers(exclusive.legacyInput).status).toBe('invalid')
  })

  test('keeps verified empty-array and none semantics field-specific', () => {
    for (const caseId of [
      'write-initial-shapes',
      'write-forced-answer',
      'restore-seafood',
    ] as const) {
      const result = restoreClassification(
        questionModel,
        legacySourceFromObservation(observationById(caseId)),
      )
      expect(result.status).toBe('restored-with-changes')
      if (result.status !== 'restored-with-changes') continue
      expect(result.submittedAnswers).not.toHaveProperty('source')
      expect(result.submittedAnswers).not.toHaveProperty('signature')
    }

    for (const caseId of [
      'write-initial-shapes',
      'write-single-multiple-shapes',
      'write-forced-answer',
    ] as const) {
      const result = restoreClassification(
        questionModel,
        legacySourceFromObservation(observationById(caseId)),
      )
      expect(result).toMatchObject({
        status: 'restored-with-changes',
        submittedAnswers: { exclusions: ['none'] },
      })
    }
  })

  test.each([
    [{ form: ['soup'] }, 'PERSISTENCE_LEGACY_FIELD_SHAPE_INVALID'],
    [{ source: 'pork' }, 'PERSISTENCE_LEGACY_FIELD_SHAPE_INVALID'],
    [{ source: ['seafood'] }, 'ANSWER_UNKNOWN_OPTION'],
    [{ exclusions: ['seafood', 'shellfish'] }, 'PERSISTENCE_LEGACY_EXPANSION_CONFLICT'],
    [{ exclusions: ['seafood', 'seafood'] }, 'PERSISTENCE_LEGACY_EXPANSION_CONFLICT'],
    [{ source: ['pork', 'pork'] }, 'ANSWER_DUPLICATE_OPTION'],
    [{ source: ['unsure', 'pork'] }, 'ANSWER_EXCLUSIVE_CONFLICT'],
    [{ exclusions: [] }, 'PERSISTENCE_LEGACY_EMPTY_SELECTION_INVALID'],
    [{ stepIndex: 2 }, 'PERSISTENCE_UNKNOWN_FIELD'],
  ] as const)('rejects strict legacy boundary %j with %s', (answers, code) => {
    const result = restoreLegacyAnswers(answers)
    expect(result).toMatchObject({
      status: 'invalid',
      diagnostics: [expect.objectContaining({ code })],
    })
  })
})
