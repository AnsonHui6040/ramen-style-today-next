import { describe, expect, expectTypeOf, test } from 'vitest'

import { diagnosticCodes } from '../contracts/diagnostic-codes.js'
import type {
  ScoreCompletedAnswersResult,
  ScoreTrace,
  ScoringDiagnostic,
  ScoringDiagnosticCode,
} from '../contracts/scoring.js'

describe('scoring public contracts', () => {
  test('registers the exact bounded runtime codes', () => {
    expect(diagnosticCodes).toEqual(expect.arrayContaining([
      'SCORING_COMPLETED_ANSWERS_INVALID',
      'SCORING_MODEL_IDENTITY_MISMATCH',
      'SCORING_INVARIANT_FAILED',
    ]))
  })

  test('keeps the result, diagnostics, and trace statically closed', () => {
    expectTypeOf<ScoreCompletedAnswersResult>().toMatchTypeOf<
      | { readonly ok: true; readonly outcome: { readonly trace: ScoreTrace } }
      | { readonly ok: false; readonly diagnostics: readonly [ScoringDiagnostic] }
    >()
    expectTypeOf<ScoringDiagnostic['code']>().toEqualTypeOf<ScoringDiagnosticCode>()
  })
})
