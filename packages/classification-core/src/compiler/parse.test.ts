import { describe, expect, test } from 'vitest'

import { parseDefinitionBundle } from './parse.js'

describe('definition bundle parsing', () => {
  test('returns parsed data for a structurally valid bundle', () => {
    const result = parseDefinitionBundle({
      modelVersion: 'batch1.0.0',
      provenance: {
        questions: { origin: 'synthetic' },
        styles: { origin: 'synthetic' },
        scoringPolicy: { origin: 'synthetic' },
      },
      questions: [],
      styles: [],
      policy: {
        sourceFile: 'packages/classification-core/src/definitions/synthetic.ts',
        exactRatio: 1,
        adjacentRatio: 0.6,
        partialRatio: 0.4,
        bonusCap: 5,
        penaltyCap: 15,
        confidenceThreshold: 72,
        tieGap: 5,
      },
    }, 'packages/classification-core/src/definitions/synthetic.ts')

    expect(result.definition?.modelVersion).toBe('batch1.0.0')
    expect(result.diagnostics).toEqual([])
  })

  test('aggregates Zod issues as JSON Pointer diagnostics', () => {
    const result = parseDefinitionBundle({
      modelVersion: 'Bad Version',
      provenance: {
        questions: { origin: 'synthetic' },
        styles: { origin: 'synthetic' },
        scoringPolicy: { origin: 'synthetic' },
      },
      questions: [{ id: 'Bad ID' }],
      styles: [],
      policy: {},
    }, 'packages/classification-core/src/definitions/synthetic.ts')

    expect(result.definition).toBeUndefined()
    expect(result.diagnostics.length).toBeGreaterThan(1)
    expect(result.diagnostics.every((item) => item.code === 'STRUCTURE_INVALID')).toBe(true)
    expect(result.diagnostics.some((item) => item.path === '/modelVersion')).toBe(true)
  })

  test('reports unstable definition and caller source paths without throwing', () => {
    const invalidDefinition = {
      modelVersion: 'batch1.0.0',
      provenance: {
        questions: { origin: 'synthetic' },
        styles: { origin: 'synthetic' },
        scoringPolicy: { origin: 'synthetic' },
      },
      questions: [],
      styles: [],
      policy: {
        sourceFile: 'C:source.ts',
        exactRatio: 1,
        adjacentRatio: 0.6,
        partialRatio: 0.4,
        bonusCap: 5,
        penaltyCap: 15,
        confidenceThreshold: 72,
        tieGap: 5,
      },
    }
    expect(parseDefinitionBundle(invalidDefinition, 'packages/source.ts').diagnostics).not.toEqual([])
    expect(parseDefinitionBundle(invalidDefinition, '/absolute/bundle.ts').diagnostics[0]).toMatchObject({
      code: 'STRUCTURE_INVALID',
      sourceFile: 'runtime://parse-definition-bundle',
      path: '',
    })
  })
})
