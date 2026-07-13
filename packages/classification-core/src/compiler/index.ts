export { compileClassification, type CompileResult } from './compile.js'
export { DiagnosticCollector } from './collector.js'
export { parseDefinitionBundle } from './parse.js'
export {
  definitionBundleSchema,
  questionDefinitionSourceSchema,
  type DefinitionBundleSource,
  type QuestionDefinitionSource,
} from './source-schema.js'
export { stableJson } from './stable-json.js'
export { compareCodePoints } from '../contracts/source-path.js'
export { syntheticDefinition } from '../definitions/synthetic.js'
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
export type { Diagnostic } from '../contracts/diagnostic.js'
