import { deepFreeze } from '../contracts/deep-freeze.js'
import type { PersistenceDiagnostic } from './contracts.js'
import { summarizeReceived } from './diagnostics.js'
import {
  boundedFieldPath,
  clonePlainData,
  decodeFailure,
  isDecoderReflectionFailure,
  isPlainRecord,
  makePersistenceDiagnostic,
  ownEnumerableStringKeys,
  ownRequiredValue,
  reflectionFailure,
  scanFailure,
  type DecodeFailure,
} from './decode-envelope.js'
import { persistenceLimits } from './limits.js'

const semanticHashPattern = /^[0-9a-f]{64}$/

export interface StructurallyDecodedPayloadV1 {
  readonly schemaVersion: 1
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly cursorQuestionId?: string
  readonly submittedAnswers: unknown
}

export type DecodeStoredPayloadV1StructureResult =
  | {
      readonly ok: true
      readonly payload: StructurallyDecodedPayloadV1
    }
  | DecodeFailure

function fieldPath(field: string): string {
  return boundedFieldPath('', field)
}

function stringCodePointCount(value: string): number {
  const summary = summarizeReceived(value)
  return summary?.kind === 'string' ? summary.codePointCount : 0
}

export function decodeStoredPayloadV1Structure(
  input: unknown,
): DecodeStoredPayloadV1StructureResult {
  const scanned = scanFailure(input, 'schema-decode')
  if (scanned) return scanned

  try {
    if (!isPlainRecord(input)) {
      return decodeFailure([
        makePersistenceDiagnostic(
          'schema-decode',
          'PERSISTENCE_FIELD_TYPE_INVALID',
          '',
          summarizeReceived(input),
        ),
      ])
    }

    const diagnostics: PersistenceDiagnostic[] = []
    const requiredFields = [
      'schemaVersion',
      'questionModelVersion',
      'questionSemanticHash',
      'submittedAnswers',
    ] as const
    const allowedFields = new Set([...requiredFields, 'cursorQuestionId'])
    const fields = ownEnumerableStringKeys(input)
    const fieldSet = new Set(fields)

    for (const field of requiredFields) {
      if (!fieldSet.has(field)) diagnostics.push(makePersistenceDiagnostic(
        'schema-decode',
        'PERSISTENCE_REQUIRED_FIELD_MISSING',
        fieldPath(field),
      ))
    }
    for (const field of fields) {
      if (!allowedFields.has(field)) diagnostics.push(makePersistenceDiagnostic(
        'schema-decode',
        'PERSISTENCE_UNKNOWN_FIELD',
        fieldPath(field),
      ))
    }

    const schemaVersion = fieldSet.has('schemaVersion')
      ? ownRequiredValue(input, 'schemaVersion')
      : undefined
    if (fieldSet.has('schemaVersion')) {
      if (
        typeof schemaVersion !== 'number'
          || !Number.isSafeInteger(schemaVersion)
          || schemaVersion < 0
      ) {
        diagnostics.push(makePersistenceDiagnostic(
          'schema-decode',
          'PERSISTENCE_FIELD_TYPE_INVALID',
          '/schemaVersion',
          summarizeReceived(schemaVersion),
        ))
      } else if (schemaVersion !== 1) {
        diagnostics.push(makePersistenceDiagnostic(
          'schema-decode',
          'PERSISTENCE_SCHEMA_VERSION_UNSUPPORTED',
          '/schemaVersion',
          summarizeReceived(schemaVersion),
        ))
      }
    }

    const questionModelVersion = fieldSet.has('questionModelVersion')
      ? ownRequiredValue(input, 'questionModelVersion')
      : undefined
    if (fieldSet.has('questionModelVersion')) {
      if (typeof questionModelVersion !== 'string') {
        diagnostics.push(makePersistenceDiagnostic(
          'schema-decode',
          'PERSISTENCE_FIELD_TYPE_INVALID',
          '/questionModelVersion',
          summarizeReceived(questionModelVersion),
        ))
      } else if (
        stringCodePointCount(questionModelVersion)
          > persistenceLimits.maxModelVersionCodePoints
      ) {
        diagnostics.push(makePersistenceDiagnostic(
          'schema-decode',
          'PERSISTENCE_RESOURCE_LIMIT',
          '/questionModelVersion',
          summarizeReceived(questionModelVersion),
        ))
      }
    }

    const questionSemanticHash = fieldSet.has('questionSemanticHash')
      ? ownRequiredValue(input, 'questionSemanticHash')
      : undefined
    if (fieldSet.has('questionSemanticHash')) {
      if (typeof questionSemanticHash !== 'string') {
        diagnostics.push(makePersistenceDiagnostic(
          'schema-decode',
          'PERSISTENCE_FIELD_TYPE_INVALID',
          '/questionSemanticHash',
          summarizeReceived(questionSemanticHash),
        ))
      } else if (
        questionSemanticHash.length !== 64
          || !semanticHashPattern.test(questionSemanticHash)
      ) {
        diagnostics.push(makePersistenceDiagnostic(
          'schema-decode',
          'PERSISTENCE_SEMANTIC_HASH_INVALID',
          '/questionSemanticHash',
          summarizeReceived(questionSemanticHash),
        ))
      }
    }

    const cursorQuestionId = fieldSet.has('cursorQuestionId')
      ? ownRequiredValue(input, 'cursorQuestionId')
      : undefined
    if (fieldSet.has('cursorQuestionId')) {
      if (typeof cursorQuestionId !== 'string') {
        diagnostics.push(makePersistenceDiagnostic(
          'schema-decode',
          'PERSISTENCE_FIELD_TYPE_INVALID',
          '/cursorQuestionId',
          summarizeReceived(cursorQuestionId),
        ))
      } else if (
        stringCodePointCount(cursorQuestionId) > persistenceLimits.maxIdCodePoints
      ) {
        diagnostics.push(makePersistenceDiagnostic(
          'schema-decode',
          'PERSISTENCE_RESOURCE_LIMIT',
          '/cursorQuestionId',
          summarizeReceived(cursorQuestionId),
        ))
      }
    }

    if (diagnostics.length > 0) return decodeFailure(diagnostics)

    return deepFreeze({
      ok: true,
      payload: {
        schemaVersion: 1,
        questionModelVersion: questionModelVersion as string,
        questionSemanticHash: questionSemanticHash as string,
        ...(fieldSet.has('cursorQuestionId')
          ? { cursorQuestionId: cursorQuestionId as string }
          : {}),
        submittedAnswers: clonePlainData(ownRequiredValue(input, 'submittedAnswers')),
      },
    })
  } catch (error) {
    if (!isDecoderReflectionFailure(error)) throw error
    return reflectionFailure('schema-decode')
  }
}
