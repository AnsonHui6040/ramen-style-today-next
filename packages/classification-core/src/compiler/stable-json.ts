import { compareCodePoints } from '../contracts/source-path.js'

export function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodePoints(left, right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

export function stableJson(value: unknown) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`
}
