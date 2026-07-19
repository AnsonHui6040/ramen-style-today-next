import { readFileSync } from 'node:fs'

import { expect, test, vi } from 'vitest'

import {
  verifyAcceptance,
  verifySuccessfulCiProof,
} from './verify-acceptance.js'
import {
  acceptedBatch2BImplementationSha,
  acceptedBatch2BMetadataRunUrl,
  acceptedBatch2BMetadataSha,
  batch2ASemanticPaths,
  batch2BAcceptanceMetadataPaths,
  batch2BBoundaryMaintenancePaths,
  batch2BImplementationPaths,
  batch2BVerificationPaths,
} from '../migration/ledger-schema.js'

const candidateSha = 'a'.repeat(40)
const githubToken = 'github-token'
const workflowApiUrl = 'https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/workflows/ci.yml'
const runUrl = 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123'
const acceptedImplementationRunId = 29411281929
const acceptedImplementationRunUrl =
  `https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/${acceptedImplementationRunId}`
const acceptedMetadataRunId = 29411764507

const recordedRuns = new Map([
  [123, { sha: candidateSha, url: runUrl }],
  [acceptedImplementationRunId, {
    sha: acceptedBatch2BImplementationSha,
    url: acceptedImplementationRunUrl,
  }],
  [acceptedMetadataRunId, {
    sha: acceptedBatch2BMetadataSha,
    url: acceptedBatch2BMetadataRunUrl,
  }],
])

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

function successfulRun(
  runId: number,
  identity: { sha: string; url: string },
  overrides: Record<string, unknown> = {},
) {
  return {
    id: runId,
    workflow_id: 456,
    html_url: identity.url,
    head_sha: identity.sha,
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

function githubFetch(
  overrides: Record<string, unknown> = {},
  targetRunId = 123,
) {
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
    const runMatch = /\/actions\/runs\/([1-9][0-9]*)$/.exec(url)
    if (runMatch) {
      const runId = Number(runMatch[1])
      const identity = recordedRuns.get(runId)
      if (!identity) throw new Error(`Unexpected GitHub Actions run ${runId}`)
      return response(url, successfulRun(
        runId,
        identity,
        runId === targetRunId ? overrides : {},
      ))
    }
    if (url === workflowApiUrl) return response(url, {
      id: 456,
      path: '.github/workflows/ci.yml',
    })
    throw new Error(`Unexpected GitHub API URL ${url}`)
  }) as unknown as typeof fetch
}

type FailureStage = 'run' | 'workflow'
type FailureMode = 'fetch' | 'json'

function boundedFailureFetch(
  stage: FailureStage,
  mode: FailureMode,
): typeof fetch {
  return async (input, init) => {
    const url = String(input)
    const authorization = new Headers(init?.headers).get('Authorization') ?? ''
    const secret = `REMOTE_BODY_SENTINEL ${authorization}`
    const isRun = /\/actions\/runs\/123$/.test(url)
    const isWorkflow = url === workflowApiUrl
    if ((stage === 'run' && isRun) || (stage === 'workflow' && isWorkflow)) {
      if (mode === 'fetch') throw new Error(secret)
      return {
        ...response(url, {}),
        json: async () => {
          throw new Error(secret)
        },
      } as Response
    }
    if (isRun) {
      const identity = recordedRuns.get(123)!
      return response(url, successfulRun(123, identity))
    }
    if (isWorkflow) return response(url, {
      id: 456,
      path: '.github/workflows/ci.yml',
    })
    throw new Error(`Unexpected GitHub API URL ${url}`)
  }
}

async function captureRejection(operation: () => Promise<unknown>) {
  let captured: unknown
  try {
    await operation()
  } catch (error) {
    captured = error
  }
  expect(captured).toBeInstanceOf(Error)
  return captured
}

function expectBoundedFailure(error: unknown, expectedMessage: string) {
  if (!(error instanceof Error)) throw new Error('expected Error rejection')
  expect(error.message).toBe(expectedMessage)
  expect(error.cause).toBeUndefined()
  const visibleDetails = [error.message, error.stack, String(error.cause)].join('\n')
  expect(visibleDetails).not.toContain('REMOTE_BODY_SENTINEL')
  expect(visibleDetails).not.toContain('TOKEN_SENTINEL')
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

function acceptedBatch2BBoundary(overrides: Record<string, unknown> = {}) {
  return {
    implementationSha: acceptedBatch2BImplementationSha,
    metadataSha: acceptedBatch2BMetadataSha,
    paths: [...batch2BAcceptanceMetadataPaths],
    verification: [{
      gate: 'batch2b-acceptance-boundary-remote-ci',
      command: 'GitHub Actions CI / verify',
      outcome: 'passed',
      evidence: 'the exact accepted metadata commit passed Node 24 CI',
      commitSha: acceptedBatch2BMetadataSha,
      runUrl: acceptedBatch2BMetadataRunUrl,
    }],
    ...overrides,
  }
}

function inProgressBoundaryMaintenance(overrides: Record<string, unknown> = {}) {
  return {
    status: 'in-progress',
    paths: [...batch2BBoundaryMaintenancePaths],
    verification: [],
    ...overrides,
  }
}

function completedBoundaryMaintenance(overrides: Record<string, unknown> = {}) {
  return {
    status: 'complete',
    maintenanceSha: candidateSha,
    paths: [...batch2BBoundaryMaintenancePaths],
    verification: [
      {
        gate: 'batch2b-boundary-maintenance-local-verify',
        command: 'npm run verify',
        outcome: 'passed',
        evidence: 'local boundary-maintenance verification passed',
      },
      {
        gate: 'batch2b-boundary-maintenance-remote-ci',
        command: 'GitHub Actions CI / verify',
        outcome: 'passed',
        evidence: 'remote boundary-maintenance verification passed',
        commitSha: candidateSha,
        runUrl,
      },
    ],
    ...overrides,
  }
}

function completedBoundaryMaintenanceWithRemote(
  remoteOverrides: Record<string, unknown>,
) {
  const maintenance = completedBoundaryMaintenance()
  return {
    ...maintenance,
    verification: [
      maintenance.verification[0]!,
      {
        ...maintenance.verification[1]!,
        ...remoteOverrides,
      },
    ],
  }
}

function acceptedBatch2BEntry(overrides: Record<string, unknown> = {}) {
  return {
    batch: '2B',
    status: 'complete',
    implementationSha: acceptedBatch2BImplementationSha,
    implementationPaths: [...batch2BImplementationPaths],
    verificationPaths: [...batch2BVerificationPaths],
    acceptanceMetadataPaths: [...batch2BAcceptanceMetadataPaths],
    acceptanceBoundary: acceptedBatch2BBoundary(),
    boundaryMaintenance: inProgressBoundaryMaintenance(),
    fixtureManifestHash: 'f'.repeat(64),
    legacySources: ['src/App.tsx'],
    ownedScopes: [],
    newOwners: ['packages/classification-core/src/persistence/contracts.ts'],
    transformation: 'Accepted Batch 2B evidence fixture.',
    behavior: 'no-production-runtime-change',
    verification: [
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
        evidence: 'authenticated implementation evidence passed',
        commitSha: acceptedBatch2BImplementationSha,
        runUrl: acceptedImplementationRunUrl,
      },
    ],
    ...overrides,
  }
}

function inProgressBatch2BEntry() {
  return {
    batch: '2B',
    status: 'in-progress',
    implementationPaths: [...batch2BImplementationPaths],
    verificationPaths: [...batch2BVerificationPaths],
    acceptanceMetadataPaths: [...batch2BAcceptanceMetadataPaths],
    fixtureManifestHash: 'f'.repeat(64),
    legacySources: ['src/App.tsx'],
    ownedScopes: [],
    newOwners: ['packages/classification-core/src/persistence/contracts.ts'],
    transformation: 'In-progress Batch 2B evidence fixture.',
    behavior: 'no-production-runtime-change',
    verification: [],
  }
}

function ledgerWithBatch2BEntry(entry: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    baseline: {
      repository: 'AnsonHui6040/ramen-style-today',
      commit: 'b'.repeat(40),
    },
    entries: [entry],
  }
}

function ledgerWithBatch2BRecordedProof(status: 'in-progress' | 'complete' = 'complete') {
  return ledgerWithBatch2BEntry(
    status === 'complete' ? acceptedBatch2BEntry() : inProgressBatch2BEntry(),
  )
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
  expect(fetchImplementation).toHaveBeenCalledTimes(4)
})

test('in-progress Batch 2B has no remote proof and creates no online gate cycle', async () => {
  const fetchImplementation = vi.fn()

  await expect(verifyAcceptance(
    ledgerWithBatch2BRecordedProof('in-progress'),
    fetchImplementation as unknown as typeof fetch,
  )).resolves.toBeUndefined()
  expect(fetchImplementation).not.toHaveBeenCalled()
  expect(inProgressBatch2BEntry()).not.toHaveProperty('implementationSha')
  expect(inProgressBatch2BEntry()).not.toHaveProperty('acceptanceBoundary')
  expect(inProgressBatch2BEntry()).not.toHaveProperty('boundaryMaintenance')
})

test('online acceptance authenticates completed boundary-maintenance evidence', async () => {
  const fetchImplementation = githubFetch()
  const input = ledgerWithBatch2BEntry(acceptedBatch2BEntry({
    boundaryMaintenance: completedBoundaryMaintenance(),
  }))

  await expect(verifyAcceptance(input, fetchImplementation, githubToken))
    .resolves.toBeUndefined()
  expect(fetchImplementation).toHaveBeenCalledTimes(6)
})

test.each([
  ['missing', []],
  ['duplicate', [
    acceptedBatch2BBoundary().verification[0],
    acceptedBatch2BBoundary().verification[0],
  ]],
] as const)('rejects %s accepted-boundary proof before fetching', async (_label, verification) => {
  const fetchImplementation = githubFetch()
  const input = ledgerWithBatch2BEntry(acceptedBatch2BEntry({
    acceptanceBoundary: acceptedBatch2BBoundary({ verification }),
  }))

  await expect(verifyAcceptance(input, fetchImplementation, githubToken))
    .rejects.toThrow(/acceptance boundary requires its exact accepted metadata remote CI evidence/)
  expect(fetchImplementation).not.toHaveBeenCalled()
})

test('rejects malformed nested boundary-maintenance run URLs', async () => {
  const fetchImplementation = githubFetch()
  const input = ledgerWithBatch2BEntry(acceptedBatch2BEntry({
    boundaryMaintenance: completedBoundaryMaintenanceWithRemote({
      runUrl: 'https://example.com/actions/runs/123',
    }),
  }))

  await expect(verifyAcceptance(input, fetchImplementation, githubToken))
    .rejects.toThrow('Recorded remote CI run URL must be the canonical repository run URL')
  expect(fetchImplementation).not.toHaveBeenCalled()
})

test('rejects accepted metadata evidence bound to a different SHA', async () => {
  const fetchImplementation = githubFetch()
  const input = ledgerWithBatch2BEntry(acceptedBatch2BEntry({
    acceptanceBoundary: acceptedBatch2BBoundary({
      verification: [{
        ...acceptedBatch2BBoundary().verification[0],
        commitSha: candidateSha,
      }],
    }),
  }))

  await expect(verifyAcceptance(input, fetchImplementation, githubToken))
    .rejects.toThrow(/acceptance boundary requires its exact accepted metadata remote CI evidence/)
  expect(fetchImplementation).not.toHaveBeenCalled()
})

test('rejects completed maintenance evidence not bound to maintenanceSha', async () => {
  const fetchImplementation = githubFetch()
  const input = ledgerWithBatch2BEntry(acceptedBatch2BEntry({
    boundaryMaintenance: completedBoundaryMaintenanceWithRemote({
      commitSha: 'c'.repeat(40),
    }),
  }))

  await expect(verifyAcceptance(input, fetchImplementation, githubToken))
    .rejects.toThrow(/remote CI commit must match maintenanceSha/)
  expect(fetchImplementation).not.toHaveBeenCalled()
})

test('rejects duplicate proof identity across registered nested evidence arrays', async () => {
  const duplicateMaintenance = completedBoundaryMaintenanceWithRemote({
    commitSha: acceptedBatch2BMetadataSha,
    runUrl: acceptedBatch2BMetadataRunUrl,
  })
  const input = ledgerWithBatch2BEntry(acceptedBatch2BEntry({
    boundaryMaintenance: {
      ...duplicateMaintenance,
      maintenanceSha: acceptedBatch2BMetadataSha,
    },
  }))

  await expect(verifyAcceptance(input, githubFetch(), githubToken))
    .rejects.toThrow('Recorded remote CI evidence is duplicated')
})

test.each([
  ['repository', { repository: { full_name: 'OtherOwner/other-repository' } }, /repository mismatch/],
  ['workflow ID', { workflow_id: 999 }, /workflow ID mismatch/],
  ['head SHA', { head_sha: candidateSha }, /head SHA mismatch/],
  ['event', { event: 'pull_request' }, /event must be push/],
  ['status', { status: 'in_progress' }, /status must be completed/],
  ['conclusion', { conclusion: 'failure' }, /conclusion must be success/],
  ['workflow path', { path: '.github/workflows/other.yml' }, /workflow must be ci.yml/],
] as const)('rejects accepted-boundary nested run %s mismatch', async (
  _label,
  overrides,
  expected,
) => {
  await expect(verifyAcceptance(
    ledgerWithBatch2BRecordedProof(),
    githubFetch(overrides, acceptedMetadataRunId),
    githubToken,
  )).rejects.toThrow(expected)
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

test.each([
  ['run', 'fetch', 'Unable to verify GitHub Actions run'],
  ['run', 'json', 'Received malformed GitHub Actions run response'],
  ['workflow', 'fetch', 'Unable to verify canonical GitHub Actions workflow'],
  ['workflow', 'json', 'Received malformed GitHub workflow response'],
] as const)('bounds complete %s %s failures without exposing cause', async (
  stage,
  mode,
  expectedMessage,
) => {
  const error = await captureRejection(() => verifySuccessfulCiProof(
    proof(),
    candidateSha,
    boundedFailureFetch(stage, mode),
    'TOKEN_SENTINEL',
  ))

  expectBoundedFailure(error, expectedMessage)
})
