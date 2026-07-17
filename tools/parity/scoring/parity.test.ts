import { describe, expect, test } from 'vitest'

import { runScoringParity } from './parity.js'

describe('legacy scoring numerical and ordering parity', () => {
  test('has zero case, line, adjustment, ranking, or confidence mismatches', () => {
    expect(runScoringParity()).toMatchObject({
      status: 'pass',
      mismatchCount: 0,
      waiverCount: 0,
    })
  })
})
