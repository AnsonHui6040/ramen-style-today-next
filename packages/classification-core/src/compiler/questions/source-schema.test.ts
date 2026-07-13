import { describe, expect, test } from 'vitest'

import { questionDefinitionSourceSchema } from './source-schema.js'

const validQuestion = {
  id: 'form',
  order: 0,
  messageIds: {
    title: 'question-form-title',
    description: 'question-form-description',
  },
  selection: { type: 'single', min: 1, max: 1 },
  options: [{
    id: 'soup',
    order: 0,
    messageIds: {
      label: 'option-form-soup-label',
      description: 'option-form-soup-description',
    },
  }],
  weight: 16,
} as const

describe('questionDefinitionSourceSchema', () => {
  test('accepts a serializable source question', () => {
    expect(questionDefinitionSourceSchema.safeParse(validQuestion).success).toBe(true)
  })

  test('rejects closures and option-owned weights', () => {
    expect(questionDefinitionSourceSchema.safeParse({
      ...validQuestion,
      availableWhen: () => true,
    }).success).toBe(false)
    expect(questionDefinitionSourceSchema.safeParse({
      ...validQuestion,
      options: [{ ...validQuestion.options[0], weight: 16 }],
    }).success).toBe(false)
  })

  test('requires initial options for restore-on-empty', () => {
    expect(questionDefinitionSourceSchema.safeParse({
      ...validQuestion,
      pendingSelection: {
        emptyBehavior: { type: 'restore-initial-ui-options' },
      },
    }).success).toBe(false)
  })

  test('rejects duplicate option orders', () => {
    const result = questionDefinitionSourceSchema.safeParse({
      ...validQuestion,
      options: [
        validQuestion.options[0],
        {
          ...validQuestion.options[0],
          id: 'tsukemen',
        },
      ],
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['options', 1, 'order'],
      message: 'duplicate option order 0',
    }))
  })
})
