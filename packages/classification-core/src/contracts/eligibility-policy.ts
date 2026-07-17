import type { CompiledScoringPolicy } from './scoring-policy.js'
import type { ExclusionTagId, StyleId } from './style-model.js'

export type EligibilityRuleId = `exclusion:${string}`

export interface EligibilityRuleDefinition {
  readonly id: EligibilityRuleId
  readonly priority: number
  readonly exclusionOptionId: string
  readonly restrictionTagIds: readonly string[]
}

export interface EligibilityPolicyDefinition {
  readonly sourceFile: string
  readonly modelVersion: 'batch3c.1.0'
  readonly exclusionsQuestionId: 'exclusions'
  readonly noneOptionId: string
  readonly rules: readonly EligibilityRuleDefinition[]
  readonly selection: {
    readonly ordering: 'scoring-rank-stable-subsequence'
    readonly primaryLimit: number
    readonly alternativeLimit: number
    readonly blockedLead: 'highest-blocked-primary-gte-eligible-lead'
  }
}

export interface CompiledEligibilityRule {
  readonly id: EligibilityRuleId
  readonly priority: number
  readonly exclusionOptionId: string
  readonly restrictionTagIds: readonly ExclusionTagId[]
  readonly blockedStyleIds: readonly StyleId[]
}

export interface CompiledEligibilityPolicyMetadata {
  readonly schemaVersion: '1'
  readonly compilerVersion: '1'
  readonly modelVersion: 'batch3c.1.0'
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly styleModelVersion: string
  readonly styleSemanticHash: string
  readonly styleDataVersion: string
  readonly scoringPolicyModelVersion: string
  readonly scoringPolicySemanticHash: string
  readonly scoringPolicyDataVersion: string
  readonly sourceHash: string
  readonly semanticHash: string
  readonly dataVersion: string
}

export interface CompiledEligibilityPolicy {
  readonly metadata: CompiledEligibilityPolicyMetadata
  readonly exclusionsQuestionId: 'exclusions'
  readonly noneOptionId: 'none'
  readonly rules: readonly CompiledEligibilityRule[]
  readonly selection: EligibilityPolicyDefinition['selection']
}

export type EligibilityScoringIdentity = Pick<
  CompiledScoringPolicy['metadata'],
  'modelVersion' | 'semanticHash' | 'dataVersion'
>
