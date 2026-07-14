import { describe, expect, test } from 'vitest'
import { decodeMinimalEnvelope, decodeRestoreSource } from './decode-envelope.js'
import { currentV1, verifiedLegacySourceId } from './test-fixtures.js'

describe('decodeRestoreSource', () => {
  test('decodes only the two exact declared source shapes', () => {
    const legacy = decodeRestoreSource({
      kind: 'legacy-unversioned',
      sourceId: verifiedLegacySourceId,
      answers: { form: 'soup' },
    })
    const versioned = decodeRestoreSource({ kind: 'versioned', payload: currentV1() })

    expect(legacy).toEqual({
      ok: true,
      source: {
        kind: 'legacy-unversioned',
        sourceId: verifiedLegacySourceId,
        answers: { form: 'soup' },
      },
    })
    expect(versioned).toMatchObject({
      ok: true,
      source: { kind: 'versioned', payload: currentV1() },
    })
  })

  test('does not infer legacy source from shape and rejects extra fields', () => {
    expect(decodeRestoreSource({ answers: { form: 'soup' } }).ok).toBe(false)
    expect(decodeRestoreSource({
      kind: 'versioned',
      payload: currentV1(),
      stepIndex: 2,
    })).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'source',
        code: 'PERSISTENCE_UNKNOWN_FIELD',
        path: '/stepIndex',
      }],
    })
  })

  test('returns unsupported for an unregistered declared legacy lineage', () => {
    expect(decodeRestoreSource({
      kind: 'legacy-unversioned',
      sourceId: 'ramen-style-today@unregistered',
      answers: {},
    })).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'source',
        code: 'PERSISTENCE_SOURCE_UNSUPPORTED',
        path: '/sourceId',
      }],
    })
  })

  test('contains source accessors without invoking them', () => {
    let invoked = false
    const input = Object.defineProperty({ kind: 'versioned' }, 'payload', {
      enumerable: true,
      get() {
        invoked = true
        return currentV1()
      },
    })

    const result = decodeRestoreSource(input)

    expect(invoked).toBe(false)
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'source',
        code: 'PERSISTENCE_ACCESSOR_FORBIDDEN',
        path: '/payload',
      }],
    })
  })

  test('contains an accessor that appears after the scanner pass', () => {
    let descriptorReads = 0
    let invoked = false
    const input = new Proxy({
      kind: 'versioned',
      payload: currentV1(),
    }, {
      getOwnPropertyDescriptor(target, key) {
        if (key !== 'payload') return Reflect.getOwnPropertyDescriptor(target, key)
        descriptorReads += 1
        if (descriptorReads < 3) return Reflect.getOwnPropertyDescriptor(target, key)
        return {
          configurable: true,
          enumerable: true,
          get() {
            invoked = true
            return currentV1()
          },
        }
      },
    })

    const result = decodeRestoreSource(input)

    expect(invoked).toBe(false)
    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        stage: 'source',
        code: 'PERSISTENCE_ENVELOPE_INVALID',
        path: '',
      }],
    })
  })

  test('bounds explicit and scanner-remapped paths for oversized field names', () => {
    const oversizedField = 'private-field-'.repeat(10_000)
    const explicit = decodeRestoreSource({
      kind: 'versioned',
      payload: currentV1(),
      [oversizedField]: true,
    })
    let invoked = false
    const scannerInput = Object.defineProperty({
      kind: 'versioned',
      payload: currentV1(),
    }, oversizedField, {
      enumerable: true,
      get() {
        invoked = true
        return 'private-value'
      },
    })
    const scanner = decodeRestoreSource(scannerInput)

    expect(explicit).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'source',
        code: 'PERSISTENCE_UNKNOWN_FIELD',
        path: '',
      }],
    })
    expect(scanner).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'source',
        code: 'PERSISTENCE_ACCESSOR_FORBIDDEN',
        path: '',
      }],
    })
    expect(invoked).toBe(false)
    expect(JSON.stringify(explicit).length).toBeLessThan(1_000)
    expect(JSON.stringify(scanner).length).toBeLessThan(1_000)
    expect(JSON.stringify(explicit)).not.toContain(oversizedField)
    expect(JSON.stringify(scanner)).not.toContain(oversizedField)
  })

  test('uses enumerable source fields for required and extension semantics', () => {
    const hiddenPayload = Object.defineProperty({ kind: 'versioned' }, 'payload', {
      enumerable: false,
      value: currentV1(),
    })
    const hiddenExtra = Object.defineProperty({
      kind: 'versioned',
      payload: currentV1(),
    }, 'stepIndex', {
      enumerable: false,
      value: 2,
    })

    expect(decodeRestoreSource(hiddenPayload)).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'PERSISTENCE_REQUIRED_FIELD_MISSING',
        path: '/payload',
      }],
    })
    expect(decodeRestoreSource(hiddenExtra).ok).toBe(true)
  })
})

describe('decodeMinimalEnvelope', () => {
  test('reads only minimal identity fields without interpreting submitted answers', () => {
    const result = decodeMinimalEnvelope(currentV1({
      cursorQuestionId: 'retired-question',
      submittedAnswers: { retiredQuestion: ['retiredOption'] },
    }))

    expect(result).toEqual({
      ok: true,
      envelope: {
        schemaVersion: 1,
        questionModelVersion: 'batch2a.1.0',
        questionSemanticHash: 'd1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d',
      },
    })
  })

  test('requires a schema version but leaves its value for staged selection', () => {
    expect(decodeMinimalEnvelope({ submittedAnswers: {} })).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'minimal-envelope',
        code: 'PERSISTENCE_REQUIRED_FIELD_MISSING',
        path: '/schemaVersion',
      }],
    })
    expect(decodeMinimalEnvelope({ schemaVersion: 2 })).toEqual({
      ok: true,
      envelope: { schemaVersion: 2 },
    })
    expect(decodeMinimalEnvelope({ schemaVersion: '1' })).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'minimal-envelope',
        code: 'PERSISTENCE_FIELD_TYPE_INVALID',
        path: '/schemaVersion',
      }],
    })
  })

  test('remaps bounded scanner failures to the minimal-envelope stage', () => {
    const symbol = Symbol('hidden')
    const result = decodeMinimalEnvelope({ schemaVersion: 1, [symbol]: true })

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'minimal-envelope',
        code: 'PERSISTENCE_DATA_NOT_PLAIN',
        path: '',
      }],
    })
    expect(Object.isFrozen(result)).toBe(true)
  })

  test('does not accept a hidden schema discriminator as a wire field', () => {
    const input = Object.defineProperty({}, 'schemaVersion', {
      enumerable: false,
      value: 1,
    })

    expect(decodeMinimalEnvelope(input)).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'minimal-envelope',
        code: 'PERSISTENCE_REQUIRED_FIELD_MISSING',
        path: '/schemaVersion',
      }],
    })
  })
})
