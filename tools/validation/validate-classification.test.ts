import { describe, expect, test } from 'vitest'

import {
  classificationDefinition,
  compileClassification,
  type ClassificationModel,
} from '@ramen-style/classification-core/compiler'
import { validateClassificationModel } from './validate-classification.js'

describe('classification validation', () => {
  test('accepts decoupled global and style versions through policy bindings', () => {
    const result = compileClassification(
      classificationDefinition,
      'packages/classification-core/src/definitions/classification.ts',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.modelVersion).not.toBe(result.model.styleModel.metadata.modelVersion)
    expect(() => validateClassificationModel(result.model)).not.toThrow()
  })

  test('rejects a policy component identity mismatch', () => {
    const result = compileClassification(
      classificationDefinition,
      'packages/classification-core/src/definitions/classification.ts',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const changed = structuredClone(result.model) as ClassificationModel
    const metadata = changed.policy.metadata as { styleSemanticHash: string }
    metadata.styleSemanticHash = '0'.repeat(64)
    expect(() => validateClassificationModel(changed)).toThrow(
      'classification composition validation failed',
    )
  })

  test('rejects a style-to-question identity mismatch', () => {
    const result = compileClassification(
      classificationDefinition,
      'packages/classification-core/src/definitions/classification.ts',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const changed = structuredClone(result.model) as ClassificationModel
    const metadata = changed.styleModel.metadata as { questionSemanticHash: string }
    metadata.questionSemanticHash = '0'.repeat(64)
    expect(() => validateClassificationModel(changed)).toThrow(
      'classification composition validation failed',
    )
  })
})
