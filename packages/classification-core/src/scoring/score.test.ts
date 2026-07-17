import { describe, expect, test, vi } from 'vitest'

import { scoreCompletedAnswers } from './score.js'
import {
  classificationModel,
  cloneClassificationModel,
  completedAnswers,
} from './test-fixtures.js'

function expectDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  expect(Object.isFrozen(value)).toBe(true)
  for (const child of Object.values(value)) expectDeeplyFrozen(child, seen)
}

describe('public scoring orchestration', () => {
  test('returns immutable deterministic results with shared trace references', () => {
    const modelBefore = JSON.stringify(classificationModel)
    const answersBefore = JSON.stringify(completedAnswers)
    const first = scoreCompletedAnswers(classificationModel, completedAnswers)
    const second = scoreCompletedAnswers(classificationModel, completedAnswers)
    expect(first.ok).toBe(true)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expectDeeplyFrozen(first)
    expect(JSON.stringify(classificationModel)).toBe(modelBefore)
    expect(JSON.stringify(completedAnswers)).toBe(answersBefore)
    if (!first.ok) return
    expect(first.outcome.results).toHaveLength(3)
    expect(first.outcome.alternativeResults).toHaveLength(3)
    for (const result of [...first.outcome.results, ...first.outcome.alternativeResults]) {
      expect(first.outcome.trace.styleCandidates.find(({ styleId }) => (
        styleId === result.styleId
      ))).toBe(result.trace)
    }
  })

  test('maps external answers, model identity, and invariant failures to exact diagnostics', () => {
    expect(scoreCompletedAnswers(classificationModel, {} as never)).toEqual({
      ok: false,
      diagnostics: [{
        severity: 'error',
        code: 'SCORING_COMPLETED_ANSWERS_INVALID',
        sourceFile: 'runtime://scoring',
        path: '/answers',
        message: 'Completed answers are invalid for this classification model',
      }],
    })

    const identityModel = cloneClassificationModel()
    ;(identityModel as { modelVersion: string }).modelVersion = 'wrong'
    expect(scoreCompletedAnswers(identityModel, completedAnswers)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'SCORING_MODEL_IDENTITY_MISMATCH', path: '/model' }],
    })

    const invariantModel = cloneClassificationModel()
    ;(invariantModel.styleModel.styles[0]!.cores[0]!.rules as unknown as unknown[]).pop()
    expect(scoreCompletedAnswers(invariantModel, completedAnswers)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'SCORING_INVARIANT_FAILED', path: '/trace' }],
    })
  })

  test('does not leak reflection trap details', () => {
    const answers = new Proxy(completedAnswers, {
      ownKeys() {
        throw new Error('SECRET_TRAP_STACK')
      },
    })
    const result = scoreCompletedAnswers(classificationModel, answers)
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'SCORING_COMPLETED_ANSWERS_INVALID' }],
    })
    expect(JSON.stringify(result)).not.toContain('SECRET_TRAP_STACK')
    expectDeeplyFrozen(result)

    const model = new Proxy(classificationModel, {
      get(target, key, receiver) {
        if (key === 'dataVersion') throw new Error('SECRET_MODEL_TRAP')
        return Reflect.get(target, key, receiver)
      },
    })
    const modelResult = scoreCompletedAnswers(model, completedAnswers)
    expect(modelResult).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'SCORING_MODEL_IDENTITY_MISMATCH' }],
    })
    expect(JSON.stringify(modelResult)).not.toContain('SECRET_MODEL_TRAP')
    expectDeeplyFrozen(modelResult)
  })

  test('is independent of accepted array and answer insertion order', () => {
    const model = cloneClassificationModel()
    ;(model.styleModel.styles as unknown as unknown[]).reverse()
    for (const style of model.styleModel.styles) {
      ;(style.cores as unknown as unknown[]).reverse()
      ;(style.adjustments as unknown as unknown[]).reverse()
      for (const adjustment of style.adjustments) {
        const conditions = adjustment.kind === 'bonus'
          ? adjustment.conditions
          : adjustment.whenAll
        ;(conditions as unknown as unknown[]).reverse()
      }
      for (const core of style.cores) {
        ;(core.rules as unknown as unknown[]).reverse()
        ;(core.subtypes as unknown as unknown[]).reverse()
        for (const rule of core.rules) {
          ;(rule.targets as unknown as unknown[]).reverse()
        }
      }
    }
    const reorderedAnswers = {
      exclusions: ['none'],
      signature: ['no-preference'],
      noodle: ['medium-thin-straight'],
      body: ['balanced'],
      source: ['chicken', 'pork'],
      tare: ['shoyu'],
      archetype: ['chintan'],
      form: ['soup'],
    } as const

    expect(JSON.stringify(scoreCompletedAnswers(model, reorderedAnswers))).toBe(
      JSON.stringify(scoreCompletedAnswers(classificationModel, completedAnswers)),
    )
  })

  test('does not depend on clock, random, locale comparison, or eligibility', () => {
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('clock forbidden')
    })
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('random forbidden')
    })
    const locale = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
      throw new Error('locale forbidden')
    })
    try {
      const result = scoreCompletedAnswers(classificationModel, completedAnswers)
      expect(result.ok).toBe(true)
      const bytes = JSON.stringify(result)
      expect(bytes).not.toMatch(/blocked|eligible|eligibility|catalog|allergy/i)
    } finally {
      clock.mockRestore()
      random.mockRestore()
      locale.mockRestore()
    }
  })

  test('rejects trusted question semantics that contradict accepted identity', () => {
    const model = cloneClassificationModel()
    const source = model.questionModel.questions.find(({ id }) => id === 'source')!
    const pork = source.options.find(({ id }) => id === 'pork')!
    const chicken = source.options.find(({ id }) => id === 'chicken')!
    const previous = pork.order
    ;(pork as { order: number }).order = chicken.order
    ;(chicken as { order: number }).order = previous

    expect(scoreCompletedAnswers(model, completedAnswers)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'SCORING_INVARIANT_FAILED', path: '/trace' }],
    })
  })
})
