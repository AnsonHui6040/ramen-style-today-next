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
})
