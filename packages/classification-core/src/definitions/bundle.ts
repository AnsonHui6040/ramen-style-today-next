import type { DefinitionBundleSource } from '../compiler/source-schema.js'
import { questionDefinitions } from './questions.js'
import { proofPolicy, proofStyles } from './synthetic.js'

// Questions are migrated legacy data (Batch 2A); styles and policy remain synthetic proof data.
export const classificationDefinition: DefinitionBundleSource = {
  mode: 'questions-production',
  modelVersion: 'batch2a.0.0',
  questions: questionDefinitions,
  styles: proofStyles,
  policy: proofPolicy,
}
