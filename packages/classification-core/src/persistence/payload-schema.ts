import { z } from 'zod'

import type { DiagnosticCollector } from '../compiler/collector.js'

export const storedPayloadV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  modelVersion: z.string().min(1),
  dataVersion: z.string().min(1),
  currentQuestionId: z.string().optional(),
  answers: z.record(z.string(), z.array(z.string())),
})

function escapeToken(value: PropertyKey) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1')
}

export function toPointer(path: readonly PropertyKey[]) {
  return path.length ? `/${path.map(escapeToken).join('/')}` : ''
}

/** Structural validation of untrusted input; aggregates every issue as PERSIST_PAYLOAD_INVALID. */
export function parseStoredPayloadV1(
  input: unknown,
  sourceFile: string,
  collector: DiagnosticCollector,
) {
  const parsed = storedPayloadV1Schema.safeParse(input)
  if (parsed.success) return parsed.data
  for (const issue of parsed.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        collector.error({
          code: 'PERSIST_PAYLOAD_INVALID',
          sourceFile,
          path: toPointer([...issue.path, key]),
          message: `Unexpected field ${key}; the classification payload contains only its versioned fields`,
        })
      }
      continue
    }
    collector.error({
      code: 'PERSIST_PAYLOAD_INVALID',
      sourceFile,
      path: toPointer(issue.path),
      message: issue.message,
    })
  }
  return undefined
}
