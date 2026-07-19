import type { PersistenceInvariantCode } from './contracts.js'

const maximumInvariantMessageCodePoints = 300

function truncateCodePoints(value: string, maximum: number): string {
  let result = ''
  let count = 0
  const iterator = value[Symbol.iterator]()

  while (count < maximum) {
    const step = iterator.next()
    if (step.done) break
    result += step.value
    count += 1
  }

  return result
}

export class PersistenceInvariantError extends Error {
  constructor(readonly invariantCode: PersistenceInvariantCode, message: string) {
    super(truncateCodePoints(message, maximumInvariantMessageCodePoints))
    this.name = 'PersistenceInvariantError'
  }
}
