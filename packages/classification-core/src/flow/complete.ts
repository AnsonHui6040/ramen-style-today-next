import type { ClassificationModel } from '../contracts/model.js'
import { isExclusiveOption, orderedQuestions, resolveOptionIds } from './options.js'
import type { FlowAnswers } from './types.js'

/**
 * Normalizes answers (drops unknown and duplicate values, removes an exclusive option chosen
 * together with others, restores the empty fallback) and returns them only when every question
 * is validly answered; otherwise undefined.
 */
export function completeAnswers(
  model: ClassificationModel,
  answers: FlowAnswers,
): FlowAnswers | undefined {
  const result: Record<string, readonly string[]> = {}
  for (const question of orderedQuestions(model)) {
    const offered = resolveOptionIds(model, question.id, result)
    const known = [...new Set(answers[question.id] ?? [])].filter((id) => (
      question.optionSet.kind === 'flat'
        ? question.optionSet.options.some((option) => option.id === id)
        : question.optionSet.branches.some((branch) => branch.options.some((option) => option.id === id))
    ))
    let values = known.length > 1
      ? known.filter((id) => !isExclusiveOption(question, id))
      : known
    if (!values.length && question.emptyFallbackOptionId) values = [question.emptyFallbackOptionId]
    if (values.length < question.minSelections
      || values.length > question.maxSelections
      || !values.every((id) => offered.includes(id))) return undefined
    result[question.id] = Object.freeze(values)
  }
  return Object.freeze(result)
}
