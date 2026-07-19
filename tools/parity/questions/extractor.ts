import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  computeExtractorAuthoringHash,
  deriveObservableCoverage,
  extractorAuthoringSourcePaths,
  fixtureManifestSchema,
  legacyObservableSeedFileSchema,
  legacyObservableTraceCaseSchema,
  type FixtureManifest,
  type LegacyObservableAction,
  type LegacyObservableSeedCase,
  type LegacyObservableTraceCase,
  type LegacyObservableTraceFrame,
} from './contracts.js'
import {
  createAuthoringEnvironment,
  runFixtureAuthoring,
  runFixtureAuthoringCommand,
} from '../shared/authoring.js'
import type {
  AuthoringEnvironment,
  AuthoringHooks,
  AuthoringSource as SharedAuthoringSource,
  CreateAuthoringEnvironmentInput,
  FixtureAuthoringAdapter,
  IgnoredPathFingerprint as SharedIgnoredPathFingerprint,
  PublicationResult as SharedPublicationResult,
  RunFixtureAuthoringOptions,
} from '../shared/contracts.js'

export {
  assertNoFollowPath,
  fingerprintIgnoredPath,
  ignoredExtractorSensitivePaths,
  normalizeGithubRepository,
  sanitizeExternalError,
  trustedTools,
} from '../shared/authoring.js'
import type {
  IgnoredExtractorSensitivePath as SharedIgnoredExtractorSensitivePath,
} from '../shared/authoring.js'
export type {
  ExpectedExtractorLineage,
  ExtractorTools,
  NpmConfigIdentity,
  PublicationCleanupWarning,
  PublicationError,
  PublicationResult,
  SpawnRequest,
  SpawnResult,
  SpawnRole,
} from '../shared/contracts.js'

export const legacySourceIdentity = {
  host: 'github.com',
  owner: 'AnsonHui6040',
  repository: 'ramen-style-today',
  commit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  treeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
} as const

export type IgnoredExtractorSensitivePath = SharedIgnoredExtractorSensitivePath

export type IgnoredPathFingerprint =
  SharedIgnoredPathFingerprint<IgnoredExtractorSensitivePath>

export type ExtractorHooks = AuthoringHooks
export type RunLegacyExtractorOptions = RunFixtureAuthoringOptions

export interface AuthoringSource extends SharedAuthoringSource {
  readonly relativePath: (typeof extractorAuthoringSourcePaths)[number]
}

export interface ExtractorEnvironment extends Omit<
  AuthoringEnvironment,
  'authoringSources'
> {
  readonly authoringSources: readonly AuthoringSource[]
}

interface LegacyExtractorEvidence {
  readonly cases: readonly LegacyObservableTraceCase[]
  readonly manifest: FixtureManifest
  readonly ignoredFingerprintsBefore: readonly IgnoredPathFingerprint[]
  readonly ignoredFingerprintsAfter: readonly IgnoredPathFingerprint[]
}

type SuccessfulPublicationResult = Extract<
  SharedPublicationResult,
  { readonly published: true }
>
type FailedPublicationResult = Extract<
  SharedPublicationResult,
  { readonly status: 'failed' }
>

export type LegacyExtractorResult = LegacyExtractorEvidence & (
  | {
      readonly status: 'verified'
      readonly published: false
      readonly warning?: never
    }
  | SuccessfulPublicationResult
)
export type LegacyExtractorCommandResult =
  | LegacyExtractorResult
  | FailedPublicationResult

export interface CreateExtractorEnvironmentInput extends Omit<
  CreateAuthoringEnvironmentInput,
  'authoringSources'
> {
  readonly authoringSources?: readonly AuthoringSource[]
}

interface ParsedRawTraceCase extends LegacyObservableTraceCase {
  readonly seedIndex: number
}

const extractionSeed = 'ramen-question-observable-v1'
const toolRoot = fileURLToPath(new URL('../../../', import.meta.url))
const defaultAuthoringSources = extractorAuthoringSourcePaths.map((relativePath) => ({
  relativePath,
  path: resolve(toolRoot, relativePath),
}))

function codePointCompare(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!)
  const sharedLength = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => codePointCompare(left, right))
      .map(([key, child]) => [key, stableValue(child)]))
  }
  return value
}

function stableJson(value: unknown) {
  return Buffer.from(`${JSON.stringify(stableValue(value), null, 2)}\n`)
}

function parseQuestionSeeds(input: unknown): readonly LegacyObservableSeedCase[] {
  return legacyObservableSeedFileSchema.parse(input).cases
}

function parseQuestionCases(input: unknown): readonly LegacyObservableTraceCase[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('raw extraction output must be an object')
  }
  const object = input as Record<string, unknown>
  if (
    Object.keys(object).sort().join('\0') !== 'cases\0schemaVersion'
    || object.schemaVersion !== 1
    || !Array.isArray(object.cases)
  ) throw new Error('raw extraction output has an invalid envelope')

  return object.cases.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`raw extraction case ${index} must be an object`)
    }
    const rawCase = value as Record<string, unknown>
    const keys = Object.keys(rawCase).sort().join('\0')
    if (keys === 'actions\0coverageTags\0frames\0id') {
      return legacyObservableTraceCaseSchema.parse(rawCase)
    }
    if (keys !== 'actions\0frames\0id\0seedIndex') {
      throw new Error('raw seed binding mismatch')
    }
    if (
      typeof rawCase.seedIndex !== 'number'
      || typeof rawCase.id !== 'string'
      || !Array.isArray(rawCase.actions)
      || !Array.isArray(rawCase.frames)
    ) throw new Error('raw seed binding mismatch')
    const withoutCoverage = {
      id: rawCase.id,
      actions: rawCase.actions as readonly LegacyObservableAction[],
      frames: rawCase.frames as readonly LegacyObservableTraceFrame[],
    }
    return {
      seedIndex: rawCase.seedIndex,
      ...withoutCoverage,
      coverageTags: [],
    } as ParsedRawTraceCase
  })
}

function validateQuestionTraceCases(
  cases: readonly LegacyObservableTraceCase[],
  seeds: readonly LegacyObservableSeedCase[],
): readonly LegacyObservableTraceCase[] {
  if (cases.length !== seeds.length) throw new Error('raw seed binding mismatch')
  return cases.map((traceCase, index) => {
    const seed = seeds[index]!
    const seedIndex = 'seedIndex' in traceCase
      ? (traceCase as ParsedRawTraceCase).seedIndex
      : index
    if (
      seedIndex !== index
      || traceCase.id !== seed.id
      || JSON.stringify(traceCase.actions) !== JSON.stringify(seed.actions)
    ) throw new Error('raw seed binding mismatch')
    const coverageTags = 'seedIndex' in traceCase
      ? deriveObservableCoverage({
          actions: traceCase.actions,
          frames: traceCase.frames,
        })
      : traceCase.coverageTags
    return legacyObservableTraceCaseSchema.parse({
      id: traceCase.id,
      actions: traceCase.actions,
      coverageTags,
      frames: traceCase.frames,
    })
  })
}

function buildQuestionFixtureManifest(
  input: Parameters<FixtureAuthoringAdapter<
    LegacyObservableSeedCase,
    LegacyObservableTraceCase,
    FixtureManifest
  >['buildManifest']>[0],
) {
  return fixtureManifestSchema.parse({
    fixtureSchemaVersion: 1,
    caseSchemaVersion: 1,
    source: {
      repository: input.expected.identity,
      commit: input.expected.commit,
      treeHash: input.expected.treeHash,
      trackedSourceHashes: input.expected.trackedSourceHashes,
      lockfilePath: input.expected.lockfilePath,
      lockfileHash: input.expected.lockfileHash,
    },
    extractor: {
      version: 1,
      sources: input.authoringSources,
      hash: computeExtractorAuthoringHash(input.authoringSources),
    },
    instrumentation: { version: 1, hash: input.instrumentationHash },
    runtime: {
      nodeVersion: input.expected.nodeVersion,
      npmVersion: input.expected.npmVersion,
      timezone: 'UTC',
      locale: 'C.UTF-8',
      seed: extractionSeed,
      lifecycleScripts: 'disabled',
      extractionNetwork: 'denied',
      dependencies: 'physical-isolated',
      fullSuiteBeforeExtraction: true,
      npmConfigPolicy: {
        userConfig: 'isolated-empty-file',
        globalConfig: 'isolated-empty-file',
        distinctFiles: true,
        npmArgvModified: false,
      },
    },
    caseIds: input.cases.map(({ id }) => id),
    caseCount: input.cases.length,
    fixtureContentHash: input.fixtureContentHash,
  })
}

function serializeQuestionCases(cases: readonly LegacyObservableTraceCase[]) {
  return stableJson({ schemaVersion: 1, cases })
}

function serializeQuestionManifest(manifest: FixtureManifest) {
  return stableJson(manifest)
}

const questionAdapter: FixtureAuthoringAdapter<
  LegacyObservableSeedCase,
  LegacyObservableTraceCase,
  FixtureManifest
> = {
  parseSeeds: parseQuestionSeeds,
  parseRawCases: parseQuestionCases,
  validateCases: validateQuestionTraceCases,
  buildManifest: buildQuestionFixtureManifest,
  serializeCases: serializeQuestionCases,
  serializeManifest: serializeQuestionManifest,
}

export function createExtractorEnvironment(
  input: CreateExtractorEnvironmentInput,
): ExtractorEnvironment {
  const requestedAuthoringSources = input.authoringSources ?? defaultAuthoringSources
  if (
    requestedAuthoringSources.length !== extractorAuthoringSourcePaths.length
    || requestedAuthoringSources.some((source, index) => (
      source.relativePath !== extractorAuthoringSourcePaths[index]
    ))
  ) throw new Error('authoring source set mismatch')
  return createAuthoringEnvironment({
    ...input,
    authoringSources: requestedAuthoringSources,
  }) as ExtractorEnvironment
}

export function runLegacyExtractor(
  environment: ExtractorEnvironment,
  options: RunLegacyExtractorOptions,
): Promise<LegacyExtractorResult> {
  return runFixtureAuthoring(environment, questionAdapter, options) as Promise<
    LegacyExtractorResult
  >
}

export function runLegacyExtractorCommand(
  environment: ExtractorEnvironment,
  options: RunLegacyExtractorOptions,
): Promise<LegacyExtractorCommandResult> {
  return runFixtureAuthoringCommand(environment, questionAdapter, options) as Promise<
    LegacyExtractorCommandResult
  >
}
