import { DiagnosticCollector } from '../compiler/collector.js'
import type { ClassificationModel } from '../contracts/model.js'
import { canContinue } from '../flow/answers.js'
import { completeAnswers } from '../flow/complete.js'
import {
  forcedOptionId,
  isExclusiveOption,
  orderedQuestions,
  resolveOptionIds,
} from '../flow/options.js'
import type { FlowAnswers } from '../flow/types.js'
import { classificationStateSource, type RepairResult } from './contracts.js'
import { deepFreeze } from './freeze.js'
import { questionOptionIds } from './options.js'

export interface RepairOptions {
  /** Diagnostic source; defaults to the versioned classification state. */
  readonly sourceFile?: string
}

/**
 * Repairs stored answers into a usable questionnaire state using only the compiled model and
 * the Batch 2A flow. Steps: A per-question repair, B forced answers and first actionable
 * question, C completion, D resume question. Pure, deterministic and idempotent.
 */
export function repairAnswers(
  model: ClassificationModel,
  answers: FlowAnswers,
  requestedQuestionId?: string,
  options: RepairOptions = {},
): RepairResult {
  const sourceFile = options.sourceFile ?? classificationStateSource
  const collector = new DiagnosticCollector()
  const questions = orderedQuestions(model)
  const known = new Set(questions.map((question) => question.id))

  for (const key of Object.keys(answers)) {
    if (!known.has(key)) collector.warning({
      code: 'REPAIR_ANSWER_UNKNOWN_QUESTION',
      sourceFile,
      path: `/answers/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
      entityId: key,
      message: `Answers for unknown question ${key} were dropped`,
    })
  }

  // Step A: per-question repair, in question order, over a working copy.
  const work: Record<string, string[]> = {}
  const changed = new Set<string>()
  for (const question of questions) {
    const path = `/answers/${question.id}`
    let values = Object.hasOwn(answers, question.id) ? [...(answers[question.id] ?? [])] : []
    const dependencyBroken = question.dependsOn.some((dependency) => (
      changed.has(dependency)
      || ((work[dependency] ?? []).length === 0 && !forcedOptionId(model, dependency, work))
    ))

    if (dependencyBroken) {
      if (values.length > 0) {
        collector.warning({
          code: 'REPAIR_DEPENDENTS_CLEARED',
          sourceFile,
          path,
          entityId: question.id,
          message: `Answers for ${question.id} were cleared because an upstream answer is missing or was repaired`,
        })
        changed.add(question.id)
      }
      work[question.id] = []
      continue
    }

    const universe = new Set(questionOptionIds(question))
    const before = values.length
    values = values.filter((value, index) => {
      if (universe.has(value)) return true
      collector.warning({
        code: 'REPAIR_ANSWER_UNKNOWN_OPTION',
        sourceFile,
        path: `${path}/${index}`,
        entityId: question.id,
        message: `Unknown option ${value} for question ${question.id}; the value was dropped`,
      })
      return false
    })
    let modified = values.length !== before

    const offered = resolveOptionIds(model, question.id, work)
    const beforeOffered = values.length
    values = values.filter((value) => {
      if (offered.includes(value)) return true
      collector.warning({
        code: 'REPAIR_ANSWER_NOT_OFFERED',
        sourceFile,
        path,
        entityId: question.id,
        message: `Option ${value} is not offered for question ${question.id} under the current answers; the value was dropped`,
      })
      return false
    })
    modified ||= values.length !== beforeOffered

    values = values.filter((value, index) => values.indexOf(value) === index)

    if (values.length > 1 && values.some((value) => isExclusiveOption(question, value))) {
      values = values.filter((value) => !isExclusiveOption(question, value))
      collector.warning({
        code: 'REPAIR_EXCLUSIVE_CONFLICT',
        sourceFile,
        path,
        entityId: question.id,
        message: `An exclusive option was combined with other options in ${question.id}; the exclusive option was removed`,
      })
      modified = true
    }

    if (values.length > question.maxSelections) {
      values = values.slice(0, question.maxSelections)
      collector.warning({
        code: 'REPAIR_ANSWER_OVER_LIMIT',
        sourceFile,
        path,
        entityId: question.id,
        message: `More than ${question.maxSelections} selections in ${question.id}; the first ${question.maxSelections} in stored order were kept`,
      })
      modified = true
    }

    if (values.length === 0 && question.emptyFallbackOptionId) {
      values = [question.emptyFallbackOptionId]
    }
    if (modified) changed.add(question.id)
    work[question.id] = values
  }

  // Step B: write forced answers and find the first actionable question.
  let firstActionable = -1
  for (const [index, question] of questions.entries()) {
    if (canContinue(model, work, question.id)) continue
    const forced = forcedOptionId(model, question.id, work)
    if (forced) {
      work[question.id] = [forced]
      collector.warning({
        code: 'REPAIR_FORCED_ANSWER_APPLIED',
        sourceFile,
        path: `/answers/${question.id}`,
        entityId: question.id,
        message: `Question ${question.id} has a single option and was answered automatically`,
      })
      continue
    }
    firstActionable = index
    break
  }

  // Step C: completion is decided by the flow's completeAnswers, never by repair itself.
  const completed = firstActionable === -1 ? completeAnswers(model, work) : undefined
  const complete = completed !== undefined

  // Step D: resume question.
  const interactiveAtOrAfter = (from: number) => {
    for (let index = from; index < questions.length; index += 1) {
      if (!forcedOptionId(model, questions[index]!.id, work)) return index
    }
    return questions.length - 1
  }
  const fallback = firstActionable === -1 ? questions.length - 1 : firstActionable
  const requestedIndex = requestedQuestionId === undefined
    ? undefined
    : questions.findIndex((question) => question.id === requestedQuestionId)
  let resumeIndex = fallback
  if (requestedIndex !== undefined) {
    const beforeActionable = requestedIndex >= 0
      && (firstActionable === -1 || requestedIndex <= firstActionable)
    if (beforeActionable) {
      resumeIndex = interactiveAtOrAfter(requestedIndex)
    } else {
      collector.warning({
        code: 'REPAIR_RESUME_MOVED',
        sourceFile,
        path: '/currentQuestionId',
        ...(requestedQuestionId === undefined ? {} : { entityId: requestedQuestionId }),
        message: requestedIndex < 0
          ? `Unknown resume question ${requestedQuestionId}; resuming at ${questions[fallback]!.id}`
          : `Resume question ${requestedQuestionId} is after the first actionable question; resuming at ${questions[fallback]!.id}`,
      })
    }
  }

  const ordered: Record<string, readonly string[]> = {}
  for (const question of questions) ordered[question.id] = work[question.id] ?? []
  return deepFreeze({
    answers: ordered,
    resumeQuestionId: questions[resumeIndex]!.id,
    complete,
    ...(completed ? { completedAnswers: completed } : {}),
    diagnostics: collector.toArray(),
  })
}
