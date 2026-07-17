import type { CompletedAnswers } from '@ramen-style/classification-core'
import { expect, test } from 'vitest'

import {
  clearWebState,
  restoreWebState,
  saveWebState,
  type StorageLike,
  webStateStorageKey,
} from './web-persistence.js'

const normalAnswers = {
  form: ['soup'],
  archetype: ['chintan'],
  tare: ['shoyu'],
  source: ['chicken'],
  body: ['balanced'],
  noodle: ['thin-straight'],
  signature: ['yuzu-citrus'],
  exclusions: ['none'],
} as const satisfies CompletedAnswers

function memoryStorage(): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  }
}

test('saves and restores a validated answer draft by stable identity', () => {
  const storage = memoryStorage()
  expect(saveWebState(storage, {
    draft: normalAnswers,
    currentQuestionId: 'exclusions',
    completed: true,
    updatedAt: '2026-07-18T00:00:00.000Z',
  })).toEqual({ ok: true })
  expect(restoreWebState(storage)).toEqual({
    ok: true,
    state: {
      draft: normalAnswers,
      currentQuestionId: 'exclusions',
      completed: true,
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
  })
})

test.each([
  ['unknown schema', { schemaVersion: 2 }],
  ['wrong classification identity', { schemaVersion: 1, classificationDataVersion: 'old' }],
  ['invalid answer draft', {
    schemaVersion: 1,
    classificationDataVersion: '7476f4b8ebd1232b435b3478bb6ae170f805d1b9a462c6e045590cb13022c840',
    answerDraft: { form: ['not-an-option'] },
    currentQuestionId: 'form',
    completed: false,
    updatedAt: '2026-07-18T00:00:00.000Z',
  }],
])('fails closed for %s', (_label, value) => {
  const storage = memoryStorage()
  storage.setItem(webStateStorageKey, JSON.stringify(value))
  expect(restoreWebState(storage)).toEqual({ ok: false, code: 'WEB_STATE_INVALID' })
})

test('clears the Web-owned key without touching other values', () => {
  const storage = memoryStorage()
  storage.setItem(webStateStorageKey, '{}')
  storage.setItem('other', 'keep')
  clearWebState(storage)
  expect(storage.getItem(webStateStorageKey)).toBeNull()
  expect(storage.getItem('other')).toBe('keep')
})
