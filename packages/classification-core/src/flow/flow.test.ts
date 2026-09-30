import { describe, expect, test } from 'vitest'

import { compileClassification } from '../compiler/compile.js'
import { classificationDefinition } from '../definitions/bundle.js'
import {
  canContinue,
  completeAnswers,
  createInitialAnswers,
  firstQuestionId,
  forcedOptionId,
  isLastQuestion,
  nextPosition,
  orderedQuestions,
  previousQuestionId,
  resolveOptionIds,
  selectOption,
  settleFrom,
  type FlowAnswers,
} from '../index.js'

const compiled = compileClassification(
  classificationDefinition,
  'packages/classification-core/src/definitions/bundle.ts',
)
if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
const model = compiled.model

function choose(answers: FlowAnswers, ...picks: [string, string][]) {
  return picks.reduce((current, [question, option]) => (
    selectOption(model, current, question, option)
  ), answers)
}

describe('questionnaire flow', () => {
  test('orders questions by explicit order data and starts with the form', () => {
    expect(orderedQuestions(model).map((question) => question.id)).toEqual([
      'form', 'archetype', 'tare', 'source', 'body', 'noodle', 'signature', 'exclusions',
    ])
    expect(firstQuestionId(model)).toBe('form')
    expect(isLastQuestion(model, 'exclusions')).toBe(true)
    expect(createInitialAnswers(model).exclusions).toEqual(['none'])
  })

  test('offers archetype options by form and restricts later options by archetype', () => {
    const dry = choose(createInitialAnswers(model), ['form', 'dry'])
    expect(resolveOptionIds(model, 'archetype', dry)).toEqual([
      'aburasoba', 'taiwan-mazesoba', 'soupless-tantan', 'dry-other',
    ])
    expect(resolveOptionIds(model, 'archetype', createInitialAnswers(model))).toEqual([])
    const tantan = choose(dry, ['archetype', 'soupless-tantan'])
    expect(resolveOptionIds(model, 'tare', tantan)).toEqual(['spicy-sesame'])
    expect(resolveOptionIds(model, 'source', tantan)).toEqual(['pork', 'vegetable', 'mixed', 'unsure'])
  })

  test('auto-resolves single-option questions and skips them when going back', () => {
    const answers = choose(createInitialAnswers(model), ['form', 'dry'], ['archetype', 'soupless-tantan'])
    expect(forcedOptionId(model, 'tare', answers)).toBe('spicy-sesame')
    expect(forcedOptionId(model, 'source', answers)).toBeUndefined()
    const position = nextPosition(model, answers, 'archetype')!
    expect(position.questionId).toBe('source')
    expect(position.answers.tare).toEqual(['spicy-sesame'])
    expect(previousQuestionId(model, position.answers, 'source')).toBe('archetype')
    expect(nextPosition(model, answers, 'exclusions')).toBeUndefined()
    expect(settleFrom(model, answers, 'form').questionId).toBe('form')
  })

  test('changing form or archetype clears dependent answers but keeps exclusions', () => {
    let answers = choose(
      createInitialAnswers(model),
      ['form', 'soup'],
      ['archetype', 'chintan'],
      ['tare', 'shio'],
      ['source', 'pork'],
      ['exclusions', 'beef'],
    )
    expect(choose(answers, ['archetype', 'chintan'])).toBe(answers)
    answers = choose(answers, ['archetype', 'paitan'])
    expect(answers.tare).toEqual([])
    expect(answers.source).toEqual([])
    expect(answers.exclusions).toEqual(['beef'])
    answers = choose(answers, ['form', 'dry'])
    expect(answers.archetype).toEqual([])
  })

  test('multi-select honors limits, exclusive options and the empty fallback', () => {
    let answers = choose(createInitialAnswers(model), ['form', 'soup'], ['archetype', 'chintan'])
    answers = choose(answers, ['source', 'pork'], ['source', 'chicken'], ['source', 'duck'])
    expect(answers.source).toEqual(['pork', 'chicken'])
    answers = choose(answers, ['source', 'unsure'])
    expect(answers.source).toEqual(['unsure'])
    answers = choose(answers, ['source', 'pork'])
    expect(answers.source).toEqual(['pork'])
    expect(choose(answers, ['exclusions', 'beef']).exclusions).toEqual(['beef'])
    expect(choose(answers, ['exclusions', 'beef'], ['exclusions', 'beef']).exclusions).toEqual(['none'])
    expect(choose(answers, ['exclusions', 'beef'], ['exclusions', 'none']).exclusions).toEqual(['none'])
    expect(selectOption(model, answers, 'source', 'not-offered')).toBe(answers)
  })

  test('continuing requires the minimum number of offered selections', () => {
    const answers = choose(createInitialAnswers(model), ['form', 'soup'])
    expect(canContinue(model, answers, 'form')).toBe(true)
    expect(canContinue(model, answers, 'archetype')).toBe(false)
    expect(canContinue(model, answers, 'unknown-question')).toBe(false)
  })

  test('completes only valid answers and normalizes exclusive combinations', () => {
    const answers = choose(
      createInitialAnswers(model),
      ['form', 'tsukemen'],
      ['archetype', 'miso-rich'],
      ['tare', 'miso'],
      ['source', 'pork'],
      ['body', 'rich'],
      ['noodle', 'extra-thick'],
      ['signature', 'corn-butter'],
    )
    expect(completeAnswers(model, answers)?.exclusions).toEqual(['none'])
    expect(completeAnswers(model, { ...answers, source: [] })).toBeUndefined()
    expect(completeAnswers(model, { ...answers, tare: ['shio'] })).toBeUndefined()
    expect(completeAnswers(model, { ...answers, source: ['pork', 'chicken', 'duck'] })).toBeUndefined()
    expect(completeAnswers(model, { ...answers, source: ['unsure', 'pork'] })?.source).toEqual(['pork'])
    expect(completeAnswers(model, { ...answers, exclusions: [] })?.exclusions).toEqual(['none'])
    expect(completeAnswers(model, { ...answers, archetype: ['chintan'] })).toBeUndefined()
  })

  test('returns immutable answers', () => {
    const answers = choose(createInitialAnswers(model), ['form', 'soup'])
    expect(Object.isFrozen(answers)).toBe(true)
    expect(Object.isFrozen(answers.form)).toBe(true)
  })
})
