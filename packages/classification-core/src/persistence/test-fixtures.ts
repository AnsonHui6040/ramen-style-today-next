import { questionModel } from '../generated/question-model.js'

export const verifiedLegacySourceId =
  'ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37' as const

export function currentV1(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    questionModelVersion: questionModel.metadata.modelVersion,
    questionSemanticHash: questionModel.metadata.semanticHash,
    submittedAnswers: { form: ['soup'] },
    ...overrides,
  }
}

export { questionModel }
