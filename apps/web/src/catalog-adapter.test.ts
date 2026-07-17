import {
  classificationModel,
  evaluateEligibility,
  scoreCompletedAnswers,
  type CompletedAnswers,
} from '@ramen-style/classification-core'
import { describe, expect, test } from 'vitest'

import {
  adaptCandidateForPresentation,
  adaptEligibilityResults,
  createPresentationCatalog,
} from './catalog-adapter.js'

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

function outcome() {
  const scored = scoreCompletedAnswers(classificationModel, normalAnswers)
  if (!scored.ok) throw new Error('Scoring fixture failed')
  const eligible = evaluateEligibility(classificationModel, normalAnswers, scored.outcome)
  if (!eligible.ok) throw new Error('Eligibility fixture failed')
  return eligible.outcome
}

describe('presentation catalog adapter', () => {
  test('fails closed for duplicate stable identities', () => {
    const duplicate = {
      styleId: 'shoyu-chintan',
      styleDisplayName: '醬油清湯',
      shortDescription: 'test',
      accent: '#000000',
    }
    expect(createPresentationCatalog([duplicate, duplicate])).toEqual({
      ok: false,
      code: 'PRESENTATION_CATALOG_INVALID',
    })
  })

  test('returns an explicit unavailable state without changing the candidate', () => {
    const candidate = outcome().selectedPrimaryResults[0]!
    const before = structuredClone(candidate)
    const result = adaptCandidateForPresentation(candidate, new Map())
    expect(result).toMatchObject({
      availability: 'unavailable',
      styleId: candidate.styleId,
      score: candidate.score,
      confidence: candidate.confidence,
    })
    expect(candidate).toEqual(before)
  })

  test('preserves runtime order and leaves the eligibility outcome untouched', () => {
    const runtime = outcome()
    const before = structuredClone(runtime)
    const result = adaptEligibilityResults(runtime)
    expect(result.primary.map(({ styleId }) => styleId)).toEqual(
      runtime.selectedPrimaryResults.map(({ styleId }) => styleId),
    )
    expect(result.alternatives.map(({ styleId }) => styleId)).toEqual(
      runtime.selectedAlternatives.map(({ styleId }) => styleId),
    )
    expect(runtime).toEqual(before)
  })
})
