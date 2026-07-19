import { describe, expect, test } from 'vitest'

import type {
  AdjustmentConditionDefinition,
  BonusDefinition,
  ConflictDefinition,
  StyleRuleDefinition,
} from '../../contracts/style-model.js'
import { styleDefinitionBundleSchema } from '../../compiler/styles/source-schema.js'
import { questionModel } from '../../generated/question-model.js'
import { styleDefinitionBundle, styleDefinitions } from './index.js'

const expectedStyleMetadata = [
  { id: 'shoyu-chintan', family: 'soup', displayPriority: 0, accent: '#a55c2f', tags: [] },
  { id: 'shio-chintan', family: 'soup', displayPriority: 1, accent: '#d4b35a', tags: [] },
  { id: 'miso', family: 'soup', displayPriority: 2, accent: '#b56439', tags: [] },
  { id: 'tonkotsu', family: 'soup', displayPriority: 3, accent: '#d9783b', tags: ['pork'] },
  { id: 'chicken-chintan', family: 'soup', displayPriority: 4, accent: '#cf8d53', tags: ['chicken'] },
  { id: 'chicken-paitan', family: 'soup', displayPriority: 5, accent: '#df9965', tags: ['chicken'] },
  { id: 'duck-chintan', family: 'soup', displayPriority: 6, accent: '#8d4d38', tags: ['duck'] },
  { id: 'duck-paitan', family: 'soup', displayPriority: 7, accent: '#6c3f34', tags: ['duck'] },
  { id: 'gyokai', family: 'soup', displayPriority: 8, accent: '#4a6f79', tags: ['fish-seafood'] },
  { id: 'shellfish-dashi', family: 'soup', displayPriority: 9, accent: '#3f7570', tags: ['shellfish'] },
  { id: 'iekei', family: 'soup', displayPriority: 10, accent: '#a33824', tags: ['pork'] },
  { id: 'jiro', family: 'soup', displayPriority: 11, accent: '#875321', tags: ['pork'] },
  { id: 'hakata', family: 'soup', displayPriority: 12, accent: '#f1994f', tags: ['pork'] },
  { id: 'sapporo', family: 'soup', displayPriority: 13, accent: '#c27e2e', tags: ['dairy'] },
  { id: 'konbusui-tsukemen', family: 'tsukemen', displayPriority: 14, accent: '#3d747a', tags: ['fish-seafood'] },
  { id: 'gyokai-tsukemen', family: 'tsukemen', displayPriority: 15, accent: '#2d5d75', tags: ['fish-seafood'] },
  { id: 'aburasoba', family: 'dry', displayPriority: 16, accent: '#964c2a', tags: ['pork'] },
  { id: 'taiwan-mazesoba', family: 'dry', displayPriority: 17, accent: '#8c3723', tags: ['pork'] },
] as const

const expectedIntensityIds = ['clean', 'standard', 'heavy'] as const
const expectedNoodleIds = [
  'thin-straight',
  'medium-thin-straight',
  'medium-thick-straight',
  'medium-thick-wavy',
  'extra-thick',
] as const
const expectedBaseQuestionIds = [
  'form',
  'archetype',
  'tare',
  'source',
  'noodle',
  'signature',
] as const
const expectedBonusIds = [
  'classic-shoyu',
  'classic-shio',
  'miso-sapporo-lane',
  'tonkotsu-core',
  'chicken-clear',
  'chicken-paitan-core',
  'duck-clear',
  'duck-paitan-core',
  'gyokai-soup-core',
  'shellfish-clear',
  'iekei-canonical',
  'jiro-canonical',
  'hakata-canonical',
  'sapporo-canonical',
  'konbusui-canonical',
  'gyokai-tsukemen-canonical',
  'aburasoba-canonical',
  'taiwan-mazesoba-canonical',
] as const
const expectedConflictIds = [
  'shio-light-conflict',
  'duck-clear-jiro',
  'shellfish-jiro',
  'iekei-hakata-thin',
  'jiro-yuzu',
  'jiro-duck-shellfish',
  'taiwan-mazesoba-plain',
] as const

function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectKeys)
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectKeys(nested)])
}

const optionsByQuestion = new Map<string, ReadonlySet<string>>(
  questionModel.questions.map((question) => [
    question.id,
    new Set(question.options.map((option) => option.id)),
  ]),
)

function expectRuleReferences(rule: StyleRuleDefinition) {
  const options = optionsByQuestion.get(rule.questionId)
  expect(options, rule.questionId).toBeDefined()
  const seen = new Set<string>()
  for (const tier of rule.tiers) {
    for (const optionId of tier.optionIds) {
      expect(options?.has(optionId), `${rule.questionId}/${optionId}`).toBe(true)
      expect(seen.has(optionId), `${rule.questionId}/${optionId}`).toBe(false)
      seen.add(optionId)
    }
  }
}

function expectConditionReferences(condition: AdjustmentConditionDefinition) {
  const options = optionsByQuestion.get(condition.questionId)
  expect(options, condition.questionId).toBeDefined()
  for (const optionId of condition.optionIds) {
    expect(options?.has(optionId), `${condition.questionId}/${optionId}`).toBe(true)
  }
}

describe('canonical style definitions', () => {
  test('declares the exact ordered 18-style inventory with explicit priorities', () => {
    expect(styleDefinitions).toHaveLength(18)
    expect(styleDefinitions.map((definition) => definition.id))
      .toEqual(expectedStyleMetadata.map(({ id }) => id))
    expect(styleDefinitions.map((definition) => definition.displayPriority))
      .toEqual(expectedStyleMetadata.map(({ displayPriority }) => displayPriority))
  })

  test('preserves exact legacy family, accent, and exclusion-tag ownership', () => {
    expect(styleDefinitions.map((definition) => ({
      id: definition.id,
      family: definition.family,
      displayPriority: definition.displayPriority,
      accent: definition.accent,
      tags: definition.exclusionTags,
    }))).toEqual(expectedStyleMetadata)
  })

  test('uses one focused repository source per style', () => {
    const sourceFiles = styleDefinitions.map((definition) => definition.sourceFile)
    expect(new Set(sourceFiles).size).toBe(18)
    for (const definition of styleDefinitions) {
      expect(definition.sourceFile).toBe(
        `packages/classification-core/src/definitions/styles/${definition.id}.ts`,
      )
    }
  })

  test('declares the complete three-by-five membership without overrides', () => {
    for (const definition of styleDefinitions) {
      expect(definition.supportedIntensityIds).toEqual(expectedIntensityIds)
      expect(definition.supportedNoodleIds).toEqual(expectedNoodleIds)
      expect(definition).not.toHaveProperty('intensityOverrides')
      expect(definition.baseRules.map((rule) => rule.questionId))
        .toEqual(expectedBaseQuestionIds)
      expect(new Set(definition.baseRules.map((rule) => rule.questionId)).size).toBe(6)
    }
  })

  test('centralizes the exact family, intensity, noodle, tag, and rule taxonomy', () => {
    expect(styleDefinitionBundle.taxonomy.families).toEqual([
      { id: 'soup', priority: 0, formOptionId: 'soup' },
      { id: 'tsukemen', priority: 1, formOptionId: 'tsukemen' },
      { id: 'dry', priority: 2, formOptionId: 'dry' },
    ])
    expect(styleDefinitionBundle.taxonomy.intensities.map(({ id, priority }) => ({
      id,
      priority,
    }))).toEqual([
      { id: 'clean', priority: 0 },
      { id: 'standard', priority: 1 },
      { id: 'heavy', priority: 2 },
    ])
    expect(styleDefinitionBundle.taxonomy.noodles.map(({ id, priority }) => ({
      id,
      priority,
    }))).toEqual(expectedNoodleIds.map((id, priority) => ({ id, priority })))
    expect(styleDefinitionBundle.taxonomy.exclusionTags).toEqual([
      { id: 'pork', priority: 0, exclusionsOptionId: 'pork' },
      { id: 'chicken', priority: 1, exclusionsOptionId: 'chicken' },
      { id: 'duck', priority: 2, exclusionsOptionId: 'duck' },
      { id: 'fish-seafood', priority: 4, exclusionsOptionId: 'fish-seafood' },
      { id: 'shellfish', priority: 5, exclusionsOptionId: 'shellfish' },
      { id: 'dairy', priority: 7, exclusionsOptionId: 'dairy' },
    ])
    expect(styleDefinitionBundle.taxonomy.ruleQuestions).toEqual([
      { questionId: 'form', priority: 0, source: 'style-base' },
      { questionId: 'archetype', priority: 1, source: 'style-base' },
      { questionId: 'tare', priority: 2, source: 'style-base' },
      { questionId: 'source', priority: 3, source: 'style-base' },
      { questionId: 'body', priority: 4, source: 'intensity-profile' },
      { questionId: 'noodle', priority: 5, source: 'style-base' },
      { questionId: 'signature', priority: 6, source: 'style-base' },
    ])
  })

  test('preserves the three shared legacy body profiles in the taxonomy', () => {
    expect(styleDefinitionBundle.taxonomy.intensities.map(({ id, bodyRule }) => ({
      id,
      bodyRule,
    }))).toEqual([
      {
        id: 'clean',
        bodyRule: {
          questionId: 'body',
          tiers: [
            { tier: 'exact', optionIds: ['light', 'balanced'] },
            { tier: 'adjacent', optionIds: ['rich'] },
          ],
        },
      },
      {
        id: 'standard',
        bodyRule: {
          questionId: 'body',
          tiers: [
            { tier: 'exact', optionIds: ['balanced', 'rich'] },
            { tier: 'adjacent', optionIds: ['light', 'backfat-heavy'] },
          ],
        },
      },
      {
        id: 'heavy',
        bodyRule: {
          questionId: 'body',
          tiers: [
            { tier: 'exact', optionIds: ['rich', 'backfat-heavy', 'ultra-heavy'] },
            { tier: 'adjacent', optionIds: ['balanced'] },
          ],
        },
      },
    ])
  })

  test('preserves 18 unique bonuses and seven unique conflicts', () => {
    const bonuses: BonusDefinition[] = []
    const conflicts: ConflictDefinition[] = []
    for (const definition of styleDefinitions) {
      bonuses.push(...definition.bonuses)
      conflicts.push(...definition.conflicts)
    }
    expect(bonuses.map(({ id }) => id)).toEqual(expectedBonusIds)
    expect(conflicts.map(({ id }) => id)).toEqual(expectedConflictIds)
    expect(new Set(bonuses.map(({ id }) => id)).size).toBe(18)
    expect(new Set(conflicts.map(({ id }) => id)).size).toBe(7)
    expect(new Set([...bonuses, ...conflicts].map(({ id }) => id)).size).toBe(25)
    for (const definition of styleDefinitions) {
      expect(definition.bonuses.map(({ priority }) => priority)).toEqual([0])
      expect(new Set(definition.conflicts.map(({ priority }) => priority)).size)
        .toBe(definition.conflicts.length)
    }
  })

  test('binds every rule, condition, family, and tag to the accepted question domain', () => {
    for (const family of styleDefinitionBundle.taxonomy.families) {
      expect(optionsByQuestion.get('form')?.has(family.formOptionId)).toBe(true)
    }
    for (const tag of styleDefinitionBundle.taxonomy.exclusionTags) {
      expect(optionsByQuestion.get('exclusions')?.has(tag.exclusionsOptionId)).toBe(true)
    }
    for (const intensity of styleDefinitionBundle.taxonomy.intensities) {
      expectRuleReferences(intensity.bodyRule)
    }
    for (const definition of styleDefinitions) {
      for (const rule of definition.baseRules) expectRuleReferences(rule)
      for (const bonus of definition.bonuses) {
        for (const condition of bonus.conditions) expectConditionReferences(condition)
      }
      for (const conflict of definition.conflicts) {
        for (const condition of conflict.whenAll) expectConditionReferences(condition)
      }
    }
  })

  test('uses stable message roles without localized identity text', () => {
    for (const definition of styleDefinitions) {
      expect(definition.messageIds).toEqual({
        label: `style-${definition.id}-label`,
        summary: `style-${definition.id}-summary`,
      })
      for (const adjustment of [...definition.bonuses, ...definition.conflicts]) {
        expect(adjustment.labelMessageId).toBe(`adjustment-${adjustment.id}-label`)
      }
    }
    expect(JSON.stringify(styleDefinitionBundle))
      .not.toMatch(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u)
  })

  test('contains no generated hierarchy, scoring policy, fallback, or eligibility fields', () => {
    const keys = collectKeys(styleDefinitionBundle)
    expect(keys).not.toEqual(expect.arrayContaining([
      'coreTypes',
      'cores',
      'noodleVariants',
      'subtypes',
      'ratio',
      'weight',
      'bonusCap',
      'penaltyCap',
      'confidence',
      'ranking',
      'runtimeFallback',
      'blockedBy',
      'blockedLead',
      'eligibility',
    ]))
    expect(JSON.stringify(styleDefinitionBundle)).not.toMatch(
      /[a-z0-9-]+:(?:clean|standard|heavy)(?::[a-z0-9-]+)?/,
    )
  })

  test('uses explicit priority rather than construction order', () => {
    const canonicalFromReverse = [...styleDefinitions]
      .reverse()
      .sort((left, right) => left.displayPriority - right.displayPriority)
    expect(canonicalFromReverse.map(({ id }) => id))
      .toEqual(expectedStyleMetadata.map(({ id }) => id))
  })

  test('publishes the exact closed source bundle accepted by the Task 4 schema', () => {
    expect(styleDefinitionBundle.sourceFile).toBe(
      'packages/classification-core/src/definitions/styles/index.ts',
    )
    expect(styleDefinitionBundle.modelVersion).toBe('batch3a.1.0')
    expect(styleDefinitionBundle.definitions).toBe(styleDefinitions)
    expect(styleDefinitionBundleSchema.safeParse(styleDefinitionBundle).success).toBe(true)
  })
})
