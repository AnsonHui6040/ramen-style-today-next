import { z } from 'zod'

import { versionSchema } from '../contracts/ids.js'
import { isRepositorySource } from '../contracts/source-path.js'
import { questionDefinitionSourceSchema } from './questions/source-schema.js'
import { styleDefinitionBundleSchema } from './styles/source-schema.js'

const sourceFileSchema = z.string().min(1).refine(
  isRepositorySource,
  'definition sourceFile must be a repository-relative POSIX path',
)

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
  modelVersion: versionSchema,
  provenance: z.strictObject({
    questions: z.strictObject({
      origin: z.enum(['legacy-production', 'synthetic']),
    }),
    styles: z.strictObject({
      origin: z.literal('legacy-production'),
    }),
    scoringPolicy: z.strictObject({
      origin: z.enum(['legacy-production', 'synthetic']),
    }),
  }),
  questions: z.array(questionDefinitionSourceSchema),
  styles: styleDefinitionBundleSchema,
  policy: policySourceSchema,
})

export type DefinitionBundleSource = z.infer<typeof definitionBundleSchema>

export { questionDefinitionSourceSchema } from './questions/source-schema.js'
export type { QuestionDefinitionSource } from '../contracts/question-model.js'
