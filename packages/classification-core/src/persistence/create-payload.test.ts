import { describe, expect, test } from 'vitest'
import type { CompiledQuestionModel } from '../contracts/question-model.js'
import { evaluateFlow } from '../flow/evaluate.js'
import {
  chintanDraft,
  completeSoupDraft,
  misoRichDraft,
} from '../flow/test-fixtures.js'
import type { AnswerDraft, QuestionId } from '../flow/types.js'
import { createStoredClassificationPayloadV1 } from './create-payload.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { questionModel } from './test-fixtures.js'

function expectInvalid(
  submittedAnswers: AnswerDraft,
  code: string,
  cursorQuestionId?: QuestionId,
): void {
  const result = createStoredClassificationPayloadV1(
    questionModel,
    submittedAnswers,
    cursorQuestionId,
  )

  expect(result).toMatchObject({
    status: 'invalid-submitted-state',
    diagnostics: [expect.objectContaining({ code })],
  })
  expect(Object.isFrozen(result)).toBe(true)
  if (result.status !== 'invalid-submitted-state') return
  expect(Object.isFrozen(result.diagnostics)).toBe(true)
  expect(Object.isFrozen(result.diagnostics[0])).toBe(true)
}

function unorderedDraft(): AnswerDraft {
  return {
    source: ['chicken', 'pork'],
    archetype: ['chintan'],
    form: ['soup'],
  }
}

describe('createStoredClassificationPayloadV1', () => {
  test('builds exact current V1 fields in compiled question and option order', () => {
    const result = createStoredClassificationPayloadV1(
      questionModel,
      unorderedDraft(),
    )

    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    expect(Object.keys(result.payload)).toEqual([
      'schemaVersion',
      'questionModelVersion',
      'questionSemanticHash',
      'submittedAnswers',
    ])
    expect(result.payload).toEqual({
      schemaVersion: 1,
      questionModelVersion: questionModel.metadata.modelVersion,
      questionSemanticHash: questionModel.metadata.semanticHash,
      submittedAnswers: {
        form: ['soup'],
        archetype: ['chintan'],
        source: ['pork', 'chicken'],
      },
    })
    expect(Object.keys(result.payload.submittedAnswers)).toEqual([
      'form',
      'archetype',
      'source',
    ])
  })

  test('accepts an incomplete submitted state without a cursor', () => {
    const result = createStoredClassificationPayloadV1(
      questionModel,
      chintanDraft,
    )

    expect(result).toMatchObject({
      status: 'created',
      payload: { submittedAnswers: chintanDraft },
    })
    if (result.status !== 'created') return
    expect(result.payload).not.toHaveProperty('cursorQuestionId')
  })

  test('accepts only the stable resolved cursor for an incomplete state', () => {
    const result = createStoredClassificationPayloadV1(
      questionModel,
      chintanDraft,
      'tare',
    )

    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    expect(Object.keys(result.payload)).toEqual([
      'schemaVersion',
      'questionModelVersion',
      'questionSemanticHash',
      'cursorQuestionId',
      'submittedAnswers',
    ])
    expect(result.payload.cursorQuestionId).toBe('tare')
  })

  test('builds a complete payload without derived or canonical state', () => {
    const result = createStoredClassificationPayloadV1(
      questionModel,
      completeSoupDraft,
    )

    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    expect(result.payload.submittedAnswers).toEqual(completeSoupDraft)
    expect(result.payload).not.toHaveProperty('cursorQuestionId')
    expect(result.payload).not.toHaveProperty('canonicalAnswers')
    expect(result.payload).not.toHaveProperty('completedAnswers')
    expect(result.payload).not.toHaveProperty('flowState')
    expect(result.payload).not.toHaveProperty('repairs')
  })

  test('rejects a forced answer instead of silently dropping it', () => {
    const submittedAnswers = {
      ...misoRichDraft,
      tare: ['miso'],
    } as AnswerDraft
    const before = structuredClone(submittedAnswers)
    const result = createStoredClassificationPayloadV1(
      questionModel,
      submittedAnswers,
    )

    expect(result).toEqual({
      status: 'invalid-submitted-state',
      diagnostics: [{
        stage: 'payload-build',
        code: 'PERSISTENCE_SUBMITTED_ANSWER_FOR_FORCED_QUESTION',
        path: '/submittedAnswers/tare',
        questionId: 'tare',
      }],
    })
    expect(submittedAnswers).toEqual(before)
  })

  test('rejects canonical answers that contain a derived forced answer', () => {
    const state = evaluateFlow(questionModel, misoRichDraft)

    expectInvalid(
      state.canonicalAnswers,
      'PERSISTENCE_SUBMITTED_ANSWER_FOR_FORCED_QUESTION',
    )
  })

  test.each([
    { archetype: ['chintan'] },
    { form: ['tsukemen'], archetype: ['chintan'] },
  ] as const)('rejects submitted state requiring semantic repair: %j', (input) => {
    expectInvalid(
      input as AnswerDraft,
      'PERSISTENCE_SUBMITTED_STATE_REQUIRES_REPAIR',
    )
  })

  test.each([
    [{ future: ['unknown'] }, 'ANSWER_UNKNOWN_QUESTION'],
    [{ form: ['unknown'] }, 'ANSWER_UNKNOWN_OPTION'],
    [{ form: ['pork'] }, 'ANSWER_WRONG_OWNER'],
    [{ source: ['pork', 'pork'] }, 'ANSWER_DUPLICATE_OPTION'],
    [{ source: ['unsure', 'pork'] }, 'ANSWER_EXCLUSIVE_CONFLICT'],
    [{ form: [] }, 'ANSWER_SELECTION_BOUNDS'],
  ] as const)('preserves intrinsic answer failure for %j', (input, code) => {
    expectInvalid(input as AnswerDraft, code)
  })

  test.each([
    [chintanDraft, 'future-question'],
    [misoRichDraft, 'tare'],
    [{}, 'archetype'],
    [{}, 'exclusions'],
    [completeSoupDraft, 'exclusions'],
    [chintanDraft, 2],
  ] as const)('rejects an invalid cursor %j', (input, cursorQuestionId) => {
    const result = createStoredClassificationPayloadV1(
      questionModel,
      input as AnswerDraft,
      cursorQuestionId as unknown as QuestionId,
    )

    expect(result).toEqual({
      status: 'invalid-submitted-state',
      diagnostics: [{
        stage: 'payload-build',
        code: 'PERSISTENCE_CURSOR_INVALID',
        path: '/cursorQuestionId',
      }],
    })
  })

  test('contains submitted-data reflection failures as a frozen caller failure', () => {
    const privateMessage = 'private submitted proxy trap'
    const submittedAnswers = new Proxy({}, {
      ownKeys() {
        throw new Error(privateMessage)
      },
    }) as AnswerDraft

    const result = createStoredClassificationPayloadV1(
      questionModel,
      submittedAnswers,
    )

    expect(result).toEqual({
      status: 'invalid-submitted-state',
      diagnostics: [{
        stage: 'answer-decode',
        code: 'PERSISTENCE_ENVELOPE_INVALID',
        path: '/submittedAnswers',
      }],
    })
    expect(JSON.stringify(result)).not.toContain(privateMessage)
    expect(Object.isFrozen(result)).toBe(true)
  })

  test('is deterministic, deeply frozen, and does not mutate inputs', () => {
    const input = unorderedDraft()
    const model = structuredClone(questionModel) as CompiledQuestionModel
    const inputBefore = structuredClone(input)
    const modelBefore = structuredClone(model)

    const first = createStoredClassificationPayloadV1(model, input)
    const second = createStoredClassificationPayloadV1(model, input)

    expect(first).toEqual(second)
    expect(input).toEqual(inputBefore)
    expect(model).toEqual(modelBefore)
    expect(Object.isFrozen(first)).toBe(true)
    if (first.status !== 'created') return
    expect(Object.isFrozen(first.payload)).toBe(true)
    expect(Object.isFrozen(first.payload.submittedAnswers)).toBe(true)
    expect(Object.isFrozen(first.payload.submittedAnswers.source)).toBe(true)
  })

  test('rejects a trusted model identity mismatch as a bounded invariant', () => {
    const model = {
      ...structuredClone(questionModel),
      metadata: {
        ...questionModel.metadata,
        semanticHash: 'a'.repeat(64),
      },
    } as CompiledQuestionModel

    expect(() => createStoredClassificationPayloadV1(model, {})).toThrowError(
      expect.objectContaining({
        invariantCode: 'PERSISTENCE_MODEL_ARTIFACT_INVALID',
      }),
    )
  })

  test('contains trusted model reflection failures without exposing trap details', () => {
    const privateMessage = 'private builder model trap'
    const trappedModel = new Proxy(questionModel, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'questions') throw new Error(privateMessage)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    let caught: unknown

    try {
      createStoredClassificationPayloadV1(trappedModel, {})
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(PersistenceInvariantError)
    expect(caught).toMatchObject({
      invariantCode: 'PERSISTENCE_MODEL_ARTIFACT_INVALID',
    })
    expect((caught as Error).message).not.toContain(privateMessage)
    expect((caught as Error).message.length).toBeLessThanOrEqual(300)
  })
})
