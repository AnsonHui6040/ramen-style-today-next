import { describe, expect, test } from 'vitest'
import type { CompiledQuestionModel } from '../contracts/question-model.js'
import { questionModel } from '../generated/question-model.js'
import { evaluateFlow } from './evaluate.js'
import {
  completeDryDraft,
  completeSoupDraft,
  forcedCycleModel,
  genericConditionModel,
  misoRichDraft,
} from './test-fixtures.js'

describe('evaluateFlow', () => {
  test('keeps initial UI selections out of canonical answers', () => {
    const state = evaluateFlow(questionModel, {})
    expect(state.status).toBe('incomplete')
    expect(state.canonicalAnswers).toEqual({})
    expect(state.canonicalAnswers.exclusions).toBeUndefined()
    expect(state.reachableQuestionIds).toEqual(['form', 'exclusions'])
    expect(state.interactiveQuestionIds).toEqual(['form', 'exclusions'])
  })

  test('resolves a forced tare to a fixed point without changing the submitted draft', () => {
    const input = structuredClone(misoRichDraft)
    const state = evaluateFlow(questionModel, input)
    expect(state.canonicalAnswers.tare).toEqual(['miso'])
    expect(state.forcedAnswers).toEqual([{
      questionId: 'tare',
      optionIds: ['miso'],
      reason: 'single-allowed-option',
    }])
    expect(input).toEqual(misoRichDraft)
    expect(Object.prototype.hasOwnProperty.call(input, 'tare')).toBe(false)
  })

  test('repairs branch-stale under-min answers but rejects intrinsic under-min answers', () => {
    const stale = evaluateFlow(questionModel, {
      form: ['dry'],
      archetype: ['aburasoba'],
      source: ['fish-seafood'],
    })
    expect(stale.status).toBe('incomplete')
    expect(stale.canonicalAnswers.source).toBeUndefined()
    expect(stale.repairs).toContainEqual({
      code: 'remove-disallowed-option',
      questionId: 'source',
      previousOptionIds: ['fish-seafood'],
    })

    const intrinsic = evaluateFlow(questionModel, {
      form: ['dry'],
      archetype: ['aburasoba'],
      source: [],
    })
    expect(intrinsic.status).toBe('invalid')
    expect(intrinsic.diagnostics.map(({ code }) => code)).toContain('ANSWER_SELECTION_BOUNDS')
    expect(intrinsic.repairs.map(({ questionId }) => questionId)).not.toContain('source')
  })

  test('keeps a legal remainder after removing deterministic stale options', () => {
    const state = evaluateFlow(questionModel, {
      ...completeDryDraft,
      source: ['fish-seafood', 'pork'],
    })
    expect(state.status).toBe('complete')
    expect(state.canonicalAnswers.source).toEqual(['pork'])
    expect(state.repairs).toContainEqual({
      code: 'remove-disallowed-option',
      questionId: 'source',
      previousOptionIds: ['pork', 'fish-seafood'],
      canonicalOptionIds: ['pork'],
    })
  })

  test('removes valid submitted answers that are unreachable in the current branch', () => {
    const state = evaluateFlow(questionModel, {
      form: ['soup'],
      source: ['pork'],
    })
    expect(state.status).toBe('incomplete')
    expect(state.canonicalAnswers.source).toBeUndefined()
    expect(state.repairs).toContainEqual({
      code: 'remove-unreachable-answer',
      questionId: 'source',
      previousOptionIds: ['pork'],
    })
  })

  test('does not hide invalid unreachable selections behind a repair', () => {
    const state = evaluateFlow(questionModel, {
      form: ['soup'],
      source: [],
    })
    expect(state.status).toBe('invalid')
    expect(state.diagnostics.map(({ code }) => code)).toContain('ANSWER_SELECTION_BOUNDS')
    expect(state.repairs.map(({ questionId }) => questionId)).not.toContain('source')
  })

  test('distinguishes submitted forced matches from repaired forced mismatches', () => {
    const matching = evaluateFlow(questionModel, {
      ...misoRichDraft,
      tare: ['miso'],
    })
    expect(matching.forcedAnswers).toEqual([{
      questionId: 'tare',
      optionIds: ['miso'],
      reason: 'single-allowed-option',
    }])
    expect(matching.repairs.map(({ questionId }) => questionId)).not.toContain('tare')

    const stale = evaluateFlow(questionModel, {
      ...misoRichDraft,
      tare: ['shoyu'],
    })
    expect(stale.canonicalAnswers.tare).toEqual(['miso'])
    expect(stale.repairs).toContainEqual({
      code: 'replace-with-forced-answer',
      questionId: 'tare',
      previousOptionIds: ['shoyu'],
      canonicalOptionIds: ['miso'],
    })
  })

  test('keeps intrinsic forced-question input invalid while deriving the current forced answer', () => {
    const state = evaluateFlow(questionModel, {
      ...misoRichDraft,
      tare: [],
    })
    expect(state.status).toBe('invalid')
    expect(state.diagnostics.map(({ code }) => code)).toContain('ANSWER_SELECTION_BOUNDS')
    expect(state.canonicalAnswers.tare).toEqual(['miso'])
    expect(state.forcedAnswers).toContainEqual({
      questionId: 'tare',
      optionIds: ['miso'],
      reason: 'single-allowed-option',
    })
    expect(state.repairs.map(({ questionId }) => questionId)).not.toContain('tare')
  })

  test.each([
    ['unknown question', { future: ['soup'] }, 'ANSWER_UNKNOWN_QUESTION'],
    ['unknown option', { form: ['future'] }, 'ANSWER_UNKNOWN_OPTION'],
    ['wrong owner', { form: ['chintan'] }, 'ANSWER_WRONG_OWNER'],
    ['duplicate', { form: ['soup', 'soup'] }, 'ANSWER_DUPLICATE_OPTION'],
    ['exclusive conflict', { exclusions: ['pork', 'none'] }, 'ANSWER_EXCLUSIVE_CONFLICT'],
    ['above maximum', {
      form: ['soup'],
      archetype: ['chintan'],
      source: ['pork', 'chicken', 'duck'],
    }, 'ANSWER_SELECTION_BOUNDS'],
  ] as const)('rejects %s data instead of silently repairing it', (_name, draft, code) => {
    const state = evaluateFlow(questionModel, draft)
    expect(state.status).toBe('invalid')
    expect(state.diagnostics.map((item) => item.code)).toContain(code)
  })

  test('rejects invalid primitive shape with escaped decoder diagnostics', () => {
    const state = evaluateFlow(questionModel, { 'bad/key': ['ok', 1] })
    expect(state.status).toBe('invalid')
    expect(state.diagnostics).toContainEqual(expect.objectContaining({
      code: 'ANSWER_DRAFT_INVALID',
      path: '/bad~1key/1',
    }))
    expect(state.canonicalAnswers).toEqual({})
  })

  test('reports an own __proto__ data key as an unknown question', () => {
    const input = Object.defineProperty({}, '__proto__', {
      value: ['future'],
      enumerable: true,
    })
    const state = evaluateFlow(questionModel, input)
    expect(state.status).toBe('invalid')
    expect(state.diagnostics).toContainEqual(expect.objectContaining({
      code: 'ANSWER_UNKNOWN_QUESTION',
      path: '/__proto__',
      entityId: '__proto__',
    }))
    expect(state.canonicalAnswers).toEqual({})
    expect(Object.getPrototypeOf(input)).toBe(Object.prototype)
  })

  test('uses the closed condition AST with arbitrary IDs and no question-specific switches', () => {
    const empty = evaluateFlow(genericConditionModel, {})
    expect(empty.reachableQuestionIds).toEqual(['gate', 'branch'])
    expect(empty.allowedOptionIdsByQuestion).toEqual({
      gate: ['on', 'off'],
      branch: [],
    })

    const forced = evaluateFlow(genericConditionModel, { gate: ['on'] })
    expect(forced.canonicalAnswers).toEqual({ gate: ['on'], branch: ['alpha'] })
    expect(forced.forcedAnswers).toEqual([{
      questionId: 'branch',
      optionIds: ['alpha'],
      reason: 'single-allowed-option',
    }])

    const unreachable = evaluateFlow(genericConditionModel, {
      gate: ['off'],
      branch: ['beta'],
    })
    expect(unreachable.reachableQuestionIds).toEqual(['gate'])
    expect(unreachable.repairs).toContainEqual({
      code: 'remove-unreachable-answer',
      questionId: 'branch',
      previousOptionIds: ['beta'],
    })
  })

  test('returns a stable forced-cycle diagnostic for a repeated canonical state key', () => {
    const state = evaluateFlow(forcedCycleModel, {})
    expect(state.status).toBe('invalid')
    expect(state.diagnostics.map(({ code }) => code)).toContain('FLOW_FORCED_CYCLE')
  })

  test('uses the compiled upper bound when forced resolution cannot settle in time', () => {
    const bounded = {
      ...genericConditionModel,
      forcedIterationUpperBound: 1,
    } satisfies CompiledQuestionModel
    const state = evaluateFlow(bounded, { gate: ['on'] })
    expect(state.status).toBe('invalid')
    expect(state.diagnostics.map(({ code }) => code)).toContain('FLOW_FORCED_NON_IDEMPOTENT')
  })

  test('canonicalizes question and option order independently of input key order', () => {
    const first = evaluateFlow(questionModel, {
      exclusions: ['beef', 'pork'],
      source: ['chicken', 'pork'],
      archetype: ['chintan'],
      form: ['soup'],
    })
    const second = evaluateFlow(questionModel, {
      form: ['soup'],
      archetype: ['chintan'],
      source: ['pork', 'chicken'],
      exclusions: ['pork', 'beef'],
    })
    expect(first.canonicalAnswers).toEqual({
      form: ['soup'],
      archetype: ['chintan'],
      source: ['pork', 'chicken'],
      exclusions: ['pork', 'beef'],
    })
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  test('creates completedAnswers only for complete canonical flow state', () => {
    const incomplete = evaluateFlow(questionModel, { form: ['soup'] })
    expect(incomplete.status).toBe('incomplete')
    expect(Object.prototype.hasOwnProperty.call(incomplete, 'completedAnswers')).toBe(false)

    const complete = evaluateFlow(questionModel, completeSoupDraft)
    expect(complete.status).toBe('complete')
    if (complete.status !== 'complete') return
    expect(complete.completedAnswers).toEqual(complete.canonicalAnswers)
    expect(complete.completedAnswers).toBe(complete.canonicalAnswers)
  })

  test('deeply freezes every returned state view and remains deterministic', () => {
    const state = evaluateFlow(questionModel, completeSoupDraft)
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.canonicalAnswers)).toBe(true)
    expect(Object.isFrozen(state.canonicalAnswers.form)).toBe(true)
    expect(Object.isFrozen(state.reachableQuestionIds)).toBe(true)
    expect(Object.isFrozen(state.allowedOptionIdsByQuestion)).toBe(true)
    expect(Object.isFrozen(state.allowedOptionIdsByQuestion.form)).toBe(true)
    expect(Object.isFrozen(state.forcedAnswers)).toBe(true)
    expect(Object.isFrozen(state.repairs)).toBe(true)
    expect(Object.isFrozen(state.diagnostics)).toBe(true)
    expect(() => Object.assign(state.canonicalAnswers, { form: ['dry'] })).toThrow()
    expect(JSON.stringify(evaluateFlow(questionModel, completeSoupDraft))).toBe(
      JSON.stringify(evaluateFlow(questionModel, structuredClone(completeSoupDraft))),
    )
  })
})
