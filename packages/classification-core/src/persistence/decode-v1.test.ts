import { describe, expect, test } from 'vitest'
import { decodeStoredPayloadV1Structure } from './decode-v1.js'
import { currentV1 } from './test-fixtures.js'

describe('decodeStoredPayloadV1Structure', () => {
  test('decodes the exact V1 fields without interpreting answer ownership', () => {
    const input = currentV1({
      cursorQuestionId: 'retired-question',
      submittedAnswers: { retiredQuestion: ['retiredOption'] },
    })
    const result = decodeStoredPayloadV1Structure(input)

    expect(result).toEqual({
      ok: true,
      payload: input,
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(result.ok && result.payload).not.toBe(input)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.submittedAnswers)).toBe(false)
  })

  test('keeps old-model answer IDs structural before model migration', () => {
    expect(decodeStoredPayloadV1Structure({
      schemaVersion: 1,
      questionModelVersion: 'registered-old.1',
      questionSemanticHash: 'a'.repeat(64),
      submittedAnswers: { retiredQuestion: ['retiredOption'] },
    }).ok).toBe(true)
  })

  test.each(['A'.repeat(64), `0x${'a'.repeat(64)}`, ` ${'a'.repeat(64)}`])(
    'rejects semantic hash %s',
    (hash) => expect(decodeStoredPayloadV1Structure({
      ...currentV1(),
      questionSemanticHash: hash,
    })).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'schema-decode',
        code: 'PERSISTENCE_SEMANTIC_HASH_INVALID',
        path: '/questionSemanticHash',
      }],
    }),
  )

  test('requires exact V1 fields and rejects unknown fields', () => {
    const missing = currentV1()
    delete missing.submittedAnswers

    expect(decodeStoredPayloadV1Structure(missing)).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'PERSISTENCE_REQUIRED_FIELD_MISSING',
        path: '/submittedAnswers',
      }],
    })
    expect(decodeStoredPayloadV1Structure({ ...currentV1(), stepIndex: 2 })).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'PERSISTENCE_UNKNOWN_FIELD',
        path: '/stepIndex',
      }],
    })
  })

  test.each([
    ['schemaVersion', { schemaVersion: '1' }],
    ['questionModelVersion', { questionModelVersion: 1 }],
    ['questionSemanticHash', { questionSemanticHash: 1 }],
    ['cursorQuestionId', { cursorQuestionId: 1 }],
  ])('rejects the wrong %s primitive', (_field, override) => {
    expect(decodeStoredPayloadV1Structure(currentV1(override)).ok).toBe(false)
  })

  test.each([1.5, -1, Number.NaN])(
    'rejects malformed numeric schema discriminator %s as invalid',
    (schemaVersion) => expect(decodeStoredPayloadV1Structure(currentV1({
      schemaVersion,
    }))).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'schema-decode',
        code: 'PERSISTENCE_FIELD_TYPE_INVALID',
        path: '/schemaVersion',
      }],
    }),
  )

  test('bounds model and cursor identifiers by Unicode code point', () => {
    expect(decodeStoredPayloadV1Structure(currentV1({
      questionModelVersion: '🍜'.repeat(129),
    }))).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'PERSISTENCE_RESOURCE_LIMIT',
        path: '/questionModelVersion',
      }],
    })
    expect(decodeStoredPayloadV1Structure(currentV1({
      cursorQuestionId: 'a'.repeat(129),
    }))).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'PERSISTENCE_RESOURCE_LIMIT',
        path: '/cursorQuestionId',
      }],
    })
  })

  test('leaves submittedAnswers unknown for the later current-model decoder', () => {
    expect(decodeStoredPayloadV1Structure(currentV1({ submittedAnswers: 42 }))).toEqual({
      ok: true,
      payload: currentV1({ submittedAnswers: 42 }),
    })
  })

  test('does not promote non-enumerable submitted fields into wire data', () => {
    const submittedAnswers = Object.defineProperty({}, 'form', {
      enumerable: false,
      value: ['soup'],
    })
    const result = decodeStoredPayloadV1Structure(currentV1({ submittedAnswers }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.submittedAnswers).toEqual({})
    expect(Object.keys(result.payload.submittedAnswers as object)).toEqual([])
    expect(Object.isFrozen(result.payload.submittedAnswers)).toBe(true)
    expect(Object.isFrozen(submittedAnswers)).toBe(false)
  })

  test('bounds unknown-field diagnostics without exposing oversized names', () => {
    const oversizedField = 'private-field-'.repeat(10_000)
    const result = decodeStoredPayloadV1Structure({
      ...currentV1(),
      [oversizedField]: true,
    })

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'schema-decode',
        code: 'PERSISTENCE_UNKNOWN_FIELD',
        path: '',
      }],
    })
    expect(JSON.stringify(result).length).toBeLessThan(1_000)
    expect(JSON.stringify(result)).not.toContain(oversizedField)
  })

  test('requires V1 fields to be enumerable wire data', () => {
    const input = currentV1()
    Object.defineProperty(input, 'submittedAnswers', {
      enumerable: false,
      value: {},
    })

    expect(decodeStoredPayloadV1Structure(input)).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'schema-decode',
        code: 'PERSISTENCE_REQUIRED_FIELD_MISSING',
        path: '/submittedAnswers',
      }],
    })
  })

  test('ignores hidden optional and extra fields as non-wire data', () => {
    const input = currentV1()
    Object.defineProperties(input, {
      cursorQuestionId: {
        enumerable: false,
        value: 'retired-question',
      },
      stepIndex: {
        enumerable: false,
        value: 2,
      },
    })

    expect(decodeStoredPayloadV1Structure(input)).toEqual({
      ok: true,
      payload: currentV1(),
    })
  })
})
