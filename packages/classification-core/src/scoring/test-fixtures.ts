import type { ClassificationModel } from '../contracts/model.js'
import type { CompletedAnswers } from '../flow/types.js'
import { evaluateFlow } from '../flow/evaluate.js'
import { classificationModel } from '../generated/classification-model.js'

const completeDraft = {
  form: ['soup'],
  archetype: ['chintan'],
  tare: ['shoyu'],
  source: ['pork', 'chicken'],
  body: ['balanced'],
  noodle: ['medium-thin-straight'],
  signature: ['no-preference'],
  exclusions: ['none'],
} as const

const state = evaluateFlow(classificationModel.questionModel, completeDraft)
if (state.status !== 'complete') throw new Error('Scoring fixture must be complete')

export const completedAnswers: CompletedAnswers = state.completedAnswers
export { classificationModel }

export function cloneClassificationModel(): ClassificationModel {
  const model = structuredClone(classificationModel) as ClassificationModel
  ;(model as { questions: ClassificationModel['questions'] }).questions = model.questionModel.questions
  return model
}
