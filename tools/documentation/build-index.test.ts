import { describe, expect, test } from 'vitest'

import { compileClassification, syntheticDefinition } from '@ramen-style/classification-core/compiler'
import { buildDocumentation } from './build-index.js'
import { documentationRelations } from './relations.js'

const compiled = compileClassification(
  syntheticDefinition,
  'packages/classification-core/src/definitions/synthetic.ts',
)
if (!compiled.ok) throw new Error('synthetic model did not compile')

describe('classification documentation index', () => {
  test('renders deterministic JSON and Markdown for every concept', () => {
    const paths = new Set(documentationRelations.flatMap((item) => [
      item.canonicalSource,
      ...item.validators,
      ...item.consumers,
      ...item.tests,
      ...item.migrations,
    ]))
    const result = buildDocumentation(
      compiled.model,
      documentationRelations,
      new Set(['tools/validation/validate-classification.ts']),
      paths,
    )

    expect(result.diagnostics).toEqual([])
    expect(result.markdown).toContain('Synthetic inventory')
    const manifest = JSON.parse(result.manifest) as { concepts: unknown[] }
    expect(manifest.concepts).toHaveLength(compiled.model.inventory.length)

    const reversed = buildDocumentation(
      { ...compiled.model, inventory: [...compiled.model.inventory].reverse() },
      [...documentationRelations].reverse(),
      new Set(['tools/validation/validate-classification.ts']),
      paths,
    )
    expect(reversed.manifest).toBe(result.manifest)
    expect(reversed.markdown).toBe(result.markdown)
  })

  test('rejects missing relations and an unregistered detected consumer', () => {
    const result = buildDocumentation(
      compiled.model,
      documentationRelations.slice(1),
      new Set(['tools/unregistered.ts']),
      new Set(),
    )
    expect(result.diagnostics.map((item) => item.code)).toContain('DOC_RELATION_INVALID')
    expect(result.diagnostics.some((item) => item.entityId === 'question/demo-form')).toBe(true)
  })

  test('rejects duplicate and unknown relation keys', () => {
    const first = documentationRelations[0]!
    const paths = new Set(documentationRelations.flatMap((item) => [
      item.canonicalSource,
      ...item.validators,
      ...item.consumers,
      ...item.tests,
      ...item.migrations,
    ]))
    const result = buildDocumentation(
      compiled.model,
      [
        ...documentationRelations,
        { ...first },
        { ...first, conceptKey: 'question/unknown' },
      ],
      new Set(['tools/validation/validate-classification.ts']),
      paths,
    )
    expect(result.diagnostics.filter((item) => item.entityId === first.conceptKey)).not.toEqual([])
    expect(result.diagnostics.some((item) => item.entityId === 'question/unknown')).toBe(true)
  })

  test('rejects a relation path outside the repository even if marked as existing', () => {
    const first = documentationRelations[0]!
    const result = buildDocumentation(
      compiled.model,
      [
        { ...first, validators: ['../outside.ts'] },
        ...documentationRelations.slice(1),
      ],
      new Set(['tools/validation/validate-classification.ts']),
      new Set([
        '../outside.ts',
        ...documentationRelations.flatMap((item) => [
          item.canonicalSource,
          ...item.validators,
          ...item.consumers,
          ...item.tests,
          ...item.migrations,
        ]),
      ]),
    )
    expect(result.diagnostics.some((item) => (
      item.message.includes('not repository-relative POSIX')
    ))).toBe(true)
  })
})
