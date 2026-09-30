import { createHash } from 'node:crypto'

import { migrateStoredClassification } from '@ramen-style/classification-core'
import type { ClassificationModel } from '@ramen-style/classification-core/compiler'

import type { ParityAnswers } from './engine.js'
import type { LegacyState } from './legacy-restore-engine.js'
import { fromFlow, readNewState } from './new-restore-reader.js'

export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    )
  }
  return value
}

export function same(left: unknown, right: unknown) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

export class RowDigest {
  #hash = createHash('sha256')
  count = 0

  add(row: unknown) {
    this.#hash.update(JSON.stringify(canonical(row)))
    this.#hash.update('\n')
    this.count += 1
  }

  result() {
    return { count: this.count, sha256: this.#hash.digest('hex') }
  }
}

export function parsedObject(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

/** New-side migration boundary output in legacy answer shape, for the sanitization layer (L1). */
export function newSanitizedAnswers(raw: string | null, model: ClassificationModel): ParityAnswers | undefined {
  const parsed = parsedObject(raw)
  if (!parsed) return undefined
  const migrated = migrateStoredClassification(parsed, model)
  return migrated.ok ? fromFlow(migrated.payload.answers) : undefined
}

export interface NewEvaluation {
  state: LegacyState
  complete: boolean
  sanitized: ParityAnswers | undefined
}

export function evaluateNew(raw: string | null, model: ClassificationModel): NewEvaluation {
  const { state, complete } = readNewState(raw, model)
  return { state, complete, sanitized: newSanitizedAnswers(raw, model) }
}
