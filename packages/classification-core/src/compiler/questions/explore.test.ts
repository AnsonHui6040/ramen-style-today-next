import { describe, expect, test } from 'vitest'

import { questionDefinitions } from '../../definitions/questions.js'
import { stableJson } from '../stable-json.js'
import { canonicalizeQuestionSource } from './canonicalize.js'
import {
  exploreQuestionSemantics,
  normalizeSemanticAnswers,
  resolveForcedAnswers,
} from './explore.js'
import {
  forcedToInteractiveDefinition,
  maximumRepresentativeDefinition,
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

  test('keeps submitted and forced provenance distinct across forced-to-interactive transition', () => {
    const exploration = exploreQuestionSemantics(forcedToInteractiveDefinition)
    const before = exploration.reachableStates.find((state) => (
      Object.keys(state.submittedAnswers).length === 0
    ))!
    const after = exploration.reachableStates.find((state) => (
      state.submittedAnswers.gate?.[0] === 'on'
      && state.signature.answerValidity['forced-target'] === 'missing'
    ))!

    expect(before.submittedAnswers).toEqual({})
    expect(before.forcedAnswers).toEqual({ 'forced-target': ['forced'] })
    expect(before.canonicalAnswers).toEqual({ 'forced-target': ['forced'] })
    expect(after.submittedAnswers).toEqual({ gate: ['on'] })
    expect(after.forcedAnswers).toEqual({})
    expect(after.canonicalAnswers).toEqual({ gate: ['on'] })
    expect(before.successorSignatureKeys).toContain(after.signatureKey)

    const hiddenSubmitted = resolveForcedAnswers(
      exploration.questions,
      exploration.graph.topologicalOrder,
      { 'forced-target': ['manual'] },
    )
    const releasedSubmitted = resolveForcedAnswers(
      exploration.questions,
      exploration.graph.topologicalOrder,
      { gate: ['on'], 'forced-target': ['manual'] },
    )
    expect(hiddenSubmitted.submittedAnswers).toEqual({ 'forced-target': ['manual'] })
    expect(hiddenSubmitted.forcedAnswers).toEqual({ 'forced-target': ['forced'] })
    expect(hiddenSubmitted.canonicalAnswers).toEqual({ 'forced-target': ['forced'] })
    expect(releasedSubmitted.submittedAnswers).toEqual({
      gate: ['on'],
      'forced-target': ['manual'],
    })
    expect(releasedSubmitted.forcedAnswers).toEqual({})
    expect(releasedSubmitted.canonicalAnswers).toEqual({
      gate: ['on'],
      'forced-target': ['manual'],
    })
  })

  test('uses the largest achievable legal selection as the maximum representative per environment', () => {
    const exploration = exploreQuestionSemantics(maximumRepresentativeDefinition)
    const maximumCases = exploration.representativeCases.filter((item) => (
      item.kind === 'maximum' && item.questionId === 'maximum-target'
    ))

    expect(maximumCases).toContainEqual(expect.objectContaining({
      optionIds: ['a'],
      signature: expect.objectContaining({
        allowedOptionIdsByQuestion: expect.objectContaining({
          'maximum-target': ['a'],
        }),
      }),
    }))
    expect(maximumCases).toContainEqual(expect.objectContaining({
      optionIds: ['a', 'b', 'c'],
      signature: expect.objectContaining({
        allowedOptionIdsByQuestion: expect.objectContaining({
          'maximum-target': ['a', 'b', 'c'],
        }),
      }),
    }))
  })
})
