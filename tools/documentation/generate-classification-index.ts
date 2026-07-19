import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

import { z } from 'zod'

import {
  compileClassification,
  compileQuestions,
  type CompiledQuestionModelMetadata,
  type CompiledStyleModelMetadata,
} from '@ramen-style/classification-core/compiler'
import { migrationLedgerSchema } from '../migration/ledger-schema.js'
import {
  fixtureManifestSchema,
  questionParitySuiteVersion,
} from '../parity/questions/contracts.js'
import { styleFixtureManifestSchema } from '../parity/styles/contracts.js'
import {
  styleFixtureAuthoringSourcePaths,
  verifyStyleFixtureSet,
} from '../parity/styles/verify-fixtures.js'
import {
  scoringExtractorAuthoringSourcePaths,
} from '../parity/scoring/extractor.js'
import {
  verifyScoringFixtureSet,
} from '../parity/scoring/verify-fixtures.js'
import { verifyEligibilityFixtureSet } from '../parity/eligibility/verify-fixtures.js'
import {
  buildDocumentation,
  type EligibilityDocumentationEvidence,
  type PersistenceDocumentationEvidence,
  type ScoringDocumentationEvidence,
} from './build-index.js'
import {
  createDocumentationRelations,
  documentationDefinition,
  documentationDetectedConsumers,
  documentationSourceFile,
} from './relations.js'
import { scanCoreConsumers } from './scan-imports.js'

interface GeneratedOutputInstallOptions {
  rename?: (from: string, to: string) => void
}

interface StagedOutput {
  backup?: string
  destination: string
  installed: boolean
  originalExists: boolean
  temporary: string
}

function pathExists(path: string) {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

function assertRegularDirectory(path: string, label: string) {
  const stats = lstatSync(path)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`DOC_INDEX_DRIFT ${label} must be a regular repository directory: ${path}`)
  }
}

function assertContained(repoRoot: string, path: string) {
  const repositoryRelative = relative(repoRoot, path)
  if (repositoryRelative === ''
    || isAbsolute(repositoryRelative)
    || repositoryRelative === '..'
    || repositoryRelative.startsWith('../')) {
    throw new Error(`DOC_INDEX_DRIFT generated output escapes repository: ${path}`)
  }
}

function assertOwnedOutputParents(repoRoot: string) {
  assertRegularDirectory(repoRoot, 'repository root')
  let current = repoRoot
  for (const segment of ['docs', 'classification']) {
    current = resolve(current, segment)
    assertContained(repoRoot, current)
    assertRegularDirectory(current, 'owned output parent')
  }
}

function uniqueSibling(path: string, role: 'backup' | 'tmp') {
  const directory = dirname(path)
  const name = path.slice(directory.length + 1)
  for (;;) {
    const candidate = resolve(directory, `.${name}.${role}-${process.pid}-${randomUUID()}`)
    if (!pathExists(candidate)) return candidate
  }
}

function removeIfPresent(path: string) {
  if (pathExists(path)) unlinkSync(path)
}

export function installGeneratedOutputs(
  repoRoot: string,
  outputs: ReadonlyMap<string, string>,
  options: GeneratedOutputInstallOptions = {},
) {
  assertOwnedOutputParents(repoRoot)
  const rename = options.rename ?? renameSync
  const staged: StagedOutput[] = []

  try {
    for (const [repositoryRelative, content] of outputs) {
      const destination = resolve(repoRoot, repositoryRelative)
      assertContained(repoRoot, destination)
      if (dirname(destination) !== resolve(repoRoot, 'docs/classification')) {
        throw new Error(`DOC_INDEX_DRIFT generated output has unexpected parent: ${repositoryRelative}`)
      }
      const originalExists = pathExists(destination)
      if (originalExists) {
        const stats = lstatSync(destination)
        if (stats.isSymbolicLink() || !stats.isFile()) {
          throw new Error(`DOC_INDEX_DRIFT generated output must be a regular file: ${repositoryRelative}`)
        }
      }
      const temporary = uniqueSibling(destination, 'tmp')
      writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      staged.push({
        destination,
        installed: false,
        originalExists,
        temporary,
      })
    }

    for (const output of staged) {
      if (output.originalExists) {
        output.backup = uniqueSibling(output.destination, 'backup')
        rename(output.destination, output.backup)
      }
      rename(output.temporary, output.destination)
      output.installed = true
    }

    for (const output of staged) {
      if (output.backup) removeIfPresent(output.backup)
    }
  } catch (error) {
    let rollbackError: unknown
    for (const output of [...staged].reverse()) {
      try {
        if (output.installed) removeIfPresent(output.destination)
        if (output.backup && pathExists(output.backup)) {
          removeIfPresent(output.destination)
          rename(output.backup, output.destination)
        }
      } catch (candidate) {
        rollbackError ??= candidate
      }
    }
    for (const output of staged) {
      try {
        removeIfPresent(output.temporary)
        if (output.backup) removeIfPresent(output.backup)
      } catch (candidate) {
        rollbackError ??= candidate
      }
    }
    if (rollbackError) {
      throw new Error(
        `DOC_INDEX_DRIFT generated output transaction rollback failed: ${String(rollbackError)}`,
        { cause: error },
      )
    }
    throw error
  }
}

export function repositoryFiles(repoRoot: string) {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  return new Set(output.split('\0').filter(Boolean))
}

const sha40Schema = z.string().regex(/^[0-9a-f]{40}$/)
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
const persistenceFixtureManifestPath =
  'tools/parity/fixtures/persistence/legacy-unversioned/manifest.json' as const
const styleFixtureManifestPath =
  'tools/parity/fixtures/styles/legacy-v1/manifest.json' as const
const styleFixtureCasesPath =
  'tools/parity/fixtures/styles/legacy-v1/cases.json' as const
const styleInstrumentationPath =
  'tools/parity/styles/legacy-instrumentation.patch' as const
const styleSeedsPath = 'tools/parity/styles/seeds.json' as const
const styleArtifactPath =
  'packages/classification-core/src/generated/style-model.ts' as const
const scoringFixtureManifestPath =
  'tools/parity/fixtures/scoring/legacy-v1/manifest.json' as const
const scoringFixtureCasesPath =
  'tools/parity/fixtures/scoring/legacy-v1/cases.json' as const
const scoringInstrumentationPath =
  'tools/parity/scoring/legacy-instrumentation.patch' as const
const scoringSeedsPath = 'tools/parity/scoring/seeds.json' as const
const scoringArtifactPath =
  'packages/classification-core/src/generated/classification-model.ts' as const
const expectedScoringManifestHash =
  '8379cbb14588d5ba586bda895e8791edf8cfd98dc3bdffcb4512e6e8fb71101f'
const expectedScoringArtifactHash =
  'b722685fb1b5bb6427e4ff9ecc1edd50244aa2e22a8d8ac9f158da404d94b591'
const scoringParitySuiteVersion = '1' as const
const eligibilityFixtureManifestPath =
  'tools/parity/fixtures/eligibility/legacy-v1/manifest.json' as const
const eligibilityFixtureCasesPath =
  'tools/parity/fixtures/eligibility/legacy-v1/cases.json' as const
const eligibilityParitySuiteVersion = '1' as const
const expectedStyleManifestHash =
  'fa1a4714a77ce70489b56c54b82a812b28cd18dbc31a668a62ae51cc12e9586b'
const expectedStyleArtifactHash =
  '46a63367179ce8874b10f2c6fc828a5816460bf463abac9d087ec77d8acfad3e'
const expectedStyleSourceHash =
  '1ed1b65c6279edb23965965437dc7ef3ca1196e95e2cbf45347ec0d88d303eff'
const expectedStyleSemanticHash =
  '9fb9832c434b22fcd8397809b14117a47c358a266694df24ba68fd290fc5f585'
const expectedStyleDataVersion =
  'c5b3b3353b42618875f1c20d64449ec513601b60215351f757dbd1e48d1fee28'
const expectedLegacyStyleCommit = 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37'
const expectedLegacyStyleTree = '3e527de876cfeccfd3154ddc492830d71c4cfd9a'
const acceptanceLedgerProjectionSchema = z.object({
  entries: z.array(z.unknown()),
})
const acceptanceBatchEntryProjectionSchema = z.object({
  batch: z.literal('2A'),
  status: z.literal('complete'),
  implementationSha: sha40Schema,
  verification: z.array(z.object({
    gate: z.string(),
    outcome: z.string(),
    commitSha: sha40Schema.optional(),
  })),
})
const acceptancePersistenceEntryProjectionSchema = z.object({
  batch: z.literal('2B'),
  status: z.literal('complete'),
  implementationSha: sha40Schema,
  fixtureManifestHash: sha256Schema,
  verification: z.array(z.object({
    gate: z.string(),
    outcome: z.string(),
    commitSha: sha40Schema.optional(),
  })),
})
const acceptanceStyleEntryProjectionSchema = z.object({
  batch: z.literal('3A'),
  status: z.literal('complete'),
  implementationSha: sha40Schema,
  fixtureManifestHash: sha256Schema,
  verification: z.array(z.object({
    gate: z.string(),
    command: z.string(),
    outcome: z.string(),
    commitSha: sha40Schema.optional(),
    runUrl: z.string().url().optional(),
  }).passthrough()),
}).passthrough()
const acceptanceScoringEntryProjectionSchema = z.object({
  batch: z.literal('3B'),
  status: z.literal('complete'),
  implementationSha: sha40Schema,
  scoringFixtureManifestHash: sha256Schema,
  verification: z.array(z.object({
    gate: z.string(),
    command: z.string(),
    outcome: z.string(),
    commitSha: sha40Schema.optional(),
    runUrl: z.string().url().optional(),
  }).passthrough()),
}).passthrough()
const acceptanceEligibilityEntryProjectionSchema = z.object({
  batch: z.literal('3C'),
  status: z.literal('complete'),
  implementationSha: sha40Schema,
  eligibilityFixtureManifestHash: sha256Schema,
  verification: z.array(z.object({
    gate: z.string(),
    command: z.string(),
    outcome: z.string(),
    commitSha: sha40Schema.optional(),
    runUrl: z.string().url().optional(),
  }).passthrough()),
}).passthrough()

export function projectQuestionParityVerification(
  validatedLedger: unknown,
  identity: { fixtureManifestHash: string; semanticHash: string },
) {
  const ledger = acceptanceLedgerProjectionSchema.safeParse(validatedLedger)
  if (!ledger.success) return undefined
  const candidates = ledger.data.entries.filter((entry) => (
    typeof entry === 'object'
    && entry !== null
    && 'batch' in entry
    && entry.batch === '2A'
  ))
  if (candidates.length !== 1) return undefined
  const projected = acceptanceBatchEntryProjectionSchema.safeParse(candidates[0])
  if (!projected.success) return undefined
  const { implementationSha, verification } = projected.data
  if (verification.length !== 2) return undefined
  const localGates = verification.filter(({ gate }) => gate === 'batch2a-local-verify')
  const remoteGates = verification.filter(({ gate }) => gate === 'batch2a-remote-ci')
  if (localGates.length !== 1
    || remoteGates.length !== 1
    || localGates[0]!.outcome !== 'passed'
    || remoteGates[0]!.outcome !== 'passed'
    || remoteGates[0]!.commitSha !== implementationSha) return undefined

  return {
    assurance: 'parity-verified' as const,
    parityScope: 'legacy-observable-transition-projection' as const,
    fixtureManifestHash: identity.fixtureManifestHash,
    paritySuiteVersion: questionParitySuiteVersion,
    verifiedSemanticHash: identity.semanticHash,
    implementationSha,
  }
}

export function projectPersistenceContractVerification(
  validatedLedger: unknown,
  identity: { fixtureManifestHash: string },
) {
  const ledger = acceptanceLedgerProjectionSchema.safeParse(validatedLedger)
  if (!ledger.success) return undefined
  const candidates = ledger.data.entries.filter((entry) => (
    typeof entry === 'object'
    && entry !== null
    && 'batch' in entry
    && entry.batch === '2B'
  ))
  if (candidates.length !== 1) return undefined
  const projected = acceptancePersistenceEntryProjectionSchema.safeParse(candidates[0])
  if (!projected.success) return undefined
  const {
    fixtureManifestHash,
    implementationSha,
    verification,
  } = projected.data
  if (fixtureManifestHash !== identity.fixtureManifestHash || verification.length !== 2) {
    return undefined
  }
  const localGates = verification.filter(({ gate }) => gate === 'batch2b-local-verify')
  const remoteGates = verification.filter(({ gate }) => gate === 'batch2b-remote-ci')
  if (localGates.length !== 1
    || remoteGates.length !== 1
    || localGates[0]!.outcome !== 'passed'
    || remoteGates[0]!.outcome !== 'passed'
    || remoteGates[0]!.commitSha !== implementationSha) return undefined

  return {
    assurance: 'contract-verified' as const,
    fixtureManifestHash,
    implementationSha,
  }
}

export function projectStyleParityVerification(
  validatedLedger: unknown,
  identity: {
    fixtureManifestHash: string
    semanticHash: string
    dataVersion: string
  },
) {
  const ledger = acceptanceLedgerProjectionSchema.safeParse(validatedLedger)
  if (!ledger.success) return undefined
  const candidates = ledger.data.entries.filter((entry) => (
    typeof entry === 'object'
    && entry !== null
    && 'batch' in entry
    && entry.batch === '3A'
  ))
  if (candidates.length !== 1) return undefined
  const projected = acceptanceStyleEntryProjectionSchema.safeParse(candidates[0])
  if (!projected.success) return undefined
  const {
    fixtureManifestHash,
    implementationSha,
    verification,
  } = projected.data
  if (fixtureManifestHash !== identity.fixtureManifestHash || verification.length !== 2) {
    return undefined
  }
  const localGates = verification.filter(({ gate }) => gate === 'batch3a-local-verify')
  const remoteGates = verification.filter(({ gate }) => gate === 'batch3a-remote-ci')
  if (
    localGates.length !== 1
    || remoteGates.length !== 1
    || localGates[0]!.command !== 'npm run verify'
    || localGates[0]!.outcome !== 'passed'
    || remoteGates[0]!.command !== 'GitHub Actions CI / verify'
    || remoteGates[0]!.outcome !== 'passed'
    || remoteGates[0]!.commitSha !== implementationSha
    || !remoteGates[0]!.runUrl
  ) return undefined

  return {
    assurance: 'parity-verified' as const,
    parityScope: 'legacy-compiled-style-projection' as const,
    fixtureManifestHash,
    verifiedSemanticHash: identity.semanticHash,
    verifiedDataVersion: identity.dataVersion,
    implementationSha,
  }
}

export function projectScoringParityVerification(
  validatedLedger: unknown,
  identity: {
    fixtureManifestHash: string
    fixtureContentHash: string
    semanticHash: string
    dataVersion: string
  },
) {
  const ledger = acceptanceLedgerProjectionSchema.safeParse(validatedLedger)
  if (!ledger.success) return undefined
  const candidates = ledger.data.entries.filter((entry) => (
    typeof entry === 'object'
    && entry !== null
    && 'batch' in entry
    && entry.batch === '3B'
  ))
  if (candidates.length !== 1) return undefined
  const projected = acceptanceScoringEntryProjectionSchema.safeParse(candidates[0])
  if (!projected.success) return undefined
  const {
    scoringFixtureManifestHash,
    implementationSha,
    verification,
  } = projected.data
  if (
    scoringFixtureManifestHash !== identity.fixtureManifestHash
    || verification.length !== 2
  ) return undefined
  const localGates = verification.filter(({ gate }) => gate === 'batch3b-local-verify')
  const remoteGates = verification.filter(({ gate }) => gate === 'batch3b-remote-ci')
  if (
    localGates.length !== 1
    || remoteGates.length !== 1
    || localGates[0]!.command !== 'npm run verify'
    || localGates[0]!.outcome !== 'passed'
    || remoteGates[0]!.command !== 'GitHub Actions CI / verify'
    || remoteGates[0]!.outcome !== 'passed'
    || remoteGates[0]!.commitSha !== implementationSha
    || !remoteGates[0]!.runUrl
  ) return undefined
  return {
    assurance: 'parity-verified' as const,
    parityScope: 'legacy-scoring-result-projection' as const,
    paritySuiteVersion: scoringParitySuiteVersion,
    fixtureManifestHash: scoringFixtureManifestHash,
    fixtureContentHash: identity.fixtureContentHash,
    verifiedSemanticHash: identity.semanticHash,
    verifiedDataVersion: identity.dataVersion,
    implementationSha,
  }
}

export function projectEligibilityParityVerification(
  validatedLedger: unknown,
  identity: {
    fixtureManifestHash: string
    fixtureContentHash: string
    semanticHash: string
    dataVersion: string
    classificationDataVersion: string
  },
) {
  const ledger = acceptanceLedgerProjectionSchema.safeParse(validatedLedger)
  if (!ledger.success) return undefined
  const candidates = ledger.data.entries.filter((entry) => (
    typeof entry === 'object'
    && entry !== null
    && 'batch' in entry
    && entry.batch === '3C'
  ))
  if (candidates.length !== 1) return undefined
  const projected = acceptanceEligibilityEntryProjectionSchema.safeParse(candidates[0])
  if (!projected.success) return undefined
  const {
    eligibilityFixtureManifestHash,
    implementationSha,
    verification,
  } = projected.data
  if (
    eligibilityFixtureManifestHash !== identity.fixtureManifestHash
      || verification.length !== 2
  ) return undefined
  const local = verification.filter(({ gate }) => gate === 'batch3c-local-verify')
  const remote = verification.filter(({ gate }) => gate === 'batch3c-remote-ci')
  if (
    local.length !== 1
      || remote.length !== 1
      || local[0]!.command !== 'npm run verify'
      || local[0]!.outcome !== 'passed'
      || remote[0]!.command !== 'GitHub Actions CI / verify'
      || remote[0]!.outcome !== 'passed'
      || remote[0]!.commitSha !== implementationSha
      || !remote[0]!.runUrl
  ) return undefined
  return {
    assurance: 'parity-verified' as const,
    parityScope: 'legacy-eligibility-result-projection' as const,
    paritySuiteVersion: eligibilityParitySuiteVersion,
    fixtureManifestHash: eligibilityFixtureManifestHash,
    fixtureContentHash: identity.fixtureContentHash,
    verifiedSemanticHash: identity.semanticHash,
    verifiedDataVersion: identity.dataVersion,
    verifiedClassificationDataVersion: identity.classificationDataVersion,
    implementationSha,
  }
}

export function loadQuestionEvidence(
  repoRoot: string,
  questionMetadata: CompiledQuestionModelMetadata,
) {
  const fixtureManifestPath = 'tools/parity/fixtures/questions/legacy-v1/manifest.json'
  const fixtureManifestBytes = readFileSync(resolve(repoRoot, fixtureManifestPath))
  const fixtureManifest = fixtureManifestSchema.parse(
    JSON.parse(fixtureManifestBytes.toString('utf8')) as unknown,
  )
  const validatedLedger = migrationLedgerSchema.parse(JSON.parse(readFileSync(
    resolve(repoRoot, 'docs/migration/ledger.json'),
    'utf8',
  )) as unknown)
  const fixtureManifestHash = createHash('sha256')
    .update(fixtureManifestBytes)
    .digest('hex')
  const verification = projectQuestionParityVerification(validatedLedger, {
    fixtureManifestHash,
    semanticHash: questionMetadata.semanticHash,
  })

  return {
    sourceRepository: fixtureManifest.source.repository,
    sourceCommit: fixtureManifest.source.commit,
    sourceTreeHash: fixtureManifest.source.treeHash,
    fixtureManifestPath,
    fixtureManifestHash,
    fixtureSchemaVersion: String(fixtureManifest.fixtureSchemaVersion),
    fixtureContentHash: fixtureManifest.fixtureContentHash,
    extractorVersion: String(fixtureManifest.extractor.version),
    instrumentationHash: fixtureManifest.instrumentation.hash,
    sourceHash: questionMetadata.sourceHash,
    semanticHash: questionMetadata.semanticHash,
    ...(verification ? { verification } : {}),
  }
}

export async function loadPersistenceEvidence(
  repoRoot: string,
): Promise<PersistenceDocumentationEvidence> {
  const { persistenceFixtureManifestSchema } = await import(
    '../parity/persistence/extractor.js'
  )
  const fixtureManifestBytes = readFileSync(resolve(repoRoot, persistenceFixtureManifestPath))
  const fixtureManifest = persistenceFixtureManifestSchema.parse(
    JSON.parse(fixtureManifestBytes.toString('utf8')) as unknown,
  )
  const validatedLedger = migrationLedgerSchema.parse(JSON.parse(readFileSync(
    resolve(repoRoot, 'docs/migration/ledger.json'),
    'utf8',
  )) as unknown)
  const fixtureManifestHash = createHash('sha256')
    .update(fixtureManifestBytes)
    .digest('hex')
  const batch2BEntries = validatedLedger.entries.filter(({ batch }) => batch === '2B')
  if (batch2BEntries.length !== 1
    || batch2BEntries[0]!.fixtureManifestHash !== fixtureManifestHash) {
    throw new Error('DOC_INDEX_DRIFT Batch 2B fixture manifest identity mismatch')
  }
  const verification = projectPersistenceContractVerification(validatedLedger, {
    fixtureManifestHash,
  })
  const lineage = fixtureManifest.source

  const evidence = {
    origin: 'manually-authored',
    schemaVersion: 1,
    fixtureManifestPath: persistenceFixtureManifestPath,
    fixtureManifestHash,
    verificationScope: 'pure persistence restore and payload contracts',
    legacyLineage: {
      origin: 'legacy-production',
      sourceRepository: lineage.repository,
      sourceCommit: lineage.commit,
      sourceTreeHash: lineage.treeHash,
    },
  } as const
  return verification
    ? {
        ...evidence,
        assurance: verification.assurance,
        implementationSha: verification.implementationSha,
      }
    : {
        ...evidence,
        assurance: 'structurally-validated',
      }
}

function readRequiredBytes(repoRoot: string, repositoryRelative: string) {
  return readFileSync(resolve(repoRoot, repositoryRelative))
}

export function loadStyleEvidence(
  repoRoot: string,
  styleMetadata: CompiledStyleModelMetadata,
  validatedLedger: unknown,
) {
  const manifestBytes = readRequiredBytes(repoRoot, styleFixtureManifestPath)
  const manifest = styleFixtureManifestSchema.parse(
    JSON.parse(manifestBytes.toString('utf8')) as unknown,
  )
  const verificationResult = verifyStyleFixtureSet({
    casesBytes: readRequiredBytes(repoRoot, styleFixtureCasesPath),
    manifestBytes,
    instrumentationBytes: readRequiredBytes(repoRoot, styleInstrumentationPath),
    seedBytes: readRequiredBytes(repoRoot, styleSeedsPath),
    authoringSources: styleFixtureAuthoringSourcePaths.map((path) => ({
      path,
      bytes: readRequiredBytes(repoRoot, path),
    })),
  })
  const artifactHash = createHash('sha256')
    .update(readRequiredBytes(repoRoot, styleArtifactPath))
    .digest('hex')
  if (
    verificationResult.manifestHash !== expectedStyleManifestHash
    || artifactHash !== expectedStyleArtifactHash
    || styleMetadata.sourceHash !== expectedStyleSourceHash
    || styleMetadata.semanticHash !== expectedStyleSemanticHash
    || styleMetadata.dataVersion !== expectedStyleDataVersion
    || manifest.source.commit !== expectedLegacyStyleCommit
    || manifest.source.treeHash !== expectedLegacyStyleTree
  ) throw new Error('DOC_INDEX_DRIFT style fixture or artifact identity mismatch')
  const verification = projectStyleParityVerification(validatedLedger, {
    fixtureManifestHash: verificationResult.manifestHash,
    semanticHash: styleMetadata.semanticHash,
    dataVersion: styleMetadata.dataVersion,
  })
  return {
    sourceRepository: manifest.source.repository,
    sourceCommit: manifest.source.commit,
    sourceTreeHash: manifest.source.treeHash,
    fixtureManifestPath: styleFixtureManifestPath,
    fixtureManifestHash: verificationResult.manifestHash,
    fixtureSchemaVersion: String(manifest.fixtureSchemaVersion),
    fixtureCasesHash: verificationResult.casesHash,
    fixtureContentHash: verificationResult.fixtureContentHash,
    extractorVersion: String(manifest.extractor.version),
    extractorHash: verificationResult.authoringHash,
    instrumentationVersion: String(manifest.instrumentation.version),
    instrumentationHash: verificationResult.instrumentationHash,
    seedsHash: verificationResult.seedsHash,
    artifactPath: styleArtifactPath,
    artifactHash,
    sourceHash: styleMetadata.sourceHash,
    semanticHash: styleMetadata.semanticHash,
    dataVersion: styleMetadata.dataVersion,
    coverage: verificationResult.coverage,
    ...(verification ? { verification } : {}),
  }
}

export function loadScoringEvidence(
  repoRoot: string,
  policyMetadata: {
    modelVersion: string
    questionModelVersion: string
    questionSemanticHash: string
    styleModelVersion: string
    styleSemanticHash: string
    sourceHash: string
    semanticHash: string
    dataVersion: string
  },
  classificationDataVersion: string,
  validatedLedger: unknown,
): ScoringDocumentationEvidence {
  const manifestBytes = readRequiredBytes(repoRoot, scoringFixtureManifestPath)
  const verified = verifyScoringFixtureSet({
    casesBytes: readRequiredBytes(repoRoot, scoringFixtureCasesPath),
    manifestBytes,
    instrumentationBytes: readRequiredBytes(repoRoot, scoringInstrumentationPath),
    seedBytes: readRequiredBytes(repoRoot, scoringSeedsPath),
    authoringSources: scoringExtractorAuthoringSourcePaths.map((path) => ({
      path,
      bytes: readRequiredBytes(repoRoot, path),
    })),
  })
  const artifactHash = createHash('sha256')
    .update(readRequiredBytes(repoRoot, scoringArtifactPath))
    .digest('hex')
  if (
    verified.verification.manifestHash !== expectedScoringManifestHash
    || artifactHash !== expectedScoringArtifactHash
  ) throw new Error('DOC_INDEX_DRIFT scoring fixture or artifact identity mismatch')
  const { manifest, verification: result } = verified
  const verification = projectScoringParityVerification(validatedLedger, {
    fixtureManifestHash: result.manifestHash,
    fixtureContentHash: result.fixtureContentHash,
    semanticHash: policyMetadata.semanticHash,
    dataVersion: policyMetadata.dataVersion,
  })
  return {
    sourceRepository: manifest.source.repository,
    sourceCommit: manifest.source.commit,
    sourceTreeHash: manifest.source.treeHash,
    fixtureManifestPath: scoringFixtureManifestPath,
    fixtureManifestHash: result.manifestHash,
    fixtureSchemaVersion: String(manifest.fixtureSchemaVersion),
    fixtureCasesHash: result.casesHash,
    fixtureContentHash: result.fixtureContentHash,
    extractorVersion: String(manifest.extractor.version),
    extractorHash: result.authoringHash,
    instrumentationVersion: String(manifest.instrumentation.version),
    instrumentationHash: manifest.instrumentation.hash,
    seedsHash: manifest.seeds.hash,
    artifactPath: scoringArtifactPath,
    artifactHash,
    ...policyMetadata,
    classificationDataVersion,
    paritySuiteVersion: scoringParitySuiteVersion,
    coverage: result.coverage,
    ...(verification ? { verification } : {}),
  }
}

export function loadEligibilityEvidence(
  repoRoot: string,
  metadata: { readonly semanticHash: string; readonly dataVersion: string },
  classificationDataVersion: string,
  validatedLedger: unknown,
): EligibilityDocumentationEvidence {
  const verified = verifyEligibilityFixtureSet({
    casesBytes: readRequiredBytes(repoRoot, eligibilityFixtureCasesPath),
    manifestBytes: readRequiredBytes(repoRoot, eligibilityFixtureManifestPath),
  })
  const verification = projectEligibilityParityVerification(validatedLedger, {
    fixtureManifestHash: verified.verification.manifestHash,
    fixtureContentHash: verified.verification.fixtureContentHash,
    semanticHash: metadata.semanticHash,
    dataVersion: metadata.dataVersion,
    classificationDataVersion,
  })
  const manifest = verified.manifest
  return {
    sourceRepository: {
      host: manifest.legacy.host,
      owner: manifest.legacy.owner,
      repository: manifest.legacy.repository,
    },
    sourceCommit: manifest.legacy.commit,
    sourceTreeHash: manifest.legacy.treeHash,
    fixtureManifestPath: eligibilityFixtureManifestPath,
    fixtureManifestHash: verified.verification.manifestHash,
    fixtureSchemaVersion: String(manifest.schemaVersion),
    fixtureContentHash: verified.verification.fixtureContentHash,
    seedsHash: manifest.seedsHash,
    extractorHash: manifest.extractorHash,
    sourceHashes: manifest.sourceHashes,
    semanticHash: metadata.semanticHash,
    dataVersion: metadata.dataVersion,
    classificationDataVersion,
    paritySuiteVersion: eligibilityParitySuiteVersion,
    coverage: manifest.coverage,
    ...(verification ? { verification } : {}),
  }
}

async function run() {
  const repoRoot = resolve(import.meta.dirname, '../..')
  const mode = process.argv[2]
  if (mode !== '--write' && mode !== '--check') throw new Error('Use --write or --check')

  const compiled = compileClassification(
    documentationDefinition,
    documentationSourceFile,
  )
  if (!compiled.ok) {
    console.error(JSON.stringify(compiled.diagnostics, null, 2))
    process.exitCode = 1
    return
  }
  const compiledQuestions = compileQuestions(documentationDefinition.questions)
  if (!compiledQuestions.ok) {
    console.error(JSON.stringify(compiledQuestions.diagnostics, null, 2))
    process.exitCode = 1
    return
  }

  const documentationRelations = createDocumentationRelations(compiled.model)
  const ledgerInput = JSON.parse(readFileSync(
    resolve(repoRoot, 'docs/migration/ledger.json'),
    'utf8',
  )) as { entries?: unknown }
  const validatedLedger = migrationLedgerSchema.parse(ledgerInput)
  const hasBatch2BEntry = Array.isArray(ledgerInput.entries)
    && ledgerInput.entries.some((entry) => (
      typeof entry === 'object'
      && entry !== null
      && 'batch' in entry
      && entry.batch === '2B'
    ))

  const repoFiles = repositoryFiles(repoRoot)
  const existingPaths = new Set(documentationRelations.flatMap((item) => [
    item.canonicalSource,
    ...(item.provenanceSources ?? []),
    ...item.validators,
    ...item.consumers,
    ...item.tests,
    ...item.migrations,
    ...(item.generatedArtifacts ?? []),
    ...(item.messageSources ?? []),
    ...(item.evidence ?? []),
  ]).filter((file) => {
    const absolute = resolve(repoRoot, file)
    return repoFiles.has(file) && existsSync(absolute) && lstatSync(absolute).isFile()
  }))
  const detected = scanCoreConsumers(repoRoot, ['apps', 'packages', 'tools'], repoFiles)
  const built = buildDocumentation(
    compiled.model,
    documentationRelations,
    detected,
    existingPaths,
    {
      questionEvidence: loadQuestionEvidence(repoRoot, compiledQuestions.model.metadata),
      styleEvidence: loadStyleEvidence(
        repoRoot,
        compiled.model.styleModel.metadata,
        validatedLedger,
      ),
      scoringEvidence: loadScoringEvidence(
        repoRoot,
        compiled.model.policy.metadata,
        compiled.model.dataVersion,
        validatedLedger,
      ),
      eligibilityEvidence: loadEligibilityEvidence(
        repoRoot,
        compiled.model.eligibilityPolicy.metadata,
        compiled.model.dataVersion,
        validatedLedger,
      ),
      ...(hasBatch2BEntry
        ? { persistenceEvidence: await loadPersistenceEvidence(repoRoot) }
        : {}),
      detectedConsumerRegistry: documentationDetectedConsumers,
    },
  )
  if (built.diagnostics.length) {
    console.error(JSON.stringify(built.diagnostics, null, 2))
    process.exitCode = 1
    return
  }

  const outputs = new Map([
    ['docs/classification/manifest.json', built.manifest],
    ['docs/classification/index.md', built.markdown],
  ])
  const allowedClassificationFiles = new Set([
    ...outputs.keys(),
    'docs/classification/change-map.md',
  ])
  assertOwnedOutputParents(repoRoot)
  let hasInvalidOwnedEntry = false
  for (const entry of readdirSync(resolve(repoRoot, 'docs/classification'), { withFileTypes: true })) {
    const repositoryRelative = `docs/classification/${entry.name}`
    if (!entry.isFile() || !allowedClassificationFiles.has(repositoryRelative)) {
      console.error(`DOC_INDEX_DRIFT unexpected owned-path entry ${repositoryRelative}`)
      hasInvalidOwnedEntry = true
    }
  }
  if (hasInvalidOwnedEntry) {
    process.exitCode = 1
    return
  }
  if (mode === '--write') {
    installGeneratedOutputs(repoRoot, outputs)
    return
  }
  for (const [repositoryRelative, content] of outputs) {
    const file = resolve(repoRoot, repositoryRelative)
    if (!existsSync(file) || readFileSync(file, 'utf8') !== content) {
      console.error(`DOC_INDEX_DRIFT ${repositoryRelative}`)
      process.exitCode = 1
    }
  }
}

if (process.argv[2] === '--write' || process.argv[2] === '--check') {
  void run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
