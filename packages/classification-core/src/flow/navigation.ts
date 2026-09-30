import type { ClassificationModel } from '../contracts/model.js'
import { writeAnswer } from './answers.js'
import { forcedOptionId, orderedQuestions } from './options.js'
import type { FlowAnswers, FlowPosition } from './types.js'

export function firstQuestionId(model: ClassificationModel) {
  return orderedQuestions(model)[0]?.id
}

export function isLastQuestion(model: ClassificationModel, questionId: string) {
  const questions = orderedQuestions(model)
  return questions[questions.length - 1]?.id === questionId
}

/**
 * Starting at a question, writes every automatically resolved answer and stops at the first
 * question that needs the user (or the last question).
 */
export function settleFrom(
  model: ClassificationModel,
  answers: FlowAnswers,
  questionId: string,
): FlowPosition {
  const questions = orderedQuestions(model)
  let index = Math.max(0, questions.findIndex((question) => question.id === questionId))
  let current = answers
  while (index < questions.length) {
    const question = questions[index]!
    const forced = forcedOptionId(model, question.id, current)
    if (!forced) break
    current = writeAnswer(current, question.id, [forced])
    index += 1
  }
  return {
    questionId: questions[Math.min(index, questions.length - 1)]!.id,
    answers: current,
  }
}

/** The position after continuing from a question, or undefined when it is the last question. */
export function nextPosition(
  model: ClassificationModel,
  answers: FlowAnswers,
  questionId: string,
): FlowPosition | undefined {
  const questions = orderedQuestions(model)
  const index = questions.findIndex((question) => question.id === questionId)
  if (index < 0 || index === questions.length - 1) return undefined
  return settleFrom(model, answers, questions[index + 1]!.id)
}

/** The nearest earlier question the user must answer, skipping automatically resolved ones. */
export function previousQuestionId(
  model: ClassificationModel,
  answers: FlowAnswers,
  questionId: string,
): string {
  const questions = orderedQuestions(model)
  const index = questions.findIndex((question) => question.id === questionId)
  let previous = Math.max(0, index - 1)
  while (previous > 0 && forcedOptionId(model, questions[previous]!.id, answers)) previous -= 1
  return questions[previous]!.id
}
