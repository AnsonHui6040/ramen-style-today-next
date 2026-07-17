import { describe, expect, test } from 'vitest'

import { legacyEligibilityPolicy } from '../definitions/eligibility-policy.js'
import { legacyScoringPolicy } from '../definitions/policies.js'
import { questionDefinitions } from '../definitions/questions.js'
import { styleDefinitionBundle } from '../definitions/styles/index.js'
import { parseDefinitionBundle } from './parse.js'
import type { DefinitionBundleSource } from './source-schema.js'

const sourceFile = 'packages/classification-core/src/definitions/classification.ts'
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

function reverseObjectInsertion(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectInsertion)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, nested]) => [key, reverseObjectInsertion(nested)]),
  )
}

describe('definition bundle parsing', () => {
  test('accepts the strict production bundle and preserves legacy policy', () => {
    const result = parseDefinitionBundle(productionDefinition(), sourceFile)

    expect(result.diagnostics).toEqual([])
    expect(result.definition).toMatchObject({
      modelVersion: 'batch3c.1.0',
      provenance: {
        styles: { origin: 'legacy-production' },
        scoringPolicy: { origin: 'legacy-production' },
        eligibilityPolicy: { origin: 'legacy-production' },
      },
      styles: {
        modelVersion: 'batch3a.1.0',
        definitions: expect.arrayContaining([
          expect.objectContaining({ id: 'shoyu-chintan' }),
        ]),
      },
      policy: legacyScoringPolicy,
      eligibilityPolicy: legacyEligibilityPolicy,
    })
  })

  test('rejects the retired synthetic style source shape', () => {
    const invalid = productionDefinition()
    invalid.styles = [{
      sourceFile: 'packages/classification-core/src/definitions/synthetic.ts',
      id: 'demo-shoyu',
      messageId: 'style-demo-shoyu',
      familyOptionId: { questionId: 'archetype', optionId: 'chintan' },
      priority: 0,
      intensities: ['standard'],
      noodles: ['medium-thin-straight'],
    }] as unknown as typeof invalid.styles

    const result = parseDefinitionBundle(invalid, sourceFile)

    expect(result.definition).toBeUndefined()
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'STRUCTURE_INVALID',
      path: '/styles',
    }))
  })

  test('rejects missing and unknown style-bundle fields instead of converting them', () => {
    const missing = productionDefinition() as { styles?: unknown }
    delete missing.styles
    const unknown = productionDefinition()
    const unknownStyles = { ...unknown.styles, placeholderCount: 18 }

    const missingResult = parseDefinitionBundle(missing, sourceFile)
    const unknownResult = parseDefinitionBundle(
      { ...unknown, styles: unknownStyles },
      sourceFile,
    )

    expect(missingResult.definition).toBeUndefined()
    expect(missingResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'STRUCTURE_INVALID',
      path: '/styles',
    }))
    expect(unknownResult.definition).toBeUndefined()
    expect(unknownResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'STRUCTURE_INVALID',
      path: '/styles',
    }))
  })

  test('reports malformed style fields deterministically across object insertion order', () => {
    const malformed = productionDefinition()
    malformed.styles.definitions[0]!.id = 'Bad ID'
    const reversed = reverseObjectInsertion(malformed)

    const first = parseDefinitionBundle(malformed, sourceFile)
    const second = parseDefinitionBundle(reversed, sourceFile)

    expect(first.definition).toBeUndefined()
    expect(first.diagnostics).toEqual(second.diagnostics)
    expect(first.diagnostics).toContainEqual(expect.objectContaining({
      code: 'STRUCTURE_INVALID',
      path: '/styles/definitions/0/id',
    }))
  })

  test('aggregates top-level and question Zod issues as JSON Pointer diagnostics', () => {
    const invalid = productionDefinition()
    invalid.modelVersion = 'Bad Version'
    invalid.questions = [{ id: 'Bad ID' }] as unknown as typeof invalid.questions

    const result = parseDefinitionBundle(invalid, sourceFile)

    expect(result.definition).toBeUndefined()
    expect(result.diagnostics.length).toBeGreaterThan(1)
    expect(result.diagnostics.every((item) => item.code === 'STRUCTURE_INVALID')).toBe(true)
    expect(result.diagnostics.some((item) => item.path === '/modelVersion')).toBe(true)
  })

  test('reports unstable definition and caller source paths without throwing', () => {
    const invalidDefinition = productionDefinition()
    invalidDefinition.policy.sourceFile = 'C:source.ts'

    expect(parseDefinitionBundle(invalidDefinition, sourceFile).diagnostics).not.toEqual([])
    expect(parseDefinitionBundle(invalidDefinition, '/absolute/bundle.ts').diagnostics[0])
      .toMatchObject({
        code: 'STRUCTURE_INVALID',
        sourceFile: 'runtime://parse-definition-bundle',
        path: '',
      })
  })
})
