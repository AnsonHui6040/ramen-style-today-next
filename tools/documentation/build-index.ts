import {
  compareCodePoints,
  DiagnosticCollector,
  stableJson,
  type ClassificationModel,
  type Diagnostic,
} from '@ramen-style/classification-core/compiler'
import {
  createDocumentationRelations,
  type DocumentationRelation,
} from './relations.js'

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

export interface StyleParityVerification {
  assurance: 'parity-verified'
  parityScope: 'legacy-compiled-style-projection'
  fixtureManifestHash: string
  verifiedSemanticHash: string
  verifiedDataVersion: string
  implementationSha: string
}

export interface StyleDocumentationEvidence {
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
  fixtureCasesHash: string
  fixtureContentHash: string
  extractorVersion: string
  extractorHash: string
  instrumentationVersion: string
  instrumentationHash: string
  seedsHash: string
  artifactPath: string
  artifactHash: string
  sourceHash: string
  semanticHash: string
  dataVersion: string
  coverage: {
    styles: number
    cores: number
    subtypes: number
    rules: number
    bonusCopies: number
    conflictCopies: number
    exclusionTags: number
    copyRoles: number
  }
  verification?: StyleParityVerification
}

export interface ScoringParityVerification {
  assurance: 'parity-verified'
  parityScope: 'legacy-scoring-result-projection'
  paritySuiteVersion: string
  fixtureManifestHash: string
  fixtureContentHash: string
  verifiedSemanticHash: string
  verifiedDataVersion: string
  implementationSha: string
}

export interface ScoringDocumentationEvidence {
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
  fixtureCasesHash: string
  fixtureContentHash: string
  extractorVersion: string
  extractorHash: string
  instrumentationVersion: string
  instrumentationHash: string
  seedsHash: string
  artifactPath: string
  artifactHash: string
  sourceHash: string
  semanticHash: string
  dataVersion: string
  classificationDataVersion: string
  paritySuiteVersion: string
  modelVersion: string
  questionModelVersion: string
  questionSemanticHash: string
  styleModelVersion: string
  styleSemanticHash: string
  coverage: {
    styles: number
    cores: number
    rules: number
    bonuses: number
    conflicts: number
    cases: number
    observedRuleTiers: number
  }
  verification?: ScoringParityVerification
}

export interface EligibilityParityVerification {
  assurance: 'parity-verified'
  parityScope: 'legacy-eligibility-result-projection'
  paritySuiteVersion: '1'
  fixtureManifestHash: string
  fixtureContentHash: string
  verifiedSemanticHash: string
  verifiedDataVersion: string
  verifiedClassificationDataVersion: string
  implementationSha: string
}

export interface EligibilityDocumentationEvidence {
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
  seedsHash: string
  extractorHash: string
  sourceHashes: Readonly<Record<string, string>>
  semanticHash: string
  dataVersion: string
  classificationDataVersion: string
  paritySuiteVersion: '1'
  coverage: {
    exclusionOptions: number
    activeBlockingTags: number
    inactiveBlockingTags: number
    primaryBlockedCases: number
    alternativeBlockedCases: number
    allPrimaryBlockedCases: number
    multiExclusionCases: number
    noOpOptionCases: number
  }
  verification?: EligibilityParityVerification
}

export interface DocumentationBuildOptions {
  questionEvidence?: QuestionDocumentationEvidence
  persistenceEvidence?: PersistenceDocumentationEvidence
  styleEvidence?: StyleDocumentationEvidence
  scoringEvidence?: ScoringDocumentationEvidence
  eligibilityEvidence?: EligibilityDocumentationEvidence
  detectedConsumerRegistry?: readonly string[]
}

function isRepositoryPath(value: string) {
  return !value.startsWith('/')
    && !value.includes('\\')
    && !/^[A-Za-z]:/.test(value)
    && value.split('/').every((segment) => segment !== '.' && segment !== '..' && segment !== '')
}

function shouldReportStylesNotMigrated(
  origin: 'legacy-production' | 'synthetic',
) {
  // Task 16 owns the documentation/readiness transition for compiled styles.
  return origin === 'legacy-production' || origin === 'synthetic'
}

const styleConceptKinds = new Set(['style', 'intensity', 'noodle'])

function normalizedStyleRelation(relation: DocumentationRelation) {
  const sorted = (values: readonly string[] | undefined) => (
    [...(values ?? [])].sort(compareCodePoints)
  )
  return {
    canonicalSource: relation.canonicalSource,
    provenanceSources: sorted(relation.provenanceSources),
    validators: sorted(relation.validators),
    consumers: sorted(relation.consumers),
    tests: sorted(relation.tests),
    migrations: sorted(relation.migrations),
    generatedArtifacts: sorted(relation.generatedArtifacts),
    messageSources: sorted(relation.messageSources),
    evidence: sorted(relation.evidence),
  }
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

  const inventoryKeys = new Set<string>()
  for (const concept of model.inventory) {
    if (inventoryKeys.has(concept.key)) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: '/inventory',
      entityId: concept.key,
      message: `Duplicate compiled inventory record ${concept.key}`,
    })
    inventoryKeys.add(concept.key)
  }

  const compiledStyleRecords = new Map<string, { readonly sourceFiles: readonly string[] }>()
  const addCompiledStyleRecord = (key: string, sourceFiles: readonly string[]) => {
    if (compiledStyleRecords.has(key)) {
      collector.error({
        code: 'DOC_RELATION_INVALID',
        sourceFile: 'tools/documentation/relations.ts',
        path: '/styleModel',
        entityId: key,
        message: `Duplicate compiled style record ${key}`,
      })
      return
    }
    compiledStyleRecords.set(key, { sourceFiles })
  }
  for (const style of model.styleModel.styles) {
    addCompiledStyleRecord(`style/${style.id}`, [style.provenance.sourceFile])
    for (const core of style.cores) {
      addCompiledStyleRecord(
        `intensity/${core.id}`,
        core.provenance.map(({ sourceFile }) => sourceFile),
      )
      for (const subtype of core.subtypes) {
        addCompiledStyleRecord(
          `noodle/${subtype.id}`,
          subtype.provenance.map(({ sourceFile }) => sourceFile),
        )
      }
    }
  }
  for (const [key, record] of compiledStyleRecords) {
    const concept = inventoryByKey.get(key as never)
    if (!concept || !record.sourceFiles.includes(concept.sourceFile)) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: '/inventory',
      entityId: key,
      message: `Compiled style record does not match inventory ${key}`,
    })
  }
  for (const concept of model.inventory) {
    if (
      (concept.kind === 'style' || concept.kind === 'intensity' || concept.kind === 'noodle')
      && !compiledStyleRecords.has(concept.key)
    ) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: '/inventory',
      entityId: concept.key,
      message: `Inventory has no compiled style record ${concept.key}`,
    })
  }

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

  const expectedStyleRelations = new Map(createDocumentationRelations(model)
    .filter(({ conceptKey }) => {
      const concept = inventoryByKey.get(conceptKey)
      return concept ? styleConceptKinds.has(concept.kind) : false
    })
    .map((relation) => [relation.conceptKey, normalizedStyleRelation(relation)]))
  for (const [conceptKey, expected] of expectedStyleRelations) {
    const received = relationByKey.get(conceptKey)
    if (!received || stableJson(normalizedStyleRelation(received)) !== stableJson(expected)) {
      collector.error({
        code: 'DOC_RELATION_INVALID',
        sourceFile: 'tools/documentation/relations.ts',
        path: '/relations',
        entityId: conceptKey,
        message: `Compiled style documentation relation drifted for ${conceptKey}`,
      })
    }
  }

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
    if (
      concept
      && styleConceptKinds.has(concept.kind)
      && ![
        relation.canonicalSource,
        ...(relation.provenanceSources ?? []),
      ].includes(concept.sourceFile)
    ) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: `/relations/${relationIndex}/canonicalSource`,
      entityId: relation.conceptKey,
      message: `Compiled provenance does not match the inventory source for ${relation.conceptKey}`,
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
      ...(relation.provenanceSources ?? []).map((path) => (
        ['provenanceSources', path] as const
      )),
      ...relation.validators.map((path) => ['validators', path] as const),
      ...relation.consumers.map((path) => ['consumers', path] as const),
      ...relation.tests.map((path) => ['tests', path] as const),
      ...relation.migrations.map((path) => ['migrations', path] as const),
      ...(relation.generatedArtifacts ?? []).map((path) => (
        ['generatedArtifacts', path] as const
      )),
      ...(relation.messageSources ?? []).map((path) => (
        ['messageSources', path] as const
      )),
      ...(relation.evidence ?? []).map((path) => ['evidence', path] as const),
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
        provenanceSources: sorted(relation?.provenanceSources ?? []),
        validators: sorted(relation?.validators ?? []),
        consumers: sorted(relation?.consumers ?? []),
        migrations: sorted(relation?.migrations ?? []),
        generatedArtifacts: sorted(relation?.generatedArtifacts ?? []),
        generatedOwners: [
          'docs/classification/index.md',
          'docs/classification/manifest.json',
        ],
        messageSources: sorted(relation?.messageSources ?? []),
        messageIds: sorted(concept.messageIds),
        evidence: sorted(relation?.evidence ?? []),
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
  const styleEvidence = options.styleEvidence
  if (styleEvidence) {
    const styleCores = model.styleModel.styles.flatMap(({ cores }) => cores)
    const expectedCoverage = {
      styles: model.styleModel.styles.length,
      cores: styleCores.length,
      subtypes: styleCores.flatMap(({ subtypes }) => subtypes).length,
      rules: styleCores.flatMap(({ rules }) => rules).length,
      bonusCopies: 54,
      conflictCopies: 21,
      exclusionTags: model.styleModel.exclusionTags.length,
      copyRoles: 8,
    }
    if (
      styleEvidence.sourceHash !== model.styleModel.metadata.sourceHash
      || styleEvidence.semanticHash !== model.styleModel.metadata.semanticHash
      || styleEvidence.dataVersion !== model.styleModel.metadata.dataVersion
      || stableJson(styleEvidence.coverage) !== stableJson(expectedCoverage)
    ) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/build-index.ts',
      path: '/styleEvidence',
      message: 'Style documentation evidence does not match the compiled model',
    })
  }
  const scoringEvidence = options.scoringEvidence
  if (scoringEvidence) {
    const metadata = model.policy.metadata
    const expectedCoverage = {
      styles: model.styleModel.styles.length,
      cores: model.styleModel.styles.flatMap(({ cores }) => cores).length,
      rules: model.styleModel.styles.flatMap(({ cores }) => cores)
        .flatMap(({ rules }) => rules).length,
      bonuses: model.styleModel.styles.flatMap(({ adjustments }) => adjustments)
        .filter(({ kind }) => kind === 'bonus').length,
      conflicts: model.styleModel.styles.flatMap(({ adjustments }) => adjustments)
        .filter(({ kind }) => kind === 'conflict').length,
      cases: 26,
      observedRuleTiers: 1155,
    }
    if (
      scoringEvidence.sourceHash !== metadata.sourceHash
      || scoringEvidence.semanticHash !== metadata.semanticHash
      || scoringEvidence.dataVersion !== metadata.dataVersion
      || scoringEvidence.modelVersion !== metadata.modelVersion
      || scoringEvidence.questionModelVersion !== metadata.questionModelVersion
      || scoringEvidence.questionSemanticHash !== metadata.questionSemanticHash
      || scoringEvidence.styleModelVersion !== metadata.styleModelVersion
      || scoringEvidence.styleSemanticHash !== metadata.styleSemanticHash
      || stableJson(scoringEvidence.coverage) !== stableJson(expectedCoverage)
    ) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/build-index.ts',
      path: '/scoringEvidence',
      message: 'Scoring documentation evidence does not match the compiled model',
    })
  }
  const eligibilityEvidence = options.eligibilityEvidence
  if (eligibilityEvidence) {
    const metadata = model.eligibilityPolicy.metadata
    if (
      eligibilityEvidence.semanticHash !== metadata.semanticHash
      || eligibilityEvidence.dataVersion !== metadata.dataVersion
      || eligibilityEvidence.classificationDataVersion !== model.dataVersion
      || eligibilityEvidence.coverage.exclusionOptions !== 9
      || eligibilityEvidence.coverage.activeBlockingTags !== 6
      || eligibilityEvidence.coverage.inactiveBlockingTags !== 6
    ) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/build-index.ts',
      path: '/eligibilityEvidence',
      message: 'Eligibility documentation evidence does not match the compiled model',
    })
  }
  const provenance = {
    questions: questionProvenance,
    styles: (() => {
      const matchingVerification = styleEvidence?.verification
        && styleEvidence.verification.fixtureManifestHash
          === styleEvidence.fixtureManifestHash
        && styleEvidence.verification.verifiedSemanticHash
          === styleEvidence.semanticHash
        && styleEvidence.verification.verifiedDataVersion
          === styleEvidence.dataVersion
        ? styleEvidence.verification
        : undefined
      return {
        origin: model.provenance.styles.origin,
        assurance: matchingVerification ? 'parity-verified' : 'compiler-validated',
        parityScope: 'legacy-compiled-style-projection',
        ...(styleEvidence
          ? {
              sourceRepository: styleEvidence.sourceRepository,
              sourceCommit: styleEvidence.sourceCommit,
              sourceTreeHash: styleEvidence.sourceTreeHash,
              fixtureManifestPath: styleEvidence.fixtureManifestPath,
              fixtureManifestHash: styleEvidence.fixtureManifestHash,
              fixtureSchemaVersion: styleEvidence.fixtureSchemaVersion,
              fixtureCasesHash: styleEvidence.fixtureCasesHash,
              fixtureContentHash: styleEvidence.fixtureContentHash,
              extractorVersion: styleEvidence.extractorVersion,
              extractorHash: styleEvidence.extractorHash,
              instrumentationVersion: styleEvidence.instrumentationVersion,
              instrumentationHash: styleEvidence.instrumentationHash,
              seedsHash: styleEvidence.seedsHash,
              artifactPath: styleEvidence.artifactPath,
              artifactHash: styleEvidence.artifactHash,
              sourceHash: styleEvidence.sourceHash,
              semanticHash: styleEvidence.semanticHash,
              dataVersion: styleEvidence.dataVersion,
              coverage: styleEvidence.coverage,
              ...(matchingVerification ? { verification: matchingVerification } : {}),
            }
          : {}),
      }
    })(),
    scoringPolicy: (() => {
      const matchingVerification = scoringEvidence?.verification
        && scoringEvidence.verification.fixtureManifestHash
          === scoringEvidence.fixtureManifestHash
        && scoringEvidence.verification.verifiedSemanticHash
          === scoringEvidence.semanticHash
        && scoringEvidence.verification.verifiedDataVersion
          === scoringEvidence.dataVersion
        && scoringEvidence.verification.fixtureContentHash
          === scoringEvidence.fixtureContentHash
        && scoringEvidence.verification.paritySuiteVersion
          === scoringEvidence.paritySuiteVersion
        ? scoringEvidence.verification
        : undefined
      return {
        origin: model.provenance.scoringPolicy.origin,
        assurance: matchingVerification ? 'parity-verified' : 'compiler-validated',
        parityScope: 'legacy-scoring-result-projection',
        ...(scoringEvidence
          ? {
              sourceRepository: scoringEvidence.sourceRepository,
              sourceCommit: scoringEvidence.sourceCommit,
              sourceTreeHash: scoringEvidence.sourceTreeHash,
              fixtureManifestPath: scoringEvidence.fixtureManifestPath,
              fixtureManifestHash: scoringEvidence.fixtureManifestHash,
              fixtureSchemaVersion: scoringEvidence.fixtureSchemaVersion,
              fixtureCasesHash: scoringEvidence.fixtureCasesHash,
              fixtureContentHash: scoringEvidence.fixtureContentHash,
              extractorVersion: scoringEvidence.extractorVersion,
              extractorHash: scoringEvidence.extractorHash,
              instrumentationVersion: scoringEvidence.instrumentationVersion,
              instrumentationHash: scoringEvidence.instrumentationHash,
              seedsHash: scoringEvidence.seedsHash,
              artifactPath: scoringEvidence.artifactPath,
              artifactHash: scoringEvidence.artifactHash,
              sourceHash: scoringEvidence.sourceHash,
              semanticHash: scoringEvidence.semanticHash,
              dataVersion: scoringEvidence.dataVersion,
              classificationDataVersion: scoringEvidence.classificationDataVersion,
              paritySuiteVersion: scoringEvidence.paritySuiteVersion,
              modelVersion: scoringEvidence.modelVersion,
              questionModelVersion: scoringEvidence.questionModelVersion,
              questionSemanticHash: scoringEvidence.questionSemanticHash,
              styleModelVersion: scoringEvidence.styleModelVersion,
              styleSemanticHash: scoringEvidence.styleSemanticHash,
              coverage: scoringEvidence.coverage,
              ...(matchingVerification ? { verification: matchingVerification } : {}),
            }
          : {}),
      }
    })(),
    eligibilityPolicy: (() => {
      const matchingVerification = eligibilityEvidence?.verification
        && eligibilityEvidence.verification.fixtureManifestHash
          === eligibilityEvidence.fixtureManifestHash
        && eligibilityEvidence.verification.fixtureContentHash
          === eligibilityEvidence.fixtureContentHash
        && eligibilityEvidence.verification.verifiedSemanticHash
          === eligibilityEvidence.semanticHash
        && eligibilityEvidence.verification.verifiedDataVersion
          === eligibilityEvidence.dataVersion
        && eligibilityEvidence.verification.verifiedClassificationDataVersion
          === eligibilityEvidence.classificationDataVersion
        ? eligibilityEvidence.verification
        : undefined
      return {
        origin: model.provenance.eligibilityPolicy.origin,
        assurance: matchingVerification ? 'parity-verified' : 'compiler-validated',
        parityScope: 'legacy-eligibility-result-projection',
        ...(eligibilityEvidence
          ? {
              sourceRepository: eligibilityEvidence.sourceRepository,
              sourceCommit: eligibilityEvidence.sourceCommit,
              sourceTreeHash: eligibilityEvidence.sourceTreeHash,
              fixtureManifestPath: eligibilityEvidence.fixtureManifestPath,
              fixtureManifestHash: eligibilityEvidence.fixtureManifestHash,
              fixtureSchemaVersion: eligibilityEvidence.fixtureSchemaVersion,
              fixtureContentHash: eligibilityEvidence.fixtureContentHash,
              seedsHash: eligibilityEvidence.seedsHash,
              extractorHash: eligibilityEvidence.extractorHash,
              sourceHashes: eligibilityEvidence.sourceHashes,
              semanticHash: eligibilityEvidence.semanticHash,
              dataVersion: eligibilityEvidence.dataVersion,
              classificationDataVersion: eligibilityEvidence.classificationDataVersion,
              paritySuiteVersion: eligibilityEvidence.paritySuiteVersion,
              coverage: eligibilityEvidence.coverage,
              ...(matchingVerification ? { verification: matchingVerification } : {}),
            }
          : {}),
      }
    })(),
  }
  const persistence = options.persistenceEvidence
  const readinessBlockers = persistence
    ? persistenceReadinessBlockers.filter((blocker) => (
        (blocker !== 'styles-not-production-verified'
          || provenance.styles.assurance !== 'parity-verified')
        && (blocker !== 'scoring-not-production-verified'
          || provenance.scoringPolicy.assurance !== 'parity-verified')
      ))
    : [
        ...(shouldReportStylesNotMigrated(model.provenance.styles.origin)
          ? ['styles-not-migrated']
          : []),
        ...(!scoringEvidence
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
    cell(concept.provenanceSources),
    cell(concept.validators),
    cell(concept.consumers),
    cell(concept.migrations),
    cell(concept.generatedArtifacts),
    cell(concept.generatedOwners),
    cell(concept.messageSources),
    cell(concept.messageIds),
    cell(concept.evidence),
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
      ? '> Production question ownership, compiled style ownership, compiled scoring ownership, and compiled eligibility ownership.'
      : '> Synthetic inventory — not production classification data.',
    '',
    `Model version: \`${model.modelVersion}\`<br>`,
    `Data version: \`${model.dataVersion}\`<br>`,
    `Eligibility assurance: \`${provenance.eligibilityPolicy.assurance}\`<br>`,
    `Eligibility parity scope: \`${provenance.eligibilityPolicy.parityScope}\``,
    '',
    ...persistenceSummary,
    '| Concept | Canonical source | Provenance sources | Validators | Consumers | Migrations | Generated artifacts | Generated owners | Message sources | Messages | Evidence | Tests |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
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
