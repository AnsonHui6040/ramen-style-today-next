import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  createScoringExtractorEnvironment,
  computeLegacyScoringTrackedSourceHashesHash,
  legacyScoringTrackedSourceCount,
  legacyScoringTrackedSourceHashesHash,
  scoringExpectedLineage,
  scoringExtractorAuthoringSourcePaths,
  scoringInstrumentationDescriptor,
  scoringInstrumentationHash,
  scoringSeedsHash,
  scoringTrackedSourceHashes,
} from './extractor.js'

const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')

describe('legacy scoring extractor', () => {
  test('binds the reviewed lineage and exact passive-observation patch targets', () => {
    expect(scoringExpectedLineage.commit)
      .toBe('eebf00b7ddfbbe6f01ff598e57f1e17197068a37')
    expect(scoringExpectedLineage.treeHash)
      .toBe('3e527de876cfeccfd3154ddc492830d71c4cfd9a')
    expect(scoringInstrumentationDescriptor.targets).toEqual([
      { path: 'src/lib/scoring/scorer.ts', status: ' M' },
      { path: 'src/parity-scoring-observer.test.ts', status: '??' },
    ])
    expect(scoringInstrumentationDescriptor.extractionTestPath)
      .toBe('src/parity-scoring-observer.test.ts')
  })

  test('binds patch, seed, and authoring source hashes', () => {
    expect(sha256(readFileSync(resolve(
      process.cwd(),
      'tools/parity/scoring/legacy-instrumentation.patch',
    )))).toBe(scoringInstrumentationHash)
    expect(sha256(readFileSync(resolve(
      process.cwd(),
      'tools/parity/scoring/seeds.json',
    )))).toBe(scoringSeedsHash)
    expect(scoringExtractorAuthoringSourcePaths).toEqual([
      'tools/parity/shared/contracts.ts',
      'tools/parity/shared/authoring.ts',
      'tools/parity/scoring/contracts.ts',
      'tools/parity/scoring/extractor.ts',
      'tools/parity/scoring/extract.ts',
    ])
  })

  test('keeps observer-off before observer-on and accepts five or six confidence rows', () => {
    const patch = readFileSync(resolve(
      process.cwd(),
      'tools/parity/scoring/legacy-instrumentation.patch',
    ), 'utf8')
    const expectedIndex = patch.indexOf(
      '+  const expectedOutcome = scoreQuestionnaire(answers)',
    )
    const observerIndex = patch.indexOf(
      '+  global.__RAMEN_SCORING_PARITY_OBSERVER__ = observer',
    )
    expect(expectedIndex).toBeGreaterThan(0)
    expect(observerIndex).toBeGreaterThan(expectedIndex)
    expect(patch).toContain('+    || displayedResultCount < 5')
    expect(patch).toContain('+    || displayedResultCount > 6')
    expect(patch).toContain(
      '+    || confidenceObservations.length !== displayedResultCount',
    )
  })

  test('independently binds the complete 66-file legacy source closure', () => {
    expect(Object.keys(scoringTrackedSourceHashes))
      .toHaveLength(legacyScoringTrackedSourceCount)
    expect(computeLegacyScoringTrackedSourceHashesHash(scoringTrackedSourceHashes))
      .toBe(legacyScoringTrackedSourceHashesHash)
    expect(scoringTrackedSourceHashes).toMatchObject({
      'package.json': '6bb13faa4bc9abb2cd603c75e4d1d83e36c2b738e5a348f3c8cc7322656b81ab',
      'src/config/questions.ts': '4ee41855fa849d650e0d970cc3e39114ff5f73c648833613e700846bff764906',
      'src/config/styles.ts': '9e8dee82efc4a1dd29cec3e1534f050135812d4031ac2e7c36dda0063860853f',
      'src/lib/scoring/scorer.ts': 'befc80c7d648712968a2fee74eab8825feb1d583f4e3bbd35478684c27846cfe',
    })
  })

  test('does not permit caller-supplied lineage replacement', () => {
    const environment = createScoringExtractorEnvironment({
      legacyRoot: '/tmp/legacy',
      toolRoot: process.cwd(),
      destination: '/tmp/scoring',
      patchPath: '/tmp/patch',
      seedsPath: '/tmp/seeds',
      expected: { commit: 'evil' },
    } as never)
    expect(environment.expected).toBe(scoringExpectedLineage)
  })
})
