import { createHash } from 'node:crypto'

import { describe, expect, expectTypeOf, test } from 'vitest'

import type { ClassificationModel } from '../contracts/model.js'
import type {
  CompiledQuestionModel,
  QuestionDefinitionSource,
} from '../contracts/question-model.js'
import type { CompiledStyleModel } from '../contracts/style-model.js'
import { classificationDefinition } from '../definitions/classification.js'
import { legacyEligibilityPolicy } from '../definitions/eligibility-policy.js'
import { legacyScoringPolicy } from '../definitions/policies.js'
import { questionDefinitions } from '../definitions/questions.js'
import { styleDefinitionBundle } from '../definitions/styles/index.js'
import { compileClassification, type CompileResult } from './compile.js'
import { compileEligibilityPolicy } from './eligibility-policy/compile.js'
import { compileQuestions } from './questions/compile.js'
import { compileScoringPolicy } from './scoring-policy/compile.js'
import type { DefinitionBundleSource } from './source-schema.js'
import { stableJson } from './stable-json.js'
import { compileStyles } from './styles/compile.js'

const sourceFile = 'packages/classification-core/src/definitions/classification.ts'
const acceptedStyleHashes = {
  sourceHash: '1ed1b65c6279edb23965965437dc7ef3ca1196e95e2cbf45347ec0d88d303eff',
  semanticHash: '9fb9832c434b22fcd8397809b14117a47c358a266694df24ba68fd290fc5f585',
  dataVersion: 'c5b3b3353b42618875f1c20d64449ec513601b60215351f757dbd1e48d1fee28',
} as const

type CompileSuccess = Extract<CompileResult, { readonly ok: true }>
type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T

function productionDefinition(): Mutable<DefinitionBundleSource> {
  return structuredClone({
    modelVersion: 'batch3c.1.0',
    provenance: {
      questions: { origin: 'legacy-production' },
      styles: { origin: 'legacy-production' },
      scoringPolicy: { origin: 'legacy-production' },
      eligibilityPolicy: { origin: 'legacy-production' },
    },
    questions: questionDefinitions,
    styles: styleDefinitionBundle,
    policy: legacyScoringPolicy,
    eligibilityPolicy: legacyEligibilityPolicy,
  }) as unknown as Mutable<DefinitionBundleSource>
}

function expectSuccess(result: CompileResult): asserts result is CompileSuccess {
  expect(result.ok).toBe(true)
  expect(result).toHaveProperty('model')
}

function expectFailure(result: CompileResult) {
  expect(result.ok).toBe(false)
  expect(result).not.toHaveProperty('model')
}

function compileQuestionModel(
  definition: Mutable<DefinitionBundleSource>,
): CompiledQuestionModel {
  const result = compileQuestions(
    definition.questions as readonly QuestionDefinitionSource[],
  )
  if (!result.ok) throw new Error('test question source must compile')
  return result.model
}

function compileStyleModel(
  definition: Mutable<DefinitionBundleSource>,
  questionModel: CompiledQuestionModel,
): CompiledStyleModel {
  const result = compileStyles(definition.styles, questionModel, definition.styles.sourceFile)
  if (!result.ok) throw new Error('test style source must compile')
  return result.model
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function expectedClassificationDataVersion(
  definition: Mutable<DefinitionBundleSource>,
  questionModel: CompiledQuestionModel,
  styleModel: CompiledStyleModel,
) {
  const policy = compileScoringPolicy(
    definition.policy,
    questionModel,
    styleModel,
    definition.modelVersion,
  )
  if (!policy.ok) throw new Error('test policy source must compile')
  const eligibilityPolicy = compileEligibilityPolicy(
    definition.eligibilityPolicy,
    questionModel,
    styleModel,
    policy.model,
    definition.modelVersion,
  )
  if (!eligibilityPolicy.ok) throw new Error('test eligibility policy must compile')
  return sha256(stableJson({
    modelVersion: definition.modelVersion,
    questionModel: {
      modelVersion: questionModel.metadata.modelVersion,
      sourceHash: questionModel.metadata.sourceHash,
      semanticHash: questionModel.metadata.semanticHash,
    },
    styleModel: {
      modelVersion: styleModel.metadata.modelVersion,
      semanticHash: styleModel.metadata.semanticHash,
      dataVersion: styleModel.metadata.dataVersion,
    },
    scoringPolicy: {
      semanticHash: policy.model.metadata.semanticHash,
      dataVersion: policy.model.metadata.dataVersion,
    },
    eligibilityPolicy: {
      semanticHash: eligibilityPolicy.model.metadata.semanticHash,
      dataVersion: eligibilityPolicy.model.metadata.dataVersion,
    },
  }))
}

function reverseSourceOrder(definition: Mutable<DefinitionBundleSource>) {
  definition.questions.reverse()
  for (const question of definition.questions) question.options.reverse()
  definition.styles.definitions.reverse()
  definition.styles.taxonomy.families.reverse()
  definition.styles.taxonomy.intensities.reverse()
  definition.styles.taxonomy.noodles.reverse()
  definition.styles.taxonomy.exclusionTags.reverse()
  definition.styles.taxonomy.ruleQuestions.reverse()
  definition.policy.scoredQuestions.reverse()
  definition.policy.tiers.reverse()
  definition.policy.confidence.uncertainty.reverse()
  definition.eligibilityPolicy.rules.reverse()
  for (const rule of definition.eligibilityPolicy.rules) {
    rule.restrictionTagIds.reverse()
  }
  for (const style of definition.styles.definitions) {
    style.supportedIntensityIds.reverse()
    style.supportedNoodleIds.reverse()
    style.baseRules.reverse()
    for (const rule of style.baseRules) {
      rule.tiers.reverse()
      for (const tier of rule.tiers) tier.optionIds.reverse()
    }
  }
  return definition
}

describe('classification source replacement and compile ordering', () => {
  test('uses the production style bundle and compiled legacy policy', () => {
    expect(classificationDefinition).toEqual(productionDefinition())

    const result = compileClassification(classificationDefinition, sourceFile)

    expectSuccess(result)
    expect(result.model.modelVersion).toBe('batch3c.1.0')
    expect(result.model.policy.metadata).toMatchObject({
      modelVersion: 'batch3b.1.0',
      questionModelVersion: 'batch2a.1.0',
      styleModelVersion: 'batch3a.1.0',
    })
    expect(result.model.policy.derived).toEqual({
      baseWeightTotal: 100,
      maximumScore: 105,
      scoreScale: 10,
    })
    expect(result.model.provenance.scoringPolicy)
      .toEqual({ origin: 'legacy-production' })
    expect(result.model.provenance.eligibilityPolicy)
      .toEqual({ origin: 'legacy-production' })
  }, 15_000)

  test('question failure prevents style compilation and returns no partial model', () => {
    const invalid = productionDefinition()
    invalid.questions.push({ ...invalid.questions[0]!, order: 8 })
    invalid.styles.definitions[0]!.family = 'dry'

    const result = compileClassification(invalid, sourceFile)

    expectFailure(result)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'QUESTION_DUPLICATE_ID',
    }))
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'STYLE_FAMILY_MISMATCH',
    }))
  })

  test('style failure after question success prevents the classification model', () => {
    const invalid = productionDefinition()
    invalid.styles.definitions[0]!.family = 'dry'

    const result = compileClassification(invalid, sourceFile)

    expectFailure(result)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'STYLE_FAMILY_MISMATCH',
    }))
  })

  test('binds styles to the exact same successfully compiled question model', () => {
    const definition = productionDefinition()
    definition.questions[0]!.messageIds.title = 'question-form-title-v2'
    const questionModel = compileQuestionModel(definition)
    const expectedStyleModel = compileStyleModel(definition, questionModel)

    const result = compileClassification(definition, sourceFile)

    expectSuccess(result)
    expect(result.model.questionModel).toEqual(questionModel)
    expect(result.model.questionModel.questions).toBe(result.model.questions)
    expect(result.model.questions).toEqual(questionModel.questions)
    expect(result.model.styleModel.metadata.questionModelVersion)
      .toBe(questionModel.metadata.modelVersion)
    expect(result.model.styleModel.metadata.questionSemanticHash)
      .toBe(questionModel.metadata.semanticHash)
    expect(result.model.styleModel).toEqual(expectedStyleModel)
  })

  test('allows global/component version decoupling and rejects eligibility/global mismatch', () => {
    const valid = compileClassification(productionDefinition(), sourceFile)
    const invalid = productionDefinition()
    invalid.modelVersion = 'batch3a.1.1'

    const result = compileClassification(invalid, sourceFile)

    expectSuccess(valid)
    expect(valid.model.modelVersion).toBe('batch3c.1.0')
    expect(valid.model.policy.metadata.modelVersion).toBe('batch3b.1.0')
    expect(valid.model.styleModel.metadata.modelVersion).toBe('batch3a.1.0')
    expectFailure(result)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'ELIGIBILITY_POLICY_MODEL_VERSION_MISMATCH',
      path: '/modelVersion',
      expected: 'batch3a.1.1',
      received: 'batch3c.1.0',
    }))
  })
})

describe('classification model composition', () => {
  test('contains the exact compiled style model and no retired raw styles field', () => {
    const definition = productionDefinition()
    const result = compileClassification(definition, sourceFile)

    expectSuccess(result)
    expect(result.model).not.toHaveProperty('styles')
    expect(result.model.styleModel.metadata).toMatchObject({
      modelVersion: 'batch3a.1.0',
      questionModelVersion: 'batch2a.1.0',
      ...acceptedStyleHashes,
    })
    expect(result.model.styleModel.styles).toHaveLength(18)
    expect(result.model.styleModel.inventory).toHaveLength(342)
    expectTypeOf<ClassificationModel['styleModel']>().toEqualTypeOf<CompiledStyleModel>()
  })

  test('records compiled style identity in classification provenance', () => {
    const result = compileClassification(productionDefinition(), sourceFile)

    expectSuccess(result)
    expect(result.model.provenance).toEqual({
      questions: { origin: 'legacy-production' },
      styles: {
        origin: 'legacy-production',
        modelVersion: 'batch3a.1.0',
        ...acceptedStyleHashes,
      },
      scoringPolicy: { origin: 'legacy-production' },
      eligibilityPolicy: { origin: 'legacy-production' },
    })
  })

  test('deep freezes the complete classification model through the shared boundary', () => {
    const result = compileClassification(productionDefinition(), sourceFile)

    expectSuccess(result)
    expect(Object.isFrozen(result.model)).toBe(true)
    expect(Object.isFrozen(result.model.provenance.styles)).toBe(true)
    expect(Object.isFrozen(result.model.questions)).toBe(true)
    expect(Object.isFrozen(result.model.questions[0]!.options)).toBe(true)
    expect(Object.isFrozen(result.model.styleModel)).toBe(true)
    expect(Object.isFrozen(result.model.styleModel.styles[0]!.cores)).toBe(true)
    expect(Object.isFrozen(result.model.policy)).toBe(true)
    expect(Object.isFrozen(result.model.eligibilityPolicy)).toBe(true)
    expect(Object.isFrozen(result.model.inventory)).toBe(true)
  })

  test('builds the exact globally ordered combined inventory', () => {
    const result = compileClassification(productionDefinition(), sourceFile)

    expectSuccess(result)
    const inventory = result.model.inventory
    const kindCounts = Object.fromEntries([
      'question',
      'option',
      'style',
      'intensity',
      'noodle',
      'policy',
    ].map((kind) => [kind, inventory.filter((record) => record.kind === kind).length]))
    expect(kindCounts).toEqual({
      question: 8,
      option: 53,
      style: 18,
      intensity: 54,
      noodle: 270,
      policy: 2,
    })
    expect(inventory).toHaveLength(405)
    expect(inventory.map(({ key }) => key)).toEqual(
      [...inventory.map(({ key }) => key)].sort(),
    )
    expect(new Set(inventory.map(({ key }) => key)).size).toBe(405)
    expect(inventory.filter(({ kind }) => (
      kind === 'style' || kind === 'intensity' || kind === 'noodle'
    ))).toEqual(result.model.styleModel.inventory)
    expect(inventory).toContainEqual(expect.objectContaining({
      key: 'option/source:pork',
      ownerQuestionId: 'source',
    }))
    expect(stableJson(inventory)).not.toMatch(
      /canonicalAnswers|completedAnswers|forcedAnswers|savedAt/,
    )
  })
})

describe('classification data identity', () => {
  test('uses the exact approved metadata and policy projection without self hashing', () => {
    const definition = productionDefinition()
    const questionModel = compileQuestionModel(definition)
    const styleModel = compileStyleModel(definition, questionModel)
    const result = compileClassification(definition, sourceFile)

    expectSuccess(result)
    expect(result.model.dataVersion).toBe(
      expectedClassificationDataVersion(definition, questionModel, styleModel),
    )
    expect(result.model.dataVersion).toMatch(/^[a-f0-9]{64}$/)
  })

  test('is byte-identical across repeated compilation and reordered source', () => {
    const first = compileClassification(productionDefinition(), sourceFile)
    const second = compileClassification(productionDefinition(), sourceFile)
    const reordered = compileClassification(
      reverseSourceOrder(productionDefinition()),
      sourceFile,
    )

    expectSuccess(first)
    expectSuccess(second)
    expectSuccess(reordered)
    expect(stableJson(second.model)).toBe(stableJson(first.model))
    expect(stableJson(reordered.model)).toBe(stableJson(first.model))
  })

  test('question message-ID-only changes source and classification data but not semantics', () => {
    const baselineDefinition = productionDefinition()
    const changedDefinition = productionDefinition()
    changedDefinition.questions[0]!.messageIds.title = 'question-form-title-v2'
    const baselineQuestion = compileQuestionModel(baselineDefinition)
    const changedQuestion = compileQuestionModel(changedDefinition)
    const baseline = compileClassification(baselineDefinition, sourceFile)
    const changed = compileClassification(changedDefinition, sourceFile)

    expectSuccess(baseline)
    expectSuccess(changed)
    expect(changedQuestion.metadata.sourceHash).not.toBe(baselineQuestion.metadata.sourceHash)
    expect(changedQuestion.metadata.semanticHash).toBe(baselineQuestion.metadata.semanticHash)
    expect(changed.model.dataVersion).not.toBe(baseline.model.dataVersion)
    expect(changed.model.styleModel.metadata.semanticHash)
      .toBe(baseline.model.styleModel.metadata.semanticHash)
  })

  test('fails closed when question semantics no longer match the accepted style binding', () => {
    const baselineDefinition = productionDefinition()
    const changedDefinition = productionDefinition()
    changedDefinition.questions[0]!.options[0]!.exclusive = true
    const baselineQuestion = compileQuestionModel(baselineDefinition)
    const changedQuestion = compileQuestionModel(changedDefinition)
    const changed = compileClassification(changedDefinition, sourceFile)

    expect(changedQuestion.metadata.semanticHash).not.toBe(baselineQuestion.metadata.semanticHash)
    expectFailure(changed)
    expect(changed.diagnostics).toContainEqual(expect.objectContaining({
      code: 'STYLE_MODEL_VERSION_MISMATCH',
      path: '/questionSemanticHash',
      expected: baselineQuestion.metadata.semanticHash,
      received: changedQuestion.metadata.semanticHash,
    }))
  }, 15_000)

  test('style semantic and source-data-only changes affect the approved axes', () => {
    const baselineDefinition = productionDefinition()
    const semanticDefinition = productionDefinition()
    const tareRule = semanticDefinition.styles.definitions[0]!.baseRules
      .find(({ questionId }) => questionId === 'tare')!
    tareRule.tiers.find(({ tier }) => tier === 'exact')!.optionIds[0] = 'miso'
    const dataDefinition = productionDefinition()
    dataDefinition.styles.definitions[0]!.accent = '#abcdef'
    const baseline = compileClassification(baselineDefinition, sourceFile)
    const semantic = compileClassification(semanticDefinition, sourceFile)
    const data = compileClassification(dataDefinition, sourceFile)

    expectSuccess(baseline)
    expectSuccess(semantic)
    expectSuccess(data)
    expect(semantic.model.styleModel.metadata.semanticHash)
      .not.toBe(baseline.model.styleModel.metadata.semanticHash)
    expect(semantic.model.dataVersion).not.toBe(baseline.model.dataVersion)
    expect(data.model.styleModel.metadata.semanticHash)
      .toBe(baseline.model.styleModel.metadata.semanticHash)
    expect(data.model.styleModel.metadata.dataVersion)
      .not.toBe(baseline.model.styleModel.metadata.dataVersion)
    expect(data.model.dataVersion).not.toBe(baseline.model.dataVersion)
  }, 15_000)

  test('policy changes affect classification identity without changing compiled styles', () => {
    const baselineDefinition = productionDefinition()
    const changedDefinition = productionDefinition()
    changedDefinition.policy.adjustments.bonusCap = 6
    const baseline = compileClassification(baselineDefinition, sourceFile)
    const changed = compileClassification(changedDefinition, sourceFile)

    expectSuccess(baseline)
    expectSuccess(changed)
    expect(changed.model.styleModel.metadata).toEqual(baseline.model.styleModel.metadata)
    expect(changed.model.dataVersion).not.toBe(baseline.model.dataVersion)
  })

  test('repository-relative style provenance does not pollute classification identity', () => {
    const baselineDefinition = productionDefinition()
    const changedDefinition = productionDefinition()
    changedDefinition.styles.definitions[0]!.sourceFile =
      'packages/classification-core/src/definitions/styles/renamed-source.ts'
    const baseline = compileClassification(baselineDefinition, sourceFile)
    const changed = compileClassification(changedDefinition, sourceFile)

    expectSuccess(baseline)
    expectSuccess(changed)
    expect(changed.model.styleModel.metadata).toEqual(baseline.model.styleModel.metadata)
    expect(changed.model.dataVersion).toBe(baseline.model.dataVersion)
    expect(stableJson(changed.model)).not.toBe(stableJson(baseline.model))
    expect(stableJson(changed.model)).not.toMatch(/\/Users\/|\/private\/|timestamp|savedAt/)
  })
})

describe('preserved question and API boundaries', () => {
  test('preserves unknown-reference, cycle, duplicate-option, and policy diagnostics', () => {
    const unknown = productionDefinition()
    unknown.questions[0]!.availableWhen = {
      type: 'answered',
      questionId: 'missing-question',
    }
    const cycle = productionDefinition()
    cycle.questions[0]!.availableWhen = {
      type: 'answered',
      questionId: 'archetype',
    }
    const duplicateOption = productionDefinition()
    duplicateOption.questions[0]!.options[1]!.id = 'soup'
    const invalidWeight = productionDefinition()
    invalidWeight.questions[0]!.weight = 40

    expect(compileClassification(unknown, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'REFERENCE_UNKNOWN' }),
    )
    expect(compileClassification(cycle, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'FLOW_CYCLE' }),
    )
    expect(compileClassification(duplicateOption, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'OPTION_DUPLICATE_ID' }),
    )
    expect(compileClassification(invalidWeight, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'POLICY_QUESTION_WEIGHT_MISMATCH' }),
    )
  })

  test('publishes the Task 12 inert style value without compiler values', async () => {
    const runtime = await import('../index.js')
    const generated = await import('../generated/style-model.js')

    expect(runtime.styleModel).toBe(generated.styleModel)
    expect(runtime).not.toHaveProperty('CompiledStyleModel')
    expect(runtime).not.toHaveProperty('compileStyles')
    expect(runtime).not.toHaveProperty('proveStyleModel')
  })
})
