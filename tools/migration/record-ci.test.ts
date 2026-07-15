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
  batch2AIncidentPath,
  batch2AMaintenancePaths,
  batch2ASemanticPaths,
  batch2BAcceptanceMetadataPaths,
  batch2BImplementationPaths,
  batch2BVerificationPaths,
  migrationLedgerSchema,
  protectedQuestionBaseline,
} from './ledger-schema.js'
import { recordSuccessfulCiFile } from './record-ci.js'

const candidateSha = 'a'.repeat(40)
const runApiUrl = 'https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/runs/123'
const workflowApiUrl = 'https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/workflows/ci.yml'
const historicalBatch2AImplementationSha =
  'ecf9f5b4791862471d0898da7283ba4a40d3fbf9'

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

test('Batch 2B promotion records exact implementation evidence and preserves fixture binding', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-ledger-record-2b-'))
  try {
    const sourceFile = join(repoRoot, 'docs/migration/ledger.json')
    mkdirSync(dirname(sourceFile), { recursive: true })
    const fixtureManifestHash = 'f'.repeat(64)
    const input = migrationLedgerSchema.parse({
      schemaVersion: 1,
      baseline: {
        repository: 'AnsonHui6040/ramen-style-today',
        commit: 'b'.repeat(40),
      },
      entries: [{
        batch: '2B',
        status: 'in-progress',
        implementationPaths: [...batch2BImplementationPaths],
        verificationPaths: [...batch2BVerificationPaths],
        acceptanceMetadataPaths: [...batch2BAcceptanceMetadataPaths],
        fixtureManifestHash,
        legacySources: ['src/App.tsx'],
        ownedScopes: [],
        newOwners: ['packages/classification-core/src/persistence/contracts.ts'],
        transformation: 'Authenticated Batch 2B recording fixture.',
        behavior: 'no-production-runtime-change',
        verification: [],
      }],
    })
    writeFileSync(sourceFile, `${JSON.stringify(input, null, 2)}\n`)
    const requestedUrls: string[] = []

    await recordSuccessfulCiFile({
      batch: '2B',
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
      implementationSha: candidateSha,
      fixtureManifestHash,
    })
    expect(updated.entries[0]!.verification.map(({ gate }) => gate)).toEqual([
      'batch2b-local-verify',
      'batch2b-remote-ci',
    ])
    expect(requestedUrls).toEqual([runApiUrl, workflowApiUrl])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})
