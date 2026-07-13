import { describe, expect, test } from 'vitest'
import { decodeAnswerDraft } from './decode.js'

describe('decodeAnswerDraft', () => {
  test('decodes primitive draft structure without trusting semantic IDs', () => {
    expect(decodeAnswerDraft({ form: ['soup'], future: ['unknown-id'] })).toEqual({
      ok: true,
      draft: { form: ['soup'], future: ['unknown-id'] },
    })
  })

  test('rejects non-plain roots and non-array answer values', () => {
    expect(decodeAnswerDraft([]).ok).toBe(false)
    expect(decodeAnswerDraft(null).ok).toBe(false)
    expect(decodeAnswerDraft({ form: 'soup' }).ok).toBe(false)
    expect(decodeAnswerDraft(new (class Draft { form = ['soup'] })()).ok).toBe(false)
  })

  test('aggregates non-string array items with escaped RFC 6901 paths', () => {
    const result = decodeAnswerDraft({ 'a/b~c': ['ok', 1, false] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'ANSWER_DRAFT_INVALID', path: '/a~1b~0c/1' },
      { code: 'ANSWER_DRAFT_INVALID', path: '/a~1b~0c/2' },
    ])
  })

  test('rejects sparse string arrays at the missing item path', () => {
    const sparse = Array<string>(2)
    sparse[1] = 'soup'
    const result = decodeAnswerDraft({ form: sparse })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.diagnostics[0]?.path).toBe('/form/0')
  })

  test('copies and deeply freezes decoded success and failure results', () => {
    const input = { form: ['soup'] }
    const success = decodeAnswerDraft(input)
    expect(success.ok).toBe(true)
    if (!success.ok) return
    expect(success.draft).not.toBe(input)
    expect(success.draft.form).not.toBe(input.form)
    expect(Object.isFrozen(success)).toBe(true)
    expect(Object.isFrozen(success.draft)).toBe(true)
    expect(Object.isFrozen(success.draft.form)).toBe(true)
    expect(() => Object.assign(success.draft, { form: ['dry'] })).toThrow()
    expect(input).toEqual({ form: ['soup'] })

    const failure = decodeAnswerDraft({ form: [1] })
    expect(failure.ok).toBe(false)
    if (failure.ok) return
    expect(Object.isFrozen(failure)).toBe(true)
    expect(Object.isFrozen(failure.diagnostics)).toBe(true)
    expect(Object.isFrozen(failure.diagnostics[0])).toBe(true)
  })

  test('accepts a null-prototype plain record', () => {
    const input = Object.create(null) as Record<string, unknown>
    input.form = ['soup']
    expect(decodeAnswerDraft(input)).toEqual({ ok: true, draft: { form: ['soup'] } })
  })

  test('rejects accessor properties without executing untrusted code', () => {
    const input = Object.defineProperty({}, 'form', {
      enumerable: true,
      get() {
        throw new Error('must not execute')
      },
    })
    const result = decodeAnswerDraft(input)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.diagnostics[0]).toEqual(expect.objectContaining({
      code: 'ANSWER_DRAFT_INVALID',
      path: '/form',
    }))
  })

  test('preserves inherited-looking data keys without mutating the result prototype', () => {
    const input = {}
    Object.defineProperty(input, '__proto__', {
      value: ['future'],
      enumerable: true,
    })
    Object.defineProperty(input, 'constructor', {
      value: ['shadow'],
      enumerable: true,
    })

    const result = decodeAnswerDraft(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.draft)).toEqual(['__proto__', 'constructor'])
    expect(Object.prototype.hasOwnProperty.call(result.draft, '__proto__')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(result.draft, 'constructor')).toBe(true)
    expect(Object.getPrototypeOf(input)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(result.draft)).toBe(Object.prototype)
    expect(result.draft['__proto__']).toEqual(['future'])
    expect(result.draft.constructor).toEqual(['shadow'])
    expect(JSON.stringify(result.draft)).toBe(
      '{"__proto__":["future"],"constructor":["shadow"]}',
    )
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.draft)).toBe(true)
    expect(Object.isFrozen(result.draft['__proto__'])).toBe(true)
    expect(Object.isFrozen(result.draft.constructor)).toBe(true)
  })
})
