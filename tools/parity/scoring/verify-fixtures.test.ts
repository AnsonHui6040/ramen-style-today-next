import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  parseLegacyScoringRawCases,
  scoringFixtureManifestSchema,
  serializeLegacyScoringCases,
  serializeScoringFixtureManifest,
} from './contracts.js'
import { scoringExtractorAuthoringSourcePaths } from './extractor.js'
import {
  maximumScoringCasesBytes,
  verifyCommittedScoringFixtures,
  verifyScoringFixtureSet,
} from './verify-fixtures.js'

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const fixtureRoot = resolve(repositoryRoot, 'tools/parity/fixtures/scoring/legacy-v1')

function fixtureInput() {
  return {
    casesBytes: readFileSync(resolve(fixtureRoot, 'cases.json')),
    manifestBytes: readFileSync(resolve(fixtureRoot, 'manifest.json')),
    instrumentationBytes: readFileSync(resolve(
      repositoryRoot,
      'tools/parity/scoring/legacy-instrumentation.patch',
    )),
    seedBytes: readFileSync(resolve(repositoryRoot, 'tools/parity/scoring/seeds.json')),
    authoringSources: scoringExtractorAuthoringSourcePaths.map((path) => ({
      path,
      bytes: readFileSync(resolve(repositoryRoot, path)),
    })),
  }
}

describe('frozen legacy scoring fixtures', () => {
  test('verify offline with exact immutable identity and complete coverage', () => {
    const result = verifyCommittedScoringFixtures()
    expect(result).toMatchObject({
      status: 'pass',
      caseCount: 26,
      coreLineCount: 9_828,
      adjustmentLineCount: 1_950,
      casesHash: '7f79b5d9833d354671043f093d2d694614231195ad2fe167dbe348c50718d291',
      fixtureContentHash: '01e59203b0d0519245dc5438c627ff8de62400ca64f9aafa68498f3dcd98fe83',
      manifestHash: '8379cbb14588d5ba586bda895e8791edf8cfd98dc3bdffcb4512e6e8fb71101f',
      authoringHash: '73a2b211ae88e91eaf255ffdac468c311f05f0c7e12ea42fcb6b0715d47b92aa',
      coverage: {
        styles: 18,
        cores: 54,
        rules: 378,
        bonuses: 18,
        conflicts: 7,
        observedRuleTiers: 1_155,
      },
    })
  })

  test('retains finite decimal observations instead of narrowing them to integers', () => {
    const verified = verifyScoringFixtureSet(fixtureInput())
    const decimalValues = verified.cases.flatMap((entry) => entry.coreCandidates.flatMap(
      (core) => core.questionLines.flatMap(({ rawPoints }) => (
        Number.isInteger(rawPoints) ? [] : [rawPoints]
      )),
    ))
    expect(decimalValues.length).toBeGreaterThan(0)
    expect(decimalValues.every(Number.isFinite)).toBe(true)
  })

  test('rejects non-canonical and over-bound cases bytes before publication use', () => {
    const input = fixtureInput()
    expect(() => verifyScoringFixtureSet({
      ...input,
      casesBytes: Buffer.concat([input.casesBytes, Buffer.from('\n')]),
    })).toThrow('case bytes drifted')
    expect(() => verifyScoringFixtureSet({
      ...input,
      casesBytes: new Uint8Array(maximumScoringCasesBytes + 1),
    })).toThrow('approved bound')
  })

  test('rejects case count, order, content hash, and authoring identity tampering', () => {
    const input = fixtureInput()
    const cases = parseLegacyScoringRawCases(JSON.parse(input.casesBytes.toString('utf8')))
    expect(() => verifyScoringFixtureSet({
      ...input,
      casesBytes: serializeLegacyScoringCases(cases.slice(0, -1)),
    })).toThrow('case count mismatch')
    expect(() => verifyScoringFixtureSet({
      ...input,
      casesBytes: serializeLegacyScoringCases([cases[1]!, cases[0]!, ...cases.slice(2)]),
    })).toThrow('seed identity mismatch')

    const manifest = scoringFixtureManifestSchema.parse(
      JSON.parse(input.manifestBytes.toString('utf8')),
    )
    expect(() => verifyScoringFixtureSet({
      ...input,
      manifestBytes: serializeScoringFixtureManifest({
        ...manifest,
        casesHash: '0'.repeat(64),
      }),
    })).toThrow('manifest identity drifted')

    expect(() => verifyScoringFixtureSet({
      ...input,
      authoringSources: input.authoringSources.map((source, index) => (
        index === 0 ? { ...source, bytes: Buffer.from('tampered') } : source
      )),
    })).toThrow('authoring identity drifted')
  })

  test('verifies from committed inputs without a legacy checkout or repository cwd', () => {
    const input = fixtureInput()
    const originalCwd = process.cwd()
    const isolatedCwd = mkdtempSync(join(tmpdir(), 'scoring-fixture-offline-'))
    try {
      process.chdir(isolatedCwd)
      expect(verifyScoringFixtureSet(input).verification.status).toBe('pass')
    } finally {
      process.chdir(originalCwd)
      rmSync(isolatedCwd, { recursive: true, force: true })
    }
  })
})
