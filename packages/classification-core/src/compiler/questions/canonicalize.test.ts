import { describe, expect, test } from 'vitest'

import type {
  QuestionDefinitionSource,
  SerializableCondition,
} from '../../contracts/question-model.js'
import { questionDefinitions } from '../../definitions/questions.js'
import { stableJson } from '../stable-json.js'
import { canonicalizeQuestionSource } from './canonicalize.js'

function withCommutativeCondition(
  definitions: readonly QuestionDefinitionSource[],
  conditions: readonly SerializableCondition[],
) {
  return definitions.map((question) => question.id === 'archetype'
    ? {
        ...question,
        availableWhen: { type: 'all' as const, conditions },
      }
    : question)
}

describe('question source canonicalization', () => {
  test('canonicalizes source order and commutative conditions', () => {
    const conditions = [
      { type: 'answered', questionId: 'form' },
      {
        type: 'not',
        condition: { type: 'answer-includes', questionId: 'form', optionId: 'dry' },
      },
    ] as const satisfies readonly SerializableCondition[]
    const left = canonicalizeQuestionSource(
      withCommutativeCondition(questionDefinitions, conditions),
    )
    const right = canonicalizeQuestionSource(
      withCommutativeCondition(
        [...questionDefinitions].reverse().map((question) => ({
          ...question,
          options: [...question.options].reverse(),
        })),
        [...conditions].reverse(),
      ),
    )

    expect(stableJson(left)).toBe(stableJson(right))
  })

  test('uses numeric order then code-point ID and owner option order', () => {
    const definitions: readonly QuestionDefinitionSource[] = questionDefinitions.map((question) => (
      question.id === 'archetype'
        ? {
            ...question,
            allowedOptions: question.allowedOptions.map((row) => (
              row.when.type === 'answer-includes'
                && row.when.optionId === 'dry'
                && row.selection.type === 'only'
                ? {
                    ...row,
                    selection: {
                      ...row.selection,
                      optionIds: [...row.selection.optionIds].reverse(),
                    },
                  }
                : row
            )),
          }
        : question
    ))

    const codePointTieDefinitions = [
      { ...definitions[0]!, id: 'é', order: 10 },
      { ...definitions[0]!, id: '𐀀', order: 10 },
      { ...definitions[0]!, id: 'z', order: 10 },
      ...definitions.slice(1),
    ]
    const canonical = canonicalizeQuestionSource(codePointTieDefinitions)
    const canonicalArchetype = canonical.find(({ id }) => id === 'archetype')!
    const canonicalDryRow = canonicalArchetype.allowedOptions.find(({ when }) => (
      when.type === 'answer-includes' && when.optionId === 'dry'
    ))

    expect(canonical.filter(({ order }) => order === 10).map(({ id }) => id)).toEqual([
      'z',
      'é',
      '𐀀',
    ])
    expect(canonicalDryRow?.selection).toEqual({
      type: 'only',
      optionIds: ['aburasoba', 'taiwan-mazesoba', 'soupless-tantan', 'dry-other'],
    })
  })

  test('materializes missing arrays and defaults without mutating source', () => {
    const source: readonly QuestionDefinitionSource[] = structuredClone(questionDefinitions)
    const before = structuredClone(source)

    const canonical = canonicalizeQuestionSource(source)
    const form = canonical.find(({ id }) => id === 'form')!

    expect(source).toEqual(before)
    expect(form.selection.overrides).toEqual([])
    expect(form.allowedOptions).toEqual([])
    expect(form.initialUiOptionIds).toEqual([])
    expect(form.pendingSelection).toEqual({
      emptyBehavior: { type: 'allow-empty' },
    })
    expect(form.options.every(({ exclusive }) => exclusive === false)).toBe(true)
  })
})
