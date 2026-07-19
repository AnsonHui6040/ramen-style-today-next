import { describe, expect, test } from 'vitest'

import { legacyScoringPolicy } from '../../definitions/policies.js'
import { scoringPolicyDefinitionSchema } from './source-schema.js'

describe('scoring policy source schema', () => {
  test('accepts the exact production policy and rejects unknown keys', () => {
    expect(scoringPolicyDefinitionSchema.safeParse(legacyScoringPolicy).success).toBe(true)
    expect(scoringPolicyDefinitionSchema.safeParse({
      ...legacyScoringPolicy,
      hiddenDefault: true,
    }).success).toBe(false)
  })

  test.each([
    ['non-finite weight', (value: Record<string, unknown>) => {
      const questions = structuredClone(value.scoredQuestions) as { weight: number }[]
      questions[0]!.weight = Number.POSITIVE_INFINITY
      value.scoredQuestions = questions
    }],
    ['negative priority', (value: Record<string, unknown>) => {
      const questions = structuredClone(value.scoredQuestions) as { priority: number }[]
      questions[0]!.priority = -1
      value.scoredQuestions = questions
    }],
    ['invalid ratio', (value: Record<string, unknown>) => {
      const tiers = structuredClone(value.tiers) as { ratio: number }[]
      tiers[0]!.ratio = 1.1
      value.tiers = tiers
    }],
  ])('rejects %s', (_name, mutate) => {
    const value = structuredClone(legacyScoringPolicy) as unknown as Record<string, unknown>
    mutate(value)
    expect(scoringPolicyDefinitionSchema.safeParse(value).success).toBe(false)
  })
})
