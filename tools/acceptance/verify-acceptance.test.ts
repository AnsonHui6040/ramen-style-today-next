import { readFileSync } from 'node:fs'

import { expect, test, vi } from 'vitest'

import {
  verifyAcceptance,
  verifySuccessfulCiProof,
} from './verify-acceptance.js'
import {
  batch2ASemanticPaths,
  batch2BAcceptanceMetadataPaths,
  batch2BImplementationPaths,
  batch2BVerificationPaths,
} from '../migration/ledger-schema.js'

const candidateSha = 'a'.repeat(40)
const githubToken = 'github-token'
const runApiUrl = 'https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/runs/123'
const workflowApiUrl = 'https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/workflows/ci.yml'
const runUrl = 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123'

function response(url: string, payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: false,
    url,
    json: async () => payload,
  } as Response
}

function proof() {
  return {
    schemaVersion: 1,
    sha: candidateSha,
    runId: 123,
    runUrl,
  }
}

function successfulRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    workflow_id: 456,
    html_url: runUrl,
    head_sha: candidateSha,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/ci.yml@main',
    repository: {
      full_name: 'AnsonHui6040/ramen-style-today-next',
    },
    ...overrides,
  }
}

function githubFetch(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (input: string | URL | globalThis.Request, init?: RequestInit) => {
    const url = String(input)
    expect(init).toMatchObject({
      redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'User-Agent': 'ramen-style-today-next',
      },
    })
    if (url === runApiUrl) return response(url, successfulRun(overrides))
    if (url === workflowApiUrl) return response(url, {
      id: 456,
      path: '.github/workflows/ci.yml',
    })
    throw new Error(`Unexpected GitHub API URL ${url}`)
  }) as unknown as typeof fetch
}

function ledgerWithRecordedProof() {
  return {
    schemaVersion: 1,
    baseline: {
      repository: 'AnsonHui6040/ramen-style-today',
      commit: 'b'.repeat(40),
    },
    entries: [{
      batch: '1',
      status: 'complete',
      legacySources: [],
      ownedScopes: [],
      newOwners: ['package.json'],
      transformation: 'Acceptance fixture.',
      behavior: 'no-runtime-change',
      verification: [
        {
          gate: 'batch1-local-verify',
          command: 'npm run verify',
          outcome: 'passed',
          evidence: 'offline verification passed',
        },
        {
          gate: 'batch1-remote-ci',
          command: 'GitHub Actions CI / verify',
          outcome: 'passed',
          evidence: 'authenticated remote verification passed',
          commitSha: candidateSha,
          runUrl,
        },
      ],
    }],
  }
}

function ledgerWithBatch2BRecordedProof(status: 'in-progress' | 'complete' = 'complete') {
  return {
    schemaVersion: 1,
    baseline: {
      repository: 'AnsonHui6040/ramen-style-today',
      commit: 'b'.repeat(40),
    },
    entries: [{
      batch: '2B',
      status,
      ...(status === 'complete' ? { implementationSha: candidateSha } : {}),
      implementationPaths: [...batch2BImplementationPaths],
      verificationPaths: [...batch2BVerificationPaths],
      acceptanceMetadataPaths: [...batch2BAcceptanceMetadataPaths],
      fixtureManifestHash: 'f'.repeat(64),
      legacySources: ['src/App.tsx'],
      ownedScopes: [],
      newOwners: ['packages/classification-core/src/persistence/contracts.ts'],
      transformation: 'Acceptance fixture.',
      behavior: 'no-production-runtime-change',
      verification: status === 'complete'
        ? [
            {
              gate: 'batch2b-local-verify',
              command: 'npm run verify',
              outcome: 'passed',
              evidence: 'offline verification passed',
            },
            {
              gate: 'batch2b-remote-ci',
              command: 'GitHub Actions CI / verify',
              outcome: 'passed',
              evidence: 'authenticated remote verification passed',
              commitSha: candidateSha,
              runUrl,
            },
          ]
        : [],
    }],
  }
}

test('online acceptance authenticates the fixed owner workflow and exact SHA', async () => {
  const fetchImplementation = githubFetch()

  await expect(verifyAcceptance(
    ledgerWithRecordedProof(),
    fetchImplementation,
    githubToken,
  )).resolves.toBeUndefined()
  expect(fetchImplementation).toHaveBeenCalledTimes(2)
})

test('online acceptance authenticates completed Batch 2B exact-SHA evidence', async () => {
  const fetchImplementation = githubFetch()

  await expect(verifyAcceptance(
    ledgerWithBatch2BRecordedProof(),
    fetchImplementation,
    githubToken,
  )).resolves.toBeUndefined()
  expect(fetchImplementation).toHaveBeenCalledTimes(2)
})

test('in-progress Batch 2B has no remote proof and creates no online gate cycle', async () => {
  const fetchImplementation = vi.fn()

  await expect(verifyAcceptance(
    ledgerWithBatch2BRecordedProof('in-progress'),
    fetchImplementation as unknown as typeof fetch,
  )).resolves.toBeUndefined()
  expect(fetchImplementation).not.toHaveBeenCalled()
})

test('CI uses only committed verification and never invokes the persistence extractor', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  )

  expect(workflow).toContain('npm run verify')
  expect(workflow).toContain('npm run verify:acceptance')
  expect(workflow).not.toContain('parity:persistence:extract')
})

test('in-review ledger with zero recorded proofs succeeds without creating a circular gate', async () => {
  const input = {
    ...ledgerWithRecordedProof(),
    entries: [{
      ...ledgerWithRecordedProof().entries[0]!,
      batch: '2A',
      status: 'in-review',
      semanticPaths: batch2ASemanticPaths,
      incidents: [],
      verification: [],
    }],
  }
  const fetchImplementation = vi.fn()

  await expect(verifyAcceptance(input, fetchImplementation as unknown as typeof fetch))
    .resolves.toBeUndefined()
  expect(fetchImplementation).not.toHaveBeenCalled()
})

test.each([undefined, '', ' token', 'token\n'])(
  'online acceptance fails closed with an invalid token %#',
  async (token) => {
    const fetchImplementation = githubFetch()

    await expect(verifyAcceptance(ledgerWithRecordedProof(), fetchImplementation, token))
      .rejects.toThrow('GITHUB_TOKEN is required to authenticate recorded remote CI evidence')
    expect(fetchImplementation).not.toHaveBeenCalled()
  },
)

test.each([
  ['repository', { repository: { full_name: 'OtherOwner/other-repository' } }, /repository mismatch/],
  ['workflow ID', { workflow_id: 999 }, /workflow ID mismatch/],
  ['head SHA', { head_sha: 'c'.repeat(40) }, /head SHA mismatch/],
  ['event', { event: 'pull_request' }, /event must be push/],
  ['status', { status: 'in_progress' }, /status must be completed/],
  ['conclusion', { conclusion: 'failure' }, /conclusion must be success/],
  ['workflow path', { path: '.github/workflows/other.yml' }, /workflow must be ci.yml/],
] as const)('rejects a GitHub run %s mismatch', async (_label, overrides, expected) => {
  await expect(verifySuccessfulCiProof(
    proof(),
    candidateSha,
    githubFetch(overrides),
    githubToken,
  )).rejects.toThrow(expected)
})

test('rejects a proof for a different exact candidate SHA before fetching', async () => {
  const fetchImplementation = githubFetch()

  await expect(verifySuccessfulCiProof(
    proof(),
    'c'.repeat(40),
    fetchImplementation,
    githubToken,
  )).rejects.toThrow('proof SHA must match current candidate SHA')
  expect(fetchImplementation).not.toHaveBeenCalled()
})
