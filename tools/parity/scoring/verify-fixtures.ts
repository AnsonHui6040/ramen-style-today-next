import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { classificationModel } from '@ramen-style/classification-core'

import {
  computeLegacyScoringCasesHash,
  computeObservedScoringCoverage,
  computeScoringExtractorAuthoringHash,
  legacyObservedScoringBoundaryIds,
  parseLegacyScoringSeedBytes,
  parseLegacyScoringRawCases,
  scoringFixtureManifestSchema,
  serializeLegacyScoringCases,
  serializeScoringFixtureManifest,
  validateLegacyScoringCases,
  type LegacyScoringObservation,
  type ScoringFixtureManifest,
} from './contracts.js'
import {
  scoringExtractorAuthoringSourcePaths,
  scoringInstrumentationHash,
  scoringSeedsHash,
} from './extractor.js'

const expectedCasesHash =
  '7f79b5d9833d354671043f093d2d694614231195ad2fe167dbe348c50718d291'
const expectedFixtureContentHash =
  '01e59203b0d0519245dc5438c627ff8de62400ca64f9aafa68498f3dcd98fe83'
const expectedManifestHash =
  '8379cbb14588d5ba586bda895e8791edf8cfd98dc3bdffcb4512e6e8fb71101f'
const expectedAuthoringHash =
  '73a2b211ae88e91eaf255ffdac468c311f05f0c7e12ea42fcb6b0715d47b92aa'

export const maximumScoringCasesBytes = 64 * 1024 * 1024

const sha256 = (value: Uint8Array | string) => (
  createHash('sha256').update(value).digest('hex')
)

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function requireExactHash(received: string, expected: string, label: string) {
  if (received !== expected) throw new Error(`${label} identity drifted`)
}

function toScoreUnits(value: number) {
  const scaled = value * 10
  const units = Math.round(scaled)
  if (
    !Number.isFinite(value)
    || !Number.isSafeInteger(units)
    || Math.abs(scaled - units) > 1e-8
  ) throw new Error('scoring fixture arithmetic drifted')
  return units
}

function observeBoundaryClosure(cases: readonly LegacyScoringObservation[]) {
  const policy = classificationModel.policy
  const observed = new Set<string>()
  const selectedNoodleIds = new Set<string>()
  const confidenceSides = new Set<boolean>()
  const gapSides = new Set<boolean>()
  let arithmeticReconstructed = true

  for (const entry of cases) {
    selectedNoodleIds.add(entry.answers.noodle[0])
    confidenceSides.add(entry.ranking.lowConfidenceInputs.confidenceBelowThreshold)
    gapSides.add(entry.ranking.lowConfidenceInputs.scoreGapBelowThreshold)
    if (entry.ranking.displayedPrimary.length === policy.ranking.primaryLimit) {
      observed.add('primary-limit')
    }
    if (entry.ranking.displayedAlternative.length === policy.ranking.alternativeLimit) {
      observed.add('alternative-limit')
    }
    if (entry.ranking.confidenceObservations.some(({ confidence }) => (
      confidence === policy.confidence.maximum
    ))) observed.add('maximum-confidence')

    const styleScoreUnits = entry.ranking.styleCandidates.map(({ score }) => (
      toScoreUnits(score)
    ))
    if (new Set(styleScoreUnits).size !== styleScoreUnits.length) {
      observed.add('equal-style')
    }

    const coreScoreById = new Map(entry.coreCandidates.map(({ coreId, score }) => (
      [coreId, toScoreUnits(score)] as const
    )))
    if (entry.ranking.collapseDecisions.some((decision) => (
      decision.previousCoreId !== null
      && coreScoreById.get(decision.previousCoreId) === toScoreUnits(decision.score)
    ))) observed.add('equal-core')

    for (const core of entry.coreCandidates) {
      const baseUnits = core.questionLines.reduce((total, line) => (
        total + toScoreUnits(line.points)
      ), 0)
      const bonusUnits = core.bonusLines.reduce((total, line) => (
        total + toScoreUnits(line.appliedPoints)
      ), 0)
      const penaltyUnits = core.conflictLines.reduce((total, line) => (
        total + toScoreUnits(line.appliedPoints)
      ), 0)
      const preFloorUnits = baseUnits + bonusUnits - penaltyUnits
      if (toScoreUnits(core.score) !== Math.max(0, preFloorUnits)) {
        arithmeticReconstructed = false
      }
      if (bonusUnits === toScoreUnits(policy.adjustments.bonusCap)) {
        observed.add('bonus-cap-reached')
      }
      if (penaltyUnits === toScoreUnits(policy.adjustments.penaltyCap)) {
        observed.add('penalty-cap-reached')
      }
      if (toScoreUnits(core.score) === toScoreUnits(policy.derived.maximumScore)) {
        observed.add('maximum-score')
      }
      if (toScoreUnits(core.score) === toScoreUnits(policy.arithmetic.scoreFloor)) {
        observed.add('score-floor-reached')
      }
    }
  }

  if (arithmeticReconstructed) observed.add('arithmetic-reconstruction')
  if (confidenceSides.size === 2) observed.add('confidence-threshold')
  if (gapSides.size === 2) observed.add('low-confidence-gap')

  const expectedNoodleIds = classificationModel.questionModel.questions
    .find(({ id }) => id === 'noodle')?.options.map(({ id }) => id) ?? []
  if (
    expectedNoodleIds.length === 5
    && expectedNoodleIds.every((id) => selectedNoodleIds.has(id))
    && cases.every((entry) => entry.ranking.styleCandidates.every(({ subtypeId }) => (
      subtypeId.endsWith(`:${entry.answers.noodle[0]}`)
    )))
  ) observed.add('subtype-all-noodles')

  if (legacyObservedScoringBoundaryIds.some((id) => !observed.has(id))) {
    throw new Error('legacy-observed scoring boundary closure drifted')
  }
  if (
    policy.adjustments.bonusCap !== 5
    || policy.adjustments.penaltyCap !== 15
    || policy.arithmetic.scoreFloor !== 0
    || cases.some((entry) => entry.coreCandidates.some((core) => (
      [...core.bonusLines, ...core.conflictLines].some(({ status }) => status === 'capped')
    )))
  ) throw new Error('compiled scoring boundary ownership drifted')
}

function validateCoverageObligations(
  cases: readonly LegacyScoringObservation[],
  manifest: ScoringFixtureManifest,
) {
  const observedRuleTiers = new Set<string>()
  const adjustmentStates = new Map<string, Set<'active' | 'inactive'>>()
  for (const entry of cases) {
    for (const core of entry.coreCandidates) {
      for (const line of core.questionLines) {
        observedRuleTiers.add(`${core.coreId}:${line.questionId}:${line.tier}`)
      }
      for (const line of [...core.bonusLines, ...core.conflictLines]) {
        const states = adjustmentStates.get(line.id) ?? new Set()
        states.add(line.status === 'inactive' ? 'inactive' : 'active')
        adjustmentStates.set(line.id, states)
      }
    }
  }
  const requiredRuleTiers = new Set<string>()
  const requiredAdjustmentIds = new Set<string>()
  for (const style of classificationModel.styleModel.styles) {
    for (const core of style.cores) {
      for (const rule of core.rules) {
        requiredRuleTiers.add(`${rule.id}:${rule.fallbackTier}`)
        for (const target of rule.targets) {
          requiredRuleTiers.add(`${rule.id}:${target.tier}`)
        }
      }
    }
    for (const adjustment of style.adjustments) requiredAdjustmentIds.add(adjustment.id)
  }
  if (
    requiredRuleTiers.size !== 1_155
    || [...requiredRuleTiers].some((key) => !observedRuleTiers.has(key))
    || requiredAdjustmentIds.size !== 25
    || [...requiredAdjustmentIds].some((id) => adjustmentStates.get(id)?.size !== 2)
  ) throw new Error('scoring fixture obligation closure drifted')

  const observedStyleTopIds = new Set<string>()
  for (const entry of cases.filter(({ id }) => id.startsWith('style-top-'))) {
    const expectedStyleId = entry.id.slice('style-top-'.length)
    if (entry.ranking.displayedPrimary[0]?.styleId !== expectedStyleId) {
      throw new Error('scoring style-top obligation drifted')
    }
    observedStyleTopIds.add(expectedStyleId)
  }
  if (
    observedStyleTopIds.size !== 18
    || classificationModel.styleModel.styles.some(({ id }) => !observedStyleTopIds.has(id))
  ) throw new Error('scoring style-top obligation drifted')
  observeBoundaryClosure(cases)
  if (!sameValue(manifest.coverage, computeObservedScoringCoverage(cases))) {
    throw new Error('scoring fixture coverage drifted')
  }
}

export interface ScoringFixtureVerificationResult {
  readonly status: 'pass'
  readonly caseCount: number
  readonly coreLineCount: number
  readonly adjustmentLineCount: number
  readonly casesHash: string
  readonly fixtureContentHash: string
  readonly manifestHash: string
  readonly authoringHash: string
  readonly coverage: ScoringFixtureManifest['coverage']
}

export interface VerifiedScoringFixtureSet {
  readonly cases: readonly LegacyScoringObservation[]
  readonly manifest: ScoringFixtureManifest
  readonly verification: ScoringFixtureVerificationResult
}

export function verifyScoringFixtureSet(input: {
  readonly casesBytes: Uint8Array
  readonly manifestBytes: Uint8Array
  readonly instrumentationBytes: Uint8Array
  readonly seedBytes: Uint8Array
  readonly authoringSources: readonly { readonly path: string; readonly bytes: Uint8Array }[]
}): VerifiedScoringFixtureSet {
  if (
    !(input.casesBytes instanceof Uint8Array)
    || input.casesBytes.byteLength === 0
    || input.casesBytes.byteLength > maximumScoringCasesBytes
  ) throw new Error('scoring fixture case bytes exceed the approved bound')
  const seedFile = parseLegacyScoringSeedBytes(input.seedBytes)
  requireExactHash(sha256(input.seedBytes), scoringSeedsHash, 'scoring seed')
  requireExactHash(
    sha256(input.instrumentationBytes),
    scoringInstrumentationHash,
    'scoring instrumentation',
  )
  const cases = validateLegacyScoringCases(
    parseLegacyScoringRawCases(JSON.parse(Buffer.from(input.casesBytes).toString('utf8'))),
    seedFile.cases,
  )
  if (!Buffer.from(input.casesBytes).equals(serializeLegacyScoringCases(cases))) {
    throw new Error('scoring fixture case bytes drifted')
  }
  const manifest = scoringFixtureManifestSchema.parse(
    JSON.parse(Buffer.from(input.manifestBytes).toString('utf8')),
  )
  if (!Buffer.from(input.manifestBytes).equals(serializeScoringFixtureManifest(manifest))) {
    throw new Error('scoring fixture manifest bytes drifted')
  }
  const casesHash = computeLegacyScoringCasesHash(cases)
  const fixtureContentHash = sha256(input.casesBytes)
  const manifestHash = sha256(input.manifestBytes)
  requireExactHash(casesHash, expectedCasesHash, 'scoring cases')
  requireExactHash(fixtureContentHash, expectedFixtureContentHash, 'scoring fixture content')
  requireExactHash(manifestHash, expectedManifestHash, 'scoring manifest')
  if (
    manifest.casesHash !== casesHash
    || manifest.fixtureContentHash !== fixtureContentHash
    || manifest.caseCount !== cases.length
    || !sameValue(manifest.orderedCaseIds, cases.map(({ id }) => id))
  ) throw new Error('scoring manifest corpus identity drifted')

  if (
    input.authoringSources.length !== scoringExtractorAuthoringSourcePaths.length
    || input.authoringSources.some((source, index) => (
      source.path !== scoringExtractorAuthoringSourcePaths[index]
      || source.bytes.byteLength === 0
    ))
  ) throw new Error('scoring authoring source set drifted')
  const authoringSources = input.authoringSources.map(({ path, bytes }) => ({
    path,
    hash: sha256(bytes),
  }))
  const authoringHash = computeScoringExtractorAuthoringHash(authoringSources)
  requireExactHash(authoringHash, expectedAuthoringHash, 'scoring authoring')
  if (
    !sameValue(manifest.extractor.sources, authoringSources)
    || manifest.extractor.hash !== authoringHash
    || manifest.instrumentation.hash !== scoringInstrumentationHash
    || manifest.seeds.hash !== scoringSeedsHash
  ) throw new Error('scoring manifest authoring identity drifted')
  validateCoverageObligations(cases, manifest)

  const coreLineCount = cases.reduce((sum, entry) => (
    sum + entry.coreCandidates.reduce((coreSum, core) => (
      coreSum + core.questionLines.length
    ), 0)
  ), 0)
  const adjustmentLineCount = cases.reduce((sum, entry) => (
    sum + entry.coreCandidates.reduce((coreSum, core) => (
      coreSum + core.bonusLines.length + core.conflictLines.length
    ), 0)
  ), 0)
  return Object.freeze({
    cases,
    manifest,
    verification: Object.freeze({
      status: 'pass' as const,
      caseCount: cases.length,
      coreLineCount,
      adjustmentLineCount,
      casesHash,
      fixtureContentHash,
      manifestHash,
      authoringHash,
      coverage: manifest.coverage,
    }),
  })
}

const toolRoot = fileURLToPath(new URL('../../../', import.meta.url))

export function loadVerifiedScoringFixtureSet(): VerifiedScoringFixtureSet {
  const fixtureRoot = resolve(toolRoot, 'tools/parity/fixtures/scoring/legacy-v1')
  return verifyScoringFixtureSet({
    casesBytes: readFileSync(resolve(fixtureRoot, 'cases.json')),
    manifestBytes: readFileSync(resolve(fixtureRoot, 'manifest.json')),
    instrumentationBytes: readFileSync(resolve(
      toolRoot,
      'tools/parity/scoring/legacy-instrumentation.patch',
    )),
    seedBytes: readFileSync(resolve(toolRoot, 'tools/parity/scoring/seeds.json')),
    authoringSources: scoringExtractorAuthoringSourcePaths.map((path) => ({
      path,
      bytes: readFileSync(resolve(toolRoot, path)),
    })),
  })
}

export function verifyCommittedScoringFixtures(): ScoringFixtureVerificationResult {
  return loadVerifiedScoringFixtureSet().verification
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(verifyCommittedScoringFixtures(), null, 2)}\n`)
  } catch {
    process.stderr.write('scoring fixture verification failed\n')
    process.exitCode = 1
  }
}
