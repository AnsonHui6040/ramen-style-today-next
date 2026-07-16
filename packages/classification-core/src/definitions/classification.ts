import { questionDefinitions } from './questions.js'
import { styleDefinitionBundle } from './styles/index.js'
import { syntheticPolicy } from './synthetic.js'

export const classificationDefinition = {
  modelVersion: 'batch3a.1.0',
  provenance: {
    questions: { origin: 'legacy-production' },
    styles: { origin: 'legacy-production' },
    scoringPolicy: { origin: 'synthetic' },
  },
  questions: questionDefinitions,
  styles: styleDefinitionBundle,
  policy: syntheticPolicy,
} as const
