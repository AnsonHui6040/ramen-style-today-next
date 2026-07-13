import { questionDefinitions } from './questions.js'
import { syntheticPolicy, syntheticStyles } from './synthetic.js'

export const classificationDefinition = {
  modelVersion: 'batch2a.1.0',
  provenance: {
    questions: { origin: 'legacy-production' },
    styles: { origin: 'synthetic' },
    scoringPolicy: { origin: 'synthetic' },
  },
  questions: questionDefinitions,
  styles: syntheticStyles,
  policy: syntheticPolicy,
} as const
