import {
  classificationModel,
  evaluateEligibility,
  scoreCompletedAnswers,
  type CompletedAnswers,
} from '@ramen-style/classification-core'
import { expect, test } from 'vitest'

import { deriveFinderProjection } from './finder-adapter.js'

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

const blockedAnswers = {
  form: ['soup'],
  archetype: ['chintan'],
  tare: ['shoyu'],
  source: ['pork'],
  body: ['light'],
  noodle: ['thin-straight'],
  signature: ['nori-spinach'],
  exclusions: ['pork'],
} as const satisfies CompletedAnswers

function eligibility(answers: typeof normalAnswers | typeof blockedAnswers) {
  const scored = scoreCompletedAnswers(classificationModel, answers)
  if (!scored.ok) throw new Error('Scoring fixture failed')
  const result = evaluateEligibility(classificationModel, answers, scored.outcome)
  if (!result.ok) throw new Error('Eligibility fixture failed')
  return result.outcome
}

test('derives the initial filter only from the eligible selected lead', () => {
  const selected = eligibility(normalAnswers).selectedPrimary
  expect(deriveFinderProjection(selected)).toEqual({
    availability: 'available',
    styleId: selected?.styleId,
    initialFilterId: `style:${selected?.styleId}`,
  })
})

test('does not promote a blocked lead or invent a fallback', () => {
  const outcome = eligibility(blockedAnswers)
  expect(outcome.blockedLead?.decision).toBe('blocked')
  expect(deriveFinderProjection(outcome.blockedLead)).toEqual({
    availability: 'unavailable',
    reason: 'no-eligible-lead',
  })
  expect(deriveFinderProjection(null)).toEqual({
    availability: 'unavailable',
    reason: 'no-eligible-lead',
  })
})
