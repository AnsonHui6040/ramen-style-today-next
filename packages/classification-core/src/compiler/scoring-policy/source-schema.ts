import { z } from 'zod'

import { stableIdSchema } from '../../contracts/ids.js'
import type { ScoringPolicyDefinition } from '../../contracts/scoring-policy.js'
import { isRepositorySource } from '../../contracts/source-path.js'

const sourceFileSchema = z.string().min(1).refine(
  isRepositorySource,
  'policy sourceFile must be a repository-relative POSIX path',
)
const prioritySchema = z.number().int().nonnegative().max(10_000)
const boundedScoreSchema = z.number().finite().nonnegative().max(10_000)

const scoredQuestionSchema = z.strictObject({
  questionId: stableIdSchema,
  priority: prioritySchema,
  weight: boundedScoreSchema,
})

const tierSchema = z.strictObject({
  tier: z.enum(['exact', 'adjacent', 'partial', 'miss']),
  priority: prioritySchema,
  ratio: z.number().finite().min(0).max(1),
})

const answerUncertaintySchema = z.strictObject({
  kind: z.literal('answer-includes'),
  questionId: stableIdSchema,
  optionId: stableIdSchema,
  deduction: boundedScoreSchema,
  priority: prioritySchema,
})

const conflictUncertaintySchema = z.strictObject({
  kind: z.literal('applied-conflict-count'),
  deductionEach: boundedScoreSchema,
  deductionCap: boundedScoreSchema,
  priority: prioritySchema,
})

export const scoringPolicyDefinitionSchema: z.ZodType<ScoringPolicyDefinition> =
  z.strictObject({
    sourceFile: sourceFileSchema,
    modelVersion: z.literal('batch3b.1.0'),
    scoredQuestions: z.array(scoredQuestionSchema).min(1).max(16),
    tiers: z.array(tierSchema).min(1).max(8),
    arithmetic: z.strictObject({
      scoreDecimalPlaces: z.literal(1),
      scoreRounding: z.literal('nearest-score-unit-ties-up'),
      scoreFloor: boundedScoreSchema,
    }),
    adjustments: z.strictObject({
      phases: z.tuple([z.literal('bonus'), z.literal('conflict')]),
      bonusCap: boundedScoreSchema,
      penaltyCap: boundedScoreSchema,
    }),
    ranking: z.strictObject({
      coreKeys: z.tuple([
        z.literal('score-desc'),
        z.literal('core-priority-asc'),
        z.literal('core-id-asc'),
      ]),
      styleKeys: z.tuple([
        z.literal('score-desc'),
        z.literal('display-priority-asc'),
        z.literal('style-id-asc'),
      ]),
      primaryFamilyQuestionId: z.literal('form'),
      primaryLimit: z.number().int().positive().max(18),
      alternativeLimit: z.number().int().positive().max(18),
    }),
    confidence: z.strictObject({
      maximumDerivation: z.literal('base-weight-total-plus-bonus-cap'),
      rounding: z.literal('nearest-integer-ties-toward-positive-infinity'),
      lastResultGap: boundedScoreSchema,
      gapMultiplier: boundedScoreSchema,
      gapBoostCap: boundedScoreSchema,
      minimum: z.number().finite().min(0).max(100),
      maximum: z.number().finite().min(0).max(100),
      lowConfidenceThreshold: z.number().finite().min(0).max(100),
      lowConfidenceTieGap: boundedScoreSchema,
      uncertainty: z.array(z.discriminatedUnion('kind', [
        answerUncertaintySchema,
        conflictUncertaintySchema,
      ])).min(1).max(16),
    }),
  })
