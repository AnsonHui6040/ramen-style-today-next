import { deepFreeze } from '../contracts/deep-freeze.js'
import { makeDiagnostic, type Diagnostic } from '../contracts/diagnostic.js'
import type {
  PendingQuestionState,
  PendingSelectionOperation,
  PendingSelectionResult,
} from './types.js'

const pendingSource = 'runtime://pending-selection'

function canonicalPending<Option extends string>(
  state: PendingQuestionState<string, Option>,
  optionIds: readonly Option[],
) {
  const selected = new Set(optionIds)
  const allowed = new Set(state.allowedOptionIds)
  return state.optionOrder.filter((optionId) => (
    allowed.has(optionId) && selected.has(optionId)
  ))
}

function makeResult<Option extends string>(
  optionIds: readonly Option[],
  diagnostics: readonly Diagnostic[] = [],
): PendingSelectionResult<Option> {
  const result: PendingSelectionResult<Option> = {
    optionIds: [...optionIds],
    diagnostics: [...diagnostics],
  }
  deepFreeze(result)
  return result
}

function operationDiagnostic(
  state: PendingQuestionState<string, string>,
  code: Diagnostic['code'],
  path: string,
  message: string,
  details: {
    readonly optionId?: string
    readonly expected?: unknown
    readonly received?: unknown
  },
) {
  return makeDiagnostic({
    severity: 'error',
    code,
    sourceFile: pendingSource,
    path,
    entityId: details.optionId
      ? `${state.questionId}:${details.optionId}`
      : state.questionId,
    message,
    ...(details.expected === undefined ? {} : { expected: details.expected }),
    ...(details.received === undefined ? {} : { received: details.received }),
  })
}

export function updatePendingSelection<
  Question extends string,
  Option extends string,
>(
  state: PendingQuestionState<Question, Option>,
  pendingOptionIds: readonly Option[],
  operation: PendingSelectionOperation<Option>,
): PendingSelectionResult<Option> {
  const current = canonicalPending(state, pendingOptionIds)
  const candidate = operation as unknown
  if (!candidate || typeof candidate !== 'object') {
    return makeResult(current, [operationDiagnostic(
      state,
      'STRUCTURE_INVALID',
      '/operation',
      'Pending selection operation must be an object',
      { expected: 'object', received: candidate === null ? null : typeof candidate },
    )])
  }

  const runtimeOperation = candidate as { readonly type?: unknown; readonly optionId?: unknown }
  if (runtimeOperation.type !== 'select' && runtimeOperation.type !== 'deselect') {
    return makeResult(current, [operationDiagnostic(
      state,
      'STRUCTURE_INVALID',
      '/operation/type',
      'Pending selection operation type must be select or deselect',
      {
        expected: ['select', 'deselect'],
        received: typeof runtimeOperation.type === 'object'
          ? typeof runtimeOperation.type
          : runtimeOperation.type,
      },
    )])
  }
  if (typeof runtimeOperation.optionId !== 'string') {
    return makeResult(current, [operationDiagnostic(
      state,
      'STRUCTURE_INVALID',
      '/operation/optionId',
      'Pending selection optionId must be a string',
      {
        expected: 'string',
        received: runtimeOperation.optionId === null
          ? null
          : typeof runtimeOperation.optionId,
      },
    )])
  }

  const optionId = runtimeOperation.optionId as Option
  if (!state.optionOrder.includes(optionId)) {
    return makeResult(current, [operationDiagnostic(
      state,
      'ANSWER_UNKNOWN_OPTION',
      '/operation/optionId',
      `Pending selection references unknown option ${optionId}`,
      {
        optionId,
        expected: [...state.optionOrder],
        received: optionId,
      },
    )])
  }
  if (!state.allowedOptionIds.includes(optionId)) {
    return makeResult(current, [operationDiagnostic(
      state,
      'ANSWER_OPTION_DISALLOWED',
      '/operation/optionId',
      `Option ${optionId} is not allowed for question ${state.questionId}`,
      {
        optionId,
        expected: canonicalPending(state, state.allowedOptionIds),
        received: optionId,
      },
    )])
  }

  if (runtimeOperation.type === 'deselect') {
    if (!current.includes(optionId)) return makeResult(current)
    const deselected = current.filter((candidateId) => candidateId !== optionId)
    if (deselected.length > 0 || state.emptyBehavior.type === 'allow-empty') {
      return makeResult(deselected)
    }
    return makeResult(canonicalPending(state, state.initialUiOptionIds))
  }

  const exclusive = new Set(state.exclusiveOptionIds)
  if (exclusive.has(optionId)) return makeResult([optionId])

  const ordinary = current.filter((candidateId) => !exclusive.has(candidateId))
  if (ordinary.includes(optionId) || ordinary.length >= state.maxSelections) {
    return makeResult(ordinary)
  }
  return makeResult(canonicalPending(state, [...ordinary, optionId]))
}
