import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  legacyScoringRepositoryIdentity,
  legacyScoringSeedFileSchema,
  maximumScoringSeedBytes,
  parseLegacyScoringSeedBytes,
  scoringCoverageBoundaryIds,
  serializeLegacyScoringSeeds,
} from './contracts.js'

const seedPath = resolve(process.cwd(), 'tools/parity/scoring/seeds.json')

describe('legacy scoring parity contracts', () => {
  test('binds the frozen legacy identity and no-eligibility projection', () => {
    expect(legacyScoringRepositoryIdentity).toEqual({
      host: 'github.com',
      owner: 'AnsonHui6040',
      repository: 'ramen-style-today',
      commit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
      treeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
    })
  })

  test('accepts only canonical bounded seeds with exclusions none', () => {
    const bytes = readFileSync(seedPath)
    const parsed = parseLegacyScoringSeedBytes(bytes)
    expect(parsed.cases.length).toBeGreaterThan(18)
    expect(parsed.cases.length).toBeLessThanOrEqual(256)
    expect(parsed.cases.every(({ answers }) => (
      answers.exclusions.length === 1 && answers.exclusions[0] === 'none'
    ))).toBe(true)
    expect(legacyScoringSeedFileSchema.parse(JSON.parse(
      Buffer.from(serializeLegacyScoringSeeds(parsed)).toString('utf8'),
    ))).toEqual(parsed)
  })

  test('declares observed and compiled obligations without expected scores', () => {
    const parsed = legacyScoringSeedFileSchema.parse(
      JSON.parse(readFileSync(seedPath, 'utf8')),
    )
    expect(parsed.required.styleTopIds).toHaveLength(18)
    expect(parsed.required.ruleTierCoverage).toBe('all-declared-rules-and-tiers')
    expect(parsed.required.bonusStates).toBe('active-and-inactive')
    expect(parsed.required.conflictStates).toBe('active-and-inactive')
    expect(parsed.required.boundaryIds).toEqual(scoringCoverageBoundaryIds)
    expect(parsed.required.ownership).toEqual({
      styleTops: 'legacyObserved',
      ruleTiers: 'legacyObserved',
      adjustments: 'legacyObserved',
      subtype: 'legacyObserved',
      ranking: 'legacyObserved',
      confidence: 'legacyObserved',
      legacyObservedBoundaryIds: [
        'arithmetic-reconstruction',
        'bonus-cap-reached',
        'confidence-threshold',
        'equal-core',
        'equal-style',
        'maximum-confidence',
        'maximum-score',
        'low-confidence-gap',
        'penalty-cap-reached',
        'primary-limit',
        'alternative-limit',
        'score-floor-reached',
        'subtype-all-noodles',
      ],
      compiledContractBoundaryIds: [
        'bonus-cap-truncation',
        'penalty-cap-truncation',
        'score-floor-contract',
      ],
    })
    expect(JSON.stringify(parsed)).not.toMatch(/expected(?:Score|Output)|eligibility/i)
  })

  test('rejects unknown ids, duplicate case ids, and non-none exclusions', () => {
    const parsed = JSON.parse(readFileSync(seedPath, 'utf8')) as Record<string, unknown>
    const cases = parsed.cases as Array<Record<string, unknown>>
    const first = cases[0]!
    expect(() => legacyScoringSeedFileSchema.parse({
      ...parsed,
      cases: [first, first],
    })).toThrow()
    expect(() => legacyScoringSeedFileSchema.parse({
      ...parsed,
      cases: [{
        ...first,
        answers: { ...(first.answers as object), exclusions: ['pork'] },
      }],
    })).toThrow()
    expect(() => legacyScoringSeedFileSchema.parse({
      ...parsed,
      cases: [{
        ...first,
        answers: { ...(first.answers as object), tare: ['unknown-option'] },
      }],
    })).toThrow()
    const incompleteAnswers = {
      ...(first.answers as Record<string, unknown>),
    }
    delete incompleteAnswers.noodle
    expect(() => legacyScoringSeedFileSchema.parse({
      ...parsed,
      cases: [{ ...first, answers: incompleteAnswers }],
    })).toThrow()
  })

  test('binds canonical bytes, byte limits, and the reviewed seed hash', () => {
    const bytes = readFileSync(seedPath)
    const parsed = parseLegacyScoringSeedBytes(bytes)
    expect(Buffer.from(serializeLegacyScoringSeeds(parsed))).toEqual(bytes)
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe('eaa143935ac61e9c622c500991d03cd3dc35c03d1ff9bd4d2c5dd39376f7bb57')
    expect(() => parseLegacyScoringSeedBytes(
      new Uint8Array(maximumScoringSeedBytes + 1),
    )).toThrow('approved bound')
  })
})
import { createHash } from 'node:crypto'
