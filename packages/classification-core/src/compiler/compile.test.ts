import { describe, expect, expectTypeOf, test } from 'vitest'

import type { ClassificationModel } from '../contracts/model.js'
import { syntheticDefinition } from '../definitions/synthetic.js'
import { compileClassification } from './compile.js'

const sourceFile = 'packages/classification-core/src/definitions/synthetic.ts'

describe('classification compiler shell', () => {
  test('compiles deterministic frozen inventory', () => {
    const first = compileClassification(syntheticDefinition, sourceFile)
    const second = compileClassification(syntheticDefinition, sourceFile)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.model.dataVersion).toBe(second.model.dataVersion)
    expect(first.model.inventory.map((item) => item.key)).toContain('style/demo-shoyu')
    expect(Object.isFrozen(first.model)).toBe(true)
    expect(Object.isFrozen(first.model.inventory)).toBe(true)
    expect(Object.isFrozen(first.model.questions[0]!.options)).toBe(true)
    expect(Object.isFrozen(first.model.policy)).toBe(true)
    expectTypeOf<ClassificationModel['questions']>().not.toMatchTypeOf<unknown[]>()
  })

  test('rejects unknown dependencies and a flow cycle together', () => {
    const invalid = structuredClone(syntheticDefinition)
    invalid.questions[0]?.dependsOn.push('missing-question')
    invalid.questions[1]?.dependsOn.push('demo-form')
    invalid.questions[0]?.dependsOn.push('demo-archetype')

    const result = compileClassification(invalid, sourceFile)

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['REFERENCE_UNKNOWN', 'FLOW_CYCLE']),
    )
  })

  test('rejects duplicate concept keys across the complete inventory', () => {
    const invalid = structuredClone(syntheticDefinition)
    invalid.questions[1]!.options[0]!.id = 'demo-soup'
    invalid.styles[0]!.intensities.push('standard')

    const result = compileClassification(invalid, sourceFile)

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((item) => item.code)).toContain('CONCEPT_DUPLICATE_KEY')
  })

  test('reports duplicate identities and invalid policy weight totals at stable paths', () => {
    const duplicateQuestion = structuredClone(syntheticDefinition)
    duplicateQuestion.questions.push({ ...duplicateQuestion.questions[0]!, order: 2 })
    expect(compileClassification(duplicateQuestion, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'QUESTION_DUPLICATE_ID', path: '/questions' }),
    )

    const duplicateOption = structuredClone(syntheticDefinition)
    duplicateOption.questions[1]!.options[0]!.id = 'demo-soup'
    expect(compileClassification(duplicateOption, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'OPTION_DUPLICATE_ID', path: '/questions' }),
    )

    const duplicateStyle = structuredClone(syntheticDefinition)
    duplicateStyle.styles.push(structuredClone(duplicateStyle.styles[0]!))
    expect(compileClassification(duplicateStyle, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'STYLE_DUPLICATE_ID', path: '/styles' }),
    )

    const invalidWeight = structuredClone(syntheticDefinition)
    invalidWeight.questions[0]!.weight = 40
    expect(compileClassification(invalidWeight, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'POLICY_WEIGHT_TOTAL', path: '/questions' }),
    )
  })
})
