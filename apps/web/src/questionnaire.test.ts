import {
  applyAnswer,
  evaluateFlow,
  questionModel,
  type AnswerDraft,
  type CompletedAnswers,
  type OptionId,
  type QuestionId,
} from '@ramen-style/classification-core'
import { expect, test } from 'vitest'

import { pendingQuestionState, togglePendingOption } from './questionnaire.js'
import { composeRuntimeResult } from './runtime.js'

const normalAnswers = {
  form: ['soup'],
  archetype: ['chintan'],
  tare: ['shoyu'],
  source: ['chicken'],
  body: ['balanced'],
  noodle: ['thin-straight'],
  signature: ['yuzu-citrus'],
  exclusions: ['none'],
} as const satisfies CompletedAnswers

test('uses the public pending-selection contract for exclusive and bounded choices', () => {
  const partial: AnswerDraft = {
    form: normalAnswers.form,
    archetype: normalAnswers.archetype,
    tare: normalAnswers.tare,
  }
  const flow = evaluateFlow(questionModel, partial)
  const state = pendingQuestionState('source', flow)
  expect(togglePendingOption(state, ['pork'], 'unsure').optionIds).toEqual(['unsure'])
  expect(togglePendingOption(state, ['pork', 'chicken'], 'duck').optionIds)
    .toEqual(['pork', 'chicken'])
})

test('orchestrates all answers through applyAnswer and reaches the real runtime result', () => {
  let draft: AnswerDraft = {}
  for (const question of questionModel.questions) {
    const answer = normalAnswers[question.id as QuestionId]
    const state = evaluateFlow(questionModel, draft)
    if (!state.interactiveQuestionIds.includes(question.id as QuestionId)) continue
    const applied = applyAnswer(questionModel, draft, {
      questionId: question.id as QuestionId,
      optionIds: answer as readonly OptionId[],
    })
    expect(applied.accepted).toBe(true)
    if (applied.accepted) draft = applied.draft
  }
  const result = composeRuntimeResult(draft)
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.scoring.results.length).toBeGreaterThan(0)
    expect(result.eligibility.selectedPrimaryResults.length).toBeGreaterThan(0)
  }
})
