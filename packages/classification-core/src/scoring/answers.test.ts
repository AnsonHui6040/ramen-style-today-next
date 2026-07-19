import { describe, expect, test } from 'vitest'

import { validateCompletedAnswers } from './answers.js'
import { classificationModel, completedAnswers } from './test-fixtures.js'

describe('completed scoring answers', () => {
  test('accepts a complete semantic set and returns canonical flow order', () => {
    const reordered = {
      exclusions: ['none'],
      signature: ['no-preference'],
      noodle: ['medium-thin-straight'],
      body: ['balanced'],
      source: ['chicken', 'pork'],
      tare: ['shoyu'],
      archetype: ['chintan'],
      form: ['soup'],
    }
    const before = JSON.stringify(reordered)

    const result = validateCompletedAnswers(classificationModel.questionModel, reordered)

    expect(result).toEqual({ ok: true, answers: completedAnswers })
    expect(JSON.stringify(reordered)).toBe(before)
  })

  test.each([
    ['missing', { ...completedAnswers, body: undefined }],
    ['unknown question', { ...completedAnswers, mystery: ['balanced'] }],
    ['unknown option', { ...completedAnswers, body: ['mystery'] }],
    ['wrong owner', { ...completedAnswers, body: ['pork'] }],
    ['duplicate', { ...completedAnswers, source: ['pork', 'pork'] }],
    ['exclusive conflict', { ...completedAnswers, exclusions: ['none', 'pork'] }],
    ['repair requiring', { ...completedAnswers, form: ['dry'] }],
  ])('rejects %s without exposing flow diagnostics', (_name, answers) => {
    expect(validateCompletedAnswers(classificationModel.questionModel, answers)).toEqual({
      ok: false,
    })
  })

  test('contains synchronous reflection failures', () => {
    const revoked = Proxy.revocable(completedAnswers, {})
    revoked.revoke()
    expect(validateCompletedAnswers(classificationModel.questionModel, revoked.proxy)).toEqual({
      ok: false,
    })
  })
})
