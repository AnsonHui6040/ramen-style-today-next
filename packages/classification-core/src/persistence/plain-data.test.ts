import { describe, expect, test } from 'vitest'
import { scanPlainData } from './plain-data.js'

describe('scanPlainData', () => {
  test('accepts bounded acyclic plain data and counts root depth as zero', () => {
    const shared = { value: null }
    const input = Object.assign(Object.create(null) as Record<string, unknown>, {
      a: { b: { c: { d: 'ok' } } },
      array: [undefined, true, 1, shared],
      left: shared,
      right: shared,
    })

    const result = scanPlainData(input)

    expect(result).toEqual({ ok: true })
    expect(Object.isFrozen(result)).toBe(true)
    expect(scanPlainData({ a: { b: { c: { d: { e: 'deep' } } } } })).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'PERSISTENCE_RESOURCE_LIMIT',
        path: '/a/b/c/d/e',
      }],
    })
  })

  test('rejects an accessor without invoking it', () => {
    let invoked = false
    const input = Object.defineProperty({}, 'payload', {
      enumerable: true,
      get() {
        invoked = true
        return {}
      },
    })

    const result = scanPlainData(input)

    expect(invoked).toBe(false)
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PERSISTENCE_ACCESSOR_FORBIDDEN', path: '/payload' }],
    })
  })

  test('rejects non-enumerable accessors without invoking them', () => {
    let invoked = false
    const input = Object.defineProperty({}, 'hidden', {
      enumerable: false,
      get() {
        invoked = true
        return 'secret'
      },
    })

    expect(scanPlainData(input)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PERSISTENCE_ACCESSOR_FORBIDDEN', path: '/hidden' }],
    })
    expect(invoked).toBe(false)
  })

  test('rejects cycles but permits repeated non-ancestor references', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const shared = { answer: 'soup' }

    expect(scanPlainData(cycle)).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'PERSISTENCE_CIRCULAR_REFERENCE',
        path: '/self',
      }],
    })
    expect(scanPlainData({ first: shared, second: shared })).toEqual({ ok: true })
  })

  test.each([
    ['Date', new Date()],
    ['Map', new Map()],
    ['Set', new Set()],
    ['class instance', new (class Behavioral {})()],
    ['non-plain prototype', Object.create({ inherited: true })],
  ])('rejects behavioral object: %s', (_name, value) => {
    expect(scanPlainData(value)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PERSISTENCE_DATA_NOT_PLAIN', path: '' }],
    })
  })

  test.each(['__proto__', 'prototype', 'constructor'])('rejects own dangerous key %s', (key) => {
    const input = Object.defineProperty({}, key, {
      configurable: true,
      enumerable: true,
      value: 'blocked',
      writable: true,
    })

    expect(scanPlainData(input)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PERSISTENCE_DANGEROUS_KEY', path: `/${key}` }],
    })
  })

  test('rejects symbols, functions, and BigInts and aggregates independent errors', () => {
    const symbolKey = Symbol('hidden')
    const input = {
      symbolValue: Symbol('secret'),
      callback: () => 'no',
      amount: 1n,
      [symbolKey]: 'hidden',
    }

    const result = scanPlainData(input)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PERSISTENCE_DATA_NOT_PLAIN', path: '' }),
      expect.objectContaining({ code: 'PERSISTENCE_DATA_NOT_PLAIN', path: '/amount' }),
      expect.objectContaining({ code: 'PERSISTENCE_DATA_NOT_PLAIN', path: '/callback' }),
      expect.objectContaining({ code: 'PERSISTENCE_DATA_NOT_PLAIN', path: '/symbolValue' }),
    ]))
    expect(Object.isFrozen(result.diagnostics)).toBe(true)
    expect(Object.isFrozen(result.diagnostics[0])).toBe(true)
  })

  test('escapes hostile property names in diagnostic pointers', () => {
    const input = Object.defineProperty({}, 'a~/b', {
      enumerable: true,
      set() {},
    })

    expect(scanPlainData(input)).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'PERSISTENCE_ACCESSOR_FORBIDDEN',
        path: '/a~0~1b',
      }],
    })
  })
})
