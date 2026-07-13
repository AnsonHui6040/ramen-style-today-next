import {
  legacyObservableTraceCaseSchema,
  type LegacyObservableTraceCase,
} from './contracts.js'

export interface ParityMismatch {
  readonly caseId: string
  readonly pointer: string
  readonly expectedValue: string
  readonly receivedValue: string
  readonly replayCommand: string
}

function escapePointer(value: string) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function boundedValue(value: unknown) {
  const serialized = value === undefined ? '<missing>' : JSON.stringify(value)
  return serialized.length <= 300 ? serialized : serialized.slice(0, 300)
}

function firstDifference(
  expected: unknown,
  received: unknown,
  pointer: string,
): { readonly pointer: string; readonly expected: unknown; readonly received: unknown } | undefined {
  if (Object.is(expected, received)) return undefined
  if (Array.isArray(expected) && Array.isArray(received)) {
    const length = Math.max(expected.length, received.length)
    for (let index = 0; index < length; index += 1) {
      const difference = firstDifference(expected[index], received[index], `${pointer}/${index}`)
      if (difference) return difference
    }
    return undefined
  }
  if (
    expected && received
    && typeof expected === 'object' && typeof received === 'object'
    && !Array.isArray(expected) && !Array.isArray(received)
  ) {
    const keys = [...new Set([
      ...Object.keys(expected),
      ...Object.keys(received),
    ])]
    for (const key of keys) {
      const difference = firstDifference(
        (expected as Record<string, unknown>)[key],
        (received as Record<string, unknown>)[key],
        `${pointer}/${escapePointer(key)}`,
      )
      if (difference) return difference
    }
    return undefined
  }
  return { pointer: pointer || '/', expected, received }
}

export function compareParityCase(
  expectedInput: LegacyObservableTraceCase,
  receivedInput: LegacyObservableTraceCase,
): ParityMismatch | undefined {
  const expected = legacyObservableTraceCaseSchema.parse(expectedInput)
  const received = legacyObservableTraceCaseSchema.parse(receivedInput)
  const difference = firstDifference(expected.frames, received.frames, '/frames')
    ?? firstDifference(expected.actions, received.actions, '/actions')
    ?? firstDifference(expected.coverageTags, received.coverageTags, '/coverageTags')
    ?? firstDifference(expected.id, received.id, '/id')
  if (!difference) return undefined
  return Object.freeze({
    caseId: expected.id,
    pointer: difference.pointer,
    expectedValue: boundedValue(difference.expected),
    receivedValue: boundedValue(difference.received),
    replayCommand: `npm run parity:questions -- --case ${expected.id}`,
  })
}
