import { describe, expect, test } from 'vitest'

import { expectedDivergencesSchema } from './contracts.js'
import { compareParityCase } from './compare.js'
import {
  expectedCase,
  receivedTrace,
  validDivergence,
} from './test-fixtures.js'

describe('observable trace comparison', () => {
  test('reports the first JSON Pointer and a replay command', () => {
    const mismatch = compareParityCase(expectedCase, receivedTrace)
    if (!mismatch) throw new Error('expected a deliberate observable mismatch')
    expect(mismatch.pointer).toBe('/frames/1/visibleOptionIds/0')
    expect(mismatch.replayCommand).toContain('--case')
  })

  test('rejects a divergence outside observable frames', () => {
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [{
        ...validDivergence,
        jsonPointer: '/canonicalAnswers/form',
      }],
    }).success).toBe(false)
  })
})
