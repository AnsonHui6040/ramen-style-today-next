import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'
import { restoreQuestionnaire } from '@ramen-style/classification-core'
import {
  classificationDefinition,
  compileClassification,
} from '@ramen-style/classification-core/compiler'

import { labelNames } from './restore-classify.js'
import {
  buildRestoreScenarios,
  namedDivergenceFixtures,
  namedParityFixtures,
} from './restore-scenarios.js'
import { canonical, evaluateNew, parsedObject, RowDigest } from './restore-tables.js'

const read = (file: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures', file), 'utf8'))
const parityFixture = read('restore-parity.json') as {
  scenarioCount: number
  sanitization: { count: number; sha256: string }
  parity: { count: number; sha256: string }
  named: { id: string; raw: string | null; state: unknown }[]
}
const divergenceFixture = read('restore-divergence.json') as {
  scenarioCount: number
  categories: string
  counts: Record<string, number>
  divergence: { count: number; sha256: string }
  named: { id: string; raw: string; labels: string[]; legacy: unknown; expected: unknown; core?: unknown }[]
}

const compiled = compileClassification(
  classificationDefinition,
  'packages/classification-core/src/definitions/bundle.ts',
)
if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
const model = compiled.model
const raws = buildRestoreScenarios()
const evaluations = raws.map((raw) => evaluateNew(raw, model))
const rerun = 'run `npm run parity:legacy -- <legacy checkout at eebf00b>` to locate the first difference'

describe('restore scenario space', () => {
  test('is deterministic and matches the recorded fixtures', () => {
    expect(raws.length).toBe(parityFixture.scenarioCount)
    expect(raws.length).toBe(divergenceFixture.scenarioCount)
    expect(divergenceFixture.categories).toHaveLength(raws.length)
    expect(buildRestoreScenarios()).toEqual(raws)
  })

  test('legacy classification never depends on the new persistence code', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'restore-classify.ts'), 'utf8')
    expect(source).not.toMatch(/from '@ramen-style\/classification-core/)
    const imports = source.split('\n').filter((line) => /^\s*(import|export) .* from /.test(line))
    expect(imports.every((line) => line.includes('./'))).toBe(true)
  })
})

describe('restore legacy parity', () => {
  test('legacy sanitization (restoreUserAnswers) is reproduced for every scenario, healthy or not', () => {
    const digest = new RowDigest()
    for (const [index, raw] of raws.entries()) {
      if (parsedObject(raw)) digest.add([index, evaluations[index]!.sanitized])
    }
    expect(digest.result(), rerun).toEqual(parityFixture.sanitization)
  })

  test('every scenario outside the approved divergence set equals the frozen legacy state exactly', () => {
    const digest = new RowDigest()
    for (const [index, evaluation] of evaluations.entries()) {
      if (divergenceFixture.categories[index] === '0') digest.add([index, evaluation.state])
    }
    expect(digest.result(), rerun).toEqual(parityFixture.parity)
  })

  test.each(parityFixture.named.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    const expected = namedParityFixtures.find((candidate) => candidate.id === entry.id)
    expect(expected?.raw).toBe(entry.raw)
    expect(canonical(evaluateNew(entry.raw, model).state)).toEqual(entry.state)
    expect(divergenceFixture.categories[raws.indexOf(entry.raw)] ?? '0').toBe('0')
  })
})

describe('restore approved repair divergence (BC-1 to BC-4)', () => {
  test('the approved divergence set is exactly the recorded one', () => {
    const digest = new RowDigest()
    for (const [index, evaluation] of evaluations.entries()) {
      const labels = Number.parseInt(divergenceFixture.categories[index]!, 16)
      if (labels !== 0) digest.add([index, labels, evaluation.state, evaluation.complete])
    }
    expect(digest.result(), rerun).toEqual(divergenceFixture.divergence)
    const names = new Set(Array.from(divergenceFixture.categories, (char) => (
      labelNames(Number.parseInt(char, 16)).join('+')
    )).flatMap((joined) => joined.split('+')).filter(Boolean))
    expect([...names].sort()).toEqual(['BC-1', 'BC-2', 'BC-3', 'BC-4'])
  })

  test.each(divergenceFixture.named.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
    const declared = namedDivergenceFixtures.find((candidate) => candidate.id === entry.id)!
    expect(declared.raw).toBe(entry.raw)
    expect(entry.labels).toEqual(declared.expectedLabels.length ? declared.expectedLabels : ['BC-3 (core-level)'])
    expect(canonical(evaluateNew(entry.raw, model).state)).toEqual(entry.expected)
    const parsed = parsedObject(entry.raw)!
    const core = restoreQuestionnaire(parsed, model)
    if (declared.coreLevel) {
      expect(core.ok && { complete: core.complete, resumeQuestionId: core.resumeQuestionId }).toEqual(declared.coreLevel)
      expect(entry.core).toEqual(declared.coreLevel)
    } else {
      expect(canonical(entry.legacy)).not.toEqual(entry.expected)
    }
  })

  test('D3 keeps the first two over-limit selections in stored order', () => {
    const entry = divergenceFixture.named.find((candidate) => candidate.id.startsWith('D3'))!
    expect((entry.expected as { answers: { source: string[] } }).answers.source).toEqual(['duck', 'pork'])
  })

  test('D6 completes a bypassed branch by dropping the stale tare and writing the forced one', () => {
    const entry = divergenceFixture.named.find((candidate) => candidate.id.startsWith('D6'))!
    expect((entry.expected as { answers: { tare: string } }).answers.tare).toBe('miso')
    expect((entry.expected as { stepIndex: number }).stepIndex).toBe(7)
  })
})
