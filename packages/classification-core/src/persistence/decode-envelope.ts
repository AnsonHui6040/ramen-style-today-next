import { deepFreeze } from '../contracts/deep-freeze.js'
import type {
  ClassificationRestoreSource,
  JsonPointer,
  PersistenceDiagnostic,
  PersistenceDiagnosticCode,
  PersistencePipelineStage,
} from './contracts.js'
import {
  appendJsonPointer,
  sortPersistenceDiagnostics,
  summarizeReceived,
} from './diagnostics.js'
import { persistenceLimits } from './limits.js'
import { scanPlainData } from './plain-data.js'

const verifiedLegacySourceId =
  'ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37' as const
const decoderReflectionFailure = Object.freeze({})

export interface DecodeFailure {
  readonly ok: false
  readonly diagnostics: readonly PersistenceDiagnostic[]
}

export type DecodeRestoreSourceResult =
  | {
      readonly ok: true
      readonly source: ClassificationRestoreSource
    }
  | DecodeFailure

export interface MinimalVersionedEnvelope {
  readonly schemaVersion: unknown
  readonly questionModelVersion?: unknown
  readonly questionSemanticHash?: unknown
}

export type DecodeMinimalEnvelopeResult =
  | {
      readonly ok: true
      readonly envelope: MinimalVersionedEnvelope
    }
  | DecodeFailure

export function makePersistenceDiagnostic(
  stage: PersistencePipelineStage,
  code: PersistenceDiagnosticCode,
  path: JsonPointer,
  received?: PersistenceDiagnostic['received'],
): PersistenceDiagnostic {
  return {
    stage,
    code,
    path,
    ...(received ? { received } : {}),
  }
}

export function decodeFailure(
  diagnostics: readonly PersistenceDiagnostic[],
): DecodeFailure {
  return deepFreeze({
    ok: false,
    diagnostics: sortPersistenceDiagnostics(undefined, diagnostics),
  })
}

export function reflectionFailure(
  stage: PersistencePipelineStage,
  path: JsonPointer = '',
): DecodeFailure {
  return decodeFailure([
    makePersistenceDiagnostic(stage, 'PERSISTENCE_ENVELOPE_INVALID', path),
  ])
}

export function scanFailure(
  input: unknown,
  stage: PersistencePipelineStage,
  pathPrefix = '',
): DecodeFailure | undefined {
  const result = scanPlainData(input)
  if (result.ok) return undefined

  return decodeFailure(result.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    stage,
    path: boundedDiagnosticPath(diagnostic.path)
      ? `${pathPrefix}${diagnostic.path}`
      : pathPrefix,
  })))
}

function boundedDiagnosticPath(path: JsonPointer): boolean {
  if (path === '') return true
  if (!path.startsWith('/')) return false

  let segmentCount = 1
  let tokenCodePointCount = 0
  for (let index = 1; index < path.length;) {
    const codePoint = path.codePointAt(index)
    if (codePoint === undefined) return false
    const character = String.fromCodePoint(codePoint)
    index += character.length

    if (character === '/') {
      segmentCount += 1
      tokenCodePointCount = 0
      if (segmentCount > persistenceLimits.maxDepth + 2) return false
      continue
    }
    if (character === '~' && (path[index] === '0' || path[index] === '1')) {
      index += 1
    }
    tokenCodePointCount += 1
    if (tokenCodePointCount > persistenceLimits.maxIdCodePoints) return false
  }
  return true
}

function hasBoundedFieldName(field: string): boolean {
  let codePointCount = 0
  const iterator = field[Symbol.iterator]()
  while (codePointCount <= persistenceLimits.maxIdCodePoints) {
    const step = iterator.next()
    if (step.done) return true
    codePointCount += 1
  }
  return false
}

export function boundedFieldPath(pointer: JsonPointer, field: string): JsonPointer {
  return hasBoundedFieldName(field) ? appendJsonPointer(pointer, field) : pointer
}

function reflectSafely<T>(operation: () => T): T {
  try {
    return operation()
  } catch {
    throw decoderReflectionFailure
  }
}

export function isDecoderReflectionFailure(error: unknown): boolean {
  return error === decoderReflectionFailure
}

export function isArrayValue(value: unknown): value is readonly unknown[] {
  return reflectSafely(() => Array.isArray(value))
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || isArrayValue(value)) return false
  const prototype = reflectSafely(() => Object.getPrototypeOf(value))
  return prototype === Object.prototype || prototype === null
}

export function ownEnumerableStringKeys(value: object): readonly string[] {
  return reflectSafely(() => Object.keys(value))
}

export type InspectedOwnProperty =
  | { readonly kind: 'missing' }
  | { readonly kind: 'accessor' }
  | { readonly kind: 'data'; readonly value: unknown }

export function inspectOwnProperty(
  value: object,
  key: string,
): InspectedOwnProperty {
  const descriptor = reflectSafely(() => Object.getOwnPropertyDescriptor(value, key))
  if (!descriptor) return { kind: 'missing' }
  if (!('value' in descriptor)) return { kind: 'accessor' }
  return { kind: 'data', value: descriptor.value }
}

export function ownValue(value: object, key: string): unknown {
  const property = inspectOwnProperty(value, key)
  if (property.kind === 'missing') return undefined
  if (property.kind === 'accessor') throw decoderReflectionFailure
  return property.value
}

export function ownRequiredValue(value: object, key: string): unknown {
  const property = inspectOwnProperty(value, key)
  if (property.kind !== 'data') throw decoderReflectionFailure
  return property.value
}

export function clonePlainData(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value

  if (isArrayValue(value)) {
    const lengthDescriptor = reflectSafely(
      () => Object.getOwnPropertyDescriptor(value, 'length'),
    )
    const length = lengthDescriptor && 'value' in lengthDescriptor
      && typeof lengthDescriptor.value === 'number'
      ? lengthDescriptor.value
      : 0
    const result: unknown[] = new Array(length)
    for (const key of ownEnumerableStringKeys(value)) {
      if (key === 'length') continue
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: clonePlainData(ownRequiredValue(value, key)),
        writable: true,
      })
    }
    return result
  }

  const result = Object.create(
    reflectSafely(() => Object.getPrototypeOf(value)) === null ? null : Object.prototype,
  ) as Record<string, unknown>
  for (const key of ownEnumerableStringKeys(value)) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value: clonePlainData(ownRequiredValue(value, key)),
      writable: true,
    })
  }
  return result
}

function fieldDiagnostic(
  code: PersistenceDiagnosticCode,
  field: string,
  received?: unknown,
): PersistenceDiagnostic {
  return makePersistenceDiagnostic(
    'source',
    code,
    boundedFieldPath('', field),
    received === undefined ? undefined : summarizeReceived(received),
  )
}

function sourceRootFailure(input: unknown): DecodeFailure {
  return decodeFailure([
    makePersistenceDiagnostic(
      'source',
      'PERSISTENCE_SOURCE_INVALID',
      '',
      summarizeReceived(input),
    ),
  ])
}

export function decodeRestoreSource(input: unknown): DecodeRestoreSourceResult {
  const scanned = scanFailure(input, 'source')
  if (scanned) return scanned

  try {
    if (!isPlainRecord(input)) return sourceRootFailure(input)

    const diagnostics: PersistenceDiagnostic[] = []
    const fields = ownEnumerableStringKeys(input)
    const fieldSet = new Set(fields)
    const kind = fieldSet.has('kind') ? ownRequiredValue(input, 'kind') : undefined
    const allowedFields = kind === 'legacy-unversioned'
      ? new Set(['kind', 'sourceId', 'answers'])
      : kind === 'versioned'
        ? new Set(['kind', 'payload'])
        : new Set(['kind', 'sourceId', 'answers', 'payload'])

    for (const key of fields) {
      if (!allowedFields.has(key)) diagnostics.push(fieldDiagnostic(
        'PERSISTENCE_UNKNOWN_FIELD',
        key,
      ))
    }

    if (!fieldSet.has('kind')) {
      diagnostics.push(fieldDiagnostic('PERSISTENCE_REQUIRED_FIELD_MISSING', 'kind'))
    } else if (typeof kind !== 'string') {
      diagnostics.push(fieldDiagnostic('PERSISTENCE_FIELD_TYPE_INVALID', 'kind', kind))
    } else if (kind !== 'legacy-unversioned' && kind !== 'versioned') {
      diagnostics.push(fieldDiagnostic('PERSISTENCE_SOURCE_INVALID', 'kind', kind))
    }

    if (kind === 'legacy-unversioned') {
      if (!fieldSet.has('sourceId')) {
        diagnostics.push(fieldDiagnostic('PERSISTENCE_REQUIRED_FIELD_MISSING', 'sourceId'))
      } else {
        const sourceId = ownRequiredValue(input, 'sourceId')
        if (typeof sourceId !== 'string') {
          diagnostics.push(fieldDiagnostic(
            'PERSISTENCE_FIELD_TYPE_INVALID',
            'sourceId',
            sourceId,
          ))
        } else if (sourceId !== verifiedLegacySourceId) {
          diagnostics.push(fieldDiagnostic(
            'PERSISTENCE_SOURCE_UNSUPPORTED',
            'sourceId',
            sourceId,
          ))
        }
      }
      if (!fieldSet.has('answers')) {
        diagnostics.push(fieldDiagnostic('PERSISTENCE_REQUIRED_FIELD_MISSING', 'answers'))
      }
    }

    if (kind === 'versioned' && !fieldSet.has('payload')) {
      diagnostics.push(fieldDiagnostic('PERSISTENCE_REQUIRED_FIELD_MISSING', 'payload'))
    }

    if (diagnostics.length > 0) return decodeFailure(diagnostics)

    if (kind === 'legacy-unversioned') {
      return deepFreeze({
        ok: true,
        source: {
          kind,
          sourceId: verifiedLegacySourceId,
          answers: clonePlainData(ownRequiredValue(input, 'answers')),
        },
      })
    }
    if (kind === 'versioned') {
      return deepFreeze({
        ok: true,
        source: {
          kind,
          payload: clonePlainData(ownRequiredValue(input, 'payload')),
        },
      })
    }
    return sourceRootFailure(input)
  } catch (error) {
    if (!isDecoderReflectionFailure(error)) throw error
    return reflectionFailure('source')
  }
}

export function decodeMinimalEnvelope(input: unknown): DecodeMinimalEnvelopeResult {
  const scanned = scanFailure(input, 'minimal-envelope')
  if (scanned) return scanned

  try {
    if (!isPlainRecord(input)) {
      return decodeFailure([
        makePersistenceDiagnostic(
          'minimal-envelope',
          'PERSISTENCE_FIELD_TYPE_INVALID',
          '',
          summarizeReceived(input),
        ),
      ])
    }
    const fields = new Set(ownEnumerableStringKeys(input))
    if (!fields.has('schemaVersion')) {
      return decodeFailure([
        makePersistenceDiagnostic(
          'minimal-envelope',
          'PERSISTENCE_REQUIRED_FIELD_MISSING',
          '/schemaVersion',
        ),
      ])
    }

    const schemaVersion = ownRequiredValue(input, 'schemaVersion')
    if (
      typeof schemaVersion !== 'number'
        || !Number.isSafeInteger(schemaVersion)
        || schemaVersion < 0
    ) return decodeFailure([
      makePersistenceDiagnostic(
        'minimal-envelope',
        'PERSISTENCE_FIELD_TYPE_INVALID',
        '/schemaVersion',
        summarizeReceived(schemaVersion),
      ),
    ])

    return deepFreeze({
      ok: true,
      envelope: {
        schemaVersion,
        ...(fields.has('questionModelVersion')
          ? {
              questionModelVersion: clonePlainData(
                ownRequiredValue(input, 'questionModelVersion'),
              ),
            }
          : {}),
        ...(fields.has('questionSemanticHash')
          ? {
              questionSemanticHash: clonePlainData(
                ownRequiredValue(input, 'questionSemanticHash'),
              ),
            }
          : {}),
      },
    })
  } catch (error) {
    if (!isDecoderReflectionFailure(error)) throw error
    return reflectionFailure('minimal-envelope')
  }
}
