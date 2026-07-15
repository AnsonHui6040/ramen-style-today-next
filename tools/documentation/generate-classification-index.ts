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
} from '@ramen-style/classification-core/compiler'
import { migrationLedgerSchema } from '../migration/ledger-schema.js'
import {
  fixtureManifestSchema,
  questionParitySuiteVersion,
} from '../parity/questions/contracts.js'
import {
  buildDocumentation,
  type PersistenceDocumentationEvidence,
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
    ...item.validators,
    ...item.consumers,
    ...item.tests,
    ...item.migrations,
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
