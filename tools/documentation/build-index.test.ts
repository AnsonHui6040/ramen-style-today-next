import { execFileSync } from 'node:child_process'

import { describe, expect, test } from 'vitest'

import { compileClassification } from '@ramen-style/classification-core/compiler'
import { styleModel } from '@ramen-style/classification-core/generated/style-model'
import {
  buildDocumentation,
  type EligibilityDocumentationEvidence,
  type ScoringDocumentationEvidence,
  type StyleDocumentationEvidence,
} from './build-index.js'
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
const compiledModel = compiled.model
const documentationRelations = createDocumentationRelations(compiledModel)

const persistenceEvidenceBase = {
  origin: 'manually-authored',
  schemaVersion: 1,
  fixtureManifestPath:
    'tools/parity/fixtures/persistence/legacy-unversioned/manifest.json',
  fixtureManifestHash: 'a'.repeat(64),
  verificationScope: 'pure persistence restore and payload contracts',
  legacyLineage: {
    origin: 'legacy-production',
    sourceRepository: {
      host: 'github.com',
      owner: 'AnsonHui6040',
      repository: 'ramen-style-today',
    },
    sourceCommit: 'b'.repeat(40),
    sourceTreeHash: 'c'.repeat(40),
  },
} as const

const styleEvidenceBase = {
  sourceRepository: {
    host: 'github.com',
    owner: 'AnsonHui6040',
    repository: 'ramen-style-today',
  },
  sourceCommit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  sourceTreeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
  fixtureManifestPath: 'tools/parity/fixtures/styles/legacy-v1/manifest.json',
  fixtureManifestHash: 'fa1a4714a77ce70489b56c54b82a812b28cd18dbc31a668a62ae51cc12e9586b',
  fixtureSchemaVersion: '1',
  fixtureCasesHash: 'cd48d42b596e1d7d71757a8cec109f7787d21596a8905a06c505fefbd0f93517',
  fixtureContentHash: 'd33119e4d36a8b37314805dc8e439f724a37bf62b91fd3288a780ad67c2c3028',
  extractorVersion: '1',
  extractorHash: 'e374b19e76fddf2f6d2c736ccdcacd2f04b6c54269d455cb384ca0ddbd957621',
  instrumentationVersion: '1',
  instrumentationHash: '8565602601ef24b9f70ca34d2683a33933e0f8c4522a3374e53290dad567d516',
  seedsHash: 'b405c8866a2909e07201f3003865ff2f296e83a43cc1ca3c6d05f8eb79735f68',
  artifactPath: 'packages/classification-core/src/generated/style-model.ts',
  artifactHash: '46a63367179ce8874b10f2c6fc828a5816460bf463abac9d087ec77d8acfad3e',
  sourceHash: styleModel.metadata.sourceHash,
  semanticHash: styleModel.metadata.semanticHash,
  dataVersion: styleModel.metadata.dataVersion,
  coverage: {
    styles: 18,
    cores: 54,
    subtypes: 270,
    rules: 378,
    bonusCopies: 54,
    conflictCopies: 21,
    exclusionTags: 6,
    copyRoles: 8,
  },
} as const

const completedStyleVerification = {
  assurance: 'parity-verified',
  parityScope: 'legacy-compiled-style-projection',
  fixtureManifestHash: styleEvidenceBase.fixtureManifestHash,
  verifiedSemanticHash: styleEvidenceBase.semanticHash,
  verifiedDataVersion: styleEvidenceBase.dataVersion,
  implementationSha: '9'.repeat(40),
} as const

const scoringEvidenceBase = {
  sourceRepository: {
    host: 'github.com',
    owner: 'AnsonHui6040',
    repository: 'ramen-style-today',
  },
  sourceCommit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  sourceTreeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
  fixtureManifestPath: 'tools/parity/fixtures/scoring/legacy-v1/manifest.json',
  fixtureManifestHash: '8379cbb14588d5ba586bda895e8791edf8cfd98dc3bdffcb4512e6e8fb71101f',
  fixtureSchemaVersion: '1',
  fixtureCasesHash: '7f79b5d9833d354671043f093d2d694614231195ad2fe167dbe348c50718d291',
  fixtureContentHash: '01e59203b0d0519245dc5438c627ff8de62400ca64f9aafa68498f3dcd98fe83',
  extractorVersion: '1',
  extractorHash: '73a2b211ae88e91eaf255ffdac468c311f05f0c7e12ea42fcb6b0715d47b92aa',
  instrumentationVersion: '1',
  instrumentationHash: 'f5369d650f20b9027df8e543a6eb86d4b47340b3ceeb5d23d239bd394ceaa536',
  seedsHash: 'eaa143935ac61e9c622c500991d03cd3dc35c03d1ff9bd4d2c5dd39376f7bb57',
  artifactPath: 'packages/classification-core/src/generated/classification-model.ts',
  artifactHash: '74d211d18d4d005ad2cc95443527e7a2046a5a9a72e624b0dda1c62fe47ae4b4',
  sourceHash: compiledModel.policy.metadata.sourceHash,
  semanticHash: compiledModel.policy.metadata.semanticHash,
  dataVersion: compiledModel.policy.metadata.dataVersion,
  classificationDataVersion: compiledModel.dataVersion,
  paritySuiteVersion: '1',
  modelVersion: compiledModel.policy.metadata.modelVersion,
  questionModelVersion: compiledModel.policy.metadata.questionModelVersion,
  questionSemanticHash: compiledModel.policy.metadata.questionSemanticHash,
  styleModelVersion: compiledModel.policy.metadata.styleModelVersion,
  styleSemanticHash: compiledModel.policy.metadata.styleSemanticHash,
  coverage: {
    styles: 18,
    cores: 54,
    rules: 378,
    bonuses: 18,
    conflicts: 7,
    cases: 26,
    observedRuleTiers: 1155,
  },
} as const satisfies ScoringDocumentationEvidence

const completedScoringVerification = {
  assurance: 'parity-verified',
  parityScope: 'legacy-scoring-result-projection',
  paritySuiteVersion: scoringEvidenceBase.paritySuiteVersion,
  fixtureManifestHash: scoringEvidenceBase.fixtureManifestHash,
  fixtureContentHash: scoringEvidenceBase.fixtureContentHash,
  verifiedSemanticHash: scoringEvidenceBase.semanticHash,
  verifiedDataVersion: scoringEvidenceBase.dataVersion,
  implementationSha: 'e'.repeat(40),
} as const

const eligibilityEvidenceBase = {
  sourceRepository: {
    host: 'github.com',
    owner: 'AnsonHui6040',
    repository: 'ramen-style-today',
  },
  sourceCommit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  sourceTreeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
  fixtureManifestPath: 'tools/parity/fixtures/eligibility/legacy-v1/manifest.json',
  fixtureManifestHash: 'fb189722968020fb0aa8eb91674a94f5ee0448d910a786cd9021cb216e06706d',
  fixtureSchemaVersion: '1',
  fixtureContentHash: 'b96d59285f6725dec5da2dda77776fbf877a5258b8ae5ee821fb5ca5618de1c9',
  seedsHash: 'a'.repeat(64),
  extractorHash: 'b'.repeat(64),
  sourceHashes: { 'src/App.tsx': 'c'.repeat(64) },
  semanticHash: compiledModel.eligibilityPolicy.metadata.semanticHash,
  dataVersion: compiledModel.eligibilityPolicy.metadata.dataVersion,
  classificationDataVersion: compiledModel.dataVersion,
  paritySuiteVersion: '1',
  coverage: {
    exclusionOptions: 9,
    activeBlockingTags: 6,
    inactiveBlockingTags: 6,
    primaryBlockedCases: 11,
    alternativeBlockedCases: 7,
    allPrimaryBlockedCases: 3,
    multiExclusionCases: 2,
    noOpOptionCases: 4,
  },
} as const satisfies EligibilityDocumentationEvidence

const completedEligibilityVerification = {
  assurance: 'parity-verified',
  parityScope: 'legacy-eligibility-result-projection',
  paritySuiteVersion: '1',
  fixtureManifestHash: eligibilityEvidenceBase.fixtureManifestHash,
  fixtureContentHash: eligibilityEvidenceBase.fixtureContentHash,
  verifiedSemanticHash: eligibilityEvidenceBase.semanticHash,
  verifiedDataVersion: eligibilityEvidenceBase.dataVersion,
  verifiedClassificationDataVersion: eligibilityEvidenceBase.classificationDataVersion,
  implementationSha: 'f'.repeat(40),
} as const

function allRelationPaths() {
  return new Set(documentationRelations.flatMap((relation) => {
    const expanded = relation as typeof relation & {
      evidence?: readonly string[]
      generatedArtifacts?: readonly string[]
      messageSources?: readonly string[]
      provenanceSources?: readonly string[]
    }
    return [
      relation.canonicalSource,
      ...relation.validators,
      ...relation.consumers,
      ...relation.tests,
      ...relation.migrations,
      ...(expanded.evidence ?? []),
      ...(expanded.generatedArtifacts ?? []),
      ...(expanded.messageSources ?? []),
      ...(expanded.provenanceSources ?? []),
    ]
  }))
}

function buildStyleDocumentation(
  styleEvidence: StyleDocumentationEvidence = styleEvidenceBase,
) {
  return buildDocumentation(
    compiledModel,
    documentationRelations,
    new Set([
      'packages/classification-core/src/classification-model.ts',
      'packages/classification-core/src/index.ts',
      'packages/classification-core/src/scoring/score.ts',
      'packages/classification-core/src/style-model.ts',
      'packages/classification-core/src/flow/evaluate.ts',
      'tools/validation/validate-classification.ts',
    ]),
    allRelationPaths(),
    {
      persistenceEvidence: {
        ...persistenceEvidenceBase,
        assurance: 'contract-verified',
        implementationSha: 'd'.repeat(40),
      },
      styleEvidence,
      detectedConsumerRegistry: [
        'packages/classification-core/src/classification-model.ts',
        'packages/classification-core/src/index.ts',
        'packages/classification-core/src/scoring/score.ts',
        'packages/classification-core/src/style-model.ts',
        'packages/classification-core/src/flow/evaluate.ts',
        'tools/validation/validate-classification.ts',
      ],
    },
  )
}

function deterministicSnapshot(locale: string) {
  const script = String.raw`
    import {
      classificationDefinition,
      compileClassification,
      DiagnosticCollector,
      stableJson,
    } from '@ramen-style/classification-core/compiler'
    import { buildDocumentation } from './tools/documentation/build-index.ts'
    import { createDocumentationRelations } from './tools/documentation/relations.ts'

    const sourceFile = 'packages/classification-core/src/definitions/classification.ts'
    const compiled = compileClassification(classificationDefinition, sourceFile)
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

    const relations = [...createDocumentationRelations(compiled.model)].reverse()
    const relationPaths = relations.flatMap((relation) => [
      relation.canonicalSource,
      ...(relation.provenanceSources ?? []),
      ...relation.validators,
      ...relation.consumers,
      ...relation.tests,
      ...relation.migrations,
      ...(relation.generatedArtifacts ?? []),
      ...(relation.messageSources ?? []),
      ...(relation.evidence ?? []),
    ])
    const documentation = buildDocumentation(
      compiled.model,
      relations,
      new Set(relations.flatMap((relation) => relation.consumers)),
      new Set([
        sourceFile,
        'packages/y-demo.ts',
        'packages/j-demo.ts',
        ...relationPaths,
      ]),
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
      maxBuffer: 16 * 1024 * 1024,
    },
  )
}

describe('classification documentation index', () => {
  const detectedCoreConsumers = [
    'packages/classification-core/src/classification-model.ts',
    'packages/classification-core/src/index.ts',
    'packages/classification-core/src/scoring/score.ts',
    'packages/classification-core/src/eligibility/evaluate.ts',
    'packages/classification-core/src/style-model.ts',
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
  }, 30_000)

  test('renders deterministic JSON and Markdown for every concept', () => {
    const paths = allRelationPaths()
    const result = buildDocumentation(
      compiled.model,
      documentationRelations,
      new Set(detectedCoreConsumers),
      paths,
    )

    expect(result.diagnostics).toEqual([])
    expect(result.markdown).toContain('Production question ownership')
    expect(result.markdown).toContain('Eligibility assurance: `compiler-validated`')
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
    const paths = allRelationPaths()
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
    expect(manifest.provenance.styles.assurance).toBe('compiler-validated')
    expect(manifest.provenance.scoringPolicy.assurance).toBe('compiler-validated')
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

  test('renders truthful in-progress persistence provenance and readiness', () => {
    const paths = allRelationPaths()
    const options = {
      persistenceEvidence: {
        ...persistenceEvidenceBase,
        assurance: 'structurally-validated',
      },
    } as Parameters<typeof buildDocumentation>[4]
    const built = buildDocumentation(
      compiled.model,
      documentationRelations,
      new Set(detectedCoreConsumers),
      paths,
      options,
    )
    const manifest = JSON.parse(built.manifest)

    expect(manifest.persistence).toEqual({
      ...persistenceEvidenceBase,
      assurance: 'structurally-validated',
    })
    expect(manifest.persistence).not.toHaveProperty('implementationSha')
    expect(built.markdown).toContain('Persistence assurance: `structurally-validated`')
    expect(built.markdown).not.toContain('Persistence implementation SHA:')
    expect(manifest.readiness).toEqual({
      status: 'migration-only',
      blockers: [
        'persistence-adapter-not-integrated',
        'persisted-data-cutover-incomplete',
        'styles-not-production-verified',
        'scoring-not-production-verified',
        'runtime-cutover-incomplete',
      ],
    })
  })

  test('renders contract verification only from completed persistence evidence', () => {
    const paths = allRelationPaths()
    const options = {
      persistenceEvidence: {
        ...persistenceEvidenceBase,
        assurance: 'contract-verified',
        implementationSha: 'd'.repeat(40),
      },
    } as Parameters<typeof buildDocumentation>[4]
    const built = buildDocumentation(
      compiled.model,
      documentationRelations,
      new Set(detectedCoreConsumers),
      paths,
      options,
    )
    const manifest = JSON.parse(built.manifest)

    expect(manifest.persistence).toEqual({
      ...persistenceEvidenceBase,
      assurance: 'contract-verified',
      implementationSha: 'd'.repeat(40),
    })
    expect(built.markdown).toContain('Persistence assurance: `contract-verified`')
    expect(built.markdown).toContain(
      `Persistence implementation SHA: \`${'d'.repeat(40)}\``,
    )
  })

  test('lists every production question and option with canonical owners', () => {
    const paths = allRelationPaths()
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
    const paths = allRelationPaths()
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

  test('omits verification for a different fixture manifest at the current semantic hash', () => {
    const paths = allRelationPaths()
    const semanticHash = '7'.repeat(64)
    const fixtureManifestHash = '3'.repeat(64)
    const manifest = JSON.parse(buildDocumentation(
      compiled.model,
      documentationRelations,
      new Set(detectedCoreConsumers),
      paths,
      {
        questionEvidence: {
          sourceRepository: {
            host: 'github.com',
            owner: 'AnsonHui6040',
            repository: 'ramen-style-today',
          },
          sourceCommit: '1'.repeat(40),
          sourceTreeHash: '2'.repeat(40),
          fixtureManifestPath: 'tools/parity/fixtures/questions/legacy-v1/manifest.json',
          fixtureManifestHash,
          fixtureSchemaVersion: '1',
          fixtureContentHash: '4'.repeat(64),
          extractorVersion: '1',
          instrumentationHash: '5'.repeat(64),
          sourceHash: '6'.repeat(64),
          semanticHash,
          verification: {
            assurance: 'parity-verified',
            parityScope: 'legacy-observable-transition-projection',
            fixtureManifestHash: '8'.repeat(64),
            paritySuiteVersion: '1',
            verifiedSemanticHash: semanticHash,
            implementationSha: '9'.repeat(40),
          },
        },
      },
    ).manifest)

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
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      message: 'Detected core consumer is not registered: tools/unregistered.ts',
    }))
  })

  test('rejects duplicate and unknown relation keys', () => {
    const first = documentationRelations[0]!
    const paths = allRelationPaths()
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

  test('maps the exact compiled style inventory without introducing concept kinds', () => {
    const built = buildStyleDocumentation()
    expect(built.diagnostics).toEqual([])
    const manifest = JSON.parse(built.manifest)
    const counts = Object.fromEntries([
      'question',
      'option',
      'style',
      'intensity',
      'noodle',
      'policy',
    ].map((kind) => [
      kind,
      manifest.concepts.filter((concept: { kind: string }) => concept.kind === kind).length,
    ]))
    expect(counts).toEqual({
      question: 8,
      option: 53,
      style: 18,
      intensity: 54,
      noodle: 270,
      policy: 2,
    })
    expect(manifest.concepts).toHaveLength(405)
    expect(manifest.concepts.some(({ kind }: { kind: string }) => (
      ['rule', 'adjustment', 'bonus', 'conflict'].includes(kind)
    ))).toBe(false)
  })

  test('records exact style, core, and subtype relation evidence from compiled provenance', () => {
    const manifest = JSON.parse(buildStyleDocumentation().manifest)
    const byKey = new Map(manifest.concepts.map((concept: { key: string }) => [
      concept.key,
      concept,
    ]))
    const style = byKey.get('style/shoyu-chintan') as Record<string, unknown>
    const core = byKey.get('intensity/shoyu-chintan:clean') as Record<string, unknown>
    const subtype = byKey.get(
      'noodle/shoyu-chintan:clean:thin-straight',
    ) as Record<string, unknown>
    const definition = 'packages/classification-core/src/definitions/styles/shoyu-chintan.ts'
    const taxonomy = 'packages/classification-core/src/definitions/styles/taxonomy.ts'
    const generated = ['packages/classification-core/src/generated/style-model.ts']

    expect(style).toMatchObject({
      canonicalSource: definition,
      provenanceSources: [definition],
      generatedArtifacts: generated,
      messageSources: [definition],
      evidence: [
        'tools/parity/fixtures/styles/legacy-v1/manifest.json',
        'tools/parity/styles/parity.ts',
        'tools/parity/styles/verify-fixtures.ts',
      ],
    })
    expect(core).toMatchObject({
      canonicalSource: definition,
      provenanceSources: [definition, taxonomy],
      generatedArtifacts: generated,
      messageSources: [taxonomy],
    })
    expect(subtype).toMatchObject({
      canonicalSource: definition,
      provenanceSources: [definition, taxonomy],
      generatedArtifacts: generated,
      messageSources: [taxonomy],
    })
    expect(style.consumers).toEqual([
      'packages/classification-core/src/index.ts',
      'packages/classification-core/src/style-model.ts',
      'tools/validation/validate-classification.ts',
    ])
    expect(style.validators).toEqual([
      'packages/classification-core/src/compiler/styles/compile.ts',
      'packages/classification-core/src/compiler/styles/proof.ts',
      'packages/classification-core/src/compiler/styles/source-schema.ts',
    ])
    expect(style.tests).toContain('packages/classification-core/src/definitions/styles/definitions.test.ts')
    expect(style.tests).toContain('tools/parity/styles/parity.test.ts')
  })

  test.each([
    ['missing evidence', (relation: typeof documentationRelations[number]) => ({
      ...relation,
      evidence: [],
    })],
    ['extra generated artifact', (relation: typeof documentationRelations[number]) => ({
      ...relation,
      generatedArtifacts: [...(relation.generatedArtifacts ?? []), 'tools/unapproved.ts'],
    })],
    ['duplicate compiler test', (relation: typeof documentationRelations[number]) => ({
      ...relation,
      tests: [...relation.tests, relation.tests[0]!],
    })],
  ])('rejects a style relation with %s', (_label, mutate) => {
    const conceptKey = 'style/shoyu-chintan'
    const index = documentationRelations.findIndex((relation) => (
      relation.conceptKey === conceptKey
    ))
    const relation = documentationRelations[index]!
    const relations = [
      ...documentationRelations.slice(0, index),
      mutate(relation),
      ...documentationRelations.slice(index + 1),
    ]
    const result = buildDocumentation(
      compiledModel,
      relations,
      new Set(),
      new Set([...allRelationPaths(), 'tools/unapproved.ts']),
      { detectedConsumerRegistry: [] },
    )
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'DOC_RELATION_INVALID',
      entityId: conceptKey,
      message: `Compiled style documentation relation drifted for ${conceptKey}`,
    }))
  })

  test('rejects inventory records that do not map one-to-one to compiled style records', () => {
    const missingCompiledStyle = {
      ...compiled.model,
      styleModel: {
        ...compiled.model.styleModel,
        styles: compiled.model.styleModel.styles.slice(1),
      },
    }
    const missingResult = buildDocumentation(
      missingCompiledStyle,
      documentationRelations,
      new Set(),
      allRelationPaths(),
    )
    expect(missingResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'DOC_RELATION_INVALID',
      entityId: `style/${compiled.model.styleModel.styles[0]!.id}`,
    }))

    const duplicatedInventory = {
      ...compiled.model,
      inventory: [...compiled.model.inventory, compiled.model.inventory[0]!],
    }
    const duplicateResult = buildDocumentation(
      duplicatedInventory,
      documentationRelations,
      new Set(),
      allRelationPaths(),
    )
    expect(duplicateResult.diagnostics).toContainEqual(expect.objectContaining({
      code: 'DOC_RELATION_INVALID',
      entityId: compiled.model.inventory[0]!.key,
    }))
  })

  test('rejects duplicate compiled style records', () => {
    const style = compiled.model.styleModel.styles[0]!
    const duplicateModel = {
      ...compiled.model,
      styleModel: {
        ...compiled.model.styleModel,
        styles: [...compiled.model.styleModel.styles, style],
      },
    }
    const result = buildDocumentation(
      duplicateModel,
      documentationRelations,
      new Set(),
      allRelationPaths(),
    )
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'DOC_RELATION_INVALID',
      entityId: `style/${style.id}`,
      message: `Duplicate compiled style record style/${style.id}`,
    }))
  })

  test('rejects duplicate compiled core records', () => {
    const style = compiled.model.styleModel.styles[0]!
    const core = style.cores[0]!
    const duplicateModel = {
      ...compiled.model,
      styleModel: {
        ...compiled.model.styleModel,
        styles: [
          { ...style, cores: [...style.cores, core] },
          ...compiled.model.styleModel.styles.slice(1),
        ],
      },
    }
    const result = buildDocumentation(
      duplicateModel,
      documentationRelations,
      new Set(),
      allRelationPaths(),
    )
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'DOC_RELATION_INVALID',
      entityId: `intensity/${core.id}`,
      message: `Duplicate compiled style record intensity/${core.id}`,
    }))
  })

  test('rejects duplicate compiled subtype records', () => {
    const style = compiled.model.styleModel.styles[0]!
    const core = style.cores[0]!
    const subtype = core.subtypes[0]!
    const duplicateModel = {
      ...compiled.model,
      styleModel: {
        ...compiled.model.styleModel,
        styles: [
          {
            ...style,
            cores: [
              { ...core, subtypes: [...core.subtypes, subtype] },
              ...style.cores.slice(1),
            ],
          },
          ...compiled.model.styleModel.styles.slice(1),
        ],
      },
    }
    const result = buildDocumentation(
      duplicateModel,
      documentationRelations,
      new Set(),
      allRelationPaths(),
    )
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'DOC_RELATION_INVALID',
      entityId: `noodle/${subtype.id}`,
      message: `Duplicate compiled style record noodle/${subtype.id}`,
    }))
  })

  test('keeps compiler-validated style evidence and all five blockers before completion', () => {
    const manifest = JSON.parse(buildStyleDocumentation().manifest)
    expect(manifest.provenance.styles).toMatchObject({
      origin: 'legacy-production',
      assurance: 'compiler-validated',
      parityScope: 'legacy-compiled-style-projection',
      fixtureManifestHash: styleEvidenceBase.fixtureManifestHash,
      fixtureContentHash: styleEvidenceBase.fixtureContentHash,
      instrumentationVersion: styleEvidenceBase.instrumentationVersion,
      sourceHash: styleEvidenceBase.sourceHash,
      semanticHash: styleEvidenceBase.semanticHash,
      dataVersion: styleEvidenceBase.dataVersion,
      artifactHash: styleEvidenceBase.artifactHash,
      coverage: styleEvidenceBase.coverage,
    })
    expect(manifest.provenance.styles).not.toHaveProperty('implementationSha')
    expect(manifest.provenance.styles).not.toHaveProperty('verification')
    expect(manifest.readiness).toEqual({
      status: 'migration-only',
      blockers: [
        'persistence-adapter-not-integrated',
        'persisted-data-cutover-incomplete',
        'styles-not-production-verified',
        'scoring-not-production-verified',
        'runtime-cutover-incomplete',
      ],
    })
  })

  test('uses exact candidate evidence to remove only the style blocker in-memory', () => {
    const manifest = JSON.parse(buildStyleDocumentation({
      ...styleEvidenceBase,
      verification: completedStyleVerification,
    }).manifest)
    expect(manifest.provenance.styles.assurance).toBe('parity-verified')
    expect(manifest.provenance.styles.verification).toEqual(completedStyleVerification)
    expect(manifest.persistence).toEqual({
      ...persistenceEvidenceBase,
      assurance: 'contract-verified',
      implementationSha: 'd'.repeat(40),
    })
    expect(manifest.provenance.scoringPolicy).toEqual({
      origin: 'legacy-production',
      assurance: 'compiler-validated',
      parityScope: 'legacy-scoring-result-projection',
    })
    expect(manifest.readiness).toEqual({
      status: 'migration-only',
      blockers: [
        'persistence-adapter-not-integrated',
        'persisted-data-cutover-incomplete',
        'scoring-not-production-verified',
        'runtime-cutover-incomplete',
      ],
    })
  })

  test.each([
    ['wrong fixture manifest', {
      ...completedStyleVerification,
      fixtureManifestHash: '8'.repeat(64),
    }],
    ['wrong semantic hash', {
      ...completedStyleVerification,
      verifiedSemanticHash: '8'.repeat(64),
    }],
    ['wrong data version', {
      ...completedStyleVerification,
      verifiedDataVersion: '8'.repeat(64),
    }],
  ])('does not upgrade style assurance for %s', (_label, verification) => {
    const manifest = JSON.parse(buildStyleDocumentation({
      ...styleEvidenceBase,
      verification,
    }).manifest)
    expect(manifest.provenance.styles.assurance).toBe('compiler-validated')
    expect(manifest.provenance.styles).not.toHaveProperty('verification')
    expect(manifest.readiness.blockers).toContain('styles-not-production-verified')
  })

  test('rejects style evidence whose coverage does not match the compiled model', () => {
    const built = buildStyleDocumentation({
      ...styleEvidenceBase,
      coverage: { ...styleEvidenceBase.coverage, rules: 377 },
    })
    expect(built.diagnostics).toContainEqual(expect.objectContaining({
      code: 'DOC_RELATION_INVALID',
      message: 'Style documentation evidence does not match the compiled model',
    }))
  })

  test('documents the scoring policy relation and truth-bound candidate evidence', () => {
    const policyRelation = documentationRelations.find(({ conceptKey }) => (
      conceptKey === 'policy/default'
    ))
    expect(policyRelation).toMatchObject({
      canonicalSource: 'packages/classification-core/src/definitions/policies.ts',
      generatedArtifacts: [
        'packages/classification-core/src/generated/classification-model.ts',
      ],
    })
    expect(policyRelation?.validators).toContain(
      'packages/classification-core/src/compiler/scoring-policy/compile.ts',
    )
    expect(policyRelation?.consumers).toContain(
      'packages/classification-core/src/scoring/score.ts',
    )
    expect(policyRelation?.tests).toContain('tools/parity/scoring/parity.test.ts')
    expect(policyRelation?.evidence).toContain(
      'tools/parity/fixtures/scoring/legacy-v1/manifest.json',
    )

    const built = buildDocumentation(
      compiledModel,
      documentationRelations,
      new Set(detectedCoreConsumers),
      allRelationPaths(),
      {
        persistenceEvidence: {
          ...persistenceEvidenceBase,
          assurance: 'contract-verified',
          implementationSha: 'd'.repeat(40),
        },
        styleEvidence: {
          ...styleEvidenceBase,
          verification: completedStyleVerification,
        },
        scoringEvidence: scoringEvidenceBase,
        detectedConsumerRegistry: detectedCoreConsumers,
      },
    )
    expect(built.diagnostics).toEqual([])
    const manifest = JSON.parse(built.manifest)
    expect(manifest.provenance.scoringPolicy).toMatchObject({
      origin: 'legacy-production',
      assurance: 'compiler-validated',
      parityScope: 'legacy-scoring-result-projection',
      fixtureManifestHash: scoringEvidenceBase.fixtureManifestHash,
      artifactHash: scoringEvidenceBase.artifactHash,
      semanticHash: scoringEvidenceBase.semanticHash,
      dataVersion: scoringEvidenceBase.dataVersion,
    })
    expect(manifest.provenance.scoringPolicy).not.toHaveProperty('verification')
    expect(manifest.readiness.blockers).toEqual([
      'persistence-adapter-not-integrated',
      'persisted-data-cutover-incomplete',
      'scoring-not-production-verified',
      'runtime-cutover-incomplete',
    ])
  })

  test('rejects scoring evidence not bound to the compiled policy model', () => {
    const built = buildDocumentation(
      compiledModel,
      documentationRelations,
      new Set(detectedCoreConsumers),
      allRelationPaths(),
      {
        scoringEvidence: {
          ...scoringEvidenceBase,
          semanticHash: '0'.repeat(64),
        },
        detectedConsumerRegistry: detectedCoreConsumers,
      },
    )
    expect(built.diagnostics).toContainEqual(expect.objectContaining({
      code: 'DOC_RELATION_INVALID',
      message: 'Scoring documentation evidence does not match the compiled model',
    }))
  })

  test('upgrades only exact fully-bound scoring verification and removes one blocker', () => {
    const options = {
      persistenceEvidence: {
        ...persistenceEvidenceBase,
        assurance: 'contract-verified' as const,
        implementationSha: 'd'.repeat(40),
      },
      styleEvidence: {
        ...styleEvidenceBase,
        verification: completedStyleVerification,
      },
      scoringEvidence: {
        ...scoringEvidenceBase,
        verification: completedScoringVerification,
      },
      detectedConsumerRegistry: detectedCoreConsumers,
    }
    const manifest = JSON.parse(buildDocumentation(
      compiledModel,
      documentationRelations,
      new Set(detectedCoreConsumers),
      allRelationPaths(),
      options,
    ).manifest)
    expect(manifest.provenance.scoringPolicy.assurance).toBe('parity-verified')
    expect(manifest.provenance.scoringPolicy.verification)
      .toEqual(completedScoringVerification)
    expect(manifest.readiness.blockers).toEqual([
      'persistence-adapter-not-integrated',
      'persisted-data-cutover-incomplete',
      'runtime-cutover-incomplete',
    ])

    for (const verification of [
      { ...completedScoringVerification, paritySuiteVersion: '2' },
      { ...completedScoringVerification, fixtureContentHash: '0'.repeat(64) },
      { ...completedScoringVerification, verifiedSemanticHash: '0'.repeat(64) },
      { ...completedScoringVerification, verifiedDataVersion: '0'.repeat(64) },
    ]) {
      const drifted = JSON.parse(buildDocumentation(
        compiledModel,
        documentationRelations,
        new Set(detectedCoreConsumers),
        allRelationPaths(),
        {
          ...options,
          scoringEvidence: { ...scoringEvidenceBase, verification },
        },
      ).manifest)
      expect(drifted.provenance.scoringPolicy.assurance).toBe('compiler-validated')
      expect(drifted.provenance.scoringPolicy).not.toHaveProperty('verification')
      expect(drifted.readiness.blockers).toContain('scoring-not-production-verified')
    }
  })

  test('renders the eligibility assurance transition in the generated index', () => {
    const compilerValidated = buildDocumentation(
      compiledModel,
      documentationRelations,
      new Set(detectedCoreConsumers),
      allRelationPaths(),
      { eligibilityEvidence: eligibilityEvidenceBase },
    )
    const parityVerified = buildDocumentation(
      compiledModel,
      documentationRelations,
      new Set(detectedCoreConsumers),
      allRelationPaths(),
      {
        eligibilityEvidence: {
          ...eligibilityEvidenceBase,
          verification: completedEligibilityVerification,
        },
      },
    )

    expect(compilerValidated.markdown)
      .toContain('Eligibility assurance: `compiler-validated`')
    expect(parityVerified.markdown)
      .toContain('Eligibility assurance: `parity-verified`')
    expect(parityVerified.markdown).toContain(
      'Eligibility parity scope: `legacy-eligibility-result-projection`',
    )
    expect(parityVerified.markdown).not.toBe(compilerValidated.markdown)
  })
})
