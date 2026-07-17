import { describe, expect, test } from 'vitest'

import { compareStyleTraces, rankStyleCandidates } from './ranking.js'
import { buildStyleCandidates } from './score.js'
import { classificationModel, completedAnswers } from './test-fixtures.js'

describe('style ranking', () => {
  test('retains all styles while limiting ranked family groups after sorting', () => {
    const candidates = buildStyleCandidates(classificationModel, completedAnswers)
    const ranked = rankStyleCandidates(
      classificationModel.policy,
      completedAnswers,
      candidates,
    )
    const reversed = rankStyleCandidates(
      classificationModel.policy,
      completedAnswers,
      [...candidates].reverse(),
    )

    expect(ranked.styleCandidates).toHaveLength(18)
    expect(ranked.primaryRanking.filter(({ selected }) => selected)).toHaveLength(3)
    expect(ranked.alternativeRanking.filter(({ selected }) => selected)).toHaveLength(3)
    expect(ranked.selectedPrimaryStyleIds).toHaveLength(3)
    expect(ranked.selectedAlternativeStyleIds).toHaveLength(3)
    expect(ranked.selectedPrimaryStyleIds).toEqual(reversed.selectedPrimaryStyleIds)
    expect(ranked.selectedAlternativeStyleIds).toEqual(reversed.selectedAlternativeStyleIds)
    for (const left of candidates) {
      for (const right of candidates) {
        const forwardComparison = compareStyleTraces(left, right)
        const reverseComparison = compareStyleTraces(right, left)
        expect(
          (forwardComparison === 0 && reverseComparison === 0)
            || Math.sign(forwardComparison) === -Math.sign(reverseComparison),
        ).toBe(true)
        for (const third of candidates) {
          if (compareStyleTraces(left, right) <= 0 && compareStyleTraces(right, third) <= 0) {
            expect(compareStyleTraces(left, third)).toBeLessThanOrEqual(0)
          }
        }
      }
    }
  })

  test('uses controlled display-priority and ID fallbacks for equal scores', () => {
    const base = buildStyleCandidates(classificationModel, completedAnswers)[0]!
    const priorityWinner = {
      ...base,
      styleId: 'z',
      displayPriority: 0,
      rankingKeys: { score: 50, displayPriority: 0, styleId: 'z' },
    }
    const priorityLoser = {
      ...base,
      styleId: 'a',
      displayPriority: 1,
      rankingKeys: { score: 50, displayPriority: 1, styleId: 'a' },
    }
    expect(compareStyleTraces(priorityWinner, priorityLoser)).toBeLessThan(0)
    const idWinner = {
      ...priorityWinner,
      styleId: 'a',
      rankingKeys: { ...priorityWinner.rankingKeys, styleId: 'a' },
    }
    const idLoser = {
      ...priorityWinner,
      styleId: 'b',
      rankingKeys: { ...priorityWinner.rankingKeys, styleId: 'b' },
    }
    expect(compareStyleTraces(idWinner, idLoser)).toBeLessThan(0)
  })
})
