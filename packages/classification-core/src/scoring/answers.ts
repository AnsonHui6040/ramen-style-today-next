import type { CompiledQuestionModel } from '../contracts/question-model.js'
import { evaluateFlow } from '../flow/evaluate.js'
import type { AnswerDraft, CompletedAnswers } from '../flow/types.js'

export type CompletedAnswerValidation =
  | { readonly ok: true; readonly answers: CompletedAnswers }
  | { readonly ok: false }

const hasOwn = (value: object, key: string) => (
  Object.prototype.hasOwnProperty.call(value, key)
)

function sameSemanticSet(left: unknown, right: readonly string[]): boolean {
  if (!Array.isArray(left) || left.length !== right.length) return false
  if (left.some((value) => typeof value !== 'string')) return false
  if (new Set(left).size !== left.length) return false
  const expected = new Set(right)
  return left.every((value) => expected.has(value))
}

export function validateCompletedAnswers(
  questionModel: CompiledQuestionModel,
  input: unknown,
): CompletedAnswerValidation {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false }
    const questionIds = questionModel.questions.map(({ id }) => id)
    const ownKeys = Reflect.ownKeys(input)
    if (ownKeys.some((key) => typeof key !== 'string')) return { ok: false }
    const inputKeys = ownKeys as string[]
    if (
      inputKeys.length !== questionIds.length
        || inputKeys.some((key) => !questionIds.includes(key))
        || questionIds.some((key) => !hasOwn(input, key))
    ) return { ok: false }

    const state = evaluateFlow(questionModel, input as AnswerDraft)
    if (
      state.status !== 'complete'
        || state.diagnostics.length !== 0
        || state.repairs.length !== 0
    ) return { ok: false }
    for (const questionId of questionIds) {
      if (!sameSemanticSet(
        (input as Record<string, unknown>)[questionId],
        (state.completedAnswers as Readonly<Record<string, readonly string[]>>)[questionId]!,
      )) return { ok: false }
    }
    return { ok: true, answers: state.completedAnswers }
  } catch {
    return { ok: false }
  }
}
