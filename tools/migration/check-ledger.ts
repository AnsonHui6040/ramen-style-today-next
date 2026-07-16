import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'

import {
  authenticateLedgerRemoteCiEvidence,
  checkLedger,
} from './ledger-check.js'
import { recordSuccessfulCiFile } from './record-ci.js'

const repoRoot = resolve(import.meta.dirname, '../..')
const sourceFile = resolve(repoRoot, 'docs/migration/ledger.json')
const outputFile = resolve(repoRoot, 'docs/migration/ledger.md')

function repositoryFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  return new Set(output.split('\0').filter(Boolean))
}

function isCommitAncestor(evidenceSha: string, currentHeadSha: string) {
  const exists = spawnSync(
    'git',
    ['cat-file', '-e', `${evidenceSha}^{commit}`],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  if (exists.status !== 0) return false
  const ancestor = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', evidenceSha, currentHeadSha],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  return ancestor.status === 0
}

function pathExists(path: string) {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

function assertSafeParentDirectories(file: string, label: string) {
  const parent = relative(repoRoot, dirname(file))
  let current = repoRoot
  for (const segment of parent.split('/').filter(Boolean)) {
    current = resolve(current, segment)
    if (!pathExists(current)) return
    const stats = lstatSync(current)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`${label} parent must be a regular repository directory: ${current}`)
    }
  }
}

function assertRegularFile(file: string, label: string) {
  assertSafeParentDirectories(file, label)
  if (!pathExists(file)) throw new Error(`${label} does not exist`)
  const stats = lstatSync(file)
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${label} must be a regular file without symlinks`)
  }
}

function assertRegularFileOrMissing(file: string, label: string) {
  assertSafeParentDirectories(file, label)
  if (pathExists(file)) assertRegularFile(file, label)
}

function isSafeRepositoryFile(file: string) {
  const absolute = resolve(repoRoot, file)
  try {
    assertRegularFile(absolute, `repository file ${file}`)
    return true
  } catch {
    return false
  }
}

function repositoryDirectories(repoFiles: ReadonlySet<string>) {
  const directories = new Set<string>()
  for (const file of repoFiles) {
    const segments = file.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      const directory = segments.slice(0, index).join('/')
      const absolute = resolve(repoRoot, directory)
      try {
        assertSafeParentDirectories(resolve(absolute, '.scope-check'), `repository directory ${directory}`)
        const stats = lstatSync(absolute)
        if (!stats.isSymbolicLink() && stats.isDirectory()) directories.add(directory)
      } catch {
        // Unsafe or missing paths are excluded and reported by the ledger check.
      }
    }
  }
  return directories
}

function atomicWrite(file: string, content: string, label: string) {
  assertRegularFileOrMissing(file, label)
  mkdirSync(dirname(file), { recursive: true })
  const temporary = resolve(
    dirname(file),
    `.${basename(file)}.tmp-${process.pid}-${randomUUID()}`,
  )
  let temporaryExists = false
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    temporaryExists = true
    renameSync(temporary, file)
    temporaryExists = false
  } finally {
    if (temporaryExists && pathExists(temporary)) unlinkSync(temporary)
  }
}

function readVerifiedCiProof(file: string) {
  const absolute = resolve(repoRoot, file)
  try {
    const stats = lstatSync(absolute)
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('not a regular file')
    return JSON.parse(readFileSync(absolute, 'utf8')) as unknown
  } catch (error) {
    throw new Error(
      `Unable to read verified CI proof file ${file}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

async function run() {
  const mode = process.argv[2]
  assertRegularFile(sourceFile, 'ledger source')
  if (mode === '--record-ci') {
    const args = process.argv.slice(3)
    if (args.length !== 2) {
      throw new Error('Use --record-ci <batch> <verified-ci-proof-json-file>')
    }
    const [batch, proofFile] = args as [string, string]
    const proof = readVerifiedCiProof(proofFile)
    const expectedCandidateSha = execFileSync(
      'git',
      ['rev-parse', 'HEAD'],
      { cwd: repoRoot, encoding: 'utf8' },
    ).trim()
    await recordSuccessfulCiFile({
      batch,
      expectedCandidateSha,
      fetchImplementation: globalThis.fetch,
      proofInput: proof,
      repoRoot,
      sourceFile,
    })
    return
  }
  if (mode !== '--write' && mode !== '--check') throw new Error('Use --write or --check')

  const input = JSON.parse(readFileSync(sourceFile, 'utf8')) as unknown
  const repoFiles = repositoryFiles()
  const existingFiles = new Set([...repoFiles].filter(isSafeRepositoryFile))
  if (mode === '--write') {
    assertRegularFileOrMissing(outputFile, 'ledger Markdown output')
    repoFiles.add('docs/migration/ledger.md')
    existingFiles.add('docs/migration/ledger.md')
  }
  const repoDirectories = repositoryDirectories(repoFiles)
  const currentMarkdown = mode === '--check'
    ? pathExists(outputFile)
      ? (assertRegularFile(outputFile, 'ledger Markdown output'), readFileSync(outputFile, 'utf8'))
      : ''
    : undefined
  const result = checkLedger({
    input,
    repoFiles,
    existingFiles,
    repoDirectories,
    currentMarkdown,
  })
  if (!result.ok || result.markdown === undefined) {
    for (const error of result.errors) console.error(`LEDGER_INVALID ${error}`)
    process.exitCode = 1
    return
  }

  if (mode === '--check') {
    const currentHeadSha = execFileSync(
      'git',
      ['rev-parse', 'HEAD'],
      { cwd: repoRoot, encoding: 'utf8' },
    ).trim()
    await authenticateLedgerRemoteCiEvidence(
      input,
      currentHeadSha,
      globalThis.fetch,
      isCommitAncestor,
      process.env.GITHUB_TOKEN,
    )
  }

  if (mode === '--write') {
    atomicWrite(outputFile, result.markdown, 'ledger Markdown output')
  }
}

void run().catch((error: unknown) => {
  console.error(`LEDGER_INVALID ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
