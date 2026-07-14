import { describe, expect, test } from 'vitest'
import type { CompiledQuestionModel } from '../contracts/question-model.js'
import { decodeCurrentAnswerDraft } from './decode-answers.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { persistenceLimits } from './limits.js'
import { questionModel } from './test-fixtures.js'

function expectDiagnostic(
  input: unknown,
  code: string,
  path: string,
): void {
  const result = decodeCurrentAnswerDraft(questionModel, input)

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ stage: 'answer-decode', code, path }),
  ]))
  expect(Object.isFrozen(result)).toBe(true)
}

describe('decodeCurrentAnswerDraft', () => {
  test('returns the submitted draft rather than canonical or forced answers', () => {
    const input = { form: ['soup'] }
    const result = decodeCurrentAnswerDraft(questionModel, input)

    expect(result).toEqual({ ok: true, draft: { form: ['soup'] } })
    expect(Object.isFrozen(result)).toBe(true)
    expect(input).toEqual({ form: ['soup'] })
  })

  test.each([
    [{ form: 'soup' }, 'ANSWER_DRAFT_INVALID', '/submittedAnswers/form'],
    [{ future: ['unknown'] }, 'ANSWER_UNKNOWN_QUESTION', '/submittedAnswers/future'],
    [{ form: ['unknown'] }, 'ANSWER_UNKNOWN_OPTION', '/submittedAnswers/form/0'],
    [{ form: ['pork'] }, 'ANSWER_WRONG_OWNER', '/submittedAnswers/form/0'],
    [{ source: ['pork', 'pork'] }, 'ANSWER_DUPLICATE_OPTION', '/submittedAnswers/source/1'],
    [{ source: ['unsure', 'pork'] }, 'ANSWER_EXCLUSIVE_CONFLICT', '/submittedAnswers/source'],
    [{ form: [] }, 'ANSWER_SELECTION_BOUNDS', '/submittedAnswers/form'],
  ])('preserves %s current-answer failures with prefixed paths', (input, code, path) => {
    expectDiagnostic(input, code, path)
  })

  test('accepts intrinsically valid stale state for the later repair stage', () => {
    const input = { form: ['tsukemen'], archetype: ['chintan'] }

    expect(decodeCurrentAnswerDraft(questionModel, input)).toEqual({
      ok: true,
      draft: input,
    })
  })

  test('rejects answer accessors without invoking them or losing their path', () => {
    let invoked = false
    const input = Object.defineProperty({}, 'form', {
      enumerable: true,
      get() {
        invoked = true
        return ['soup']
      },
    })

    expectDiagnostic(
      input,
      'PERSISTENCE_ACCESSOR_FORBIDDEN',
      '/submittedAnswers/form',
    )
    expect(invoked).toBe(false)
  })

  test('applies question-entry limits before unknown-ID interpretation', () => {
    const entries: Record<string, readonly string[]> = {}
    for (let index = 0; index <= questionModel.questions.length; index += 1) {
      entries[`future-${index}`] = ['unknown']
    }

    expectDiagnostic(entries, 'PERSISTENCE_RESOURCE_LIMIT', '/submittedAnswers')
  })

  test('applies per-question model limits before duplicate interpretation', () => {
    const form = questionModel.questions.find(({ id }) => id === 'form')!
    const repeated = Array(form.options.length + 1).fill('soup')

    expectDiagnostic(
      { form: repeated },
      'PERSISTENCE_RESOURCE_LIMIT',
      '/submittedAnswers/form',
    )
  })

  test('stops inspecting a sparse array once its bounded selection count fails', () => {
    let descriptorReads = 0
    const sparse = new Proxy(new Array(10_000), {
      getOwnPropertyDescriptor(target, key) {
        descriptorReads += 1
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })

    expectDiagnostic(
      { form: sparse },
      'PERSISTENCE_RESOURCE_LIMIT',
      '/submittedAnswers/form',
    )
    expect(descriptorReads).toBeLessThan(10)
  })

  test('stops before recursively scanning an oversized dense selection array', () => {
    let descriptorReads = 0
    const dense = new Proxy(Array(10_000).fill('soup'), {
      getOwnPropertyDescriptor(target, key) {
        descriptorReads += 1
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })

    expectDiagnostic(
      { form: dense },
      'PERSISTENCE_RESOURCE_LIMIT',
      '/submittedAnswers/form',
    )
    expect(descriptorReads).toBeLessThan(10)
  })

  test('applies the hard total-selection limit before deduplication', () => {
    const template = questionModel.questions.find(({ id }) => id === 'source')!
    const options = Array.from({ length: 64 }, (_, index) => ({
      ...template.options[0]!,
      id: `option-${index}`,
      order: index,
    }))
    const questions = Array.from({ length: 9 }, (_, index) => ({
      ...template,
      id: `question-${index}`,
      order: index,
      options,
    }))
    const model = {
      ...questionModel,
      questions,
      topologicalOrder: questions.map(({ id }) => id),
    } as unknown as CompiledQuestionModel
    const input = Object.fromEntries(questions.map(({ id }) => (
      [id, Array(57).fill('option-0')]
    )))
    const result = decodeCurrentAnswerDraft(model, input)

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{
        stage: 'answer-decode',
        code: 'PERSISTENCE_RESOURCE_LIMIT',
        path: '/submittedAnswers',
      }],
    })
  })

  test('bounds question and option IDs by Unicode code point', () => {
    expectDiagnostic(
      { ['🍜'.repeat(persistenceLimits.maxIdCodePoints + 1)]: ['unknown'] },
      'PERSISTENCE_RESOURCE_LIMIT',
      '/submittedAnswers',
    )
    expectDiagnostic(
      { form: ['🍜'.repeat(persistenceLimits.maxIdCodePoints + 1)] },
      'PERSISTENCE_RESOURCE_LIMIT',
      '/submittedAnswers/form/0',
    )
  })

  test('turns trusted evaluator artifact failures into a bounded invariant exception', () => {
    const invalidModel = {
      ...questionModel,
      forcedIterationUpperBound: 0,
    } as CompiledQuestionModel

    expect(() => decodeCurrentAnswerDraft(invalidModel, {})).toThrow(
      PersistenceInvariantError,
    )
    try {
      decodeCurrentAnswerDraft(invalidModel, {})
    } catch (error) {
      expect(error).toMatchObject({
        invariantCode: 'PERSISTENCE_MODEL_ARTIFACT_INVALID',
      })
      expect((error as Error).message).not.toContain('submittedAnswers')
    }
  })

  test('turns malformed model-limit artifacts into a bounded invariant exception', () => {
    const invalidModel = {
      ...questionModel,
      questions: null,
    } as unknown as CompiledQuestionModel

    expect(() => decodeCurrentAnswerDraft(invalidModel, {})).toThrow(
      PersistenceInvariantError,
    )
    try {
      decodeCurrentAnswerDraft(invalidModel, {})
    } catch (error) {
      expect(error).toMatchObject({
        invariantCode: 'PERSISTENCE_MODEL_ARTIFACT_INVALID',
      })
      expect((error as Error).message).not.toContain('null')
      expect((error as Error).message).not.toContain('questions')
    }
  })
})
