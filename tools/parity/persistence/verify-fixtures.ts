import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  computePersistenceExtractorHash,
  legacyPersistenceSourceIdentity,
  parsePersistenceRawCases,
  persistenceExtractorAuthoringSourcePaths,
  persistenceFixtureManifestSchema,
  serializePersistenceCases,
  serializePersistenceManifest,
  validatePersistenceCases,
  type PersistenceFixtureManifest,
} from './extractor.js'
import {
  computeLegacyPersistenceCasesHash,
  parseLegacyPersistenceSeedFile,
} from './contracts.js'
import {
  persistenceExtractionNodeVersion,
  persistenceExtractionNpmVersion,
  persistenceLegacyLockfileHash,
  persistenceSeedsHash,
  persistenceTrackedSourceHashes,
} from './extract.js'
import { sanitizeExternalError } from '../shared/authoring.js'

export interface PersistenceFixtureVerificationInput {
  readonly casesBytes: Uint8Array
  readonly manifestBytes: Uint8Array
  readonly instrumentationBytes: Uint8Array
  readonly seedBytes: Uint8Array
  readonly expectedSeedHash: string
  readonly expectedSource: PersistenceFixtureManifest['source']
  readonly expectedRuntime: PersistenceFixtureManifest['runtime']
  readonly authoringSources: readonly {
    readonly path: (typeof persistenceExtractorAuthoringSourcePaths)[number]
    readonly bytes: Uint8Array
  }[]
}

export interface PersistenceFixtureVerificationResult {
  readonly status: 'pass'
  readonly caseCount: number
  readonly casesHash: string
  readonly manifestHash: string
  readonly instrumentationHash: string
  readonly extractorVersion: string
}

function sha256(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex')
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  return Buffer.from(left).equals(Buffer.from(right))
}

function validateAuthoringSources(
  input: PersistenceFixtureVerificationInput,
  manifest: PersistenceFixtureManifest,
) {
  if (
    input.authoringSources.length !== persistenceExtractorAuthoringSourcePaths.length
    || input.authoringSources.some((source, index) => (
      source.path !== persistenceExtractorAuthoringSourcePaths[index]
    ))
  ) throw new Error('persistence authoring source set drifted')
  const identities = input.authoringSources.map(({ path, bytes }) => ({
    path,
    hash: sha256(bytes),
  }))
  if (
    JSON.stringify(identities) !== JSON.stringify(manifest.extractor.sources)
    || computePersistenceExtractorHash(identities) !== manifest.extractor.hash
  ) throw new Error('persistence authoring source identity drifted')
}

function validateSourceIdentity(
  actual: PersistenceFixtureManifest['source'],
  expected: PersistenceFixtureManifest['source'],
) {
  if (
    actual.repository.host !== expected.repository.host
    || actual.repository.owner !== expected.repository.owner
    || actual.repository.repository !== expected.repository.repository
    || actual.commit !== expected.commit
    || actual.treeHash !== expected.treeHash
    || actual.lockfilePath !== expected.lockfilePath
    || actual.lockfileHash !== expected.lockfileHash
    || JSON.stringify(actual.trackedSourceHashes) !== JSON.stringify(expected.trackedSourceHashes)
  ) throw new Error('persistence legacy source identity drifted')
}

function validateRuntimeIdentity(
  actual: PersistenceFixtureManifest['runtime'],
  expected: PersistenceFixtureManifest['runtime'],
) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('persistence extractor runtime identity drifted')
  }
}

export function verifyPersistenceFixtureSet(
  input: PersistenceFixtureVerificationInput,
): PersistenceFixtureVerificationResult {
  if (sha256(input.seedBytes) !== input.expectedSeedHash) {
    throw new Error('persistence seed byte identity drifted')
  }
  const frozenInput = parseJson(input.casesBytes, 'persistence cases')
  if (!Array.isArray(frozenInput)) {
    throw new Error('frozen persistence cases must be a top-level array')
  }
  const seeds = parseLegacyPersistenceSeedFile(
    parseJson(input.seedBytes, 'persistence seeds'),
  ).cases
  const cases = validatePersistenceCases(
    parsePersistenceRawCases(frozenInput),
    seeds,
  )
  if (!bytesEqual(input.casesBytes, serializePersistenceCases(cases))) {
    throw new Error('persistence fixture case bytes drifted')
  }

  const manifest = persistenceFixtureManifestSchema.parse(
    parseJson(input.manifestBytes, 'persistence manifest'),
  )
  if (!bytesEqual(input.manifestBytes, serializePersistenceManifest(manifest))) {
    throw new Error('persistence fixture manifest bytes drifted')
  }
  validateSourceIdentity(manifest.source, input.expectedSource)
  validateRuntimeIdentity(manifest.runtime, input.expectedRuntime)
  const casesHash = computeLegacyPersistenceCasesHash(cases)
  if (
    manifest.casesHash !== casesHash
    || manifest.caseCount !== cases.length
    || JSON.stringify(manifest.orderedCaseIds) !== JSON.stringify(cases.map(({ id }) => id))
  ) throw new Error('persistence fixture corpus identity drifted')

  const instrumentationHash = sha256(input.instrumentationBytes)
  if (manifest.instrumentation.hash !== instrumentationHash) {
    throw new Error('persistence instrumentation identity drifted')
  }
  validateAuthoringSources(input, manifest)

  return Object.freeze({
    status: 'pass',
    caseCount: cases.length,
    casesHash,
    manifestHash: sha256(input.manifestBytes),
    instrumentationHash,
    extractorVersion: manifest.extractor.version,
  })
}

const defaultToolRoot = fileURLToPath(new URL('../../../', import.meta.url))

export function verifyCommittedPersistenceFixtures(
  toolRoot = defaultToolRoot,
): PersistenceFixtureVerificationResult {
  const fixtureRoot = resolve(
    toolRoot,
    'tools/parity/fixtures/persistence/legacy-unversioned',
  )
  return verifyPersistenceFixtureSet({
    casesBytes: readFileSync(resolve(fixtureRoot, 'cases.json')),
    manifestBytes: readFileSync(resolve(fixtureRoot, 'manifest.json')),
    instrumentationBytes: readFileSync(resolve(
      toolRoot,
      'tools/parity/persistence/legacy-instrumentation.patch',
    )),
    seedBytes: readFileSync(resolve(toolRoot, 'tools/parity/persistence/seeds.json')),
    expectedSeedHash: persistenceSeedsHash,
    expectedSource: {
      repository: legacyPersistenceSourceIdentity.repository,
      commit: legacyPersistenceSourceIdentity.commit,
      treeHash: legacyPersistenceSourceIdentity.treeHash,
      lockfilePath: 'package-lock.json',
      lockfileHash: persistenceLegacyLockfileHash,
      trackedSourceHashes: persistenceTrackedSourceHashes,
    },
    expectedRuntime: {
      nodeVersion: persistenceExtractionNodeVersion,
      npmVersion: persistenceExtractionNpmVersion,
      timezone: 'UTC',
      locale: 'C.UTF-8',
      dependencies: 'physical-isolated',
      extractionNetwork: 'denied',
      lifecycleScripts: 'disabled',
      npmConfigPolicy: {
        userConfig: 'isolated-empty-file',
        globalConfig: 'isolated-empty-file',
        distinctFiles: true,
        npmArgvModified: false,
      },
    },
    authoringSources: persistenceExtractorAuthoringSourcePaths.map((path) => ({
      path,
      bytes: readFileSync(resolve(toolRoot, path)),
    })),
  })
}

export function main(arguments_: readonly string[]) {
  if (arguments_.length !== 0) throw new Error('Usage: verify-fixtures.ts')
  const result = verifyCommittedPersistenceFixtures()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${sanitizeExternalError(error, 300)}\n`)
    process.exitCode = 1
  }
}
