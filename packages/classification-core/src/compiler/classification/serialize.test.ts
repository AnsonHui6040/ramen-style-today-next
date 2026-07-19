import { describe, expect, test } from 'vitest'

import { classificationDefinition } from '../../definitions/classification.js'
import { compileClassification } from '../compile.js'
import { renderClassificationArtifact } from './serialize.js'

describe('classification artifact serialization', () => {
  // Full classification compilation and serialization can exceed Vitest's 5s default on remote runners.
  test(
    'imports accepted component artifacts instead of duplicating them',
    () => {
      const result = compileClassification(
        classificationDefinition,
        'packages/classification-core/src/definitions/classification.ts',
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const rendered = renderClassificationArtifact(result.model)
      expect(rendered).toContain("import { questionModel } from './question-model.js'")
      expect(rendered).toContain("import { styleModel } from './style-model.js'")
      expect(rendered).toContain('questions: questionModel.questions')
      expect(rendered).not.toContain('generatedAt')
      expect(rendered).not.toMatch(/\/Users\/|\/private\//)
      expect(renderClassificationArtifact(result.model)).toBe(rendered)
    },
    15_000,
  )
})
