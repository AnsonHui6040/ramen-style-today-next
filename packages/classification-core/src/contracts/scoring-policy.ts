export type ScoringMatchTier = 'exact' | 'adjacent' | 'partial' | 'miss'
export type ScoreRoundingPolicy = 'nearest-score-unit-ties-up'
export type ConfidenceRoundingPolicy =
  'nearest-integer-ties-toward-positive-infinity'

export interface ScoredQuestionPolicyDefinition {
  readonly questionId: string
  readonly priority: number
  readonly weight: number
}

export interface TierPolicyDefinition {
  readonly tier: ScoringMatchTier
  readonly priority: number
  readonly ratio: number
}

export type ConfidenceUncertaintyDefinition =
  | {
      readonly kind: 'answer-includes'
      readonly questionId: string
      readonly optionId: string
      readonly deduction: number
      readonly priority: number
    }
  | {
      readonly kind: 'applied-conflict-count'
      readonly deductionEach: number
      readonly deductionCap: number
      readonly priority: number
    }

export interface ScoringPolicyDefinition {
  readonly sourceFile: string
  readonly modelVersion: 'batch3b.1.0'
  readonly scoredQuestions: readonly ScoredQuestionPolicyDefinition[]
  readonly tiers: readonly TierPolicyDefinition[]
  readonly arithmetic: {
    readonly scoreDecimalPlaces: 1
    readonly scoreRounding: ScoreRoundingPolicy
    readonly scoreFloor: number
  }
  readonly adjustments: {
    readonly phases: readonly ('bonus' | 'conflict')[]
    readonly bonusCap: number
    readonly penaltyCap: number
  }
  readonly ranking: {
    readonly coreKeys: readonly (
      'score-desc' | 'core-priority-asc' | 'core-id-asc'
    )[]
    readonly styleKeys: readonly (
      'score-desc' | 'display-priority-asc' | 'style-id-asc'
    )[]
    readonly primaryFamilyQuestionId: 'form'
    readonly primaryLimit: number
    readonly alternativeLimit: number
  }
  readonly confidence: {
    readonly maximumDerivation: 'base-weight-total-plus-bonus-cap'
    readonly rounding: ConfidenceRoundingPolicy
    readonly lastResultGap: number
    readonly gapMultiplier: number
    readonly gapBoostCap: number
    readonly minimum: number
    readonly maximum: number
    readonly lowConfidenceThreshold: number
    readonly lowConfidenceTieGap: number
    readonly uncertainty: readonly ConfidenceUncertaintyDefinition[]
  }
}

export interface CompiledScoringPolicyMetadata {
  readonly schemaVersion: '1'
  readonly compilerVersion: '1'
  readonly modelVersion: string
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly styleModelVersion: string
  readonly styleSemanticHash: string
  readonly sourceHash: string
  readonly semanticHash: string
  readonly dataVersion: string
}

export interface CompiledScoringPolicy {
  readonly metadata: CompiledScoringPolicyMetadata
  readonly scoredQuestions: readonly ScoredQuestionPolicyDefinition[]
  readonly tiers: readonly TierPolicyDefinition[]
  readonly arithmetic: ScoringPolicyDefinition['arithmetic']
  readonly adjustments: {
    readonly phases: readonly ('bonus' | 'conflict')[]
    readonly bonusCap: number
    readonly penaltyCap: number
  }
  readonly ranking: {
    readonly coreKeys: readonly (
      'score-desc' | 'core-priority-asc' | 'core-id-asc'
    )[]
    readonly styleKeys: readonly (
      'score-desc' | 'display-priority-asc' | 'style-id-asc'
    )[]
    readonly primaryFamilyQuestionId: 'form'
    readonly primaryLimit: number
    readonly alternativeLimit: number
  }
  readonly confidence: ScoringPolicyDefinition['confidence']
  readonly derived: {
    readonly baseWeightTotal: number
    readonly maximumScore: number
    readonly scoreScale: 10
  }
}
