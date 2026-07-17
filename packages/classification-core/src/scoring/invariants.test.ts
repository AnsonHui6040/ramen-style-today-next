import { describe, expect, test, vi } from 'vitest'

import type { CoreScoreTrace, StyleScoreTrace } from '../contracts/scoring.js'
import type { ClassificationModel } from '../contracts/model.js'
import type { CompletedAnswers } from '../flow/types.js'
import { compareStyleTraces } from './ranking.js'
import { scoreCompletedAnswers } from './score.js'
import { compareCoreTraces } from './selection.js'
import {
  classificationModel,
  cloneClassificationModel,
  completedAnswers,
} from './test-fixtures.js'

function expectDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  expect(Object.isFrozen(value)).toBe(true)
  for (const child of Object.values(value)) expectDeeplyFrozen(child, seen)
}

function expectFiniteNumbers(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true)
    return
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const child of Object.values(value)) expectFiniteNumbers(child, seen)
}

function expectComparatorProperties<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
): void {
  for (const left of values) {
    for (const right of values) {
      const forward = compare(left, right)
      const reverse = compare(right, left)
      if (forward === 0) expect(reverse).toBe(0)
      else expect(Math.sign(forward)).toBe(-Math.sign(reverse))
      for (const third of values) {
        if (compare(left, right) <= 0 && compare(right, third) <= 0) {
          expect(compare(left, third)).toBeLessThanOrEqual(0)
        }
      }
    }
  }
  const ordered = [...values].sort(compare)
  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      expect(compare(ordered[left]!, ordered[right]!)).toBeLessThan(0)
    }
  }
}

function reorderModel(mask: number): ClassificationModel {
  const model = cloneClassificationModel()
  if (mask & 1) (model.styleModel.styles as unknown as unknown[]).reverse()
  if (mask & 2) (model.policy.scoredQuestions as unknown as unknown[]).reverse()
  if (mask & 4) (model.policy.tiers as unknown as unknown[]).reverse()
  if (mask & 8) (model.policy.confidence.uncertainty as unknown as unknown[]).reverse()
  for (const style of model.styleModel.styles) {
    if (mask & 2) (style.cores as unknown as unknown[]).reverse()
    if (mask & 4) (style.adjustments as unknown as unknown[]).reverse()
    for (const adjustment of style.adjustments) {
      if (mask & 8) {
        const conditions = adjustment.kind === 'bonus'
          ? adjustment.conditions
          : adjustment.whenAll
        ;(conditions as unknown as unknown[]).reverse()
      }
    }
    for (const core of style.cores) {
      if (mask & 16) (core.rules as unknown as unknown[]).reverse()
      if (mask & 32) (core.subtypes as unknown as unknown[]).reverse()
      if (mask & 1) {
        for (const rule of core.rules) (rule.targets as unknown as unknown[]).reverse()
      }
    }
  }
  return model
}

describe('global scoring invariants', () => {
  test('reconstructs all arithmetic and resolves every trace identity', () => {
    const result = scoreCompletedAnswers(classificationModel, completedAnswers)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const styleById = new Map<
      string,
      (typeof classificationModel.styleModel.styles)[number]
    >(classificationModel.styleModel.styles.map((style) => [style.id, style]))
    expect(result.outcome.trace.styleCandidates).toHaveLength(18)
    for (const styleTrace of result.outcome.trace.styleCandidates) {
      const style = styleById.get(styleTrace.styleId)
      expect(style).toBeDefined()
      expect(styleTrace.coreCandidates).toHaveLength(3)
      expect(styleTrace.subtypeResolution.matchingSubtypeIds).toEqual([
        styleTrace.subtypeResolution.selectedSubtypeId,
      ])
      for (const coreTrace of styleTrace.coreCandidates) {
        const core = style?.cores.find(({ id }) => id === coreTrace.coreId)
        expect(core).toBeDefined()
        expect(coreTrace.questionLines).toHaveLength(7)
        expect(coreTrace.questionLines.every(({ ruleId }) => (
          core?.rules.some(({ id }) => id === ruleId)
        ))).toBe(true)
        expect(coreTrace.adjustmentLines.every(({ id }) => (
          style?.adjustments.some((adjustment) => adjustment.id === id)
        ))).toBe(true)
        const baseUnits = coreTrace.questionLines.reduce((total, { points }) => (
          total + Math.round(points * 10)
        ), 0)
        const bonusUnits = coreTrace.adjustmentLines
          .filter(({ kind }) => kind === 'bonus')
          .reduce((total, { appliedPoints }) => total + Math.round(appliedPoints * 10), 0)
        const penaltyUnits = coreTrace.adjustmentLines
          .filter(({ kind }) => kind === 'conflict')
          .reduce((total, { appliedPoints }) => total + Math.round(appliedPoints * 10), 0)
        expect(Math.round(coreTrace.baseTotal * 10)).toBe(baseUnits)
        expect(Math.round(coreTrace.bonusTotal * 10)).toBe(bonusUnits)
        expect(Math.round(coreTrace.penaltyTotal * 10)).toBe(penaltyUnits)
        expect(Math.round(coreTrace.preFloorTotal * 10)).toBe(
          baseUnits + bonusUnits - penaltyUnits,
        )
        expect(Math.round(coreTrace.finalTotal * 10)).toBe(
          Math.max(0, baseUnits + bonusUnits - penaltyUnits),
        )
      }
    }
    for (const displayed of [
      ...result.outcome.results,
      ...result.outcome.alternativeResults,
    ]) {
      expect(result.outcome.trace.styleCandidates.find(({ styleId }) => (
        styleId === displayed.styleId
      ))).toBe(displayed.trace)
      expect(displayed.confidence).toBeGreaterThanOrEqual(24)
      expect(displayed.confidence).toBeLessThanOrEqual(99)
      expect(Number.isInteger(displayed.confidence)).toBe(true)
    }
    expectFiniteNumbers(result)
    expect(JSON.stringify(result)).not.toMatch(/(?:file:|\/Users\/|eligibility|catalog|allergy)/i)
  })

  test('proves total-order comparator properties on all accepted styles and cores', () => {
    const result = scoreCompletedAnswers(classificationModel, completedAnswers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expectComparatorProperties<StyleScoreTrace>(
      result.outcome.trace.styleCandidates,
      compareStyleTraces,
    )
    for (const style of result.outcome.trace.styleCandidates) {
      expectComparatorProperties<CoreScoreTrace>(style.coreCandidates, compareCoreTraces)
    }
  })

  test('is byte-identical across 64 explicit source-array reorderings', () => {
    const expected = JSON.stringify(scoreCompletedAnswers(
      classificationModel,
      completedAnswers,
    ))
    for (let mask = 0; mask < 64; mask += 1) {
      const model = reorderModel(mask)
      const before = JSON.stringify(model)
      expect(JSON.stringify(scoreCompletedAnswers(model, completedAnswers))).toBe(expected)
      expect(JSON.stringify(model)).toBe(before)
    }
  })

  test('is independent of answer key insertion and valid multi-select order', () => {
    const expected = JSON.stringify(scoreCompletedAnswers(
      classificationModel,
      completedAnswers,
    ))
    const entries = Object.entries(completedAnswers)
    for (let offset = 0; offset < entries.length; offset += 1) {
      const rotated = [...entries.slice(offset), ...entries.slice(0, offset)]
      for (const reverseSource of [false, true]) {
        const answers = Object.fromEntries(rotated.map(([key, value]) => [
          key,
          key === 'source' && reverseSource ? [...value].reverse() : [...value],
        ])) as unknown as CompletedAnswers
        const before = JSON.stringify(answers)
        expect(JSON.stringify(scoreCompletedAnswers(classificationModel, answers))).toBe(expected)
        expect(JSON.stringify(answers)).toBe(before)
      }
    }
  })

  test('resolves exactly one subtype for every accepted noodle option', () => {
    const noodleIds = classificationModel.questionModel.questions
      .find(({ id }) => id === 'noodle')!.options.map(({ id }) => id)
    expect(noodleIds).toHaveLength(5)
    for (const noodleId of noodleIds) {
      const answers = { ...completedAnswers, noodle: [noodleId] } as CompletedAnswers
      const result = scoreCompletedAnswers(classificationModel, answers)
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.outcome.trace.styleCandidates.every(({ subtypeResolution }) => (
        subtypeResolution.noodleOptionId === noodleId
        && subtypeResolution.matchingSubtypeIds.length === 1
        && subtypeResolution.selectedSubtypeId.endsWith(`:${noodleId}`)
      ))).toBe(true)
    }
  })

  test('is repeatable, deeply frozen, input-immutable, and environment-independent', () => {
    const modelBefore = JSON.stringify(classificationModel)
    const answersBefore = JSON.stringify(completedAnswers)
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
      const outputs = Array.from({ length: 8 }, () => (
        scoreCompletedAnswers(classificationModel, completedAnswers)
      ))
      expect(new Set(outputs.map((output) => JSON.stringify(output))).size).toBe(1)
      for (const output of outputs) expectDeeplyFrozen(output)
      expectDeeplyFrozen(scoreCompletedAnswers(classificationModel, {} as CompletedAnswers))
      expect(JSON.stringify(classificationModel)).toBe(modelBefore)
      expect(JSON.stringify(completedAnswers)).toBe(answersBefore)
    } finally {
      clock.mockRestore()
      random.mockRestore()
      locale.mockRestore()
    }
  })
})
