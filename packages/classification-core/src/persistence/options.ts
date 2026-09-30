import type { FlowQuestion } from '../flow/types.js'

/** Every option ID a question can ever offer, across all of its branches. */
export function questionOptionIds(question: FlowQuestion): readonly string[] {
  return question.optionSet.kind === 'flat'
    ? question.optionSet.options.map((option) => option.id)
    : question.optionSet.branches.flatMap((branch) => branch.options.map((option) => option.id))
}
