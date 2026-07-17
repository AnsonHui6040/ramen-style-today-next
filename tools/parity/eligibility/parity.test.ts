import { describe, expect, test } from 'vitest'

import { runEligibilityParity } from './parity.js'
import { loadVerifiedEligibilityFixtureSet } from './verify-fixtures.js'

describe('eligibility legacy parity', () => {
  test('verifies bounded committed lineage and coverage', () => {
    const fixture = loadVerifiedEligibilityFixtureSet()
    expect(fixture.verification).toMatchObject({
      status: 'pass',
      caseCount: 14,
      coverage: {
        exclusionOptions: 9,
        activeBlockingTags: 6,
        inactiveBlockingTags: 6,
      },
    })
  })

  test('matches the legacy eligibility result projection with no waivers', () => {
    expect(runEligibilityParity()).toMatchObject({
      status: 'pass',
      caseCount: 14,
      mismatchCount: 0,
      waiverCount: 0,
    })
  })
})
