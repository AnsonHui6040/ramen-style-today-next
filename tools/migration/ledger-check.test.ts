import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
import { dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  checkLedger,
  checkLedgerOffline,
  collectGitChangedPaths,
  verifySemanticAncestry,
} from './ledger-check.js'
import { verifySuccessfulCiProof as verifySuccessfulCiProofOnline } from '../acceptance/verify-acceptance.js'
import { recordSuccessfulCi } from './record-ci.js'
import {
  batch2AIncidentPath,
  batch2AMaintenancePaths,
  batch2ASemanticPaths,
  batch2BAcceptanceMetadataPaths,
  batch2BImplementationPaths,
  batch2BVerificationPaths,
  migrationLedgerSchema,
  protectedQuestionBaseline,
} from './ledger-schema.js'
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
const historicalBatch2AImplementationSha =
  'ecf9f5b4791862471d0898da7283ba4a40d3fbf9'
const approvedSharedMaintenanceFiles = [
  'tools/parity/shared/contracts.ts',
  'tools/parity/shared/authoring.ts',
  'tools/parity/shared/authoring.test.ts',
] as const
const persistenceFixtureManifestHash = 'f'.repeat(64)

function batch2BEntry(overrides: Record<string, unknown> = {}) {
  return {
    batch: '2B',
    status: 'in-progress',
    implementationPaths: [...batch2BImplementationPaths],
    verificationPaths: [...batch2BVerificationPaths],
    acceptanceMetadataPaths: [...batch2BAcceptanceMetadataPaths],
    fixtureManifestHash: persistenceFixtureManifestHash,
    legacySources: ['src/App.tsx'],
    ownedScopes: [],
    newOwners: ['packages/classification-core/src/persistence/contracts.ts'],
    transformation: 'Batch 2B persistence contract fixture.',
    behavior: 'no-production-runtime-change',
    verification: [],
    ...overrides,
  }
}

function batch2BLedger(entry: Record<string, unknown> = batch2BEntry()) {
  return {
    schemaVersion: 1,
    baseline: {
      repository: 'AnsonHui6040/ramen-style-today',
      commit: 'b'.repeat(40),
    },
    entries: [entry],
  }
}

function completeBatch2B(overrides: Record<string, unknown> = {}) {
  return batch2BEntry({
    status: 'complete',
    implementationSha: candidateSha,
    verification: [
      {
        gate: 'batch2b-local-verify',
        command: 'npm run verify',
        outcome: 'passed',
        evidence: 'all Batch 2B offline verification gates passed',
      },
      {
        gate: 'batch2b-remote-ci',
        command: 'GitHub Actions CI / verify',
        outcome: 'passed',
        evidence: 'the exact implementation candidate passed CI',
        commitSha: candidateSha,
        runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      },
    ],
    ...overrides,
  })
}

function verifySuccessfulCiProof(
  proofInput: unknown,
  expectedCandidateSha: string,
  fetchImplementation: typeof fetch,
) {
  return verifySuccessfulCiProofOnline(
    proofInput,
    expectedCandidateSha,
    fetchImplementation,
    'github-token',
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function completeBatch2A(overrides: Record<string, unknown> = {}) {
  return {
    batch: '2A',
    status: 'complete',
    implementationSha: candidateSha,
    semanticPaths: batch2ASemanticPaths,
    incidents: [batch2AIncidentPath],
    legacySources: [],
    ownedScopes: [],
    newOwners: [batch2AIncidentPath],
    transformation: 'Batch 2A completion fixture.',
    behavior: 'no-production-runtime-change',
    verification: [
      {
        gate: 'batch2a-local-verify',
        command: 'npm run verify',
        outcome: 'passed',
        evidence: 'local verification passed',
      },
      {
        gate: 'batch2a-remote-ci',
        command: 'GitHub Actions CI / verify',
        outcome: 'passed',
        evidence: 'authenticated remote verification passed',
        commitSha: candidateSha,
        runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      },
    ],
    ...overrides,
  }
}

function batch2ALedger(entry: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    baseline: {
      repository: 'AnsonHui6040/ramen-style-today',
      commit: 'b'.repeat(40),
    },
    entries: [entry],
  }
}

function inProgressMaintenanceLedger(
  maintenanceOverrides: Record<string, unknown> = {},
) {
  return batch2ALedger(completeBatch2A({
    implementationSha: historicalBatch2AImplementationSha,
    verification: [
      completeBatch2A().verification[0],
      {
        ...completeBatch2A().verification[1],
        commitSha: historicalBatch2AImplementationSha,
      },
    ],
    maintenance: {
      status: 'in-progress',
      paths: [...batch2AMaintenancePaths],
      baseline: protectedQuestionBaseline,
      verification: [],
      ...maintenanceOverrides,
    },
  }))
}

function maintenanceRepositoryState(
  overrides: {
    changedPaths?: readonly string[]
    questionBaseline?: {
      [Key in keyof typeof protectedQuestionBaseline]: string
    }
  } = {},
) {
  return {
    repoFiles: new Set([batch2AIncidentPath]),
    existingFiles: new Set([batch2AIncidentPath]),
    repoDirectories: new Set(['docs', 'docs/migration', 'docs/migration/incidents']),
    currentMarkdown: undefined,
    currentHeadSha: 'b'.repeat(40),
    isCommitAncestor: async () => true,
    changedPathsBetween: async () => overrides.changedPaths ?? [],
    questionSemanticHash: protectedQuestionBaseline.semanticHash,
    classificationSemanticHash: protectedQuestionBaseline.semanticHash,
    fixtureManifestHash: 'e'.repeat(64),
    classificationFixtureManifestHash: 'e'.repeat(64),
    questionBaseline: overrides.questionBaseline ?? protectedQuestionBaseline,
  }
}

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
  const acceptanceRoot = join(repoRoot, 'tools/acceptance')
  const docsRoot = join(repoRoot, 'docs/migration')
  mkdirSync(migrationRoot, { recursive: true })
  mkdirSync(acceptanceRoot, { recursive: true })
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
  cpSync(
    join(sourceRoot, 'tools/acceptance/verify-acceptance.ts'),
    join(acceptanceRoot, 'verify-acceptance.ts'),
  )
  writeFileSync(join(repoRoot, '.gitignore'), 'node_modules\n')
  symlinkSync(join(sourceRoot, 'node_modules'), join(repoRoot, 'node_modules'), 'dir')

  const ownerFiles = [
    '.gitignore',
    'docs/migration/ledger.json',
    'docs/migration/ledger.md',
    'tools/acceptance/verify-acceptance.ts',
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

const semanticFlowPath = 'packages/classification-core/src/flow/evaluate.ts'

function writeFixtureFile(repoRoot: string, file: string, content: string) {
  const absolute = join(repoRoot, file)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, content)
}

function configureTemporaryGitRepository(repoRoot: string) {
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: repoRoot })
  execFileSync('git', ['config', 'user.name', 'Migration ledger tests'], { cwd: repoRoot })
}

function createSemanticIndexCliFixture() {
  const fixture = createCliFixture()
  const semanticHash = 'd'.repeat(64)
  const fixtureManifestPath = 'tools/parity/fixtures/questions/legacy-v1/manifest.json'
  const fixtureManifestBytes = '{"fixture":"semantic-index-regression"}\n'
  const fixtureManifestHash = createHash('sha256')
    .update(fixtureManifestBytes)
    .digest('hex')
  const generatedModelPath = 'packages/classification-core/src/generated/question-model.ts'
  const classificationManifestPath = 'docs/classification/manifest.json'
  const additionalOwners = [
    batch2AIncidentPath,
    classificationManifestPath,
    generatedModelPath,
    semanticFlowPath,
    fixtureManifestPath,
  ]

  writeFixtureFile(fixture.repoRoot, batch2AIncidentPath, '# Incident fixture\n')
  writeFixtureFile(
    fixture.repoRoot,
    classificationManifestPath,
    `${JSON.stringify({
      provenance: {
        questions: {
          fixtureManifestHash,
          semanticHash,
        },
      },
    }, null, 2)}\n`,
  )
  writeFixtureFile(
    fixture.repoRoot,
    generatedModelPath,
    `const model = {\n  "semanticHash": "${semanticHash}"\n}\n`,
  )
  writeFixtureFile(fixture.repoRoot, semanticFlowPath, 'export const value = 1\n')
  writeFixtureFile(fixture.repoRoot, fixtureManifestPath, fixtureManifestBytes)

  const original = migrationLedgerSchema.parse(JSON.parse(readFileSync(
    fixture.ledgerPath,
    'utf8',
  )) as unknown)
  const inReview = migrationLedgerSchema.parse({
    ...original,
    entries: [{
      ...original.entries[0]!,
      batch: '2A',
      status: 'in-review',
      semanticPaths: batch2ASemanticPaths,
      incidents: [],
      ownedScopes: [],
      newOwners: [...original.entries[0]!.newOwners, ...additionalOwners],
      verification: [],
    }],
  })
  writeFileSync(fixture.ledgerPath, `${JSON.stringify(inReview, null, 2)}\n`)
  writeFileSync(fixture.outputPath, renderLedger(inReview))

  configureTemporaryGitRepository(fixture.repoRoot)
  execFileSync('git', ['add', '--all'], { cwd: fixture.repoRoot })
  execFileSync('git', ['commit', '--quiet', '-m', 'implementation'], {
    cwd: fixture.repoRoot,
  })
  const implementationSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fixture.repoRoot,
    encoding: 'utf8',
  }).trim()
  const complete = migrationLedgerSchema.parse({
    ...inReview,
    entries: [{
      ...inReview.entries[0]!,
      status: 'complete',
      implementationSha,
      incidents: [batch2AIncidentPath],
      verification: [
        {
          gate: 'batch2a-local-verify',
          command: 'npm run verify',
          outcome: 'passed',
          evidence: 'offline fixture passed',
        },
        {
          gate: 'batch2a-remote-ci',
          command: 'GitHub Actions CI / verify',
          outcome: 'passed',
          evidence: 'remote fixture passed',
          commitSha: implementationSha,
          runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
        },
      ],
    }],
  })
  writeFileSync(fixture.ledgerPath, `${JSON.stringify(complete, null, 2)}\n`)
  writeFileSync(fixture.outputPath, renderLedger(complete))

  return { ...fixture, implementationSha }
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

  test('treats approved new maintenance files as canonical owners', () => {
    const repoFiles = new Set([
      ...declaredFiles,
      ...approvedSharedMaintenanceFiles,
    ])
    const result = checkLedger({
      input: ledger,
      repoFiles,
      existingFiles: repoFiles,
      repoDirectories: parentDirectories(repoFiles),
      currentMarkdown: renderLedger(ledger),
    })

    expect(result).toMatchObject({ ok: true, errors: [] })
  })

  test('requires an approved maintenance owner to be an existing regular file', () => {
    const maintenanceOwner = approvedSharedMaintenanceFiles[0]
    const repoFiles = new Set([...declaredFiles, maintenanceOwner])
    const result = checkLedger({
      input: ledger,
      repoFiles,
      existingFiles: declaredFiles,
      repoDirectories: parentDirectories(repoFiles),
      currentMarkdown: renderLedger(ledger),
    })

    expect(result.errors).toContain(
      `Batch 2A maintenance owner is not an existing repository file: ${maintenanceOwner}`,
    )
  })

  test('does not grant ownership outside the exact maintenance allowlist', () => {
    const outsideAllowlist = 'tools/parity/shared-escape/authoring.ts'
    const repoFiles = new Set([...declaredFiles, outsideAllowlist])
    const result = checkLedger({
      input: ledger,
      repoFiles,
      existingFiles: repoFiles,
      repoDirectories: parentDirectories(repoFiles),
      currentMarkdown: renderLedger(ledger),
    })

    expect(result.errors).toContain(
      `Repository file has no migration-ledger owner: ${outsideAllowlist}`,
    )
    expect(result.errors).toContain(
      `Repository file is not registered in owned scope tools: ${outsideAllowlist}`,
    )
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

})

describe('Batch 2B ownership and acceptance invariants', () => {
  test('accepts only the exact in-progress path groups without implementation evidence', () => {
    expect(migrationLedgerSchema.safeParse(batch2BLedger()).success).toBe(true)

    for (const overrides of [
      { implementationPaths: batch2BImplementationPaths.slice(1) },
      { verificationPaths: batch2BVerificationPaths.slice(1) },
      { acceptanceMetadataPaths: batch2BAcceptanceMetadataPaths.slice(1) },
      { implementationSha: candidateSha },
      {
        verification: [{
          gate: 'batch2b-local-verify',
          command: 'npm run verify',
          outcome: 'passed',
          evidence: 'premature local evidence',
        }],
      },
    ]) {
      expect(migrationLedgerSchema.safeParse(batch2BLedger(
        batch2BEntry(overrides),
      )).success).toBe(false)
    }
  })

  test('requires completed Batch 2B evidence to bind exact implementation and fixture identities', () => {
    expect(migrationLedgerSchema.safeParse(batch2BLedger(completeBatch2B())).success)
      .toBe(true)

    const missingRemote = completeBatch2B({
      verification: completeBatch2B().verification.slice(0, 1),
    })
    expect(migrationLedgerSchema.safeParse(batch2BLedger(missingRemote)).success)
      .toBe(false)

    const mismatchedRemote = structuredClone(completeBatch2B())
    const verification = mismatchedRemote.verification as Array<{ commitSha?: string }>
    verification[1]!.commitSha = 'e'.repeat(40)
    expect(migrationLedgerSchema.safeParse(batch2BLedger(mismatchedRemote)).success)
      .toBe(false)
  })

  test('allows only acceptance metadata after the Batch 2B implementation SHA', async () => {
    const owner = 'packages/classification-core/src/persistence/contracts.ts'
    const input = batch2BLedger(completeBatch2B())
    const baseState = {
      repoFiles: new Set([owner]),
      existingFiles: new Set([owner]),
      repoDirectories: parentDirectories(new Set([owner])),
      currentMarkdown: undefined,
      currentHeadSha: 'b'.repeat(40),
      isCommitAncestor: async () => true,
      questionSemanticHash: '',
      classificationSemanticHash: '',
      fixtureManifestHash: '',
      classificationFixtureManifestHash: '',
      persistenceFixtureManifestHash,
      classificationPersistenceFixtureManifestHash: persistenceFixtureManifestHash,
    }

    const accepted = await checkLedgerOffline(input, {
      ...baseState,
      changedPathsBetween: async () => [...batch2BAcceptanceMetadataPaths],
    })
    expect(accepted.errors).toEqual([])

    for (const [changedPath, expected] of [
      [batch2BImplementationPaths[0]!.replace('/**', '/restore.ts'),
        'Batch 2B implementation path changed after implementation SHA'],
      ['tools/migration/ledger-check.ts',
        'Batch 2B verification path changed after implementation SHA'],
      ['README.md', 'Batch 2B metadata completion changed a non-metadata path'],
    ] as const) {
      const result = await checkLedgerOffline(input, {
        ...baseState,
        changedPathsBetween: async () => [changedPath],
      })
      expect(result.errors.some((error) => error.includes(expected))).toBe(true)
    }
  })

  test('rejects persistence fixture identity drift in the ledger or classification manifest', async () => {
    const owner = 'packages/classification-core/src/persistence/contracts.ts'
    const input = batch2BLedger()
    const baseState = {
      repoFiles: new Set([owner]),
      existingFiles: new Set([owner]),
      repoDirectories: parentDirectories(new Set([owner])),
      currentMarkdown: undefined,
      currentHeadSha: 'b'.repeat(40),
      isCommitAncestor: async () => true,
      changedPathsBetween: async () => [],
      questionSemanticHash: '',
      classificationSemanticHash: '',
      fixtureManifestHash: '',
      classificationFixtureManifestHash: '',
      persistenceFixtureManifestHash,
      classificationPersistenceFixtureManifestHash: '0'.repeat(64),
    }
    const result = await checkLedgerOffline(input, baseState)

    expect(result.errors).toContain(
      'classification manifest persistence fixture manifest hash is inconsistent',
    )

    const ledgerDrift = await checkLedgerOffline(
      batch2BLedger(batch2BEntry({ fixtureManifestHash: '1'.repeat(64) })),
      {
        ...baseState,
        classificationPersistenceFixtureManifestHash: persistenceFixtureManifestHash,
      },
    )
    expect(ledgerDrift.errors).toContain(
      'Batch 2B fixture manifest hash is inconsistent with tracked bytes',
    )
  })
})

describe('Batch 2A offline acceptance invariants', () => {
  test('allows only approved in-progress maintenance paths', async () => {
    const input = inProgressMaintenanceLedger()
    const result = await checkLedgerOffline(input, maintenanceRepositoryState({
      changedPaths: [
        'tools/parity/shared/authoring.ts',
        'tools/parity/questions/extractor.ts',
      ],
    }))

    expect(result.errors).toEqual([])
    expect(input.entries[0]!.implementationSha).toBe(
      historicalBatch2AImplementationSha,
    )
  })

  test('rejects corpus and artifact changes during maintenance', async () => {
    const result = await checkLedgerOffline(
      inProgressMaintenanceLedger(),
      maintenanceRepositoryState({
        changedPaths: ['tools/parity/fixtures/questions/legacy-v1/cases.json'],
      }),
    )

    expect(result.errors[0]).toBe(
      'Batch 2A maintenance changed a protected question path',
    )
  })

  test('requires exact maintenance paths, baseline, and state evidence', () => {
    const invalidPaths = inProgressMaintenanceLedger({
      paths: batch2AMaintenancePaths.slice(1),
    })
    expect(migrationLedgerSchema.safeParse(invalidPaths).success).toBe(false)

    const invalidBaseline = inProgressMaintenanceLedger({
      baseline: {
        ...protectedQuestionBaseline,
        semanticHash: '0'.repeat(64),
      },
    })
    expect(migrationLedgerSchema.safeParse(invalidBaseline).success).toBe(false)

    const prematureEvidence = inProgressMaintenanceLedger({
      maintenanceSha: candidateSha,
      verification: [{
        gate: 'batch2a-maintenance-local-verify',
        command: 'npm run verify',
        outcome: 'passed',
        evidence: 'local verification passed',
      }],
    })
    expect(migrationLedgerSchema.safeParse(prematureEvidence).success).toBe(false)
  })

  test('requires exact completed maintenance evidence bound to its SHA', () => {
    const completeMaintenance = inProgressMaintenanceLedger({
      status: 'complete',
      maintenanceSha: candidateSha,
      verification: [
        {
          gate: 'batch2a-maintenance-local-verify',
          command: 'npm run verify',
          outcome: 'passed',
          evidence: 'local verification passed',
        },
        {
          gate: 'batch2a-maintenance-remote-ci',
          command: 'GitHub Actions CI / verify',
          outcome: 'passed',
          evidence: 'authenticated remote verification passed',
          commitSha: candidateSha,
          runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
        },
      ],
    })
    expect(migrationLedgerSchema.safeParse(completeMaintenance).success).toBe(true)

    const mismatchedRemote = structuredClone(completeMaintenance)
    const maintenance = mismatchedRemote.entries[0]!.maintenance as {
      verification: Array<{ commitSha?: string }>
    }
    maintenance.verification[1]!.commitSha = 'f'.repeat(40)
    expect(migrationLedgerSchema.safeParse(mismatchedRemote).success).toBe(false)
  })

  test('validates completed maintenance remote CI ancestry', async () => {
    const input = inProgressMaintenanceLedger({
      status: 'complete',
      maintenanceSha: candidateSha,
      verification: [
        {
          gate: 'batch2a-maintenance-local-verify',
          command: 'npm run verify',
          outcome: 'passed',
          evidence: 'local verification passed',
        },
        {
          gate: 'batch2a-maintenance-remote-ci',
          command: 'GitHub Actions CI / verify',
          outcome: 'passed',
          evidence: 'authenticated remote verification passed',
          commitSha: candidateSha,
          runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
        },
      ],
    })
    const result = await checkLedgerOffline(input, {
      ...maintenanceRepositoryState(),
      isCommitAncestor: async (sha) => sha !== candidateSha,
    })

    expect(result.errors).toContain(
      `Recorded remote CI commit ${candidateSha} is not an ancestor of current HEAD ${'b'.repeat(40)}`,
    )
  })

  test('rejects drift from the protected maintenance baseline', async () => {
    const result = await checkLedgerOffline(
      inProgressMaintenanceLedger(),
      maintenanceRepositoryState({
        questionBaseline: {
          ...protectedQuestionBaseline,
          generatedArtifactHash: '0'.repeat(64),
        },
      }),
    )

    expect(result.errors).toContain(
      'Batch 2A maintenance protected baseline mismatch: generatedArtifactHash',
    )
  })

  test('offline ledger check never calls fetch', async () => {
    const owner = 'docs/migration/ledger.json'
    const input = batch2ALedger({
      ...completeBatch2A({
        status: 'in-review',
        implementationSha: undefined,
        incidents: [],
        newOwners: [owner],
        verification: [],
      }),
    })
    const fetchImplementation = vi.fn(() => Promise.reject(new Error('network forbidden')))
    vi.stubGlobal('fetch', fetchImplementation)

    const result = await checkLedgerOffline(input, {
      repoFiles: new Set([owner]),
      existingFiles: new Set([owner]),
      repoDirectories: new Set(['docs', 'docs/migration']),
      currentMarkdown: undefined,
      currentHeadSha: 'c'.repeat(40),
      isCommitAncestor: async () => true,
      changedPathsBetween: async () => [],
      questionSemanticHash: 'd'.repeat(64),
      classificationSemanticHash: 'd'.repeat(64),
      fixtureManifestHash: 'e'.repeat(64),
      classificationFixtureManifestHash: 'e'.repeat(64),
    })

    expect(result).toMatchObject({ ok: true, errors: [] })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  test('accepts metadata commits only when semantic paths are unchanged', async () => {
    await expect(verifySemanticAncestry({
      implementationSha: candidateSha,
      candidateSha: 'b'.repeat(40),
      semanticPaths: batch2ASemanticPaths,
      changedPaths: [
        'docs/classification/manifest.json',
        'docs/migration/ledger.json',
      ],
    })).resolves.toBeUndefined()

    await expect(verifySemanticAncestry({
      implementationSha: candidateSha,
      candidateSha: 'b'.repeat(40),
      semanticPaths: batch2ASemanticPaths,
      changedPaths: ['packages/classification-core/src/flow/evaluate.ts'],
    })).rejects.toThrow('semantic path changed after implementation SHA')

    await expect(verifySemanticAncestry({
      implementationSha: candidateSha,
      candidateSha: 'b'.repeat(40),
      semanticPaths: batch2ASemanticPaths,
      changedPaths: ['tools/parity/questions-malicious/parity.ts'],
    })).resolves.toBeUndefined()
  })

  test('complete Batch 2A requires exact incident and verification gates', () => {
    expect(migrationLedgerSchema.safeParse(batch2ALedger(completeBatch2A())).success).toBe(true)

    for (const incidents of [
      undefined,
      [],
      [batch2AIncidentPath, 'docs/migration/incidents/extra.md'],
    ]) {
      expect(migrationLedgerSchema.safeParse(batch2ALedger(completeBatch2A({
        incidents,
      }))).success).toBe(false)
    }

    expect(migrationLedgerSchema.safeParse(batch2ALedger(completeBatch2A({
      verification: completeBatch2A().verification.slice(0, 1),
    }))).success).toBe(false)
  })

  test('complete Batch 2A rejects a missing or non-regular incident file', async () => {
    const input = batch2ALedger(completeBatch2A())
    const baseState = {
      repoFiles: new Set([batch2AIncidentPath]),
      repoDirectories: new Set(['docs', 'docs/migration', 'docs/migration/incidents']),
      currentMarkdown: undefined,
      currentHeadSha: 'b'.repeat(40),
      isCommitAncestor: async () => true,
      changedPathsBetween: async () => [],
      questionSemanticHash: 'd'.repeat(64),
      classificationSemanticHash: 'd'.repeat(64),
      fixtureManifestHash: 'e'.repeat(64),
      classificationFixtureManifestHash: 'e'.repeat(64),
    }

    const missing = await checkLedgerOffline(input, {
      ...baseState,
      existingFiles: new Set<string>(),
    })
    expect(missing.errors).toContain(
      `Batch 2A incident is not an existing regular repository file: ${batch2AIncidentPath}`,
    )
  })

  test('offline ledger check validates local ancestry and question identity hashes', async () => {
    const input = batch2ALedger(completeBatch2A())
    const result = await checkLedgerOffline(input, {
      repoFiles: new Set([batch2AIncidentPath]),
      existingFiles: new Set([batch2AIncidentPath]),
      repoDirectories: new Set(['docs', 'docs/migration', 'docs/migration/incidents']),
      currentMarkdown: undefined,
      currentHeadSha: 'b'.repeat(40),
      isCommitAncestor: async () => false,
      changedPathsBetween: async () => [],
      questionSemanticHash: 'd'.repeat(64),
      classificationSemanticHash: 'f'.repeat(64),
      fixtureManifestHash: 'e'.repeat(64),
      classificationFixtureManifestHash: '0'.repeat(64),
    })

    expect(result.errors).toContain(
      `Recorded remote CI commit ${candidateSha} is not an ancestor of current HEAD ${'b'.repeat(40)}`,
    )
    expect(result.errors).toContain(
      `Batch 2A implementation SHA ${candidateSha} is not an ancestor of current HEAD ${'b'.repeat(40)}`,
    )
    expect(result.errors).toContain('classification manifest question semantic hash is inconsistent')
    expect(result.errors).toContain(
      'classification manifest observable-trace fixture manifest hash is inconsistent',
    )
  })
})

describe('local Git semantic changed-path collection', () => {
  test('offline CLI rejects a staged semantic blob hidden by a HEAD-equal working file', () => {
    const fixture = createSemanticIndexCliFixture()
    try {
      writeFixtureFile(fixture.repoRoot, semanticFlowPath, 'export const value = 2\n')
      execFileSync('git', ['add', '--', semanticFlowPath], { cwd: fixture.repoRoot })
      writeFixtureFile(fixture.repoRoot, semanticFlowPath, 'export const value = 1\n')

      const productionStylePaths = execFileSync(
        'git',
        ['diff', '--name-only', '--no-renames', '-z', fixture.implementationSha, '--'],
        { cwd: fixture.repoRoot, encoding: 'utf8' },
      ).split('\0').filter(Boolean)
      const stagedPaths = execFileSync(
        'git',
        [
          'diff',
          '--cached',
          '--name-only',
          '--no-renames',
          '-z',
          fixture.implementationSha,
          '--',
        ],
        { cwd: fixture.repoRoot, encoding: 'utf8' },
      ).split('\0').filter(Boolean)
      expect(productionStylePaths).not.toContain(semanticFlowPath)
      expect(stagedPaths).toContain(semanticFlowPath)

      const result = fixture.run('--check')

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(
        `semantic path changed after implementation SHA: ${semanticFlowPath}`,
      )
    } finally {
      fixture.cleanup()
    }
  })

  test('unions committed, staged, deleted, renamed, unstaged, and newline paths', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-ledger-git-paths-'))
    const hiddenPath = 'packages/classification-core/src/flow/hidden.ts'
    const deletedPath = 'packages/classification-core/src/flow/deleted.ts'
    const renamedPath = 'packages/classification-core/src/flow/renamed.ts'
    const renamedTarget = 'docs/renamed.ts'
    const newlinePath = 'packages/classification-core/src/flow/line\nbreak.ts'
    const unstagedPath = 'packages/classification-core/src/flow/unstaged.ts'
    const revertedPath = 'packages/classification-core/src/flow/reverted.ts'
    const committedPath = 'docs/committed.md'
    const baseContents = new Map([
      [hiddenPath, 'hidden base\n'],
      [deletedPath, 'deleted base\n'],
      [renamedPath, 'renamed base\n'],
      [newlinePath, 'newline base\n'],
      [unstagedPath, 'unstaged base\n'],
      [revertedPath, 'reverted base\n'],
      [committedPath, 'committed base\n'],
    ])
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: repoRoot })
      configureTemporaryGitRepository(repoRoot)
      for (const [file, content] of baseContents) {
        writeFixtureFile(repoRoot, file, content)
      }
      execFileSync('git', ['add', '--all'], { cwd: repoRoot })
      execFileSync('git', ['commit', '--quiet', '-m', 'implementation'], { cwd: repoRoot })
      const implementationSha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim()

      writeFixtureFile(repoRoot, revertedPath, 'forbidden intermediate change\n')
      execFileSync('git', ['add', '--', revertedPath], { cwd: repoRoot })
      execFileSync('git', ['commit', '--quiet', '-m', 'forbidden change'], { cwd: repoRoot })
      writeFixtureFile(repoRoot, revertedPath, baseContents.get(revertedPath)!)
      execFileSync('git', ['add', '--', revertedPath], { cwd: repoRoot })
      execFileSync('git', ['commit', '--quiet', '-m', 'revert forbidden change'], {
        cwd: repoRoot,
      })

      writeFixtureFile(repoRoot, committedPath, 'committed metadata\n')
      execFileSync('git', ['add', '--', committedPath], { cwd: repoRoot })
      execFileSync('git', ['commit', '--quiet', '-m', 'metadata'], { cwd: repoRoot })
      const currentHeadSha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim()

      writeFixtureFile(repoRoot, hiddenPath, 'hidden staged\n')
      execFileSync('git', ['add', '--', hiddenPath], { cwd: repoRoot })
      writeFixtureFile(repoRoot, hiddenPath, baseContents.get(hiddenPath)!)

      rmSync(join(repoRoot, deletedPath))
      execFileSync('git', ['add', '-u', '--', deletedPath], { cwd: repoRoot })
      execFileSync('git', ['mv', '--', renamedPath, renamedTarget], { cwd: repoRoot })

      writeFixtureFile(repoRoot, newlinePath, 'newline staged\n')
      execFileSync('git', ['add', '--', newlinePath], { cwd: repoRoot })
      writeFixtureFile(repoRoot, newlinePath, baseContents.get(newlinePath)!)
      writeFixtureFile(repoRoot, unstagedPath, 'unstaged working tree\n')

      const changedPaths = collectGitChangedPaths(
        repoRoot,
        implementationSha,
        currentHeadSha,
      )
      expect(new Set(changedPaths)).toEqual(new Set([
        committedPath,
        hiddenPath,
        deletedPath,
        renamedPath,
        renamedTarget,
        newlinePath,
        unstagedPath,
        revertedPath,
      ]))
      expect(changedPaths).toHaveLength(8)
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
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
