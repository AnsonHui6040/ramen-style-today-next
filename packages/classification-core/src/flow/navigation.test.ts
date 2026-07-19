import { describe, expect, test } from 'vitest'

import { questionModel } from '../generated/question-model.js'
import { evaluateFlow } from './evaluate.js'
import {
  getFirstActionableQuestion,
  getNextInteractiveQuestion,
  getPreviousInteractiveQuestion,
} from './navigation.js'
import {
  chintanDraft,
  completeSoupDraft,
  misoRichDraft,
} from './test-fixtures.js'
import type { FlowState, QuestionId } from './types.js'

function expectNoNavigation(state: FlowState) {
  expect(getFirstActionableQuestion(state)).toBeUndefined()
  expect(getNextInteractiveQuestion(state, 'form')).toBeUndefined()
  expect(getPreviousInteractiveQuestion(state, 'exclusions')).toBeUndefined()
}

describe('stable-ID navigation', () => {
  test('returns the first unanswered interactive question in compiled display order', () => {
    const state = evaluateFlow(questionModel, chintanDraft)

    expect(getFirstActionableQuestion(state)).toBe('tare')
    expect(getFirstActionableQuestion(evaluateFlow(questionModel, {
      ...misoRichDraft,
      source: ['pork'],
    }))).toBe('body')
  })

  test('uses compiled order even when interactive IDs arrive in another order', () => {
    const evaluated = evaluateFlow(questionModel, chintanDraft)
    const state = {
      ...evaluated,
      interactiveQuestionIds: [...evaluated.interactiveQuestionIds].reverse(),
    } as FlowState

    expect(getFirstActionableQuestion(state)).toBe('tare')
    expect(getNextInteractiveQuestion(state, 'archetype')).toBe('tare')
    expect(getPreviousInteractiveQuestion(state, 'source')).toBe('tare')
  })

  test('navigates from a known forced question by compiled position', () => {
    const state = evaluateFlow(questionModel, misoRichDraft)

    expect(getNextInteractiveQuestion(state, 'tare')).toBe('source')
    expect(getPreviousInteractiveQuestion(state, 'tare')).toBe('archetype')
  })

  test('scans from known unreachable and noninteractive positions', () => {
    const initial = evaluateFlow(questionModel, {})
    const miso = evaluateFlow(questionModel, misoRichDraft)

    expect(getNextInteractiveQuestion(initial, 'archetype')).toBe('exclusions')
    expect(getPreviousInteractiveQuestion(initial, 'source')).toBe('form')
    expect(getNextInteractiveQuestion(miso, 'form')).toBe('archetype')
  })

  test('returns undefined at the first and last compiled positions', () => {
    const state = evaluateFlow(questionModel, chintanDraft)

    expect(getPreviousInteractiveQuestion(state, 'form')).toBeUndefined()
    expect(getNextInteractiveQuestion(state, 'exclusions')).toBeUndefined()
  })

  test('has no cursor and does not mutate the caller state', () => {
    const state = structuredClone(evaluateFlow(questionModel, misoRichDraft)) as FlowState
    const snapshot = structuredClone(state)

    expect(getNextInteractiveQuestion(state, 'tare')).toBe('source')
    expect(getNextInteractiveQuestion(state, 'tare')).toBe('source')
    expect(getPreviousInteractiveQuestion(state, 'tare')).toBe('archetype')
    expect(state).toEqual(snapshot)
    expect(Object.isFrozen(state)).toBe(false)
  })

  test('returns undefined for complete and invalid states', () => {
    expectNoNavigation(evaluateFlow(questionModel, completeSoupDraft))
    expectNoNavigation(evaluateFlow(questionModel, {
      ...completeSoupDraft,
      source: ['future'],
    }))
  })

  test('throws the exact defensive-boundary error for an unknown runtime ID', () => {
    const state = evaluateFlow(questionModel, chintanDraft)
    const unknown = 'future' as QuestionId

    expect(() => getNextInteractiveQuestion(state, unknown)).toThrowError(
      'Unknown question ID future',
    )
    expect(() => getPreviousInteractiveQuestion(state, unknown)).toThrowError(
      'Unknown question ID future',
    )
  })
})
