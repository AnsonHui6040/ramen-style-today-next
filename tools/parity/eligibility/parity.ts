import {
  classificationModel,
  evaluateEligibility,
  scoreCompletedAnswers,
  type CompletedAnswers,
  type EligibilityOutcome,
} from '@ramen-style/classification-core'

import type { EligibilityObservation } from './contracts.js'
import { loadVerifiedEligibilityFixtureSet } from './verify-fixtures.js'

function projection(outcome: EligibilityOutcome) {
  return {
    candidateDecisions: outcome.candidateDecisions.map((candidate) => ({
      styleId: candidate.styleId,
      decision: candidate.decision,
      reasons: candidate.reasons.map((reason) => ({
        code: reason.code,
        exclusionOptionId: reason.exclusionOptionId,
        restrictionTagId: reason.restrictionTagId,
        styleId: reason.styleId,
      })),
    })),
    selectedPrimaryStyleIds: outcome.selectedPrimaryResults.map(({ styleId }) => styleId),
    selectedAlternativeStyleIds: outcome.selectedAlternatives.map(({ styleId }) => styleId),
    blockedLeadStyleId: outcome.blockedLead?.styleId ?? null,
    noPrimaryEligible: outcome.noPrimaryEligible,
    noEligibleCandidate: outcome.noEligibleCandidate,
  }
}

function expectedProjection(entry: EligibilityObservation) {
  return {
    candidateDecisions: entry.candidateDecisions,
    selectedPrimaryStyleIds: entry.selectedPrimaryStyleIds,
    selectedAlternativeStyleIds: entry.selectedAlternativeStyleIds,
    blockedLeadStyleId: entry.blockedLeadStyleId,
    noPrimaryEligible: entry.noPrimaryEligible,
    noEligibleCandidate: entry.noEligibleCandidate,
  }
}

export function runEligibilityParity() {
  const fixture = loadVerifiedEligibilityFixtureSet()
  const mismatches: { caseId: string; expected: unknown; received: unknown }[] = []
  for (const entry of fixture.cases) {
    const answers = entry.answers as CompletedAnswers
    const scored = scoreCompletedAnswers(classificationModel, answers)
    if (!scored.ok) {
      mismatches.push({ caseId: entry.id, expected: 'success', received: scored })
      continue
    }
    const evaluated = evaluateEligibility(classificationModel, answers, scored.outcome)
    const received = evaluated.ok ? projection(evaluated.outcome) : evaluated
    const expected = expectedProjection(entry)
    if (JSON.stringify(received) !== JSON.stringify(expected)) {
      mismatches.push({ caseId: entry.id, expected, received })
    }
  }
  if (mismatches.length) return Object.freeze({
    status: 'fail' as const,
    caseCount: fixture.cases.length,
    mismatchCount: mismatches.length,
    waiverCount: 0 as const,
    mismatches: mismatches.slice(0, 20),
  })
  return Object.freeze({
    status: 'pass' as const,
    caseCount: fixture.cases.length,
    mismatchCount: 0 as const,
    waiverCount: 0 as const,
    casesHash: fixture.verification.fixtureContentHash,
  })
}

if (process.argv[1]?.endsWith('parity.ts')) {
  const result = runEligibilityParity()
  console.log(JSON.stringify(result))
  if (result.status !== 'pass') process.exitCode = 1
}
