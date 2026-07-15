import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { questionModel } from '../generated/question-model.js'
import { diagnosticCodes } from '../contracts/diagnostic-codes.js'
import type {
  AppliedMigration,
  ClassificationRestoreSource,
  CreateStoredPayloadResult,
  PersistenceDiagnostic,
  PersistenceDiagnosticCode,
  PersistencePipelineStage,
  PersistenceRepair,
  RestoreChange,
  RestoreResult,
  StoredClassificationPayloadV1,
} from './contracts.js'
import {
  appendJsonPointer,
  escapeJsonPointerToken,
  persistenceDiagnosticCodes,
  persistencePipelineStages,
  sortPersistenceDiagnostics,
  summarizeReceived,
} from './diagnostics.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { persistenceLimits } from './limits.js'

function observeCodePointIteration<T>(operation: () => T): {
  readonly result: T
  readonly codePointsRead: number
} {
  const originalIterator = String.prototype[Symbol.iterator]
  let codePointsRead = 0
  const iteratorSpy = vi.spyOn(String.prototype, Symbol.iterator)

  iteratorSpy.mockImplementation(function (this: string) {
    const iterator = originalIterator.call(this)
    const next = iterator.next.bind(iterator)

    iterator.next = () => {
      const step = next()
      if (!step.done) codePointsRead += 1
      return step
    }

    return iterator
  })

  try {
    return { result: operation(), codePointsRead }
  } finally {
    iteratorSpy.mockRestore()
  }
}

describe('persistence contracts', () => {
  test('defines the approved resource limits', () => {
    expect(persistenceLimits).toEqual({
      maxDepth: 4,
      maxQuestionEntries: 64,
      maxSelectionsPerQuestion: 64,
      maxTotalSelections: 512,
      maxIdCodePoints: 128,
      maxModelVersionCodePoints: 128,
    })
    expect(Object.isFrozen(persistenceLimits)).toBe(true)
  })

  test('appends the exact persistence diagnostic codes without changing answer codes', () => {
    expect(persistenceDiagnosticCodes).toEqual([
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
    ])
    expect(diagnosticCodes.slice(-persistenceDiagnosticCodes.length)).toEqual(
      persistenceDiagnosticCodes,
    )
    expect(diagnosticCodes.filter((code) => code.startsWith('ANSWER_'))).toEqual([
      'ANSWER_DRAFT_INVALID',
      'ANSWER_UNKNOWN_QUESTION',
      'ANSWER_UNKNOWN_OPTION',
      'ANSWER_WRONG_OWNER',
      'ANSWER_DUPLICATE_OPTION',
      'ANSWER_OPTION_DISALLOWED',
      'ANSWER_SELECTION_BOUNDS',
      'ANSWER_EXCLUSIVE_CONFLICT',
      'ANSWER_QUESTION_NOT_INTERACTIVE',
    ])
  })

  test('defines the exact persistence pipeline order', () => {
    expect(persistencePipelineStages).toEqual([
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
    ])
    expect(Object.isFrozen(persistencePipelineStages)).toBe(true)
  })

  test('exposes the approved public discriminated unions', () => {
    expectTypeOf<ClassificationRestoreSource['kind']>().toEqualTypeOf<
      'legacy-unversioned' | 'versioned'
    >()
    expectTypeOf<StoredClassificationPayloadV1['schemaVersion']>().toEqualTypeOf<1>()
    expectTypeOf<RestoreResult['status']>().toEqualTypeOf<
      'restored' | 'restored-with-changes' | 'unsupported' | 'invalid'
    >()
    expectTypeOf<Extract<RestoreResult, { status: 'unsupported' }>['reason']>()
      .toEqualTypeOf<
        | 'unsupported-source'
        | 'unsupported-schema-version'
        | 'unsupported-question-model'
        | 'question-model-integrity-error'
      >()
    expectTypeOf<RestoreChange['kind']>().toEqualTypeOf<'migration' | 'repair'>()
    expectTypeOf<AppliedMigration['kind']>().toEqualTypeOf<
      'legacy-lineage' | 'schema' | 'question-model'
    >()
    expectTypeOf<PersistenceRepair['code']>().toEqualTypeOf<
      | 'remove-unreachable-answer'
      | 'remove-disallowed-option'
      | 'remove-stale-under-min-answer'
      | 'remove-submitted-forced-answer'
      | 'canonicalize-answer-order'
      | 'drop-unknown-cursor'
      | 'normalize-cursor'
    >()
    expectTypeOf<CreateStoredPayloadResult['status']>().toEqualTypeOf<
      'created' | 'invalid-submitted-state'
    >()
    expectTypeOf<PersistenceDiagnostic['stage']>().toEqualTypeOf<PersistencePipelineStage>()
    expectTypeOf<Extract<PersistenceDiagnosticCode, `PERSISTENCE_${string}`>>()
      .toEqualTypeOf<PersistenceDiagnosticCode>()
  })

  test('builds canonical RFC 6901 pointers', () => {
    expect(escapeJsonPointerToken('a~/b')).toBe('a~0~1b')
    expect(appendJsonPointer('', 'submittedAnswers')).toBe('/submittedAnswers')
    expect(appendJsonPointer('/submittedAnswers', 'a~/b')).toBe(
      '/submittedAnswers/a~0~1b',
    )
    expect(appendJsonPointer('/submittedAnswers/source', 12)).toBe(
      '/submittedAnswers/source/12',
    )
  })

  test('summarizes received values without exposing arbitrary strings', () => {
    const stringSummary = summarizeReceived('private payload 🍜')
    expect(stringSummary).toEqual({ kind: 'string', codePointCount: 17 })
    expect(stringSummary).not.toHaveProperty('stableId')
    expect(summarizeReceived('form', true)).toEqual({
      kind: 'string',
      codePointCount: 4,
      stableId: 'form',
    })
    expect(summarizeReceived('Private payload', true)).toEqual({
      kind: 'string',
      codePointCount: 15,
    })
    expect(summarizeReceived('🍜'.repeat(129), true)).toEqual({
      kind: 'string',
      codePointCount: 129,
    })
    expect(summarizeReceived([1, 2])).toEqual({ kind: 'array', count: 2 })
    expect(summarizeReceived({ a: 1, b: 2 })).toEqual({
      kind: 'object',
      keyCount: 2,
    })
    expect(summarizeReceived(null)).toEqual({ kind: 'null' })
    expect(summarizeReceived(Symbol('secret'))).toEqual({ kind: 'symbol' })
    expect(Object.isFrozen(stringSummary)).toBe(true)
  })

  test.each([
    ['BMP', 'a'.repeat(100_000)],
    ['astral', '🍜'.repeat(100_000)],
  ])('bounds %s string summaries without traversing the complete input', (_kind, value) => {
    const { result, codePointsRead } = observeCodePointIteration(() => (
      summarizeReceived(value, true)
    ))

    expect(result).toEqual({
      kind: 'string',
      codePointCount: persistenceLimits.maxIdCodePoints + 1,
    })
    expect(result).not.toHaveProperty('stableId')
    expect(codePointsRead).toBe(persistenceLimits.maxIdCodePoints + 1)
  })

  test('sorts diagnostics by the approved deterministic order', () => {
    const diagnostics = [
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

    const sorted = sortPersistenceDiagnostics(questionModel, diagnostics)

    expect(sorted.map(({ stage, path, questionId, optionId }) => (
      [stage, path, questionId, optionId]
    ))).toEqual([
      ['source', '/a', undefined, undefined],
      ['source', '/z', undefined, undefined],
      ['answer-decode', '/same', 'form', 'soup'],
      ['answer-decode', '/same', 'form', 'tsukemen'],
      ['answer-decode', '/same', 'archetype', undefined],
    ])
    expect(Object.isFrozen(sorted)).toBe(true)
    expect(diagnostics[0]?.questionId).toBe('archetype')
  })

  test('bounds internal invariant errors by Unicode code point', () => {
    const { result: error, codePointsRead } = observeCodePointIteration(() => (
      new PersistenceInvariantError(
        'PERSISTENCE_MODEL_ARTIFACT_INVALID',
        '🍜'.repeat(100_000),
      )
    ))

    expect(error.name).toBe('PersistenceInvariantError')
    expect(error.invariantCode).toBe('PERSISTENCE_MODEL_ARTIFACT_INVALID')
    expect(error.message).toBe('🍜'.repeat(300))
    expect(codePointsRead).toBe(300)
  })
})
