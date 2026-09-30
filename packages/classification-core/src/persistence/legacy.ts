import type { DiagnosticCollector } from '../compiler/collector.js'
import type { ClassificationModel } from '../contracts/model.js'
import { isExclusiveOption, orderedQuestions } from '../flow/options.js'
import {
  CURRENT_SCHEMA_VERSION,
  legacyStateSource,
  type StoredClassificationPayload,
} from './contracts.js'
import { deepFreeze, isPlainObject } from './freeze.js'
import { questionOptionIds } from './options.js'

/** Retired legacy values expanded in place, keyed by question ID. */
const legacyAliases: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  exclusions: { seafood: ['fish-seafood', 'shellfish', 'shrimp-crab'] },
}

/**
 * Migrates the legacy unversioned browser state into the version 1 payload.
 * Reads only `answers` and `stepIndex`; every other legacy field belongs to the app envelope.
 * Applies exactly the legacy sanitization (`restoreUserAnswers`) and nothing more: selection
 * limits and cross-question consistency are repair concerns.
 */
export function legacyUnversionedToV1(
  input: Readonly<Record<string, unknown>>,
  model: ClassificationModel,
  collector: DiagnosticCollector,
): StoredClassificationPayload {
  const questions = orderedQuestions(model)
  const ignored = (path: string, message: string) => collector.warning({
    code: 'MIGRATION_LEGACY_FIELD_IGNORED',
    sourceFile: legacyStateSource,
    path,
    message,
  })

  const rawAnswers = Object.hasOwn(input, 'answers') ? input.answers : undefined
  if (rawAnswers !== undefined && !isPlainObject(rawAnswers)) {
    ignored('/answers', 'Legacy answers must be an object; the field was ignored')
  }
  const source = isPlainObject(rawAnswers) ? rawAnswers : {}

  const answers: Record<string, readonly string[]> = {}
  for (const question of questions) {
    const path = `/answers/${question.id}`
    const universe = new Set(questionOptionIds(question))
    const raw = Object.hasOwn(source, question.id) ? source[question.id] : undefined
    let values: string[] = []

    if (question.selectionType === 'single') {
      if (typeof raw === 'string') {
        if (universe.has(raw)) {
          values = [raw]
        } else {
          collector.warning({
            code: 'REPAIR_ANSWER_UNKNOWN_OPTION',
            sourceFile: legacyStateSource,
            path,
            entityId: question.id,
            message: `Unknown option ${raw} for question ${question.id}; the value was dropped`,
          })
        }
      } else if (raw !== undefined) {
        ignored(path, `Legacy value for ${question.id} must be a string; the field was ignored`)
      }
    } else if (Array.isArray(raw)) {
      const aliases = legacyAliases[question.id] ?? {}
      const expanded: { value: unknown; index: number }[] = []
      raw.forEach((entry, index) => {
        const target = typeof entry === 'string' ? aliases[entry] : undefined
        if (target) {
          collector.warning({
            code: 'MIGRATION_LEGACY_ALIAS_EXPANDED',
            sourceFile: legacyStateSource,
            path: `${path}/${index}`,
            entityId: question.id,
            message: `Retired value ${String(entry)} was expanded to ${target.join(', ')}`,
          })
          for (const value of target) expanded.push({ value, index })
        } else {
          expanded.push({ value: entry, index })
        }
      })
      for (const { value, index } of expanded) {
        if (typeof value !== 'string' || !universe.has(value)) {
          collector.warning({
            code: 'REPAIR_ANSWER_UNKNOWN_OPTION',
            sourceFile: legacyStateSource,
            path: `${path}/${index}`,
            entityId: question.id,
            message: `Unknown option ${String(value)} for question ${question.id}; the value was dropped`,
          })
        } else if (!values.includes(value)) {
          values.push(value)
        }
      }
      if (values.length > 1) values = values.filter((value) => !isExclusiveOption(question, value))
    } else if (raw !== undefined) {
      ignored(path, `Legacy value for ${question.id} must be an array; the field was ignored`)
    }

    if (values.length === 0 && question.emptyFallbackOptionId) {
      values = [question.emptyFallbackOptionId]
    }
    answers[question.id] = values
  }

  const rawStep = Object.hasOwn(input, 'stepIndex') ? input.stepIndex : undefined
  const validStep = typeof rawStep === 'number' && Number.isInteger(rawStep) && rawStep >= 0
  if (rawStep !== undefined && !validStep) {
    ignored('/stepIndex', 'Legacy step index must be a non-negative integer; the field was ignored')
  }
  const stepIndex = validStep ? Math.min(rawStep, questions.length - 1) : 0

  const payload: StoredClassificationPayload = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    modelVersion: model.modelVersion,
    dataVersion: model.dataVersion,
    ...(questions[stepIndex] ? { currentQuestionId: questions[stepIndex].id } : {}),
    answers,
  }
  return deepFreeze(payload)
}
