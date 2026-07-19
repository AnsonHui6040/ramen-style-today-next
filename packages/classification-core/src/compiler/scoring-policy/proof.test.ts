import { describe, expect, test } from 'vitest'

import type { ScoringPolicyDefinition } from '../../contracts/scoring-policy.js'
import { legacyScoringPolicy } from '../../definitions/policies.js'
import { questionModel } from '../../generated/question-model.js'
import { styleModel } from '../../generated/style-model.js'
import { proveScoringPolicy } from './proof.js'

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T

describe('scoring policy semantic proof', () => {
  test('proves the production policy and exact identity binding', () => {
    expect(proveScoringPolicy(
      legacyScoringPolicy,
      questionModel,
      styleModel,
      'batch3b.1.0',
    )).toEqual([])
  })

  test('rejects a confidence reference with the wrong option owner', () => {
    const changed = structuredClone(legacyScoringPolicy) as unknown as
      Mutable<ScoringPolicyDefinition>
    const first = changed.confidence.uncertainty[0]
    if (!first || first.kind !== 'answer-includes') throw new Error('fixture predicate missing')
    first.optionId = 'no-preference'
    expect(proveScoringPolicy(
      changed,
      questionModel,
      styleModel,
      'batch3b.1.0',
    )).toContainEqual(expect.objectContaining({
      code: 'POLICY_OPTION_WRONG_OWNER',
    }))
  })
})
