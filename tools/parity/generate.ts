import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  classificationDefinition,
  compileClassification,
} from '@ramen-style/classification-core/compiler'

import { loadLegacyEngine } from './legacy-engine.js'
import { createNewEngine } from './new-engine.js'
import { buildTables, digestTables, firstDifference } from './scenarios.js'

export const fixturePath = resolve(import.meta.dirname, 'fixtures/questions-flow.json')
const baselineCommit = 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37'

const legacyRoot = process.argv[3]
const mode = process.argv[2]
if ((mode !== '--write' && mode !== '--check') || !legacyRoot) {
  console.error('Usage: tsx tools/parity/generate.ts (--write|--check) <legacy checkout at the baseline commit>')
  process.exit(2)
}

const legacyHash = (file: string) => (
  createHash('sha256').update(readFileSync(join(legacyRoot, file))).digest('hex')
)
const legacy = await loadLegacyEngine(legacyRoot)
const legacyTables = buildTables(legacy)

const compiled = compileClassification(
  classificationDefinition,
  'packages/classification-core/src/definitions/bundle.ts',
)
if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
const difference = firstDifference(legacyTables, buildTables(createNewEngine(compiled.model)))
if (difference) {
  console.error('New flow differs from the legacy oracle:', JSON.stringify(difference, null, 2))
  process.exit(1)
}

const fixture = `${JSON.stringify({
  schemaVersion: 1,
  baseline: { repository: 'AnsonHui6040/ramen-style-today', commit: baselineCommit },
  legacySourceSha256: Object.fromEntries([
    'src/App.tsx',
    'src/config/questions.ts',
    'src/data/questions.json',
    'src/domain/questionRules.ts',
    'src/domain/schema.ts',
  ].map((file) => [file, legacyHash(file)])),
  sections: digestTables(legacyTables),
}, null, 2)}\n`

if (mode === '--write') {
  writeFileSync(fixturePath, fixture)
} else if (readFileSync(fixturePath, 'utf8') !== fixture) {
  console.error('Committed parity fixture does not match the legacy oracle output')
  process.exit(1)
}
console.log(`parity ${mode === '--write' ? 'written' : 'verified'}`)
