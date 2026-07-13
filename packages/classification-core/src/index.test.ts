import { describe, expect, expectTypeOf, test } from 'vitest'

import * as runtime from './index.js'
import {
  applyAnswer,
  decodeAnswerDraft,
  evaluateFlow,
  getFirstActionableQuestion,
  getNextInteractiveQuestion,
  getPreviousInteractiveQuestion,
  questionModel,
  updatePendingSelection,
  type CompiledQuestionModel,
} from './index.js'

describe('classification-core runtime package', () => {
  test('exports the exact frozen runtime surface without compiler APIs', () => {
    expect(Object.keys(runtime).sort()).toEqual([
      'applyAnswer',
      'decodeAnswerDraft',
      'evaluateFlow',
      'getFirstActionableQuestion',
      'getNextInteractiveQuestion',
      'getPreviousInteractiveQuestion',
      'questionModel',
      'updatePendingSelection',
    ])
    expectTypeOf(questionModel).toMatchTypeOf<CompiledQuestionModel>()
    expect(Object.isFrozen(questionModel)).toBe(true)
    expect(Object.isFrozen(questionModel.questions)).toBe(true)
    expect(Object.isFrozen(questionModel.questions[0])).toBe(true)
    expect(Object.isFrozen(questionModel.questions[0]!.options)).toBe(true)
    expect(Object.isFrozen(questionModel.questions[0]!.options[0])).toBe(true)
    expect('compileQuestions' in runtime).toBe(false)
    expect('questionDefinitions' in runtime).toBe(false)
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
