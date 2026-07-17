import { describe, expect, test } from 'vitest'

import { scoreCoreCandidates } from './core.js'
import { classificationModel, completedAnswers } from './test-fixtures.js'

describe('core scoring', () => {
  test('scores every accepted core with reconstructible totals', () => {
    const traces = classificationModel.styleModel.styles.flatMap((style) => (
      scoreCoreCandidates(classificationModel.policy, style, completedAnswers)
    ))

    expect(traces).toHaveLength(54)
    for (const trace of traces) {
      expect(trace.questionLines).toHaveLength(7)
      expect(trace.baseTotal * 10).toBe(
        trace.questionLines.reduce((total, line) => total + line.points * 10, 0),
      )
      expect(trace.finalTotal).toBeGreaterThanOrEqual(0)
      expect(trace.rankingKeys.score).toBe(trace.finalTotal)
    }
    expect(JSON.stringify(traces)).toBe(JSON.stringify(
      classificationModel.styleModel.styles.flatMap((style) => (
        scoreCoreCandidates(classificationModel.policy, style, completedAnswers)
      )),
    ))
  })
})
