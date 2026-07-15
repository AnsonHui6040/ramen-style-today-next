import { describe, expect, test } from 'vitest'

import type { StyleDefinitionBundleSource } from '../../contracts/style-model.js'
import { compileStyles } from './compile.js'
import {
  acceptedQuestionModelFixture,
  canonicalStyleDefinitionBundleFixture,
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

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result).not.toHaveProperty('model')
    expect(result.coreStage).toMatchObject({
      kind: 'style-core-stage',
      modelVersion: 'batch3a.1.0',
      questionModelVersion: 'batch2a.1.0',
    })
    expect(result.coreStage.styles.map(({ id }) => id))
      .toEqual(expectedStyles.map(({ id }) => id))
    expect(result.coreStage.styles).toHaveLength(18)

    const cores = result.coreStage.styles.flatMap(({ cores: styleCores }) => styleCores)
    expect(cores).toHaveLength(54)
    expect(new Set(cores.map(({ id }) => id)).size).toBe(54)
    expect(cores.map(({ id }) => id)).toEqual(expectedStyles.flatMap(({ id }) => (
      expectedIntensities.map(({ id: intensityId }) => `${id}:${intensityId}`)
    )))

    for (const style of result.coreStage.styles) {
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
        expect(core).not.toHaveProperty('rules')
        expect(core).not.toHaveProperty('subtypes')
        expect(core.resolvedRules.map(({ questionId }) => questionId)).toEqual([
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

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const style = result.coreStage.styles.find(({ id }) => id === 'shoyu-chintan')!
    for (const intensity of source.taxonomy.intensities) {
      const core = style.cores.find(({ intensityId }) => intensityId === intensity.id)!
      const bodyRule = core.resolvedRules.find(({ questionId }) => questionId === 'body')!
      expect(bodyRule.tiers).toEqual(intensity.bodyRule.tiers)
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

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const clean = result.coreStage.styles[0]!.cores.find(
      ({ intensityId }) => intensityId === 'clean',
    )!
    expect(clean.resolvedRules.find(({ questionId }) => questionId === 'body')).toEqual(
      expect.objectContaining({
        tiers: [{ tier: 'exact', optionIds: ['ultra-heavy'] }],
        provenance: expect.objectContaining({
          inheritedFrom: 'style-intensity-override',
        }),
      }),
    )
    expect(clean.resolvedRules.find(({ questionId }) => questionId === 'body')!.tiers)
      .not.toEqual(source.taxonomy.intensities[0]!.bodyRule.tiers)
  })

  test('does not fabricate intensity core overrides for canonical definitions', () => {
    const result = compileCanonical()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.coreStage.styles.flatMap(({ cores }) => cores).flatMap(
      ({ resolvedRules }) => resolvedRules,
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
      'STYLE_CORE_ID_COLLISION',
      'STYLE_INTENSITY_DUPLICATE',
      'STYLE_INVENTORY_MISMATCH',
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
