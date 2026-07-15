import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { expect, test } from 'vitest'

import {
  acceptedBatch2BImplementationSha,
  acceptedBatch2BMetadataRunUrl,
  acceptedBatch2BMetadataSha,
  batch2AIncidentPath,
  batch2AMaintenancePaths,
  batch2ASemanticPaths,
  batch2BAcceptanceMetadataPaths,
  batch2BBoundaryMaintenancePaths,
  batch2BImplementationPaths,
  batch2BVerificationPaths,
  migrationLedgerSchema,
  protectedQuestionBaseline,
} from './ledger-schema.js'
import { recordSuccessfulCiFile } from './record-ci.js'

const candidateSha = 'a'.repeat(40)
const runApiUrl = 'https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/runs/123'
const workflowApiUrl = 'https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/workflows/ci.yml'
const runUrl = 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123'
const historicalBatch2AImplementationSha =
  'ecf9f5b4791862471d0898da7283ba4a40d3fbf9'

function acceptedBatch2BBoundary() {
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
  }
}

function acceptedBatch2BEntry(boundaryMaintenance: Record<string, unknown> = {
  status: 'in-progress',
  paths: [...batch2BBoundaryMaintenancePaths],
  verification: [],
}) {
  return {
    batch: '2B',
    status: 'complete',
    implementationSha: acceptedBatch2BImplementationSha,
    implementationPaths: [...batch2BImplementationPaths],
    verificationPaths: [...batch2BVerificationPaths],
    acceptanceMetadataPaths: [...batch2BAcceptanceMetadataPaths],
    acceptanceBoundary: acceptedBatch2BBoundary(),
    boundaryMaintenance,
    fixtureManifestHash: 'f'.repeat(64),
    legacySources: ['src/App.tsx'],
    ownedScopes: [],
    newOwners: ['packages/classification-core/src/persistence/contracts.ts'],
    transformation: 'Authenticated Batch 2B boundary-maintenance fixture.',
    behavior: 'no-production-runtime-change',
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
        evidence: 'the exact Batch 2B implementation candidate passed CI',
        commitSha: acceptedBatch2BImplementationSha,
        runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/29411281929',
      },
    ],
  }
}

function response(url: string, payload: unknown) {
  return {
    ok: true,
    status: 200,
    redirected: false,
    url,
    json: async () => payload,
  } as Response
}

function authenticatedFetch(requestedUrls: string[]) {
  return (async (request: string | URL | globalThis.Request) => {
    const url = String(request)
    requestedUrls.push(url)
    if (url === runApiUrl) return response(url, {
      id: 123,
      workflow_id: 456,
      html_url: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      head_sha: candidateSha,
      head_branch: 'main',
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      path: '.github/workflows/ci.yml@main',
      repository: { full_name: 'AnsonHui6040/ramen-style-today-next' },
    })
    if (url === workflowApiUrl) return response(url, {
      id: 456,
      path: '.github/workflows/ci.yml',
    })
    throw new Error(`Unexpected GitHub API URL ${url}`)
  }) as typeof fetch
}

test('authenticated recording atomically replaces canonical JSON and cleans its same-directory temp file', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-ledger-record-'))
  try {
    const sourceFile = join(repoRoot, 'docs/migration/ledger.json')
    mkdirSync(dirname(sourceFile), { recursive: true })
    const input = migrationLedgerSchema.parse({
      schemaVersion: 1,
      baseline: {
        repository: 'AnsonHui6040/ramen-style-today',
        commit: 'b'.repeat(40),
      },
      entries: [{
        batch: '1',
        status: 'in-review',
        legacySources: [],
        ownedScopes: [],
        newOwners: ['docs/migration/ledger.json'],
        transformation: 'Authenticated recording fixture.',
        behavior: 'no-runtime-change',
        verification: [{
          gate: 'batch1-local-verify',
          command: 'npm run verify',
          outcome: 'passed',
          evidence: 'local verification passed',
        }],
      }],
    })
    writeFileSync(sourceFile, `${JSON.stringify(input, null, 2)}\n`)
    const inodeBefore = lstatSync(sourceFile).ino
    const requestedUrls: string[] = []

    await recordSuccessfulCiFile({
      batch: '1',
      expectedCandidateSha: candidateSha,
      fetchImplementation: authenticatedFetch(requestedUrls),
      githubToken: 'github-token',
      proofInput: {
        schemaVersion: 1,
        sha: candidateSha,
        runId: 123,
        runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      },
      repoRoot,
      sourceFile,
    })

    expect(requestedUrls).toEqual([runApiUrl, workflowApiUrl])
    expect(lstatSync(sourceFile).ino).not.toBe(inodeBefore)
    const updated = migrationLedgerSchema.parse(JSON.parse(
      readFileSync(sourceFile, 'utf8'),
    ) as unknown)
    expect(updated.entries[0]).toMatchObject({ status: 'complete' })
    expect(updated.entries[0]!.verification.at(-1)).toMatchObject({
      commitSha: candidateSha,
      runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
    })
    expect(readdirSync(dirname(sourceFile)).filter(
      (file) => file.startsWith('.ledger.json.tmp-'),
    )).toEqual([])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('Batch 2A promotion atomically records implementation SHA, incident, and exact remote gate', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-ledger-record-2a-'))
  try {
    const sourceFile = join(repoRoot, 'docs/migration/ledger.json')
    mkdirSync(dirname(sourceFile), { recursive: true })
    const incident = 'docs/migration/incidents/2026-07-13-legacy-cache-isolation.md'
    const input = {
      schemaVersion: 1,
      baseline: {
        repository: 'AnsonHui6040/ramen-style-today',
        commit: 'b'.repeat(40),
      },
      entries: [{
        batch: '2A',
        status: 'in-review',
        semanticPaths: [
          'packages/classification-core/src/definitions/questions.ts',
          'packages/classification-core/src/compiler/questions/**',
          'packages/classification-core/src/generated/question-model.ts',
          'packages/classification-core/src/flow/**',
          'tools/parity/questions/**',
          'tools/parity/fixtures/questions/**',
        ],
        incidents: [],
        legacySources: [],
        ownedScopes: [],
        newOwners: [incident],
        transformation: 'Authenticated Batch 2A recording fixture.',
        behavior: 'no-production-runtime-change',
        verification: [{
          gate: 'batch2a-local-verify',
          command: 'npm run verify',
          outcome: 'passed',
          evidence: 'local verification passed',
        }],
      }],
    }
    writeFileSync(sourceFile, `${JSON.stringify(input, null, 2)}\n`)
    const requestedUrls: string[] = []

    await recordSuccessfulCiFile({
      batch: '2A',
      expectedCandidateSha: candidateSha,
      fetchImplementation: authenticatedFetch(requestedUrls),
      githubToken: 'github-token',
      proofInput: {
        schemaVersion: 1,
        sha: candidateSha,
        runId: 123,
        runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      },
      repoRoot,
      sourceFile,
    })

    expect(requestedUrls).toEqual([runApiUrl, workflowApiUrl])
    const updated = migrationLedgerSchema.parse(JSON.parse(
      readFileSync(sourceFile, 'utf8'),
    ) as unknown)
    expect(updated.entries[0]).toMatchObject({
      status: 'complete',
      implementationSha: candidateSha,
      incidents: [incident],
    })
    expect(updated.entries[0]!.verification.map(({ gate }) => gate)).toEqual([
      'batch2a-local-verify',
      'batch2a-remote-ci',
    ])
    expect(readdirSync(dirname(sourceFile)).filter(
      (file) => file.startsWith('.ledger.json.tmp-'),
    )).toEqual([])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('failed Batch 2A promotion leaves canonical JSON byte-identical without temp files', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-ledger-record-failure-'))
  try {
    const sourceFile = join(repoRoot, 'docs/migration/ledger.json')
    mkdirSync(dirname(sourceFile), { recursive: true })
    const input = {
      schemaVersion: 1,
      baseline: {
        repository: 'AnsonHui6040/ramen-style-today',
        commit: 'b'.repeat(40),
      },
      entries: [{
        batch: '2A',
        status: 'in-review',
        semanticPaths: [
          'packages/classification-core/src/definitions/questions.ts',
          'packages/classification-core/src/compiler/questions/**',
          'packages/classification-core/src/generated/question-model.ts',
          'packages/classification-core/src/flow/**',
          'tools/parity/questions/**',
          'tools/parity/fixtures/questions/**',
        ],
        incidents: [],
        legacySources: [],
        ownedScopes: [],
        newOwners: ['docs/migration/ledger.json'],
        transformation: 'Invalid promotion fixture missing local gate.',
        behavior: 'no-production-runtime-change',
        verification: [],
      }],
    }
    const before = `${JSON.stringify(input, null, 2)}\n`
    writeFileSync(sourceFile, before)

    await expect(recordSuccessfulCiFile({
      batch: '2A',
      expectedCandidateSha: candidateSha,
      fetchImplementation: authenticatedFetch([]),
      githubToken: 'github-token',
      proofInput: {
        schemaVersion: 1,
        sha: candidateSha,
        runId: 123,
        runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      },
      repoRoot,
      sourceFile,
    })).rejects.toThrow(/exact verification gates/)

    expect(readFileSync(sourceFile, 'utf8')).toBe(before)
    expect(readdirSync(dirname(sourceFile)).filter(
      (file) => file.startsWith('.ledger.json.tmp-'),
    )).toEqual([])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('Batch 2A maintenance recording preserves semantic identity and records exact evidence', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-ledger-record-2a-maintenance-'))
  try {
    const sourceFile = join(repoRoot, 'docs/migration/ledger.json')
    mkdirSync(dirname(sourceFile), { recursive: true })
    const input = {
      schemaVersion: 1,
      baseline: {
        repository: 'AnsonHui6040/ramen-style-today',
        commit: 'b'.repeat(40),
      },
      entries: [{
        batch: '2A',
        status: 'complete',
        implementationSha: historicalBatch2AImplementationSha,
        semanticPaths: [...batch2ASemanticPaths],
        incidents: [batch2AIncidentPath],
        maintenance: {
          status: 'in-progress',
          paths: [...batch2AMaintenancePaths],
          baseline: protectedQuestionBaseline,
          verification: [],
        },
        legacySources: [],
        ownedScopes: [],
        newOwners: [batch2AIncidentPath],
        transformation: 'Authenticated Batch 2A maintenance recording fixture.',
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
            commitSha: historicalBatch2AImplementationSha,
            runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/122',
          },
        ],
      }],
    }
    writeFileSync(sourceFile, `${JSON.stringify(input, null, 2)}\n`)
    const requestedUrls: string[] = []

    await recordSuccessfulCiFile({
      batch: '2A-maintenance',
      expectedCandidateSha: candidateSha,
      fetchImplementation: authenticatedFetch(requestedUrls),
      githubToken: 'github-token',
      proofInput: {
        schemaVersion: 1,
        sha: candidateSha,
        runId: 123,
        runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      },
      repoRoot,
      sourceFile,
    })

    expect(requestedUrls).toEqual([runApiUrl, workflowApiUrl])
    const updated = migrationLedgerSchema.parse(JSON.parse(
      readFileSync(sourceFile, 'utf8'),
    ) as unknown)
    expect(updated.entries[0]).toMatchObject({
      status: 'complete',
      implementationSha: historicalBatch2AImplementationSha,
      maintenance: {
        status: 'complete',
        maintenanceSha: candidateSha,
      },
    })
    expect(updated.entries[0]!.maintenance?.verification.map(({ gate }) => gate)).toEqual([
      'batch2a-maintenance-local-verify',
      'batch2a-maintenance-remote-ci',
    ])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('Batch 2B boundary maintenance records exact candidate evidence without changing accepted facts', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-ledger-record-2b-'))
  try {
    const sourceFile = join(repoRoot, 'docs/migration/ledger.json')
    mkdirSync(dirname(sourceFile), { recursive: true })
    const input = migrationLedgerSchema.parse({
      schemaVersion: 1,
      baseline: {
        repository: 'AnsonHui6040/ramen-style-today',
        commit: 'b'.repeat(40),
      },
      entries: [acceptedBatch2BEntry()],
    })
    writeFileSync(sourceFile, `${JSON.stringify(input, null, 2)}\n`)
    const requestedUrls: string[] = []

    await recordSuccessfulCiFile({
      batch: '2B-boundary-maintenance',
      expectedCandidateSha: candidateSha,
      fetchImplementation: authenticatedFetch(requestedUrls),
      githubToken: 'github-token',
      proofInput: {
        schemaVersion: 1,
        sha: candidateSha,
        runId: 123,
        runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      },
      repoRoot,
      sourceFile,
    })

    const updated = migrationLedgerSchema.parse(JSON.parse(
      readFileSync(sourceFile, 'utf8'),
    ) as unknown)
    expect(updated.entries[0]).toMatchObject({
      status: 'complete',
      implementationSha: acceptedBatch2BImplementationSha,
      fixtureManifestHash: 'f'.repeat(64),
      acceptanceBoundary: acceptedBatch2BBoundary(),
      boundaryMaintenance: {
        status: 'complete',
        maintenanceSha: candidateSha,
      },
    })
    expect(updated.entries[0]!.boundaryMaintenance?.verification.map(({ gate }) => gate)).toEqual([
      'batch2b-boundary-maintenance-local-verify',
      'batch2b-boundary-maintenance-remote-ci',
    ])
    expect(updated.entries[0]!.verification[1]).toMatchObject({
      commitSha: acceptedBatch2BImplementationSha,
      runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/29411281929',
    })
    expect(requestedUrls).toEqual([runApiUrl, workflowApiUrl])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('Batch 2B boundary maintenance rejects recording unless the nested target is in progress', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-ledger-record-2b-complete-'))
  try {
    const sourceFile = join(repoRoot, 'docs/migration/ledger.json')
    mkdirSync(dirname(sourceFile), { recursive: true })
    const input = migrationLedgerSchema.parse({
      schemaVersion: 1,
      baseline: {
        repository: 'AnsonHui6040/ramen-style-today',
        commit: 'b'.repeat(40),
      },
      entries: [acceptedBatch2BEntry({
        status: 'complete',
        maintenanceSha: candidateSha,
        paths: [...batch2BBoundaryMaintenancePaths],
        verification: [
          {
            gate: 'batch2b-boundary-maintenance-local-verify',
            command: 'npm run verify',
            outcome: 'passed',
            evidence: 'local maintenance verification passed',
          },
          {
            gate: 'batch2b-boundary-maintenance-remote-ci',
            command: 'GitHub Actions CI / verify',
            outcome: 'passed',
            evidence: 'remote maintenance verification passed',
            commitSha: candidateSha,
            runUrl,
          },
        ],
      })],
    })
    const before = `${JSON.stringify(input, null, 2)}\n`
    writeFileSync(sourceFile, before)

    await expect(recordSuccessfulCiFile({
      batch: '2B-boundary-maintenance',
      expectedCandidateSha: candidateSha,
      fetchImplementation: authenticatedFetch([]),
      githubToken: 'github-token',
      proofInput: {
        schemaVersion: 1,
        sha: candidateSha,
        runId: 123,
        runUrl,
      },
      repoRoot,
      sourceFile,
    })).rejects.toThrow('Batch 2B boundary maintenance is not in progress')

    expect(readFileSync(sourceFile, 'utf8')).toBe(before)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})
