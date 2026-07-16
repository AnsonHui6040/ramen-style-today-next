import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  computeLegacyStyleCasesHash,
  computeStyleExtractorAuthoringHash,
  legacyStyleSeedFileSchema,
  parseLegacyStyleRawCases,
  serializeLegacyStyleCases,
  serializeStyleFixtureManifest,
  styleFixtureManifestSchema,
  styleInstrumentationHash,
  styleSeedsHash,
  validateLegacyStyleCases,
  type StyleFixtureManifest,
} from './contracts.js'

export const styleFixtureAuthoringSourcePaths = [
  'tools/parity/shared/contracts.ts',
  'tools/parity/shared/authoring.ts',
  'tools/parity/styles/contracts.ts',
  'tools/parity/styles/extractor.ts',
  'tools/parity/styles/extract.ts',
] as const

const expectedLegacyStyleCasesHash =
  'cd48d42b596e1d7d71757a8cec109f7787d21596a8905a06c505fefbd0f93517' as const
const expectedStyleAuthoringHash =
  'e374b19e76fddf2f6d2c736ccdcacd2f04b6c54269d455cb384ca0ddbd957621' as const
const expectedCoverage = Object.freeze({
  styles: 18,
  cores: 54,
  subtypes: 270,
  rules: 378,
  bonusCopies: 54,
  conflictCopies: 21,
  exclusionTags: 6,
  copyRoles: 8,
})

type StyleFixtureAuthoringSourcePath = (typeof styleFixtureAuthoringSourcePaths)[number]

export interface StyleFixtureVerificationInput {
  readonly casesBytes: Uint8Array
  readonly manifestBytes: Uint8Array
  readonly instrumentationBytes: Uint8Array
  readonly seedBytes: Uint8Array
  readonly authoringSources: readonly {
    readonly path: StyleFixtureAuthoringSourcePath
    readonly bytes: Uint8Array
  }[]
}

export interface StyleFixtureVerificationResult {
  readonly status: 'pass'
  readonly caseCount: 1
  readonly casesHash: string
  readonly fixtureContentHash: string
  readonly manifestHash: string
  readonly instrumentationHash: string
  readonly seedsHash: string
  readonly authoringHash: string
  readonly coverage: typeof expectedCoverage
}

function sha256(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex')
}

function requireBytes(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new Error(`${label} bytes are missing`)
  }
  return value
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

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function validateAuthoringSources(
  input: StyleFixtureVerificationInput,
  manifest: StyleFixtureManifest,
) {
  if (
    !Array.isArray(input.authoringSources)
    || input.authoringSources.length !== styleFixtureAuthoringSourcePaths.length
    || input.authoringSources.some((source, index) => (
      source.path !== styleFixtureAuthoringSourcePaths[index]
      || !(source.bytes instanceof Uint8Array)
      || source.bytes.byteLength === 0
    ))
  ) throw new Error('style authoring source set drifted')

  const identities = input.authoringSources.map(({ path, bytes }) => ({
    path,
    hash: sha256(bytes),
  }))
  const authoringHash = computeStyleExtractorAuthoringHash(identities)
  if (
    !sameValue(identities, manifest.extractor.sources)
    || manifest.extractor.hash !== authoringHash
    || authoringHash !== expectedStyleAuthoringHash
  ) throw new Error('style authoring source identity drifted')
  return authoringHash
}

function validateCorpusIdentity(
  manifest: StyleFixtureManifest,
  cases: ReturnType<typeof validateLegacyStyleCases>,
  casesHash: string,
  fixtureContentHash: string,
) {
  const catalog = cases[0]
  if (!catalog || cases.length !== 1) throw new Error('style corpus identity drifted')
  const orderedAdjustmentCopyIds = catalog.adjustments.map((adjustment) => ([
    adjustment.kind,
    adjustment.id,
    adjustment.parentCoreId,
    adjustment.sourceRole,
    adjustment.sourceOrdinal,
  ].join(':')))
  if (
    casesHash !== expectedLegacyStyleCasesHash
    || manifest.casesHash !== casesHash
    || manifest.fixtureContentHash !== fixtureContentHash
    || manifest.caseCount !== 1
    || !sameValue(manifest.coverage, expectedCoverage)
    || !sameValue(catalog.coverage, expectedCoverage)
    || !sameValue(manifest.orderedStyleIds, catalog.styles.map(({ id }) => id))
    || !sameValue(manifest.orderedCoreIds, catalog.cores.map(({ id }) => id))
    || !sameValue(manifest.orderedSubtypeIds, catalog.subtypes.map(({ id }) => id))
    || !sameValue(manifest.orderedRuleIds, catalog.rules.map(({ id }) => id))
    || !sameValue(manifest.orderedAdjustmentCopyIds, orderedAdjustmentCopyIds)
    || !sameValue(manifest.orderedExclusionTagIds, catalog.exclusionTags.map(({ id }) => id))
    || !sameValue(manifest.orderedCopyRoles, catalog.copyRoles.map(({ id }) => id))
  ) throw new Error('style corpus identity drifted')
}

export function verifyStyleFixtureSet(
  input: StyleFixtureVerificationInput,
): StyleFixtureVerificationResult {
  if (!input || typeof input !== 'object') throw new Error('style fixture input is missing')
  const casesBytes = requireBytes(input.casesBytes, 'style cases')
  const manifestBytes = requireBytes(input.manifestBytes, 'style manifest')
  const instrumentationBytes = requireBytes(
    input.instrumentationBytes,
    'style instrumentation',
  )
  const seedBytes = requireBytes(input.seedBytes, 'style seeds')

  const instrumentationHash = sha256(instrumentationBytes)
  const seedsHash = sha256(seedBytes)
  if (instrumentationHash !== styleInstrumentationHash) {
    throw new Error('style instrumentation identity drifted')
  }
  if (seedsHash !== styleSeedsHash) throw new Error('style seed identity drifted')

  let seeds: ReturnType<typeof legacyStyleSeedFileSchema.parse>
  try {
    seeds = legacyStyleSeedFileSchema.parse(parseJson(seedBytes, 'style seeds'))
  } catch {
    throw new Error('style seeds are invalid')
  }

  let cases: ReturnType<typeof validateLegacyStyleCases>
  try {
    cases = validateLegacyStyleCases(
      parseLegacyStyleRawCases(parseJson(casesBytes, 'style cases')),
      [seeds.case],
    )
  } catch {
    throw new Error('style cases are invalid')
  }
  if (!bytesEqual(casesBytes, serializeLegacyStyleCases(cases))) {
    throw new Error('style case bytes drifted')
  }

  let manifest: StyleFixtureManifest
  try {
    manifest = styleFixtureManifestSchema.parse(
      parseJson(manifestBytes, 'style manifest'),
    )
  } catch {
    throw new Error('style manifest is invalid')
  }
  if (!bytesEqual(manifestBytes, serializeStyleFixtureManifest(manifest))) {
    throw new Error('style manifest bytes drifted')
  }

  const casesHash = computeLegacyStyleCasesHash(cases)
  const fixtureContentHash = sha256(casesBytes)
  validateCorpusIdentity(manifest, cases, casesHash, fixtureContentHash)
  if (
    manifest.instrumentation.hash !== instrumentationHash
    || manifest.seeds.hash !== seedsHash
  ) throw new Error('style authoring input identity drifted')
  const authoringHash = validateAuthoringSources(input, manifest)

  return Object.freeze({
    status: 'pass',
    caseCount: 1,
    casesHash,
    fixtureContentHash,
    manifestHash: sha256(manifestBytes),
    instrumentationHash,
    seedsHash,
    authoringHash,
    coverage: expectedCoverage,
  })
}

const toolRoot = fileURLToPath(new URL('../../../', import.meta.url))

function readFixedFile(relativePath: string, label: string) {
  try {
    return readFileSync(resolve(toolRoot, relativePath))
  } catch {
    throw new Error(`${label} is missing or unreadable`)
  }
}

export function verifyCommittedStyleFixtures(): StyleFixtureVerificationResult {
  return verifyStyleFixtureSet({
    casesBytes: readFixedFile(
      'tools/parity/fixtures/styles/legacy-v1/cases.json',
      'style cases',
    ),
    manifestBytes: readFixedFile(
      'tools/parity/fixtures/styles/legacy-v1/manifest.json',
      'style manifest',
    ),
    instrumentationBytes: readFixedFile(
      'tools/parity/styles/legacy-instrumentation.patch',
      'style instrumentation',
    ),
    seedBytes: readFixedFile('tools/parity/styles/seeds.json', 'style seeds'),
    authoringSources: styleFixtureAuthoringSourcePaths.map((path) => ({
      path,
      bytes: readFixedFile(path, `style authoring source ${path}`),
    })),
  })
}

export function main(arguments_: readonly string[]) {
  if (arguments_.length !== 0) throw new Error('Usage: verify-fixtures.ts')
  const result = verifyCommittedStyleFixtures()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'style fixture verification failed'
    process.stderr.write(`${message.slice(0, 300)}\n`)
    process.exitCode = 1
  }
}
