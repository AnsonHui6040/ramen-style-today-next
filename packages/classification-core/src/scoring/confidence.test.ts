import { describe, expect, test } from 'vitest'

import {
  addConfidence,
  computeConfidenceTrace,
  deriveLowConfidence,
  roundConfidence,
} from './confidence.js'
import { rankStyleCandidates } from './ranking.js'
import { buildStyleCandidates } from './score.js'
import { classificationModel, completedAnswers } from './test-fixtures.js'

describe('scoring confidence', () => {
  test('uses JavaScript nearest integer ties toward positive infinity', () => {
    expect(roundConfidence(-1.5, 'nearest-integer-ties-toward-positive-infinity')).toBe(-1)
    expect(roundConfidence(1.5, 'nearest-integer-ties-toward-positive-infinity')).toBe(2)
  })

  test('computes bounded group-local confidence and low-confidence evidence', () => {
    const ranked = rankStyleCandidates(
      classificationModel.policy,
      completedAnswers,
      buildStyleCandidates(classificationModel, completedAnswers),
    )
    const result = addConfidence(classificationModel.policy, completedAnswers, ranked)

    for (const candidate of result.styleCandidates) {
      if (candidate.displayPosition === null) expect(candidate.confidence).toBeNull()
      else expect(candidate.confidence?.confidence).toBeGreaterThanOrEqual(24)
    }
    expect(result.lowConfidence.confidenceThreshold).toBe(72)
    expect(result.lowConfidence.scoreGapThreshold).toBe(5)
    expect(result.lowConfidence.lowConfidence).toBe(
      !result.lowConfidence.hasPrimaryResult
        || result.lowConfidence.confidenceBelowThreshold
        || result.lowConfidence.scoreGapBelowThreshold,
    )
  })

  test('clamps exact minimum and maximum boundaries after compiled rounding', () => {
    const candidate = buildStyleCandidates(classificationModel, completedAnswers)[0]!
    const minimum = computeConfidenceTrace(
      classificationModel.policy,
      completedAnswers,
      { ...candidate, rankingKeys: { ...candidate.rankingKeys, score: 0 } },
      -4,
    )
    const maximum = computeConfidenceTrace(
      classificationModel.policy,
      completedAnswers,
      { ...candidate, rankingKeys: { ...candidate.rankingKeys, score: 105 } },
      0,
    )
    expect(minimum).toMatchObject({
      maximumScore: 105,
      roundedConfidence: 2,
      minimum: 24,
      confidence: 24,
    })
    expect(maximum).toMatchObject({ maximum: 99, confidence: 99 })
  })

  test('handles no-primary low confidence without nullable arithmetic', () => {
    const ranked = rankStyleCandidates(
      classificationModel.policy,
      completedAnswers,
      buildStyleCandidates(classificationModel, completedAnswers),
    )
    const result = addConfidence(classificationModel.policy, completedAnswers, {
      ...ranked,
      selectedPrimaryStyleIds: [],
    })
    expect(result.lowConfidence).toEqual({
      hasPrimaryResult: false,
      topConfidence: null,
      confidenceThreshold: 72,
      confidenceBelowThreshold: false,
      topScore: null,
      secondScore: null,
      scoreGap: null,
      scoreGapThreshold: 5,
      scoreGapBelowThreshold: false,
      lowConfidence: true,
    })
  })

  test('applies the exact 72-confidence and 5-point gap boundaries', () => {
    const policy = classificationModel.policy
    expect(deriveLowConfidence(policy, [
      { score: 10, confidence: 71 },
      { score: 5, confidence: 99 },
    ])).toMatchObject({
      confidenceBelowThreshold: true,
      scoreGapBelowThreshold: false,
      lowConfidence: true,
    })
    expect(deriveLowConfidence(policy, [
      { score: 10, confidence: 72 },
      { score: 5, confidence: 99 },
    ])).toMatchObject({
      confidenceBelowThreshold: false,
      scoreGap: 5,
      scoreGapBelowThreshold: false,
      lowConfidence: false,
    })
    expect(deriveLowConfidence(policy, [
      { score: 9.9, confidence: 72 },
      { score: 5, confidence: 99 },
    ])).toMatchObject({
      confidenceBelowThreshold: false,
      scoreGap: 4.9,
      scoreGapBelowThreshold: true,
      lowConfidence: true,
    })
  })

  test('truncates each group before computing group-local confidence', () => {
    const ranked = rankStyleCandidates(
      classificationModel.policy,
      completedAnswers,
      buildStyleCandidates(classificationModel, completedAnswers),
    )
    const result = addConfidence(classificationModel.policy, completedAnswers, ranked)
    for (const ids of [
      result.selectedPrimaryStyleIds,
      result.selectedAlternativeStyleIds,
    ]) {
      expect(ids).toHaveLength(3)
      const displayed = ids.map((id) => (
        result.styleCandidates.find(({ styleId }) => styleId === id)!
      ))
      expect(displayed[0]!.confidence?.nextScore).toBe(displayed[1]!.rankingKeys.score)
      expect(displayed[1]!.confidence?.nextScore).toBe(displayed[2]!.rankingKeys.score)
      expect(displayed[2]!.confidence?.nextScore).toBe(
        displayed[2]!.rankingKeys.score - classificationModel.policy.confidence.lastResultGap,
      )
    }
  })
})
