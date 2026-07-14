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

export function scanPlainData(input: unknown): ScanPlainDataResult {
  const diagnostics: PersistenceDiagnostic[] = []
  const ancestors = new Set<object>()

  const visit = (value: unknown, path: JsonPointer, depth: number): void => {
    if (depth > persistenceLimits.maxDepth) {
      diagnostics.push(makeDiagnostic(
        'PERSISTENCE_RESOURCE_LIMIT',
        path,
        summarizeReceived(value),
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
        summarizeReceived(value),
      ))
      return
    }

    const object = value as object
    if (ancestors.has(object)) {
      diagnostics.push(makeDiagnostic(
        'PERSISTENCE_CIRCULAR_REFERENCE',
        path,
        summarizeReceived(value),
      ))
      return
    }

    let prototype: object | null
    let keys: readonly (string | symbol)[]
    try {
      prototype = Object.getPrototypeOf(object) as object | null
      keys = Reflect.ownKeys(object)
    } catch {
      diagnostics.push(makeDiagnostic(
        'PERSISTENCE_DATA_NOT_PLAIN',
        path,
        summarizeReceived(value),
      ))
      return
    }

    if (!Array.isArray(object) && prototype !== Object.prototype && prototype !== null) {
      diagnostics.push(makeDiagnostic(
        'PERSISTENCE_DATA_NOT_PLAIN',
        path,
        summarizeReceived(value),
      ))
      return
    }
    if (Array.isArray(object) && prototype !== Array.prototype) {
      diagnostics.push(makeDiagnostic(
        'PERSISTENCE_DATA_NOT_PLAIN',
        path,
        summarizeReceived(value),
      ))
      return
    }

    ancestors.add(object)
    for (const key of keys) {
      if (Array.isArray(object) && key === 'length') continue
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

      let descriptor: PropertyDescriptor | undefined
      try {
        descriptor = Object.getOwnPropertyDescriptor(object, key)
      } catch {
        diagnostics.push(makeDiagnostic('PERSISTENCE_DATA_NOT_PLAIN', childPath))
        continue
      }
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

  visit(input, '', 0)
  if (diagnostics.length === 0) return deepFreeze({ ok: true })
  return deepFreeze({
    ok: false,
    diagnostics: sortPersistenceDiagnostics(undefined, diagnostics),
  })
}
