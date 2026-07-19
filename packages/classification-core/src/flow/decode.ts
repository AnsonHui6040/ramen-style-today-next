import { deepFreeze } from '../contracts/deep-freeze.js'
import { makeDiagnostic, type Diagnostic } from '../contracts/diagnostic.js'
import { compareCodePoints } from '../contracts/source-path.js'
import type { DecodeAnswerDraftResult, DecodedAnswerDraft } from './types.js'

const draftSource = 'runtime://answer-draft'

function escapePointerToken(value: string) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function valueKind(value: unknown) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function invalid(path: string, message: string, received: unknown): Diagnostic {
  return makeDiagnostic({
    severity: 'error',
    code: 'ANSWER_DRAFT_INVALID',
    sourceFile: draftSource,
    path,
    message,
    expected: path === '' ? 'plain object' : 'string array',
    received,
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function decodeAnswerDraft(input: unknown): DecodeAnswerDraftResult {
  if (!isPlainObject(input)) {
    return deepFreeze({
      ok: false,
      diagnostics: [invalid('', 'Answer draft must be a non-array plain object', valueKind(input))],
    })
  }

  const diagnostics: Diagnostic[] = []
  const draft: Record<string, readonly string[]> = {}
  const enumerableSymbols = Object.getOwnPropertySymbols(input).filter((symbol) => (
    Object.prototype.propertyIsEnumerable.call(input, symbol)
  ))
  if (enumerableSymbols.length > 0) {
    diagnostics.push(invalid('', 'Answer draft cannot contain enumerable symbol keys', 'symbol key'))
  }

  const questionIds = Object.keys(input).sort(compareCodePoints)
  for (const questionId of questionIds) {
    const questionPath = `/${escapePointerToken(questionId)}`
    const descriptor = Object.getOwnPropertyDescriptor(input, questionId)
    if (!descriptor || !('value' in descriptor)) {
      diagnostics.push(invalid(
        questionPath,
        `Answer ${questionId} must be a primitive data property`,
        'accessor property',
      ))
      continue
    }
    const value: unknown = descriptor.value
    if (!Array.isArray(value)) {
      diagnostics.push(invalid(
        questionPath,
        `Answer ${questionId} must be an array of strings`,
        valueKind(value),
      ))
      continue
    }
    const optionIds: string[] = []
    for (let index = 0; index < value.length; index += 1) {
      const item = Object.getOwnPropertyDescriptor(value, String(index))
      const optionId: unknown = item && 'value' in item ? item.value : undefined
      if (typeof optionId !== 'string') {
        diagnostics.push(invalid(
          `${questionPath}/${index}`,
          `Answer ${questionId} item ${index} must be a string`,
          valueKind(optionId),
        ))
      } else {
        optionIds.push(optionId)
      }
    }
    Object.defineProperty(draft, questionId, {
      value: optionIds,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }

  if (diagnostics.length > 0) {
    diagnostics.sort((left, right) => (
      compareCodePoints(left.path, right.path) || compareCodePoints(left.code, right.code)
    ))
    return deepFreeze({ ok: false, diagnostics })
  }
  return deepFreeze({ ok: true, draft: draft as DecodedAnswerDraft })
}
