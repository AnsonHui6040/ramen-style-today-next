import { compareCodePoints } from '../contracts/source-path.js'
import type { CompiledScoringPolicy } from '../contracts/scoring-policy.js'
import type {
  AdjustmentScoreTraceLine,
  ConditionScoreTrace,
} from '../contracts/scoring.js'
import type {
  CompiledAdjustment,
  CompiledAdjustmentCondition,
  CompiledStyle,
} from '../contracts/style-model.js'
import type { CompletedAnswers, OptionId, QuestionId } from '../flow/types.js'
import { ScoringInvariantError } from './trace.js'

const scale = 10
const toUnits = (value: number) => {
  const units = value * scale
  if (!Number.isSafeInteger(units) || units < 0) throw new ScoringInvariantError()
  return units
}
const fromUnits = (value: number) => value / scale
const roundRatioUnits = (operandUnits: number, count: number, total: number) => {
  if (!Number.isSafeInteger(operandUnits * count) || total <= 0) {
    throw new ScoringInvariantError()
  }
  return Math.floor((operandUnits * count) / total + 0.5)
}

function conditionTrace(
  condition: CompiledAdjustmentCondition,
  answers: CompletedAnswers,
): ConditionScoreTrace {
  const answerOptionIds = answers[condition.questionId as QuestionId]
  if (!answerOptionIds) throw new ScoringInvariantError()
  const targets = new Set(condition.optionIds)
  const matchedOptionIds = answerOptionIds.filter((optionId) => targets.has(optionId))
  return {
    priority: condition.priority,
    questionId: condition.questionId as QuestionId,
    answerOptionIds: [...answerOptionIds] as OptionId[],
    targetOptionIds: [...condition.optionIds] as OptionId[],
    matchedOptionIds: matchedOptionIds as OptionId[],
    matched: matchedOptionIds.length > 0,
  }
}

export interface AdjustmentEvaluation {
  readonly lines: readonly AdjustmentScoreTraceLine[]
  readonly bonusTotal: number
  readonly penaltyTotal: number
}

export function evaluateAdjustments(
  policy: CompiledScoringPolicy,
  style: CompiledStyle,
  coreId: string,
  answers: CompletedAnswers,
): AdjustmentEvaluation {
  let bonusRemaining = toUnits(policy.adjustments.bonusCap)
  let penaltyRemaining = toUnits(policy.adjustments.penaltyCap)
  let bonusApplied = 0
  let penaltyApplied = 0
  const phaseOrder = new Map(policy.adjustments.phases.map((phase, index) => [phase, index]))
  const applicable = style.adjustments.filter(({ appliesToCoreIds }) => (
    appliesToCoreIds.includes(coreId as never)
  )).sort((left, right) => (
    (phaseOrder.get(left.kind) ?? Number.MAX_SAFE_INTEGER)
      - (phaseOrder.get(right.kind) ?? Number.MAX_SAFE_INTEGER)
      || left.priority - right.priority
      || compareCodePoints(left.id, right.id)
  ))
  const lines: AdjustmentScoreTraceLine[] = []
  for (const adjustment of applicable) {
    const conditions = [...(
      adjustment.kind === 'bonus' ? adjustment.conditions : adjustment.whenAll
    )].sort((left, right) => (
      left.priority - right.priority
        || compareCodePoints(left.questionId, right.questionId)
    )).map((condition) => conditionTrace(condition, answers))
    if (conditions.length === 0) throw new ScoringInvariantError()
    const matchedCount = conditions.filter(({ matched }) => matched).length
    const requiredMatchCount = adjustment.kind === 'bonus'
      ? adjustment.minMatches
      : conditions.length
    const active = matchedCount >= requiredMatchCount
    const operand = adjustment.kind === 'bonus' ? adjustment.points : adjustment.penalty
    const operandUnits = toUnits(operand)
    const requestedUnits = active
      ? adjustment.kind === 'bonus'
        ? roundRatioUnits(operandUnits, matchedCount, conditions.length)
        : operandUnits
      : 0
    const budgetBeforeUnits = adjustment.kind === 'bonus'
      ? bonusRemaining
      : penaltyRemaining
    const appliedUnits = Math.min(requestedUnits, budgetBeforeUnits)
    const budgetAfterUnits = budgetBeforeUnits - appliedUnits
    if (adjustment.kind === 'bonus') {
      bonusRemaining = budgetAfterUnits
      bonusApplied += appliedUnits
    } else {
      penaltyRemaining = budgetAfterUnits
      penaltyApplied += appliedUnits
    }
    lines.push({
      kind: adjustment.kind,
      id: adjustment.id,
      priority: adjustment.priority,
      labelMessageId: adjustment.labelMessageId,
      status: !active ? 'inactive' : requestedUnits > budgetBeforeUnits ? 'capped' : 'applied',
      conditions,
      matchedCount,
      requiredMatchCount,
      matchRatio: matchedCount / conditions.length,
      operand,
      requestedPoints: fromUnits(requestedUnits),
      budgetBefore: fromUnits(budgetBeforeUnits),
      appliedPoints: fromUnits(appliedUnits),
      budgetAfter: fromUnits(budgetAfterUnits),
    })
  }
  return {
    lines,
    bonusTotal: fromUnits(bonusApplied),
    penaltyTotal: fromUnits(penaltyApplied),
  }
}

export function adjustmentIsBonus(adjustment: CompiledAdjustment): boolean {
  return adjustment.kind === 'bonus'
}
