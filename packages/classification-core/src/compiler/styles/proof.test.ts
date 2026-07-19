import { createHash } from 'node:crypto'

import { describe, expect, test } from 'vitest'

import type {
  CompiledAdjustment,
  CompiledAdjustmentCondition,
  CompiledStyle,
  CompiledStyleModel,
  CompileStylesResult,
  StyleRulesStage,
} from '../../contracts/style-model.js'
import { stableJson } from '../stable-json.js'
import { compileStyles } from './compile.js'
import { proveStyleModel } from './proof.js'
import {
  acceptedQuestionModelFixture,
  canonicalStyleDefinitionBundleFixture,
  type DeepMutable,
  styleBundleFallbackSource,
} from './test-fixtures.js'

type ModelSuccess = Extract<CompileStylesResult, { readonly ok: true }>

function expectModelSuccess(result: unknown): asserts result is ModelSuccess {
  expect(result).toMatchObject({ ok: true })
  expect(result).toHaveProperty('model')
  expect(result).not.toHaveProperty('rulesStage')
  expect(result).not.toHaveProperty('subtypeStage')
  expect(result).not.toHaveProperty('coreStage')
}

function compileCanonical() {
  return compileStyles(
    canonicalStyleDefinitionBundleFixture(),
    acceptedQuestionModelFixture(),
    styleBundleFallbackSource,
  )
}

function canonicalRulesStage(): DeepMutable<StyleRulesStage> {
  const result = compileCanonical() as unknown as {
    readonly ok: boolean
    readonly rulesStage?: StyleRulesStage
    readonly model?: CompiledStyleModel
  }
  if (!result.ok) throw new Error('canonical style compilation failed')
  if (result.rulesStage) {
    return structuredClone(result.rulesStage) as DeepMutable<StyleRulesStage>
  }
  if (!result.model) throw new Error('canonical style compilation returned no model')
  return {
    kind: 'style-rules-stage',
    modelVersion: result.model.metadata.modelVersion,
    questionModelVersion: result.model.metadata.questionModelVersion,
    questionSemanticHash: result.model.metadata.questionSemanticHash,
    exclusionTags: structuredClone(result.model.exclusionTags),
    styles: structuredClone(result.model.styles),
  } as DeepMutable<StyleRulesStage>
}

function sha256(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function withoutKeys(value: unknown, omitted: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((entry) => withoutKeys(entry, omitted))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !omitted.has(key))
    .map(([key, entry]) => [key, withoutKeys(entry, omitted)]))
}

function conditionProjection(condition: CompiledAdjustmentCondition) {
  return {
    priority: condition.priority,
    questionId: condition.questionId,
    optionIds: condition.optionIds,
  }
}

function adjustmentProjection(adjustment: CompiledAdjustment) {
  return adjustment.kind === 'bonus'
    ? {
        kind: adjustment.kind,
        id: adjustment.id,
        priority: adjustment.priority,
        points: adjustment.points,
        minMatches: adjustment.minMatches,
        conditions: adjustment.conditions.map(conditionProjection),
        appliesToCoreIds: adjustment.appliesToCoreIds,
      }
    : {
        kind: adjustment.kind,
        id: adjustment.id,
        priority: adjustment.priority,
        penalty: adjustment.penalty,
        whenAll: adjustment.whenAll.map(conditionProjection),
        appliesToCoreIds: adjustment.appliesToCoreIds,
      }
}

function semanticStyleProjection(style: CompiledStyle) {
  return {
    id: style.id,
    family: style.family,
    displayPriority: style.displayPriority,
    supportedIntensityIds: style.supportedIntensityIds,
    supportedNoodleIds: style.supportedNoodleIds,
    cores: style.cores.map((core) => ({
      id: core.id,
      parentStyleId: core.parentStyleId,
      intensityId: core.intensityId,
      priority: core.priority,
      rules: core.rules.map((rule) => ({
        id: rule.id,
        parentStyleId: rule.parentStyleId,
        parentCoreId: rule.parentCoreId,
        questionId: rule.questionId,
        priority: rule.priority,
        targets: rule.targets.map(({ optionId, tier, priority }) => ({
          optionId,
          tier,
          priority,
        })),
        fallbackTier: rule.fallbackTier,
      })),
      subtypes: core.subtypes.map((subtype) => ({
        id: subtype.id,
        parentStyleId: subtype.parentStyleId,
        parentCoreId: subtype.parentCoreId,
        noodleId: subtype.noodleId,
        priority: subtype.priority,
      })),
    })),
    adjustments: style.adjustments.map(adjustmentProjection),
    exclusionTags: style.exclusionTags,
  }
}

function semanticProjection(model: CompiledStyleModel) {
  return {
    modelVersion: model.metadata.modelVersion,
    questionModelVersion: model.metadata.questionModelVersion,
    questionSemanticHash: model.metadata.questionSemanticHash,
    exclusionTags: model.exclusionTags.map(({ id, priority, questionId, optionId }) => ({
      id,
      priority,
      questionId,
      optionId,
    })),
    styles: model.styles.map(semanticStyleProjection),
  }
}

function dataProjection(model: CompiledStyleModel) {
  return {
    modelVersion: model.metadata.modelVersion,
    questionModelVersion: model.metadata.questionModelVersion,
    questionSemanticHash: model.metadata.questionSemanticHash,
    exclusionTags: withoutKeys(model.exclusionTags, new Set(['provenance'])),
    styles: withoutKeys(model.styles, new Set(['provenance'])),
    inventory: model.inventory.map(({ key, kind, id, messageIds }) => ({
      key,
      kind,
      id,
      messageIds,
    })),
  }
}

function reverseObjectInsertion(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectInsertion)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => (
    [key, reverseObjectInsertion(entry)]
  )))
}

function reverseDeclarations(source: ReturnType<typeof canonicalStyleDefinitionBundleFixture>) {
  source.definitions.reverse()
  source.taxonomy.families.reverse()
  source.taxonomy.intensities.reverse()
  source.taxonomy.noodles.reverse()
  source.taxonomy.exclusionTags.reverse()
  source.taxonomy.ruleQuestions.reverse()
  for (const intensity of source.taxonomy.intensities) {
    intensity.bodyRule.tiers.reverse()
    for (const tier of intensity.bodyRule.tiers) tier.optionIds.reverse()
  }
  for (const style of source.definitions) {
    style.supportedIntensityIds.reverse()
    style.supportedNoodleIds.reverse()
    style.baseRules.reverse()
    style.bonuses.reverse()
    style.conflicts.reverse()
    style.exclusionTags.reverse()
    for (const rule of style.baseRules) {
      rule.tiers.reverse()
      for (const tier of rule.tiers) tier.optionIds.reverse()
    }
    for (const override of Object.values(style.intensityOverrides ?? {})) {
      if (!override) continue
      override.rules.reverse()
      for (const rule of override.rules) {
        rule.tiers.reverse()
        for (const tier of rule.tiers) tier.optionIds.reverse()
      }
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
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  expect(Object.isFrozen(value)).toBe(true)
  for (const child of Object.values(value)) expectDeepFrozen(child, seen)
}

function diagnosticCodes(result: CompileStylesResult) {
  return result.diagnostics.map(({ code }) => code)
}

describe('style semantic proof completion and identity', () => {
  test('proof completes the exact immutable inventory and final result shape', () => {
    const result = compileCanonical()

    expectModelSuccess(result)
    expect(result.diagnostics).toEqual([])
    expect(result.model.metadata).toMatchObject({
      schemaVersion: '1',
      compilerVersion: '1',
      modelVersion: 'batch3a.1.0',
      questionModelVersion: 'batch2a.1.0',
      questionSemanticHash: 'd1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d',
      sourceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      semanticHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      dataVersion: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    const cores = result.model.styles.flatMap(({ cores }) => cores)
    const subtypes = cores.flatMap(({ subtypes: values }) => values)
    const rules = cores.flatMap(({ rules: values }) => values)
    const adjustments = result.model.styles.flatMap(({ adjustments: values }) => values)
    expect(result.model.styles).toHaveLength(18)
    expect(cores).toHaveLength(54)
    expect(subtypes).toHaveLength(270)
    expect(rules).toHaveLength(378)
    expect(adjustments).toHaveLength(25)
    expect(result.model.inventory).toHaveLength(342)
    expect(result.model.inventory.map(({ key }) => key)).toEqual(
      [...result.model.inventory.map(({ key }) => key)].sort(),
    )
  })

  test('question model identity mismatches fail proof with no model or stage', () => {
    for (const field of ['questionModelVersion', 'questionSemanticHash'] as const) {
      const stage = canonicalRulesStage()
      stage[field] = `damaged-${field}`
      const result = proveStyleModel(stage, canonicalStyleDefinitionBundleFixture())

      expect(result.ok).toBe(false)
      expect(diagnosticCodes(result)).toContain('STYLE_MODEL_VERSION_MISMATCH')
      expect(result).not.toHaveProperty('model')
      expect(result).not.toHaveProperty('rulesStage')
      expect(result).not.toHaveProperty('subtypeStage')
      expect(result).not.toHaveProperty('coreStage')
    }
  })

  test('proof rejects global duplicate identities, missing entities, and extras', () => {
    const stage = canonicalRulesStage()
    const duplicateStyle = structuredClone(
      stage.styles.find(({ id }) => id === 'jiro')!,
    )
    duplicateStyle.cores[1]!.id = duplicateStyle.cores[0]!.id
    duplicateStyle.cores[1]!.subtypes[1]!.id = duplicateStyle.cores[1]!.subtypes[0]!.id
    duplicateStyle.cores[1]!.rules[1]!.id = duplicateStyle.cores[1]!.rules[0]!.id
    duplicateStyle.adjustments[1]!.id = duplicateStyle.adjustments[0]!.id
    stage.styles.push(duplicateStyle)
    stage.styles.splice(1, 1)
    stage.styles[0]!.cores.splice(2, 1)
    stage.styles[0]!.cores[0]!.subtypes.splice(4, 1)

    const result = proveStyleModel(stage, canonicalStyleDefinitionBundleFixture())

    expect(result.ok).toBe(false)
    expect(diagnosticCodes(result)).toEqual(expect.arrayContaining([
      'STYLE_DUPLICATE_ID',
      'STYLE_CORE_ID_COLLISION',
      'STYLE_SUBTYPE_ID_COLLISION',
      'STYLE_RULE_DUPLICATE_ID',
      'STYLE_ADJUSTMENT_DUPLICATE_ID',
      'STYLE_INVENTORY_MISMATCH',
    ]))
    expect(result).not.toHaveProperty('model')
  })

  test('proof catches reconstructed style, core, subtype, and rule parent mismatches', () => {
    const stage = canonicalRulesStage()
    const style = stage.styles[0]!
    const core = style.cores[0]!
    core.parentStyleId = 'wrong-style'
    core.subtypes[0]!.parentStyleId = 'wrong-style'
    core.subtypes[1]!.parentCoreId = 'wrong-style:clean'
    core.rules[0]!.parentStyleId = 'wrong-style'
    core.rules[1]!.parentCoreId = 'wrong-style:clean'

    const result = proveStyleModel(stage, canonicalStyleDefinitionBundleFixture())

    expect(result.ok).toBe(false)
    expect(diagnosticCodes(result)).toContain('STYLE_PARENT_MISMATCH')
    expect(result.diagnostics.filter(({ code }) => code === 'STYLE_PARENT_MISMATCH').length)
      .toBeGreaterThanOrEqual(5)
    expect(result).not.toHaveProperty('model')
  })

  test('proof rejects seven-rule and adjustment core-scope inventory drift', () => {
    const stage = canonicalRulesStage()
    stage.styles[0]!.cores[0]!.rules.pop()
    stage.styles[0]!.adjustments[0]!.appliesToCoreIds = [
      stage.styles[1]!.cores[0]!.id,
    ]

    const result = proveStyleModel(stage, canonicalStyleDefinitionBundleFixture())

    expect(result.ok).toBe(false)
    expect(diagnosticCodes(result)).toContain('STYLE_INVENTORY_MISMATCH')
    expect(result).not.toHaveProperty('model')
  })

  test('reverse invalid proof candidates return byte-identical complete diagnostics', () => {
    const forward = canonicalStyleDefinitionBundleFixture()
    const reversed = canonicalStyleDefinitionBundleFixture()
    reverseDeclarations(reversed)
    const questionModel = acceptedQuestionModelFixture()
    questionModel.metadata.semanticHash = 'a'.repeat(64)

    const forwardResult = compileStyles(forward, questionModel, styleBundleFallbackSource)
    const reversedResult = compileStyles(reversed, questionModel, styleBundleFallbackSource)

    expect(forwardResult.ok).toBe(false)
    expect(reversedResult.ok).toBe(false)
    expect(stableJson(reversedResult.diagnostics)).toBe(stableJson(forwardResult.diagnostics))
  })
})

describe('style hash projections and deterministic reorder handling', () => {
  test('hashes the exact approved source, semantic, and data projections', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const result = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectModelSuccess(result)
    expect(result.model.metadata.sourceHash).toBe(
      '1ed1b65c6279edb23965965437dc7ef3ca1196e95e2cbf45347ec0d88d303eff',
    )
    expect(result.model.metadata.semanticHash).toBe(sha256(semanticProjection(result.model)))
    expect(result.model.metadata.dataVersion).toBe(sha256(dataProjection(result.model)))
    const projections = stableJson({
      sourceHashInputExcludesMetadata: {
        modelVersion: source.modelVersion,
        taxonomy: withoutKeys(source.taxonomy, new Set(['sourceFile'])),
        definitions: source.definitions.map((definition) => (
          withoutKeys(definition, new Set(['sourceFile']))
        )),
      },
      semantic: semanticProjection(result.model),
      data: dataProjection(result.model),
    })
    expect(projections).not.toContain(result.model.metadata.sourceHash)
    expect(projections).not.toContain(result.model.metadata.semanticHash)
    expect(projections).not.toContain(result.model.metadata.dataVersion)
    expect(projections).not.toContain('provenance')
  })

  test('repeat, reverse, shuffle, tier, target, condition, and object reorder compile identically', () => {
    const canonical = compileCanonical()
    const reversed = canonicalStyleDefinitionBundleFixture()
    reverseDeclarations(reversed)
    const shuffled = canonicalStyleDefinitionBundleFixture()
    shuffled.definitions.push(shuffled.definitions.shift()!)
    shuffled.taxonomy.noodles.push(shuffled.taxonomy.noodles.shift()!)
    const objectReordered = reverseObjectInsertion(
      canonicalStyleDefinitionBundleFixture(),
    )

    expectModelSuccess(canonical)
    for (const source of [reversed, shuffled, objectReordered]) {
      const result = compileStyles(
        source,
        acceptedQuestionModelFixture(),
        styleBundleFallbackSource,
      )
      expectModelSuccess(result)
      expect(stableJson(result.model)).toBe(stableJson(canonical.model))
    }
    expect(stableJson(compileCanonical())).toBe(stableJson(canonical))
  })

  test('canonicalizes split same-tier declarations independently of their source order', () => {
    function splitAdjacentTier() {
      const source = canonicalStyleDefinitionBundleFixture()
      const rule = source.definitions.find(({ id }) => id === 'shoyu-chintan')!
        .baseRules.find(({ questionId }) => questionId === 'signature')!
      const adjacentIndex = rule.tiers.findIndex(({ tier }) => tier === 'adjacent')
      const adjacent = rule.tiers[adjacentIndex]!
      const [first, ...remaining] = adjacent.optionIds
      adjacent.optionIds = [first!]
      rule.tiers.splice(adjacentIndex + 1, 0, {
        tier: 'adjacent',
        optionIds: remaining,
      })
      return { source, rule, adjacentIndex }
    }
    const forward = splitAdjacentTier()
    const reversed = splitAdjacentTier()
    const first = reversed.rule.tiers[reversed.adjacentIndex]!
    const second = reversed.rule.tiers[reversed.adjacentIndex + 1]!
    reversed.rule.tiers.splice(reversed.adjacentIndex, 2, second, first)

    const forwardResult = compileStyles(
      forward.source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )
    const reversedResult = compileStyles(
      reversed.source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectModelSuccess(forwardResult)
    expectModelSuccess(reversedResult)
    expect(reversedResult.model.metadata).toEqual(forwardResult.model.metadata)
    expect(stableJson(reversedResult.model)).toBe(stableJson(forwardResult.model))
  })

  test('question sourceHash and provenance-only changes do not pollute style identity', () => {
    const canonical = compileCanonical()
    const questionModel = acceptedQuestionModelFixture()
    questionModel.metadata.sourceHash = 'a'.repeat(64)
    const questionSourceOnly = compileStyles(
      canonicalStyleDefinitionBundleFixture(),
      questionModel,
      styleBundleFallbackSource,
    )
    const provenanceOnlySource = canonicalStyleDefinitionBundleFixture()
    provenanceOnlySource.sourceFile = 'packages/alternate/style-bundle.ts'
    provenanceOnlySource.taxonomy.sourceFile = 'packages/alternate/taxonomy.ts'
    for (const style of provenanceOnlySource.definitions) {
      style.sourceFile = `packages/alternate/${style.id}.ts`
    }
    const provenanceOnly = compileStyles(
      provenanceOnlySource,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectModelSuccess(canonical)
    expectModelSuccess(questionSourceOnly)
    expectModelSuccess(provenanceOnly)
    expect(questionSourceOnly.model.metadata).toEqual(canonical.model.metadata)
    expect(provenanceOnly.model.metadata).toEqual(canonical.model.metadata)
  })

  test('message and accent changes affect source/data identity but not semantic identity', () => {
    const canonical = compileCanonical()
    const source = canonicalStyleDefinitionBundleFixture()
    source.definitions[0]!.messageIds.label = 'changed-style-label-message'
    source.definitions[0]!.accent = '#010203'
    source.taxonomy.intensities[0]!.labelMessageId = 'changed-intensity-label-template'
    const changed = compileStyles(
      source,
      acceptedQuestionModelFixture(),
      styleBundleFallbackSource,
    )

    expectModelSuccess(canonical)
    expectModelSuccess(changed)
    expect(changed.model.metadata.sourceHash).not.toBe(canonical.model.metadata.sourceHash)
    expect(changed.model.metadata.dataVersion).not.toBe(canonical.model.metadata.dataVersion)
    expect(changed.model.metadata.semanticHash).toBe(canonical.model.metadata.semanticHash)
  })

  test('a semantic rule tier change affects semantic hash', () => {
    const canonical = compileCanonical()
    const source = canonicalStyleDefinitionBundleFixture()
    const rule = source.definitions[0]!.baseRules.find(
      ({ tiers }) => tiers.length >= 2 && tiers[0]!.optionIds.length > 0
        && tiers[1]!.optionIds.length > 0,
    )!
    const exactOptions = rule.tiers[0]!.optionIds
    rule.tiers[0]!.optionIds = rule.tiers[1]!.optionIds
    rule.tiers[1]!.optionIds = exactOptions
    const changed = compileStyles(source, acceptedQuestionModelFixture(), styleBundleFallbackSource)

    expectModelSuccess(canonical)
    expectModelSuccess(changed)
    expect(changed.model.metadata.semanticHash).not.toBe(canonical.model.metadata.semanticHash)
  })

  test('source-only override representation changes only sourceHash', () => {
    const canonical = compileCanonical()
    const source = canonicalStyleDefinitionBundleFixture()
    source.definitions[0]!.intensityOverrides = {
      clean: {
        rules: [structuredClone(source.taxonomy.intensities.find(
          ({ id }) => id === 'clean',
        )!.bodyRule)],
      },
    }
    const changed = compileStyles(source, acceptedQuestionModelFixture(), styleBundleFallbackSource)

    expectModelSuccess(canonical)
    expectModelSuccess(changed)
    expect(changed.model.metadata.sourceHash).not.toBe(canonical.model.metadata.sourceHash)
    expect(changed.model.metadata.semanticHash).toBe(canonical.model.metadata.semanticHash)
    expect(changed.model.metadata.dataVersion).toBe(canonical.model.metadata.dataVersion)
  })
})

describe('style proof immutability and boundaries', () => {
  test('deep freezes every model descendant and isolates later source mutation', () => {
    const source = canonicalStyleDefinitionBundleFixture()
    const result = compileStyles(source, acceptedQuestionModelFixture(), styleBundleFallbackSource)

    expectModelSuccess(result)
    expectDeepFrozen(result.model)
    const before = stableJson(result.model)
    source.definitions[0]!.messageIds.label = 'mutated-after-compile'
    source.definitions[0]!.supportedIntensityIds.reverse()
    source.taxonomy.noodles.reverse()
    expect(stableJson(result.model)).toBe(before)
    expect(() => {
      ;(result.model.styles as CompiledStyle[]).push(result.model.styles[0]!)
    }).toThrow()
    expect(stableJson(result.model)).toBe(before)
  })

  test('contains no timestamp, absolute path, machine state, or execution policy', () => {
    const result = compileCanonical()

    expectModelSuccess(result)
    const serialized = stableJson(result.model)
    expect(serialized).not.toMatch(/\/Users\/|\/private\/|\/tmp\//)
    expect(serialized).not.toMatch(/savedAt|timestamp|buildTime|confidence|ranking|eligibility/)
    expect(serialized).not.toContain(process.env.HOME ?? '/Users/unknown')
  })

  test('keeps proveStyleModel private while publishing the inert style model', async () => {
    const compiler = await import('../index.js')
    const runtime = await import('../../index.js')
    const generated = await import('../../generated/style-model.js')

    expect(compiler).not.toHaveProperty('proveStyleModel')
    expect(runtime).not.toHaveProperty('proveStyleModel')
    expect(runtime.styleModel).toBe(generated.styleModel)
    expect(Object.isFrozen(runtime.styleModel)).toBe(true)
  })
})
