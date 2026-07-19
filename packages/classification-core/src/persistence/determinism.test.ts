import { describe, expect, test } from 'vitest'

import type { CompiledQuestionModel } from '../contracts/question-model.js'
import {
  chintanDraft,
  completeSoupDraft,
} from '../flow/test-fixtures.js'
import type { AnswerDraft } from '../flow/types.js'
import {
  createStoredClassificationPayloadV1,
  restoreClassification,
} from '../index.js'
import type {
  ClassificationRestoreSource,
  CreateStoredPayloadResult,
  RestoreResult,
} from './contracts.js'
import {
  currentV1,
  questionModel,
  verifiedLegacySourceId,
} from './test-fixtures.js'

function expectDeepFrozenPlainData(value: unknown): void {
  const ancestors = new WeakSet<object>()
  const visited = new WeakSet<object>()

  const visit = (current: unknown): void => {
    if (
      current === null
      || current === undefined
      || typeof current === 'string'
      || typeof current === 'boolean'
    ) return
    if (typeof current === 'number') {
      expect(Number.isFinite(current)).toBe(true)
      return
    }
    expect(typeof current).toBe('object')
    if (typeof current !== 'object') return
    expect(ancestors.has(current)).toBe(false)
    if (visited.has(current)) return

    ancestors.add(current)
    visited.add(current)
    expect(Object.isFrozen(current)).toBe(true)
    expect(current).not.toBeInstanceOf(Error)
    expect(current).not.toBeInstanceOf(Date)
    expect(current).not.toBeInstanceOf(Map)
    expect(current).not.toBeInstanceOf(Set)
    const prototype = Object.getPrototypeOf(current)
    if (Array.isArray(current)) {
      expect(prototype).toBe(Array.prototype)
    } else {
      expect([Object.prototype, null]).toContain(prototype)
    }
    for (const key of Reflect.ownKeys(current)) {
      expect(typeof key).toBe('string')
      if (typeof key !== 'string') continue
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      expect(descriptor).toBeDefined()
      expect(descriptor && 'value' in descriptor).toBe(true)
      if (descriptor && 'value' in descriptor) visit(descriptor.value)
    }
    ancestors.delete(current)
  }

  visit(value)
}

function versioned(payload: unknown): ClassificationRestoreSource {
  return { kind: 'versioned', payload }
}

function legacy(answers: unknown): ClassificationRestoreSource {
  return {
    kind: 'legacy-unversioned',
    sourceId: verifiedLegacySourceId,
    answers,
  }
}

function expectRestoreDeterminism(source: ClassificationRestoreSource): RestoreResult {
  const mutableModel = structuredClone(questionModel) as CompiledQuestionModel
  const mutableSource = structuredClone(source) as ClassificationRestoreSource
  const modelBefore = structuredClone(mutableModel)
  const sourceBefore = structuredClone(mutableSource)
  const first = restoreClassification(mutableModel, mutableSource)
  const second = restoreClassification(mutableModel, mutableSource)

  expect(first).toEqual(second)
  expect(first).not.toBe(second)
  expect(mutableModel).toEqual(modelBefore)
  expect(mutableSource).toEqual(sourceBefore)
  expectDeepFrozenPlainData(first)
  expectDeepFrozenPlainData(second)
  return first
}

function expectBuilderDeterminism(
  submittedAnswers: AnswerDraft,
): CreateStoredPayloadResult {
  const mutableModel = structuredClone(questionModel) as CompiledQuestionModel
  const mutableAnswers = structuredClone(submittedAnswers) as AnswerDraft
  const modelBefore = structuredClone(mutableModel)
  const answersBefore = structuredClone(mutableAnswers)
  const first = createStoredClassificationPayloadV1(mutableModel, mutableAnswers)
  const second = createStoredClassificationPayloadV1(mutableModel, mutableAnswers)

  expect(first).toEqual(second)
  expect(first).not.toBe(second)
  expect(mutableModel).toEqual(modelBefore)
  expect(mutableAnswers).toEqual(answersBefore)
  expectDeepFrozenPlainData(first)
  expectDeepFrozenPlainData(second)
  return first
}

function expectRestoreFixedPoint(source: ClassificationRestoreSource): void {
  const first = restoreClassification(questionModel, source)
  expect(first.status).toBe('restored-with-changes')
  if (first.status !== 'restored-with-changes') return
  const second = restoreClassification(questionModel, versioned(first.normalizedPayload))

  expect(second).toMatchObject({
    status: 'restored',
    submittedAnswers: first.submittedAnswers,
    flowState: first.flowState,
    migrations: [],
    repairs: [],
    changes: [],
    writeBackRequired: false,
  })
  if (second.status !== 'restored') return
  expect(second.resumeQuestionId).toBe(first.resumeQuestionId)
  expectDeepFrozenPlainData(first.normalizedPayload)
  expectDeepFrozenPlainData(second)
}

describe('public persistence determinism and plain-data contracts', () => {
  test('returns equal frozen plain data for every restore result variant', () => {
    const restored = expectRestoreDeterminism(versioned(currentV1()))
    const changed = expectRestoreDeterminism(legacy({ form: 'soup' }))
    const unsupported = expectRestoreDeterminism(versioned(currentV1({
      schemaVersion: 2,
    })))
    const invalid = expectRestoreDeterminism(versioned(currentV1({
      submittedAnswers: { future: ['private'] },
    })))

    expect(restored.status).toBe('restored')
    expect(changed.status).toBe('restored-with-changes')
    expect(unsupported.status).toBe('unsupported')
    expect(invalid.status).toBe('invalid')
  })

  test('returns equal frozen plain data for both builder result variants', () => {
    const created = expectBuilderDeterminism({ form: ['soup'] })
    const invalid = expectBuilderDeterminism({ form: 'soup' } as unknown as AnswerDraft)

    expect(created.status).toBe('created')
    expect(invalid.status).toBe('invalid-submitted-state')
  })

  test.each([
    [{}, undefined],
    [chintanDraft, 'tare'],
    [completeSoupDraft, undefined],
    [{
      source: ['chicken', 'pork'],
      archetype: ['chintan'],
      form: ['soup'],
    }, undefined],
  ] as const)(
    'preserves builder-to-restore identity for %j with cursor %s',
    (input, cursorQuestionId) => {
      const built = createStoredClassificationPayloadV1(
        questionModel,
        input as AnswerDraft,
        cursorQuestionId,
      )
      expect(built.status).toBe('created')
      if (built.status !== 'created') return
      const restored = restoreClassification(questionModel, versioned(built.payload))

      expect(restored).toMatchObject({
        status: 'restored',
        submittedAnswers: built.payload.submittedAnswers,
        migrations: [],
        repairs: [],
        changes: [],
        writeBackRequired: false,
      })
      expectDeepFrozenPlainData(built)
      expectDeepFrozenPlainData(restored)
    },
  )

  test.each([
    ['legacy migration', legacy({ form: 'soup' })],
    ['legacy answer repair', legacy({
      form: 'tsukemen',
      archetype: 'miso-rich',
      tare: 'miso',
    })],
    ['canonical answer order', versioned(currentV1({
      submittedAnswers: {
        form: ['soup'],
        archetype: ['chintan'],
        source: ['chicken', 'pork'],
      },
    }))],
    ['cursor normalization', versioned(currentV1({
      cursorQuestionId: 'tare',
      submittedAnswers: { form: ['soup'] },
    }))],
    ['complete cursor removal', versioned(currentV1({
      cursorQuestionId: 'exclusions',
      submittedAnswers: completeSoupDraft,
    }))],
  ] as const)('proves normalized restore fixed point: %s', (_name, source) => {
    expectRestoreFixedPoint(source as ClassificationRestoreSource)
  })

  test('mutation attempts cannot change a result or later restore output', () => {
    const source = legacy({
      form: 'tsukemen',
      archetype: 'miso-rich',
      tare: 'miso',
    })
    const first = restoreClassification(questionModel, source)
    expect(first.status).toBe('restored-with-changes')
    if (first.status !== 'restored-with-changes') return
    const before = structuredClone(first)

    expect(() => Object.defineProperty(first, 'status', {
      value: 'invalid',
    })).toThrow()
    expect(() => (first.migrations as unknown[]).push({})).toThrow()
    expect(() => (
      first.submittedAnswers.form as unknown as string[]
    ).push('dry')).toThrow()
    expect(() => Object.defineProperty(first.normalizedPayload, 'private', {
      value: true,
    })).toThrow()

    expect(first).toEqual(before)
    expect(restoreClassification(questionModel, source)).toEqual(before)
  })

  test('contains accessor and Proxy failures in deterministic plain-data unions', () => {
    let invoked = false
    const accessorPayload = Object.defineProperty({}, 'schemaVersion', {
      enumerable: true,
      get() {
        invoked = true
        return 1
      },
    })
    const accessor = restoreClassification(questionModel, versioned(accessorPayload))
    expect(invoked).toBe(false)
    expect(accessor).toMatchObject({
      status: 'invalid',
      diagnostics: [{ code: 'PERSISTENCE_ACCESSOR_FORBIDDEN' }],
    })

    const revoked = Proxy.revocable({ kind: 'versioned', payload: currentV1() }, {})
    revoked.revoke()
    const proxy = restoreClassification(
      questionModel,
      revoked.proxy as ClassificationRestoreSource,
    )
    expect(proxy).toMatchObject({
      status: 'invalid',
      diagnostics: [{ code: 'PERSISTENCE_ENVELOPE_INVALID' }],
    })
    expectDeepFrozenPlainData(accessor)
    expectDeepFrozenPlainData(proxy)
  })

  test('keeps forced canonical answers out of submitted and stored state', () => {
    const result = restoreClassification(questionModel, legacy({
      form: 'tsukemen',
      archetype: 'miso-rich',
      tare: 'miso',
      source: [],
      signature: [],
      exclusions: ['none'],
    }))
    expect(result.status).toBe('restored-with-changes')
    if (result.status !== 'restored-with-changes') return

    expect(result.flowState.canonicalAnswers).toMatchObject({ tare: ['miso'] })
    expect(result.submittedAnswers).not.toHaveProperty('tare')
    expect(result.normalizedPayload.submittedAnswers).not.toHaveProperty('tare')
    expect(result.normalizedPayload).not.toHaveProperty('canonicalAnswers')
    expect(result.repairs).toEqual([expect.objectContaining({
      code: 'remove-submitted-forced-answer',
      questionId: 'tare',
    })])
  })
})
