import { describe, expect, expectTypeOf, test } from 'vitest'

import type { ClassificationModel } from '../contracts/model.js'
import { classificationDefinition } from '../definitions/classification.js'
import { compileClassification } from './compile.js'
import type { DefinitionBundleSource } from './source-schema.js'

const sourceFile = 'packages/classification-core/src/definitions/classification.ts'

function mutableDefinition() {
  return structuredClone(classificationDefinition) as unknown as DefinitionBundleSource
}

describe('classification compiler shell', () => {
  test('compiles deterministic frozen mixed-provenance inventory', () => {
    const first = compileClassification(classificationDefinition, sourceFile)
    const second = compileClassification(classificationDefinition, sourceFile)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.model.dataVersion).toBe(second.model.dataVersion)
    expect(first.model.provenance).toEqual({
      questions: { origin: 'legacy-production' },
      styles: { origin: 'synthetic' },
      scoringPolicy: { origin: 'synthetic' },
    })
    expect(first.model.questions).toHaveLength(8)
    expect(first.model.inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'option/source:pork',
        id: 'pork',
        ownerQuestionId: 'source',
      }),
      expect.objectContaining({
        key: 'option/exclusions:pork',
        id: 'pork',
        ownerQuestionId: 'exclusions',
      }),
      expect.objectContaining({ key: 'style/demo-shoyu' }),
    ]))
    expect(Object.isFrozen(first.model)).toBe(true)
    expect(Object.isFrozen(first.model.inventory)).toBe(true)
    expect(Object.isFrozen(first.model.questions[0]!.options)).toBe(true)
    expect(Object.isFrozen(first.model.policy)).toBe(true)
    expectTypeOf<ClassificationModel['questions']>().not.toMatchTypeOf<unknown[]>()
  })

  test('rejects an unknown or wrongly-owned style family option reference', () => {
    const unknown = mutableDefinition()
    unknown.styles[0]!.familyOptionId.optionId = 'missing-option'
    expect(compileClassification(unknown, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'REFERENCE_UNKNOWN',
        path: '/styles/0/familyOptionId',
      }),
    )

    const wrongOwner = mutableDefinition()
    wrongOwner.styles[0]!.familyOptionId.questionId = 'form'
    expect(compileClassification(wrongOwner, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'REFERENCE_UNKNOWN',
        path: '/styles/0/familyOptionId',
      }),
    )
  })

  test('allows repeated option values across questions but rejects them within one question', () => {
    expect(compileClassification(classificationDefinition, sourceFile).ok).toBe(true)

    const duplicateOption = mutableDefinition()
    duplicateOption.questions[0]!.options[1]!.id = 'soup'
    expect(compileClassification(duplicateOption, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'OPTION_DUPLICATE_ID',
        path: '/questions/0/options',
        entityId: 'form:soup',
      }),
    )
  })

  test('rejects duplicate identities and invalid policy weight totals at stable paths', () => {
    const duplicateQuestion = mutableDefinition()
    duplicateQuestion.questions.push({ ...duplicateQuestion.questions[0]!, order: 8 })
    expect(compileClassification(duplicateQuestion, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'QUESTION_DUPLICATE_ID', path: '/questions' }),
    )

    const duplicateStyle = mutableDefinition()
    duplicateStyle.styles.push(structuredClone(duplicateStyle.styles[0]!))
    expect(compileClassification(duplicateStyle, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'STYLE_DUPLICATE_ID', path: '/styles' }),
    )

    const duplicateIntensity = mutableDefinition()
    duplicateIntensity.styles[0]!.intensities.push('standard')
    expect(compileClassification(duplicateIntensity, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'CONCEPT_DUPLICATE_KEY', path: '/inventory' }),
    )

    const invalidWeight = mutableDefinition()
    invalidWeight.questions[0]!.weight = 40
    expect(compileClassification(invalidWeight, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'POLICY_WEIGHT_TOTAL', path: '/questions' }),
    )
  })
})
