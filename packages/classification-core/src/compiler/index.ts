export { compileClassification, type CompileResult } from './compile.js'
export { DiagnosticCollector } from './collector.js'
export { parseDefinitionBundle } from './parse.js'
export {
  compileQuestions,
  type CompileQuestionsResult,
} from './questions/compile.js'
export { renderQuestionArtifact } from './questions/serialize.js'
export { compileStyles } from './styles/compile.js'
export { renderStyleArtifact } from './styles/serialize.js'
export {
  compileScoringPolicy,
  type CompileScoringPolicyResult,
} from './scoring-policy/compile.js'
export { proveScoringPolicy } from './scoring-policy/proof.js'
export { scoringPolicyDefinitionSchema } from './scoring-policy/source-schema.js'
export { renderClassificationArtifact } from './classification/serialize.js'
export {
  styleDefinitionBundleSchema,
  styleDefinitionSchema,
} from './styles/source-schema.js'
export {
  definitionBundleSchema,
  questionDefinitionSourceSchema,
  type DefinitionBundleSource,
  type QuestionDefinitionSource,
} from './source-schema.js'
export { stableJson } from './stable-json.js'
export { compareCodePoints } from '../contracts/source-path.js'
export { classificationDefinition } from '../definitions/classification.js'
export { legacyScoringPolicy } from '../definitions/policies.js'
export { questionDefinitions } from '../definitions/questions.js'
export {
  styleDefinitionBundle,
  styleDefinitions,
} from '../definitions/styles/index.js'
export { styleTaxonomy } from '../definitions/styles/taxonomy.js'
export type {
  AllowedOptionDecisionRow,
  AllowedOptionSelection,
  CompiledOption,
  CompiledQuestion,
  CompiledQuestionModel,
  CompiledQuestionModelMetadata,
  OptionDefinitionSource,
  SerializableCondition,
} from '../contracts/question-model.js'
export type {
  ClassificationModel,
  ConceptKey,
  ConceptKind,
  ConceptRecord,
} from '../contracts/model.js'
export type {
  CompiledScoringPolicy,
  CompiledScoringPolicyMetadata,
  ConfidenceRoundingPolicy,
  ConfidenceUncertaintyDefinition,
  ScoredQuestionPolicyDefinition,
  ScoreRoundingPolicy,
  ScoringMatchTier,
  ScoringPolicyDefinition,
  TierPolicyDefinition,
} from '../contracts/scoring-policy.js'
export type { Diagnostic } from '../contracts/diagnostic.js'
export type {
  AdjustmentConditionDefinition,
  BonusDefinition,
  CompiledAdjustment,
  CompiledAdjustmentCondition,
  CompiledBonus,
  CompiledConflict,
  CompiledCore,
  CompiledExclusionTag,
  CompiledRuleTarget,
  CompiledStyle,
  CompiledStyleInventoryRecord,
  CompiledStyleModel,
  CompiledStyleModelMetadata,
  CompiledStyleRule,
  CompiledSubtype,
  CompileStylesResult,
  ConflictDefinition,
  CoreId,
  ExclusionTagId,
  IntensityId,
  IntensityOverrideDefinition,
  MatchTier,
  NoodleId,
  RuleId,
  StyleDefinition,
  StyleDefinitionBundleSource,
  StyleFamilyId,
  StyleId,
  StyleRuleDefinition,
  StyleRuleProvenance,
  StyleRuleTierDefinition,
  StyleSourceReference,
  StyleTaxonomyDefinition,
  SubtypeId,
} from '../contracts/style-model.js'
