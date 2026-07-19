import { describe, expect, test } from 'vitest'

import { diagnosticCodes } from '../contracts/diagnostic-codes.js'
import {
  chintanDraft,
  completeSoupDraft,
  misoRichDraft,
} from '../flow/test-fixtures.js'
import {
  createStoredClassificationPayloadV1,
  getFirstActionableQuestion,
  restoreClassification,
} from '../index.js'
import type {
  ClassificationRestoreSource,
  PersistenceDiagnostic,
  PersistenceDiagnosticCode,
  PersistencePipelineStage,
  PersistenceRepair,
  RestoreResult,
} from './contracts.js'
import { decodeCurrentAnswerDraft } from './decode-answers.js'
import {
  decodeRestoreSource,
  type DecodeFailure,
} from './decode-envelope.js'
import { decodeStoredPayloadV1Structure } from './decode-v1.js'
import {
  appendJsonPointer,
  persistenceDiagnosticCodes,
  persistencePipelineStages,
  sortPersistenceDiagnostics,
  summarizeReceived,
} from './diagnostics.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { migrateVerifiedLegacyAnswers } from './legacy-lineage.js'
import {
  migrateQuestionModelToCurrent,
  questionModelMigrationRegistry,
  type QuestionModelIdentity,
  type QuestionModelMigrationRegistry,
  type QuestionModelMigrationStep,
} from './model-migrations.js'
import { scanPlainData } from './plain-data.js'
import {
  migrateSchemaToCurrent,
  schemaMigrationRegistry,
  type SchemaMigrationRegistry,
  type SchemaMigrationStep,
} from './schema-migrations.js'
import {
  currentV1,
  questionModel,
  verifiedLegacySourceId,
} from './test-fixtures.js'

const expectedPersistenceDiagnosticCodes = [
  'PERSISTENCE_SOURCE_INVALID',
  'PERSISTENCE_SOURCE_UNSUPPORTED',
  'PERSISTENCE_RESOURCE_LIMIT',
  'PERSISTENCE_ENVELOPE_INVALID',
  'PERSISTENCE_DATA_NOT_PLAIN',
  'PERSISTENCE_ACCESSOR_FORBIDDEN',
  'PERSISTENCE_DANGEROUS_KEY',
  'PERSISTENCE_CIRCULAR_REFERENCE',
  'PERSISTENCE_REQUIRED_FIELD_MISSING',
  'PERSISTENCE_UNKNOWN_FIELD',
  'PERSISTENCE_FIELD_TYPE_INVALID',
  'PERSISTENCE_SCHEMA_VERSION_UNSUPPORTED',
  'PERSISTENCE_QUESTION_MODEL_UNSUPPORTED',
  'PERSISTENCE_QUESTION_MODEL_INTEGRITY',
  'PERSISTENCE_SEMANTIC_HASH_INVALID',
  'PERSISTENCE_LEGACY_FIELD_SHAPE_INVALID',
  'PERSISTENCE_LEGACY_EMPTY_SELECTION_INVALID',
  'PERSISTENCE_LEGACY_EXPANSION_CONFLICT',
  'PERSISTENCE_MIGRATION_FAILED',
  'PERSISTENCE_SUBMITTED_STATE_REQUIRES_REPAIR',
  'PERSISTENCE_SUBMITTED_ANSWER_FOR_FORCED_QUESTION',
  'PERSISTENCE_CURSOR_INVALID',
] as const satisfies readonly PersistenceDiagnosticCode[]

const expectedAnswerDiagnosticCodes = [
  'ANSWER_DRAFT_INVALID',
  'ANSWER_UNKNOWN_QUESTION',
  'ANSWER_UNKNOWN_OPTION',
  'ANSWER_WRONG_OWNER',
  'ANSWER_DUPLICATE_OPTION',
  'ANSWER_OPTION_DISALLOWED',
  'ANSWER_SELECTION_BOUNDS',
  'ANSWER_EXCLUSIVE_CONFLICT',
  'ANSWER_QUESTION_NOT_INTERACTIVE',
] as const

const expectedPipelineStages = [
  'source',
  'minimal-envelope',
  'schema-decode',
  'schema-migration',
  'model-compatibility',
  'model-migration',
  'answer-decode',
  'flow-evaluation',
  'repair-projection',
  'resume-resolution',
  'payload-build',
] as const satisfies readonly PersistencePipelineStage[]

const expectedRepairCodes = [
  'remove-unreachable-answer',
  'remove-disallowed-option',
  'remove-stale-under-min-answer',
  'remove-submitted-forced-answer',
  'canonicalize-answer-order',
  'drop-unknown-cursor',
  'normalize-cursor',
] as const satisfies readonly PersistenceRepair['code'][]

const expectedRestoreStatuses = [
  'restored',
  'restored-with-changes',
  'unsupported',
  'invalid',
] as const satisfies readonly RestoreResult['status'][]

const expectedUnsupportedReasons = [
  'unsupported-source',
  'unsupported-schema-version',
  'unsupported-question-model',
  'question-model-integrity-error',
] as const

function versioned(payload: unknown): ClassificationRestoreSource {
  return { kind: 'versioned', payload }
}

function legacy(answers: unknown): ClassificationRestoreSource {
  return {
    kind: 'legacy-unversioned',
    sourceId: verifiedLegacySourceId,
    answers,
  }
}

function diagnosticsFrom(value: unknown): readonly PersistenceDiagnostic[] {
  if (
    value
      && typeof value === 'object'
      && 'diagnostics' in value
      && Array.isArray((value as { readonly diagnostics?: unknown }).diagnostics)
  ) return (value as { readonly diagnostics: readonly PersistenceDiagnostic[] }).diagnostics
  return []
}

function oldSchemaPayload(): unknown {
  return {
    schemaVersion: 0,
    questionModelVersion: 'old.1',
    questionSemanticHash: 'a'.repeat(64),
    answers: { oldForm: ['broth'] },
  }
}

function schemaStep(
  migrate: SchemaMigrationStep['migrate'] = (payload) => ({
    ok: true,
    payload: {
      schemaVersion: 1,
      questionModelVersion: payload.questionModelVersion,
      questionSemanticHash: payload.questionSemanticHash,
      submittedAnswers: payload.answers,
    },
  }),
): SchemaMigrationStep {
  return { fromSchemaVersion: 0, toSchemaVersion: 1, migrate }
}

function schemaRegistry(
  migrations: readonly SchemaMigrationStep[],
  currentSchemaVersion = 1,
): SchemaMigrationRegistry {
  return { currentSchemaVersion, migrations }
}

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

function modelStep(
  from: QuestionModelIdentity = oldIdentity,
  to: QuestionModelIdentity = currentIdentity,
  migrateSubmittedAnswers: QuestionModelMigrationStep['migrateSubmittedAnswers'] = () => ({
    ok: true,
    submittedAnswers: { form: ['soup'] },
  }),
): QuestionModelMigrationStep {
  return { from, to, migrateSubmittedAnswers }
}

function modelRegistry(
  migrations: readonly QuestionModelMigrationStep[],
): QuestionModelMigrationRegistry {
  return { current: currentIdentity, migrations }
}

function oldModelPayload(): unknown {
  return currentV1({
    questionModelVersion: oldIdentity.questionModelVersion,
    questionSemanticHash: oldIdentity.questionSemanticHash,
    submittedAnswers: { oldForm: ['broth'] },
  })
}

function collectPersistenceDiagnosticCodes(): readonly string[] {
  const results: unknown[] = []
  results.push(decodeRestoreSource(null))
  results.push(decodeRestoreSource({
    kind: 'legacy-unversioned',
    sourceId: 'ramen-style-today@unknown',
    answers: {},
  }))
  results.push(scanPlainData({ a: { b: { c: { d: { e: 'too-deep' } } } } }))

  const revoked = Proxy.revocable({}, {})
  revoked.revoke()
  results.push(scanPlainData(revoked.proxy))
  results.push(scanPlainData(new Date()))
  results.push(scanPlainData(Object.defineProperty({}, 'answer', {
    enumerable: true,
    get: () => 'private',
  })))
  results.push(scanPlainData(Object.defineProperty({}, '__proto__', {
    enumerable: true,
    value: 'blocked',
  })))
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  results.push(scanPlainData(cycle))

  const missing = currentV1()
  delete missing.submittedAnswers
  results.push(decodeStoredPayloadV1Structure(missing))
  results.push(decodeStoredPayloadV1Structure(currentV1({ unexpected: true })))
  results.push(decodeStoredPayloadV1Structure(currentV1({ cursorQuestionId: 2 })))
  results.push(migrateSchemaToCurrent(
    schemaMigrationRegistry,
    currentV1({ schemaVersion: 2 }),
  ))
  results.push(migrateQuestionModelToCurrent(
    questionModelMigrationRegistry,
    currentV1({
      questionModelVersion: 'future.1',
      questionSemanticHash: 'a'.repeat(64),
    }),
  ))
  results.push(migrateQuestionModelToCurrent(
    questionModelMigrationRegistry,
    currentV1({ questionSemanticHash: 'b'.repeat(64) }),
  ))
  results.push(decodeStoredPayloadV1Structure(currentV1({
    questionSemanticHash: 'not-a-semantic-hash',
  })))
  results.push(migrateVerifiedLegacyAnswers(questionModel, { form: ['soup'] }))
  results.push(migrateVerifiedLegacyAnswers(questionModel, { exclusions: [] }))
  results.push(migrateVerifiedLegacyAnswers(questionModel, {
    exclusions: ['seafood', 'shellfish'],
  }))
  results.push(migrateSchemaToCurrent(
    schemaRegistry([schemaStep(() => ({ ok: false }))]),
    oldSchemaPayload(),
  ))
  results.push(createStoredClassificationPayloadV1(
    questionModel,
    { archetype: ['chintan'] },
  ))
  results.push(createStoredClassificationPayloadV1(questionModel, {
    ...misoRichDraft,
    tare: ['miso'],
  }))
  results.push(createStoredClassificationPayloadV1(
    questionModel,
    chintanDraft,
    'source',
  ))

  return [...new Set(results.flatMap((result) => (
    diagnosticsFrom(result).map(({ code }) => code)
  )))].sort()
}

describe('public persistence contract matrix', () => {
  test('keeps every status, reason, diagnostic, stage, and repair discriminator closed', () => {
    expect(persistenceDiagnosticCodes).toEqual(expectedPersistenceDiagnosticCodes)
    expect(diagnosticCodes.filter((code) => code.startsWith('ANSWER_')))
      .toEqual(expectedAnswerDiagnosticCodes)
    expect(persistencePipelineStages).toEqual(expectedPipelineStages)
    expect(new Set(expectedRepairCodes).size).toBe(expectedRepairCodes.length)
    expect(new Set(expectedRestoreStatuses).size).toBe(expectedRestoreStatuses.length)
    expect(new Set(expectedUnsupportedReasons).size).toBe(expectedUnsupportedReasons.length)

    const answerWitnesses = expectedAnswerDiagnosticCodes.map((code, index) => ({
      stage: 'answer-decode' as const,
      code,
      path: `/submittedAnswers/witness/${index}`,
    }))
    expect(sortPersistenceDiagnostics(questionModel, answerWitnesses).map(({ code }) => code))
      .toEqual(expectedAnswerDiagnosticCodes)
  })

  test('produces every persistence-specific diagnostic code from a real boundary', () => {
    expect(collectPersistenceDiagnosticCodes()).toEqual(
      [...expectedPersistenceDiagnosticCodes].sort(),
    )
  })

  test('covers every RestoreResult status and unsupported reason', () => {
    const results = [
      restoreClassification(questionModel, versioned(currentV1())),
      restoreClassification(questionModel, legacy({ form: 'soup' })),
      restoreClassification(
        questionModel,
        null as unknown as ClassificationRestoreSource,
      ),
      ...[
        {
          kind: 'legacy-unversioned',
          sourceId: 'ramen-style-today@unknown',
          answers: {},
        },
        versioned(currentV1({ schemaVersion: 2 })),
        versioned(currentV1({
          questionModelVersion: 'future.1',
          questionSemanticHash: 'a'.repeat(64),
        })),
        versioned(currentV1({ questionSemanticHash: 'b'.repeat(64) })),
      ].map((source) => restoreClassification(
        questionModel,
        source as ClassificationRestoreSource,
      )),
    ]

    expect([...new Set(results.map(({ status }) => status))].sort())
      .toEqual([...expectedRestoreStatuses].sort())
    expect(results.flatMap((result) => result.status === 'unsupported'
      ? [result.reason]
      : [])).toEqual(expectedUnsupportedReasons)
  })

  test('keeps schema and question-model identity axes independent', () => {
    const matrix = [
      [currentV1(), 'restored', undefined],
      [currentV1({ schemaVersion: 2 }), 'unsupported', 'unsupported-schema-version'],
      [currentV1({
        questionModelVersion: 'future.1',
        questionSemanticHash: 'a'.repeat(64),
      }), 'unsupported', 'unsupported-question-model'],
      [currentV1({ questionSemanticHash: 'b'.repeat(64) }),
        'unsupported', 'question-model-integrity-error'],
      [currentV1({ submittedAnswers: { future: ['private'] } }), 'invalid', undefined],
    ] as const

    for (const [payload, status, reason] of matrix) {
      const result = restoreClassification(questionModel, versioned(payload))
      expect(result.status).toBe(status)
      if (reason !== undefined) {
        expect(result).toMatchObject({ status: 'unsupported', reason })
      }
    }
  })

  test.each([
    [{ form: 'soup' }, 'ANSWER_DRAFT_INVALID'],
    [{ future: ['unknown'] }, 'ANSWER_UNKNOWN_QUESTION'],
    [{ form: ['unknown'] }, 'ANSWER_UNKNOWN_OPTION'],
    [{ form: ['pork'] }, 'ANSWER_WRONG_OWNER'],
    [{ source: ['pork', 'pork'] }, 'ANSWER_DUPLICATE_OPTION'],
    [{ form: [] }, 'ANSWER_SELECTION_BOUNDS'],
    [{ source: ['unsure', 'pork'] }, 'ANSWER_EXCLUSIVE_CONFLICT'],
  ] as const)('retains intrinsic answer diagnostic %s', (input, code) => {
    const result = decodeCurrentAnswerDraft(questionModel, input)
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code })],
    })
  })

  test('observes every repair code through successful public restores', () => {
    const payloads = [
      currentV1({ submittedAnswers: { archetype: ['chintan'] } }),
      currentV1({ submittedAnswers: {
        form: ['tsukemen'],
        archetype: ['miso-rich'],
        source: ['pork', 'duck'],
      } }),
      currentV1({ submittedAnswers: {
        form: ['tsukemen'],
        archetype: ['chintan'],
      } }),
      currentV1({ submittedAnswers: {
        ...misoRichDraft,
        tare: ['miso'],
      } }),
      currentV1({ submittedAnswers: {
        form: ['soup'],
        archetype: ['chintan'],
        source: ['chicken', 'pork'],
      } }),
      currentV1({
        cursorQuestionId: 'future-question',
        submittedAnswers: { form: ['soup'] },
      }),
      currentV1({
        cursorQuestionId: 'tare',
        submittedAnswers: { form: ['soup'] },
      }),
    ]
    const observed = payloads.flatMap((payload) => {
      const result = restoreClassification(questionModel, versioned(payload))
      expect(result.status).toBe('restored-with-changes')
      return result.status === 'restored-with-changes'
        ? result.repairs.map(({ code }) => code)
        : []
    })
    expect(observed).toEqual(expectedRepairCodes)
  })

  test('escapes pointers, bounds summaries, and orders diagnostics exactly', () => {
    expect(appendJsonPointer('', 'a~/b')).toBe('/a~0~1b')
    expect(summarizeReceived('😀'.repeat(500), true)).toEqual({
      kind: 'string',
      codePointCount: 129,
    })
    expect(summarizeReceived(['a', 'b'])).toEqual({ kind: 'array', count: 2 })
    expect(summarizeReceived({ a: 1, b: 2 })).toEqual({ kind: 'object', keyCount: 2 })

    const reversed = [...expectedPipelineStages].reverse().map((stage, index) => ({
      stage,
      code: 'PERSISTENCE_FIELD_TYPE_INVALID' as const,
      path: index % 2 === 0 ? '/z' : '/a',
    }))
    const sorted = sortPersistenceDiagnostics(questionModel, reversed)
    expect([...new Set(sorted.map(({ stage }) => stage))]).toEqual(expectedPipelineStages)
    expect(sorted.filter(({ stage }) => stage === 'source').map(({ path }) => path))
      .toEqual(['/z'])

    const exactOrderInput = [
      {
        stage: 'answer-decode',
        code: 'ANSWER_UNKNOWN_OPTION',
        path: '/same',
        questionId: 'archetype',
      },
      {
        stage: 'source',
        code: 'PERSISTENCE_SOURCE_INVALID',
        path: '/z',
      },
      {
        stage: 'source',
        code: 'PERSISTENCE_SOURCE_INVALID',
        path: '/same',
      },
      {
        stage: 'source',
        code: 'PERSISTENCE_ACCESSOR_FORBIDDEN',
        path: '/same',
      },
      {
        stage: 'answer-decode',
        code: 'ANSWER_UNKNOWN_OPTION',
        path: '/same',
        questionId: 'form',
        optionId: 'tsukemen',
      },
      {
        stage: 'answer-decode',
        code: 'ANSWER_UNKNOWN_OPTION',
        path: '/same',
        questionId: 'form',
        optionId: 'soup',
      },
      {
        stage: 'source',
        code: 'PERSISTENCE_ACCESSOR_FORBIDDEN',
        path: '/a',
      },
    ] as const satisfies readonly PersistenceDiagnostic[]
    expect(sortPersistenceDiagnostics(questionModel, exactOrderInput).map(({
      stage,
      path,
      code,
      questionId,
      optionId,
    }) => [stage, path, code, questionId, optionId])).toEqual([
      ['source', '/a', 'PERSISTENCE_ACCESSOR_FORBIDDEN', undefined, undefined],
      ['source', '/same', 'PERSISTENCE_ACCESSOR_FORBIDDEN', undefined, undefined],
      ['source', '/same', 'PERSISTENCE_SOURCE_INVALID', undefined, undefined],
      ['source', '/z', 'PERSISTENCE_SOURCE_INVALID', undefined, undefined],
      ['answer-decode', '/same', 'ANSWER_UNKNOWN_OPTION', 'form', 'soup'],
      ['answer-decode', '/same', 'ANSWER_UNKNOWN_OPTION', 'form', 'tsukemen'],
      ['answer-decode', '/same', 'ANSWER_UNKNOWN_OPTION', 'archetype', undefined],
    ])
  })

  test('requires stable resume targets for incomplete success and none for complete success', () => {
    const incomplete = restoreClassification(questionModel, versioned(currentV1({
      cursorQuestionId: 'archetype',
      submittedAnswers: { form: ['soup'] },
    })))
    expect(incomplete).toMatchObject({
      status: 'restored',
      flowState: { status: 'incomplete' },
      resumeQuestionId: 'archetype',
    })
    if (incomplete.status !== 'restored') return
    expect(incomplete.flowState.reachableQuestionIds).toContain(incomplete.resumeQuestionId)
    expect(incomplete.flowState.interactiveQuestionIds).toContain(incomplete.resumeQuestionId)
    expect(getFirstActionableQuestion(incomplete.flowState)).toBe(incomplete.resumeQuestionId)

    const complete = restoreClassification(questionModel, versioned(currentV1({
      submittedAnswers: completeSoupDraft,
    })))
    expect(complete).toMatchObject({
      status: 'restored',
      flowState: { status: 'complete' },
    })
    expect(complete).not.toHaveProperty('resumeQuestionId')
  })

  test.each([
    ['schema duplicate source', () => migrateSchemaToCurrent(
      schemaRegistry([schemaStep(), schemaStep()]),
      oldSchemaPayload(),
    )],
    ['schema gap', () => migrateSchemaToCurrent(
      schemaRegistry([schemaStep()], 2),
      oldSchemaPayload(),
    )],
    ['schema cycle', () => migrateSchemaToCurrent(schemaRegistry([
      schemaStep(),
      {
        fromSchemaVersion: 1,
        toSchemaVersion: 0,
        migrate: () => ({ ok: false }),
      },
    ], 2), oldSchemaPayload())],
    ['model duplicate source', () => migrateQuestionModelToCurrent(
      modelRegistry([modelStep(), modelStep()]),
      oldModelPayload(),
    )],
    ['model gap', () => migrateQuestionModelToCurrent(
      modelRegistry([modelStep(oldIdentity, middleIdentity)]),
      oldModelPayload(),
    )],
    ['model cycle', () => migrateQuestionModelToCurrent(modelRegistry([
      modelStep(oldIdentity, middleIdentity),
      modelStep(middleIdentity, oldIdentity),
    ]), oldModelPayload())],
  ] as const)('rejects ambiguous migration registry: %s', (_name, run) => {
    expect(run).toThrowError(expect.objectContaining({
      invariantCode: 'PERSISTENCE_MIGRATION_INVARIANT',
    }))
    try {
      run()
    } catch (error) {
      expect(error).toBeInstanceOf(PersistenceInvariantError)
      expect((error as Error).message.length).toBeLessThanOrEqual(300)
    }
  })

  test('keeps DecodeFailure diagnostics deeply frozen and ordered', () => {
    const result = decodeRestoreSource({ kind: 'versioned' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    const failure: DecodeFailure = result
    expect(Object.isFrozen(failure)).toBe(true)
    expect(Object.isFrozen(failure.diagnostics)).toBe(true)
    expect(failure.diagnostics).toEqual([
      expect.objectContaining({ code: 'PERSISTENCE_REQUIRED_FIELD_MISSING' }),
    ])
  })
})
