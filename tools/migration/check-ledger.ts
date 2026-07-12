import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'

import { checkLedger, recordSuccessfulCi } from './ledger-check.js'

const repoRoot = resolve(import.meta.dirname, '../..')
const sourceFile = resolve(repoRoot, 'docs/migration/ledger.json')
const outputFile = resolve(repoRoot, 'docs/migration/ledger.md')

function repositoryFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  return new Set(output.split('\n').filter(Boolean))
}

function run() {
  const mode = process.argv[2]
  if (mode === '--record-ci') {
    const [batch, commitSha, runUrl] = process.argv.slice(3)
    if (!batch || !commitSha || !runUrl) {
      throw new Error('Use --record-ci <batch> <full-commit-sha> <workflow-run-url>')
    }
    const input = JSON.parse(readFileSync(sourceFile, 'utf8')) as unknown
    const updated = recordSuccessfulCi(input, batch, commitSha, runUrl)
    writeFileSync(sourceFile, `${JSON.stringify(updated, null, 2)}\n`)
    return
  }
  if (mode !== '--write' && mode !== '--check') throw new Error('Use --write or --check')

  const input = JSON.parse(readFileSync(sourceFile, 'utf8')) as unknown
  const repoFiles = repositoryFiles()
  const existingFiles = new Set([...repoFiles].filter((file) => {
    const absolute = resolve(repoRoot, file)
    return existsSync(absolute) && statSync(absolute).isFile()
  }))
  if (mode === '--write') {
    repoFiles.add('docs/migration/ledger.md')
    existingFiles.add('docs/migration/ledger.md')
  }
  const currentMarkdown = mode === '--check'
    ? existsSync(outputFile) ? readFileSync(outputFile, 'utf8') : ''
    : undefined
  const result = checkLedger({ input, repoFiles, existingFiles, currentMarkdown })
  if (!result.ok || result.markdown === undefined) {
    for (const error of result.errors) console.error(`LEDGER_INVALID ${error}`)
    process.exitCode = 1
    return
  }

  if (mode === '--write') {
    mkdirSync(dirname(outputFile), { recursive: true })
    writeFileSync(outputFile, result.markdown)
  }
}

try {
  run()
} catch (error) {
  console.error(`LEDGER_INVALID ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
