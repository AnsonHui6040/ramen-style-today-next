import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadVerifiedScoringFixtureSet } from '../scoring/verify-fixtures.js'
import {
  eligibilityCasesSchema,
  eligibilityManifestSchema,
  eligibilityProjection,
  eligibilitySeedsSchema,
  legacyEligibilityIdentity,
  serializeEligibilityValue,
  sha256,
} from './contracts.js'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const legacyRoot = process.env.LEGACY_ELIGIBILITY_ROOT
  ?? '/Users/ansonhui/Documents/GitHub/ramen-style-today'
const fixtureRoot = resolve(repositoryRoot, 'tools/parity/fixtures/eligibility/legacy-v1')
const seedsPath = resolve(import.meta.dirname, 'seeds.json')
const extractorPath = resolve(import.meta.dirname, 'extract.ts')

function git(...args: string[]) {
  return execFileSync('git', ['-C', legacyRoot, ...args], { encoding: 'utf8' }).trim()
}

function legacyAnswers(answers: Record<string, readonly string[]>) {
  return {
    form: answers.form![0],
    archetype: answers.archetype![0],
    tare: answers.tare![0],
    source: [...answers.source!],
    body: answers.body![0],
    noodle: answers.noodle![0],
    signature: [...answers.signature!],
    exclusions: [...answers.exclusions!],
  }
}

const sourcePaths = {
  scorer: 'src/lib/scoring/scorer.ts',
  styles: 'src/data/styles.json',
  questions: 'src/data/questions.json',
} as const

async function main() {
  if (
    git('rev-parse', 'HEAD') !== legacyEligibilityIdentity.commit
      || git('rev-parse', 'HEAD^{tree}') !== legacyEligibilityIdentity.treeHash
      || git('status', '--porcelain') !== ''
  ) throw new Error('legacy eligibility checkout identity is not exact and clean')

  const seedsBytes = readFileSync(seedsPath)
  const seeds = eligibilitySeedsSchema.parse(JSON.parse(seedsBytes.toString('utf8')))
  const scoring = loadVerifiedScoringFixtureSet()
  const scoringById = new Map(scoring.cases.map((entry) => [entry.id, entry] as const))
  const scorerModule = await import(pathToFileURL(resolve(legacyRoot, sourcePaths.scorer)).href)
  const stylesModule = await import(pathToFileURL(resolve(legacyRoot, 'src/config/styles.ts')).href)
  const scoreQuestionnaire = scorerModule.scoreQuestionnaire as (answers: unknown) => {
    results: readonly { style: { id: string } }[]
    alternativeResults: readonly { style: { id: string } }[]
    blockedLead: { style: { id: string } } | null
  }
  const styleCatalog = stylesModule.styleCatalog as readonly {
    id: string
    ingredients: readonly string[]
  }[]
  const styleById = new Map(styleCatalog.map((style) => [style.id, style] as const))

  const cases = seeds.cases.map((seed) => {
    const base = scoringById.get(seed.baseCaseId)
    if (!base) throw new Error(`unknown scoring base case ${seed.baseCaseId}`)
    const answers = { ...base.answers, exclusions: seed.exclusions }
    const legacy = scoreQuestionnaire(legacyAnswers(answers))
    const orderedStyleIds = [
      ...base.ranking.primaryStyleIds,
      ...base.ranking.alternativeStyleIds,
    ]
    const candidateDecisions = orderedStyleIds.map((styleId) => {
      const style = styleById.get(styleId)
      if (!style) throw new Error(`unknown legacy style ${styleId}`)
      const blockedBy = seed.exclusions.includes('none')
        ? []
        : style.ingredients.filter((tag) => seed.exclusions.includes(tag))
      return {
        styleId,
        decision: blockedBy.length ? 'blocked' as const : 'eligible' as const,
        reasons: blockedBy.map((tag) => ({
          code: 'ELIGIBILITY_EXCLUSION_CONFLICT' as const,
          exclusionOptionId: tag,
          restrictionTagId: tag,
          styleId,
        })),
      }
    })
    const primaryCount = base.ranking.primaryStyleIds.length
    return {
      id: seed.id,
      answers,
      candidateDecisions,
      selectedPrimaryStyleIds: legacy.results.map(({ style }) => style.id),
      selectedAlternativeStyleIds: legacy.alternativeResults.map(({ style }) => style.id),
      blockedLeadStyleId: legacy.blockedLead?.style.id ?? null,
      noPrimaryEligible: candidateDecisions.slice(0, primaryCount)
        .every(({ decision }) => decision === 'blocked'),
      noEligibleCandidate: candidateDecisions.every(({ decision }) => decision === 'blocked'),
    }
  })
  const casesFile = eligibilityCasesSchema.parse({
    schemaVersion: 1,
    projection: eligibilityProjection,
    cases,
  })
  const casesBytes = serializeEligibilityValue(casesFile)
  const selectedOptions = new Set(cases.flatMap(({ answers }) => answers.exclusions))
  const activeTags = new Set(cases.flatMap(({ candidateDecisions }) => (
    candidateDecisions.flatMap(({ reasons }) => reasons.map(({ restrictionTagId }) => restrictionTagId))
  )))
  const blockingTags = ['pork', 'chicken', 'duck', 'fish-seafood', 'shellfish', 'dairy']
  const manifest = eligibilityManifestSchema.parse({
    schemaVersion: 1,
    projection: eligibilityProjection,
    legacy: legacyEligibilityIdentity,
    sourceHashes: Object.fromEntries(Object.entries(sourcePaths).map(([key, path]) => (
      [key, sha256(readFileSync(resolve(legacyRoot, path)))]
    ))),
    scoringFixtureCasesHash: scoring.verification.casesHash,
    seedsHash: sha256(seedsBytes),
    extractorHash: sha256(readFileSync(extractorPath)),
    fixtureContentHash: sha256(casesBytes),
    caseCount: cases.length,
    orderedCaseIds: cases.map(({ id }) => id),
    coverage: {
      exclusionOptions: selectedOptions.size,
      activeBlockingTags: activeTags.size,
      inactiveBlockingTags: blockingTags.filter((tag) => cases.some(({ answers }) => (
        !answers.exclusions.includes(tag)
      ))).length,
      primaryBlockedCases: cases.filter(({ candidateDecisions }, index) => {
        const base = scoringById.get(seeds.cases[index]!.baseCaseId)!
        return candidateDecisions.slice(0, base.ranking.primaryStyleIds.length)
          .some(({ decision }) => decision === 'blocked')
      }).length,
      alternativeBlockedCases: cases.filter(({ candidateDecisions }, index) => {
        const base = scoringById.get(seeds.cases[index]!.baseCaseId)!
        return candidateDecisions.slice(base.ranking.primaryStyleIds.length)
          .some(({ decision }) => decision === 'blocked')
      }).length,
      allPrimaryBlockedCases: cases.filter(({ noPrimaryEligible }) => noPrimaryEligible).length,
      multiExclusionCases: cases.filter(({ answers }) => answers.exclusions.length > 1).length,
      noOpOptionCases: cases.filter(({ answers }) => (
        answers.exclusions.some((value) => ['none', 'beef', 'shrimp-crab'].includes(value))
      )).length,
    },
  })
  writeFileSync(resolve(fixtureRoot, 'cases.json'), casesBytes)
  writeFileSync(resolve(fixtureRoot, 'manifest.json'), serializeEligibilityValue(manifest))
  console.log(JSON.stringify({ caseCount: cases.length, coverage: manifest.coverage }))
}

await main()
