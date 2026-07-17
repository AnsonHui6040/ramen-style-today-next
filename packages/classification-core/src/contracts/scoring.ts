import type { OptionId, QuestionId } from '../flow/types.js'
import type { ScoringMatchTier } from './scoring-policy.js'
import type {
  CoreId,
  RuleId,
  StyleFamilyId,
  StyleId,
  SubtypeId,
} from './style-model.js'

export type { ScoringMatchTier } from './scoring-policy.js'

export type ScoringDiagnosticCode =
  | 'SCORING_COMPLETED_ANSWERS_INVALID'
  | 'SCORING_MODEL_IDENTITY_MISMATCH'
  | 'SCORING_INVARIANT_FAILED'

export type ScoringDiagnostic =
  | {
      readonly severity: 'error'
      readonly code: 'SCORING_COMPLETED_ANSWERS_INVALID'
      readonly sourceFile: 'runtime://scoring'
      readonly path: '/answers'
      readonly message: 'Completed answers are invalid for this classification model'
    }
  | {
      readonly severity: 'error'
      readonly code: 'SCORING_MODEL_IDENTITY_MISMATCH'
      readonly sourceFile: 'runtime://scoring'
      readonly path: '/model'
      readonly message: 'Classification model identity is invalid for scoring'
    }
  | {
      readonly severity: 'error'
      readonly code: 'SCORING_INVARIANT_FAILED'
      readonly sourceFile: 'runtime://scoring'
      readonly path: '/trace'
      readonly message: 'Scoring invariant verification failed'
    }

export type AdjustmentTraceStatus = 'inactive' | 'applied' | 'capped'

export interface QuestionScoreTraceLine {
  readonly questionId: QuestionId
  readonly questionPriority: number
  readonly answerOptionIds: readonly OptionId[]
  readonly ruleId: RuleId
  readonly rulePriority: number
  readonly tier: ScoringMatchTier
  readonly tierPriority: number
  readonly matchedOptionIds: readonly OptionId[]
  readonly ratio: number
  readonly weight: number
  readonly rawPoints: number
  readonly points: number
}

export interface ConditionScoreTrace {
  readonly priority: number
  readonly questionId: QuestionId
  readonly answerOptionIds: readonly OptionId[]
  readonly targetOptionIds: readonly OptionId[]
  readonly matchedOptionIds: readonly OptionId[]
  readonly matched: boolean
}

export interface AdjustmentScoreTraceLine {
  readonly kind: 'bonus' | 'conflict'
  readonly id: string
  readonly priority: number
  readonly labelMessageId: string
  readonly status: AdjustmentTraceStatus
  readonly conditions: readonly ConditionScoreTrace[]
  readonly matchedCount: number
  readonly requiredMatchCount: number
  readonly matchRatio: number
  readonly operand: number
  readonly requestedPoints: number
  readonly budgetBefore: number
  readonly appliedPoints: number
  readonly budgetAfter: number
}

export interface CoreRankingKeys {
  readonly score: number
  readonly corePriority: number
  readonly coreId: CoreId
}

export interface CoreScoreTrace {
  readonly styleId: StyleId
  readonly coreId: CoreId
  readonly corePriority: number
  readonly questionLines: readonly QuestionScoreTraceLine[]
  readonly adjustmentLines: readonly AdjustmentScoreTraceLine[]
  readonly baseTotal: number
  readonly bonusTotal: number
  readonly penaltyTotal: number
  readonly preFloorTotal: number
  readonly finalTotal: number
  readonly rankingKeys: CoreRankingKeys
  readonly selected: boolean
}

export interface SubtypeResolutionTrace {
  readonly noodleOptionId: OptionId
  readonly matchingSubtypeIds: readonly [SubtypeId]
  readonly selectedSubtypeId: SubtypeId
}

export interface StyleRankingKeys {
  readonly score: number
  readonly displayPriority: number
  readonly styleId: StyleId
}

export type ConfidenceDeductionTrace =
  | {
      readonly priority: number
      readonly kind: 'answer-includes'
      readonly questionId: QuestionId
      readonly optionId: OptionId
      readonly matched: boolean
      readonly deduction: number
    }
  | {
      readonly priority: number
      readonly kind: 'applied-conflict-count'
      readonly count: number
      readonly deductionEach: number
      readonly deductionCap: number
      readonly deduction: number
    }

export interface ConfidenceTrace {
  readonly maximumDerivation: 'base-weight-total-plus-bonus-cap'
  readonly maximumScore: number
  readonly score: number
  readonly nextScore: number
  readonly scoreGap: number
  readonly base: number
  readonly gapMultiplier: number
  readonly gapBoostBeforeCap: number
  readonly gapBoostCap: number
  readonly gapBoost: number
  readonly deductions: readonly ConfidenceDeductionTrace[]
  readonly uncertaintyTotal: number
  readonly rawConfidence: number
  readonly rounding: 'nearest-integer-ties-toward-positive-infinity'
  readonly roundedConfidence: number
  readonly minimum: number
  readonly maximum: number
  readonly confidence: number
}

export interface StyleScoreTrace {
  readonly styleId: StyleId
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly coreCandidates: readonly CoreScoreTrace[]
  readonly selectedCoreId: CoreId
  readonly subtypeResolution: SubtypeResolutionTrace
  readonly rankingKeys: StyleRankingKeys
  readonly group: 'primary' | 'alternative'
  readonly groupRank: number
  readonly displayPosition: number | null
  readonly confidence: ConfidenceTrace | null
}

export interface RankingTraceEntry {
  readonly styleId: StyleId
  readonly score: number
  readonly displayPriority: number
  readonly rankingKeys: StyleRankingKeys
  readonly groupRank: number
  readonly selected: boolean
}

export interface LowConfidenceTrace {
  readonly hasPrimaryResult: boolean
  readonly topConfidence: number | null
  readonly confidenceThreshold: number
  readonly confidenceBelowThreshold: boolean
  readonly topScore: number | null
  readonly secondScore: number | null
  readonly scoreGap: number | null
  readonly scoreGapThreshold: number
  readonly scoreGapBelowThreshold: boolean
  readonly lowConfidence: boolean
}

export interface ScoreTrace {
  readonly modelVersion: string
  readonly dataVersion: string
  readonly questionModelIdentity: {
    readonly modelVersion: string
    readonly semanticHash: string
  }
  readonly styleModelIdentity: {
    readonly modelVersion: string
    readonly semanticHash: string
    readonly dataVersion: string
  }
  readonly policyIdentity: {
    readonly semanticHash: string
    readonly dataVersion: string
  }
  readonly styleCandidates: readonly StyleScoreTrace[]
  readonly primaryRanking: readonly RankingTraceEntry[]
  readonly alternativeRanking: readonly RankingTraceEntry[]
  readonly selectedPrimaryStyleIds: readonly StyleId[]
  readonly selectedAlternativeStyleIds: readonly StyleId[]
  readonly lowConfidence: LowConfidenceTrace
}

export interface ScoredStyleResult {
  readonly styleId: StyleId
  readonly coreId: CoreId
  readonly subtypeId: SubtypeId
  readonly score: number
  readonly confidence: number
  readonly trace: StyleScoreTrace
}

export interface ScoringOutcome {
  readonly modelVersion: string
  readonly dataVersion: string
  readonly results: readonly ScoredStyleResult[]
  readonly alternativeResults: readonly ScoredStyleResult[]
  readonly lowConfidence: boolean
  readonly trace: ScoreTrace
}

export type ScoreCompletedAnswersResult =
  | { readonly ok: true; readonly outcome: ScoringOutcome }
  | { readonly ok: false; readonly diagnostics: readonly [ScoringDiagnostic] }
