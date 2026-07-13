import { compareCodePoints } from '../contracts/source-path.js'
import { questionModel } from '../generated/question-model.js'
import type { FlowState, QuestionId } from './types.js'

const displayQuestionIds = questionModel.questions
  .map(({ id, order }) => ({ id, order }))
  .sort((left, right) => left.order - right.order || compareCodePoints(left.id, right.id))
  .map(({ id }) => id as QuestionId)

const questionPositions = new Map(
  displayQuestionIds.map((questionId, index) => [questionId, index]),
)
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)

export function getFirstActionableQuestion(state: FlowState): QuestionId | undefined {
  if (state.status !== 'incomplete') return undefined
  const interactive = new Set(state.interactiveQuestionIds)
  return displayQuestionIds.find((questionId) => (
    interactive.has(questionId) && !hasOwn(state.canonicalAnswers, questionId)
  ))
}

function getInteractiveQuestion(
  state: FlowState,
  fromQuestionId: QuestionId,
  direction: 1 | -1,
): QuestionId | undefined {
  if (state.status !== 'incomplete') return undefined
  const fromPosition = questionPositions.get(fromQuestionId)
  if (fromPosition === undefined) {
    throw new Error(`Unknown question ID ${fromQuestionId}`)
  }

  const interactive = new Set(state.interactiveQuestionIds)
  for (
    let position = fromPosition + direction;
    position >= 0 && position < displayQuestionIds.length;
    position += direction
  ) {
    const questionId = displayQuestionIds[position]!
    if (interactive.has(questionId)) return questionId
  }
  return undefined
}

export function getNextInteractiveQuestion(
  state: FlowState,
  fromQuestionId: QuestionId,
): QuestionId | undefined {
  return getInteractiveQuestion(state, fromQuestionId, 1)
}

export function getPreviousInteractiveQuestion(
  state: FlowState,
  fromQuestionId: QuestionId,
): QuestionId | undefined {
  return getInteractiveQuestion(state, fromQuestionId, -1)
}
