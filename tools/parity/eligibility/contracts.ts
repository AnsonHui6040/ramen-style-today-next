import { createHash } from 'node:crypto'

import { z } from 'zod'

export const eligibilityProjection = 'legacy-eligibility-result-projection' as const
export const maximumEligibilityCases = 128
export const maximumEligibilityFixtureBytes = 32 * 1024 * 1024

export const legacyEligibilityIdentity = Object.freeze({
  host: 'github.com',
  owner: 'AnsonHui6040',
  repository: 'ramen-style-today',
  commit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  treeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
})

const id = z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const answerList = z.array(id).min(1).max(8)
const answers = z.strictObject({
  form: z.tuple([id]),
  archetype: z.tuple([id]),
  tare: z.tuple([id]),
  source: answerList,
  body: z.tuple([id]),
  noodle: z.tuple([id]),
  signature: answerList,
  exclusions: answerList,
})
const reason = z.strictObject({
  code: z.literal('ELIGIBILITY_EXCLUSION_CONFLICT'),
  exclusionOptionId: id,
  restrictionTagId: id,
  styleId: id,
})
const decision = z.strictObject({
  styleId: id,
  decision: z.enum(['eligible', 'blocked']),
  reasons: z.array(reason).max(8),
})

export const eligibilitySeedsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  cases: z.array(z.strictObject({
    id,
    baseCaseId: id,
    exclusions: answerList,
  })).min(9).max(maximumEligibilityCases),
})

export const eligibilityCasesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  projection: z.literal(eligibilityProjection),
  cases: z.array(z.strictObject({
    id,
    answers,
    candidateDecisions: z.array(decision).length(18),
    selectedPrimaryStyleIds: z.array(id).max(3),
    selectedAlternativeStyleIds: z.array(id).max(3),
    blockedLeadStyleId: id.nullable(),
    noPrimaryEligible: z.boolean(),
    noEligibleCandidate: z.boolean(),
  })).min(9).max(maximumEligibilityCases),
})

const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const eligibilityManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  projection: z.literal(eligibilityProjection),
  legacy: z.strictObject({
    host: z.literal(legacyEligibilityIdentity.host),
    owner: z.literal(legacyEligibilityIdentity.owner),
    repository: z.literal(legacyEligibilityIdentity.repository),
    commit: z.literal(legacyEligibilityIdentity.commit),
    treeHash: z.literal(legacyEligibilityIdentity.treeHash),
  }),
  sourceHashes: z.strictObject({
    scorer: hash,
    styles: hash,
    questions: hash,
  }),
  scoringFixtureCasesHash: hash,
  seedsHash: hash,
  extractorHash: hash,
  fixtureContentHash: hash,
  caseCount: z.number().int().min(9).max(maximumEligibilityCases),
  orderedCaseIds: z.array(id).min(9).max(maximumEligibilityCases),
  coverage: z.strictObject({
    exclusionOptions: z.number().int().min(9).max(9),
    activeBlockingTags: z.number().int().min(6).max(6),
    inactiveBlockingTags: z.number().int().min(6).max(6),
    primaryBlockedCases: z.number().int().positive(),
    alternativeBlockedCases: z.number().int().positive(),
    allPrimaryBlockedCases: z.number().int().positive(),
    multiExclusionCases: z.number().int().positive(),
    noOpOptionCases: z.number().int().min(3),
  }),
})

export type EligibilityCasesFile = z.infer<typeof eligibilityCasesSchema>
export type EligibilityObservation = EligibilityCasesFile['cases'][number]
export type EligibilityManifest = z.infer<typeof eligibilityManifestSchema>

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, nested]) => [key, stableValue(nested)]))
}

export const serializeEligibilityValue = (value: unknown) => (
  Buffer.from(`${JSON.stringify(stableValue(value), null, 2)}\n`)
)

export const sha256 = (value: Uint8Array | string) => (
  createHash('sha256').update(value).digest('hex')
)
