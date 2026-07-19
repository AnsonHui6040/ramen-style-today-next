import { describe, expect, test } from 'vitest'

import { verifyScoreTrace } from './trace.js'
import { classificationModel, completedAnswers } from './test-fixtures.js'
import { scoreCompletedAnswers } from './score.js'

describe('score trace verification', () => {
  test('reconstructs the complete successful trace', () => {
    const result = scoreCompletedAnswers(classificationModel, completedAnswers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(() => verifyScoreTrace(classificationModel, completedAnswers, result.outcome)).not.toThrow()
    expect(result.outcome.trace.styleCandidates).toHaveLength(18)
    expect(result.outcome.trace.styleCandidates.flatMap(({ coreCandidates }) => coreCandidates)).toHaveLength(54)
  })

  test('rejects forged adjustment and confidence evidence', () => {
    const result = scoreCompletedAnswers(classificationModel, completedAnswers)
    if (!result.ok) throw new Error('Expected scoring success')

    const confidenceForgery = structuredClone(result.outcome)
    const confidence = confidenceForgery.trace.styleCandidates
      .find(({ confidence: value }) => value !== null)!.confidence!
    ;(confidence as { maximumDerivation: string }).maximumDerivation = 'forged'
    ;(confidence as { rounding: string }).rounding = 'forged'
    expect(() => verifyScoreTrace(
      classificationModel,
      completedAnswers,
      confidenceForgery,
    )).toThrow()

    const adjustmentForgery = structuredClone(result.outcome)
    const adjustment = adjustmentForgery.trace.styleCandidates
      .flatMap(({ coreCandidates }) => coreCandidates)
      .flatMap(({ adjustmentLines }) => adjustmentLines)[0]!
    ;(adjustment as { operand: number }).operand += 1
    expect(() => verifyScoreTrace(
      classificationModel,
      completedAnswers,
      adjustmentForgery,
    )).toThrow()
  })
})
