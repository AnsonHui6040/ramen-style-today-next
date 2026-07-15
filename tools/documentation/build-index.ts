import {
  compareCodePoints,
  DiagnosticCollector,
  stableJson,
  type ClassificationModel,
  type Diagnostic,
} from '@ramen-style/classification-core/compiler'
import type { DocumentationRelation } from './relations.js'

const persistenceReadinessBlockers = [
  'persistence-adapter-not-integrated',
  'persisted-data-cutover-incomplete',
  'styles-not-production-verified',
  'scoring-not-production-verified',
  'runtime-cutover-incomplete',
] as const

type PersistenceDocumentationEvidenceBase = {
  origin: 'manually-authored'
  schemaVersion: 1
  fixtureManifestPath:
    'tools/parity/fixtures/persistence/legacy-unversioned/manifest.json'
  fixtureManifestHash: string
  verificationScope: 'pure persistence restore and payload contracts'
  legacyLineage: {
    origin: 'legacy-production'
    sourceRepository: {
      host: 'github.com'
      owner: 'AnsonHui6040'
      repository: 'ramen-style-today'
    }
    sourceCommit: string
    sourceTreeHash: string
  }
}

export type PersistenceDocumentationEvidence = PersistenceDocumentationEvidenceBase & (
  | {
      assurance: 'structurally-validated'
      implementationSha?: never
    }
  | {
      assurance: 'contract-verified'
      implementationSha: string
    }
)

export interface DocumentationBuild {
  manifest: string
  markdown: string
  diagnostics: readonly Diagnostic[]
}

export interface QuestionParityVerification {
  assurance: 'parity-verified'
  parityScope: 'legacy-observable-transition-projection'
  fixtureManifestHash: string
  paritySuiteVersion: string
  verifiedSemanticHash: string
  implementationSha: string
}

export interface QuestionDocumentationEvidence {
  sourceRepository: {
    host: string
    owner: string
    repository: string
  }
  sourceCommit: string
  sourceTreeHash: string
  fixtureManifestPath: string
  fixtureManifestHash: string
  fixtureSchemaVersion: string
  fixtureContentHash: string
  extractorVersion: string
  instrumentationHash: string
  sourceHash: string
  semanticHash: string
  verification?: QuestionParityVerification
}

export interface DocumentationBuildOptions {
  questionEvidence?: QuestionDocumentationEvidence
  persistenceEvidence?: PersistenceDocumentationEvidence
  detectedConsumerRegistry?: readonly string[]
}

function isRepositoryPath(value: string) {
  return !value.startsWith('/')
    && !value.includes('\\')
    && !/^[A-Za-z]:/.test(value)
    && value.split('/').every((segment) => segment !== '.' && segment !== '..' && segment !== '')
}

export function buildDocumentation(
  model: ClassificationModel,
  relations: readonly DocumentationRelation[],
  detectedConsumers: ReadonlySet<string>,
  existingPaths: ReadonlySet<string>,
  options: DocumentationBuildOptions = {},
): DocumentationBuild {
  const collector = new DiagnosticCollector()
  const relationByKey = new Map<string, DocumentationRelation>()
  const inventoryByKey = new Map(model.inventory.map((item) => [item.key, item]))

  relations.forEach((relation, index) => {
    if (relationByKey.has(relation.conceptKey)) {
      collector.error({
        code: 'DOC_RELATION_INVALID',
        sourceFile: 'tools/documentation/relations.ts',
        path: `/relations/${index}/conceptKey`,
        entityId: relation.conceptKey,
        message: `Duplicate documentation relation ${relation.conceptKey}`,
      })
    } else {
      relationByKey.set(relation.conceptKey, relation)
    }
  })

  for (const concept of model.inventory) {
    if (!relationByKey.has(concept.key)) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: '/relations',
      entityId: concept.key,
      message: `Missing documentation relation for ${concept.key}`,
    })
  }

  relations.forEach((relation, relationIndex) => {
    const concept = inventoryByKey.get(relation.conceptKey)
    if (!concept) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: `/relations/${relationIndex}/conceptKey`,
      entityId: relation.conceptKey,
      message: `Unknown concept ${relation.conceptKey}`,
    })
    if (concept && relation.canonicalSource !== concept.sourceFile) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: `/relations/${relationIndex}/canonicalSource`,
      entityId: relation.conceptKey,
      message: `Canonical source does not match compiled inventory for ${relation.conceptKey}`,
    })
    if (relation.validators.length === 0) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: `/relations/${relationIndex}/validators`,
      entityId: relation.conceptKey,
      message: `No validator registered for ${relation.conceptKey}`,
    })
    if (relation.tests.length === 0) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: `/relations/${relationIndex}/tests`,
      entityId: relation.conceptKey,
      message: `No test registered for ${relation.conceptKey}`,
    })

    const declaredPaths = [
      ['canonicalSource', relation.canonicalSource] as const,
      ...relation.validators.map((path) => ['validators', path] as const),
      ...relation.consumers.map((path) => ['consumers', path] as const),
      ...relation.tests.map((path) => ['tests', path] as const),
      ...relation.migrations.map((path) => ['migrations', path] as const),
    ]
    for (const [field, path] of declaredPaths) {
      if (!isRepositoryPath(path)) collector.error({
        code: 'DOC_RELATION_INVALID',
        sourceFile: 'tools/documentation/relations.ts',
        path: `/relations/${relationIndex}/${field}`,
        entityId: relation.conceptKey,
        message: `Registered path is not repository-relative POSIX: ${path}`,
      })
      if (!existingPaths.has(path)) collector.error({
        code: 'DOC_RELATION_INVALID',
        sourceFile: 'tools/documentation/relations.ts',
        path: `/relations/${relationIndex}/${field}`,
        entityId: relation.conceptKey,
        message: `Registered path does not exist: ${path}`,
      })
    }
  })

  const registeredConsumers = new Set(
    options.detectedConsumerRegistry ?? relations.flatMap((item) => item.consumers),
  )
  for (const consumer of detectedConsumers) {
    if (!registeredConsumers.has(consumer)) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: '/consumers',
      message: `Detected core consumer is not registered: ${consumer}`,
    })
  }
  for (const consumer of registeredConsumers) {
    if (!detectedConsumers.has(consumer)) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: '/consumers',
      message: `Registered core consumer no longer imports the package: ${consumer}`,
    })
  }

  const sorted = (values: readonly string[]) => [...new Set(values)].sort(compareCodePoints)
  const concepts = model.inventory
    .map((concept) => {
      const relation = relationByKey.get(concept.key)
      return {
        key: concept.key,
        kind: concept.kind,
        id: concept.id,
        canonicalSource: relation?.canonicalSource ?? concept.sourceFile,
        validators: sorted(relation?.validators ?? []),
        consumers: sorted(relation?.consumers ?? []),
        migrations: sorted(relation?.migrations ?? []),
        generatedOwners: [
          'docs/classification/index.md',
          'docs/classification/manifest.json',
        ],
        messageIds: sorted(concept.messageIds),
        tests: sorted(relation?.tests ?? []),
      }
    })
    .sort((left, right) => compareCodePoints(left.key, right.key))

  const questionOrigin = model.provenance.questions.origin
  const questionEvidence = options.questionEvidence
  const matchingVerification = questionEvidence?.verification
    && questionEvidence.verification.verifiedSemanticHash === questionEvidence.semanticHash
    && questionEvidence.verification.fixtureManifestHash === questionEvidence.fixtureManifestHash
    ? questionEvidence.verification
    : undefined
  const questionProvenance = {
    origin: questionOrigin,
    assurance: questionOrigin === 'legacy-production'
      ? 'compiler-validated'
      : 'structurally-validated',
    ...(questionOrigin === 'legacy-production'
      ? { parityScope: 'legacy-observable-transition-projection' }
      : {}),
    ...(questionEvidence
      ? {
          sourceRepository: questionEvidence.sourceRepository,
          sourceCommit: questionEvidence.sourceCommit,
          sourceTreeHash: questionEvidence.sourceTreeHash,
          fixtureManifestPath: questionEvidence.fixtureManifestPath,
          fixtureManifestHash: questionEvidence.fixtureManifestHash,
          fixtureSchemaVersion: questionEvidence.fixtureSchemaVersion,
          fixtureContentHash: questionEvidence.fixtureContentHash,
          extractorVersion: questionEvidence.extractorVersion,
          instrumentationHash: questionEvidence.instrumentationHash,
          sourceHash: questionEvidence.sourceHash,
          semanticHash: questionEvidence.semanticHash,
          ...(matchingVerification ? { verification: matchingVerification } : {}),
        }
      : {}),
  }
  const provenance = {
    questions: questionProvenance,
    styles: {
      origin: model.provenance.styles.origin,
      assurance: 'structurally-validated',
    },
    scoringPolicy: {
      origin: model.provenance.scoringPolicy.origin,
      assurance: 'structurally-validated',
    },
  }
  const persistence = options.persistenceEvidence
  const readinessBlockers = persistence
    ? [...persistenceReadinessBlockers]
    : [
        ...(model.provenance.styles.origin === 'synthetic' ? ['styles-not-migrated'] : []),
        ...(model.provenance.scoringPolicy.origin === 'synthetic'
          ? ['scoring-not-migrated']
          : []),
        'persistence-not-migrated',
        'runtime-not-cut-over',
      ]
  const readiness = {
    status: questionOrigin === 'legacy-production' ? 'migration-only' : 'development',
    blockers: readinessBlockers,
  }

  const cell = (values: readonly string[]) => values.length
    ? values.map((value) => `\`${value.replaceAll('|', '\\|')}\``).join('<br>')
    : '—'
  const rows = concepts.map((concept) => [
    `| \`${concept.key}\``,
    `\`${concept.canonicalSource}\``,
    cell(concept.validators),
    cell(concept.consumers),
    cell(concept.migrations),
    cell(concept.generatedOwners),
    cell(concept.messageIds),
    `${cell(concept.tests)} |`,
  ].join(' | '))
  const persistenceSummary = persistence
    ? [
        '## Persistence',
        '',
        `Persistence assurance: \`${persistence.assurance}\`<br>`,
        `Persistence schema version: \`${persistence.schemaVersion}\`<br>`,
        ...(persistence.assurance === 'contract-verified'
          ? [`Persistence implementation SHA: \`${persistence.implementationSha}\`<br>`]
          : []),
        `Fixture manifest: \`${persistence.fixtureManifestPath}\`<br>`,
        `Fixture manifest hash: \`${persistence.fixtureManifestHash}\`<br>`,
        `Verification scope: \`${persistence.verificationScope}\`<br>`,
        `Legacy source: \`${persistence.legacyLineage.sourceRepository.host}/${persistence.legacyLineage.sourceRepository.owner}/${persistence.legacyLineage.sourceRepository.repository}@${persistence.legacyLineage.sourceCommit}\`<br>`,
        `Legacy source tree: \`${persistence.legacyLineage.sourceTreeHash}\`<br>`,
        `Readiness: \`${readiness.status}\`<br>`,
        `Readiness blockers: ${cell(readiness.blockers)}`,
        '',
      ]
    : []
  const markdown = [
    '# Classification Index',
    '',
    model.provenance.questions.origin === 'legacy-production'
      ? '> Production question ownership; style and scoring inventory remains synthetic.'
      : '> Synthetic inventory — not production classification data.',
    '',
    `Model version: \`${model.modelVersion}\`<br>`,
    `Data version: \`${model.dataVersion}\``,
    '',
    ...persistenceSummary,
    '| Concept | Canonical source | Validators | Consumers | Migrations | Generated owners | Messages | Tests |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')

  return {
    manifest: stableJson({
      schemaVersion: 1,
      synthetic: Object.values(model.provenance).every(({ origin }) => origin === 'synthetic'),
      modelVersion: model.modelVersion,
      dataVersion: model.dataVersion,
      ...(persistence ? { persistence } : {}),
      provenance,
      readiness,
      concepts,
    }),
    markdown,
    diagnostics: collector.toArray(),
  }
}
