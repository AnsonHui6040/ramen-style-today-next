import { describe, expect, test, vi } from 'vitest'

import type { CompletedAnswers } from '../flow/types.js'
import { scoreCompletedAnswers } from '../scoring/score.js'
import {
  classificationModel,
  cloneClassificationModel,
  completedAnswers,
} from '../scoring/test-fixtures.js'
import { applyEligibilityPolicy, evaluateEligibility } from './evaluate.js'

function expectDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  expect(Object.isFrozen(value)).toBe(true)
  for (const child of Object.values(value)) expectDeeplyFrozen(child, seen)
}

function answersWith(exclusions: readonly string[]): CompletedAnswers {
  return { ...completedAnswers, exclusions } as CompletedAnswers
}

function evaluate(exclusions: readonly string[]) {
  const answers = answersWith(exclusions)
  const scored = scoreCompletedAnswers(classificationModel, answers)
  if (!scored.ok) throw new Error('scoring fixture must succeed')
  return evaluateEligibility(classificationModel, answers, scored.outcome)
}

describe('evaluateEligibility', () => {
  test('preserves all scoring identities and returns deterministic immutable no-op results', () => {
    expect(classificationModel.modelVersion).toBe('batch3c.1.0')
    expect(classificationModel.policy.metadata).toMatchObject({
      modelVersion: 'batch3b.1.0',
      semanticHash: '76c768181a4a402abb33e7c4b30f7a8b4aa159db14ea827898e79b380cd132f6',
      dataVersion: '36ad616a2f709fe2bb6ddcfd5e0cb0eb16ecdea15f42e41640588cf61e068ed7',
    })
    const first = evaluate(['none'])
    const second = evaluate(['none'])

    expect(first.ok).toBe(true)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expectDeeplyFrozen(first)
    if (!first.ok) return
    expect(first.outcome.selectedExclusions).toEqual(['none'])
    expect(first.outcome.blockedCandidates).toEqual([])
    expect(first.outcome.selectedPrimaryResults.map(({ styleId }) => styleId))
      .toEqual(first.outcome.originalScoringOutcome.results.map(({ styleId }) => styleId))
    expect(first.outcome.selectedAlternatives.map(({ styleId }) => styleId))
      .toEqual(first.outcome.originalScoringOutcome.alternativeResults.map(({ styleId }) => styleId))
    expect(first.outcome.noPrimaryEligible).toBe(false)
    expect(first.outcome.noEligibleCandidate).toBe(false)
    expect(first.outcome.diagnostics).toEqual([])
  })

  test('blocks candidates, retains original rank/score/trace, and selects stable replacements', () => {
    const result = evaluate(['chicken'])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.outcome.selectedPrimaryResults.map(({ styleId }) => styleId)).toEqual([
      'shoyu-chintan', 'shio-chintan', 'iekei',
    ])
    expect(result.outcome.blockedCandidates.map(({ styleId }) => styleId)).toEqual([
      'chicken-chintan', 'chicken-paitan',
    ])
    expect(result.outcome.blockedLead?.styleId).toBe('chicken-chintan')
    const blocked = result.outcome.blockedCandidates[0]!
    const original = result.outcome.originalScoringOutcome.trace.primaryRanking
      .find(({ styleId }) => styleId === blocked.styleId)!
    expect(blocked.originalRank).toBe(original.groupRank)
    expect(blocked.score).toBe(original.score)
    expect(blocked.scoringTrace.styleId).toBe(blocked.styleId)
    expect(blocked.reasons).toEqual([expect.objectContaining({
      code: 'ELIGIBILITY_EXCLUSION_CONFLICT',
      exclusionOptionId: 'chicken',
      restrictionTagId: 'chicken',
      styleId: blocked.styleId,
      coreId: blocked.coreId,
      subtypeId: blocked.subtypeId,
    })])
    expect(result.outcome.eligiblePrimaryRanking.map(({ styleId }) => styleId)).toEqual(
      result.outcome.originalScoringOutcome.trace.primaryRanking
        .map(({ styleId }) => styleId)
        .filter((styleId) => !['chicken-chintan', 'chicken-paitan'].includes(styleId)),
    )
    expect(result.outcome.selectedPrimaryResults[2]?.confidence).toBeNull()
    const trace = result.outcome.trace.candidateEvaluations
      .find(({ styleId }) => styleId === 'chicken-chintan')!
    expect(trace.evaluatedRestrictionTagIds).toEqual(['chicken'])
    expect(trace.rules.find(({ exclusionOptionId }) => exclusionOptionId === 'chicken'))
      .toMatchObject({ active: true, matchedRestrictionTagIds: ['chicken'] })
    expect(trace.rules.find(({ exclusionOptionId }) => exclusionOptionId === 'pork'))
      .toMatchObject({ active: false, matchedRestrictionTagIds: [] })
    expect(trace.decision).toBe('blocked')
    expect(trace.reasons).toEqual(blocked.reasons)
  })

  test('handles multiple exclusions and all-primary-blocked without hiding alternatives', () => {
    const answers = {
      form: ['tsukemen'],
      archetype: ['konbusui-light'],
      tare: ['shio'],
      source: ['fish-seafood', 'shellfish'],
      body: ['balanced'],
      noodle: ['medium-thick-straight'],
      signature: ['fish-kombu'],
      exclusions: ['fish-seafood', 'pork'],
    } as const satisfies CompletedAnswers
    const scored = scoreCompletedAnswers(classificationModel, answers)
    if (!scored.ok) throw new Error('scoring fixture must succeed')
    const result = evaluateEligibility(classificationModel, answers, scored.outcome)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.outcome.selectedPrimary).toBeNull()
    expect(result.outcome.selectedPrimaryResults).toEqual([])
    expect(result.outcome.noPrimaryEligible).toBe(true)
    expect(result.outcome.noEligibleCandidate).toBe(false)
    expect(result.outcome.selectedAlternatives.length).toBeGreaterThan(0)
    expect(result.outcome.blockedLead?.styleId).toBe('konbusui-tsukemen')
    expect(result.outcome.blockedCandidates.map(({ styleId }) => styleId)).toEqual(
      expect.arrayContaining([
        'konbusui-tsukemen', 'gyokai-tsukemen', 'tonkotsu',
        'iekei', 'jiro', 'hakata', 'aburasoba', 'taiwan-mazesoba',
      ]),
    )
  })

  test('fails closed for invalid answers, scoring results, model identity, and traps', () => {
    const scored = scoreCompletedAnswers(classificationModel, completedAnswers)
    if (!scored.ok) throw new Error('scoring fixture must succeed')
    expect(evaluateEligibility(
      classificationModel,
      answersWith(['none', 'pork']),
      scored.outcome,
    )).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'ELIGIBILITY_COMPLETED_ANSWERS_INVALID' }],
    })

    const invalidOutcome = structuredClone(scored.outcome)
    ;(invalidOutcome.trace.primaryRanking as unknown as unknown[]).pop()
    expect(evaluateEligibility(
      classificationModel,
      completedAnswers,
      invalidOutcome,
    )).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'ELIGIBILITY_SCORING_RESULT_INVALID' }],
    })

    const invalidModel = cloneClassificationModel()
    ;(invalidModel as { dataVersion: string }).dataVersion = 'wrong'
    expect(evaluateEligibility(invalidModel, completedAnswers, scored.outcome)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'ELIGIBILITY_MODEL_IDENTITY_MISMATCH' }],
    })

    const trapped = new Proxy(completedAnswers, {
      ownKeys() { throw new Error('SECRET_ELIGIBILITY_TRAP') },
    })
    const trappedResult = evaluateEligibility(classificationModel, trapped, scored.outcome)
    expect(trappedResult).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'ELIGIBILITY_COMPLETED_ANSWERS_INVALID' }],
    })
    expect(JSON.stringify(trappedResult)).not.toContain('SECRET_ELIGIBILITY_TRAP')
    expectDeeplyFrozen(trappedResult)
  })

  test.each([
    ['missing exclusion tags', []],
    ['changed exclusion tags', ['pork']],
    ['unknown exclusion tags', ['unknown-exclusion-tag']],
  ] as const)('fails closed for %s on a style', (_label, exclusionTags) => {
    const scored = scoreCompletedAnswers(classificationModel, completedAnswers)
    if (!scored.ok) throw new Error('scoring fixture must succeed')
    const model = cloneClassificationModel()
    const style = model.styleModel.styles.find(({ id }) => id === 'chicken-chintan')!
    ;(style as { exclusionTags: readonly string[] }).exclusionTags = exclusionTags

    expect(evaluateEligibility(model, completedAnswers, scored.outcome)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'ELIGIBILITY_MODEL_IDENTITY_MISMATCH' }],
    })
  })

  test('fails closed when the exclusions question semantics drift', () => {
    const scored = scoreCompletedAnswers(classificationModel, completedAnswers)
    if (!scored.ok) throw new Error('scoring fixture must succeed')
    const model = cloneClassificationModel()
    const question = model.questionModel.questions.find(({ id }) => id === 'exclusions')!
    ;(question.selection as { max: number }).max -= 1

    expect(evaluateEligibility(model, completedAnswers, scored.outcome)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'ELIGIBILITY_MODEL_IDENTITY_MISMATCH' }],
    })
  })

  test('returns the original scoring outcome by value without freezing caller-owned input', () => {
    const scored = scoreCompletedAnswers(classificationModel, completedAnswers)
    if (!scored.ok) throw new Error('scoring fixture must succeed')
    const mutableOutcome = structuredClone(scored.outcome)
    const beforeBytes = JSON.stringify(mutableOutcome)
    const beforeDescriptor = Object.getOwnPropertyDescriptor(mutableOutcome, 'trace')

    const result = evaluateEligibility(classificationModel, completedAnswers, mutableOutcome)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.outcome.originalScoringOutcome).toEqual(mutableOutcome)
    expect(result.outcome.originalScoringOutcome).not.toBe(mutableOutcome)
    expect(result.outcome.originalScoringOutcome.trace).not.toBe(mutableOutcome.trace)
    expect(JSON.stringify(mutableOutcome)).toBe(beforeBytes)
    expect(Object.getOwnPropertyDescriptor(mutableOutcome, 'trace')).toEqual(beforeDescriptor)
    expect(Object.isFrozen(mutableOutcome)).toBe(false)
    expect(Object.isFrozen(mutableOutcome.trace)).toBe(false)
    expectDeeplyFrozen(result)
  })

  test('does not depend on input/rule order, time, randomness, locale, or localized copy', () => {
    const model = cloneClassificationModel()
    ;(model.eligibilityPolicy.rules as unknown as unknown[]).reverse()
    const answers = answersWith(['pork', 'fish-seafood'])
    const reversedAnswers = answersWith(['fish-seafood', 'pork'])
    const scored = scoreCompletedAnswers(classificationModel, answers)
    const reversedScored = scoreCompletedAnswers(model, reversedAnswers)
    if (!scored.ok || !reversedScored.ok) throw new Error('scoring fixture must succeed')
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('clock forbidden')
    })
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('random forbidden')
    })
    const locale = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
      throw new Error('locale forbidden')
    })
    try {
      const first = evaluateEligibility(classificationModel, answers, scored.outcome)
      const second = evaluateEligibility(model, reversedAnswers, reversedScored.outcome)
      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
      expect(JSON.stringify(first)).not.toMatch(/safe to eat|allergen-free|medical|catalog|finder/i)
    } finally {
      clock.mockRestore()
      random.mockRestore()
      locale.mockRestore()
    }
  })

  test('represents a closed synthetic all-candidates-blocked policy without partial success', () => {
    const model = cloneClassificationModel()
    for (const style of model.styleModel.styles) {
      ;(style as unknown as { exclusionTags: readonly ['pork'] }).exclusionTags = ['pork']
    }
    const porkRule = model.eligibilityPolicy.rules
      .find(({ exclusionOptionId }) => exclusionOptionId === 'pork')!
    ;(porkRule as { blockedStyleIds: readonly string[] }).blockedStyleIds =
      model.styleModel.styles.map(({ id }) => id)
    const answers = answersWith(['pork'])
    const scored = scoreCompletedAnswers(classificationModel, answers)
    if (!scored.ok) throw new Error('scoring fixture must succeed')

    const outcome = applyEligibilityPolicy(model, answers, scored.outcome)

    expect(outcome.noPrimaryEligible).toBe(true)
    expect(outcome.noEligibleCandidate).toBe(true)
    expect(outcome.selectedPrimary).toBeNull()
    expect(outcome.selectedPrimaryResults).toEqual([])
    expect(outcome.selectedAlternatives).toEqual([])
    expect(outcome.blockedCandidates).toHaveLength(18)
    expect(outcome.trace.noEligibleCandidate).toBe(true)
  })
})
