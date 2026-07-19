import { describe, expect, test } from 'vitest'

import type { QuestionDefinitionSource } from '../contracts/question-model.js'
import {
  archetypeIds,
  productionQuestionIds,
  questionDefinitions,
} from './questions.js'

const definitions: readonly QuestionDefinitionSource[] = questionDefinitions

const expectedOptions = {
  form: ['soup', 'tsukemen', 'dry'],
  archetype: [
    'chintan',
    'paitan',
    'konbusui-light',
    'gyokai-rich',
    'miso-rich',
    'tsukemen-other',
    'aburasoba',
    'taiwan-mazesoba',
    'soupless-tantan',
    'dry-other',
  ],
  tare: ['shoyu', 'shio', 'miso', 'spicy-sesame', 'none'],
  source: [
    'pork',
    'chicken',
    'duck',
    'beef',
    'fish-seafood',
    'shellfish',
    'shrimp-crab',
    'vegetable',
    'mixed',
    'unsure',
  ],
  body: ['light', 'balanced', 'rich', 'backfat-heavy', 'ultra-heavy'],
  noodle: [
    'thin-straight',
    'medium-thin-straight',
    'medium-thick-straight',
    'medium-thick-wavy',
    'extra-thick',
  ],
  signature: [
    'nori-spinach',
    'corn-butter',
    'bean-sprout-garlic-backfat',
    'fish-kombu',
    'yuzu-citrus',
    'no-preference',
  ],
  exclusions: [
    'pork',
    'chicken',
    'duck',
    'beef',
    'fish-seafood',
    'shellfish',
    'shrimp-crab',
    'dairy',
    'none',
  ],
} as const

const restrictedOptions = {
  'konbusui-light': {
    tare: ['shio', 'shoyu'],
    source: ['fish-seafood', 'shellfish', 'vegetable', 'mixed', 'unsure'],
    body: ['light', 'balanced'],
    noodle: ['medium-thin-straight', 'medium-thick-straight'],
    signature: ['fish-kombu', 'yuzu-citrus', 'no-preference'],
  },
  'gyokai-rich': {
    tare: ['shoyu', 'shio', 'miso'],
    source: ['fish-seafood', 'shellfish', 'mixed', 'unsure'],
    body: ['balanced', 'rich', 'ultra-heavy'],
    noodle: ['medium-thick-straight', 'medium-thick-wavy', 'extra-thick'],
    signature: ['fish-kombu', 'no-preference'],
  },
  'miso-rich': {
    tare: ['miso'],
    source: ['pork', 'chicken', 'fish-seafood', 'vegetable', 'mixed', 'unsure'],
    body: ['balanced', 'rich', 'ultra-heavy'],
    noodle: ['medium-thick-straight', 'medium-thick-wavy', 'extra-thick'],
    signature: ['corn-butter', 'fish-kombu', 'no-preference'],
  },
  aburasoba: {
    tare: ['shoyu', 'none'],
    source: ['pork', 'mixed', 'unsure'],
    body: ['light', 'balanced', 'rich'],
    noodle: ['medium-thin-straight', 'medium-thick-straight', 'extra-thick'],
    signature: ['no-preference', 'bean-sprout-garlic-backfat', 'fish-kombu'],
  },
  'taiwan-mazesoba': {
    tare: ['spicy-sesame', 'shoyu', 'none'],
    source: ['pork', 'mixed', 'unsure'],
    body: ['balanced', 'rich', 'ultra-heavy'],
    noodle: ['medium-thick-straight', 'extra-thick'],
    signature: ['fish-kombu', 'bean-sprout-garlic-backfat', 'no-preference'],
  },
  'soupless-tantan': {
    tare: ['spicy-sesame'],
    source: ['pork', 'vegetable', 'mixed', 'unsure'],
    body: ['balanced', 'rich', 'ultra-heavy'],
    noodle: ['medium-thick-straight', 'extra-thick'],
    signature: ['no-preference', 'bean-sprout-garlic-backfat'],
  },
} as const

describe('production questions', () => {
  test('locks the legacy question order and weights', () => {
    expect(productionQuestionIds).toEqual([
      'form',
      'archetype',
      'tare',
      'source',
      'body',
      'noodle',
      'signature',
      'exclusions',
    ])
    expect(definitions.map(({ id, order, weight }) => [id, order, weight])).toEqual([
      ['form', 0, 16],
      ['archetype', 1, 16],
      ['tare', 2, 15],
      ['source', 3, 18],
      ['body', 4, 14],
      ['noodle', 5, 11],
      ['signature', 6, 10],
      ['exclusions', 7, 0],
    ])
  })

  test('locks all 53 question-scoped legacy option values in display order', () => {
    expect(Object.fromEntries(definitions.map((question) => [
      question.id,
      question.options.map(({ id }) => id),
    ]))).toEqual(expectedOptions)
    expect(definitions.flatMap(({ options }) => options)).toHaveLength(53)
  })

  test('locks selection bounds and exclusive-option behavior', () => {
    expect(definitions.map(({ id, selection }) => [id, selection])).toEqual([
      ['form', { type: 'single', min: 1, max: 1 }],
      ['archetype', { type: 'single', min: 1, max: 1 }],
      ['tare', { type: 'single', min: 1, max: 1 }],
      ['source', { type: 'multiple', min: 1, max: 2 }],
      ['body', { type: 'single', min: 1, max: 1 }],
      ['noodle', { type: 'single', min: 1, max: 1 }],
      ['signature', { type: 'multiple', min: 1, max: 2 }],
      ['exclusions', { type: 'multiple', min: 1, max: 8 }],
    ])
    expect(definitions.map((question) => [
      question.id,
      question.options.filter(({ exclusive }) => exclusive).map(({ id }) => id),
    ])).toEqual([
      ['form', []],
      ['archetype', []],
      ['tare', []],
      ['source', ['unsure']],
      ['body', []],
      ['noodle', []],
      ['signature', ['no-preference']],
      ['exclusions', ['none']],
    ])
  })

  test('declares reachability, auto-answer, and exclusions pending policy', () => {
    expect(definitions.map(({ id, availableWhen }) => [id, availableWhen])).toEqual([
      ['form', undefined],
      ['archetype', { type: 'answered', questionId: 'form' }],
      ['tare', { type: 'answered', questionId: 'archetype' }],
      ['source', { type: 'answered', questionId: 'archetype' }],
      ['body', { type: 'answered', questionId: 'archetype' }],
      ['noodle', { type: 'answered', questionId: 'archetype' }],
      ['signature', { type: 'answered', questionId: 'archetype' }],
      ['exclusions', undefined],
    ])
    expect(definitions.map(({ id, autoAnswer }) => [id, autoAnswer])).toEqual([
      ['form', undefined],
      ['archetype', undefined],
      ['tare', { type: 'single-allowed-option' }],
      ['source', { type: 'single-allowed-option' }],
      ['body', { type: 'single-allowed-option' }],
      ['noodle', { type: 'single-allowed-option' }],
      ['signature', { type: 'single-allowed-option' }],
      ['exclusions', undefined],
    ])

    const exclusions = definitions.find(({ id }) => id === 'exclusions')
    expect(exclusions?.initialUiOptionIds).toEqual(['none'])
    expect(exclusions?.pendingSelection).toEqual({
      emptyBehavior: { type: 'restore-initial-ui-options' },
    })
  })

  test('selects archetypes through explicit form decision rows', () => {
    const archetype = definitions.find(({ id }) => id === 'archetype')
    expect(archetypeIds).toEqual(expectedOptions.archetype)
    expect(archetype?.allowedOptions).toEqual([
      {
        when: { type: 'answer-includes', questionId: 'form', optionId: 'soup' },
        selection: { type: 'only', optionIds: ['chintan', 'paitan'] },
      },
      {
        when: { type: 'answer-includes', questionId: 'form', optionId: 'tsukemen' },
        selection: {
          type: 'only',
          optionIds: ['konbusui-light', 'gyokai-rich', 'miso-rich', 'tsukemen-other'],
        },
      },
      {
        when: { type: 'answer-includes', questionId: 'form', optionId: 'dry' },
        selection: {
          type: 'only',
          optionIds: ['aburasoba', 'taiwan-mazesoba', 'soupless-tantan', 'dry-other'],
        },
      },
    ])
  })

  test('declares every archetype decision row for every preference question', () => {
    const unrestrictedArchetypes = new Set([
      'chintan',
      'paitan',
      'tsukemen-other',
      'dry-other',
    ])
    for (const id of ['tare', 'source', 'body', 'noodle', 'signature'] as const) {
      const question = definitions.find((item) => item.id === id)
      expect(question?.allowedOptions).toHaveLength(archetypeIds.length)
      expect(question?.allowedOptions?.map(({ when, selection }) => ({ when, selection }))).toEqual(
        archetypeIds.map((archetypeId) => ({
          when: { type: 'answer-includes', questionId: 'archetype', optionId: archetypeId },
          selection: unrestrictedArchetypes.has(archetypeId)
            ? { type: 'all' }
            : {
                type: 'only',
                optionIds: restrictedOptions[
                  archetypeId as keyof typeof restrictedOptions
                ][id],
              },
        })),
      )
    }
  })

  test('keeps repeated legacy values scoped to their owning question', () => {
    const source = definitions.find(({ id }) => id === 'source')
    const exclusions = definitions.find(({ id }) => id === 'exclusions')
    expect(source?.options.some(({ id }) => id === 'pork')).toBe(true)
    expect(exclusions?.options.some(({ id }) => id === 'pork')).toBe(true)
  })

  test('uses stable localization-only message IDs', () => {
    for (const question of definitions) {
      expect(question.messageIds).toEqual({
        title: `question-${question.id}-title`,
        description: `question-${question.id}-description`,
      })
      question.options.forEach((option) => {
        expect(option.messageIds).toEqual({
          label: `option-${question.id}-${option.id}-label`,
          description: `option-${question.id}-${option.id}-description`,
        })
      })
    }
  })
})
