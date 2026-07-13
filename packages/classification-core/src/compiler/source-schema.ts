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
})

export const questionSourceSchema = z.strictObject({
  sourceFile: sourceFileSchema,
  id: stableIdSchema,
  messageId: stableIdSchema,
  order: z.number().int().nonnegative(),
  selectionType: z.enum(['single', 'multiple']),
  minSelections: z.number().int().nonnegative(),
  maxSelections: z.number().int().positive(),
  weight: z.number().finite().nonnegative(),
  dependsOn: z.array(stableIdSchema),
  options: z.array(optionSourceSchema).min(1),
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
  mode: z.enum(['synthetic', 'production']),
  modelVersion: versionSchema,
  questions: z.array(questionSourceSchema),
  styles: z.array(styleSourceSchema),
  policy: policySourceSchema,
})

export type DefinitionBundleSource = z.infer<typeof definitionBundleSchema>

export { questionDefinitionSourceSchema } from './questions/source-schema.js'
export type { QuestionDefinitionSource } from '../contracts/question-model.js'
