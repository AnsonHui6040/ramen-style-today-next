import { describe, expect, test } from 'vitest'

import type {
  CompileStyleRulesResult,
  StyleDefinitionBundleSource,
} from '../../contracts/style-model.js'
import { compileStyles } from './compile.js'
import {
  acceptedQuestionModelFixture,
  canonicalStyleDefinitionBundleFixture,
  expectedBonusIds,
  expectedConflictIds,
  expectedStyleRuleQuestionIds,
  styleBundleFallbackSource,
} from './test-fixtures.js'

function compareStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function compileCanonical() {
  return compileStyles(
    canonicalStyleDefinitionBundleFixture(),
    acceptedQuestionModelFixture(),
    styleBundleFallbackSource,
  )
}

function diagnosticCodes(result: ReturnType<typeof compileStyles>) {
  return result.diagnostics.map(({ code }) => code)
}

function reverseObjectInsertion(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectInsertion)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, nested]) => [key, reverseObjectInsertion(nested)]),
  )
}

function expectNoCoreStage(result: ReturnType<typeof compileStyles>) {
  expect(result.ok).toBe(false)
  expect(result).not.toHaveProperty('rulesStage')
  expect(result).not.toHaveProperty('subtypeStage')
  expect(result).not.toHaveProperty('coreStage')
  expect(result).not.toHaveProperty('model')
}

function expectNoSubtypeStage(result: ReturnType<typeof compileStyles>) {
  expect(result.ok).toBe(false)
  expect(result).not.toHaveProperty('rulesStage')
  expect(result).not.toHaveProperty('subtypeStage')
  expect(result).not.toHaveProperty('coreStage')
  expect(result).not.toHaveProperty('model')
}

type RulesSuccess = Extract<CompileStyleRulesResult, { readonly ok: true }>

function expectRulesSuccess(result: unknown): asserts result is RulesSuccess {
  expect(result).toMatchObject({ ok: true })
  expect(result).toHaveProperty('rulesStage')
  expect(result).not.toHaveProperty('subtypeStage')
  expect(result).not.toHaveProperty('coreStage')
  expect(result).not.toHaveProperty('model')
}

function expectNoRulesStage(result: ReturnType<typeof compileStyles>) {
  expect(result.ok).toBe(false)
  expect(result).not.toHaveProperty('rulesStage')
  expect(result).not.toHaveProperty('subtypeStage')
  expect(result).not.toHaveProperty('coreStage')
  expect(result).not.toHaveProperty('model')
}

describe('style intensity core compiler', () => {
  test('generates the exact 54 intensity core IDs, parents, priorities, and order', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const expectedStyles = [...source.definitions].sort((left, right) => (
      left.displayPriority - right.displayPriority || compareStrings(left.id, right.id)
    ))
    const expectedIntensities = [...source.taxonomy.intensities].sort((left, right) => (
      left.priority - right.priority || compareStrings(left.id, right.id)
    ))

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectRulesSuccess(result)
    expect(result.rulesStage).toMatchObject({
      kind: 'style-rules-stage',
      modelVersion: 'batch3a.1.0',
      questionModelVersion: 'batch2a.1.0',
    })
    expect(result.rulesStage.styles.map(({ id }) => id))
      .toEqual(expectedStyles.map(({ id }) => id))
    expect(result.rulesStage.styles).toHaveLength(18)

    const cores = result.rulesStage.styles.flatMap(({ cores: styleCores }) => styleCores)
    expect(cores).toHaveLength(54)
    expect(new Set(cores.map(({ id }) => id)).size).toBe(54)
    expect(cores.map(({ id }) => id)).toEqual(expectedStyles.flatMap(({ id }) => (
      expectedIntensities.map(({ id: intensityId }) => `${id}:${intensityId}`)
    )))

    for (const style of result.rulesStage.styles) {
      const sourceStyle = expectedStyles.find(({ id }) => id === style.id)!
      expect(style.family).toBe(sourceStyle.family)
      expect(style.cores).toHaveLength(3)
      expect(style.cores.map(({ parentStyleId }) => parentStyleId))
        .toEqual([style.id, style.id, style.id])
      expect(style.cores.map(({ intensityId }) => intensityId))
        .toEqual(expectedIntensities.map(({ id }) => id))
      expect(style.cores.map(({ priority }) => priority))
        .toEqual(expectedIntensities.map(({ priority }) => priority))
      for (const core of style.cores) {
        expect(core.subtypes).toHaveLength(5)
        expect(core.rules.map(({ questionId }) => questionId)).toEqual([
          'form',
          'archetype',
          'tare',
          'source',
          'body',
          'noodle',
          'signature',
        ])
      }
    }
  })

  test('inherits each intensity body profile into inert core rules', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectRulesSuccess(result)
    const style = result.rulesStage.styles.find(({ id }) => id === 'shoyu-chintan')!
    for (const intensity of source.taxonomy.intensities) {
      const core = style.cores.find(({ intensityId }) => intensityId === intensity.id)!
      const bodyRule = core.rules.find(({ questionId }) => questionId === 'body')!
      for (const tier of intensity.bodyRule.tiers) {
        expect(bodyRule.targets.filter(({ tier: targetTier }) => targetTier === tier.tier)
          .map(({ optionId }) => optionId)).toEqual(tier.optionIds)
      }
      expect(bodyRule.provenance.inheritedFrom).toBe('intensity-profile')
    }
  })

  test('uses whole-rule replacement for an explicit intensity core override', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.definitions[0]!.intensityOverrides = {
      clean: {
        rules: [{
          questionId: 'body',
          tiers: [{ tier: 'exact', optionIds: ['ultra-heavy'] }],
        }],
      },
    }

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectRulesSuccess(result)
    const clean = result.rulesStage.styles[0]!.cores.find(
      ({ intensityId }) => intensityId === 'clean',
    )!
    expect(clean.rules.find(({ questionId }) => questionId === 'body')).toEqual(
      expect.objectContaining({
        targets: [{ optionId: 'ultra-heavy', tier: 'exact', priority: 4 }],
        provenance: expect.objectContaining({
          inheritedFrom: 'style-intensity-override',
        }),
      }),
    )
    expect(clean.rules.find(({ questionId }) => questionId === 'body')!.targets)
      .not.toEqual([{ optionId: 'light', tier: 'exact', priority: 0 }])
  })

  test('does not fabricate intensity core overrides for canonical definitions', () => {
    const result = compileCanonical()

    expectRulesSuccess(result)
    expect(result.rulesStage.styles.flatMap(({ cores }) => cores).flatMap(
      ({ rules }) => rules,
    ).some(({ provenance }) => (
      provenance.inheritedFrom === 'style-intensity-override'
    ))).toBe(false)
  })

  test('keeps intensity core output stable under reversed source declarations', () => {
    const canonical = compileCanonical()
    const reversed = canonicalStyleDefinitionBundleFixture()
    reversed.definitions.reverse()
    reversed.taxonomy.intensities.reverse()
    for (const definition of reversed.definitions) {
      definition.supportedIntensityIds.reverse()
    }

    expect(compileStyles(
      reversed,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )).toEqual(canonical)
  })

  test('ignores object insertion order and repeats intensity core compilation byte-identically', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const first = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    const reordered = compileStyles(
      reverseObjectInsertion(source),
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    const repeated = compileCanonical()

    expect(JSON.stringify(reordered)).toBe(JSON.stringify(first))
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(first))
  })

  test('copies intensity core data independently from later source mutation', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    const beforeMutation = JSON.stringify(result)

    source.definitions[0]!.messageIds.label = 'mutated-label'
    source.definitions[0]!.baseRules[0]!.tiers[0]!.optionIds[0] = 'dry'
    source.taxonomy.intensities[0]!.bodyRule.tiers[0]!.optionIds[0] = 'ultra-heavy'

    expect(JSON.stringify(result)).toBe(beforeMutation)
  })

  test('rejects an unsupported style model version without a core stage', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.modelVersion = 'batch3a.2.0'

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoCoreStage(result)
    expect(diagnosticCodes(result)).toEqual(['STYLE_MODEL_VERSION_MISMATCH'])
  })

  test('rejects duplicate style display priority without a core stage', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.definitions[1]!.displayPriority = source.definitions[0]!.displayPriority

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoCoreStage(result)
    expect(diagnosticCodes(result)).toEqual(['STYLE_DISPLAY_PRIORITY_DUPLICATE'])
  })

  test('rejects a style family and form rule mismatch without a core stage', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const formRule = source.definitions[0]!.baseRules.find(
      ({ questionId }) => questionId === 'form',
    )!
    formRule.tiers[0]!.optionIds = ['dry']

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoCoreStage(result)
    expect(diagnosticCodes(result)).toEqual(['STYLE_FAMILY_MISMATCH'])
  })

  test('rejects a family absent from the declared taxonomy without a core stage', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.taxonomy.families = source.taxonomy.families.filter(({ id }) => id !== 'dry')

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoCoreStage(result)
    expect(diagnosticCodes(result)).toContain('STYLE_FAMILY_UNKNOWN')
  })

  test('rejects unknown intensity membership and an incomplete core matrix', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.taxonomy.intensities = source.taxonomy.intensities.filter(
      ({ id }) => id !== 'heavy',
    )

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoCoreStage(result)
    expect(diagnosticCodes(result)).toContain('STYLE_INTENSITY_UNKNOWN')
    expect(diagnosticCodes(result)).toContain('STYLE_INVENTORY_MISMATCH')
  })

  test('rejects a missing per-style intensity core combination', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.definitions[0]!.supportedIntensityIds = ['clean', 'standard']

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoCoreStage(result)
    expect(diagnosticCodes(result)).toEqual(['STYLE_INVENTORY_MISMATCH'])
  })

  test('rejects empty or duplicate intensity membership and a core collision', () => {
    const empty = canonicalStyleDefinitionBundleFixture()
    empty.definitions[0]!.supportedIntensityIds = []
    const emptyResult = compileStyles(
      empty,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoCoreStage(emptyResult)
    expect(diagnosticCodes(emptyResult)).toEqual([
      'STYLE_INTENSITY_EMPTY',
      'STYLE_INVENTORY_MISMATCH',
    ])

    const duplicate = canonicalStyleDefinitionBundleFixture()
    duplicate.definitions[0]!.supportedIntensityIds.push('clean')
    const duplicateResult = compileStyles(
      duplicate,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoCoreStage(duplicateResult)
    expect(diagnosticCodes(duplicateResult)).toEqual([
      'STYLE_RULE_DUPLICATE_ID',
      'STYLE_RULE_DUPLICATE_ID',
      'STYLE_RULE_DUPLICATE_ID',
      'STYLE_RULE_DUPLICATE_ID',
      'STYLE_RULE_DUPLICATE_ID',
      'STYLE_RULE_DUPLICATE_ID',
      'STYLE_CORE_ID_COLLISION',
      'STYLE_INTENSITY_DUPLICATE',
      'STYLE_INVENTORY_MISMATCH',
      'STYLE_SUBTYPE_ID_COLLISION',
      'STYLE_SUBTYPE_ID_COLLISION',
      'STYLE_SUBTYPE_ID_COLLISION',
      'STYLE_SUBTYPE_ID_COLLISION',
      'STYLE_SUBTYPE_ID_COLLISION',
      'STYLE_RULE_DUPLICATE_ID',
    ])
  })

  test('rejects duplicate intensity taxonomy priorities without source-index fallback', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.taxonomy.intensities[1]!.priority = source.taxonomy.intensities[0]!.priority

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoCoreStage(result)
    expect(diagnosticCodes(result)).toEqual(['STYLE_PRIORITY_DUPLICATE'])
  })

  test('binds core rules and adjustment conditions to question-model ownership', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.definitions[0]!.baseRules[0]!.questionId = 'unknown-question'
    source.definitions[1]!.baseRules[0]!.tiers[0]!.optionIds = ['unknown-option']
    source.definitions[2]!.baseRules[1]!.tiers[0]!.optionIds = ['soup']
    source.definitions[3]!.bonuses[0]!.conditions[0]!.questionId = 'unknown-adjustment'

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoCoreStage(result)
    expect(diagnosticCodes(result)).toEqual(expect.arrayContaining([
      'STYLE_ADJUSTMENT_QUESTION_UNKNOWN',
      'STYLE_RULE_OPTION_UNKNOWN',
      'STYLE_RULE_OPTION_WRONG_OWNER',
      'STYLE_RULE_QUESTION_UNKNOWN',
    ]))
  })

  test('rejects an extra known base rule instead of silently dropping it from cores', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.definitions[0]!.baseRules.push({
      questionId: 'exclusions',
      tiers: [{ tier: 'exact', optionIds: ['none'] }],
    })

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoCoreStage(result)
    expect(diagnosticCodes(result)).toContain('STYLE_INVENTORY_MISMATCH')
  })

  test('rejects incorrect style-base and intensity-profile taxonomy ownership', () => {
    const bodyOwnedByStyle = canonicalStyleDefinitionBundleFixture()
    bodyOwnedByStyle.taxonomy.ruleQuestions.find(
      ({ questionId }) => questionId === 'body',
    )!.source = 'style-base'
    const bodyResult = compileStyles(
      bodyOwnedByStyle,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoCoreStage(bodyResult)
    expect(diagnosticCodes(bodyResult)).toContain('STYLE_INVENTORY_MISMATCH')

    const formOwnedByIntensity = canonicalStyleDefinitionBundleFixture()
    formOwnedByIntensity.taxonomy.ruleQuestions.find(
      ({ questionId }) => questionId === 'form',
    )!.source = 'intensity-profile'
    const formResult = compileStyles(
      formOwnedByIntensity,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoCoreStage(formResult)
    expect(diagnosticCodes(formResult)).toContain('STYLE_INVENTORY_MISMATCH')
  })

  test('rejects an invalid or duplicate intensity core override', () => {
    const invalid = canonicalStyleDefinitionBundleFixture()
    invalid.definitions[0]!.intensityOverrides = {
      clean: {
        rules: [{
          questionId: 'body',
          tiers: [{ tier: 'exact', optionIds: ['unknown-body-option'] }],
        }],
      },
    }
    const invalidResult = compileStyles(
      invalid,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoCoreStage(invalidResult)
    expect(diagnosticCodes(invalidResult)).toContain('STYLE_RULE_OPTION_UNKNOWN')

    const duplicate = canonicalStyleDefinitionBundleFixture()
    duplicate.definitions[0]!.intensityOverrides = {
      clean: {
        rules: [
          { questionId: 'body', tiers: [{ tier: 'exact', optionIds: ['light'] }] },
          { questionId: 'body', tiers: [{ tier: 'exact', optionIds: ['balanced'] }] },
        ],
      },
    }
    const duplicateResult = compileStyles(
      duplicate,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoCoreStage(duplicateResult)
    expect(diagnosticCodes(duplicateResult)).toContain('STYLE_RULE_DUPLICATE_ID')
  })

  test('returns deterministic complete diagnostics and no core stage for multiple errors', () => {
    function invalidSource() {
      const source = canonicalStyleDefinitionBundleFixture()
      source.modelVersion = 'batch3a.2.0'
      source.definitions[1]!.displayPriority = source.definitions[0]!.displayPriority
      source.definitions[0]!.supportedIntensityIds = ['clean', 'standard']
      source.definitions[0]!.baseRules[0]!.tiers[0]!.optionIds = [
        'unknown-z',
        'unknown-a',
      ]
      return source
    }

    const forward = invalidSource()
    const reversed = invalidSource()
    reversed.definitions.reverse()
    reversed.taxonomy.intensities.reverse()
    const reversedFormRule = reversed.definitions.find(
      ({ id }) => id === 'shoyu-chintan',
    )!.baseRules.find(({ questionId }) => questionId === 'form')!
    reversedFormRule.tiers[0]!.optionIds.reverse()

    const forwardResult = compileStyles(
      forward,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    const reversedResult = compileStyles(
      reversed,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoCoreStage(forwardResult)
    expectNoCoreStage(reversedResult)
    expect(reversedResult.diagnostics).toEqual(forwardResult.diagnostics)
    expect(new Set(forwardResult.diagnostics.map((diagnostic) => (
      JSON.stringify(diagnostic)
    ))).size).toBe(forwardResult.diagnostics.length)
  })

  test('accepts the canonical bundle through the Task 4 source contract', () => {
    const source: StyleDefinitionBundleSource = canonicalStyleDefinitionBundleFixture()
    expect(source.modelVersion).toBe('batch3a.1.0')
    expect(compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    ).ok).toBe(true)
  })
})

describe('style noodle subtype compiler', () => {
  test('generates the exact 270 noodle subtype IDs, parents, priorities, and templates', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const noodles = [...source.taxonomy.noodles].sort((left, right) => (
      left.priority - right.priority || compareStrings(left.id, right.id)
    ))
    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectRulesSuccess(result)
    expect(result.rulesStage.kind).toBe('style-rules-stage')
    const cores = result.rulesStage.styles.flatMap(({ cores: styleCores }) => styleCores)
    const subtypes = cores.flatMap(({ subtypes: coreSubtypes }) => coreSubtypes)
    expect(cores).toHaveLength(54)
    expect(subtypes).toHaveLength(270)
    expect(new Set(subtypes.map(({ id }) => id)).size).toBe(270)

    for (const style of result.rulesStage.styles) {
      for (const core of style.cores) {
        expect(core.subtypes).toHaveLength(5)
        expect(core.subtypes.map(({ id }) => id)).toEqual(
          noodles.map(({ id }) => `${core.id}:${id}`),
        )
        expect(core.subtypes.map(({ parentStyleId }) => parentStyleId))
          .toEqual(noodles.map(() => style.id))
        expect(core.subtypes.map(({ parentCoreId }) => parentCoreId))
          .toEqual(noodles.map(() => core.id))
        expect(core.subtypes.map(({ noodleId }) => noodleId))
          .toEqual(noodles.map(({ id }) => id))
        expect(core.subtypes.map(({ priority }) => priority))
          .toEqual(noodles.map(({ priority }) => priority))
        expect(core.subtypes.map(({ messageIds }) => messageIds)).toEqual(
          noodles.map(({ labelMessageId, summaryMessageId }) => ({
            labelTemplate: labelMessageId,
            summaryTemplate: summaryMessageId,
          })),
        )
        for (const subtype of core.subtypes) {
          expect(subtype.messageIds).not.toHaveProperty('label')
          expect(subtype.messageIds).not.toHaveProperty('summary')
          expect(subtype).not.toHaveProperty('locale')
          expect(subtype).not.toHaveProperty('fallback')
        }
        expect(core).not.toHaveProperty('resolvedRules')
      }
    }
    expect(result.rulesStage).not.toHaveProperty('inventory')
    expect(result.rulesStage).not.toHaveProperty('sourceHash')
    expect(result.rulesStage).not.toHaveProperty('semanticHash')
    expect(result.rulesStage).not.toHaveProperty('dataVersion')
  })

  test('keeps subtype and core ordering stable under reversed source declarations', () => {
    const canonical = compileCanonical()
    const reversed = canonicalStyleDefinitionBundleFixture()
    reversed.definitions.reverse()
    reversed.taxonomy.intensities.reverse()
    reversed.taxonomy.noodles.reverse()
    for (const definition of reversed.definitions) {
      definition.supportedIntensityIds.reverse()
      definition.supportedNoodleIds.reverse()
    }

    expectRulesSuccess(canonical)
    const reversedResult = compileStyles(
      reversed,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectRulesSuccess(reversedResult)
    expect(reversedResult).toEqual(canonical)
  })

  test('ignores object insertion order and repeats subtype compilation byte-identically', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const first = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    const reordered = compileStyles(
      reverseObjectInsertion(source),
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    const repeated = compileCanonical()

    expectRulesSuccess(first)
    expectRulesSuccess(reordered)
    expectRulesSuccess(repeated)
    expect(JSON.stringify(reordered)).toBe(JSON.stringify(first))
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(first))
  })

  test('copies subtype templates and provenance independently from source mutation', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectRulesSuccess(result)
    const beforeMutation = JSON.stringify(result)

    source.taxonomy.noodles[0]!.labelMessageId = 'mutated-noodle-label'
    source.taxonomy.noodles[0]!.summaryMessageId = 'mutated-noodle-summary'
    source.definitions[0]!.supportedNoodleIds.reverse()

    expect(JSON.stringify(result)).toBe(beforeMutation)
  })

  test('rejects a missing per-core noodle combination without a subtype stage', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.definitions[0]!.supportedNoodleIds = source.definitions[0]!
      .supportedNoodleIds.filter((id) => id !== 'extra-thick')

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoSubtypeStage(result)
    expect(diagnosticCodes(result)).toContain('STYLE_INVENTORY_MISMATCH')
  })

  test('rejects a closed noodle token missing from taxonomy as unknown and extra', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.taxonomy.noodles = source.taxonomy.noodles.filter(
      ({ id }) => id !== 'extra-thick',
    )

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoSubtypeStage(result)
    expect(diagnosticCodes(result)).toContain('STYLE_NOODLE_UNKNOWN')
    expect(diagnosticCodes(result)).toContain('STYLE_INVENTORY_MISMATCH')
  })

  test('rejects an out-of-contract noodle token structurally without a stage', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    Reflect.set(source.definitions[0]!.supportedNoodleIds, 0, 'unknown-noodle')

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoSubtypeStage(result)
    expect(diagnosticCodes(result)).toContain('STRUCTURE_INVALID')
  })

  test('rejects empty or duplicate noodle membership and subtype collisions', () => {
    const empty = canonicalStyleDefinitionBundleFixture()
    empty.definitions[0]!.supportedNoodleIds = []
    const emptyResult = compileStyles(
      empty,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoSubtypeStage(emptyResult)
    expect(diagnosticCodes(emptyResult)).toContain('STYLE_NOODLE_EMPTY')
    expect(diagnosticCodes(emptyResult)).toContain('STYLE_INVENTORY_MISMATCH')

    const duplicate = canonicalStyleDefinitionBundleFixture()
    duplicate.definitions[0]!.supportedNoodleIds.push('thin-straight')
    const duplicateResult = compileStyles(
      duplicate,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoSubtypeStage(duplicateResult)
    expect(diagnosticCodes(duplicateResult)).toContain('STYLE_NOODLE_DUPLICATE')
    expect(diagnosticCodes(duplicateResult)).toContain('STYLE_SUBTYPE_ID_COLLISION')
    expect(diagnosticCodes(duplicateResult)).toContain('STYLE_INVENTORY_MISMATCH')
  })

  test('rejects duplicate noodle taxonomy priority without source-index fallback', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.taxonomy.noodles[1]!.priority = source.taxonomy.noodles[0]!.priority

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoSubtypeStage(result)
    expect(diagnosticCodes(result)).toContain('STYLE_PRIORITY_DUPLICATE')
  })

  test('returns deterministic complete noodle diagnostics and no stage for multiple errors', () => {
    function invalidSource() {
      const source = canonicalStyleDefinitionBundleFixture()
      source.definitions[0]!.supportedNoodleIds = []
      source.definitions[1]!.supportedNoodleIds.push('thin-straight')
      source.taxonomy.noodles[1]!.priority = source.taxonomy.noodles[0]!.priority
      return source
    }

    const forward = invalidSource()
    const reversed = invalidSource()
    reversed.definitions.reverse()
    reversed.taxonomy.noodles.reverse()
    for (const definition of reversed.definitions) definition.supportedNoodleIds.reverse()

    const forwardResult = compileStyles(
      forward,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    const reversedResult = compileStyles(
      reversed,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoSubtypeStage(forwardResult)
    expectNoSubtypeStage(reversedResult)
    expect(reversedResult.diagnostics).toEqual(forwardResult.diagnostics)
    expect(new Set(forwardResult.diagnostics.map((diagnostic) => (
      JSON.stringify(diagnostic)
    ))).size).toBe(forwardResult.diagnostics.length)
  })
})

describe('style rule and normalized adjustment compiler', () => {
  test('compiles the exact 378 ordered rules with canonical targets and miss metadata', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const questionModel = acceptedQuestionModelFixture()
    const result = compileStyles(source, questionModel, styleBundleFallbackSource)

    expectRulesSuccess(result)
    expect(result.rulesStage.kind).toBe('style-rules-stage')
    const cores = result.rulesStage.styles.flatMap(({ cores: styleCores }) => styleCores)
    const rules = cores.flatMap(({ rules: coreRules }) => coreRules)
    expect(cores).toHaveLength(54)
    expect(rules).toHaveLength(378)
    expect(new Set(rules.map(({ id }) => id)).size).toBe(378)

    const questionPriority = new Map(
      source.taxonomy.ruleQuestions.map(({ questionId, priority }) => [questionId, priority]),
    )
    const optionPriority = new Map(questionModel.questions.map((question) => [
      question.id,
      new Map(question.options.map(({ id, order }) => [id, order])),
    ]))

    for (const style of result.rulesStage.styles) {
      const sourceStyle = source.definitions.find(({ id }) => id === style.id)!
      for (const core of style.cores) {
        expect(core.rules).toHaveLength(7)
        expect(core.rules.map(({ questionId }) => questionId))
          .toEqual(expectedStyleRuleQuestionIds)
        expect(core.rules.map(({ id }) => id)).toEqual(
          expectedStyleRuleQuestionIds.map((questionId) => `${core.id}:${questionId}`),
        )
        expect(core.rules.map(({ parentStyleId }) => parentStyleId))
          .toEqual(expectedStyleRuleQuestionIds.map(() => style.id))
        expect(core.rules.map(({ parentCoreId }) => parentCoreId))
          .toEqual(expectedStyleRuleQuestionIds.map(() => core.id))
        expect(core.rules.map(({ priority }) => priority)).toEqual(
          expectedStyleRuleQuestionIds.map((questionId) => questionPriority.get(questionId)),
        )
        expect(core.rules.every(({ fallbackTier }) => fallbackTier === 'miss')).toBe(true)
        expect(core).not.toHaveProperty('resolvedRules')

        for (const rule of core.rules) {
          const intensityRule = source.taxonomy.intensities.find(
            ({ id }) => id === core.intensityId,
          )!.bodyRule
          const sourceRule = rule.questionId === 'body'
            ? intensityRule
            : sourceStyle.baseRules.find(({ questionId }) => questionId === rule.questionId)!
          const expectedTargets = sourceRule.tiers.flatMap(({ tier, optionIds }) => (
            optionIds.map((optionId) => ({
              optionId,
              tier,
              priority: optionPriority.get(rule.questionId)!.get(optionId),
            }))
          )).sort((left, right) => (
            left.priority! - right.priority! || compareStrings(left.optionId, right.optionId)
          ))
          expect(rule.targets).toEqual(expectedTargets)
          expect(rule.provenance.sourceFile).toBe(
            rule.questionId === 'body' ? source.taxonomy.sourceFile : sourceStyle.sourceFile,
          )
          expect(rule.provenance.inheritedFrom).toBe(
            rule.questionId === 'body' ? 'intensity-profile' : 'style-base',
          )
          expect(rule.provenance.path).toBe(
            rule.questionId === 'body'
              ? `/intensities/${core.priority}/bodyRule`
              : `/baseRules/${expectedStyleRuleQuestionIds
                  .filter((questionId) => questionId !== 'body')
                  .findIndex((questionId) => questionId === rule.questionId)}`,
          )
        }
      }
    }

    expect(result.rulesStage).not.toHaveProperty('inventory')
    expect(result.rulesStage).not.toHaveProperty('metadata')
    expect(result.rulesStage).not.toHaveProperty('sourceHash')
    expect(result.rulesStage).not.toHaveProperty('semanticHash')
    expect(result.rulesStage).not.toHaveProperty('dataVersion')
  })

  test('uses whole-rule intensity overrides when compiling targets', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.definitions[0]!.intensityOverrides = {
      clean: {
        rules: [{
          questionId: 'body',
          tiers: [{ tier: 'exact', optionIds: ['ultra-heavy'] }],
        }],
      },
    }

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectRulesSuccess(result)
    const clean = result.rulesStage.styles[0]!.cores.find(
      ({ intensityId }) => intensityId === 'clean',
    )!
    expect(clean.rules.find(({ questionId }) => questionId === 'body')).toMatchObject({
      targets: [{ optionId: 'ultra-heavy', tier: 'exact', priority: 4 }],
      fallbackTier: 'miss',
      provenance: { inheritedFrom: 'style-intensity-override' },
    })
  })

  test('normalizes exact bonus and conflict truth without executing operands', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const questionModel = acceptedQuestionModelFixture()
    const result = compileStyles(source, questionModel, styleBundleFallbackSource)

    expectRulesSuccess(result)
    const adjustments = result.rulesStage.styles.flatMap(
      ({ adjustments: styleAdjustments }) => styleAdjustments,
    )
    const bonuses = adjustments.filter(({ kind }) => kind === 'bonus')
    const conflicts = adjustments.filter(({ kind }) => kind === 'conflict')
    expect(bonuses.map(({ id }) => id)).toEqual(expectedBonusIds)
    expect(conflicts.map(({ id }) => id)).toEqual(expectedConflictIds)
    expect(bonuses).toHaveLength(18)
    expect(conflicts).toHaveLength(7)
    expect(adjustments).toHaveLength(25)
    expect(bonuses.reduce((count, bonus) => count + bonus.appliesToCoreIds.length, 0))
      .toBe(54)
    expect(conflicts.reduce((count, conflict) => count + conflict.appliesToCoreIds.length, 0))
      .toBe(21)

    const optionPriority = new Map(questionModel.questions.map((question) => [
      question.id,
      new Map(question.options.map(({ id, order }) => [id, order])),
    ]))
    for (const style of result.rulesStage.styles) {
      const sourceStyle = source.definitions.find(({ id }) => id === style.id)!
      expect(style.adjustments.map(({ kind }) => kind)).toEqual([
        ...sourceStyle.bonuses.map(() => 'bonus' as const),
        ...sourceStyle.conflicts.map(() => 'conflict' as const),
      ])
      const expectedCoreIds = style.cores.map(({ id }) => id)
      for (const adjustment of style.adjustments) {
        expect(adjustment.appliesToCoreIds).toEqual(expectedCoreIds)
        expect(adjustment).not.toHaveProperty('appliedPoints')
        expect(adjustment).not.toHaveProperty('score')
        expect(adjustment).not.toHaveProperty('matched')
        expect(adjustment.provenance.sourceFile).toBe(sourceStyle.sourceFile)

        const expectCanonicalConditions = (
          compiledConditions: readonly {
            readonly priority: number
            readonly questionId: string
            readonly optionIds: readonly string[]
          }[],
          sourceConditions: readonly {
            readonly priority: number
            readonly questionId: string
            readonly optionIds: readonly string[]
          }[],
          path: string,
        ) => expect(compiledConditions).toEqual(
          [...sourceConditions]
            .sort((left, right) => left.priority - right.priority)
            .map(({ priority, questionId, optionIds }, index) => ({
              priority,
              questionId,
              optionIds: [...optionIds].sort((left, right) => (
                optionPriority.get(questionId)!.get(left)!
                  - optionPriority.get(questionId)!.get(right)!
                  || compareStrings(left, right)
              )),
              provenance: expect.objectContaining({
                sourceFile: sourceStyle.sourceFile,
                path: `${path}/${index}`,
              }),
            })),
        )
        if (adjustment.kind === 'bonus') {
          const sourceAdjustment = sourceStyle.bonuses.find(
            ({ id }) => id === adjustment.id,
          )!
          expect(adjustment.priority).toBe(sourceAdjustment.priority)
          expect(adjustment.labelMessageId).toBe(sourceAdjustment.labelMessageId)
          expect(adjustment.provenance.path).toBe(
            `/bonuses/${sourceStyle.bonuses.indexOf(sourceAdjustment)}`,
          )
          expect(adjustment.points).toBe(sourceAdjustment.points)
          expect(adjustment.minMatches).toBe(sourceAdjustment.minMatches)
          expectCanonicalConditions(
            adjustment.conditions,
            sourceAdjustment.conditions,
            `/bonuses/${sourceStyle.bonuses.indexOf(sourceAdjustment)}/conditions`,
          )
        }
        if (adjustment.kind === 'conflict') {
          const sourceAdjustment = sourceStyle.conflicts.find(
            ({ id }) => id === adjustment.id,
          )!
          expect(adjustment.priority).toBe(sourceAdjustment.priority)
          expect(adjustment.labelMessageId).toBe(sourceAdjustment.labelMessageId)
          expect(adjustment.provenance.path).toBe(
            `/conflicts/${sourceStyle.conflicts.indexOf(sourceAdjustment)}`,
          )
          expect(adjustment.penalty).toBe(sourceAdjustment.penalty)
          expectCanonicalConditions(
            adjustment.whenAll,
            sourceAdjustment.whenAll,
            `/conflicts/${sourceStyle.conflicts.indexOf(sourceAdjustment)}/whenAll`,
          )
        }
      }
    }
  })

  test('binds the exact inert exclusion-tag inventory without executing eligibility', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectRulesSuccess(result)
    expect(result.rulesStage.exclusionTags).toEqual(
      source.taxonomy.exclusionTags.map(({ id, priority, exclusionsOptionId }, index) => ({
        id,
        priority,
        questionId: 'exclusions',
        optionId: exclusionsOptionId,
        provenance: {
          sourceFile: source.taxonomy.sourceFile,
          path: `/exclusionTags/${index}`,
        },
      })),
    )
    for (const style of result.rulesStage.styles) {
      const sourceStyle = source.definitions.find(({ id }) => id === style.id)!
      expect(style.exclusionTags).toEqual(sourceStyle.exclusionTags)
      expect(style).not.toHaveProperty('eligible')
      expect(style).not.toHaveProperty('blocked')
      expect(style).not.toHaveProperty('blockedLead')
    }
  })

  test('keeps rule targets, adjustments, and conditions byte-identical under reversal', () => {
    const canonical = compileCanonical()
    const reversed = canonicalStyleDefinitionBundleFixture()
    reversed.definitions.reverse()
    reversed.taxonomy.ruleQuestions.reverse()
    reversed.taxonomy.exclusionTags.reverse()
    reversed.taxonomy.intensities.reverse()
    for (const intensity of reversed.taxonomy.intensities) {
      intensity.bodyRule.tiers.reverse()
      for (const tier of intensity.bodyRule.tiers) tier.optionIds.reverse()
    }
    for (const style of reversed.definitions) {
      style.baseRules.reverse()
      for (const rule of style.baseRules) {
        rule.tiers.reverse()
        for (const tier of rule.tiers) tier.optionIds.reverse()
      }
      style.bonuses.reverse()
      style.conflicts.reverse()
      style.exclusionTags.reverse()
      for (const bonus of style.bonuses) {
        bonus.conditions.reverse()
        for (const condition of bonus.conditions) condition.optionIds.reverse()
      }
      for (const conflict of style.conflicts) {
        conflict.whenAll.reverse()
        for (const condition of conflict.whenAll) condition.optionIds.reverse()
      }
    }

    expectRulesSuccess(canonical)
    const reversedResult = compileStyles(
      reversed,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectRulesSuccess(reversedResult)
    expect(reversedResult).toEqual(canonical)
  })

  test('directly rejects empty, missing, duplicate, and overlapping rule targets', () => {
    const empty = canonicalStyleDefinitionBundleFixture()
    empty.definitions[0]!.baseRules.find(
      ({ questionId }) => questionId === 'signature',
    )!.tiers = []
    const emptyResult = compileStyles(
      empty,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoRulesStage(emptyResult)
    expect(diagnosticCodes(emptyResult)).toContain('STYLE_RULE_EMPTY')

    const missing = canonicalStyleDefinitionBundleFixture()
    missing.definitions[0]!.baseRules = missing.definitions[0]!.baseRules.filter(
      ({ questionId }) => questionId !== 'signature',
    )
    const missingResult = compileStyles(
      missing,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoRulesStage(missingResult)
    expect(diagnosticCodes(missingResult)).toContain('STYLE_RULE_MISSING')

    const duplicate = canonicalStyleDefinitionBundleFixture()
    duplicate.definitions[0]!.baseRules.find(
      ({ questionId }) => questionId === 'signature',
    )!.tiers[0]!.optionIds.push('yuzu-citrus')
    const duplicateResult = compileStyles(
      duplicate,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoRulesStage(duplicateResult)
    expect(diagnosticCodes(duplicateResult)).toContain('STYLE_RULE_OPTION_DUPLICATE')

    const overlap = canonicalStyleDefinitionBundleFixture()
    overlap.definitions[0]!.baseRules.find(
      ({ questionId }) => questionId === 'signature',
    )!.tiers[1]!.optionIds.push('yuzu-citrus')
    const overlapResult = compileStyles(
      overlap,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoRulesStage(overlapResult)
    expect(diagnosticCodes(overlapResult)).toEqual(expect.arrayContaining([
      'STYLE_RULE_OPTION_DUPLICATE',
      'STYLE_RULE_TIER_OVERLAP',
    ]))
  })

  test('rejects duplicate canonical adjustment conditions independently of priority', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const firstCondition = source.definitions[0]!.bonuses[0]!.conditions[0]!
    source.definitions[0]!.bonuses[0]!.conditions.push({
      ...firstCondition,
      priority: 99,
      optionIds: [...firstCondition.optionIds].reverse(),
    })

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoRulesStage(result)
    expect(diagnosticCodes(result)).toContain('STYLE_ADJUSTMENT_CONDITION_DUPLICATE')
  })

  test('rejects duplicate adjustment identities and priorities without a rules stage', () => {
    const duplicateId = canonicalStyleDefinitionBundleFixture()
    duplicateId.definitions[1]!.bonuses[0]!.id = duplicateId.definitions[0]!
      .bonuses[0]!.id
    const duplicateIdResult = compileStyles(
      duplicateId,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoRulesStage(duplicateIdResult)
    expect(diagnosticCodes(duplicateIdResult)).toContain('STYLE_ADJUSTMENT_DUPLICATE_ID')

    const duplicatePriority = canonicalStyleDefinitionBundleFixture()
    const jiro = duplicatePriority.definitions.find(({ id }) => id === 'jiro')!
    jiro.conflicts[1]!.priority = jiro.conflicts[0]!.priority
    const duplicatePriorityResult = compileStyles(
      duplicatePriority,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoRulesStage(duplicatePriorityResult)
    expect(diagnosticCodes(duplicatePriorityResult))
      .toContain('STYLE_ADJUSTMENT_PRIORITY_DUPLICATE')
  })

  test('rejects empty, duplicate-priority, and invalid adjustment conditions', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.definitions[0]!.bonuses[0]!.conditions[0]!.optionIds = []
    source.definitions[0]!.bonuses[0]!.conditions[1]!.priority = 0
    source.definitions[1]!.conflicts[0]!.whenAll = []
    source.definitions[2]!.bonuses[0]!.conditions[0]!.questionId = 'unknown-question'
    source.definitions[3]!.bonuses[0]!.conditions[0]!.optionIds = ['unknown-option']
    source.definitions[4]!.bonuses[0]!.conditions[0]!.optionIds = ['light']
    source.definitions[5]!.bonuses[0]!.conditions[0]!.optionIds = ['soup', 'soup']

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoRulesStage(result)
    expect(diagnosticCodes(result)).toEqual(expect.arrayContaining([
      'STYLE_ADJUSTMENT_CONDITION_EMPTY',
      'STYLE_ADJUSTMENT_CONDITION_PRIORITY_DUPLICATE',
      'STYLE_ADJUSTMENT_OPTION_DUPLICATE',
      'STYLE_ADJUSTMENT_OPTION_UNKNOWN',
      'STYLE_ADJUSTMENT_OPTION_WRONG_OWNER',
      'STYLE_ADJUSTMENT_QUESTION_UNKNOWN',
    ]))
  })

  test('keeps invalid operand and minMatches failures at the structural boundary', () => {
    const invalidOperand = canonicalStyleDefinitionBundleFixture()
    invalidOperand.definitions[0]!.bonuses[0]!.points = 0
    const operandResult = compileStyles(
      invalidOperand,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoRulesStage(operandResult)
    expect(diagnosticCodes(operandResult)).toEqual(['STRUCTURE_INVALID'])

    const invalidMinMatches = canonicalStyleDefinitionBundleFixture()
    invalidMinMatches.definitions[0]!.bonuses[0]!.minMatches = 99
    const minMatchesResult = compileStyles(
      invalidMinMatches,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    expectNoRulesStage(minMatchesResult)
    expect(diagnosticCodes(minMatchesResult)).toEqual(['STRUCTURE_INVALID'])
  })

  test('rejects unknown, duplicate, and mismatched exclusion tags', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    source.taxonomy.exclusionTags = source.taxonomy.exclusionTags.filter(
      ({ id }) => id !== 'pork',
    )
    source.definitions.find(({ id }) => id === 'tonkotsu')!
      .exclusionTags.push('pork')
    source.taxonomy.exclusionTags.find(({ id }) => id === 'chicken')!
      .exclusionsOptionId = 'duck'

    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoRulesStage(result)
    expect(diagnosticCodes(result)).toEqual(expect.arrayContaining([
      'STYLE_EXCLUSION_TAG_DUPLICATE',
      'STYLE_EXCLUSION_TAG_MISMATCH',
      'STYLE_EXCLUSION_TAG_UNKNOWN',
    ]))
  })

  test('returns deterministic complete rule and adjustment diagnostics with no stage', () => {
    function invalidSource() {
      const source = canonicalStyleDefinitionBundleFixture()
      source.definitions[0]!.baseRules.find(
        ({ questionId }) => questionId === 'signature',
      )!.tiers[1]!.optionIds.push('yuzu-citrus')
      source.definitions[0]!.bonuses[0]!.conditions[1]!.priority = 0
      const firstCondition = source.definitions[0]!.bonuses[0]!.conditions[0]!
      source.definitions[0]!.bonuses[0]!.conditions.push({
        ...firstCondition,
        priority: 99,
        optionIds: [...firstCondition.optionIds].reverse(),
      })
      const jiro = source.definitions.find(({ id }) => id === 'jiro')!
      jiro.conflicts[1]!.priority = jiro.conflicts[0]!.priority
      source.taxonomy.exclusionTags.find(({ id }) => id === 'pork')!
        .exclusionsOptionId = 'chicken'
      return source
    }
    const forward = invalidSource()
    const reversed = invalidSource()
    reversed.definitions.reverse()
    reversed.taxonomy.exclusionTags.reverse()
    for (const style of reversed.definitions) {
      style.baseRules.reverse()
      style.bonuses.reverse()
      style.conflicts.reverse()
      for (const rule of style.baseRules) {
        rule.tiers.reverse()
        for (const tier of rule.tiers) tier.optionIds.reverse()
      }
      for (const bonus of style.bonuses) {
        bonus.conditions.reverse()
        for (const condition of bonus.conditions) condition.optionIds.reverse()
      }
      for (const conflict of style.conflicts) {
        conflict.whenAll.reverse()
        for (const condition of conflict.whenAll) condition.optionIds.reverse()
      }
    }

    const forwardResult = compileStyles(
      forward,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    const reversedResult = compileStyles(
      reversed,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectNoRulesStage(forwardResult)
    expectNoRulesStage(reversedResult)
    expect(reversedResult.diagnostics).toEqual(forwardResult.diagnostics)
    expect(new Set(forwardResult.diagnostics.map((diagnostic) => (
      JSON.stringify(diagnostic)
    ))).size).toBe(forwardResult.diagnostics.length)
  })
})
