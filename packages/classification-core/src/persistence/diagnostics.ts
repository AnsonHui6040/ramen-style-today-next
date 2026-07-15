import { deepFreeze } from '../contracts/deep-freeze.js'
import type { CompiledQuestionModel } from '../contracts/question-model.js'
import type {
  BoundedReceivedSummary,
  JsonPointer,
  PersistenceDiagnostic,
  PersistenceDiagnosticCode,
  PersistencePipelineStage,
} from './contracts.js'
import { persistenceLimits } from './limits.js'

const stableIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export const persistenceDiagnosticCodes = Object.freeze([
  'PERSISTENCE_SOURCE_INVALID',
  'PERSISTENCE_SOURCE_UNSUPPORTED',
  'PERSISTENCE_RESOURCE_LIMIT',
  'PERSISTENCE_ENVELOPE_INVALID',
  'PERSISTENCE_DATA_NOT_PLAIN',
  'PERSISTENCE_ACCESSOR_FORBIDDEN',
  'PERSISTENCE_DANGEROUS_KEY',
  'PERSISTENCE_CIRCULAR_REFERENCE',
  'PERSISTENCE_REQUIRED_FIELD_MISSING',
  'PERSISTENCE_UNKNOWN_FIELD',
  'PERSISTENCE_FIELD_TYPE_INVALID',
  'PERSISTENCE_SCHEMA_VERSION_UNSUPPORTED',
  'PERSISTENCE_QUESTION_MODEL_UNSUPPORTED',
  'PERSISTENCE_QUESTION_MODEL_INTEGRITY',
  'PERSISTENCE_SEMANTIC_HASH_INVALID',
  'PERSISTENCE_LEGACY_FIELD_SHAPE_INVALID',
  'PERSISTENCE_LEGACY_EMPTY_SELECTION_INVALID',
  'PERSISTENCE_LEGACY_EXPANSION_CONFLICT',
  'PERSISTENCE_MIGRATION_FAILED',
  'PERSISTENCE_SUBMITTED_STATE_REQUIRES_REPAIR',
  'PERSISTENCE_SUBMITTED_ANSWER_FOR_FORCED_QUESTION',
  'PERSISTENCE_CURSOR_INVALID',
] as const satisfies readonly PersistenceDiagnosticCode[])

export const persistencePipelineStages = Object.freeze([
  'source',
  'minimal-envelope',
  'schema-decode',
  'schema-migration',
  'model-compatibility',
  'model-migration',
  'answer-decode',
  'flow-evaluation',
  'repair-projection',
  'resume-resolution',
  'payload-build',
] as const satisfies readonly PersistencePipelineStage[])

export function escapeJsonPointerToken(token: string): string {
  return token.replaceAll('~', '~0').replaceAll('/', '~1')
}

export function appendJsonPointer(
  pointer: JsonPointer,
  token: string | number,
): JsonPointer {
  return `${pointer}/${escapeJsonPointerToken(String(token))}`
}

function countCodePointsUpTo(value: string, maximum: number): number {
  let count = 0
  const iterator = value[Symbol.iterator]()

  while (count <= maximum) {
    const step = iterator.next()
    if (step.done) return count
    count += 1
  }

  return maximum + 1
}

export function summarizeReceived(
  value: unknown,
  includeStableId = false,
): BoundedReceivedSummary | undefined {
  if (value === null) return deepFreeze({ kind: 'null' })

  const type = typeof value
  if (type === 'undefined') return undefined
  if (type === 'string') {
    const stringValue = value as string
    const codePointCount = countCodePointsUpTo(
      stringValue,
      persistenceLimits.maxIdCodePoints,
    )
    return deepFreeze({
      kind: 'string',
      codePointCount,
      ...(includeStableId && codePointCount <= persistenceLimits.maxIdCodePoints
        && stableIdPattern.test(stringValue)
        ? { stableId: stringValue }
        : {}),
    })
  }
  if (type === 'object') {
    try {
      if (Array.isArray(value)) {
        const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
        const count = lengthDescriptor && 'value' in lengthDescriptor
          && typeof lengthDescriptor.value === 'number'
          ? lengthDescriptor.value
          : 0
        return deepFreeze({ kind: 'array', count })
      }
    } catch {
      return deepFreeze({ kind: 'object', keyCount: 0 })
    }

    let keyCount = 0
    try {
      keyCount = Object.keys(value as object).length
    } catch {
      // A non-introspectable object is still summarized without exposing its failure.
    }
    return deepFreeze({ kind: 'object', keyCount })
  }
  return deepFreeze({
    kind: type as 'number' | 'boolean' | 'symbol' | 'function' | 'bigint',
  })
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function rankedValue(value: string | undefined, ranks: ReadonlyMap<string, number>): number {
  return value === undefined ? Number.MAX_SAFE_INTEGER : (ranks.get(value) ?? Number.MAX_SAFE_INTEGER)
}

export function sortPersistenceDiagnostics(
  model: CompiledQuestionModel | undefined,
  diagnostics: readonly PersistenceDiagnostic[],
): readonly PersistenceDiagnostic[] {
  const stageRanks = new Map(persistencePipelineStages.map((stage, index) => [stage, index]))
  const questionRanks = new Map(
    (model?.questions ?? []).map((question, index) => [question.id, index]),
  )
  const optionRanks = new Map<string, number>()
  for (const question of model?.questions ?? []) {
    question.options.forEach((option, index) => {
      optionRanks.set(`${question.id}\u0000${option.id}`, index)
    })
  }

  const copied = diagnostics.map((diagnostic, index) => ({
    diagnostic: {
      ...diagnostic,
      ...(diagnostic.received ? { received: { ...diagnostic.received } } : {}),
    } satisfies PersistenceDiagnostic,
    index,
  }))

  copied.sort((left, right) => {
    const leftDiagnostic = left.diagnostic
    const rightDiagnostic = right.diagnostic
    const stageOrder = rankedValue(leftDiagnostic.stage, stageRanks)
      - rankedValue(rightDiagnostic.stage, stageRanks)
    if (stageOrder !== 0) return stageOrder

    const pathOrder = compareStrings(leftDiagnostic.path, rightDiagnostic.path)
    if (pathOrder !== 0) return pathOrder
    const codeOrder = compareStrings(leftDiagnostic.code, rightDiagnostic.code)
    if (codeOrder !== 0) return codeOrder

    const questionOrder = rankedValue(leftDiagnostic.questionId, questionRanks)
      - rankedValue(rightDiagnostic.questionId, questionRanks)
    if (questionOrder !== 0) return questionOrder
    const questionIdOrder = compareStrings(
      leftDiagnostic.questionId ?? '',
      rightDiagnostic.questionId ?? '',
    )
    if (questionIdOrder !== 0) return questionIdOrder

    const leftOptionKey = `${leftDiagnostic.questionId ?? ''}\u0000${leftDiagnostic.optionId ?? ''}`
    const rightOptionKey = `${rightDiagnostic.questionId ?? ''}\u0000${rightDiagnostic.optionId ?? ''}`
    const optionOrder = rankedValue(leftOptionKey, optionRanks)
      - rankedValue(rightOptionKey, optionRanks)
    if (optionOrder !== 0) return optionOrder
    const optionIdOrder = compareStrings(
      leftDiagnostic.optionId ?? '',
      rightDiagnostic.optionId ?? '',
    )
    return optionIdOrder || left.index - right.index
  })

  return deepFreeze(copied.map(({ diagnostic }) => diagnostic))
}
