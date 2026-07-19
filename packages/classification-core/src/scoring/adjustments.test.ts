import { describe, expect, test } from 'vitest'

import type { CompiledScoringPolicy } from '../contracts/scoring-policy.js'
import type {
  CompiledBonus,
  CompiledConflict,
  CompiledStyle,
} from '../contracts/style-model.js'
import { evaluateAdjustments } from './adjustments.js'
import { scoreCoreCandidates } from './core.js'
import {
  classificationModel,
  cloneClassificationModel,
  completedAnswers,
} from './test-fixtures.js'

function cappedAdjustmentStyle(): {
  readonly style: CompiledStyle
  readonly coreId: string
} {
  const model = cloneClassificationModel()
  const style = model.styleModel.styles[0]!
  const coreId = style.cores[0]!.id
  const templateBonus = style.adjustments.find(
    ({ kind }) => kind === 'bonus',
  ) as CompiledBonus | undefined
  const templateConflict = model.styleModel.styles
    .flatMap(({ adjustments }) => adjustments)
    .find(({ kind }) => kind === 'conflict') as CompiledConflict | undefined
  if (!templateBonus || !templateConflict) throw new Error('Adjustment fixture missing')
  const condition = {
    priority: 0,
    questionId: 'form',
    optionIds: ['soup'],
    provenance: templateBonus.conditions[0]!.provenance,
  } as const
  const bonus: CompiledBonus = {
    ...templateBonus,
    id: 'capped-bonus',
    points: 9,
    minMatches: 1,
    conditions: [condition],
    appliesToCoreIds: [coreId],
  }
  const conflict: CompiledConflict = {
    ...templateConflict,
    id: 'capped-conflict',
    penalty: 20,
    whenAll: [condition],
    appliesToCoreIds: [coreId],
  }
  return { style: { ...style, adjustments: [conflict, bonus] }, coreId }
}

describe('scoring adjustments', () => {
  test('traces all applicable adjustments in bonus/conflict priority order', () => {
    const traces = classificationModel.styleModel.styles.flatMap((style) => (
      scoreCoreCandidates(classificationModel.policy, style, completedAnswers)
    ))
    const lines = traces.flatMap(({ adjustmentLines }) => adjustmentLines)

    expect(new Set(lines.filter(({ kind }) => kind === 'bonus').map(({ id }) => id)).size).toBe(18)
    expect(new Set(lines.filter(({ kind }) => kind === 'conflict').map(({ id }) => id)).size).toBe(7)
    expect(lines.filter(({ kind }) => kind === 'bonus')).toHaveLength(54)
    expect(lines.filter(({ kind }) => kind === 'conflict')).toHaveLength(21)
    expect(lines.some(({ kind }) => kind === 'bonus')).toBe(true)
    expect(lines.some(({ kind }) => kind === 'conflict')).toBe(true)
    expect(lines.some(({ status }) => status === 'inactive')).toBe(true)
    for (const trace of traces) {
      expect(trace.bonusTotal).toBeLessThanOrEqual(5)
      expect(trace.penaltyTotal).toBeLessThanOrEqual(15)
      expect(trace.preFloorTotal * 10).toBe(
        trace.baseTotal * 10 + trace.bonusTotal * 10 - trace.penaltyTotal * 10,
      )
      expect(trace.finalTotal).toBe(Math.max(0, trace.preFloorTotal))
      expect(trace.adjustmentLines.map(({ kind }) => kind)).toEqual(
        [...trace.adjustmentLines]
          .sort((left, right) => (
            (left.kind === 'bonus' ? 0 : 1) - (right.kind === 'bonus' ? 0 : 1)
              || left.priority - right.priority
          ))
          .map(({ kind }) => kind),
      )
    }
  })

  test('preserves compiled question-option order in condition evidence', () => {
    const style = classificationModel.styleModel.styles.find(({ id }) => (
      id === 'chicken-chintan'
    ))!
    const coreId = style.cores.find(({ intensityId }) => intensityId === 'clean')!.id
    const line = evaluateAdjustments(
      classificationModel.policy,
      style,
      coreId,
      completedAnswers,
    ).lines.find(({ id }) => id === 'chicken-clear')!
    expect(line.conditions.find(({ questionId }) => questionId === 'body')).toMatchObject({
      targetOptionIds: ['light', 'balanced'],
      matchedOptionIds: ['balanced'],
    })
  })

  test('rounds bounded bonus ratios, then caps bonus and conflict budgets', () => {
    const { style, coreId } = cappedAdjustmentStyle()
    const result = evaluateAdjustments(
      classificationModel.policy,
      style,
      coreId,
      completedAnswers,
    )

    expect(result.lines).toMatchObject([
      {
        kind: 'bonus',
        status: 'capped',
        requestedPoints: 9,
        budgetBefore: 5,
        appliedPoints: 5,
        budgetAfter: 0,
      },
      {
        kind: 'conflict',
        status: 'capped',
        requestedPoints: 20,
        budgetBefore: 15,
        appliedPoints: 15,
        budgetAfter: 0,
      },
    ])
    expect(result).toMatchObject({ bonusTotal: 5, penaltyTotal: 15 })

    const ratioBonus = style.adjustments.find(
      ({ kind }) => kind === 'bonus',
    ) as CompiledBonus | undefined
    if (!ratioBonus) throw new Error('Bonus fixture missing')
    const rationalStyle: CompiledStyle = {
      ...style,
      adjustments: [{
        ...ratioBonus,
        points: 1,
        minMatches: 2,
        conditions: [
          ratioBonus.conditions[0]!,
          { ...ratioBonus.conditions[0]!, priority: 1, questionId: 'archetype', optionIds: ['chintan'] },
          { ...ratioBonus.conditions[0]!, priority: 2, questionId: 'tare', optionIds: ['miso'] },
        ],
      }],
    }
    expect(evaluateAdjustments(
      classificationModel.policy,
      rationalStyle,
      coreId,
      completedAnswers,
    ).lines[0]).toMatchObject({
      matchedCount: 2,
      matchRatio: 2 / 3,
      requestedPoints: 0.7,
      appliedPoints: 0.7,
    })
  })

  test('retains active zero-applied capped lines', () => {
    const { style, coreId } = cappedAdjustmentStyle()
    const policy = structuredClone(classificationModel.policy) as CompiledScoringPolicy
    ;(policy.adjustments as { bonusCap: number }).bonusCap = 0
    expect(evaluateAdjustments(policy, style, coreId, completedAnswers).lines[0]).toMatchObject({
      kind: 'bonus',
      status: 'capped',
      requestedPoints: 9,
      appliedPoints: 0,
      budgetBefore: 0,
      budgetAfter: 0,
    })
  })

  test('floors a negative fixed-point pre-total at zero', () => {
    const { style, coreId } = cappedAdjustmentStyle()
    const policy = structuredClone(classificationModel.policy) as CompiledScoringPolicy
    ;(policy as { tiers: typeof policy.tiers }).tiers = policy.tiers.map((tier) => ({
      ...tier,
      ratio: 0,
    }))
    const trace = scoreCoreCandidates(policy, style, completedAnswers)
      .find((candidate) => candidate.coreId === coreId)!
    expect(trace).toMatchObject({
      baseTotal: 0,
      bonusTotal: 5,
      penaltyTotal: 15,
      preFloorTotal: -10,
      finalTotal: 0,
    })
  })
})
