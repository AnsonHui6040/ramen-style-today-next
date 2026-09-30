import {
  canContinue,
  completeAnswers,
  forcedOptionId,
  orderedQuestions,
  previousQuestionId,
  resolveOptionIds,
  selectOption,
  settleFrom,
  type FlowAnswers,
} from '@ramen-style/classification-core'
import type { ClassificationModel } from '@ramen-style/classification-core/compiler'

import type { ParityAnswers, ParityEngine } from './engine.js'


function toFlow(answers: ParityAnswers): FlowAnswers {
  const flow: Record<string, string[]> = {}
  for (const id of ['form', 'archetype', 'tare', 'body', 'noodle'] as const) {
    flow[id] = answers[id] ? [answers[id]] : []
  }
  flow.source = [...answers.source]
  flow.signature = [...answers.signature]
  flow.exclusions = [...answers.exclusions]
  return flow
}

function fromFlow(flow: FlowAnswers): ParityAnswers {
  const single = (id: string) => flow[id]?.[0]
  return {
    form: single('form'),
    archetype: single('archetype'),
    tare: single('tare'),
    source: [...(flow.source ?? [])],
    body: single('body'),
    noodle: single('noodle'),
    signature: [...(flow.signature ?? [])],
    exclusions: [...(flow.exclusions ?? [])],
  }
}

export function createNewEngine(model: ClassificationModel): ParityEngine {
  return {
    questions: () => orderedQuestions(model).map((question) => ({
      id: question.id,
      selectionType: question.selectionType,
      minSelections: question.minSelections,
      maxSelections: question.maxSelections,
    })),
    options: (questionId, answers) => [...resolveOptionIds(model, questionId, toFlow(answers))],
    forced: (questionId, answers) => forcedOptionId(model, questionId, toFlow(answers)),
    select: (questionId, answers, value) => (
      fromFlow(selectOption(model, toFlow(answers), questionId, value))
    ),
    settle: (answers, questionId) => {
      const position = settleFrom(model, toFlow(answers), questionId)
      return { questionId: position.questionId, answers: fromFlow(position.answers) }
    },
    previous: (answers, questionId) => previousQuestionId(model, toFlow(answers), questionId),
    canContinue: (answers, questionId) => canContinue(model, toFlow(answers), questionId),
    complete: (answers) => {
      const completed = completeAnswers(model, toFlow(answers))
      return completed ? fromFlow(completed) : null
    },
  }
}

