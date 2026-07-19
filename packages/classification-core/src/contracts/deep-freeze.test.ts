import { describe, expect, test } from 'vitest'

import { deepFreeze } from './deep-freeze.js'

describe('deepFreeze', () => {
  test('freezes mutable descendants of an already-frozen container', () => {
    const child = { id: 'soup' }
    const items = [child]
    const value = Object.freeze({ items })

    const frozen = deepFreeze(value)

    expect(frozen).toBe(value)
    expect(Object.isFrozen(frozen)).toBe(true)
    expect(Object.isFrozen(items)).toBe(true)
    expect(Object.isFrozen(child)).toBe(true)
  })
})
