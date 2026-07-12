import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { checkLedger, recordSuccessfulCi } from './ledger-check.js'
import { migrationLedgerSchema } from './ledger-schema.js'
import { renderLedger } from './render-ledger.js'

const sourceRoot = resolve(import.meta.dirname, '../..')
const ledger = migrationLedgerSchema.parse(JSON.parse(readFileSync(
  new URL('../../docs/migration/ledger.json', import.meta.url),
  'utf8',
)) as unknown)
const declaredFiles = new Set(ledger.entries.flatMap((entry) => entry.newOwners))

function parentDirectories(files: ReadonlySet<string>) {
  const directories = new Set<string>()
  for (const file of files) {
    const segments = file.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join('/'))
    }
  }
  return directories
}

const declaredDirectories = parentDirectories(declaredFiles)
const candidateSha = 'a'.repeat(40)

function successfulCiProof(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    repository: 'AnsonHui6040/ramen-style-today-next',
    workflow: 'ci.yml',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    candidateSha,
    headSha: candidateSha,
    runId: 123,
    runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
    ...overrides,
  }
}

interface CliFixtureOptions {
  ledgerSymlink?: boolean
  outputSymlink?: boolean
  status?: 'in-progress' | 'in-review'
  unregisteredNewlineFile?: boolean
}

function createCliFixture(options: CliFixtureOptions = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-ledger-cli-'))
  const outsideRoot = mkdtempSync(join(tmpdir(), 'ramen-ledger-outside-'))
  const migrationRoot = join(repoRoot, 'tools/migration')
  const docsRoot = join(repoRoot, 'docs/migration')
  mkdirSync(migrationRoot, { recursive: true })
  mkdirSync(docsRoot, { recursive: true })
  const toolFiles = [
    'check-ledger.ts',
    'ledger-check.ts',
    'ledger-schema.ts',
    'render-ledger.ts',
  ]
  for (const file of toolFiles) {
    cpSync(join(sourceRoot, 'tools/migration', file), join(migrationRoot, file))
  }
  writeFileSync(join(repoRoot, '.gitignore'), 'node_modules\n')
  symlinkSync(join(sourceRoot, 'node_modules'), join(repoRoot, 'node_modules'), 'dir')

  const ownerFiles = [
    '.gitignore',
    'docs/migration/ledger.json',
    'docs/migration/ledger.md',
    ...toolFiles.map((file) => `tools/migration/${file}`),
  ]
  const input = {
    schemaVersion: 1,
    baseline: {
      repository: 'AnsonHui6040/ramen-style-today',
      commit: 'b'.repeat(40),
    },
    entries: [{
      batch: '1',
      status: options.status ?? 'in-progress',
      legacySources: [],
      ownedScopes: ['docs/migration', 'tools/migration'],
      newOwners: ownerFiles,
      transformation: 'CLI safety fixture.',
      behavior: 'no-runtime-change',
      verification: [],
    }],
  }
  const parsed = migrationLedgerSchema.parse(input)
  const ledgerContent = `${JSON.stringify(parsed, null, 2)}\n`
  const ledgerPath = join(docsRoot, 'ledger.json')
  const externalLedger = join(outsideRoot, 'ledger.json')
  if (options.ledgerSymlink) {
    writeFileSync(externalLedger, ledgerContent)
    symlinkSync(externalLedger, ledgerPath)
  } else {
    writeFileSync(ledgerPath, ledgerContent)
  }

  const outputPath = join(docsRoot, 'ledger.md')
  const externalOutput = join(outsideRoot, 'ledger.md')
  if (options.outputSymlink) {
    writeFileSync(externalOutput, 'outside remains unchanged\n')
    symlinkSync(externalOutput, outputPath)
  } else {
    writeFileSync(outputPath, renderLedger(parsed))
  }

  if (options.unregisteredNewlineFile) {
    writeFileSync(join(repoRoot, 'line\nbreak.txt'), 'unregistered\n')
  }

  const proofPath = join(outsideRoot, 'verified-ci-proof.json')
  writeFileSync(proofPath, `${JSON.stringify(successfulCiProof(), null, 2)}\n`)
  execFileSync('git', ['init', '--quiet'], { cwd: repoRoot })

  return {
    externalLedger,
    externalOutput,
    ledgerPath,
    outputPath,
    outsideRoot,
    proofPath,
    repoRoot,
    run: (...args: string[]) => spawnSync(
      process.execPath,
      [
        join(sourceRoot, 'node_modules/tsx/dist/cli.mjs'),
        join(migrationRoot, 'check-ledger.ts'),
        ...args,
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    ),
    cleanup: () => {
      rmSync(repoRoot, { recursive: true, force: true })
      rmSync(outsideRoot, { recursive: true, force: true })
    },
  }
}

describe('migration ledger repository checks', () => {
  test('accepts exact owners and current generated Markdown', () => {
    const result = checkLedger({
      input: ledger,
      repoFiles: declaredFiles,
      existingFiles: declaredFiles,
      repoDirectories: declaredDirectories,
      currentMarkdown: renderLedger(ledger),
    })
    expect(result).toMatchObject({ ok: true, errors: [] })
  })

  test('rejects a missing owner and an unregistered file inside an owned scope', () => {
    const existingFiles = new Set(declaredFiles)
    existingFiles.delete('docs/superpowers/plans/2026-07-11-batch-1-compiler-foundation.md')
    const repoFiles = new Set([
      ...declaredFiles,
      'UNREGISTERED.md',
      'docs/superpowers/plans/unregistered.md',
    ])
    const result = checkLedger({
      input: ledger,
      repoFiles,
      existingFiles,
      repoDirectories: parentDirectories(repoFiles),
      currentMarkdown: undefined,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('not an existing repository file'))).toBe(true)
    expect(result.errors).toContain('Repository file has no migration-ledger owner: UNREGISTERED.md')
    expect(result.errors.some((error) => error.includes('not registered in owned scope'))).toBe(true)
  })

  test('rejects a leaf file declared as an owned scope', () => {
    const fileScope = structuredClone(ledger)
    const owner = fileScope.entries[0]!.newOwners[0]!
    fileScope.entries[0]!.ownedScopes = [owner]

    const result = checkLedger({
      input: fileScope,
      repoFiles: declaredFiles,
      existingFiles: declaredFiles,
      repoDirectories: declaredDirectories,
      currentMarkdown: undefined,
    })

    expect(result.errors).toContain(`Batch 0 owned scope is not a repository directory: ${owner}`)
  })

  test('rejects stale generated Markdown', () => {
    const result = checkLedger({
      input: ledger,
      repoFiles: declaredFiles,
      existingFiles: declaredFiles,
      repoDirectories: declaredDirectories,
      currentMarkdown: 'stale\n',
    })
    expect(result.errors).toContain('generated ledger Markdown is stale')
  })

  test('promotes only a structured successful CI proof bound to one commit and run', () => {
    const reviewLedger = structuredClone(ledger)
    reviewLedger.entries[0]!.status = 'in-review'
    const updated = recordSuccessfulCi(reviewLedger, '0', successfulCiProof())
    const entry = updated.entries[0]!

    expect(entry.status).toBe('complete')
    expect(entry.verification.at(-1)).toMatchObject({
      gate: 'batch0-remote-ci',
      commitSha: candidateSha,
      runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
    })
  })

  test('rejects a failed CI proof', () => {
    const reviewLedger = structuredClone(ledger)
    reviewLedger.entries[0]!.status = 'in-review'

    expect(() => recordSuccessfulCi(
      reviewLedger,
      '0',
      successfulCiProof({ conclusion: 'failure' }),
    )).toThrow(/completed successful push run/)
  })

  test('rejects a CI proof whose head SHA differs from the candidate', () => {
    const reviewLedger = structuredClone(ledger)
    reviewLedger.entries[0]!.status = 'in-review'

    expect(() => recordSuccessfulCi(
      reviewLedger,
      '0',
      successfulCiProof({ headSha: 'b'.repeat(40) }),
    )).toThrow(/candidate SHA must match CI head SHA/)
  })

  test('rejects a CI proof whose URL does not identify its run ID', () => {
    const reviewLedger = structuredClone(ledger)
    reviewLedger.entries[0]!.status = 'in-review'

    expect(() => recordSuccessfulCi(
      reviewLedger,
      '0',
      successfulCiProof({ runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/999' }),
    )).toThrow(/run URL must match CI run ID/)
  })
})

describe('migration ledger CLI safety', () => {
  test('rejects direct SHA and URL promotion arguments', () => {
    const fixture = createCliFixture({ status: 'in-review' })
    try {
      const before = readFileSync(fixture.ledgerPath, 'utf8')
      const result = fixture.run(
        '--record-ci',
        '1',
        candidateSha,
        'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      )

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(
        'Use --record-ci <batch> <verified-ci-proof-json-file>',
      )
      expect(readFileSync(fixture.ledgerPath, 'utf8')).toBe(before)
    } finally {
      fixture.cleanup()
    }
  })

  test('rejects a nonexistent verified CI proof file', () => {
    const fixture = createCliFixture({ status: 'in-review' })
    try {
      const result = fixture.run(
        '--record-ci',
        '1',
        join(fixture.outsideRoot, 'missing-proof.json'),
      )

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Unable to read verified CI proof file')
    } finally {
      fixture.cleanup()
    }
  })

  test('rejects a ledger Markdown symlink before mutating any target', () => {
    const fixture = createCliFixture({ outputSymlink: true })
    try {
      const ledgerBefore = readFileSync(fixture.ledgerPath, 'utf8')
      const externalBefore = readFileSync(fixture.externalOutput, 'utf8')
      const result = fixture.run('--write')

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('ledger Markdown output must be a regular file')
      expect(readFileSync(fixture.externalOutput, 'utf8')).toBe(externalBefore)
      expect(readFileSync(fixture.ledgerPath, 'utf8')).toBe(ledgerBefore)
      expect(lstatSync(fixture.outputPath).isSymbolicLink()).toBe(true)
    } finally {
      fixture.cleanup()
    }
  })

  test('rejects a canonical ledger symlink before recording CI', () => {
    const fixture = createCliFixture({ ledgerSymlink: true, status: 'in-review' })
    try {
      const externalBefore = readFileSync(fixture.externalLedger, 'utf8')
      const result = fixture.run('--record-ci', '1', fixture.proofPath)

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('ledger source must be a regular file')
      expect(readFileSync(fixture.externalLedger, 'utf8')).toBe(externalBefore)
      expect(lstatSync(fixture.ledgerPath).isSymbolicLink()).toBe(true)
    } finally {
      fixture.cleanup()
    }
  })

  test('atomically replaces canonical JSON from a verified CI proof', () => {
    const fixture = createCliFixture({ status: 'in-review' })
    try {
      const inodeBefore = lstatSync(fixture.ledgerPath).ino
      const result = fixture.run('--record-ci', '1', fixture.proofPath)

      expect(result.status).toBe(0)
      expect(lstatSync(fixture.ledgerPath).ino).not.toBe(inodeBefore)
      const updated = migrationLedgerSchema.parse(JSON.parse(
        readFileSync(fixture.ledgerPath, 'utf8'),
      ) as unknown)
      expect(updated.entries[0]).toMatchObject({ status: 'complete' })
      expect(updated.entries[0]!.verification.at(-1)).toMatchObject({
        commitSha: candidateSha,
        runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      })
      expect(readdirSync(dirname(fixture.ledgerPath)).some(
        (file) => file.includes('.ledger.json.tmp-'),
      )).toBe(false)
    } finally {
      fixture.cleanup()
    }
  })

  test('accounts for a newline-containing Git path as one repository file', () => {
    const fixture = createCliFixture({ unregisteredNewlineFile: true })
    try {
      const result = fixture.run('--check')
      const ownerErrors = result.stderr.match(
        /Repository file has no migration-ledger owner:/g,
      ) ?? []

      expect(result.status).not.toBe(0)
      expect(ownerErrors).toHaveLength(1)
      expect(result.stderr).toContain(
        'Repository file has no migration-ledger owner: line\nbreak.txt',
      )
    } finally {
      fixture.cleanup()
    }
  })
})
