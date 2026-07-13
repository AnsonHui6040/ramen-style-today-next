import { describe, expect, test } from 'vitest'

import { questionDefinitions } from '../../definitions/questions.js'
import { stableJson } from '../stable-json.js'
import { canonicalizeQuestionSource } from './canonicalize.js'
import {
  exploreQuestionSemantics,
  normalizeSemanticAnswers,
} from './explore.js'
import {
  namedCombinationDefinition,
  twoOutputDefinition,
} from './test-fixtures.js'

describe('finite question semantic exploration', () => {
  test('does not merge branches with equal truth but different allowed outputs', () => {
    const exploration = exploreQuestionSemantics(twoOutputDefinition)

    expect(exploration.signatures.map((item) => (
      item.allowedOptionIdsByQuestion.target
    ))).toEqual([
      ['a'],
      ['b'],
    ])
  })

  test('enumerates a multi-select combination named by a nested condition', () => {
    const exploration = exploreQuestionSemantics(namedCombinationDefinition)

    expect(exploration.coverage.questionIds).toEqual(['choices', 'combo-target'])
    expect(exploration.signatures).toContainEqual(expect.objectContaining({
      reachableQuestionIds: ['choices', 'combo-target'],
    }))
    expect(exploration.validSelectionKeysByQuestion.choices).toContain('["a","b"]')
    expect(new Set(exploration.representativeCases.filter((item) => (
      item.kind === 'condition-combination' && item.questionId === 'choices'
    )).map(({ optionIds }) => JSON.stringify(optionIds)))).toEqual(new Set([
      '["a"]',
      '["b"]',
      '["c"]',
      '["a","b"]',
      '["a","c"]',
      '["b","c"]',
      '["a","b","c"]',
    ]))
  })

  test('uses every semantic field in stable signature deduplication', () => {
    const exploration = exploreQuestionSemantics(questionDefinitions)
    const keys = exploration.signatures.map(stableJson)

    expect(new Set(keys).size).toBe(keys.length)
    for (const signature of exploration.signatures) {
      expect(Object.keys(signature)).toEqual([
        'conditionTruthVector',
        'reachableQuestionIds',
        'allowedOptionIdsByQuestion',
        'effectiveSelectionBounds',
        'forcedEligibility',
        'answerValidity',
      ])
      expect(Object.keys(signature.answerValidity)).toEqual(
        questionDefinitions.map(({ id }) => id),
      )
    }
  })

  test('records every required representative local-selection class', () => {
    const exploration = exploreQuestionSemantics(questionDefinitions)

    expect(new Set(exploration.representativeCases.map(({ kind }) => kind))).toEqual(new Set([
      'unanswered',
      'minimum',
      'maximum',
      'below-minimum',
      'above-maximum',
      'exclusive',
      'exclusive-conflict',
      'forced-singleton',
      'stale',
      'allow-all',
      'condition-combination',
    ]))
    expect(Object.fromEntries([...new Set(
      exploration.representativeCases.map(({ kind }) => kind),
    )].map((kind) => [
      kind,
      [...new Set(exploration.representativeCases.filter((item) => (
        item.kind === kind
      )).map((item) => item.signature.answerValidity[item.questionId]))],
    ]))).toEqual({
      unanswered: ['missing'],
      minimum: ['valid'],
      maximum: ['valid'],
      'below-minimum': ['invalid'],
      'above-maximum': ['invalid'],
      'condition-combination': ['valid', 'stale'],
      exclusive: ['valid'],
      'exclusive-conflict': ['invalid'],
      stale: ['stale'],
      'allow-all': ['valid'],
      'forced-singleton': ['valid'],
    })
  })

  test('normalizes compiled option order idempotently', () => {
    const questions = canonicalizeQuestionSource(questionDefinitions)
    const once = normalizeSemanticAnswers(questions, {
      exclusions: ['dairy', 'pork', 'chicken'],
    })

    expect(once).toEqual({ exclusions: ['pork', 'chicken', 'dairy'] })
    expect(normalizeSemanticAnswers(questions, once)).toEqual(once)
  })
})
