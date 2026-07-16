import { execFileSync } from 'node:child_process'

import { describe, expect, test } from 'vitest'

import { compileClassification, syntheticDefinition } from '@ramen-style/classification-core/compiler'
import { buildDocumentation } from './build-index.js'
import { documentationRelations } from './relations.js'

const compiled = compileClassification(
  syntheticDefinition,
  'packages/classification-core/src/definitions/synthetic.ts',
)
if (!compiled.ok) throw new Error('synthetic model did not compile')

function deterministicSnapshot(locale: string) {
  const script = String.raw`
    import {
      compileClassification,
      DiagnosticCollector,
      stableJson,
    } from '@ramen-style/classification-core/compiler'
    import { buildDocumentation } from './tools/documentation/build-index.ts'

    const sourceFile = 'packages/classification-core/src/definitions/synthetic.ts'
    const definition = {
      mode: 'synthetic',
      modelVersion: 'locale-probe',
      questions: [
        {
          sourceFile,
          id: 'y-demo',
          messageId: 'question-y-demo',
          order: 0,
          selectionType: 'single',
          minSelections: 1,
          maxSelections: 1,
          weight: 50,
          dependsOn: [],
          options: [{ id: 'y-option', messageId: 'option-y-demo' }],
        },
        {
          sourceFile,
          id: 'j-demo',
          messageId: 'question-j-demo',
          order: 1,
          selectionType: 'single',
          minSelections: 1,
          maxSelections: 1,
          weight: 50,
          dependsOn: [],
          options: [{ id: 'j-option', messageId: 'option-j-demo' }],
        },
      ],
      styles: [
        {
          sourceFile,
          id: 'y-style',
          messageId: 'style-y-demo',
          familyOptionId: 'y-option',
          priority: 0,
          intensities: ['y-intensity', 'j-intensity'],
          noodles: ['y-noodle', 'j-noodle'],
        },
        {
          sourceFile,
          id: 'j-style',
          messageId: 'style-j-demo',
          familyOptionId: 'j-option',
          priority: 1,
          intensities: ['y-intensity', 'j-intensity'],
          noodles: ['y-noodle', 'j-noodle'],
        },
      ],
      policy: {
        sourceFile,
        exactRatio: 1,
        adjacentRatio: 0.6,
        partialRatio: 0.4,
        bonusCap: 5,
        penaltyCap: 15,
        confidenceThreshold: 72,
        tieGap: 5,
      },
    }
    const compiled = compileClassification(definition, sourceFile)
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))

    const collector = new DiagnosticCollector()
    for (const sourceFile of ['packages/y-demo.ts', 'packages/j-demo.ts']) {
      collector.error({
        code: 'STRUCTURE_INVALID',
        sourceFile,
        path: '',
        message: sourceFile,
      })
    }

    const relations = compiled.model.inventory.map((concept) => ({
      conceptKey: concept.key,
      canonicalSource: concept.sourceFile,
      validators: [sourceFile],
      consumers: [],
      tests: [sourceFile],
      migrations: ['packages/y-demo.ts', 'packages/j-demo.ts'],
    })).reverse()
    const documentation = buildDocumentation(
      compiled.model,
      relations,
      new Set(),
      new Set([sourceFile, 'packages/y-demo.ts', 'packages/j-demo.ts']),
    )
    if (documentation.diagnostics.length) {
      throw new Error(JSON.stringify(documentation.diagnostics))
    }

    console.log(JSON.stringify({
      inventory: compiled.model.inventory.map((concept) => concept.key),
      diagnostics: collector.toArray().map((diagnostic) => diagnostic.sourceFile),
      stableJson: stableJson({ 'y-demo': 1, 'j-demo': 2 }),
      manifest: documentation.manifest,
      markdown: documentation.markdown,
    }))
  `
  return execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        LANG: locale,
        LC_ALL: locale,
      },
    },
  )
}

describe('classification documentation index', () => {
  test('emits identical compiler and documentation bytes across host locales', () => {
    const english = deterministicSnapshot('en_US.UTF-8')
    const lithuanian = deterministicSnapshot('lt_LT.UTF-8')

    expect(lithuanian).toBe(english)
    expect(JSON.parse(english)).toMatchObject({
      diagnostics: ['packages/j-demo.ts', 'packages/y-demo.ts'],
      stableJson: '{\n  "j-demo": 2,\n  "y-demo": 1\n}\n',
    })
  })

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
