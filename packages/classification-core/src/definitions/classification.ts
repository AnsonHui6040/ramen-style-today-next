import { legacyEligibilityPolicy } from './eligibility-policy.js'
import { questionDefinitions } from './questions.js'
import { legacyScoringPolicy } from './policies.js'
import { styleDefinitionBundle } from './styles/index.js'

export const classificationDefinition = {
  modelVersion: 'batch3c.1.0',
  provenance: {
    questions: { origin: 'legacy-production' },
    styles: { origin: 'legacy-production' },
    scoringPolicy: { origin: 'legacy-production' },
    eligibilityPolicy: { origin: 'legacy-production' },
  },
  questions: questionDefinitions,
  styles: styleDefinitionBundle,
  policy: legacyScoringPolicy,
  eligibilityPolicy: legacyEligibilityPolicy,
} as const
