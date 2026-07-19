import type { CompiledScoringPolicy } from '../contracts/scoring-policy.js'
import type { CoreScoreTrace } from '../contracts/scoring.js'
import type { CompiledStyle } from '../contracts/style-model.js'
import type { CompletedAnswers } from '../flow/types.js'
import { evaluateAdjustments } from './adjustments.js'
import { evaluateCoreRuleLines, roundScore } from './rules.js'
import { ScoringInvariantError } from './trace.js'

export function scoreCoreCandidates(
  policy: CompiledScoringPolicy,
  style: CompiledStyle,
  answers: CompletedAnswers,
): readonly CoreScoreTrace[] {
  const ids = new Set<string>()
  const priorities = new Set<number>()
  return style.cores.map((core) => {
    if (ids.has(core.id) || priorities.has(core.priority)) throw new ScoringInvariantError()
    ids.add(core.id)
    priorities.add(core.priority)
    const questionLines = evaluateCoreRuleLines(policy, core, answers)
    const baseUnits = questionLines.reduce((total, line) => (
      total + Math.round(line.points * 10)
    ), 0)
    if (!Number.isSafeInteger(baseUnits)) throw new ScoringInvariantError()
    const baseTotal = baseUnits / 10
    const adjustments = evaluateAdjustments(policy, style, core.id, answers)
    const preFloorUnits = Math.round(baseTotal * 10)
      + Math.round(adjustments.bonusTotal * 10)
      - Math.round(adjustments.penaltyTotal * 10)
    if (!Number.isSafeInteger(preFloorUnits)) throw new ScoringInvariantError()
    const preFloorTotal = preFloorUnits / 10
    const finalTotal = roundScore(
      Math.max(policy.arithmetic.scoreFloor, preFloorTotal),
      policy.arithmetic.scoreRounding,
    )
    if (![baseTotal, preFloorTotal, finalTotal].every(Number.isFinite)) {
      throw new ScoringInvariantError()
    }
    return {
      styleId: style.id,
      coreId: core.id,
      corePriority: core.priority,
      questionLines,
      adjustmentLines: adjustments.lines,
      baseTotal,
      bonusTotal: adjustments.bonusTotal,
      penaltyTotal: adjustments.penaltyTotal,
      preFloorTotal,
      finalTotal,
      rankingKeys: {
        score: finalTotal,
        corePriority: core.priority,
        coreId: core.id,
      },
      selected: false,
    }
  })
}
