import { describe, expect, test } from 'vitest'
import type { CompiledQuestionModel } from '../contracts/question-model.js'
import {
  completeSoupDraft,
  forcedCycleModel,
  misoRichDraft,
} from '../flow/test-fixtures.js'
import type { ClassificationRestoreSource } from './contracts.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { restoreClassification } from './restore.js'
import {
  currentV1,
  questionModel,
  verifiedLegacySourceId,
} from './test-fixtures.js'

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

describe('restoreClassification', () => {
  test('restores current V1 without changes', () => {
    const result = restoreClassification(questionModel, versioned(currentV1()))

    expect(result).toMatchObject({
      status: 'restored',
      submittedAnswers: { form: ['soup'] },
      flowState: { status: 'incomplete' },
      resumeQuestionId: 'archetype',
      migrations: [],
      repairs: [],
      changes: [],
      writeBackRequired: false,
    })
    expect(result).not.toHaveProperty('normalizedPayload')
    expect(Object.isFrozen(result)).toBe(true)
    if (result.status !== 'restored') return
    expect(Object.isFrozen(result.submittedAnswers)).toBe(true)
    expect(Object.isFrozen(result.flowState)).toBe(true)
  })

  test('returns non-empty migration evidence and normalized V1 for legacy state', () => {
    const result = restoreClassification(questionModel, legacy({ form: 'soup' }))

    expect(result.status).toBe('restored-with-changes')
    if (result.status !== 'restored-with-changes') return
    expect(result.migrations).toEqual([{
      kind: 'legacy-lineage',
      fromSourceId: verifiedLegacySourceId,
      toSchemaVersion: 1,
      toQuestionModelVersion: questionModel.metadata.modelVersion,
      toQuestionSemanticHash: questionModel.metadata.semanticHash,
    }])
    expect(result.repairs).toEqual([])
    expect(result.changes).toEqual([{
      kind: 'migration',
      migration: result.migrations[0],
    }])
    expect(result.writeBackRequired).toBe(true)
    expect(result.normalizedPayload).toEqual(currentV1())
    expect(Object.isFrozen(result.normalizedPayload)).toBe(true)
  })

  test.each([
    [
      'unsupported-source',
      {
        kind: 'legacy-unversioned',
        sourceId: 'ramen-style-today@unknown',
        answers: {},
      },
      'PERSISTENCE_SOURCE_UNSUPPORTED',
    ],
    [
      'unsupported-schema-version',
      versioned(currentV1({ schemaVersion: 2 })),
      'PERSISTENCE_SCHEMA_VERSION_UNSUPPORTED',
    ],
    [
      'unsupported-question-model',
      versioned(currentV1({
        questionModelVersion: 'future-model',
        questionSemanticHash: 'a'.repeat(64),
      })),
      'PERSISTENCE_QUESTION_MODEL_UNSUPPORTED',
    ],
    [
      'question-model-integrity-error',
      versioned(currentV1({ questionSemanticHash: 'b'.repeat(64) })),
      'PERSISTENCE_QUESTION_MODEL_INTEGRITY',
    ],
  ] as const)(
    'returns %s for unsupported external data',
    (reason, source, diagnosticCode) => {
      const result = restoreClassification(
        questionModel,
        source as ClassificationRestoreSource,
      )

      expect(result).toEqual({
        status: 'unsupported',
        reason,
        diagnostics: [expect.objectContaining({ code: diagnosticCode })],
      })
      expect(Object.isFrozen(result)).toBe(true)
      if (result.status !== 'unsupported') return
      expect(Object.isFrozen(result.diagnostics)).toBe(true)
    },
  )

  test('does not run model compatibility before schema migration', () => {
    const result = restoreClassification(questionModel, versioned(currentV1({
      schemaVersion: 2,
      questionModelVersion: 'future-model',
      questionSemanticHash: 'a'.repeat(64),
    })))

    expect(result).toMatchObject({
      status: 'unsupported',
      reason: 'unsupported-schema-version',
      diagnostics: [{
        stage: 'schema-migration',
        code: 'PERSISTENCE_SCHEMA_VERSION_UNSUPPORTED',
      }],
    })
  })

  test('returns intrinsic answer errors as invalid with a diagnostic-only subset', () => {
    const input = { future: ['private-option'] }
    const result = restoreClassification(questionModel, versioned(currentV1({
      submittedAnswers: input,
    })))

    expect(result).toEqual({
      status: 'invalid',
      diagnostics: [expect.objectContaining({
        stage: 'answer-decode',
        code: 'ANSWER_UNKNOWN_QUESTION',
      })],
      diagnosticSubmittedSubset: input,
    })
    expect(Object.isFrozen(result)).toBe(true)
    if (result.status !== 'invalid') return
    expect(Object.isFrozen(result.diagnosticSubmittedSubset)).toBe(true)
  })

  test('omits the diagnostic subset when submitted answers are structurally illegal', () => {
    const result = restoreClassification(questionModel, versioned(currentV1({
      submittedAnswers: 'private payload',
    })))

    expect(result).toMatchObject({
      status: 'invalid',
      diagnostics: [{ code: 'ANSWER_DRAFT_INVALID' }],
    })
    expect(result).not.toHaveProperty('diagnosticSubmittedSubset')
  })

  test('rejects a non-string cursor instead of repairing it', () => {
    const result = restoreClassification(questionModel, versioned(currentV1({
      cursorQuestionId: 2,
    })))

    expect(result).toMatchObject({
      status: 'invalid',
      diagnostics: [{
        stage: 'schema-decode',
        code: 'PERSISTENCE_FIELD_TYPE_INVALID',
        path: '/cursorQuestionId',
      }],
    })
    expect(result).not.toHaveProperty('resumeQuestionId')
  })

  test('orders migrations before answer repairs and cursor repairs', () => {
    const result = restoreClassification(questionModel, legacy({
      form: 'tsukemen',
      archetype: 'miso-rich',
      tare: 'miso',
    }))

    expect(result.status).toBe('restored-with-changes')
    if (result.status !== 'restored-with-changes') return
    expect(result.changes.map((change) => (
      change.kind === 'migration' ? change.migration.kind : change.repair.code
    ))).toEqual([
      'legacy-lineage',
      'remove-submitted-forced-answer',
    ])
  })

  test('orders cursor repair after answer repair against the final state', () => {
    const result = restoreClassification(questionModel, versioned(currentV1({
      cursorQuestionId: 'tare',
      submittedAnswers: {
        ...misoRichDraft,
        tare: ['miso'],
      },
    })))

    expect(result.status).toBe('restored-with-changes')
    if (result.status !== 'restored-with-changes') return
    expect(result.repairs.map(({ code }) => code)).toEqual([
      'remove-submitted-forced-answer',
      'normalize-cursor',
    ])
    expect(result.changes.map((change) => (
      change.kind === 'migration' ? change.migration.kind : change.repair.code
    ))).toEqual([
      'remove-submitted-forced-answer',
      'normalize-cursor',
    ])
    expect(result.resumeQuestionId).toBe('source')
    expect(result.normalizedPayload).toEqual(currentV1({
      cursorQuestionId: 'source',
      submittedAnswers: misoRichDraft,
    }))
  })

  test('removes a complete-state cursor without persisting canonical answers', () => {
    const result = restoreClassification(questionModel, versioned(currentV1({
      cursorQuestionId: 'exclusions',
      submittedAnswers: completeSoupDraft,
    })))

    expect(result.status).toBe('restored-with-changes')
    if (result.status !== 'restored-with-changes') return
    expect(result.resumeQuestionId).toBeUndefined()
    expect(result.normalizedPayload).toEqual(currentV1({
      submittedAnswers: completeSoupDraft,
    }))
    expect(result.normalizedPayload).not.toHaveProperty('canonicalAnswers')
  })

  test.each([
    ['legacy migration', legacy({ form: 'soup' })],
    ['answer and cursor repair', versioned(currentV1({
      cursorQuestionId: 'tare',
      submittedAnswers: {
        ...misoRichDraft,
        tare: ['miso'],
      },
    }))],
    ['complete cursor removal', versioned(currentV1({
      cursorQuestionId: 'exclusions',
      submittedAnswers: completeSoupDraft,
    }))],
    ['unknown cursor removal', versioned(currentV1({
      cursorQuestionId: 'future-question',
    }))],
  ] as const)('restores normalized %s output at a fixed point', (_case, source) => {
    const first = restoreClassification(
      questionModel,
      source as ClassificationRestoreSource,
    )

    expect(first.status).toBe('restored-with-changes')
    if (first.status !== 'restored-with-changes') return
    const second = restoreClassification(questionModel, versioned(
      first.normalizedPayload,
    ))

    expect(second).toMatchObject({
      status: 'restored',
      writeBackRequired: false,
      submittedAnswers: first.submittedAnswers,
      flowState: first.flowState,
    })
    if (second.status !== 'restored') return
    expect(second.resumeQuestionId).toBe(first.resumeQuestionId)
  })

  test('contains impossible model/runtime states as invariant exceptions', () => {
    expect(() => restoreClassification(
      forcedCycleModel,
      versioned(currentV1({ submittedAnswers: {} })),
    )).toThrow(PersistenceInvariantError)
  })

  test.each([
    [
      'a different current semantic identity',
      {
        ...structuredClone(questionModel),
        metadata: {
          ...questionModel.metadata,
          semanticHash: 'a'.repeat(64),
        },
      } as CompiledQuestionModel,
    ],
    [
      'missing metadata',
      (() => {
        const model = structuredClone(questionModel) as unknown as {
          metadata?: unknown
        }
        delete model.metadata
        return model as CompiledQuestionModel
      })(),
    ],
  ])('rejects a trusted model with %s before emitting normalized output', (
    _case,
    model,
  ) => {
    let caught: unknown

    try {
      restoreClassification(model, versioned(currentV1({
        cursorQuestionId: 'future-question',
      })))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(PersistenceInvariantError)
    expect(caught).toMatchObject({
      invariantCode: 'PERSISTENCE_MODEL_ARTIFACT_INVALID',
    })
    expect((caught as Error).message.length).toBeLessThanOrEqual(300)
  })

  test('contains trusted model reflection failures without exposing trap details', () => {
    const privateMessage = 'private restore model trap'
    const trappedModel = new Proxy(questionModel, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'questions') throw new Error(privateMessage)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    let caught: unknown

    try {
      restoreClassification(trappedModel, versioned(currentV1()))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(PersistenceInvariantError)
    expect(caught).toMatchObject({
      invariantCode: 'PERSISTENCE_MODEL_ARTIFACT_INVALID',
    })
    expect((caught as Error).message).not.toContain(privateMessage)
  })
})
