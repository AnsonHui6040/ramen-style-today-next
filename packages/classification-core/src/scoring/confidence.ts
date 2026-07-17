import type { CompiledScoringPolicy } from '../contracts/scoring-policy.js'
import type {
  ConfidenceDeductionTrace,
  ConfidenceTrace,
  LowConfidenceTrace,
  StyleScoreTrace,
} from '../contracts/scoring.js'
import type { CompletedAnswers, QuestionId } from '../flow/types.js'
import type { RankedStyleCandidates } from './ranking.js'
import { ScoringInvariantError } from './trace.js'

export function roundConfidence(
  value: number,
  token: CompiledScoringPolicy['confidence']['rounding'],
) {
  if (token !== 'nearest-integer-ties-toward-positive-infinity' || !Number.isFinite(value)) {
    throw new ScoringInvariantError()
  }
  return Math.round(value)
}

export function computeConfidenceTrace(
  policy: CompiledScoringPolicy,
  answers: CompletedAnswers,
  candidate: StyleScoreTrace,
  nextScore: number,
): ConfidenceTrace {
  const score = candidate.rankingKeys.score
  const scoreGap = score - nextScore
  const base = score / policy.derived.maximumScore * 100
  const gapBoostBeforeCap = Math.max(0, scoreGap) * policy.confidence.gapMultiplier
  const gapBoost = Math.min(policy.confidence.gapBoostCap, gapBoostBeforeCap)
  const selectedCore = candidate.coreCandidates.find(({ selected }) => selected)
  if (!selectedCore) throw new ScoringInvariantError()
  const deductions = [...policy.confidence.uncertainty]
    .sort((left, right) => left.priority - right.priority)
    .map((uncertainty): ConfidenceDeductionTrace => {
      if (uncertainty.kind === 'answer-includes') {
        const matched = answers[uncertainty.questionId as QuestionId]
          ?.includes(uncertainty.optionId as never) ?? false
        return {
          priority: uncertainty.priority,
          kind: uncertainty.kind,
          questionId: uncertainty.questionId as QuestionId,
          optionId: uncertainty.optionId as never,
          matched,
          deduction: matched ? uncertainty.deduction : 0,
        }
      }
      const count = selectedCore.adjustmentLines.filter((line) => (
        line.kind === 'conflict' && line.appliedPoints > 0
      )).length
      return {
        priority: uncertainty.priority,
        kind: uncertainty.kind,
        count,
        deductionEach: uncertainty.deductionEach,
        deductionCap: uncertainty.deductionCap,
        deduction: Math.min(uncertainty.deductionCap, count * uncertainty.deductionEach),
      }
    })
  const uncertaintyTotal = deductions.reduce((total, deduction) => (
    total + deduction.deduction
  ), 0)
  const rawConfidence = base + gapBoost - uncertaintyTotal
  const roundedConfidence = roundConfidence(rawConfidence, policy.confidence.rounding)
  const confidence = Math.min(
    policy.confidence.maximum,
    Math.max(policy.confidence.minimum, roundedConfidence),
  )
  return {
    maximumDerivation: policy.confidence.maximumDerivation,
    maximumScore: policy.derived.maximumScore,
    score,
    nextScore,
    scoreGap,
    base,
    gapMultiplier: policy.confidence.gapMultiplier,
    gapBoostBeforeCap,
    gapBoostCap: policy.confidence.gapBoostCap,
    gapBoost,
    deductions,
    uncertaintyTotal,
    rawConfidence,
    rounding: policy.confidence.rounding,
    roundedConfidence,
    minimum: policy.confidence.minimum,
    maximum: policy.confidence.maximum,
    confidence,
  }
}

export interface ConfidenceResult extends RankedStyleCandidates {
  readonly lowConfidence: LowConfidenceTrace
}

export function deriveLowConfidence(
  policy: CompiledScoringPolicy,
  primary: readonly { readonly score: number; readonly confidence: number }[],
): LowConfidenceTrace {
  const hasPrimaryResult = primary.length > 0
  const topConfidence = primary[0]?.confidence ?? null
  const topScore = primary[0]?.score ?? null
  const secondScore = hasPrimaryResult ? (primary[1]?.score ?? 0) : null
  const scoreGap = topScore === null || secondScore === null ? null : topScore - secondScore
  const confidenceBelowThreshold = topConfidence === null
    ? false
    : topConfidence < policy.confidence.lowConfidenceThreshold
  const scoreGapBelowThreshold = scoreGap === null
    ? false
    : scoreGap < policy.confidence.lowConfidenceTieGap
  const lowConfidence = !hasPrimaryResult
    || confidenceBelowThreshold
    || scoreGapBelowThreshold
  return {
    hasPrimaryResult,
    topConfidence,
    confidenceThreshold: policy.confidence.lowConfidenceThreshold,
    confidenceBelowThreshold,
    topScore,
    secondScore,
    scoreGap,
    scoreGapThreshold: policy.confidence.lowConfidenceTieGap,
    scoreGapBelowThreshold,
    lowConfidence,
  }
}

export function addConfidence(
  policy: CompiledScoringPolicy,
  answers: CompletedAnswers,
  ranked: RankedStyleCandidates,
): ConfidenceResult {
  const byId = new Map(ranked.styleCandidates.map((candidate) => (
    [candidate.styleId, candidate] as const
  )))
  for (const selectedIds of [
    ranked.selectedPrimaryStyleIds,
    ranked.selectedAlternativeStyleIds,
  ]) {
    for (let index = 0; index < selectedIds.length; index += 1) {
      const candidate = byId.get(selectedIds[index]!)
      if (!candidate) throw new ScoringInvariantError()
      const next = selectedIds[index + 1] ? byId.get(selectedIds[index + 1]!) : undefined
      const nextScore = next
        ? next.rankingKeys.score
        : candidate.rankingKeys.score - policy.confidence.lastResultGap
      byId.set(candidate.styleId, {
        ...candidate,
        confidence: computeConfidenceTrace(policy, answers, candidate, nextScore),
      })
    }
  }
  const styleCandidates = ranked.styleCandidates.map(({ styleId }) => byId.get(styleId)!)
  const primary = ranked.selectedPrimaryStyleIds.map((styleId) => byId.get(styleId)!)
  const lowConfidence = deriveLowConfidence(policy, primary.map((candidate) => {
    if (!candidate.confidence) throw new ScoringInvariantError()
    return {
      score: candidate.rankingKeys.score,
      confidence: candidate.confidence.confidence,
    }
  }))
  return {
    ...ranked,
    styleCandidates,
    lowConfidence,
  }
}
