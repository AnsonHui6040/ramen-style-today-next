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
    expect(Object.isFrozen(first.model.questions[0]!.optionSet)).toBe(true)
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
    const flat = duplicateOption.questions[0]!.optionSet
    if (flat.kind !== 'flat') throw new Error('fixture must be flat')
    flat.options[1]!.id = 'demo-soup'
    expect(compileClassification(duplicateOption, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'OPTION_DUPLICATE_ID', path: '/questions/0/optionSet' }),
    )

    const duplicateStyle = structuredClone(syntheticDefinition)
    duplicateStyle.styles.push(structuredClone(duplicateStyle.styles[0]!))
    expect(compileClassification(duplicateStyle, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'STYLE_DUPLICATE_ID', path: '/styles' }),
    )
  })

  test('does not interpret legacy weights during validation', () => {
    const odd = structuredClone(syntheticDefinition)
    odd.questions[0]!.legacyWeight = 40
    expect(compileClassification(odd, sourceFile).ok).toBe(true)
  })

  test('reports flow order, branch, restriction and fallback errors at stable paths', () => {
    const invalid = structuredClone(syntheticDefinition)
    invalid.questions[1]!.order = 0
    const branch = invalid.questions[1]!.optionSet
    if (branch.kind !== 'branch') throw new Error('fixture must branch')
    branch.branches.pop()
    branch.branches[0]!.when = 'unknown-option'
    invalid.questions[1]!.restriction = {
      by: 'demo-form',
      allow: [{ when: 'demo-soup', optionIds: ['missing-option'] }],
    }
    invalid.questions[0]!.emptyFallbackOptionId = 'missing-fallback'

    const codes = compileClassification(invalid, sourceFile).diagnostics
    expect(codes).toContainEqual(expect.objectContaining({ code: 'FLOW_ORDER_INVALID' }))
    expect(codes).toContainEqual(expect.objectContaining({
      code: 'REFERENCE_UNKNOWN',
      path: '/questions/1/optionSet/branches/0/when',
    }))
    expect(codes).toContainEqual(expect.objectContaining({
      code: 'FLOW_BRANCH_INCOMPLETE',
      path: '/questions/1/optionSet/branches',
    }))
    expect(codes).toContainEqual(expect.objectContaining({
      code: 'REFERENCE_UNKNOWN',
      path: '/questions/1/restriction/allow/0/optionIds/0',
    }))
    expect(codes).toContainEqual(expect.objectContaining({
      code: 'REFERENCE_UNKNOWN',
      path: '/questions/0/emptyFallbackOptionId',
    }))
  })

  test('allows the same option ID in different questions', () => {
    const shared = structuredClone(syntheticDefinition)
    const second = shared.questions[1]!.optionSet
    if (second.kind !== 'branch') throw new Error('fixture must branch')
    second.branches[0]!.options[0]!.id = 'demo-soup'
    const result = compileClassification(shared, sourceFile)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.model.inventory.map((item) => item.key)).toEqual(
        expect.arrayContaining(['option/demo-form:demo-soup', 'option/demo-archetype:demo-soup']),
      )
    }
  })

  test('rejects an invalid selection bound structurally', () => {
    const invalid = structuredClone(syntheticDefinition)
    invalid.questions[0]!.minSelections = 2
    expect(compileClassification(invalid, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'STRUCTURE_INVALID', path: '/questions/0/minSelections' }),
    )
  })
})
