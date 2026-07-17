import {
  questionModel,
  updatePendingSelection,
  type FlowState,
  type OptionId,
  type PendingQuestionState,
  type QuestionId,
} from '@ramen-style/classification-core'

export function pendingQuestionState(
  questionId: QuestionId,
  flow: FlowState,
): PendingQuestionState {
  const question = questionModel.questions.find(({ id }) => id === questionId)
  if (!question) throw new Error(`Unknown question ${questionId}`)
  return {
    questionId,
    optionOrder: question.options.map(({ id }) => id),
    allowedOptionIds: flow.allowedOptionIdsByQuestion[questionId] ?? [],
    exclusiveOptionIds: question.options.filter(({ exclusive }) => exclusive).map(({ id }) => id),
    minSelections: question.selection.min,
    maxSelections: question.selection.max,
    initialUiOptionIds: question.initialUiOptionIds,
    emptyBehavior: question.pendingSelection.emptyBehavior,
  }
}

export function togglePendingOption(
  state: PendingQuestionState,
  pendingOptionIds: readonly OptionId[],
  optionId: OptionId,
) {
  return updatePendingSelection(state, pendingOptionIds, {
    type: pendingOptionIds.includes(optionId) ? 'deselect' : 'select',
    optionId,
  })
}
