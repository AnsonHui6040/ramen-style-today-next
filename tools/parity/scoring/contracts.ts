import { createHash } from 'node:crypto'

import { z } from 'zod'

export const legacyScoringObservationSchemaVersion = 1 as const
export const scoringFixtureSchemaVersion = 1 as const
export const scoringExtractorVersion = 1 as const
export const scoringInstrumentationVersion = 1 as const
export const legacyScoringRepositoryIdentity = {
  host: 'github.com',
  owner: 'AnsonHui6040',
  repository: 'ramen-style-today',
  commit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  treeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
} as const

export const scoringCoverageBoundaryIds = [
  'arithmetic-reconstruction',
  'bonus-cap-reached',
  'bonus-cap-truncation',
  'confidence-threshold',
  'equal-core',
  'equal-style',
  'maximum-confidence',
  'maximum-score',
  'low-confidence-gap',
  'penalty-cap-reached',
  'penalty-cap-truncation',
  'primary-limit',
  'alternative-limit',
  'score-floor-reached',
  'score-floor-contract',
  'subtype-all-noodles',
] as const

export const legacyObservedScoringBoundaryIds = [
  'arithmetic-reconstruction',
  'bonus-cap-reached',
  'confidence-threshold',
  'equal-core',
  'equal-style',
  'maximum-confidence',
  'maximum-score',
  'low-confidence-gap',
  'penalty-cap-reached',
  'primary-limit',
  'alternative-limit',
  'score-floor-reached',
  'subtype-all-noodles',
] as const

export const compiledContractScoringBoundaryIds = [
  'bonus-cap-truncation',
  'penalty-cap-truncation',
  'score-floor-contract',
] as const

export const scoringStyleIds = [
  'shoyu-chintan',
  'shio-chintan',
  'miso',
  'tonkotsu',
  'chicken-chintan',
  'chicken-paitan',
  'duck-chintan',
  'duck-paitan',
  'gyokai',
  'shellfish-dashi',
  'iekei',
  'jiro',
  'hakata',
  'sapporo',
  'konbusui-tsukemen',
  'gyokai-tsukemen',
  'aburasoba',
  'taiwan-mazesoba',
] as const

export const scoringBonusIds = [
  'classic-shoyu',
  'classic-shio',
  'miso-sapporo-lane',
  'tonkotsu-core',
  'chicken-clear',
  'chicken-paitan-core',
  'duck-clear',
  'duck-paitan-core',
  'gyokai-soup-core',
  'shellfish-clear',
  'iekei-canonical',
  'jiro-canonical',
  'hakata-canonical',
  'sapporo-canonical',
  'konbusui-canonical',
  'gyokai-tsukemen-canonical',
  'aburasoba-canonical',
  'taiwan-mazesoba-canonical',
] as const

export const scoringConflictIds = [
  'shio-light-conflict',
  'duck-clear-jiro',
  'shellfish-jiro',
  'iekei-hakata-thin',
  'jiro-yuzu',
  'jiro-duck-shellfish',
  'taiwan-mazesoba-plain',
] as const

const questionIds = [
  'form',
  'archetype',
  'tare',
  'source',
  'body',
  'noodle',
  'signature',
] as const
const stableIdSchema = z.string()
  .min(1)
  .regex(/^[a-z0-9]+(?:(?:-|:)[a-z0-9]+)*$/)
  .refine((value) => {
    let count = 0
    const iterator = value[Symbol.iterator]()
    while (!iterator.next().done) {
      count += 1
      if (count > 120) return false
    }
    return true
  }, 'stable ids must not exceed 120 code points')
const boundedNumberSchema = z.number().finite().min(-1_000).max(1_000)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const repositoryPathSchema = z.string().min(1).max(512).refine((value) => (
  !value.startsWith('/')
    && !value.includes('\\')
    && value.split('/').every((part) => part && part !== '.' && part !== '..')
), 'expected a repository-relative path')

const answersSchema = z.strictObject({
  form: z.tuple([z.enum(['soup', 'tsukemen', 'dry'])]),
  archetype: z.tuple([z.enum([
    'chintan',
    'paitan',
    'konbusui-light',
    'gyokai-rich',
    'miso-rich',
    'tsukemen-other',
    'aburasoba',
    'taiwan-mazesoba',
    'soupless-tantan',
    'dry-other',
  ])]),
  tare: z.tuple([z.enum(['shoyu', 'shio', 'miso', 'spicy-sesame', 'none'])]),
  source: z.array(z.enum([
    'pork',
    'chicken',
    'duck',
    'beef',
    'fish-seafood',
    'shellfish',
    'shrimp-crab',
    'vegetable',
    'mixed',
    'unsure',
  ])).min(1).max(3),
  body: z.tuple([z.enum([
    'light',
    'balanced',
    'rich',
    'backfat-heavy',
    'ultra-heavy',
  ])]),
  noodle: z.tuple([z.enum([
    'thin-straight',
    'medium-thin-straight',
    'medium-thick-straight',
    'medium-thick-wavy',
    'extra-thick',
  ])]),
  signature: z.array(z.enum([
    'nori-spinach',
    'corn-butter',
    'bean-sprout-garlic-backfat',
    'fish-kombu',
    'yuzu-citrus',
    'no-preference',
  ])).min(1).max(2),
  exclusions: z.tuple([z.literal('none')]),
})

const seedCaseSchema = z.strictObject({
  id: stableIdSchema,
  answers: answersSchema,
})

export const legacyScoringSeedFileSchema = z.strictObject({
  schemaVersion: z.literal(legacyScoringObservationSchemaVersion),
  projection: z.literal('legacy-scoring-result-projection'),
  required: z.strictObject({
    styleTopIds: z.tuple(scoringStyleIds.map((id) => z.literal(id)) as never),
    ruleTierCoverage: z.literal('all-declared-rules-and-tiers'),
    bonusIds: z.tuple(scoringBonusIds.map((id) => z.literal(id)) as never),
    bonusStates: z.literal('active-and-inactive'),
    conflictIds: z.tuple(scoringConflictIds.map((id) => z.literal(id)) as never),
    conflictStates: z.literal('active-and-inactive'),
    boundaryIds: z.tuple(scoringCoverageBoundaryIds.map((id) => z.literal(id)) as never),
    ownership: z.strictObject({
      styleTops: z.literal('legacyObserved'),
      ruleTiers: z.literal('legacyObserved'),
      adjustments: z.literal('legacyObserved'),
      subtype: z.literal('legacyObserved'),
      ranking: z.literal('legacyObserved'),
      confidence: z.literal('legacyObserved'),
      legacyObservedBoundaryIds: z.tuple(
        legacyObservedScoringBoundaryIds.map((id) => z.literal(id)) as never,
      ),
      compiledContractBoundaryIds: z.tuple(
        compiledContractScoringBoundaryIds.map((id) => z.literal(id)) as never,
      ),
    }),
  }),
  cases: z.array(seedCaseSchema).min(19).max(256),
}).superRefine((value, context) => {
  const ids = value.cases.map(({ id }) => id)
  if (new Set(ids).size !== ids.length) context.addIssue({
    code: 'custom',
    path: ['cases'],
    message: 'scoring case ids must be unique',
  })
  for (const [index, entry] of value.cases.entries()) {
    for (const key of ['source', 'signature'] as const) {
      if (new Set(entry.answers[key]).size !== entry.answers[key].length) {
        context.addIssue({
          code: 'custom',
          path: ['cases', index, 'answers', key],
          message: `${key} answers must be unique`,
        })
      }
    }
  }
})

export type LegacyScoringSeedFile = z.infer<typeof legacyScoringSeedFileSchema>
export type LegacyScoringSeedCase = LegacyScoringSeedFile['cases'][number]

const questionLineSchema = z.strictObject({
  questionId: z.enum(questionIds),
  answerOptionIds: z.array(stableIdSchema).min(1).max(3),
  tier: z.enum(['exact', 'adjacent', 'partial', 'miss']),
  ratio: z.number().finite().min(0).max(1),
  weight: boundedNumberSchema,
  rawPoints: boundedNumberSchema,
  points: boundedNumberSchema,
})
const adjustmentLineSchema = z.strictObject({
  id: stableIdSchema,
  status: z.enum(['inactive', 'applied', 'capped']),
  matchedConditionPriorities: z.array(z.number().int().min(0).max(32)).max(32),
  matchedCount: z.number().int().min(0).max(32),
  requiredMatchCount: z.number().int().min(0).max(32),
  matchRatio: z.number().finite().min(0).max(1),
  requestedPoints: boundedNumberSchema,
  appliedPoints: boundedNumberSchema,
})
const coreObservationSchema = z.strictObject({
  styleId: z.enum(scoringStyleIds),
  coreId: stableIdSchema,
  corePriority: z.number().int().min(0).max(2),
  subtypeId: stableIdSchema,
  score: boundedNumberSchema,
  rankingKeys: z.strictObject({
    score: boundedNumberSchema,
    corePriority: z.number().int().min(0).max(2),
    coreId: stableIdSchema,
  }),
  questionLines: z.array(questionLineSchema).length(7),
  bonusLines: z.array(adjustmentLineSchema).max(32),
  conflictLines: z.array(adjustmentLineSchema).max(32),
})
const displayedResultSchema = z.strictObject({
  styleId: z.enum(scoringStyleIds),
  score: boundedNumberSchema,
  confidence: z.number().int().min(0).max(100),
})
const styleCandidateSchema = z.strictObject({
  styleId: z.enum(scoringStyleIds),
  family: z.enum(['soup', 'tsukemen', 'dry']),
  displayPriority: z.number().int().min(0).max(17),
  coreId: stableIdSchema,
  subtypeId: stableIdSchema,
  score: boundedNumberSchema,
  coreRankingKeys: z.strictObject({
    score: boundedNumberSchema,
    corePriority: z.number().int().min(0).max(2),
    coreId: stableIdSchema,
  }),
  styleRankingKeys: z.strictObject({
    score: boundedNumberSchema,
    displayPriority: z.number().int().min(0).max(17),
    styleId: z.enum(scoringStyleIds),
  }),
})
const confidenceObservationSchema = z.strictObject({
  styleId: z.enum(scoringStyleIds),
  score: boundedNumberSchema,
  nextScore: boundedNumberSchema,
  base: boundedNumberSchema,
  gapBoostBeforeCap: boundedNumberSchema,
  gapBoost: boundedNumberSchema,
  uncertaintyPenalty: boundedNumberSchema,
  rawConfidence: boundedNumberSchema,
  confidence: z.number().int().min(0).max(100),
})
const observationSchema = z.strictObject({
  id: stableIdSchema,
  answers: answersSchema,
  coreCandidates: z.array(coreObservationSchema).length(54),
  ranking: z.strictObject({
    styleCandidates: z.array(styleCandidateSchema).length(18),
    primaryStyleIds: z.array(z.enum(scoringStyleIds)).min(2).max(14),
    alternativeStyleIds: z.array(z.enum(scoringStyleIds)).min(4).max(16),
    displayedPrimary: z.array(displayedResultSchema).max(3),
    displayedAlternative: z.array(displayedResultSchema).max(3),
    collapseDecisions: z.array(z.strictObject({
      styleId: z.enum(scoringStyleIds),
      coreId: stableIdSchema,
      corePriority: z.number().int().min(0).max(2),
      score: boundedNumberSchema,
      previousCoreId: stableIdSchema.nullable(),
      selected: z.boolean(),
    })).length(54),
    confidenceObservations: z.array(confidenceObservationSchema).max(6),
    lowConfidenceInputs: z.strictObject({
      hasPrimaryResult: z.boolean(),
      topConfidence: z.number().int().min(0).max(100).nullable(),
      confidenceThreshold: z.literal(72),
      confidenceBelowThreshold: z.boolean(),
      topScore: boundedNumberSchema.nullable(),
      secondScore: boundedNumberSchema.nullable(),
      scoreGap: boundedNumberSchema.nullable(),
      scoreGapThreshold: z.literal(5),
      scoreGapBelowThreshold: z.boolean(),
    }),
    lowConfidence: z.boolean(),
  }),
}).superRefine((value, context) => {
  const family = value.answers.form[0]
  const expectedPrimary = family === 'soup' ? 14 : 2
  if (
    value.ranking.primaryStyleIds.length !== expectedPrimary
    || value.ranking.alternativeStyleIds.length !== 18 - expectedPrimary
  ) context.addIssue({
    code: 'custom',
    path: ['ranking'],
    message: 'ranking family split does not match the selected form',
  })
  const rankedIds = [
    ...value.ranking.primaryStyleIds,
    ...value.ranking.alternativeStyleIds,
  ]
  if (
    new Set(rankedIds).size !== 18
    || scoringStyleIds.some((id) => !rankedIds.includes(id))
    || new Set(value.ranking.styleCandidates.map(({ styleId }) => styleId)).size !== 18
  ) context.addIssue({
    code: 'custom',
    path: ['ranking'],
    message: 'ranking must close the complete 18-style inventory',
  })
})

const forbiddenObservationKeys = new Set([
  'eligibility',
  'catalog',
  'copy',
  'recommendations',
  'absolutePath',
  'temporaryPath',
  'timestamp',
])

function assertObservationBoundary(value: unknown, ancestors = new WeakSet<object>()): void {
  if (typeof value === 'string') {
    if (/^(?:file:|\/|\\\\|[A-Za-z]:[\\/])/u.test(value)) {
      throw new Error('scoring observation contains a machine path')
    }
    return
  }
  if (!value || typeof value !== 'object') return
  if (ancestors.has(value)) throw new Error('scoring observation contains a cycle')
  ancestors.add(value)
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenObservationKeys.has(key)) {
      throw new Error('scoring observation crossed the parity projection boundary')
    }
    assertObservationBoundary(child, ancestors)
  }
  ancestors.delete(value)
}

export type LegacyScoringObservation = z.infer<typeof observationSchema>

export function parseLegacyScoringRawCases(input: unknown): LegacyScoringObservation[] {
  const envelope = z.strictObject({
    schemaVersion: z.literal(legacyScoringObservationSchemaVersion),
    cases: z.array(observationSchema).min(1).max(256),
  }).parse(input)
  assertObservationBoundary(envelope)
  return envelope.cases
}

export function validateLegacyScoringCases(
  cases: readonly LegacyScoringObservation[],
  seeds: readonly LegacyScoringSeedCase[],
) {
  if (cases.length !== seeds.length) throw new Error('scoring case count mismatch')
  const parsed = cases.map((entry, index) => {
    const value = observationSchema.parse(entry)
    const seed = seeds[index]
    if (!seed || value.id !== seed.id || stableJson(value.answers) !== stableJson(seed.answers)) {
      throw new Error('scoring case seed identity mismatch')
    }
    const coreIds = value.coreCandidates.map(({ coreId }) => coreId)
    if (new Set(coreIds).size !== 54) throw new Error('scoring core identity mismatch')
    return value
  })
  return deepFreeze(parsed)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, stableValue(child)]))
  }
  return value
}

function stableJson(value: unknown) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`
}

function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>()
  const visit = (current: unknown): void => {
    if (!current || typeof current !== 'object' || seen.has(current)) return
    seen.add(current)
    for (const child of Object.values(current)) visit(child)
    Object.freeze(current)
  }
  visit(value)
  return value
}

export function serializeLegacyScoringSeeds(input: LegacyScoringSeedFile) {
  return Buffer.from(stableJson(legacyScoringSeedFileSchema.parse(input)))
}

export const maximumScoringSeedBytes = 1024 * 1024

export function parseLegacyScoringSeedBytes(bytes: Uint8Array) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error('scoring seed bytes are missing')
  }
  if (bytes.byteLength > maximumScoringSeedBytes) {
    throw new Error('scoring seed bytes exceed the approved bound')
  }
  let input: unknown
  try {
    input = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown
  } catch {
    throw new Error('scoring seed bytes are not valid JSON')
  }
  return legacyScoringSeedFileSchema.parse(input)
}

export function serializeLegacyScoringCases(cases: readonly LegacyScoringObservation[]) {
  return Buffer.from(stableJson({
    schemaVersion: legacyScoringObservationSchemaVersion,
    cases,
  }))
}

export function computeLegacyScoringCasesHash(cases: readonly LegacyScoringObservation[]) {
  return createHash('sha256')
    .update('ramen-legacy-scoring-observations-v1\0')
    .update(serializeLegacyScoringCases(cases))
    .digest('hex')
}

export function computeScoringExtractorAuthoringHash(
  sources: readonly { readonly path: string; readonly hash: string }[],
) {
  const digest = createHash('sha256')
  digest.update('ramen-scoring-extractor-authoring-v1\0')
  for (const source of sources) {
    digest.update(source.path)
    digest.update('\0')
    digest.update(source.hash)
    digest.update('\0')
  }
  return digest.digest('hex')
}

const coverageSchema = z.strictObject({
  cases: z.number().int().min(19).max(256),
  styles: z.literal(18),
  cores: z.literal(54),
  rules: z.literal(378),
  bonuses: z.literal(18),
  conflicts: z.literal(7),
  observedRuleTiers: z.number().int().min(1).max(1_512),
})

export const scoringFixtureManifestSchema = z.strictObject({
  fixtureSchemaVersion: z.literal(scoringFixtureSchemaVersion),
  source: z.strictObject({
    repository: z.strictObject({
      host: z.literal(legacyScoringRepositoryIdentity.host),
      owner: z.literal(legacyScoringRepositoryIdentity.owner),
      repository: z.literal(legacyScoringRepositoryIdentity.repository),
    }),
    commit: z.literal(legacyScoringRepositoryIdentity.commit),
    treeHash: z.literal(legacyScoringRepositoryIdentity.treeHash),
    trackedSourceHashes: z.record(repositoryPathSchema, sha256Schema),
    lockfilePath: z.literal('package-lock.json'),
    lockfileHash: sha256Schema,
  }),
  extractor: z.strictObject({
    version: z.literal(scoringExtractorVersion),
    sources: z.array(z.strictObject({ path: repositoryPathSchema, hash: sha256Schema })).length(5),
    hash: sha256Schema,
  }),
  instrumentation: z.strictObject({
    version: z.literal(scoringInstrumentationVersion),
    hash: sha256Schema,
  }),
  seeds: z.strictObject({
    schemaVersion: z.literal(legacyScoringObservationSchemaVersion),
    hash: sha256Schema,
  }),
  runtime: z.strictObject({
    nodeVersion: z.literal('24.14.0'),
    timezone: z.literal('UTC'),
    locale: z.literal('C.UTF-8'),
    dependencies: z.literal('copy-validated'),
    installedLockfileHash: sha256Schema,
    dependencyTreeHash: sha256Schema,
    network: z.literal('denied'),
    fullSuiteBeforeExtraction: z.literal(true),
  }),
  orderedCaseIds: z.array(stableIdSchema).min(19).max(256),
  coverage: coverageSchema,
  caseCount: z.number().int().min(19).max(256),
  casesHash: sha256Schema,
  fixtureContentHash: sha256Schema,
})

export type ScoringFixtureManifest = z.infer<typeof scoringFixtureManifestSchema>

export function serializeScoringFixtureManifest(manifest: ScoringFixtureManifest) {
  return Buffer.from(stableJson(scoringFixtureManifestSchema.parse(manifest)))
}

export function computeObservedScoringCoverage(cases: readonly LegacyScoringObservation[]) {
  const ruleTiers = new Set<string>()
  for (const entry of cases) {
    for (const core of entry.coreCandidates) {
      for (const line of core.questionLines) {
        ruleTiers.add(`${core.coreId}:${line.questionId}:${line.tier}`)
      }
    }
  }
  return {
    cases: cases.length,
    styles: 18 as const,
    cores: 54 as const,
    rules: 378 as const,
    bonuses: 18 as const,
    conflicts: 7 as const,
    observedRuleTiers: ruleTiers.size,
  }
}
