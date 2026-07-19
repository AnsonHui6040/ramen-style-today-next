import { deepFreeze } from '../contracts/deep-freeze.js'
import type {
  JsonPointer,
  PersistenceDiagnostic,
  PersistenceDiagnosticCode,
} from './contracts.js'
import {
  appendJsonPointer,
  sortPersistenceDiagnostics,
  summarizeReceived,
} from './diagnostics.js'
import { persistenceLimits } from './limits.js'

export type ScanPlainDataResult =
  | {
      readonly ok: true
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly PersistenceDiagnostic[]
    }

const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor'])
const reflectionFailure = Object.freeze({})

function reflectSafely<T>(operation: () => T): T {
  try {
    return operation()
  } catch {
    throw reflectionFailure
  }
}

function makeDiagnostic(
  code: PersistenceDiagnosticCode,
  path: JsonPointer,
  received?: PersistenceDiagnostic['received'],
): PersistenceDiagnostic {
  return {
    stage: 'source',
    code,
    path,
    ...(received ? { received } : {}),
  }
}

function summarizeScannedValue(
  value: unknown,
): PersistenceDiagnostic['received'] | undefined {
  if (value !== null && typeof value === 'object') return undefined
  return summarizeReceived(value)
}

/**
 * Scans JSON-like inert data produced by a trusted parser. Synchronous reflection
 * failures are contained, but this cannot guarantee termination or contain Proxy
 * traps that loop indefinitely or actively exhaust resources.
 */
export function scanPlainData(input: unknown): ScanPlainDataResult {
  const diagnostics: PersistenceDiagnostic[] = []
  const ancestors = new Set<object>()

  const visit = (value: unknown, path: JsonPointer, depth: number): void => {
    if (depth > persistenceLimits.maxDepth) {
      diagnostics.push(makeDiagnostic(
        'PERSISTENCE_RESOURCE_LIMIT',
        path,
        summarizeScannedValue(value),
      ))
      return
    }

    if (value === null || value === undefined) return
    const type = typeof value
    if (type === 'string' || type === 'number' || type === 'boolean') return
    if (type !== 'object') {
      diagnostics.push(makeDiagnostic(
        'PERSISTENCE_DATA_NOT_PLAIN',
        path,
        summarizeScannedValue(value),
      ))
      return
    }

    const object = value as object
    if (ancestors.has(object)) {
      diagnostics.push(makeDiagnostic(
        'PERSISTENCE_CIRCULAR_REFERENCE',
        path,
        summarizeScannedValue(value),
      ))
      return
    }

    const isArray = reflectSafely(() => Array.isArray(object))
    const prototype = reflectSafely(
      () => Object.getPrototypeOf(object) as object | null,
    )
    const keys = reflectSafely(() => Reflect.ownKeys(object))

    if (!isArray && prototype !== Object.prototype && prototype !== null) {
      diagnostics.push(makeDiagnostic(
        'PERSISTENCE_DATA_NOT_PLAIN',
        path,
        summarizeScannedValue(value),
      ))
      return
    }
    if (isArray && prototype !== Array.prototype) {
      diagnostics.push(makeDiagnostic(
        'PERSISTENCE_DATA_NOT_PLAIN',
        path,
        summarizeScannedValue(value),
      ))
      return
    }

    ancestors.add(object)
    for (const key of keys) {
      if (isArray && key === 'length') continue
      if (typeof key === 'symbol') {
        diagnostics.push(makeDiagnostic(
          'PERSISTENCE_DATA_NOT_PLAIN',
          path,
          summarizeReceived(key),
        ))
        continue
      }

      const childPath = appendJsonPointer(path, key)
      if (dangerousKeys.has(key)) {
        diagnostics.push(makeDiagnostic('PERSISTENCE_DANGEROUS_KEY', childPath))
        continue
      }

      const descriptor = reflectSafely(
        () => Object.getOwnPropertyDescriptor(object, key),
      )
      if (!descriptor) {
        diagnostics.push(makeDiagnostic('PERSISTENCE_DATA_NOT_PLAIN', childPath))
        continue
      }
      if ('get' in descriptor || 'set' in descriptor) {
        diagnostics.push(makeDiagnostic('PERSISTENCE_ACCESSOR_FORBIDDEN', childPath))
        continue
      }
      visit(descriptor.value, childPath, depth + 1)
    }
    ancestors.delete(object)
  }

  try {
    visit(input, '', 0)
  } catch (error) {
    if (error !== reflectionFailure) throw error
    return deepFreeze({
      ok: false,
      diagnostics: [makeDiagnostic('PERSISTENCE_ENVELOPE_INVALID', '')],
    })
  }
  if (diagnostics.length === 0) return deepFreeze({ ok: true })
  return deepFreeze({
    ok: false,
    diagnostics: sortPersistenceDiagnostics(undefined, diagnostics),
  })
}
