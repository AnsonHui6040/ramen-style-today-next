import type { ClassificationModel } from '../contracts/model.js'
import type { FlowAnswers, FlowQuestion } from './types.js'

export function orderedQuestions(model: ClassificationModel): readonly FlowQuestion[] {
  return [...model.questions].sort((left, right) => left.order - right.order)
}

export function findQuestion(model: ClassificationModel, questionId: string) {
  return model.questions.find((question) => question.id === questionId)
}

function singleAnswer(answers: FlowAnswers, questionId: string) {
  return answers[questionId]?.[0]
}

/** Option IDs offered for a question, in definition order, given the current answers. */
export function resolveOptionIds(
  model: ClassificationModel,
  questionId: string,
  answers: FlowAnswers,
): readonly string[] {
  const question = findQuestion(model, questionId)
  if (!question) return []
  const set = question.optionSet
  let options: readonly { readonly id: string }[]
  if (set.kind === 'flat') {
    options = set.options
  } else {
    const selected = singleAnswer(answers, set.by)
    options = selected
      ? set.branches.find((branch) => branch.when === selected)?.options ?? []
      : []
  }
  const selector = question.restriction && singleAnswer(answers, question.restriction.by)
  const allowed = question.restriction?.allow.find((entry) => entry.when === selector)
  const ids = options.map((option) => option.id)
  return allowed ? ids.filter((id) => allowed.optionIds.includes(id)) : ids
}

export function isExclusiveOption(question: FlowQuestion, optionId: string) {
  const options = question.optionSet.kind === 'flat'
    ? question.optionSet.options
    : question.optionSet.branches.flatMap((branch) => branch.options)
  return options.some((option) => option.id === optionId && option.exclusive === true)
}

/** The option a question resolves to automatically, when it is configured to and only one remains. */
export function forcedOptionId(
  model: ClassificationModel,
  questionId: string,
  answers: FlowAnswers,
): string | undefined {
  const question = findQuestion(model, questionId)
  if (!question?.autoSelectSingleOption) return undefined
  const ids = resolveOptionIds(model, questionId, answers)
  return ids.length === 1 ? ids[0] : undefined
}
