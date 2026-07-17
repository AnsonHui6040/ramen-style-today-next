import { describe, expect, test } from 'vitest'

import { legacyScoringPolicy } from './policies.js'

describe('legacy scoring policy', () => {
  test('owns the exact reviewed numerical behavior without style operands', () => {
    expect(legacyScoringPolicy).toMatchObject({
      modelVersion: 'batch3b.1.0',
      scoredQuestions: [
        { questionId: 'form', priority: 0, weight: 16 },
        { questionId: 'archetype', priority: 1, weight: 16 },
        { questionId: 'tare', priority: 2, weight: 15 },
        { questionId: 'source', priority: 3, weight: 18 },
        { questionId: 'body', priority: 4, weight: 14 },
        { questionId: 'noodle', priority: 5, weight: 11 },
        { questionId: 'signature', priority: 6, weight: 10 },
      ],
      tiers: [
        { tier: 'exact', priority: 0, ratio: 1 },
        { tier: 'adjacent', priority: 1, ratio: 0.6 },
        { tier: 'partial', priority: 2, ratio: 0.4 },
        { tier: 'miss', priority: 3, ratio: 0 },
      ],
      arithmetic: {
        scoreDecimalPlaces: 1,
        scoreRounding: 'nearest-score-unit-ties-up',
        scoreFloor: 0,
      },
      adjustments: { phases: ['bonus', 'conflict'], bonusCap: 5, penaltyCap: 15 },
      ranking: { primaryLimit: 3, alternativeLimit: 3 },
      confidence: {
        maximumDerivation: 'base-weight-total-plus-bonus-cap',
        rounding: 'nearest-integer-ties-toward-positive-infinity',
        lastResultGap: 4,
        gapMultiplier: 1.4,
        gapBoostCap: 10,
        minimum: 24,
        maximum: 99,
        lowConfidenceThreshold: 72,
        lowConfidenceTieGap: 5,
      },
    })
    expect(JSON.stringify(legacyScoringPolicy)).not.toMatch(
      /appliesToCoreIds|conditions|whenAll|labelMessageId/,
    )
  })
})
