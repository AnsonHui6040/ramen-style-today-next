export { compileClassification, type CompileResult } from './compile.js'
export { DiagnosticCollector } from './collector.js'
export { parseDefinitionBundle } from './parse.js'
export {
  compileQuestions,
  type CompileQuestionsResult,
} from './questions/compile.js'
export { renderQuestionArtifact } from './questions/serialize.js'
export {
  definitionBundleSchema,
  questionDefinitionSourceSchema,
  type DefinitionBundleSource,
  type QuestionDefinitionSource,
} from './source-schema.js'
export { stableJson } from './stable-json.js'
export { compareCodePoints } from '../contracts/source-path.js'
export { classificationDefinition } from '../definitions/classification.js'
export { questionDefinitions } from '../definitions/questions.js'
export {
  applyAnswer,
  evaluateFlow,
  getNextInteractiveQuestion,
  getPreviousInteractiveQuestion,
  updatePendingSelection,
} from '../flow/index.js'
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
export type {
  AnswerDraft,
  OptionId,
  PendingQuestionState,
  QuestionId,
} from '../flow/index.js'
