import { z } from 'zod'

import { versionSchema } from '../contracts/ids.js'
import { eligibilityPolicyDefinitionSchema } from './eligibility-policy/source-schema.js'
import { questionDefinitionSourceSchema } from './questions/source-schema.js'
import { scoringPolicyDefinitionSchema } from './scoring-policy/source-schema.js'
import { styleDefinitionBundleSchema } from './styles/source-schema.js'

export const policySourceSchema = scoringPolicyDefinitionSchema

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
      origin: z.literal('legacy-production'),
    }),
    eligibilityPolicy: z.strictObject({
      origin: z.literal('legacy-production'),
    }),
  }),
  questions: z.array(questionDefinitionSourceSchema),
  styles: styleDefinitionBundleSchema,
  policy: policySourceSchema,
  eligibilityPolicy: eligibilityPolicyDefinitionSchema,
})

export type DefinitionBundleSource = z.infer<typeof definitionBundleSchema>

export { questionDefinitionSourceSchema } from './questions/source-schema.js'
export type { QuestionDefinitionSource } from '../contracts/question-model.js'
