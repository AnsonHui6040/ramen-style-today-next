import { describe, expect, expectTypeOf, test } from 'vitest'

import * as runtime from './index.js'
import {
  applyAnswer,
  createStoredClassificationPayloadV1,
  decodeAnswerDraft,
  evaluateFlow,
  getFirstActionableQuestion,
  getNextInteractiveQuestion,
  getPreviousInteractiveQuestion,
  questionModel,
  restoreClassification,
  updatePendingSelection,
  type AppliedMigration,
  type ClassificationRestoreSource,
  type CompiledQuestionModel,
  type CreateStoredPayloadResult,
  type PersistenceDiagnostic,
  type PersistenceDiagnosticCode,
  type PersistencePipelineStage,
  type PersistenceRepair,
  type RestoreChange,
  type RestoreResult,
  type StoredClassificationPayloadV1,
} from './index.js'
import { createStoredClassificationPayloadV1 as createPayloadImplementation } from './persistence/create-payload.js'
import type {
  AppliedMigration as ContractAppliedMigration,
  ClassificationRestoreSource as ContractClassificationRestoreSource,
  CreateStoredPayloadResult as ContractCreateStoredPayloadResult,
  PersistenceDiagnostic as ContractPersistenceDiagnostic,
  PersistenceDiagnosticCode as ContractPersistenceDiagnosticCode,
  PersistencePipelineStage as ContractPersistencePipelineStage,
  PersistenceRepair as ContractPersistenceRepair,
  RestoreChange as ContractRestoreChange,
  RestoreResult as ContractRestoreResult,
  StoredClassificationPayloadV1 as ContractStoredClassificationPayloadV1,
} from './persistence/contracts.js'
import { restoreClassification as restoreImplementation } from './persistence/restore.js'

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return
  expect(Object.isFrozen(value)).toBe(true)
  for (const child of Object.values(value)) expectDeeplyFrozen(child)
}

describe('classification-core runtime package', () => {
  test('exports the exact frozen runtime surface without compiler APIs', () => {
    expect(Object.keys(runtime).sort()).toEqual([
      'applyAnswer',
      'createStoredClassificationPayloadV1',
      'decodeAnswerDraft',
      'evaluateFlow',
      'getFirstActionableQuestion',
      'getNextInteractiveQuestion',
      'getPreviousInteractiveQuestion',
      'questionModel',
      'restoreClassification',
      'updatePendingSelection',
    ])
    expect(createStoredClassificationPayloadV1).toBe(createPayloadImplementation)
    expect(restoreClassification).toBe(restoreImplementation)
    expectTypeOf(questionModel).toMatchTypeOf<CompiledQuestionModel>()
    expect(Object.isFrozen(questionModel)).toBe(true)
    expect(Object.isFrozen(questionModel.questions)).toBe(true)
    expect(Object.isFrozen(questionModel.questions[0])).toBe(true)
    expect(Object.isFrozen(questionModel.questions[0]!.options)).toBe(true)
    expect(Object.isFrozen(questionModel.questions[0]!.options[0])).toBe(true)
    expect('compileQuestions' in runtime).toBe(false)
    expect('questionDefinitions' in runtime).toBe(false)
    expect([
      'decodeRestoreSource',
      'decodeMinimalEnvelope',
      'decodeStoredPayloadV1Structure',
      'decodeCurrentAnswerDraft',
      'schemaMigrationRegistry',
      'questionModelMigrationRegistry',
      'migrateVerifiedLegacyAnswers',
      'projectRepairedSubmittedAnswers',
      'resolveResumeQuestion',
      'sameStoredClassificationPayloadV1',
      'scanPlainData',
      'PersistenceInvariantError',
      'currentV1',
    ].filter((name) => name in runtime)).toEqual([])
  })

  test('exports the exact persistence contract types for consumers', () => {
    expectTypeOf<ClassificationRestoreSource>()
      .toEqualTypeOf<ContractClassificationRestoreSource>()
    expectTypeOf<StoredClassificationPayloadV1>()
      .toEqualTypeOf<ContractStoredClassificationPayloadV1>()
    expectTypeOf<RestoreResult>().toEqualTypeOf<ContractRestoreResult>()
    expectTypeOf<RestoreChange>().toEqualTypeOf<ContractRestoreChange>()
    expectTypeOf<AppliedMigration>().toEqualTypeOf<ContractAppliedMigration>()
    expectTypeOf<PersistenceRepair>().toEqualTypeOf<ContractPersistenceRepair>()
    expectTypeOf<PersistenceDiagnostic>().toEqualTypeOf<ContractPersistenceDiagnostic>()
    expectTypeOf<PersistenceDiagnosticCode>()
      .toEqualTypeOf<ContractPersistenceDiagnosticCode>()
    expectTypeOf<PersistencePipelineStage>()
      .toEqualTypeOf<ContractPersistencePipelineStage>()
    expectTypeOf<CreateStoredPayloadResult>()
      .toEqualTypeOf<ContractCreateStoredPayloadResult>()
  })

  test('keeps public persistence results recursively frozen without mutable singletons', () => {
    const first = createStoredClassificationPayloadV1(questionModel, {})
    const second = createStoredClassificationPayloadV1(questionModel, {})
    expect(first).not.toBe(second)
    expect(first).toEqual(second)
    expect(first.status).toBe('created')
    expectDeeplyFrozen(first)

    if (first.status !== 'created') throw new Error('Expected a created payload')
    const restored = restoreClassification(questionModel, {
      kind: 'versioned',
      payload: first.payload,
    })
    expect(restored.status).toBe('restored')
    expectDeeplyFrozen(restored)
  })

  test('flow APIs do not mutate the tracked public model', () => {
    const before = JSON.stringify(questionModel)
    const initial = evaluateFlow(questionModel, {})
    expect(initial.status).toBe('incomplete')
    expect(getFirstActionableQuestion(initial)).toBe('form')
    expect(getNextInteractiveQuestion(initial, 'form')).toBe('exclusions')
    expect(getPreviousInteractiveQuestion(initial, 'form')).toBeUndefined()

    const decoded = decodeAnswerDraft({ form: ['soup'] })
    expect(decoded.ok).toBe(true)
    const pending = updatePendingSelection({
      questionId: 'form',
      optionOrder: ['soup', 'tsukemen', 'dry'],
      allowedOptionIds: ['soup', 'tsukemen', 'dry'],
      exclusiveOptionIds: ['soup', 'tsukemen', 'dry'],
      minSelections: 1,
      maxSelections: 1,
      initialUiOptionIds: [],
      emptyBehavior: { type: 'allow-empty' },
    }, [], { type: 'select', optionId: 'soup' })
    expect(pending.optionIds).toEqual(['soup'])
    expect(applyAnswer(questionModel, {}, {
      questionId: 'form',
      optionIds: ['soup'],
    }).accepted).toBe(true)

    expect(JSON.stringify(questionModel)).toBe(before)
  })
})
