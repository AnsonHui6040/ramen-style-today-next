import type { ClassificationModel } from '../contracts/model.js'
import {
  findQuestion,
  isExclusiveOption,
  resolveOptionIds,
} from './options.js'
import type { FlowAnswers, FlowQuestion } from './types.js'

export function createInitialAnswers(model: ClassificationModel): FlowAnswers {
  const answers: Record<string, readonly string[]> = {}
  for (const question of model.questions) {
    answers[question.id] = question.emptyFallbackOptionId
      ? [question.emptyFallbackOptionId]
      : []
  }
  return Object.freeze(answers)
}

function dependentIds(model: ClassificationModel, questionId: string) {
  const found = new Set<string>()
  const pending = [questionId]
  while (pending.length) {
    const current = pending.pop()!
    for (const question of model.questions) {
      if (question.dependsOn.includes(current) && !found.has(question.id)) {
        found.add(question.id)
        pending.push(question.id)
      }
    }
  }
  return found
}

function write(answers: FlowAnswers, questionId: string, values: readonly string[]): FlowAnswers {
  return Object.freeze({ ...answers, [questionId]: Object.freeze([...values]) })
}

/** Writes one option into a question without validating it against the offered options. */
export function writeAnswer(
  answers: FlowAnswers,
  questionId: string,
  values: readonly string[],
): FlowAnswers {
  return write(answers, questionId, values)
}

function clearDependents(model: ClassificationModel, answers: FlowAnswers, questionId: string) {
  let next = answers
  for (const dependent of dependentIds(model, questionId)) next = write(next, dependent, [])
  return next
}

function selectSingle(
  model: ClassificationModel,
  answers: FlowAnswers,
  question: FlowQuestion,
  optionId: string,
) {
  if (answers[question.id]?.[0] === optionId) return answers
  const written = write(answers, question.id, [optionId])
  return clearDependents(model, written, question.id)
}

function selectMultiple(
  model: ClassificationModel,
  answers: FlowAnswers,
  question: FlowQuestion,
  optionId: string,
) {
  const offered = resolveOptionIds(model, question.id, answers)
  const current = (answers[question.id] ?? []).filter((id) => offered.includes(id))
  if (isExclusiveOption(question, optionId)) return write(answers, question.id, [optionId])
  const withoutExclusive = current.filter((id) => !isExclusiveOption(question, id))
  const next = withoutExclusive.includes(optionId)
    ? withoutExclusive.filter((id) => id !== optionId)
    : withoutExclusive.length < question.maxSelections
      ? [...withoutExclusive, optionId]
      : withoutExclusive
  const fallback = question.emptyFallbackOptionId
  return write(answers, question.id, next.length || !fallback ? next : [fallback])
}

/**
 * Applies a user selection. Selecting an option that is not currently offered is ignored,
 * which the legacy UI could never produce.
 */
export function selectOption(
  model: ClassificationModel,
  answers: FlowAnswers,
  questionId: string,
  optionId: string,
): FlowAnswers {
  const question = findQuestion(model, questionId)
  if (!question || !resolveOptionIds(model, questionId, answers).includes(optionId)) return answers
  return question.selectionType === 'single'
    ? selectSingle(model, answers, question, optionId)
    : selectMultiple(model, answers, question, optionId)
}

/** Selected option IDs that are currently offered, in answer order. */
export function selectedOptionIds(
  model: ClassificationModel,
  answers: FlowAnswers,
  questionId: string,
): readonly string[] {
  const offered = resolveOptionIds(model, questionId, answers)
  return (answers[questionId] ?? []).filter((id) => offered.includes(id))
}

export function canContinue(
  model: ClassificationModel,
  answers: FlowAnswers,
  questionId: string,
): boolean {
  const question = findQuestion(model, questionId)
  return !!question
    && selectedOptionIds(model, answers, questionId).length >= question.minSelections
}
