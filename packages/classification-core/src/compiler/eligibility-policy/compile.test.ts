import { describe, expect, test } from 'vitest'

import type { EligibilityPolicyDefinition } from '../../contracts/eligibility-policy.js'
import { legacyEligibilityPolicy } from '../../definitions/eligibility-policy.js'
import { legacyScoringPolicy } from '../../definitions/policies.js'
import { questionModel } from '../../generated/question-model.js'
import { styleModel } from '../../generated/style-model.js'
import { compileScoringPolicy } from '../scoring-policy/compile.js'
import { compileEligibilityPolicy } from './compile.js'

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T

function mutablePolicy(): Mutable<EligibilityPolicyDefinition> {
  return structuredClone(legacyEligibilityPolicy) as unknown as Mutable<EligibilityPolicyDefinition>
}

function scoringPolicy() {
  const result = compileScoringPolicy(
    legacyScoringPolicy,
    questionModel,
    styleModel,
    'batch3c.1.0',
  )
  if (!result.ok) throw new Error('scoring fixture must compile')
  return result.model
}

describe('compileEligibilityPolicy', () => {
  test('compiles all exclusion rows and binds independent component identities', () => {
    const scoring = scoringPolicy()
    const result = compileEligibilityPolicy(
      legacyEligibilityPolicy,
      questionModel,
      styleModel,
      scoring,
      'batch3c.1.0',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.metadata).toMatchObject({
      schemaVersion: '1',
      compilerVersion: '1',
      modelVersion: 'batch3c.1.0',
      questionModelVersion: 'batch2a.1.0',
      styleModelVersion: 'batch3a.1.0',
      scoringPolicyModelVersion: 'batch3b.1.0',
      scoringPolicySemanticHash:
        '76c768181a4a402abb33e7c4b30f7a8b4aa159db14ea827898e79b380cd132f6',
      scoringPolicyDataVersion:
        '36ad616a2f709fe2bb6ddcfd5e0cb0eb16ecdea15f42e41640588cf61e068ed7',
    })
    expect(result.model.rules.map(({ exclusionOptionId }) => exclusionOptionId)).toEqual([
      'pork', 'chicken', 'duck', 'beef', 'fish-seafood',
      'shellfish', 'shrimp-crab', 'dairy', 'none',
    ])
    expect(result.model.rules.find(({ exclusionOptionId }) => exclusionOptionId === 'pork'))
      .toMatchObject({
        restrictionTagIds: ['pork'],
        blockedStyleIds: [
          'tonkotsu', 'iekei', 'jiro', 'hakata', 'aburasoba', 'taiwan-mazesoba',
        ],
      })
    expect(result.model.rules.find(({ exclusionOptionId }) => exclusionOptionId === 'beef'))
      .toMatchObject({ restrictionTagIds: [], blockedStyleIds: [] })
    expect(result.model.rules.find(({ exclusionOptionId }) => exclusionOptionId === 'shrimp-crab'))
      .toMatchObject({ restrictionTagIds: [], blockedStyleIds: [] })
    expect(result.model.rules.find(({ exclusionOptionId }) => exclusionOptionId === 'none'))
      .toMatchObject({ restrictionTagIds: [], blockedStyleIds: [] })
    expect(result.model.selection).toEqual({
      ordering: 'scoring-rank-stable-subsequence',
      primaryLimit: 3,
      alternativeLimit: 3,
      blockedLead: 'highest-blocked-primary-gte-eligible-lead',
    })
    expect(Object.isFrozen(result.model)).toBe(true)
    expect(Object.isFrozen(result.model.rules)).toBe(true)
  })

  test('is deterministic across source rule and tag order', () => {
    const reordered = mutablePolicy()
    reordered.rules.reverse()
    for (const rule of reordered.rules) rule.restrictionTagIds.reverse()
    const scoring = scoringPolicy()
    const first = compileEligibilityPolicy(
      legacyEligibilityPolicy,
      questionModel,
      styleModel,
      scoring,
      'batch3c.1.0',
    )
    const second = compileEligibilityPolicy(
      reordered,
      questionModel,
      styleModel,
      scoring,
      'batch3c.1.0',
    )

    expect(first).toEqual(second)
  })

  test('rejects duplicate, missing, unknown, wrong-owner, tag, and identity failures', () => {
    const scoring = scoringPolicy()
    const variants = [
      (() => {
        const value = mutablePolicy()
        value.rules[1]!.id = value.rules[0]!.id
        return value
      })(),
      (() => {
        const value = mutablePolicy()
        value.rules.pop()
        return value
      })(),
      (() => {
        const value = mutablePolicy()
        value.rules[0]!.exclusionOptionId = 'unknown'
        return value
      })(),
      (() => {
        const value = mutablePolicy()
        value.rules[0]!.exclusionOptionId = 'unsure'
        return value
      })(),
      (() => {
        const value = mutablePolicy()
        value.rules[0]!.restrictionTagIds = ['unknown']
        return value
      })(),
      (() => {
        const value = mutablePolicy()
        value.noneOptionId = 'pork'
        return value
      })(),
    ]
    const codes = variants.flatMap((source) => {
      const result = compileEligibilityPolicy(
        source,
        questionModel,
        styleModel,
        scoring,
        'batch3c.1.0',
      )
      return result.diagnostics.map(({ code }) => code)
    })

    expect(codes).toContain('ELIGIBILITY_POLICY_RULE_DUPLICATE_ID')
    expect(codes).toContain('ELIGIBILITY_POLICY_OPTION_SET_INVALID')
    expect(codes).toContain('ELIGIBILITY_POLICY_OPTION_UNKNOWN')
    expect(codes).toContain('ELIGIBILITY_POLICY_OPTION_WRONG_OWNER')
    expect(codes).toContain('ELIGIBILITY_POLICY_TAG_UNKNOWN')
    expect(codes).toContain('ELIGIBILITY_POLICY_NONE_INVALID')
  })
})
