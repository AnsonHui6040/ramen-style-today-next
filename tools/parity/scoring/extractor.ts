import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  computeLegacyScoringCasesHash,
  computeObservedScoringCoverage,
  computeScoringExtractorAuthoringHash,
  legacyScoringObservationSchemaVersion,
  legacyScoringRepositoryIdentity,
  legacyScoringSeedFileSchema,
  parseLegacyScoringRawCases,
  scoringExtractorVersion,
  scoringFixtureManifestSchema,
  scoringFixtureSchemaVersion,
  scoringInstrumentationVersion,
  serializeLegacyScoringCases,
  serializeScoringFixtureManifest,
  validateLegacyScoringCases,
  type LegacyScoringObservation,
  type LegacyScoringSeedCase,
  type ScoringFixtureManifest,
} from './contracts.js'
import {
  createAuthoringEnvironment,
  runFixtureAuthoring,
  runFixtureAuthoringCommand,
} from '../shared/authoring.js'
import type {
  AuthoringEnvironment,
  AuthoringSource as SharedAuthoringSource,
  CopyValidatedExpectedExtractorLineage,
  CreateAuthoringEnvironmentInput,
  FixtureAuthoringAdapter,
  FixtureAuthoringCommandResult,
  FixtureAuthoringResult,
  ManifestBuildInput,
  RunFixtureAuthoringOptions,
} from '../shared/contracts.js'

export const scoringLegacyLockfileHash =
  'be7ff42d1012d310916d38c082f63f8b5263981c6bd2ded2ff0f6dabe7fc29d2' as const
export const scoringExtractionNodeVersion = '24.14.0' as const
export const scoringInstalledLockfileHash =
  'b2cfca89d746d1605cc9d14de89b896866b73581ce83f212669b28e1c447cd6e' as const
export const scoringDependencyTreeHash =
  'edbb010c241e278706dc2c0ee44b4f25f03c7423303f19eb23bbeb0f26203826' as const
export const scoringInstrumentationHash =
  'f5369d650f20b9027df8e543a6eb86d4b47340b3ceeb5d23d239bd394ceaa536' as const
export const scoringSeedsHash =
  'eaa143935ac61e9c622c500991d03cd3dc35c03d1ff9bd4d2c5dd39376f7bb57' as const

export const scoringExtractorAuthoringSourcePaths = [
  'tools/parity/shared/contracts.ts',
  'tools/parity/shared/authoring.ts',
  'tools/parity/scoring/contracts.ts',
  'tools/parity/scoring/extractor.ts',
  'tools/parity/scoring/extract.ts',
] as const

export const legacyScoringSourceIdentity = Object.freeze({
  repository: Object.freeze({
    host: legacyScoringRepositoryIdentity.host,
    owner: legacyScoringRepositoryIdentity.owner,
    repository: legacyScoringRepositoryIdentity.repository,
  }),
  commit: legacyScoringRepositoryIdentity.commit,
  treeHash: legacyScoringRepositoryIdentity.treeHash,
})

export const scoringTrackedSourceHashes = Object.freeze({
  'index.html': '6a12466cb2cdf498e30c91572e166b30dd0a8926bec2c32e1bf4e7d3dbd5c1b0',
  'package.json': '6bb13faa4bc9abb2cd603c75e4d1d83e36c2b738e5a348f3c8cc7322656b81ab',
  'public/favicon.svg': '61bc9a161de58248288e6905425d7180f0624c2865007b97d763fdac12043a66',
  'public/ramen-map/data/changhua.json': '08dfc1a418a71aa4cbcf9a982fc17ca36f84963606439778a80d7643fa5ff771',
  'public/ramen-map/data/chiayi-city.json': 'd84176a4ea8ace59b3a0d0b6db8be8c596e46318a7a23cbd149bd7a3115c0511',
  'public/ramen-map/data/chiayi.json': '9ab8989c86ddd9fa60315b4e955a82159940b0b6b878e939aa70f9d9986ad3f5',
  'public/ramen-map/data/hsinchu-city.json': 'e3a6104465f7ca1a51e24423bc63f786cc4c9c3f97965d03827257331795751a',
  'public/ramen-map/data/hsinchu.json': 'cdd87277905d6521e2c997e17df17bd453fd7b94e57ab06f700e98c376e3aa91',
  'public/ramen-map/data/hualien.json': '4ccbad491e9f5aca2dbb242cf671401b1f769b18b416287f90e6d987a3ff231c',
  'public/ramen-map/data/kaohsiung.json': 'b9363ab7243cd0231b8ae02b7df6d8ab9f48851aee141cfae71281537883cc22',
  'public/ramen-map/data/keelung.json': '22c0b6b0faae4eb1fd68a8647813bfbf548f6e09cd04e8d7f3894ace89deabb1',
  'public/ramen-map/data/kinmen.json': 'c629e08d672ec9bae7282633a559d632774e20171b99a822895bc024e5aaa84c',
  'public/ramen-map/data/lienchiang.json': '241fb740c7557ca922711f045b52ec86b60e0ce58dbab1b910144be93e8c754a',
  'public/ramen-map/data/meta.json': '0a87c85cc50c329aa9d4899508b838b6b05443b9b8c9444722dabc86283fc8b3',
  'public/ramen-map/data/miaoli.json': 'b1710403921be0e4f661d66d59f1ca4b5c83a9e7698f9ac7346531a915ecfacb',
  'public/ramen-map/data/nantou.json': '73ee6de286ea4a3c3e0830434c97e30b6303d319b62388fbfbebb8436ad9712f',
  'public/ramen-map/data/new-taipei.json': '6d440b1f272a535dae359a14bb516c509f610eec5d0ee187a976b1736b966bc4',
  'public/ramen-map/data/penghu.json': 'c9d4e8d1df54f3b875502865a64a1931ab5c1bb7c685204d76f8de64c24348d5',
  'public/ramen-map/data/pingtung.json': '6373aeb31997b8a192915ead5334b6b75eadccfc840c7f4cdedea6e12190d144',
  'public/ramen-map/data/taichung.json': '418b9577db81cbff2b3f8e03906e6839fe72dd27e76baab7f93a965116ef3012',
  'public/ramen-map/data/tainan.json': 'c5a826d4f6aebf0781b435438d99054261b4299068b7fbbdd7fa2849f3f661ce',
  'public/ramen-map/data/taipei.json': '294e66a2e6fe146ba18f63550973e2c3584bbab2f49031deede267d61764c3a8',
  'public/ramen-map/data/taitung.json': 'a7ee297554234e172d9096f61d06d049247d1298f2bd4c741b37aea6cab5aa7e',
  'public/ramen-map/data/taoyuan.json': '310936b92e8a5f2bc257ffbe7ba2845d15397706cd9e3e48cabb81f2c7bb9636',
  'public/ramen-map/data/type-profiles.json': '4d443950e633849a15aa1ed09795c00a36f86bb543d42b426faef8881d299b49',
  'public/ramen-map/data/yilan.json': '5d8b13b0a81f64a4329a607c2ad5c6d2c49096c702037059b69e2f29c80626ef',
  'public/ramen-map/data/yunlin.json': '747f3a7e0ae73884a9662eef9f29e258690be16ac156bd3ddd93f6107d6fe4ef',
  'src/App.css': '44957202c3cdc517444844a14776cada493a1cdfc5a3a3c8e4152b08cf5203a3',
  'src/App.test.tsx': '910a681a9af06363ffd05e12e7b4b592a27ab5b5e696a83b876c1d047bebecf1',
  'src/App.tsx': 'fcc56466e6f1cdf970295857efe1aafa0be9a980cc70fb043c7e36b6bdddc244',
  'src/__tests__/config/styles.test.ts': '617d9d03e6d1ba44174f75dff37c2369c9f9e9b25212d20bd8c518bce5e96c03',
  'src/__tests__/domain/ramenMap.test.ts': '10398edb4da3ff5216ed1a609b4a89420bda6d8d4257a48bda886953b2fe74cb',
  'src/__tests__/domain/schema.test.ts': '7f8d3905dfec7a8b25618462e08859ce4482b396ac42dfc0bc49969db7f064b3',
  'src/__tests__/i18n.test.ts': '7a8a6bb97f9d28ee9ffeec046e6c4251f5ef98e15410ae1d9749a667337865bd',
  'src/__tests__/lib/catalog/enricher.test.ts': 'b50947da893f89f3b3ccef66455e13ac50b2525532615151ca0ed220e70607c9',
  'src/__tests__/lib/scoring/fixtures.ts': '750f968d9937d9f37f6857425c8f73fdd090dc4e8beaac42c156309a59c5f330',
  'src/__tests__/lib/scoring/scorer.test.ts': '8f7d14ca8258abb87706db0010dab6b7a67cafdba04013de844465b59318984e',
  'src/config/catalog.ts': 'da92d7fda1e90cc1f073e2efad7c507f5890329fb25697c0fddf4aa3a9c4383a',
  'src/config/questions.ts': '4ee41855fa849d650e0d970cc3e39114ff5f73c648833613e700846bff764906',
  'src/config/styles.ts': '9e8dee82efc4a1dd29cec3e1534f050135812d4031ac2e7c36dda0063860853f',
  'src/data/catalog.json': '4313b1d6a5ed94a985949272775f5d6327541e06108a8738e3cf5e70b5022e3d',
  'src/data/questions.json': '0136f6f71fdc0f09da8da045aa97303069631882ef2a240dd1a9fbc48a8992f2',
  'src/data/styles.json': '207293e50bae4c9459d5506b445f50a798a58439ba52c54e710b3d10ff7d09d3',
  'src/domain/catalog.ts': 'dc7578267c05a737189c3cc8acc052b43be3a1502cac533ff9f0073125b92ed2',
  'src/domain/questionRules.ts': '465a0575ef45ee93cf1843acc1e102802ff28d3203a32bc33f8ab49411742385',
  'src/domain/ramenMap.ts': 'e08fc40347fee40a123de53de33a1ea1709092ba4353411f3548cc213c7b4c10',
  'src/domain/schema.ts': '7c0abe9767fd57d7bbde3209cd4241eafbe0f5c63415947e1efea6ac718cc0a9',
  'src/domain/types.ts': 'b91a35b5db4f8e27204616236f050897d4e9e205f583644084f439a3cb3d343e',
  'src/features/map/RamenFinderMap.test.tsx': '04f992b730290e4f34acf445c84ecdcf89c8ea924b2bea9dd1469880e6c68107',
  'src/features/map/RamenFinderMap.tsx': '661a1abcd6b2266d2805194ada5275d0188f5afd0ebf63021365802aace90500',
  'src/features/map/mapPopupContent.test.ts': '3351e756a8255026321eed5a1c90fe891ab64f0d50c1eceacbb568a8cde738cd',
  'src/features/map/mapPopupContent.ts': 'c10be009739b2fe1b86996e20c2f69c5e1cb105b27b9e4894daa9db4e5746fc6',
  'src/features/questionnaire/QuestionStep.tsx': '7ce2b1e4a49a965a67ae2303c0bd25005365330189ac95f1ec4561ca7f4f0e9b',
  'src/features/results/ResultsPanel.test.tsx': '7182d2f15b90746b41ad03e0688a43ef2c159e500c87a8c76023380cbc527ace',
  'src/features/results/ResultsPanel.tsx': 'bbbb4a988a40f57ef1d039cf7db74903c7d0ecef5ec1b6bfa6a295917db2455e',
  'src/i18n.ts': '0910482554ae6e2d21f9fd1ceef5f7961ddb5f718fa896656e19d23e5b5288b1',
  'src/index.css': '12a982d4b66f335c995402c1a8df74ce8881c791a58b0d8d8099c38eeececa7e',
  'src/lib/catalog/enricher.ts': '6a54d613dbd3294b397a643729990b3ff01e4aef4982fedec8fc35e1b920a8d7',
  'src/lib/scoring/explainer.ts': 'ee2f58df6b145184c3107a83c8679348d8f868846c2ba2669b38d189c41b6de1',
  'src/lib/scoring/scorer.ts': 'befc80c7d648712968a2fee74eab8825feb1d583f4e3bbd35478684c27846cfe',
  'src/main.tsx': '6e9e5807fcbd48b75a96db5cbef36c996262196be42e6d4760dc86babbe61ad2',
  'src/test/setup.ts': '24bfe9f743e71f5992b8b0b85e757e6a0937c6f3cbd5966691c03b450b2b5c39',
  'tsconfig.app.json': 'ee487b7e4e869055507d4eff0383f14515e07e3f0e433213b2f1e6e04f0de907',
  'tsconfig.json': '770b4140bbb581e2dfd9ea9946ffc9c75a1d86ba7d2db5f77c83e37cbdf9d808',
  'tsconfig.node.json': '90a22c920cbc14624fb4658b58f15c875abf3234224f3933f211849c3ada3242',
  'vite.config.ts': '0ebe1b813bdeb70dcfea7673d502bb30fb2928936d3bca5d2dcae9c2b8a23065',
})

export const legacyScoringTrackedSourceCount = 66 as const
export const legacyScoringTrackedSourceHashesHash =
  '620205eb20d687bc750973d97b6877018d1ea9fb62e591f7bac1eadd22e1084a' as const

function canonicalTrackedSourceBytes(hashes: Readonly<Record<string, string>>) {
  const ordered = Object.fromEntries(Object.entries(hashes)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
  return `${JSON.stringify(ordered, null, 2)}\n`
}

export function computeLegacyScoringTrackedSourceHashesHash(
  hashes: Readonly<Record<string, string>>,
) {
  return createHash('sha256')
    .update('ramen-legacy-style-tracked-sources-v1\0')
    .update(canonicalTrackedSourceBytes(hashes))
    .digest('hex')
}

export const scoringInstrumentationDescriptor = Object.freeze({
  targets: Object.freeze([
    Object.freeze({ path: 'src/lib/scoring/scorer.ts', status: ' M' as const }),
    Object.freeze({ path: 'src/parity-scoring-observer.test.ts', status: '??' as const }),
  ]),
  extractionTestPath: 'src/parity-scoring-observer.test.ts',
  dependencyProvisioning: Object.freeze({
    kind: 'copy-validated' as const,
    sourcePath: 'node_modules' as const,
    installedLockfilePath: 'node_modules/.package-lock.json' as const,
    installedLockfileHash: scoringInstalledLockfileHash,
    dependencyTreeHash: scoringDependencyTreeHash,
  }),
})

export const scoringExpectedLineage: CopyValidatedExpectedExtractorLineage = Object.freeze({
  identity: legacyScoringSourceIdentity.repository,
  commit: legacyScoringSourceIdentity.commit,
  treeHash: legacyScoringSourceIdentity.treeHash,
  trackedSourceHashes: scoringTrackedSourceHashes,
  lockfilePath: 'package-lock.json',
  lockfileHash: scoringLegacyLockfileHash,
  patchHash: scoringInstrumentationHash,
  seedsHash: scoringSeedsHash,
  nodeVersion: scoringExtractionNodeVersion,
})

export interface ScoringAuthoringSource extends SharedAuthoringSource {
  readonly relativePath: (typeof scoringExtractorAuthoringSourcePaths)[number]
}

export interface ScoringExtractorEnvironment extends Omit<
  AuthoringEnvironment<CopyValidatedExpectedExtractorLineage>,
  'authoringSources'
> {
  readonly authoringSources: readonly ScoringAuthoringSource[]
}

export interface CreateScoringExtractorEnvironmentInput extends Omit<
  CreateAuthoringEnvironmentInput<CopyValidatedExpectedExtractorLineage>,
  'authoringSources' | 'expected' | 'instrumentation'
> {
  readonly authoringSources?: readonly ScoringAuthoringSource[]
}

export type ScoringExtractorResult = FixtureAuthoringResult<
  LegacyScoringObservation,
  ScoringFixtureManifest
>
export type ScoringExtractorCommandResult = FixtureAuthoringCommandResult<
  LegacyScoringObservation,
  ScoringFixtureManifest
>

const toolRoot = fileURLToPath(new URL('../../../', import.meta.url))
const defaultAuthoringSources = scoringExtractorAuthoringSourcePaths.map((relativePath) => ({
  relativePath,
  path: resolve(toolRoot, relativePath),
}))

function buildScoringFixtureManifest(
  input: ManifestBuildInput<
    LegacyScoringObservation,
    CopyValidatedExpectedExtractorLineage
  >,
) {
  if (input.dependencyProvisioning.kind !== 'copy-validated') {
    throw new Error('scoring manifest requires copy-validated dependencies')
  }
  return scoringFixtureManifestSchema.parse({
    fixtureSchemaVersion: scoringFixtureSchemaVersion,
    source: {
      repository: input.expected.identity,
      commit: input.expected.commit,
      treeHash: input.expected.treeHash,
      trackedSourceHashes: input.expected.trackedSourceHashes,
      lockfilePath: input.expected.lockfilePath,
      lockfileHash: input.expected.lockfileHash,
    },
    extractor: {
      version: scoringExtractorVersion,
      sources: input.authoringSources,
      hash: computeScoringExtractorAuthoringHash(input.authoringSources),
    },
    instrumentation: {
      version: scoringInstrumentationVersion,
      hash: input.instrumentationHash,
    },
    seeds: {
      schemaVersion: legacyScoringObservationSchemaVersion,
      hash: input.expected.seedsHash,
    },
    runtime: {
      nodeVersion: input.expected.nodeVersion,
      timezone: 'UTC',
      locale: 'C.UTF-8',
      dependencies: 'copy-validated',
      installedLockfileHash: input.dependencyProvisioning.installedLockfileHash,
      dependencyTreeHash: input.dependencyProvisioning.dependencyTreeHash,
      network: 'denied',
      fullSuiteBeforeExtraction: true,
    },
    orderedCaseIds: input.cases.map(({ id }) => id),
    coverage: computeObservedScoringCoverage(input.cases),
    caseCount: input.cases.length,
    casesHash: computeLegacyScoringCasesHash(input.cases),
    fixtureContentHash: input.fixtureContentHash,
  })
}

export const scoringAuthoringAdapter: FixtureAuthoringAdapter<
  LegacyScoringSeedCase,
  LegacyScoringObservation,
  ScoringFixtureManifest,
  CopyValidatedExpectedExtractorLineage
> = {
  parseSeeds: (input) => legacyScoringSeedFileSchema.parse(input).cases,
  parseRawCases: parseLegacyScoringRawCases,
  validateCases: validateLegacyScoringCases,
  buildManifest: buildScoringFixtureManifest,
  serializeCases: serializeLegacyScoringCases,
  serializeManifest: serializeScoringFixtureManifest,
}

export function createScoringExtractorEnvironment(
  input: CreateScoringExtractorEnvironmentInput,
): ScoringExtractorEnvironment {
  const authoringSources = input.authoringSources ?? defaultAuthoringSources
  if (
    authoringSources.length !== scoringExtractorAuthoringSourcePaths.length
    || authoringSources.some((source, index) => (
      source.relativePath !== scoringExtractorAuthoringSourcePaths[index]
    ))
  ) throw new Error('scoring authoring source set mismatch')
  return createAuthoringEnvironment({
    ...input,
    authoringSources,
    expected: scoringExpectedLineage,
    instrumentation: scoringInstrumentationDescriptor,
  }) as ScoringExtractorEnvironment
}

export function runScoringExtractor(
  environment: ScoringExtractorEnvironment,
  options: RunFixtureAuthoringOptions,
): Promise<ScoringExtractorResult> {
  return runFixtureAuthoring(environment, scoringAuthoringAdapter, options)
}

export function runScoringExtractorCommand(
  environment: ScoringExtractorEnvironment,
  options: RunFixtureAuthoringOptions,
): Promise<ScoringExtractorCommandResult> {
  return runFixtureAuthoringCommand(environment, scoringAuthoringAdapter, options)
}
