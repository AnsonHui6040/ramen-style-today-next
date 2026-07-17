import { z } from 'zod'

import type { EligibilityPolicyDefinition } from '../../contracts/eligibility-policy.js'
import type { EligibilityRuleId } from '../../contracts/eligibility-policy.js'
import { stableIdSchema } from '../../contracts/ids.js'
import { isRepositorySource } from '../../contracts/source-path.js'

const sourceFileSchema = z.string().min(1).refine(
  isRepositorySource,
  'eligibility policy sourceFile must be a repository-relative POSIX path',
)
const prioritySchema = z.number().int().nonnegative().max(10_000)

export const eligibilityPolicyDefinitionSchema: z.ZodType<EligibilityPolicyDefinition> =
  z.strictObject({
    sourceFile: sourceFileSchema,
    modelVersion: z.literal('batch3c.1.0'),
    exclusionsQuestionId: z.literal('exclusions'),
    noneOptionId: stableIdSchema,
    rules: z.array(z.strictObject({
      id: z.custom<EligibilityRuleId>((value) => (
        typeof value === 'string' && value.startsWith('exclusion:')
      )),
      priority: prioritySchema,
      exclusionOptionId: stableIdSchema,
      restrictionTagIds: z.array(stableIdSchema).max(16),
    })).min(1).max(32),
    selection: z.strictObject({
      ordering: z.literal('scoring-rank-stable-subsequence'),
      primaryLimit: z.number().int().positive().max(18),
      alternativeLimit: z.number().int().positive().max(18),
      blockedLead: z.literal('highest-blocked-primary-gte-eligible-lead'),
    }),
  })
