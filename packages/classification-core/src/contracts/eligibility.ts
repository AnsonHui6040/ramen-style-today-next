import type { EligibilityRuleId } from './eligibility-policy.js'
import type { ScoringOutcome, StyleScoreTrace } from './scoring.js'
import type {
  CoreId,
  ExclusionTagId,
  StyleFamilyId,
  StyleId,
  SubtypeId,
} from './style-model.js'

export type EligibilityDiagnosticCode =
  | 'ELIGIBILITY_COMPLETED_ANSWERS_INVALID'
  | 'ELIGIBILITY_SCORING_RESULT_INVALID'
  | 'ELIGIBILITY_MODEL_IDENTITY_MISMATCH'
  | 'ELIGIBILITY_DECISION_UNRESOLVED'
  | 'ELIGIBILITY_INVARIANT_FAILED'

export interface EligibilityDiagnostic {
  readonly severity: 'error'
  readonly code: EligibilityDiagnosticCode
  readonly sourceFile: 'runtime://eligibility'
  readonly path: '/answers' | '/scoringOutcome' | '/model' | '/decisions' | '/trace'
  readonly message:
    | 'Completed answers are invalid for eligibility evaluation'
    | 'Scoring outcome is invalid for eligibility evaluation'
    | 'Classification model identity is invalid for eligibility evaluation'
    | 'An eligibility decision could not be resolved'
    | 'Eligibility invariant verification failed'
}

export interface EligibilityReason {
  readonly code: 'ELIGIBILITY_EXCLUSION_CONFLICT'
  readonly ruleId: EligibilityRuleId
  readonly exclusionOptionId: string
  readonly restrictionTagId: ExclusionTagId
  readonly styleId: StyleId
  readonly coreId: CoreId
  readonly subtypeId: SubtypeId
}

export interface EligibilityCandidate {
  readonly styleId: StyleId
  readonly coreId: CoreId
  readonly subtypeId: SubtypeId
  readonly family: StyleFamilyId
  readonly group: 'primary' | 'alternative'
  readonly originalRank: number
  readonly originalDisplayPosition: number | null
  readonly score: number
  readonly confidence: number | null
  readonly scoringTrace: StyleScoreTrace
  readonly decision: 'eligible' | 'blocked'
  readonly reasons: readonly EligibilityReason[]
}

export interface EligibilityRuleEvaluation {
  readonly ruleId: EligibilityRuleId
  readonly exclusionOptionId: string
  readonly active: boolean
  readonly restrictionTagIds: readonly ExclusionTagId[]
  readonly matchedRestrictionTagIds: readonly ExclusionTagId[]
}

export interface EligibilityCandidateEvaluation {
  readonly styleId: StyleId
  readonly coreId: CoreId
  readonly subtypeId: SubtypeId
  readonly evaluatedRestrictionTagIds: readonly ExclusionTagId[]
  readonly rules: readonly EligibilityRuleEvaluation[]
  readonly decision: 'eligible' | 'blocked'
  readonly reasons: readonly EligibilityReason[]
}

export interface EligibilityTrace {
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
  readonly scoringIdentity: {
    readonly modelVersion: string
    readonly semanticHash: string
    readonly dataVersion: string
  }
  readonly selectedExclusions: readonly string[]
  readonly originalPrimaryStyleIds: readonly StyleId[]
  readonly originalAlternativeStyleIds: readonly StyleId[]
  readonly candidateDecisions: readonly EligibilityCandidate[]
  readonly candidateEvaluations: readonly EligibilityCandidateEvaluation[]
  readonly eligiblePrimaryStyleIds: readonly StyleId[]
  readonly eligibleAlternativeStyleIds: readonly StyleId[]
  readonly selectedPrimaryStyleIds: readonly StyleId[]
  readonly selectedAlternativeStyleIds: readonly StyleId[]
  readonly blockedLeadStyleId: StyleId | null
  readonly noPrimaryEligible: boolean
  readonly noEligibleCandidate: boolean
}

export interface EligibilityOutcome {
  readonly modelVersion: string
  readonly dataVersion: string
  readonly originalScoringOutcome: ScoringOutcome
  readonly selectedExclusions: readonly string[]
  readonly candidateDecisions: readonly EligibilityCandidate[]
  readonly eligiblePrimaryRanking: readonly EligibilityCandidate[]
  readonly eligibleAlternativeRanking: readonly EligibilityCandidate[]
  readonly selectedPrimary: EligibilityCandidate | null
  readonly selectedPrimaryResults: readonly EligibilityCandidate[]
  readonly selectedAlternatives: readonly EligibilityCandidate[]
  readonly blockedCandidates: readonly EligibilityCandidate[]
  readonly blockedLead: EligibilityCandidate | null
  readonly noPrimaryEligible: boolean
  readonly noEligibleCandidate: boolean
  readonly diagnostics: readonly []
  readonly trace: EligibilityTrace
}

export type EvaluateEligibilityResult =
  | { readonly ok: true; readonly outcome: EligibilityOutcome }
  | { readonly ok: false; readonly diagnostics: readonly [EligibilityDiagnostic] }
