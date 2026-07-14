import type { PersistenceInvariantCode } from './contracts.js'

export class PersistenceInvariantError extends Error {
  constructor(readonly invariantCode: PersistenceInvariantCode, message: string) {
    super(Array.from(message).slice(0, 300).join(''))
    this.name = 'PersistenceInvariantError'
  }
}
