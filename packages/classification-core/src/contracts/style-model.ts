import type { Diagnostic } from './diagnostic.js'

export type StyleId = string
export type StyleFamilyId = 'soup' | 'tsukemen' | 'dry'
export type IntensityId = 'clean' | 'standard' | 'heavy'
export type NoodleId =
  | 'thin-straight'
  | 'medium-thin-straight'
  | 'medium-thick-straight'
  | 'medium-thick-wavy'
  | 'extra-thick'
export type ExclusionTagId =
  | 'pork'
  | 'chicken'
  | 'duck'
  | 'fish-seafood'
  | 'shellfish'
  | 'dairy'
export type MatchTier = 'exact' | 'adjacent' | 'partial'
export type CoreId = `${StyleId}:${IntensityId}`
export type SubtypeId = `${CoreId}:${NoodleId}`
export type RuleId = `${CoreId}:${string}`

export interface StyleRuleTierDefinition {
  readonly tier: MatchTier
  readonly optionIds: readonly string[]
}

export interface StyleRuleDefinition {
  readonly questionId: string
  readonly tiers: readonly StyleRuleTierDefinition[]
}

export interface AdjustmentConditionDefinition {
  readonly priority: number
  readonly questionId: string
  readonly optionIds: readonly string[]
}

export interface BonusDefinition {
  readonly id: string
  readonly priority: number
  readonly labelMessageId: string
  readonly points: number
  readonly minMatches: number
  readonly conditions: readonly AdjustmentConditionDefinition[]
}

export interface ConflictDefinition {
  readonly id: string
  readonly priority: number
  readonly labelMessageId: string
  readonly penalty: number
  readonly whenAll: readonly AdjustmentConditionDefinition[]
}

export interface IntensityOverrideDefinition {
  readonly rules: readonly StyleRuleDefinition[]
}

export interface StyleTaxonomyDefinition {
  readonly sourceFile: string
  readonly families: readonly {
    readonly id: StyleFamilyId
    readonly priority: number
    readonly formOptionId: string
  }[]
  readonly intensities: readonly {
    readonly id: IntensityId
    readonly priority: number
    readonly labelMessageId: string
    readonly summaryMessageId: string
    readonly bodyRule: StyleRuleDefinition
  }[]
  readonly noodles: readonly {
    readonly id: NoodleId
    readonly priority: number
    readonly labelMessageId: string
    readonly summaryMessageId: string
  }[]
  readonly exclusionTags: readonly {
    readonly id: ExclusionTagId
    readonly priority: number
    readonly exclusionsOptionId: string
  }[]
  readonly ruleQuestions: readonly {
    readonly questionId: string
    readonly priority: number
    readonly source: 'style-base' | 'intensity-profile'
  }[]
}

export interface StyleDefinition {
  readonly sourceFile: string
  readonly id: string
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly messageIds: {
    readonly label: string
    readonly summary: string
  }
  readonly accent: string
  readonly supportedIntensityIds: readonly IntensityId[]
  readonly supportedNoodleIds: readonly NoodleId[]
  readonly baseRules: readonly StyleRuleDefinition[]
  readonly intensityOverrides?: Readonly<
    Partial<Record<IntensityId, IntensityOverrideDefinition>>
  >
  readonly bonuses: readonly BonusDefinition[]
  readonly conflicts: readonly ConflictDefinition[]
  readonly exclusionTags: readonly ExclusionTagId[]
}

export interface StyleDefinitionBundleSource {
  readonly sourceFile: string
  readonly modelVersion: string
  readonly taxonomy: StyleTaxonomyDefinition
  readonly definitions: readonly StyleDefinition[]
}

export interface StyleSourceReference {
  readonly sourceFile: string
  readonly path: string
}

export interface StyleRuleProvenance extends StyleSourceReference {
  readonly inheritedFrom:
    | 'style-base'
    | 'intensity-profile'
    | 'style-intensity-override'
}

export interface CompiledRuleTarget {
  readonly optionId: string
  readonly tier: 'exact' | 'adjacent' | 'partial'
  readonly priority: number
}

export interface CompiledStyleRule {
  readonly id: RuleId
  readonly parentStyleId: StyleId
  readonly parentCoreId: CoreId
  readonly questionId: string
  readonly priority: number
  readonly targets: readonly CompiledRuleTarget[]
  readonly fallbackTier: 'miss'
  readonly provenance: StyleRuleProvenance
}

export interface CompiledSubtype {
  readonly id: SubtypeId
  readonly parentStyleId: StyleId
  readonly parentCoreId: CoreId
  readonly noodleId: NoodleId
  readonly priority: number
  readonly messageIds: {
    readonly labelTemplate: string
    readonly summaryTemplate: string
  }
  readonly provenance: readonly StyleSourceReference[]
}

export interface CompiledCore {
  readonly id: CoreId
  readonly parentStyleId: StyleId
  readonly intensityId: IntensityId
  readonly priority: number
  readonly messageIds: {
    readonly labelTemplate: string
    readonly summaryTemplate: string
  }
  readonly rules: readonly CompiledStyleRule[]
  readonly subtypes: readonly CompiledSubtype[]
  readonly provenance: readonly StyleSourceReference[]
}

export interface CompiledAdjustmentCondition {
  readonly priority: number
  readonly questionId: string
  readonly optionIds: readonly string[]
  readonly provenance: StyleSourceReference
}

export interface CompiledBonus {
  readonly kind: 'bonus'
  readonly id: string
  readonly priority: number
  readonly labelMessageId: string
  readonly points: number
  readonly minMatches: number
  readonly conditions: readonly CompiledAdjustmentCondition[]
  readonly appliesToCoreIds: readonly CoreId[]
  readonly provenance: StyleSourceReference
}

export interface CompiledConflict {
  readonly kind: 'conflict'
  readonly id: string
  readonly priority: number
  readonly labelMessageId: string
  readonly penalty: number
  readonly whenAll: readonly CompiledAdjustmentCondition[]
  readonly appliesToCoreIds: readonly CoreId[]
  readonly provenance: StyleSourceReference
}

export type CompiledAdjustment = CompiledBonus | CompiledConflict

export interface CompiledStyle {
  readonly id: StyleId
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly messageIds: {
    readonly label: string
    readonly summary: string
  }
  readonly accent: string
  readonly supportedIntensityIds: readonly IntensityId[]
  readonly supportedNoodleIds: readonly NoodleId[]
  readonly cores: readonly CompiledCore[]
  readonly adjustments: readonly CompiledAdjustment[]
  readonly exclusionTags: readonly ExclusionTagId[]
  readonly provenance: StyleSourceReference
}

export interface CompiledStyleModelMetadata {
  readonly schemaVersion: '1'
  readonly compilerVersion: '1'
  readonly modelVersion: string
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly sourceHash: string
  readonly semanticHash: string
  readonly dataVersion: string
}

export interface CompiledExclusionTag {
  readonly id: ExclusionTagId
  readonly priority: number
  readonly questionId: 'exclusions'
  readonly optionId: string
  readonly provenance: StyleSourceReference
}

export type CompiledStyleInventoryRecord =
  | {
      readonly key: `style/${StyleId}`
      readonly kind: 'style'
      readonly id: StyleId
      readonly sourceFile: string
      readonly messageIds: readonly string[]
    }
  | {
      readonly key: `intensity/${CoreId}`
      readonly kind: 'intensity'
      readonly id: CoreId
      readonly sourceFile: string
      readonly messageIds: readonly string[]
    }
  | {
      readonly key: `noodle/${SubtypeId}`
      readonly kind: 'noodle'
      readonly id: SubtypeId
      readonly sourceFile: string
      readonly messageIds: readonly string[]
    }

export interface CompiledStyleModel {
  readonly metadata: CompiledStyleModelMetadata
  readonly exclusionTags: readonly CompiledExclusionTag[]
  readonly styles: readonly CompiledStyle[]
  readonly inventory: readonly CompiledStyleInventoryRecord[]
}

export interface ResolvedStyleCoreRule {
  readonly questionId: string
  readonly tiers: readonly StyleRuleTierDefinition[]
  readonly provenance: StyleRuleProvenance
}

export interface StyleCoreStageCore {
  readonly id: CoreId
  readonly parentStyleId: StyleId
  readonly intensityId: IntensityId
  readonly priority: number
  readonly messageIds: {
    readonly labelTemplate: string
    readonly summaryTemplate: string
  }
  readonly resolvedRules: readonly ResolvedStyleCoreRule[]
  readonly provenance: readonly StyleSourceReference[]
}

export interface StyleCoreStageStyle {
  readonly id: StyleId
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly messageIds: {
    readonly label: string
    readonly summary: string
  }
  readonly accent: string
  readonly supportedIntensityIds: readonly IntensityId[]
  readonly supportedNoodleIds: readonly NoodleId[]
  readonly cores: readonly StyleCoreStageCore[]
  readonly exclusionTags: readonly ExclusionTagId[]
  readonly provenance: StyleSourceReference
}

export interface StyleCoreStage {
  readonly kind: 'style-core-stage'
  readonly modelVersion: string
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly styles: readonly StyleCoreStageStyle[]
}

export type CompileStyleCoresResult =
  | {
      readonly ok: true
      readonly coreStage: StyleCoreStage
      readonly diagnostics: readonly Diagnostic[]
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly Diagnostic[]
    }

export interface StyleSubtypeStageCore {
  readonly id: CoreId
  readonly parentStyleId: StyleId
  readonly intensityId: IntensityId
  readonly priority: number
  readonly messageIds: {
    readonly labelTemplate: string
    readonly summaryTemplate: string
  }
  readonly resolvedRules: readonly ResolvedStyleCoreRule[]
  readonly subtypes: readonly CompiledSubtype[]
  readonly provenance: readonly StyleSourceReference[]
}

export interface StyleSubtypeStageStyle {
  readonly id: StyleId
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly messageIds: {
    readonly label: string
    readonly summary: string
  }
  readonly accent: string
  readonly supportedIntensityIds: readonly IntensityId[]
  readonly supportedNoodleIds: readonly NoodleId[]
  readonly cores: readonly StyleSubtypeStageCore[]
  readonly exclusionTags: readonly ExclusionTagId[]
  readonly provenance: StyleSourceReference
}

export interface StyleSubtypeStage {
  readonly kind: 'style-subtype-stage'
  readonly modelVersion: string
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly styles: readonly StyleSubtypeStageStyle[]
}

export type CompileStyleSubtypesResult =
  | {
      readonly ok: true
      readonly subtypeStage: StyleSubtypeStage
      readonly diagnostics: readonly Diagnostic[]
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly Diagnostic[]
    }

export interface StyleRulesStageCore {
  readonly id: CoreId
  readonly parentStyleId: StyleId
  readonly intensityId: IntensityId
  readonly priority: number
  readonly messageIds: {
    readonly labelTemplate: string
    readonly summaryTemplate: string
  }
  readonly rules: readonly CompiledStyleRule[]
  readonly subtypes: readonly CompiledSubtype[]
  readonly provenance: readonly StyleSourceReference[]
}

export interface StyleRulesStageStyle {
  readonly id: StyleId
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly messageIds: {
    readonly label: string
    readonly summary: string
  }
  readonly accent: string
  readonly supportedIntensityIds: readonly IntensityId[]
  readonly supportedNoodleIds: readonly NoodleId[]
  readonly cores: readonly StyleRulesStageCore[]
  readonly adjustments: readonly CompiledAdjustment[]
  readonly exclusionTags: readonly ExclusionTagId[]
  readonly provenance: StyleSourceReference
}

export interface StyleRulesStage {
  readonly kind: 'style-rules-stage'
  readonly modelVersion: string
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly exclusionTags: readonly CompiledExclusionTag[]
  readonly styles: readonly StyleRulesStageStyle[]
}

export type CompileStyleRulesResult =
  | {
      readonly ok: true
      readonly rulesStage: StyleRulesStage
      readonly diagnostics: readonly Diagnostic[]
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly Diagnostic[]
    }

export type CompileStylesResult =
  | {
      readonly ok: true
      readonly model: CompiledStyleModel
      readonly diagnostics: readonly Diagnostic[]
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly Diagnostic[]
    }
