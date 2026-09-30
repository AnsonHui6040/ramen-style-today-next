import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  classificationDefinition,
  compileClassification,
} from '@ramen-style/classification-core/compiler'
import { restoreQuestionnaire } from '@ramen-style/classification-core'

import { loadLegacyRestoreOracle } from './legacy-restore-engine.js'
import { labelNames, classify } from './restore-classify.js'
import { buildRestoreScenarios, namedDivergenceFixtures, namedParityFixtures } from './restore-scenarios.js'
import { canonical, evaluateNew, parsedObject, RowDigest, same } from './restore-tables.js'

export const parityFixturePath = resolve(import.meta.dirname, 'fixtures/restore-parity.json')
export const divergenceFixturePath = resolve(import.meta.dirname, 'fixtures/restore-divergence.json')
const baselineCommit = 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37'
const legacyFiles = [
  'src/App.tsx',
  'src/config/questions.ts',
  'src/data/questions.json',
  'src/domain/questionRules.ts',
  'src/domain/schema.ts',
  'src/i18n.ts',
]

const mode = process.argv[2]
const legacyRoot = process.argv[3]
if ((mode !== '--write' && mode !== '--check') || !legacyRoot) {
  console.error('Usage: tsx tools/parity/restore-generate.ts (--write|--check) <legacy checkout at the baseline commit>')
  process.exit(2)
}

const oracle = await loadLegacyRestoreOracle(legacyRoot)
const compiled = compileClassification(
  classificationDefinition,
  'packages/classification-core/src/definitions/bundle.ts',
)
if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
const model = compiled.model
const failures: unknown[] = []
const fail = (kind: string, detail: unknown) => {
  if (failures.length < 5) failures.push({ kind, ...(detail as object) })
}

const raws = buildRestoreScenarios()
const l1 = new RowDigest()
const parity = new RowDigest()
const divergence = new RowDigest()
const counts = { parity: 0, divergence: 0, 'BC-1': 0, 'BC-2': 0, 'BC-3': 0, 'BC-4': 0 }
let categories = ''

for (const [index, raw] of raws.entries()) {
  const legacy = oracle.restore(raw)
  const evaluated = evaluateNew(raw, model)
  const labels = classify(oracle, legacy)
  categories += labels.toString(16)

  // L1: sanitization parity holds for every scenario, healthy or not.
  const parsed = parsedObject(raw)
  if (parsed) {
    const expected = oracle.restoreAnswers(parsed.answers)
    if (!evaluated.sanitized || !same(evaluated.sanitized, expected)) {
      fail('L1 sanitization differs from legacy restoreUserAnswers', { index, raw, expected, received: evaluated.sanitized })
    }
    l1.add([index, evaluated.sanitized])
  }

  if (labels === 0) {
    if (!same(evaluated.state, legacy)) {
      fail('unapproved difference in a legacy-parity scenario', { index, raw, legacy, received: evaluated.state })
    }
    parity.add([index, evaluated.state])
    counts.parity += 1
  } else {
    if (same(evaluated.state, legacy)) {
      fail('approved divergence converged with legacy (stale approval)', { index, raw, labels: labelNames(labels) })
    }
    divergence.add([index, labels, evaluated.state, evaluated.complete])
    counts.divergence += 1
    for (const name of labelNames(labels)) counts[name as keyof typeof counts] += 1
  }
}

const named = namedDivergenceFixtures.map((entry) => {
  const legacy = oracle.restore(entry.raw)
  const evaluated = evaluateNew(entry.raw, model)
  const labels = labelNames(classify(oracle, legacy))
  if (JSON.stringify(labels) !== JSON.stringify(entry.expectedLabels)) {
    fail('named divergence fixture has unexpected labels', { id: entry.id, expected: entry.expectedLabels, received: labels })
  }
  const parsed = parsedObject(entry.raw)
  const core = parsed ? restoreQuestionnaire(parsed, model) : undefined
  const coreLevel = core?.ok ? { complete: core.complete, resumeQuestionId: core.resumeQuestionId } : undefined
  if (entry.coreLevel && !same(entry.coreLevel, coreLevel)) {
    fail('named core-level fixture differs from its expectation', { id: entry.id, expected: entry.coreLevel, received: coreLevel })
  }
  if (labels.length > 0 && same(evaluated.state, legacy)) {
    fail('named divergence fixture converged with legacy', { id: entry.id })
  }
  return canonical({
    id: entry.id,
    raw: entry.raw,
    labels: entry.expectedLabels.length ? entry.expectedLabels : ['BC-3 (core-level)'],
    legacy,
    expected: evaluated.state,
    core: coreLevel,
  })
})

const namedParity = namedParityFixtures.map((entry) => {
  const legacy = oracle.restore(entry.raw)
  const evaluated = evaluateNew(entry.raw, model)
  const labels = labelNames(classify(oracle, legacy))
  if (!same(evaluated.state, legacy)) {
    fail('named parity fixture differs from legacy', { id: entry.id, legacy, received: evaluated.state })
  }
  if (labels.length > 0) fail('named parity fixture is not healthy', { id: entry.id, labels })
  return canonical({ id: entry.id, raw: entry.raw, state: legacy })
})

if (failures.length > 0) {
  console.error('Restore parity failed:', JSON.stringify(failures, null, 2))
  process.exit(1)
}

const legacyHash = (file: string) => createHash('sha256').update(readFileSync(join(legacyRoot, file))).digest('hex')
const provenance = {
  schemaVersion: 1,
  baseline: { repository: 'AnsonHui6040/ramen-style-today', commit: baselineCommit },
  legacySourceSha256: Object.fromEntries(legacyFiles.map((file) => [file, legacyHash(file)])),
  scenarioCount: raws.length,
}
const parityFixture = `${JSON.stringify({
  ...provenance,
  category: 'legacy-parity',
  note: 'Every scenario not listed as an approved divergence must equal the frozen legacy behavior exactly.',
  sanitization: l1.result(),
  parity: parity.result(),
  named: namedParity,
}, null, 2)}\n`
const divergenceFixture = `${JSON.stringify({
  ...provenance,
  category: 'approved-divergence',
  note: 'BC-1 to BC-4 are the only approved differences from legacy. categories has one hex label set per scenario (1=BC-1, 2=BC-2, 4=BC-3, 8=BC-4, 0=legacy parity).',
  counts,
  divergence: divergence.result(),
  categories,
  named,
}, null, 2)}\n`

if (mode === '--write') {
  writeFileSync(parityFixturePath, parityFixture)
  writeFileSync(divergenceFixturePath, divergenceFixture)
} else if (
  readFileSync(parityFixturePath, 'utf8') !== parityFixture
  || readFileSync(divergenceFixturePath, 'utf8') !== divergenceFixture
) {
  console.error('Committed restore fixtures do not match the legacy oracle output')
  process.exit(1)
}
console.log(`restore parity ${mode === '--write' ? 'written' : 'verified'}: ${JSON.stringify(counts)}`)
