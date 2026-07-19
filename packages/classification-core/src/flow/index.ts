export { applyAnswer } from './apply-answer.js'
export { decodeAnswerDraft } from './decode.js'
export { evaluateFlow } from './evaluate.js'
export {
  getFirstActionableQuestion,
  getNextInteractiveQuestion,
  getPreviousInteractiveQuestion,
} from './navigation.js'
export { updatePendingSelection } from './pending-selection.js'
export type {
  AnswerDraft,
  AnswerSubmission,
  ApplyAnswerResult,
  CanonicalAnswers,
  CompletedAnswers,
  DecodeAnswerDraftResult,
  DecodedAnswerDraft,
  FlowRepair,
  FlowState,
  FlowStateBase,
  ForcedAnswer,
  ForcedAnswerChange,
  OptionId,
  PendingQuestionState,
  PendingSelectionOperation,
  PendingSelectionResult,
  QuestionId,
} from './types.js'
