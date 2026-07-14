import { execFileSync } from 'node:child_process'

import { describe, expect, test } from 'vitest'

import { compileClassification } from '@ramen-style/classification-core/compiler'
import { buildDocumentation } from './build-index.js'
import {
  createDocumentationRelations,
  documentationDefinition,
  documentationSourceFile,
} from './relations.js'

const compiled = compileClassification(
  documentationDefinition,
  documentationSourceFile,
)
if (!compiled.ok) throw new Error('documentation model did not compile')
const documentationRelations = createDocumentationRelations(compiled.model)

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
      modelVersion: 'locale-probe',
      provenance: {
        questions: { origin: 'synthetic' },
        styles: { origin: 'synthetic' },
        scoringPolicy: { origin: 'synthetic' },
      },
      questions: [
        {
          id: 'y-demo',
          order: 0,
          messageIds: {
            title: 'question-y-demo-title',
            description: 'question-y-demo-description',
          },
          selection: { type: 'single', min: 1, max: 1 },
          weight: 50,
          options: [{
            id: 'y-option',
            order: 0,
            messageIds: { label: 'option-y-demo-label' },
          }],
        },
        {
          id: 'j-demo',
          order: 1,
          messageIds: {
            title: 'question-j-demo-title',
            description: 'question-j-demo-description',
          },
          selection: { type: 'single', min: 1, max: 1 },
          weight: 50,
          options: [{
            id: 'j-option',
            order: 0,
            messageIds: { label: 'option-j-demo-label' },
          }],
        },
      ],
      styles: [
        {
          sourceFile,
          id: 'y-style',
          messageId: 'style-y-demo',
          familyOptionId: { questionId: 'y-demo', optionId: 'y-option' },
          priority: 0,
          intensities: ['y-intensity', 'j-intensity'],
          noodles: ['y-noodle', 'j-noodle'],
        },
        {
          sourceFile,
          id: 'j-style',
          messageId: 'style-j-demo',
          familyOptionId: { questionId: 'j-demo', optionId: 'j-option' },
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
  const detectedCoreConsumers = [
    'packages/classification-core/src/flow/evaluate.ts',
    'tools/validation/validate-classification.ts',
  ] as const

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
      new Set(detectedCoreConsumers),
      paths,
    )

    expect(result.diagnostics).toEqual([])
    expect(result.markdown).toContain('Production question ownership')
    const manifest = JSON.parse(result.manifest) as { concepts: unknown[]; synthetic: boolean }
    expect(manifest.concepts).toHaveLength(compiled.model.inventory.length)
    expect(manifest.synthetic).toBe(false)

    const reversed = buildDocumentation(
      { ...compiled.model, inventory: [...compiled.model.inventory].reverse() },
      [...documentationRelations].reverse(),
      new Set(detectedCoreConsumers),
      paths,
    )
    expect(reversed.manifest).toBe(result.manifest)
    expect(reversed.markdown).toBe(result.markdown)
  })

  test('renders per-domain provenance without upgrading unrelated domains', () => {
    const paths = new Set(documentationRelations.flatMap((item) => [
      item.canonicalSource,
      ...item.validators,
      ...item.consumers,
      ...item.tests,
      ...item.migrations,
    ]))
    const manifest = JSON.parse(buildDocumentation(
      compiled.model,
      documentationRelations,
      new Set(detectedCoreConsumers),
      paths,
    ).manifest)

    expect(manifest.provenance.questions).toMatchObject({
      origin: 'legacy-production',
      assurance: 'compiler-validated',
      parityScope: 'legacy-observable-transition-projection',
    })
    expect(manifest.provenance.styles.assurance).toBe('structurally-validated')
    expect(manifest.provenance.scoringPolicy.assurance).toBe('structurally-validated')
    expect(manifest.readiness).toEqual({
      status: 'migration-only',
      blockers: [
        'styles-not-migrated',
        'scoring-not-migrated',
        'persistence-not-migrated',
        'runtime-not-cut-over',
      ],
    })
  })

  test('lists every production question and option with canonical owners', () => {
    const paths = new Set(documentationRelations.flatMap((item) => [
      item.canonicalSource,
      ...item.validators,
      ...item.consumers,
      ...item.tests,
      ...item.migrations,
    ]))
    const manifest = JSON.parse(buildDocumentation(
      compiled.model,
      documentationRelations,
      new Set(detectedCoreConsumers),
      paths,
    ).manifest)

    expect(manifest.concepts.filter(({ kind }: { kind: string }) => kind === 'question'))
      .toHaveLength(8)
    expect(manifest.concepts.filter(({ kind }: { kind: string }) => kind === 'option'))
      .toHaveLength(53)
    expect(manifest.concepts.find(({ key }: { key: string }) => key === 'question/form')
      ?.canonicalSource).toBe('packages/classification-core/src/definitions/questions.ts')
    const questionConcepts = manifest.concepts.filter(
      ({ kind }: { kind: string }) => kind === 'question' || kind === 'option',
    )
    expect(questionConcepts).toHaveLength(61)
    expect(questionConcepts.every((concept: {
      canonicalSource: string
      consumers: string[]
      migrations: string[]
      tests: string[]
      validators: string[]
    }) => (
      concept.canonicalSource === 'packages/classification-core/src/definitions/questions.ts'
      && JSON.stringify(concept.validators) === JSON.stringify([
        'packages/classification-core/src/compiler/questions/compile.ts',
        'packages/classification-core/src/compiler/questions/proof.ts',
        'packages/classification-core/src/compiler/questions/source-schema.ts',
      ])
      && JSON.stringify(concept.consumers) === JSON.stringify([
        'packages/classification-core/src/flow/evaluate.ts',
      ])
      && JSON.stringify(concept.tests) === JSON.stringify([
        'packages/classification-core/src/compiler/questions/proof.test.ts',
        'packages/classification-core/src/definitions/questions.test.ts',
        'tools/parity/questions/parity.test.ts',
      ])
      && concept.migrations.length === 0
    ))).toBe(true)
  })

  test('records immutable question identity and filters stale verification', () => {
    const paths = new Set(documentationRelations.flatMap((item) => [
      item.canonicalSource,
      ...item.validators,
      ...item.consumers,
      ...item.tests,
      ...item.migrations,
    ]))
    const questionEvidence = {
      sourceRepository: {
        host: 'github.com',
        owner: 'AnsonHui6040',
        repository: 'ramen-style-today',
      },
      sourceCommit: '1'.repeat(40),
      sourceTreeHash: '2'.repeat(40),
      fixtureManifestPath: 'tools/parity/fixtures/questions/legacy-v1/manifest.json',
      fixtureManifestHash: '3'.repeat(64),
      fixtureSchemaVersion: '1',
      fixtureContentHash: '4'.repeat(64),
      extractorVersion: '1',
      instrumentationHash: '5'.repeat(64),
      sourceHash: '6'.repeat(64),
      semanticHash: '7'.repeat(64),
      verification: {
        assurance: 'parity-verified' as const,
        parityScope: 'legacy-observable-transition-projection' as const,
        fixtureManifestHash: '3'.repeat(64),
        paritySuiteVersion: '1',
        verifiedSemanticHash: '8'.repeat(64),
        implementationSha: '9'.repeat(40),
      },
    }
    const manifest = JSON.parse(buildDocumentation(
      compiled.model,
      documentationRelations,
      new Set(detectedCoreConsumers),
      paths,
      { questionEvidence },
    ).manifest)

    expect(manifest.provenance.questions).toMatchObject({
      sourceRepository: questionEvidence.sourceRepository,
      sourceCommit: questionEvidence.sourceCommit,
      sourceTreeHash: questionEvidence.sourceTreeHash,
      fixtureManifestPath: questionEvidence.fixtureManifestPath,
      fixtureManifestHash: questionEvidence.fixtureManifestHash,
      fixtureContentHash: questionEvidence.fixtureContentHash,
      sourceHash: questionEvidence.sourceHash,
      semanticHash: questionEvidence.semanticHash,
    })
    expect(manifest.provenance.questions).not.toHaveProperty('verification')
  })

  test('rejects missing relations and an unregistered detected consumer', () => {
    const formIndex = documentationRelations.findIndex(
      ({ conceptKey }) => conceptKey === 'question/form',
    )
    const result = buildDocumentation(
      compiled.model,
      documentationRelations.filter((_, index) => index !== formIndex),
      new Set([...detectedCoreConsumers, 'tools/unregistered.ts']),
      new Set(),
    )
    expect(result.diagnostics.map((item) => item.code)).toContain('DOC_RELATION_INVALID')
    expect(result.diagnostics.some((item) => item.entityId === 'question/form')).toBe(true)
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
      new Set(detectedCoreConsumers),
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
      new Set(detectedCoreConsumers),
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
