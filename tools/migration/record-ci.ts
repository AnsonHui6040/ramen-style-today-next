import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, relative, resolve } from 'node:path'

import {
  recordSuccessfulCi,
  verifySuccessfulCiProof,
} from './ledger-check.js'

export interface RecordSuccessfulCiFileInput {
  batch: string
  expectedCandidateSha: string
  fetchImplementation: typeof fetch
  proofInput: unknown
  repoRoot: string
  sourceFile: string
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

function assertSafeParentDirectories(file: string, repoRoot: string) {
  const parent = relative(repoRoot, dirname(file))
  let current = repoRoot
  for (const segment of parent.split('/').filter(Boolean)) {
    current = resolve(current, segment)
    const stats = lstatSync(current)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`ledger source parent must be a regular repository directory: ${current}`)
    }
  }
}

function assertRegularLedgerSource(file: string, repoRoot: string) {
  assertSafeParentDirectories(file, repoRoot)
  const stats = lstatSync(file)
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error('ledger source must be a regular file without symlinks')
  }
}

function atomicWriteLedger(file: string, repoRoot: string, content: string) {
  assertRegularLedgerSource(file, repoRoot)
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

export async function recordSuccessfulCiFile(
  input: RecordSuccessfulCiFileInput,
) {
  assertRegularLedgerSource(input.sourceFile, input.repoRoot)
  const ledgerInput = JSON.parse(readFileSync(input.sourceFile, 'utf8')) as unknown
  const verifiedRun = await verifySuccessfulCiProof(
    input.proofInput,
    input.expectedCandidateSha,
    input.fetchImplementation,
  )
  const updated = recordSuccessfulCi(ledgerInput, input.batch, verifiedRun)
  atomicWriteLedger(
    input.sourceFile,
    input.repoRoot,
    `${JSON.stringify(updated, null, 2)}\n`,
  )
  return updated
}
