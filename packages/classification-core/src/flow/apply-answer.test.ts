import { describe, expect, test } from 'vitest'
import type { DiagnosticCode } from '../contracts/diagnostic-codes.js'
import type {
  CompiledQuestion,
  CompiledQuestionModel,
} from '../contracts/question-model.js'
import { questionModel } from '../generated/question-model.js'
import { applyAnswer } from './apply-answer.js'
import type { AnswerDraft, AnswerSubmission } from './types.js'
import {
  chintanDraft,
  completeDryDraft,
  completeSoupDraft,
  misoRichDraft,
} from './test-fixtures.js'

const rejectionCases: readonly (
  readonly [string, AnswerDraft, AnswerSubmission, DiagnosticCode]
)[] = [
  [
    'unknown question',
    chintanDraft,
    { questionId: 'missing', optionIds: ['soup'] } as unknown as AnswerSubmission,
    'ANSWER_UNKNOWN_QUESTION',
  ],
  [
    'unreachable question',
    {},
    { questionId: 'archetype', optionIds: ['chintan'] },
    'ANSWER_QUESTION_NOT_INTERACTIVE',
  ],
  [
    'currently forced question',
    misoRichDraft,
    { questionId: 'tare', optionIds: ['miso'] },
    'ANSWER_QUESTION_NOT_INTERACTIVE',
  ],
  [
    'unknown option',
    chintanDraft,
    { questionId: 'source', optionIds: ['future'] } as unknown as AnswerSubmission,
    'ANSWER_UNKNOWN_OPTION',
  ],
  [
    'wrong option owner',
    chintanDraft,
    { questionId: 'source', optionIds: ['shoyu'] },
    'ANSWER_WRONG_OWNER',
  ],
  [
    'currently disallowed option',
    completeDryDraft,
    { questionId: 'source', optionIds: ['fish-seafood'] },
    'ANSWER_OPTION_DISALLOWED',
  ],
  [
    'duplicate option',
    chintanDraft,
    { questionId: 'source', optionIds: ['pork', 'pork'] },
    'ANSWER_DUPLICATE_OPTION',
  ],
  [
    'exclusive conflict',
    chintanDraft,
    { questionId: 'source', optionIds: ['unsure', 'pork'] },
    'ANSWER_EXCLUSIVE_CONFLICT',
  ],
  [
    'selection outside effective bounds',
    chintanDraft,
    { questionId: 'source', optionIds: ['pork', 'chicken', 'duck'] },
    'ANSWER_SELECTION_BOUNDS',
  ],
]

function replaceQuestion(
  model: CompiledQuestionModel,
  questionId: string,
  replace: (question: CompiledQuestion) => CompiledQuestion,
): CompiledQuestionModel {
  return {
    ...model,
    questions: model.questions.map((question) => (
      question.id === questionId ? replace(question) : question
    )),
  }
}

const forcedReplacementModel = replaceQuestion(questionModel, 'tare', (question) => ({
  ...question,
  allowedOptions: [
    {
      when: { type: 'answer-includes', questionId: 'archetype', optionId: 'chintan' },
      selection: { type: 'only', optionIds: ['shoyu'] },
    },
    {
      when: {
        type: 'not',
        condition: { type: 'answer-includes', questionId: 'archetype', optionId: 'chintan' },
      },
      selection: { type: 'only', optionIds: ['shio'] },
    },
  ],
  autoAnswer: { type: 'single-allowed-option' },
}))

const effectiveBoundsModel = replaceQuestion(questionModel, 'source', (question) => ({
  ...question,
  selection: {
    ...question.selection,
    overrides: [{
      when: { type: 'answer-includes', questionId: 'archetype', optionId: 'chintan' },
      min: 1,
      max: 1,
    }],
  },
}))

describe('applyAnswer', () => {
  test.each(rejectionCases)('rejects %s atomically', (_name, draft, submission, code) => {
    const snapshot = structuredClone(draft)
    const result = applyAnswer(questionModel, draft, submission)

    expect(result.accepted).toBe(false)
    expect(result.draft).toBe(draft)
    expect(result.draft).toEqual(snapshot)
    expect(Object.isFrozen(result)).toBe(true)
    if (result.accepted) return
    expect(result.state).toBeDefined()
    expect(result.diagnostics.map((item) => item.code)).toContain(code)
    expect(Object.isFrozen(result.diagnostics)).toBe(true)
  })

  test('validates a replacement against the current effective bounds', () => {
    const draft = structuredClone(chintanDraft)
    const result = applyAnswer(effectiveBoundsModel, draft, {
      questionId: 'source',
      optionIds: ['pork', 'chicken'],
    })

    expect(result.accepted).toBe(false)
    expect(result.draft).toBe(draft)
    if (result.accepted) return
    expect(result.diagnostics.map(({ code }) => code)).toEqual(['ANSWER_SELECTION_BOUNDS'])
  })

  test('rejects an invalid previous state before applying a valid submission', () => {
    const draft = {
      ...chintanDraft,
      source: ['future'],
    } as unknown as AnswerDraft
    const result = applyAnswer(questionModel, draft, {
      questionId: 'form',
      optionIds: ['dry'],
    })

    expect(result.accepted).toBe(false)
    expect(result.draft).toBe(draft)
    expect(result.state.status).toBe('invalid')
    if (result.accepted) return
    expect(result.diagnostics).toBe(result.state.diagnostics)
    expect(result.diagnostics.map(({ code }) => code)).toContain('ANSWER_UNKNOWN_OPTION')
    expect(result.draft.source).toEqual(['future'])
  })

  test('does not invalidate descendants for an actual multi-option canonical no-op', () => {
    const draft = {
      ...completeSoupDraft,
      source: ['pork', 'chicken'],
    } as const
    const result = applyAnswer(questionModel, draft, {
      questionId: 'source',
      optionIds: ['chicken', 'pork'],
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.changed).toBe(false)
    expect(result.invalidatedQuestionIds).toEqual([])
    expect(result.forcedChanges).toEqual([])
    expect(result.draft).toBe(draft)
    expect(result.state.status).toBe('complete')
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.invalidatedQuestionIds)).toBe(true)
    expect(Object.isFrozen(result.forcedChanges)).toBe(true)
  })

  test('changing form clears only its compiled dependent closure', () => {
    const original = structuredClone(completeSoupDraft)
    const exclusions = original.exclusions
    const result = applyAnswer(questionModel, original, {
      questionId: 'form',
      optionIds: ['dry'],
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.changed).toBe(true)
    expect(result.invalidatedQuestionIds).toEqual([
      'archetype',
      'tare',
      'source',
      'body',
      'noodle',
      'signature',
    ])
    expect(result.draft).not.toBe(original)
    expect(result.draft.form).toEqual(['dry'])
    expect(result.draft.exclusions).toBe(exclusions)
    for (const questionId of result.invalidatedQuestionIds) {
      expect(Object.prototype.hasOwnProperty.call(result.draft, questionId)).toBe(false)
    }
    expect(original).toEqual(completeSoupDraft)
    expect(Object.isFrozen(result.draft)).toBe(true)
    expect(Object.isFrozen(result.draft.form)).toBe(true)
    expect(Object.isFrozen(result.draft.exclusions)).toBe(true)
  })

  test('preserves unrelated submitted data instead of substituting evaluator repairs', () => {
    const source = ['fish-seafood', 'pork'] as const
    const draft = {
      ...completeDryDraft,
      source,
    }
    const result = applyAnswer(questionModel, draft, {
      questionId: 'noodle',
      optionIds: ['medium-thin-straight'],
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.draft.source).toBe(source)
    expect(result.state.repairs).toContainEqual({
      code: 'remove-disallowed-option',
      questionId: 'source',
      previousOptionIds: ['pork', 'fish-seafood'],
      canonicalOptionIds: ['pork'],
    })
  })

  test('reports an added forced answer from the evaluated state', () => {
    const result = applyAnswer(questionModel, {
      form: ['tsukemen'],
      archetype: ['tsukemen-other'],
    }, {
      questionId: 'archetype',
      optionIds: ['miso-rich'],
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.forcedChanges).toEqual([{
      questionId: 'tare',
      nextOptionIds: ['miso'],
      reason: 'single-allowed-option',
    }])
  })

  test('reports a removed forced answer without treating a repaired submission as forced', () => {
    const result = applyAnswer(questionModel, {
      ...misoRichDraft,
      tare: ['shoyu'],
    }, {
      questionId: 'archetype',
      optionIds: ['tsukemen-other'],
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.forcedChanges).toEqual([{
      questionId: 'tare',
      previousOptionIds: ['miso'],
      reason: 'single-allowed-option',
    }])
  })

  test('reports a replaced forced answer in compiled question order', () => {
    const result = applyAnswer(forcedReplacementModel, {
      form: ['soup'],
      archetype: ['chintan'],
    }, {
      questionId: 'archetype',
      optionIds: ['paitan'],
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.forcedChanges).toEqual([{
      questionId: 'tare',
      previousOptionIds: ['shoyu'],
      nextOptionIds: ['shio'],
      reason: 'single-allowed-option',
    }])
    expect(Object.isFrozen(result.forcedChanges[0])).toBe(true)
    expect(Object.isFrozen(result.forcedChanges[0]?.previousOptionIds)).toBe(true)
    expect(Object.isFrozen(result.forcedChanges[0]?.nextOptionIds)).toBe(true)
  })
})
