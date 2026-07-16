import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import * as ts from 'typescript'
import { describe, expect, expectTypeOf, test } from 'vitest'

import * as runtime from './index.js'
import * as styleSubpath from '@ramen-style/classification-core/generated/style-model'
import type * as SubpathStyleTypes from '@ramen-style/classification-core/generated/style-model'
import type * as ContractStyleTypes from './contracts/style-model.js'
import type * as RootStyleTypes from './index.js'
import {
  applyAnswer,
  createStoredClassificationPayloadV1,
  decodeAnswerDraft,
  evaluateFlow,
  getFirstActionableQuestion,
  getNextInteractiveQuestion,
  getPreviousInteractiveQuestion,
  questionModel,
  restoreClassification,
  updatePendingSelection,
  type AppliedMigration,
  type ClassificationRestoreSource,
  type CompiledQuestionModel,
  type CreateStoredPayloadResult,
  type PersistenceDiagnostic,
  type PersistenceDiagnosticCode,
  type PersistencePipelineStage,
  type PersistenceRepair,
  type RestoreChange,
  type RestoreResult,
  type StoredClassificationPayloadV1,
} from './index.js'
import { createStoredClassificationPayloadV1 as createPayloadImplementation } from './persistence/create-payload.js'
import type {
  AppliedMigration as ContractAppliedMigration,
  ClassificationRestoreSource as ContractClassificationRestoreSource,
  CreateStoredPayloadResult as ContractCreateStoredPayloadResult,
  PersistenceDiagnostic as ContractPersistenceDiagnostic,
  PersistenceDiagnosticCode as ContractPersistenceDiagnosticCode,
  PersistencePipelineStage as ContractPersistencePipelineStage,
  PersistenceRepair as ContractPersistenceRepair,
  RestoreChange as ContractRestoreChange,
  RestoreResult as ContractRestoreResult,
  StoredClassificationPayloadV1 as ContractStoredClassificationPayloadV1,
} from './persistence/contracts.js'
import { restoreClassification as restoreImplementation } from './persistence/restore.js'

type SubpathStyleTypeSurface = {
  readonly CompiledAdjustment: SubpathStyleTypes.CompiledAdjustment
  readonly CompiledAdjustmentCondition: SubpathStyleTypes.CompiledAdjustmentCondition
  readonly CompiledBonus: SubpathStyleTypes.CompiledBonus
  readonly CompiledConflict: SubpathStyleTypes.CompiledConflict
  readonly CompiledCore: SubpathStyleTypes.CompiledCore
  readonly CompiledExclusionTag: SubpathStyleTypes.CompiledExclusionTag
  readonly CompiledRuleTarget: SubpathStyleTypes.CompiledRuleTarget
  readonly CompiledStyle: SubpathStyleTypes.CompiledStyle
  readonly CompiledStyleInventoryRecord: SubpathStyleTypes.CompiledStyleInventoryRecord
  readonly CompiledStyleModel: SubpathStyleTypes.CompiledStyleModel
  readonly CompiledStyleModelMetadata: SubpathStyleTypes.CompiledStyleModelMetadata
  readonly CompiledStyleRule: SubpathStyleTypes.CompiledStyleRule
  readonly CompiledSubtype: SubpathStyleTypes.CompiledSubtype
  readonly CoreId: SubpathStyleTypes.CoreId
  readonly ExclusionTagId: SubpathStyleTypes.ExclusionTagId
  readonly IntensityId: SubpathStyleTypes.IntensityId
  readonly MatchTier: SubpathStyleTypes.MatchTier
  readonly NoodleId: SubpathStyleTypes.NoodleId
  readonly RuleId: SubpathStyleTypes.RuleId
  readonly StyleFamilyId: SubpathStyleTypes.StyleFamilyId
  readonly StyleId: SubpathStyleTypes.StyleId
  readonly StyleRuleProvenance: SubpathStyleTypes.StyleRuleProvenance
  readonly StyleSourceReference: SubpathStyleTypes.StyleSourceReference
  readonly SubtypeId: SubpathStyleTypes.SubtypeId
}

type RootStyleTypeSurface = {
  readonly CompiledAdjustment: RootStyleTypes.CompiledAdjustment
  readonly CompiledAdjustmentCondition: RootStyleTypes.CompiledAdjustmentCondition
  readonly CompiledBonus: RootStyleTypes.CompiledBonus
  readonly CompiledConflict: RootStyleTypes.CompiledConflict
  readonly CompiledCore: RootStyleTypes.CompiledCore
  readonly CompiledExclusionTag: RootStyleTypes.CompiledExclusionTag
  readonly CompiledRuleTarget: RootStyleTypes.CompiledRuleTarget
  readonly CompiledStyle: RootStyleTypes.CompiledStyle
  readonly CompiledStyleInventoryRecord: RootStyleTypes.CompiledStyleInventoryRecord
  readonly CompiledStyleModel: RootStyleTypes.CompiledStyleModel
  readonly CompiledStyleModelMetadata: RootStyleTypes.CompiledStyleModelMetadata
  readonly CompiledStyleRule: RootStyleTypes.CompiledStyleRule
  readonly CompiledSubtype: RootStyleTypes.CompiledSubtype
  readonly CoreId: RootStyleTypes.CoreId
  readonly ExclusionTagId: RootStyleTypes.ExclusionTagId
  readonly IntensityId: RootStyleTypes.IntensityId
  readonly MatchTier: RootStyleTypes.MatchTier
  readonly NoodleId: RootStyleTypes.NoodleId
  readonly RuleId: RootStyleTypes.RuleId
  readonly StyleFamilyId: RootStyleTypes.StyleFamilyId
  readonly StyleId: RootStyleTypes.StyleId
  readonly StyleRuleProvenance: RootStyleTypes.StyleRuleProvenance
  readonly StyleSourceReference: RootStyleTypes.StyleSourceReference
  readonly SubtypeId: RootStyleTypes.SubtypeId
}

type ContractStyleTypeSurface = {
  readonly CompiledAdjustment: ContractStyleTypes.CompiledAdjustment
  readonly CompiledAdjustmentCondition: ContractStyleTypes.CompiledAdjustmentCondition
  readonly CompiledBonus: ContractStyleTypes.CompiledBonus
  readonly CompiledConflict: ContractStyleTypes.CompiledConflict
  readonly CompiledCore: ContractStyleTypes.CompiledCore
  readonly CompiledExclusionTag: ContractStyleTypes.CompiledExclusionTag
  readonly CompiledRuleTarget: ContractStyleTypes.CompiledRuleTarget
  readonly CompiledStyle: ContractStyleTypes.CompiledStyle
  readonly CompiledStyleInventoryRecord: ContractStyleTypes.CompiledStyleInventoryRecord
  readonly CompiledStyleModel: ContractStyleTypes.CompiledStyleModel
  readonly CompiledStyleModelMetadata: ContractStyleTypes.CompiledStyleModelMetadata
  readonly CompiledStyleRule: ContractStyleTypes.CompiledStyleRule
  readonly CompiledSubtype: ContractStyleTypes.CompiledSubtype
  readonly CoreId: ContractStyleTypes.CoreId
  readonly ExclusionTagId: ContractStyleTypes.ExclusionTagId
  readonly IntensityId: ContractStyleTypes.IntensityId
  readonly MatchTier: ContractStyleTypes.MatchTier
  readonly NoodleId: ContractStyleTypes.NoodleId
  readonly RuleId: ContractStyleTypes.RuleId
  readonly StyleFamilyId: ContractStyleTypes.StyleFamilyId
  readonly StyleId: ContractStyleTypes.StyleId
  readonly StyleRuleProvenance: ContractStyleTypes.StyleRuleProvenance
  readonly StyleSourceReference: ContractStyleTypes.StyleSourceReference
  readonly SubtypeId: ContractStyleTypes.SubtypeId
}

const approvedStyleTypeExports = [
  'CompiledAdjustment',
  'CompiledAdjustmentCondition',
  'CompiledBonus',
  'CompiledConflict',
  'CompiledCore',
  'CompiledExclusionTag',
  'CompiledRuleTarget',
  'CompiledStyle',
  'CompiledStyleInventoryRecord',
  'CompiledStyleModel',
  'CompiledStyleModelMetadata',
  'CompiledStyleRule',
  'CompiledSubtype',
  'CoreId',
  'ExclusionTagId',
  'IntensityId',
  'MatchTier',
  'NoodleId',
  'RuleId',
  'StyleFamilyId',
  'StyleId',
  'StyleRuleProvenance',
  'StyleSourceReference',
  'SubtypeId',
] as const

const existingRuntimeTypeExports = [
  'AllowedOptionDecisionRow',
  'AllowedOptionSelection',
  'AnswerDraft',
  'AnswerSubmission',
  'AppliedMigration',
  'ApplyAnswerResult',
  'CanonicalAnswers',
  'ClassificationRestoreSource',
  'CompiledOption',
  'CompiledQuestion',
  'CompiledQuestionModel',
  'CompiledQuestionModelMetadata',
  'CompletedAnswers',
  'CreateStoredPayloadResult',
  'DecodeAnswerDraftResult',
  'DecodedAnswerDraft',
  'Diagnostic',
  'DiagnosticCode',
  'DiagnosticReference',
  'DiagnosticSeverity',
  'FlowRepair',
  'FlowState',
  'FlowStateBase',
  'ForcedAnswer',
  'ForcedAnswerChange',
  'OptionId',
  'PendingQuestionState',
  'PendingSelectionOperation',
  'PendingSelectionResult',
  'PersistenceDiagnostic',
  'PersistenceDiagnosticCode',
  'PersistencePipelineStage',
  'PersistenceRepair',
  'QuestionId',
  'RestoreChange',
  'RestoreResult',
  'SerializableCondition',
  'StoredClassificationPayloadV1',
] as const

const task10CompilerValueExports = [
  'DiagnosticCollector',
  'classificationDefinition',
  'compareCodePoints',
  'compileClassification',
  'compileQuestions',
  'compileStyles',
  'definitionBundleSchema',
  'parseDefinitionBundle',
  'questionDefinitionSourceSchema',
  'questionDefinitions',
  'renderQuestionArtifact',
  'renderStyleArtifact',
  'stableJson',
  'styleDefinitionBundle',
  'styleDefinitionBundleSchema',
  'styleDefinitionSchema',
  'styleDefinitions',
  'styleTaxonomy',
] as const

const task10CompilerTypeExports = [
  'AdjustmentConditionDefinition',
  'AllowedOptionDecisionRow',
  'AllowedOptionSelection',
  'BonusDefinition',
  'ClassificationModel',
  'CompileQuestionsResult',
  'CompileResult',
  'CompileStylesResult',
  'CompiledAdjustment',
  'CompiledAdjustmentCondition',
  'CompiledBonus',
  'CompiledConflict',
  'CompiledCore',
  'CompiledExclusionTag',
  'CompiledOption',
  'CompiledQuestion',
  'CompiledQuestionModel',
  'CompiledQuestionModelMetadata',
  'CompiledRuleTarget',
  'CompiledStyle',
  'CompiledStyleInventoryRecord',
  'CompiledStyleModel',
  'CompiledStyleModelMetadata',
  'CompiledStyleRule',
  'CompiledSubtype',
  'ConceptKey',
  'ConceptKind',
  'ConceptRecord',
  'ConflictDefinition',
  'CoreId',
  'DefinitionBundleSource',
  'Diagnostic',
  'ExclusionTagId',
  'IntensityId',
  'IntensityOverrideDefinition',
  'MatchTier',
  'NoodleId',
  'OptionDefinitionSource',
  'QuestionDefinitionSource',
  'RuleId',
  'SerializableCondition',
  'StyleDefinition',
  'StyleDefinitionBundleSource',
  'StyleFamilyId',
  'StyleId',
  'StyleRuleDefinition',
  'StyleRuleProvenance',
  'StyleRuleTierDefinition',
  'StyleSourceReference',
  'StyleTaxonomyDefinition',
  'SubtypeId',
] as const

function exportedSurface(relativePath: string) {
  const sourcePath = resolve(import.meta.dirname, relativePath)
  const source = readFileSync(sourcePath, 'utf8')
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true)
  const values: string[] = []
  const types: string[] = []
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) continue
    if (ts.isNamespaceExport(statement.exportClause)) {
      values.push(statement.exportClause.name.text)
      continue
    }
    for (const element of statement.exportClause.elements) {
      const target = statement.isTypeOnly || element.isTypeOnly ? types : values
      target.push(element.name.text)
    }
  }
  return {
    values: values.sort(),
    types: types.sort(),
  }
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return
  expect(Object.isFrozen(value)).toBe(true)
  for (const child of Object.values(value)) expectDeeplyFrozen(child)
}

describe('classification-core runtime package', () => {
  test('exports the exact frozen runtime surface without compiler APIs', () => {
    expect(Object.keys(runtime).sort()).toEqual([
      'applyAnswer',
      'createStoredClassificationPayloadV1',
      'decodeAnswerDraft',
      'evaluateFlow',
      'getFirstActionableQuestion',
      'getNextInteractiveQuestion',
      'getPreviousInteractiveQuestion',
      'questionModel',
      'restoreClassification',
      'styleModel',
      'updatePendingSelection',
    ])
    expect(createStoredClassificationPayloadV1).toBe(createPayloadImplementation)
    expect(restoreClassification).toBe(restoreImplementation)
    expectTypeOf(questionModel).toMatchTypeOf<CompiledQuestionModel>()
    expect(Object.isFrozen(questionModel)).toBe(true)
    expect(Object.isFrozen(questionModel.questions)).toBe(true)
    expect(Object.isFrozen(questionModel.questions[0])).toBe(true)
    expect(Object.isFrozen(questionModel.questions[0]!.options)).toBe(true)
    expect(Object.isFrozen(questionModel.questions[0]!.options[0])).toBe(true)
    expect('compileQuestions' in runtime).toBe(false)
    expect('questionDefinitions' in runtime).toBe(false)
    expect([
      'decodeRestoreSource',
      'decodeMinimalEnvelope',
      'decodeStoredPayloadV1Structure',
      'decodeCurrentAnswerDraft',
      'schemaMigrationRegistry',
      'questionModelMigrationRegistry',
      'migrateVerifiedLegacyAnswers',
      'projectRepairedSubmittedAnswers',
      'resolveResumeQuestion',
      'sameStoredClassificationPayloadV1',
      'scanPlainData',
      'PersistenceInvariantError',
      'currentV1',
    ].filter((name) => name in runtime)).toEqual([])
  })

  test('declares the exact additive runtime and unchanged compiler source surfaces', () => {
    expect(exportedSurface('./index.ts')).toEqual({
      values: [
        'applyAnswer',
        'createStoredClassificationPayloadV1',
        'decodeAnswerDraft',
        'evaluateFlow',
        'getFirstActionableQuestion',
        'getNextInteractiveQuestion',
        'getPreviousInteractiveQuestion',
        'questionModel',
        'restoreClassification',
        'styleModel',
        'updatePendingSelection',
      ].sort(),
      types: [...existingRuntimeTypeExports, ...approvedStyleTypeExports].sort(),
    })
    expect(exportedSurface('./compiler/index.ts')).toEqual({
      values: [...task10CompilerValueExports].sort(),
      types: [...task10CompilerTypeExports].sort(),
    })
  })

  test('defines an exact style facade and package subpath without public internals', () => {
    expect(exportedSurface('./style-model.ts')).toEqual({
      values: ['styleModel'],
      types: [...approvedStyleTypeExports].sort(),
    })
    const packageJson = JSON.parse(readFileSync(
      resolve(import.meta.dirname, '../package.json'),
      'utf8',
    )) as { exports: Record<string, unknown> }
    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      './compiler': './src/compiler/index.ts',
      './generated/question-model': './src/generated/question-model.ts',
      './generated/style-model': './src/style-model.ts',
    })
    expect([
      'CompileStyleCoresResult',
      'CompileStyleRulesResult',
      'CompileStyleSubtypesResult',
      'CompileStylesResult',
      'StyleCoreStage',
      'StyleDefinition',
      'StyleDefinitionBundleSource',
      'StyleRulesStage',
      'StyleSubtypeStage',
      'StyleTaxonomyDefinition',
      'proveStyleModel',
    ].filter((name) => (
      exportedSurface('./style-model.ts').values.includes(name)
      || exportedSurface('./style-model.ts').types.includes(name)
    ))).toEqual([])
    expect(Object.keys(styleSubpath)).toEqual(['styleModel'])
    expect(styleSubpath.styleModel).toBe(runtime.styleModel)
    expectDeeplyFrozen(styleSubpath.styleModel)
    expectTypeOf<SubpathStyleTypeSurface>()
      .toEqualTypeOf<ContractStyleTypeSurface>()
    expectTypeOf<RootStyleTypeSurface>()
      .toEqualTypeOf<ContractStyleTypeSurface>()
  })

  test('exports the exact persistence contract types for consumers', () => {
    expectTypeOf<ClassificationRestoreSource>()
      .toEqualTypeOf<ContractClassificationRestoreSource>()
    expectTypeOf<StoredClassificationPayloadV1>()
      .toEqualTypeOf<ContractStoredClassificationPayloadV1>()
    expectTypeOf<RestoreResult>().toEqualTypeOf<ContractRestoreResult>()
    expectTypeOf<RestoreChange>().toEqualTypeOf<ContractRestoreChange>()
    expectTypeOf<AppliedMigration>().toEqualTypeOf<ContractAppliedMigration>()
    expectTypeOf<PersistenceRepair>().toEqualTypeOf<ContractPersistenceRepair>()
    expectTypeOf<PersistenceDiagnostic>().toEqualTypeOf<ContractPersistenceDiagnostic>()
    expectTypeOf<PersistenceDiagnosticCode>()
      .toEqualTypeOf<ContractPersistenceDiagnosticCode>()
    expectTypeOf<PersistencePipelineStage>()
      .toEqualTypeOf<ContractPersistencePipelineStage>()
    expectTypeOf<CreateStoredPayloadResult>()
      .toEqualTypeOf<ContractCreateStoredPayloadResult>()
  })

  test('keeps public persistence results recursively frozen without mutable singletons', () => {
    const first = createStoredClassificationPayloadV1(questionModel, {})
    const second = createStoredClassificationPayloadV1(questionModel, {})
    expect(first).not.toBe(second)
    expect(first).toEqual(second)
    expect(first.status).toBe('created')
    expectDeeplyFrozen(first)

    if (first.status !== 'created') throw new Error('Expected a created payload')
    const restored = restoreClassification(questionModel, {
      kind: 'versioned',
      payload: first.payload,
    })
    expect(restored.status).toBe('restored')
    expectDeeplyFrozen(restored)
  })

  test('flow APIs do not mutate the tracked public model', () => {
    const before = JSON.stringify(questionModel)
    const initial = evaluateFlow(questionModel, {})
    expect(initial.status).toBe('incomplete')
    expect(getFirstActionableQuestion(initial)).toBe('form')
    expect(getNextInteractiveQuestion(initial, 'form')).toBe('exclusions')
    expect(getPreviousInteractiveQuestion(initial, 'form')).toBeUndefined()

    const decoded = decodeAnswerDraft({ form: ['soup'] })
    expect(decoded.ok).toBe(true)
    const pending = updatePendingSelection({
      questionId: 'form',
      optionOrder: ['soup', 'tsukemen', 'dry'],
      allowedOptionIds: ['soup', 'tsukemen', 'dry'],
      exclusiveOptionIds: ['soup', 'tsukemen', 'dry'],
      minSelections: 1,
      maxSelections: 1,
      initialUiOptionIds: [],
      emptyBehavior: { type: 'allow-empty' },
    }, [], { type: 'select', optionId: 'soup' })
    expect(pending.optionIds).toEqual(['soup'])
    expect(applyAnswer(questionModel, {}, {
      questionId: 'form',
      optionIds: ['soup'],
    }).accepted).toBe(true)

    expect(JSON.stringify(questionModel)).toBe(before)
  })
})
