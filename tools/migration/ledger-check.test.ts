import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  authenticateLedgerRemoteCiEvidence,
  checkLedger,
  recordSuccessfulCi,
  verifySuccessfulCiProof,
} from './ledger-check.js'
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
    sha: candidateSha,
    runId: 123,
    runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
    ...overrides,
  }
}

const githubApiRunUrl = 'https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/runs/123'
const githubApiWorkflowUrl = 'https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/workflows/ci.yml'
const workflowId = 456

function successfulGithubRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    workflow_id: workflowId,
    html_url: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
    head_sha: candidateSha,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/ci.yml',
    repository: {
      full_name: 'AnsonHui6040/ramen-style-today-next',
    },
    ...overrides,
  }
}

function canonicalGithubWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: workflowId,
    path: '.github/workflows/ci.yml',
    ...overrides,
  }
}

interface ApiResponseOptions {
  payload?: unknown
  redirected?: boolean
  status?: number
  url?: string
}

function apiResponse(options: ApiResponseOptions = {}) {
  const status = options.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: options.redirected ?? false,
    url: options.url ?? githubApiRunUrl,
    json: async () => options.payload ?? successfulGithubRun(),
  } as Response
}

function workflowApiResponse(options: ApiResponseOptions = {}) {
  const status = options.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: options.redirected ?? false,
    url: options.url ?? githubApiWorkflowUrl,
    json: async () => options.payload ?? canonicalGithubWorkflow(),
  } as Response
}

interface GithubFetchOptions {
  assertion?: (url: string, init: RequestInit) => void
  run?: Response
  workflow?: Response
}

function githubFetch(options: GithubFetchOptions = {}) {
  return (async (input: string | URL | globalThis.Request, init?: RequestInit) => {
    const url = String(input)
    options.assertion?.(url, init ?? {})
    if (url === githubApiRunUrl) return options.run ?? apiResponse()
    if (url === githubApiWorkflowUrl) return options.workflow ?? workflowApiResponse()
    throw new Error(`Unexpected GitHub API URL ${url}`)
  }) as typeof fetch
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
    'record-ci.ts',
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

  test('promotes only after the fixed GitHub run resource authenticates the proof', async () => {
    const reviewLedger = structuredClone(ledger)
    reviewLedger.entries[1]!.status = 'in-review'
    reviewLedger.entries[1]!.verification = reviewLedger.entries[1]!.verification.filter(
      (item) => item.gate !== 'batch1-remote-ci',
    )
    const requestedUrls: string[] = []
    const verified = await verifySuccessfulCiProof(
      successfulCiProof(),
      candidateSha,
      githubFetch({
        assertion: (url, init) => {
          requestedUrls.push(url)
          expect([githubApiRunUrl, githubApiWorkflowUrl]).toContain(url)
          expect(init).toMatchObject({ redirect: 'error' })
        },
      }),
    )
    expect(requestedUrls).toEqual([githubApiRunUrl, githubApiWorkflowUrl])
    const updated = recordSuccessfulCi(reviewLedger, '1', verified)
    const entry = updated.entries[1]!

    expect(entry.status).toBe('complete')
    expect(entry.verification.at(-1)).toMatchObject({
      gate: 'batch1-remote-ci',
      commitSha: candidateSha,
      runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
    })
  })

  test.each([
    [
      'Task 7 branch',
      'codex/batch-1-compiler-foundation',
      '.github/workflows/ci.yml@codex/batch-1-compiler-foundation',
    ],
    [
      'refs heads',
      'codex/batch-1-compiler-foundation',
      '.github/workflows/ci.yml@refs/heads/codex/batch-1-compiler-foundation',
    ],
    ['refs tags', 'v1.0.0', '.github/workflows/ci.yml@refs/tags/v1.0.0'],
    ['full SHA', 'main', `.github/workflows/ci.yml@${candidateSha}`],
  ])('accepts the canonical workflow path with an exact %s suffix', async (
    _label,
    headBranch,
    path,
  ) => {
    const verified = await verifySuccessfulCiProof(
      successfulCiProof(),
      candidateSha,
      githubFetch({
        run: apiResponse({
          payload: successfulGithubRun({
            head_branch: headBranch,
            path,
          }),
        }),
      }),
    )

    expect(verified).toMatchObject({ sha: candidateSha, runId: 123 })
  })

  test.each([
    [
      'coupled extra-at filename collision',
      'evil.yml@main',
      '.github/workflows/ci.yml@evil.yml@main',
    ],
    [
      'control-character branch',
      'evil\nmain',
      '.github/workflows/ci.yml@evil\nmain',
    ],
  ])('rejects an ambiguous workflow path with %s', async (_label, headBranch, path) => {
    await expect(verifySuccessfulCiProof(
      successfulCiProof(),
      candidateSha,
      githubFetch({
        run: apiResponse({
          payload: successfulGithubRun({
            head_branch: headBranch,
            path,
          }),
        }),
      }),
    )).rejects.toThrow(/workflow path is ambiguous/)
  })

  test('rejects an internally consistent fabricated proof when GitHub returns 404', async () => {
    await expect(verifySuccessfulCiProof(
      successfulCiProof(),
      candidateSha,
      githubFetch({ run: apiResponse({ status: 404 }) }),
    )).rejects.toThrow(/GitHub Actions run 123 was not found/)
  })

  test('rejects a GitHub API failure', async () => {
    await expect(verifySuccessfulCiProof(
      successfulCiProof(),
      candidateSha,
      githubFetch({ run: apiResponse({ status: 503 }) }),
    )).rejects.toThrow(/GitHub API 503/)
  })

  test('rejects a malformed GitHub API response', async () => {
    await expect(verifySuccessfulCiProof(
      successfulCiProof(),
      candidateSha,
      githubFetch({ run: apiResponse({ payload: {} }) }),
    )).rejects.toThrow(/malformed GitHub Actions run response/)
  })

  test('rejects a redirected GitHub API response', async () => {
    await expect(verifySuccessfulCiProof(
      successfulCiProof(),
      candidateSha,
      githubFetch({ run: apiResponse({ redirected: true }) }),
    )).rejects.toThrow(/redirected GitHub API response/)
  })

  test('rejects a cross-origin GitHub API response', async () => {
    await expect(verifySuccessfulCiProof(
      successfulCiProof(),
      candidateSha,
      githubFetch({ run: apiResponse({ url: 'https://example.com/runs/123' }) }),
    )).rejects.toThrow(/unexpected GitHub API response URL/)
  })

  test('rejects a proof for a different current candidate', async () => {
    const fetcher = githubFetch()

    await expect(verifySuccessfulCiProof(
      successfulCiProof(),
      'b'.repeat(40),
      fetcher,
    )).rejects.toThrow(/proof SHA must match current candidate SHA/)
  })

  test('rejects a canonical workflow resource with a different path', async () => {
    await expect(verifySuccessfulCiProof(
      successfulCiProof(),
      candidateSha,
      githubFetch({
        workflow: workflowApiResponse({
          payload: canonicalGithubWorkflow({ path: '.github/workflows/other.yml' }),
        }),
      }),
    )).rejects.toThrow(/canonical workflow path mismatch/)
  })

  test.each([
    ['repository', { repository: { full_name: 'OtherOwner/other-repository' } }, /repository mismatch/],
    ['run ID', { id: 999 }, /run ID mismatch/],
    ['head SHA', { head_sha: 'b'.repeat(40) }, /head SHA mismatch/],
    ['run URL', { html_url: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/999' }, /run URL mismatch/],
    ['event', { event: 'pull_request' }, /event must be push/],
    ['status', { status: 'in_progress' }, /status must be completed/],
    ['conclusion', { conclusion: 'failure' }, /conclusion must be success/],
    ['workflow ID', { workflow_id: 999 }, /workflow ID mismatch/],
    ['workflow', { path: '.github/workflows/other.yml' }, /workflow must be ci.yml/],
    ['ambiguous workflow filename', { path: '.github/workflows/ci.yml@evil.yml@main' }, /workflow path is ambiguous/],
  ])('rejects a GitHub run %s mismatch', async (_label, overrides, expected) => {
    await expect(verifySuccessfulCiProof(
      successfulCiProof(),
      candidateSha,
      githubFetch({ run: apiResponse({ payload: successfulGithubRun(overrides) }) }),
    )).rejects.toThrow(expected)
  })

  test('rejects a forged unverified object at the mutation boundary', () => {
    const reviewLedger = structuredClone(ledger)
    reviewLedger.entries[0]!.status = 'in-review'

    const forged = successfulCiProof() as unknown as Parameters<typeof recordSuccessfulCi>[2]
    expect(() => recordSuccessfulCi(reviewLedger, '0', forged)).toThrow(
      /authenticated GitHub Actions run/,
    )
  })

  test('re-authenticates recorded remote CI evidence instead of trusting ledger fields', async () => {
    const forgedLedger = structuredClone(ledger)
    const remote = forgedLedger.entries[1]!.verification.find(
      (item) => item.gate === 'batch1-remote-ci',
    )!
    remote.commitSha = candidateSha
    remote.runUrl = successfulCiProof().runUrl as string

    await expect(authenticateLedgerRemoteCiEvidence(
      forgedLedger,
      'b'.repeat(40),
      githubFetch({ run: apiResponse({ status: 404 }) }),
      async () => true,
    )).rejects.toThrow(/GitHub Actions run 123 was not found/)
  })

  test('rejects mismatched recorded remote CI evidence', async () => {
    const mismatchedLedger = structuredClone(ledger)
    const remote = mismatchedLedger.entries[1]!.verification.find(
      (item) => item.gate === 'batch1-remote-ci',
    )!
    remote.commitSha = candidateSha
    remote.runUrl = successfulCiProof().runUrl as string

    await expect(authenticateLedgerRemoteCiEvidence(
      mismatchedLedger,
      'b'.repeat(40),
      githubFetch({
        run: apiResponse({
          payload: successfulGithubRun({ head_sha: 'c'.repeat(40) }),
        }),
      }),
      async () => true,
    )).rejects.toThrow(/head SHA mismatch/)
  })

  test('accepts authenticated historical evidence that is an ancestor of current HEAD', async () => {
    const historicalLedger = structuredClone(ledger)
    const remote = historicalLedger.entries[1]!.verification.find(
      (item) => item.gate === 'batch1-remote-ci',
    )!
    remote.commitSha = candidateSha
    remote.runUrl = successfulCiProof().runUrl as string
    const ancestryChecks: [string, string][] = []

    await expect(authenticateLedgerRemoteCiEvidence(
      historicalLedger,
      'b'.repeat(40),
      githubFetch(),
      async (evidenceSha, currentHeadSha) => {
        ancestryChecks.push([evidenceSha, currentHeadSha])
        return true
      },
    )).resolves.toBeUndefined()
    expect(ancestryChecks).toEqual([[candidateSha, 'b'.repeat(40)]])
  })

  test('rejects authenticated evidence outside current repository history', async () => {
    const unrelatedLedger = structuredClone(ledger)
    const remote = unrelatedLedger.entries[1]!.verification.find(
      (item) => item.gate === 'batch1-remote-ci',
    )!
    remote.commitSha = candidateSha
    remote.runUrl = successfulCiProof().runUrl as string

    await expect(authenticateLedgerRemoteCiEvidence(
      unrelatedLedger,
      'b'.repeat(40),
      githubFetch(),
      async () => false,
    )).rejects.toThrow(/not an ancestor of current HEAD/)
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
