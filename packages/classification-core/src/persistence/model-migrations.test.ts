import { describe, expect, test } from 'vitest'
import { PersistenceInvariantError } from './invariant-error.js'
import {
  migrateQuestionModelToCurrent,
  questionModelMigrationRegistry,
  type QuestionModelIdentity,
  type QuestionModelMigrationRegistry,
  type QuestionModelMigrationStep,
} from './model-migrations.js'
import { currentV1, questionModel } from './test-fixtures.js'

const currentIdentity: QuestionModelIdentity = {
  questionModelVersion: questionModel.metadata.modelVersion,
  questionSemanticHash: questionModel.metadata.semanticHash,
}
const oldIdentity: QuestionModelIdentity = {
  questionModelVersion: 'old.1',
  questionSemanticHash: 'a'.repeat(64),
}
const middleIdentity: QuestionModelIdentity = {
  questionModelVersion: 'middle.1',
  questionSemanticHash: 'b'.repeat(64),
}

function step(
  from: QuestionModelIdentity = oldIdentity,
  to: QuestionModelIdentity = currentIdentity,
  migrateSubmittedAnswers: QuestionModelMigrationStep['migrateSubmittedAnswers'] = () => ({
    ok: true,
    submittedAnswers: { form: ['soup'] },
  }),
): QuestionModelMigrationStep {
  return { from, to, migrateSubmittedAnswers }
}

function registry(
  migrations: readonly QuestionModelMigrationStep[],
  current = currentIdentity,
): QuestionModelMigrationRegistry {
  return { current, migrations }
}

function oldModel(overrides: Readonly<Record<string, unknown>> = {}): unknown {
  return currentV1({
    questionModelVersion: oldIdentity.questionModelVersion,
    questionSemanticHash: oldIdentity.questionSemanticHash,
    submittedAnswers: { oldForm: ['broth'] },
    ...overrides,
  })
}

function expectFailureCode(
  result: ReturnType<typeof migrateQuestionModelToCurrent>,
  code: string,
) {
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ code }),
  ]))
  expect(Object.isFrozen(result)).toBe(true)
}

describe('migrateQuestionModelToCurrent', () => {
  test('keeps model evidence separate from schema evidence', () => {
    const result = migrateQuestionModelToCurrent(registry([step()]), oldModel())

    expect(result).toMatchObject({
      ok: true,
      payload: {
        schemaVersion: 1,
        questionModelVersion: currentIdentity.questionModelVersion,
        questionSemanticHash: currentIdentity.questionSemanticHash,
        submittedAnswers: { form: ['soup'] },
      },
      migrations: [{
        kind: 'question-model',
        fromQuestionModelVersion: oldIdentity.questionModelVersion,
        fromQuestionSemanticHash: oldIdentity.questionSemanticHash,
        toQuestionModelVersion: currentIdentity.questionModelVersion,
        toQuestionSemanticHash: currentIdentity.questionSemanticHash,
      }],
    })
    if (!result.ok) return
    expect(result.migrations.every(({ kind }) => kind === 'question-model')).toBe(true)
  })

  test('accepts the exact current identity without fake model evidence', () => {
    expect(migrateQuestionModelToCurrent(
      questionModelMigrationRegistry,
      currentV1(),
    )).toMatchObject({ ok: true, migrations: [] })
  })

  test('distinguishes current-version integrity failure from unsupported lineage', () => {
    expectFailureCode(migrateQuestionModelToCurrent(
      questionModelMigrationRegistry,
      currentV1({ questionSemanticHash: 'c'.repeat(64) }),
    ), 'PERSISTENCE_QUESTION_MODEL_INTEGRITY')
    expectFailureCode(migrateQuestionModelToCurrent(
      questionModelMigrationRegistry,
      oldModel(),
    ), 'PERSISTENCE_QUESTION_MODEL_UNSUPPORTED')
    expectFailureCode(migrateQuestionModelToCurrent(
      registry([step()]),
      oldModel({ questionSemanticHash: 'd'.repeat(64) }),
    ), 'PERSISTENCE_QUESTION_MODEL_UNSUPPORTED')
  })

  test('returns migration failed for a registered explicit data rejection', () => {
    const rejecting = step(oldIdentity, currentIdentity, () => ({ ok: false }))

    expectFailureCode(
      migrateQuestionModelToCurrent(registry([rejecting]), oldModel()),
      'PERSISTENCE_MIGRATION_FAILED',
    )
  })

  test.each([
    ['duplicate source', registry([step(), step()])],
    ['gap', registry([step(oldIdentity, middleIdentity)])],
    ['cycle', registry([
      step(oldIdentity, middleIdentity),
      step(middleIdentity, oldIdentity),
    ])],
    ['current source', registry([step(currentIdentity, oldIdentity)])],
  ])('throws a bounded invariant for a %s registry', (_name, invalidRegistry) => {
    expect(() => migrateQuestionModelToCurrent(invalidRegistry, oldModel())).toThrow(
      PersistenceInvariantError,
    )
    try {
      migrateQuestionModelToCurrent(invalidRegistry, oldModel())
    } catch (error) {
      expect(error).toMatchObject({ invariantCode: 'PERSISTENCE_MIGRATION_INVARIANT' })
      expect((error as Error).message).not.toContain('oldForm')
    }
  })

  test('rejects a trusted current identity without the matching compiled model', () => {
    const fakeCurrent: QuestionModelIdentity = {
      questionModelVersion: 'fake-current.1',
      questionSemanticHash: 'c'.repeat(64),
    }
    const invalidRegistry = registry([], fakeCurrent)

    expect(() => migrateQuestionModelToCurrent(invalidRegistry, currentV1({
      questionModelVersion: fakeCurrent.questionModelVersion,
      questionSemanticHash: fakeCurrent.questionSemanticHash,
    }))).toThrow(PersistenceInvariantError)
  })

  test('turns registered migration exceptions into a bounded invariant', () => {
    const throwing = step(oldIdentity, currentIdentity, () => {
      throw new Error('private answer state')
    })

    expect(() => migrateQuestionModelToCurrent(registry([throwing]), oldModel())).toThrow(
      PersistenceInvariantError,
    )
    try {
      migrateQuestionModelToCurrent(registry([throwing]), oldModel())
    } catch (error) {
      expect(error).toMatchObject({ invariantCode: 'PERSISTENCE_MIGRATION_INVARIANT' })
      expect((error as Error).message).not.toContain('private answer state')
    }
  })

  test('does not disguise an impossible rejection shape as external data failure', () => {
    const malformed = step(oldIdentity, currentIdentity, () => ({
      ok: false,
      privateReason: 'private answer state',
    }) as unknown as ReturnType<QuestionModelMigrationStep['migrateSubmittedAnswers']>)

    expect(() => migrateQuestionModelToCurrent(registry([malformed]), oldModel())).toThrow(
      PersistenceInvariantError,
    )
  })

  test('follows registered model steps in stable order and preserves cursor structurally', () => {
    const steps = [
      step(oldIdentity, middleIdentity, () => ({
        ok: true,
        submittedAnswers: { middleForm: ['broth'] },
      })),
      step(middleIdentity, currentIdentity),
    ]
    const result = migrateQuestionModelToCurrent(
      registry(steps),
      oldModel({ cursorQuestionId: 'retired-question' }),
    )

    expect(result).toMatchObject({
      ok: true,
      payload: { cursorQuestionId: 'retired-question' },
      migrations: [
        { fromQuestionModelVersion: 'old.1', toQuestionModelVersion: 'middle.1' },
        { fromQuestionModelVersion: 'middle.1', toQuestionModelVersion: 'batch2a.1.0' },
      ],
    })
  })
})
