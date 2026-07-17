import { describe, expect, test } from 'vitest'

import type { ScoringPolicyDefinition } from '../../contracts/scoring-policy.js'
import type { CompiledStyleModel } from '../../contracts/style-model.js'
import { questionModel } from '../../generated/question-model.js'
import { styleModel } from '../../generated/style-model.js'
import { legacyScoringPolicy } from '../../definitions/policies.js'
import { compileScoringPolicy } from './compile.js'

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T

function mutable<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>
}

function mutablePolicy(): Mutable<ScoringPolicyDefinition> {
  return structuredClone(legacyScoringPolicy) as unknown as Mutable<ScoringPolicyDefinition>
}

describe('compileScoringPolicy', () => {
  test('binds exact component identities, derives safe values, and freezes output', () => {
    const result = compileScoringPolicy(
      legacyScoringPolicy,
      questionModel,
      styleModel,
      'batch3b.1.0',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.metadata).toMatchObject({
      modelVersion: 'batch3b.1.0',
      questionModelVersion: 'batch2a.1.0',
      questionSemanticHash: questionModel.metadata.semanticHash,
      styleModelVersion: 'batch3a.1.0',
      styleSemanticHash: styleModel.metadata.semanticHash,
    })
    expect(result.model.derived).toEqual({
      baseWeightTotal: 100,
      maximumScore: 105,
      scoreScale: 10,
    })
    expect(Object.keys(result.model).sort()).toEqual([
      'adjustments',
      'arithmetic',
      'confidence',
      'derived',
      'metadata',
      'ranking',
      'scoredQuestions',
      'tiers',
    ])
    expect(result.model).not.toHaveProperty('modelVersion')
    expect(Object.isFrozen(result.model)).toBe(true)
    expect(Object.isFrozen(result.model.scoredQuestions)).toBe(true)
  })

  test('is deterministic across source array reordering', () => {
    const reordered = mutablePolicy()
    reordered.scoredQuestions.reverse()
    reordered.tiers.reverse()
    const first = compileScoringPolicy(
      legacyScoringPolicy,
      questionModel,
      styleModel,
      'batch3b.1.0',
    )
    const second = compileScoringPolicy(reordered, questionModel, styleModel, 'batch3b.1.0')

    expect(first).toEqual(second)
  })

  test('rejects weight, priority, identity, and score-scale mutations', () => {
    const weight = mutablePolicy()
    weight.scoredQuestions[0]!.weight = 17
    const priority = mutablePolicy()
    priority.scoredQuestions[1]!.priority = 0
    const identity = mutablePolicy()
    ;(identity as unknown as { modelVersion: string }).modelVersion = 'batch3b.2.0'
    const unsafeStyle = mutable<CompiledStyleModel>(styleModel)
    const bonus = unsafeStyle.styles.flatMap(({ adjustments }) => adjustments)
      .find((adjustment) => adjustment.kind === 'bonus')
    if (!bonus || bonus.kind !== 'bonus') throw new Error('fixture bonus missing')
    bonus.points = 0.05
    const overflowStyle = mutable<CompiledStyleModel>(styleModel)
    const overflowBonus = overflowStyle.styles.flatMap(({ adjustments }) => adjustments)
      .find((adjustment) => adjustment.kind === 'bonus'
        && adjustment.conditions.length >= 2)
    if (!overflowBonus || overflowBonus.kind !== 'bonus') {
      throw new Error('fixture multi-condition bonus missing')
    }
    overflowBonus.points = 900_719_925_474_099
    const identityStyle = mutable<CompiledStyleModel>(styleModel)
    identityStyle.metadata.questionSemanticHash = '0'.repeat(64)

    const diagnostics = [
      compileScoringPolicy(weight, questionModel, styleModel, 'batch3b.1.0'),
      compileScoringPolicy(priority, questionModel, styleModel, 'batch3b.1.0'),
      compileScoringPolicy(identity, questionModel, styleModel, 'batch3b.1.0'),
      compileScoringPolicy(legacyScoringPolicy, questionModel, unsafeStyle, 'batch3b.1.0'),
      compileScoringPolicy(
        legacyScoringPolicy,
        questionModel,
        overflowStyle,
        'batch3b.1.0',
      ),
      compileScoringPolicy(
        legacyScoringPolicy,
        questionModel,
        identityStyle,
        'batch3b.1.0',
      ),
    ].flatMap((result) => result.diagnostics.map(({ code }) => code))

    expect(diagnostics).toContain('POLICY_QUESTION_WEIGHT_MISMATCH')
    expect(diagnostics).toContain('POLICY_SCORED_QUESTION_PRIORITY_DUPLICATE')
    expect(diagnostics).toContain('POLICY_MODEL_VERSION_MISMATCH')
    expect(diagnostics).toContain('POLICY_SCORE_SCALE_INVALID')
    expect(diagnostics).toContain('POLICY_IDENTITY_BINDING_INVALID')
  })
})
