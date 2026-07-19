import { describe, expect, test } from 'vitest'
import type { CompiledQuestionModel } from '../contracts/question-model.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { migrateVerifiedLegacyAnswers } from './legacy-lineage.js'
import { questionModel, verifiedLegacySourceId } from './test-fixtures.js'

function expectFailureCode(input: unknown, code: string) {
  const result = migrateVerifiedLegacyAnswers(questionModel, input)

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ code }),
  ]))
  expect(Object.isFrozen(result)).toBe(true)
}

describe('migrateVerifiedLegacyAnswers', () => {
  test('uses field-specific legacy shapes', () => {
    expectFailureCode({ form: ['soup'] }, 'PERSISTENCE_LEGACY_FIELD_SHAPE_INVALID')
    expectFailureCode({ source: 'pork' }, 'PERSISTENCE_LEGACY_FIELD_SHAPE_INVALID')
    expectFailureCode({ source: [['pork']] }, 'PERSISTENCE_LEGACY_FIELD_SHAPE_INVALID')
    expectFailureCode({ source: [1] }, 'PERSISTENCE_LEGACY_FIELD_SHAPE_INVALID')
  })

  test('omits only verified empty source and signature arrays', () => {
    expect(migrateVerifiedLegacyAnswers(questionModel, {
      source: [],
      signature: [],
      exclusions: ['none'],
    })).toMatchObject({
      ok: true,
      draft: { exclusions: ['none'] },
    })
    expectFailureCode({ exclusions: [] }, 'PERSISTENCE_LEGACY_EMPTY_SELECTION_INVALID')
  })

  test('expands seafood only in exclusions and emits compiled option order', () => {
    const result = migrateVerifiedLegacyAnswers(questionModel, {
      source: ['shellfish', 'pork'],
      signature: [],
      exclusions: ['dairy', 'seafood'],
    })

    expect(result).toMatchObject({
      ok: true,
      draft: {
        source: ['pork', 'shellfish'],
        exclusions: ['fish-seafood', 'shellfish', 'shrimp-crab', 'dairy'],
      },
    })
    expectFailureCode({ source: ['seafood'] }, 'ANSWER_UNKNOWN_OPTION')
  })

  test('rejects seafood collisions instead of silently deduplicating', () => {
    expectFailureCode({
      source: [],
      signature: [],
      exclusions: ['seafood', 'shellfish'],
    }, 'PERSISTENCE_LEGACY_EXPANSION_CONFLICT')
  })

  test.each([
    [{ source: ['pork', 'pork'] }, 'ANSWER_DUPLICATE_OPTION'],
    [{ source: ['unsure', 'pork'] }, 'ANSWER_EXCLUSIVE_CONFLICT'],
    [{ source: ['future'] }, 'ANSWER_UNKNOWN_OPTION'],
    [{ source: ['dairy'] }, 'ANSWER_WRONG_OWNER'],
    [{ source: ['pork', 'chicken', 'duck', 'beef'] }, 'ANSWER_SELECTION_BOUNDS'],
  ])('keeps intrinsic invalid input invalid: %j', (input, code) => {
    expectFailureCode(input, code)
  })

  test('rejects unknown enumerable legacy fields rather than inferring lineage', () => {
    expectFailureCode({ stepIndex: 2 }, 'PERSISTENCE_UNKNOWN_FIELD')
    const inheritedName = migrateVerifiedLegacyAnswers(questionModel, {
      toString: 'private',
    })
    expect(inheritedName).toMatchObject({
      ok: false,
      diagnostics: [{
        code: 'PERSISTENCE_UNKNOWN_FIELD',
        path: '/toString',
      }],
    })
  })

  test('contains post-scan throwing reflection without exposing trap details', () => {
    const trapMessage = 'private trap message'
    let ownKeyReads = 0
    const input = new Proxy({ source: ['pork'] }, {
      ownKeys(target) {
        ownKeyReads += 1
        if (ownKeyReads >= 3) throw new Error(trapMessage)
        return Reflect.ownKeys(target)
      },
    })

    const result = migrateVerifiedLegacyAnswers(questionModel, input)

    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        stage: 'schema-migration',
        code: 'PERSISTENCE_ENVELOPE_INVALID',
        path: '',
      }],
    })
    expect(JSON.stringify(result)).not.toContain(trapMessage)
    expect(Object.isFrozen(result)).toBe(true)
  })

  test('contains a descriptor that changes to an accessor without invoking it', () => {
    let descriptorReads = 0
    let invoked = false
    const input = new Proxy({ source: ['pork'] }, {
      getOwnPropertyDescriptor(target, key) {
        if (key !== 'source') return Reflect.getOwnPropertyDescriptor(target, key)
        descriptorReads += 1
        if (descriptorReads < 5) return Reflect.getOwnPropertyDescriptor(target, key)
        return {
          configurable: true,
          enumerable: true,
          get() {
            invoked = true
            return ['pork']
          },
        }
      },
    })

    const result = migrateVerifiedLegacyAnswers(questionModel, input)

    expect(invoked).toBe(false)
    expect(result).toEqual({
      ok: false,
      diagnostics: [{
        stage: 'schema-migration',
        code: 'PERSISTENCE_ENVELOPE_INVALID',
        path: '',
      }],
    })
  })

  test('maps single answers and emits exact legacy-lineage evidence', () => {
    const result = migrateVerifiedLegacyAnswers(questionModel, {
      form: 'soup',
      archetype: 'chintan',
      exclusions: ['none'],
    })

    expect(result).toMatchObject({
      ok: true,
      draft: {
        form: ['soup'],
        archetype: ['chintan'],
        exclusions: ['none'],
      },
      migrations: [{
        kind: 'legacy-lineage',
        fromSourceId: verifiedLegacySourceId,
        toSchemaVersion: 1,
        toQuestionModelVersion: questionModel.metadata.modelVersion,
        toQuestionSemanticHash: questionModel.metadata.semanticHash,
      }],
    })
  })

  test('does not mutate input and returns deterministic deeply frozen results', () => {
    const input = {
      source: ['shellfish', 'pork'],
      exclusions: ['seafood'],
    }
    const first = migrateVerifiedLegacyAnswers(questionModel, input)
    const second = migrateVerifiedLegacyAnswers(questionModel, input)

    expect(first).toEqual(second)
    expect(input).toEqual({
      source: ['shellfish', 'pork'],
      exclusions: ['seafood'],
    })
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(first)).toBe(true)
    if (!first.ok) return
    expect(Object.isFrozen(first.draft.source)).toBe(true)
    expect(Object.isFrozen(first.migrations)).toBe(true)
  })

  test('stops before recursively scanning an oversized dense legacy array', () => {
    let descriptorReads = 0
    const dense = new Proxy(Array(10_000).fill('pork'), {
      getOwnPropertyDescriptor(target, key) {
        descriptorReads += 1
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })

    expectFailureCode({ source: dense }, 'PERSISTENCE_RESOURCE_LIMIT')
    expect(descriptorReads).toBeLessThan(10)
  })

  test('turns malformed trusted model artifacts into bounded invariant exceptions', () => {
    const invalidModel = {
      ...questionModel,
      metadata: null,
    } as unknown as CompiledQuestionModel

    expect(() => migrateVerifiedLegacyAnswers(invalidModel, {})).toThrow(
      PersistenceInvariantError,
    )
    try {
      migrateVerifiedLegacyAnswers(invalidModel, {})
    } catch (error) {
      expect(error).toMatchObject({
        invariantCode: 'PERSISTENCE_MODEL_ARTIFACT_INVALID',
      })
      expect((error as Error).message).not.toContain('metadata')
    }
  })

  test('rejects an unbounded trusted model version before publishing evidence', () => {
    const invalidModel = {
      ...questionModel,
      metadata: {
        ...questionModel.metadata,
        modelVersion: '🍜'.repeat(129),
      },
    } as CompiledQuestionModel

    expect(() => migrateVerifiedLegacyAnswers(invalidModel, {})).toThrow(
      PersistenceInvariantError,
    )
    try {
      migrateVerifiedLegacyAnswers(invalidModel, {})
    } catch (error) {
      expect(error).toMatchObject({
        invariantCode: 'PERSISTENCE_MODEL_ARTIFACT_INVALID',
      })
    }
  })
})
