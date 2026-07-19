import { describe, expect, test } from 'vitest'

import { scoreCoreCandidates } from './core.js'
import { compareCoreTraces, selectCoreCandidate } from './selection.js'
import { classificationModel, completedAnswers } from './test-fixtures.js'

describe('core selection', () => {
  test('uses score descending, priority ascending, then ID ascending', () => {
    const candidates = scoreCoreCandidates(
      classificationModel.policy,
      classificationModel.styleModel.styles[0]!,
      completedAnswers,
    )
    const forward = selectCoreCandidate(candidates)
    const reversed = selectCoreCandidate([...candidates].reverse())

    expect(forward.selected.coreId).toBe(reversed.selected.coreId)
    expect(forward.candidates.filter(({ selected }) => selected)).toHaveLength(1)
    expect([...forward.candidates].sort(compareCoreTraces)).toEqual(forward.candidates)
    for (const left of candidates) {
      for (const right of candidates) {
        const forwardComparison = compareCoreTraces(left, right)
        const reverseComparison = compareCoreTraces(right, left)
        expect(
          (forwardComparison === 0 && reverseComparison === 0)
            || Math.sign(forwardComparison) === -Math.sign(reverseComparison),
        ).toBe(true)
        for (const third of candidates) {
          if (compareCoreTraces(left, right) <= 0 && compareCoreTraces(right, third) <= 0) {
            expect(compareCoreTraces(left, third)).toBeLessThanOrEqual(0)
          }
        }
      }
    }
  })

  test('uses controlled priority and ID fallbacks for equal scores', () => {
    const base = scoreCoreCandidates(
      classificationModel.policy,
      classificationModel.styleModel.styles[0]!,
      completedAnswers,
    )[0]!
    const priorityWinner = { ...base, coreId: 'z:clean' as never, corePriority: 0, finalTotal: 50 }
    const priorityLoser = { ...base, coreId: 'a:clean' as never, corePriority: 1, finalTotal: 50 }
    expect(compareCoreTraces(priorityWinner, priorityLoser)).toBeLessThan(0)
    const idWinner = { ...priorityWinner, coreId: 'a:clean' as never }
    const idLoser = { ...priorityWinner, coreId: 'b:clean' as never }
    expect(compareCoreTraces(idWinner, idLoser)).toBeLessThan(0)
  })
})
