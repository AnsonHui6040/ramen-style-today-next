import { deepFreeze } from '../contracts/deep-freeze.js'
import type { Diagnostic } from '../contracts/diagnostic.js'
import type { CompiledQuestionModel } from '../contracts/question-model.js'
import { decodeAnswerDraft, evaluateFlow } from '../flow/index.js'
import type { AnswerDraft } from '../flow/types.js'
import type {
  AnswerDiagnosticCode,
  PersistenceDiagnostic,
} from './contracts.js'
import {
  appendJsonPointer,
  sortPersistenceDiagnostics,
  summarizeReceived,
} from './diagnostics.js'
import {
  decodeFailure,
  inspectOwnProperty,
  isArrayValue,
  isDecoderReflectionFailure,
  makePersistenceDiagnostic,
  ownEnumerableStringKeys,
  ownValue,
  reflectionFailure,
  scanFailure,
  type DecodeFailure,
} from './decode-envelope.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { persistenceLimits } from './limits.js'

const submittedAnswersPath = '/submittedAnswers'

interface ResourceModelLimits {
  readonly questionLimit: number
  readonly selectionLimits: ReadonlyMap<string, number>
  readonly totalLimit: number
}

export type DecodeCurrentAnswerDraftResult =
  | {
      readonly ok: true
      readonly draft: AnswerDraft
    }
  | DecodeFailure

function prefixedAnswerPath(path: string): string {
  return path === '' ? submittedAnswersPath : `${submittedAnswersPath}${path}`
}

function codePointCount(value: string): number {
  const summary = summarizeReceived(value)
  return summary?.kind === 'string' ? summary.codePointCount : 0
}

function answerDiagnostic(diagnostic: Diagnostic): PersistenceDiagnostic {
  return {
    stage: 'answer-decode',
    code: diagnostic.code as AnswerDiagnosticCode,
    path: prefixedAnswerPath(diagnostic.path),
  }
}

function answerDiagnostics(
  diagnostics: readonly Diagnostic[],
): readonly PersistenceDiagnostic[] {
  if (diagnostics.some(({ code }) => !code.startsWith('ANSWER_'))) {
    return invalidModelArtifact()
  }
  return diagnostics.map(answerDiagnostic)
}

function deriveResourceModelLimits(
  model: CompiledQuestionModel,
): ResourceModelLimits {
  try {
    if (!Array.isArray(model.questions)) return invalidModelArtifact()

    const selectionLimits = new Map<string, number>()
    let totalLimit = 0
    for (const question of model.questions) {
      if (
        !question
          || typeof question !== 'object'
          || typeof question.id !== 'string'
          || !Array.isArray(question.options)
      ) return invalidModelArtifact()

      const selectionLimit = Math.min(
        persistenceLimits.maxSelectionsPerQuestion,
        question.options.length,
      )
      selectionLimits.set(question.id, selectionLimit)
      totalLimit += selectionLimit
    }

    return {
      questionLimit: Math.min(
        persistenceLimits.maxQuestionEntries,
        model.questions.length,
      ),
      selectionLimits,
      totalLimit: Math.min(persistenceLimits.maxTotalSelections, totalLimit),
    }
  } catch (error) {
    if (error instanceof PersistenceInvariantError) throw error
    return invalidModelArtifact()
  }
}

function resourceDiagnostics(
  limits: ResourceModelLimits,
  input: unknown,
): readonly PersistenceDiagnostic[] {
  if (input === null || typeof input !== 'object' || isArrayValue(input)) return []

  const diagnostics: PersistenceDiagnostic[] = []
  const questionIds = ownEnumerableStringKeys(input)
  let totalSelections = 0

  if (questionIds.length > limits.questionLimit) return sortPersistenceDiagnostics(undefined, [
    makePersistenceDiagnostic(
      'answer-decode',
      'PERSISTENCE_RESOURCE_LIMIT',
      submittedAnswersPath,
      { kind: 'object', keyCount: questionIds.length },
    ),
  ])

  for (const questionId of questionIds) {
    if (codePointCount(questionId) > persistenceLimits.maxIdCodePoints) {
      diagnostics.push(makePersistenceDiagnostic(
        'answer-decode',
        'PERSISTENCE_RESOURCE_LIMIT',
        submittedAnswersPath,
      ))
      continue
    }

    const questionPath = appendJsonPointer(submittedAnswersPath, questionId)
    const property = inspectOwnProperty(input, questionId)
    if (property.kind === 'missing') return reflectionFailure(
      'answer-decode',
      submittedAnswersPath,
    ).diagnostics
    if (property.kind === 'accessor') {
      diagnostics.push(makePersistenceDiagnostic(
        'answer-decode',
        'PERSISTENCE_ACCESSOR_FORBIDDEN',
        questionPath,
      ))
      continue
    }

    const value = property.value
    if (!isArrayValue(value)) continue
    const lengthValue = ownValue(value, 'length')
    const length = typeof lengthValue === 'number'
      ? lengthValue
      : 0
    totalSelections += length

    const selectionLimit = limits.selectionLimits.get(questionId)
      ?? persistenceLimits.maxSelectionsPerQuestion
    if (length > selectionLimit) diagnostics.push(makePersistenceDiagnostic(
      'answer-decode',
      'PERSISTENCE_RESOURCE_LIMIT',
      questionPath,
      { kind: 'array', count: length },
    ))
    if (length > selectionLimit) continue

    for (let index = 0; index < length; index += 1) {
      const optionProperty = inspectOwnProperty(value, String(index))
      if (optionProperty.kind === 'accessor') {
        diagnostics.push(makePersistenceDiagnostic(
          'answer-decode',
          'PERSISTENCE_ACCESSOR_FORBIDDEN',
          appendJsonPointer(questionPath, index),
        ))
        continue
      }
      const optionId = optionProperty.kind === 'data'
        ? optionProperty.value
        : undefined
      if (
        typeof optionId === 'string'
          && codePointCount(optionId) > persistenceLimits.maxIdCodePoints
      ) diagnostics.push(makePersistenceDiagnostic(
        'answer-decode',
        'PERSISTENCE_RESOURCE_LIMIT',
        appendJsonPointer(questionPath, index),
      ))
    }
  }

  if (totalSelections > limits.totalLimit) diagnostics.push(makePersistenceDiagnostic(
    'answer-decode',
    'PERSISTENCE_RESOURCE_LIMIT',
    submittedAnswersPath,
    { kind: 'array', count: totalSelections },
  ))

  return sortPersistenceDiagnostics(undefined, diagnostics)
}

function invalidModelArtifact(): never {
  throw new PersistenceInvariantError(
    'PERSISTENCE_MODEL_ARTIFACT_INVALID',
    'Current question model produced an invalid flow artifact during persistence decoding',
  )
}

export function decodeCurrentAnswerDraft(
  model: CompiledQuestionModel,
  input: unknown,
): DecodeCurrentAnswerDraftResult {
  const modelLimits = deriveResourceModelLimits(model)

  let resourceFailures: readonly PersistenceDiagnostic[]
  try {
    resourceFailures = resourceDiagnostics(modelLimits, input)
  } catch (error) {
    if (!isDecoderReflectionFailure(error)) return invalidModelArtifact()
    return reflectionFailure('answer-decode', submittedAnswersPath)
  }
  if (resourceFailures.length > 0) return decodeFailure(resourceFailures)

  const scanned = scanFailure(input, 'answer-decode', submittedAnswersPath)
  if (scanned) return scanned

  let decoded: ReturnType<typeof decodeAnswerDraft>
  try {
    decoded = decodeAnswerDraft(input)
  } catch {
    return reflectionFailure('answer-decode', submittedAnswersPath)
  }
  if (!decoded.ok) return decodeFailure(answerDiagnostics(decoded.diagnostics))

  let flowState: ReturnType<typeof evaluateFlow>
  try {
    flowState = evaluateFlow(model, decoded.draft)
  } catch {
    return invalidModelArtifact()
  }
  if (flowState.status === 'invalid') {
    if (flowState.diagnostics.some(({ code }) => !code.startsWith('ANSWER_'))) {
      return invalidModelArtifact()
    }
    return decodeFailure(answerDiagnostics(flowState.diagnostics))
  }

  return deepFreeze({
    ok: true,
    draft: decoded.draft as AnswerDraft,
  })
}
