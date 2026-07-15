import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import {
  canonicalizeLegacyPersistenceCases,
  computeLegacyPersistenceCasesHash,
  legacyPersistenceCaseIds,
  parseLegacyPersistenceObservationCase,
  parseLegacyPersistenceSeedFile,
  type LegacyPersistenceObservationCase,
  type LegacyPersistenceSeedCase,
} from './contracts.js'
import {
  createAuthoringEnvironment,
  runFixtureAuthoring,
  runFixtureAuthoringCommand,
} from '../shared/authoring.js'
import type {
  AuthoringEnvironment,
  AuthoringSource as SharedAuthoringSource,
  CreateAuthoringEnvironmentInput,
  FixtureAuthoringAdapter,
  FixtureAuthoringResult,
  FixtureAuthoringCommandResult,
  ManifestBuildInput,
  RunFixtureAuthoringOptions,
} from '../shared/contracts.js'

export const persistenceExtractorAuthoringSourcePaths = [
  'tools/parity/shared/contracts.ts',
  'tools/parity/shared/authoring.ts',
  'tools/parity/persistence/contracts.ts',
  'tools/parity/persistence/extractor.ts',
  'tools/parity/persistence/extract.ts',
] as const

export const persistenceFixtureSchemaVersion = '1' as const
export const persistenceExtractorVersion = '1' as const
export const persistenceInstrumentationVersion = '1' as const

export const legacyPersistenceSourceIdentity = {
  repository: {
    host: 'github.com',
    owner: 'AnsonHui6040',
    repository: 'ramen-style-today',
  },
  commit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  treeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
} as const

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const repositoryPathSchema = z.string().min(1).max(512).refine((value) => (
  !value.startsWith('/')
    && !value.includes('\\')
    && value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
), 'expected a repository-relative path')

const authoringSourcesSchema = z.tuple([
  z.strictObject({
    path: z.literal(persistenceExtractorAuthoringSourcePaths[0]),
    hash: sha256Schema,
  }),
  z.strictObject({
    path: z.literal(persistenceExtractorAuthoringSourcePaths[1]),
    hash: sha256Schema,
  }),
  z.strictObject({
    path: z.literal(persistenceExtractorAuthoringSourcePaths[2]),
    hash: sha256Schema,
  }),
  z.strictObject({
    path: z.literal(persistenceExtractorAuthoringSourcePaths[3]),
    hash: sha256Schema,
  }),
  z.strictObject({
    path: z.literal(persistenceExtractorAuthoringSourcePaths[4]),
    hash: sha256Schema,
  }),
])

const orderedCaseIdsSchema = z.tuple([
  z.literal(legacyPersistenceCaseIds[0]),
  z.literal(legacyPersistenceCaseIds[1]),
  z.literal(legacyPersistenceCaseIds[2]),
  z.literal(legacyPersistenceCaseIds[3]),
  z.literal(legacyPersistenceCaseIds[4]),
  z.literal(legacyPersistenceCaseIds[5]),
])

function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>()
  const freeze = (current: unknown): void => {
    if (!current || typeof current !== 'object' || seen.has(current)) return
    seen.add(current)
    for (const child of Object.values(current)) freeze(child)
    Object.freeze(current)
  }
  freeze(value)
  return value
}

export function computePersistenceExtractorHash(
  sources: readonly { readonly path: string; readonly hash: string }[],
) {
  const digest = createHash('sha256')
  digest.update('ramen-persistence-extractor-authoring-v1\0')
  for (const source of sources) {
    digest.update(source.path)
    digest.update('\0')
    digest.update(source.hash)
    digest.update('\0')
  }
  return digest.digest('hex')
}

const manifestSchema = z.strictObject({
  fixtureSchemaVersion: z.literal(persistenceFixtureSchemaVersion),
  extractor: z.strictObject({
    version: z.literal(persistenceExtractorVersion),
    hash: sha256Schema,
    sources: authoringSourcesSchema,
  }),
  instrumentation: z.strictObject({
    version: z.literal(persistenceInstrumentationVersion),
    hash: sha256Schema,
  }),
  source: z.strictObject({
    repository: z.strictObject({
      host: z.literal(legacyPersistenceSourceIdentity.repository.host),
      owner: z.literal(legacyPersistenceSourceIdentity.repository.owner),
      repository: z.literal(legacyPersistenceSourceIdentity.repository.repository),
    }),
    commit: z.literal(legacyPersistenceSourceIdentity.commit),
    treeHash: z.literal(legacyPersistenceSourceIdentity.treeHash),
    lockfilePath: z.literal('package-lock.json'),
    lockfileHash: sha256Schema,
    trackedSourceHashes: z.record(repositoryPathSchema, sha256Schema),
  }),
  runtime: z.strictObject({
    nodeVersion: z.string().regex(/^24\.[0-9]+\.[0-9]+$/),
    npmVersion: z.string().regex(/^11\.[0-9]+\.[0-9]+$/),
    timezone: z.literal('UTC'),
    locale: z.literal('C.UTF-8'),
    dependencies: z.literal('physical-isolated'),
    extractionNetwork: z.literal('denied'),
    lifecycleScripts: z.literal('disabled'),
    npmConfigPolicy: z.strictObject({
      userConfig: z.literal('isolated-empty-file'),
      globalConfig: z.literal('isolated-empty-file'),
      distinctFiles: z.literal(true),
      npmArgvModified: z.literal(false),
    }),
  }),
  orderedCaseIds: orderedCaseIdsSchema,
  caseCount: z.literal(legacyPersistenceCaseIds.length),
  casesHash: sha256Schema,
}).superRefine((manifest, context) => {
  if (manifest.extractor.hash !== computePersistenceExtractorHash(manifest.extractor.sources)) {
    context.addIssue({
      code: 'custom',
      path: ['extractor', 'hash'],
      message: 'extractor hash must match ordered authoring sources',
    })
  }
}).transform((value) => deepFreeze(value))

export const persistenceFixtureManifestSchema = manifestSchema
export type PersistenceFixtureManifest = z.infer<typeof manifestSchema>

const forbiddenObservationKeys = new Set([
  'canonicalAnswers',
  'compatibility',
  'createdAt',
  'currentImplementationSha',
  'currentV1',
  'diagnostics',
  'flowState',
  'implementationSha',
  'migrations',
  'normalizedPayload',
  'questionModelVersion',
  'questionSemanticHash',
  'repairs',
  'resumeQuestionId',
  'savedAt',
  'sourcePath',
  'stack',
  'temporaryPath',
  'timestamp',
  'token',
  'updatedAt',
  'writeBackRequired',
])

function assertObservationValue(value: unknown, ancestors: WeakSet<object>): void {
  if (typeof value === 'string') {
    if (
      /^(?:file:)?\/(?:Users|home|private\/tmp|tmp)\//i.test(value)
      || /^[A-Za-z]:\\/.test(value)
    ) throw new Error('frozen persistence observation contains a machine path')
    return
  }
  if (!value || typeof value !== 'object') return
  if (ancestors.has(value)) throw new Error('frozen persistence observation contains a cycle')
  ancestors.add(value)
  if (Array.isArray(value)) {
    for (const entry of value) assertObservationValue(entry, ancestors)
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenObservationKeys.has(key)) {
        throw new Error('frozen persistence observation contains current-only metadata')
      }
      assertObservationValue(child, ancestors)
    }
  }
  ancestors.delete(value)
}

export function assertFrozenObservationBoundary(
  observation: LegacyPersistenceObservationCase,
) {
  assertObservationValue(observation, new WeakSet())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parsePersistenceRawCases(
  input: unknown,
): readonly LegacyPersistenceObservationCase[] {
  let rawCases: unknown[]
  if (Array.isArray(input)) {
    rawCases = input
  } else {
    if (!isRecord(input)) throw new Error('persistence cases must be an array or raw envelope')
    if (
      Object.keys(input).sort().join('\0') !== 'cases\0schemaVersion'
      || input.schemaVersion !== 1
      || !Array.isArray(input.cases)
    ) throw new Error('raw persistence extraction envelope is invalid')
    rawCases = input.cases
  }
  return deepFreeze(rawCases.map((entry) => parseLegacyPersistenceObservationCase(entry)))
}

export function validatePersistenceCases(
  cases: readonly LegacyPersistenceObservationCase[],
  seeds: readonly LegacyPersistenceSeedCase[],
): readonly LegacyPersistenceObservationCase[] {
  if (cases.length !== legacyPersistenceCaseIds.length || cases.length !== seeds.length) {
    throw new Error('persistence case count does not match ordered seeds')
  }
  const validated = cases.map((entry, index) => {
    const observation = parseLegacyPersistenceObservationCase(entry)
    const seed = seeds[index]
    if (!seed || observation.id !== legacyPersistenceCaseIds[index] || observation.id !== seed.id) {
      throw new Error('persistence case order does not match ordered seeds')
    }
    if (observation.kind !== seed.kind) {
      throw new Error('persistence observation kind does not match its seed')
    }
    if (observation.kind === 'legacy-write-observation') {
      if (
        seed.kind !== 'legacy-write-observation'
        || canonicalJson(observation.actions) !== canonicalJson(seed.actions)
      ) throw new Error('persistence public actions do not match their seed')
    } else if (
      seed.kind !== 'legacy-restore-observation'
      || canonicalJson(observation.legacyInput) !== canonicalJson(seed.legacyInput)
    ) {
      throw new Error('persistence legacy input does not match its seed')
    }
    assertFrozenObservationBoundary(observation)
    return observation
  })
  return deepFreeze(validated)
}

function codePointCompare(left: string, right: string) {
  const leftIterator = left[Symbol.iterator]()
  const rightIterator = right[Symbol.iterator]()
  while (true) {
    const leftResult = leftIterator.next()
    const rightResult = rightIterator.next()
    if (leftResult.done || rightResult.done) {
      if (leftResult.done === rightResult.done) return 0
      return leftResult.done ? -1 : 1
    }
    const difference = leftResult.value.codePointAt(0)! - rightResult.value.codePointAt(0)!
    if (difference !== 0) return difference
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => codePointCompare(left, right))
        .map(([key, child]) => [key, stableValue(child)]),
    )
  }
  return value
}

function canonicalJson(value: unknown) {
  return JSON.stringify(stableValue(value))
}

function stableJson(value: unknown) {
  return Buffer.from(`${JSON.stringify(stableValue(value), null, 2)}\n`)
}

export function serializePersistenceCases(
  cases: readonly LegacyPersistenceObservationCase[],
) {
  return stableJson(JSON.parse(canonicalizeLegacyPersistenceCases(cases)) as unknown)
}

export function serializePersistenceManifest(manifest: PersistenceFixtureManifest) {
  return stableJson(persistenceFixtureManifestSchema.parse(manifest))
}

export function buildPersistenceFixtureManifest(
  input: ManifestBuildInput<LegacyPersistenceObservationCase>,
): PersistenceFixtureManifest {
  return persistenceFixtureManifestSchema.parse({
    fixtureSchemaVersion: persistenceFixtureSchemaVersion,
    extractor: {
      version: persistenceExtractorVersion,
      sources: input.authoringSources,
      hash: computePersistenceExtractorHash(input.authoringSources),
    },
    instrumentation: {
      version: persistenceInstrumentationVersion,
      hash: input.instrumentationHash,
    },
    source: {
      repository: input.expected.identity,
      commit: input.expected.commit,
      treeHash: input.expected.treeHash,
      lockfilePath: input.expected.lockfilePath,
      lockfileHash: input.expected.lockfileHash,
      trackedSourceHashes: input.expected.trackedSourceHashes,
    },
    runtime: {
      nodeVersion: input.expected.nodeVersion,
      npmVersion: input.expected.npmVersion,
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
    orderedCaseIds: input.cases.map(({ id }) => id),
    caseCount: input.cases.length,
    casesHash: computeLegacyPersistenceCasesHash(input.cases),
  })
}

function parsePersistenceSeeds(input: unknown) {
  return parseLegacyPersistenceSeedFile(input).cases
}

export const persistenceFixtureAuthoringAdapter: FixtureAuthoringAdapter<
  LegacyPersistenceSeedCase,
  LegacyPersistenceObservationCase,
  PersistenceFixtureManifest
> = {
  parseSeeds: parsePersistenceSeeds,
  parseRawCases: parsePersistenceRawCases,
  validateCases: validatePersistenceCases,
  buildManifest: buildPersistenceFixtureManifest,
  serializeCases: serializePersistenceCases,
  serializeManifest: serializePersistenceManifest,
}

const toolRoot = fileURLToPath(new URL('../../../', import.meta.url))
const defaultAuthoringSources = persistenceExtractorAuthoringSourcePaths.map((relativePath) => ({
  relativePath,
  path: resolve(toolRoot, relativePath),
}))

export interface PersistenceAuthoringSource extends SharedAuthoringSource {
  readonly relativePath: (typeof persistenceExtractorAuthoringSourcePaths)[number]
}

export interface PersistenceExtractorEnvironment extends Omit<
  AuthoringEnvironment,
  'authoringSources'
> {
  readonly authoringSources: readonly PersistenceAuthoringSource[]
}

export interface CreatePersistenceExtractorEnvironmentInput extends Omit<
  CreateAuthoringEnvironmentInput,
  'authoringSources'
> {
  readonly authoringSources?: readonly PersistenceAuthoringSource[]
}

export type PersistenceExtractorResult = FixtureAuthoringResult<
  LegacyPersistenceObservationCase,
  PersistenceFixtureManifest
>

export type PersistenceExtractorCommandResult = FixtureAuthoringCommandResult<
  LegacyPersistenceObservationCase,
  PersistenceFixtureManifest
>

export function createPersistenceExtractorEnvironment(
  input: CreatePersistenceExtractorEnvironmentInput,
): PersistenceExtractorEnvironment {
  const requestedSources = input.authoringSources ?? defaultAuthoringSources
  if (
    requestedSources.length !== persistenceExtractorAuthoringSourcePaths.length
    || requestedSources.some((source, index) => (
      source.relativePath !== persistenceExtractorAuthoringSourcePaths[index]
    ))
  ) throw new Error('persistence authoring source set mismatch')
  return createAuthoringEnvironment({
    ...input,
    authoringSources: requestedSources,
  }) as PersistenceExtractorEnvironment
}

export function runLegacyPersistenceExtractor(
  environment: PersistenceExtractorEnvironment,
  options: RunFixtureAuthoringOptions,
): Promise<PersistenceExtractorResult> {
  return runFixtureAuthoring(
    environment,
    persistenceFixtureAuthoringAdapter,
    options,
  )
}

export function runLegacyPersistenceExtractorCommand(
  environment: PersistenceExtractorEnvironment,
  options: RunFixtureAuthoringOptions,
): Promise<PersistenceExtractorCommandResult> {
  return runFixtureAuthoringCommand(
    environment,
    persistenceFixtureAuthoringAdapter,
    options,
  )
}
