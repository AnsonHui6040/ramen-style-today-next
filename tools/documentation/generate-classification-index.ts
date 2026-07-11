import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'

import { compileClassification, syntheticDefinition } from '@ramen-style/classification-core/compiler'
import { buildDocumentation } from './build-index.js'
import { documentationRelations } from './relations.js'
import { scanCoreConsumers } from './scan-imports.js'

const repoRoot = resolve(import.meta.dirname, '../..')
const mode = process.argv[2]
if (mode !== '--write' && mode !== '--check') throw new Error('Use --write or --check')

const compiled = compileClassification(
  syntheticDefinition,
  'packages/classification-core/src/definitions/synthetic.ts',
)
if (!compiled.ok) {
  console.error(JSON.stringify(compiled.diagnostics, null, 2))
  process.exit(1)
}

const repoFiles = new Set(execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { cwd: repoRoot, encoding: 'utf8' },
).split('\n').filter(Boolean))
const existingPaths = new Set(documentationRelations.flatMap((item) => [
  item.canonicalSource,
  ...item.validators,
  ...item.consumers,
  ...item.tests,
  ...item.migrations,
]).filter((file) => {
  const absolute = resolve(repoRoot, file)
  return repoFiles.has(file) && existsSync(absolute) && statSync(absolute).isFile()
}))
const detected = scanCoreConsumers(repoRoot, ['apps', 'packages', 'tools'], repoFiles)
const built = buildDocumentation(compiled.model, documentationRelations, detected, existingPaths)
if (built.diagnostics.length) {
  console.error(JSON.stringify(built.diagnostics, null, 2))
  process.exit(1)
}

const outputs = new Map([
  ['docs/classification/manifest.json', built.manifest],
  ['docs/classification/index.md', built.markdown],
])
const allowedClassificationFiles = new Set([
  ...outputs.keys(),
  'docs/classification/change-map.md',
])
let hasInvalidOwnedEntry = false
for (const entry of readdirSync(resolve(repoRoot, 'docs/classification'), { withFileTypes: true })) {
  const relative = `docs/classification/${entry.name}`
  if (!entry.isFile() || !allowedClassificationFiles.has(relative)) {
    console.error(`DOC_INDEX_DRIFT unexpected owned-path entry ${relative}`)
    hasInvalidOwnedEntry = true
  }
}
if (hasInvalidOwnedEntry) process.exit(1)
for (const [relative, content] of outputs) {
  const file = resolve(repoRoot, relative)
  if (mode === '--write') {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  } else if (!existsSync(file) || readFileSync(file, 'utf8') !== content) {
    console.error(`DOC_INDEX_DRIFT ${relative}`)
    process.exitCode = 1
  }
}
