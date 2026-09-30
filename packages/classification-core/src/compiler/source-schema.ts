import { z } from 'zod'

import { stableIdSchema, versionSchema } from '../contracts/ids.js'
import { isRepositorySource } from '../contracts/source-path.js'

const sourceFileSchema = z.string().min(1).refine(
  isRepositorySource,
  'definition sourceFile must be a repository-relative POSIX path',
)

export const optionSourceSchema = z.strictObject({
  id: stableIdSchema,
  messageId: stableIdSchema,
  exclusive: z.boolean().optional(),
})

const optionBranchSchema = z.strictObject({
  when: stableIdSchema,
  options: z.array(optionSourceSchema).min(1),
})

export const questionOptionsSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('flat'),
    options: z.array(optionSourceSchema).min(1),
  }),
  z.strictObject({
    kind: z.literal('branch'),
    by: stableIdSchema,
    branches: z.array(optionBranchSchema).min(1),
  }),
])

export const optionRestrictionSchema = z.strictObject({
  by: stableIdSchema,
  allow: z.array(z.strictObject({
    when: stableIdSchema,
    optionIds: z.array(stableIdSchema).min(1),
  })).min(1),
})

export const questionSourceSchema = z.strictObject({
  sourceFile: sourceFileSchema,
  id: stableIdSchema,
  messageId: stableIdSchema,
  order: z.number().int().nonnegative(),
  selectionType: z.enum(['single', 'multiple']),
  minSelections: z.number().int().nonnegative(),
  maxSelections: z.number().int().positive(),
  // Opaque legacy metadata; no flow, validation or public API may interpret it (Batch 3B owns scoring).
  legacyWeight: z.number().finite().nonnegative(),
  dependsOn: z.array(stableIdSchema),
  autoSelectSingleOption: z.boolean(),
  emptyFallbackOptionId: stableIdSchema.optional(),
  optionSet: questionOptionsSchema,
  restriction: optionRestrictionSchema.optional(),
}).superRefine((question, context) => {
  if (question.minSelections > question.maxSelections) context.addIssue({
    code: 'custom',
    path: ['minSelections'],
    message: 'minSelections must not exceed maxSelections',
  })
  if (question.selectionType === 'single' && question.maxSelections !== 1) context.addIssue({
    code: 'custom',
    path: ['maxSelections'],
    message: 'single-selection questions must have maxSelections 1',
  })
})

export const styleSourceSchema = z.strictObject({
  sourceFile: sourceFileSchema,
  id: stableIdSchema,
  messageId: stableIdSchema,
  familyOptionId: stableIdSchema,
  priority: z.number().int().nonnegative(),
  intensities: z.array(stableIdSchema).min(1),
  noodles: z.array(stableIdSchema).min(1),
})

export const policySourceSchema = z.strictObject({
  sourceFile: sourceFileSchema,
  exactRatio: z.number().finite().min(0).max(1),
  adjacentRatio: z.number().finite().min(0).max(1),
  partialRatio: z.number().finite().min(0).max(1),
  bonusCap: z.number().finite().nonnegative(),
  penaltyCap: z.number().finite().nonnegative(),
  confidenceThreshold: z.number().finite().min(0).max(100),
  tieGap: z.number().finite().nonnegative(),
})

export const definitionBundleSchema = z.strictObject({
  mode: z.enum(['synthetic', 'questions-production', 'production']),
  modelVersion: versionSchema,
  questions: z.array(questionSourceSchema),
  styles: z.array(styleSourceSchema),
  policy: policySourceSchema,
})

export type DefinitionBundleSource = z.infer<typeof definitionBundleSchema>
