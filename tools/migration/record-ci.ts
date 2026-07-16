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
  assertAuthenticatedSuccessfulCiRun,
  type AuthenticatedSuccessfulCiRun,
  verifySuccessfulCiProof,
} from '../acceptance/verify-acceptance.js'
import { migrationLedgerSchema } from './ledger-schema.js'

export interface RecordSuccessfulCiFileInput {
  batch: string
  expectedCandidateSha: string
  fetchImplementation: typeof fetch
  githubToken?: string | undefined
  proofInput: unknown
  repoRoot: string
  sourceFile: string
}

export function recordSuccessfulCi(
  input: unknown,
  batch: string,
  verifiedRun: AuthenticatedSuccessfulCiRun,
) {
  const ledger = migrationLedgerSchema.parse(input)
  assertAuthenticatedSuccessfulCiRun(verifiedRun)
  if (batch === '2A-maintenance') {
    const target = ledger.entries.find((entry) => entry.batch === '2A')
    if (!target?.maintenance) throw new Error('Unknown ledger target 2A-maintenance')
    if (target.maintenance.status !== 'in-progress') {
      throw new Error('Batch 2A maintenance is not in progress')
    }
    return migrationLedgerSchema.parse({
      ...ledger,
      entries: ledger.entries.map((entry) => entry.batch === '2A' ? {
        ...entry,
        maintenance: {
          ...entry.maintenance,
          status: 'complete',
          maintenanceSha: verifiedRun.sha,
          verification: [
            {
              gate: 'batch2a-maintenance-local-verify',
              command: 'npm run verify',
              outcome: 'passed',
              evidence: 'all approved Batch 2A maintenance invariant and verification gates passed',
            },
            {
              gate: 'batch2a-maintenance-remote-ci',
              command: 'GitHub Actions CI / verify',
              outcome: 'passed',
              evidence: 'the pushed maintenance candidate completed the Node 24 verify job successfully',
              commitSha: verifiedRun.sha,
              runUrl: verifiedRun.runUrl,
            },
          ],
        },
      } : entry),
    })
  }
  if (batch === '2B-boundary-maintenance') {
    const target = ledger.entries.find((entry) => entry.batch === '2B')
    if (!target?.boundaryMaintenance) {
      throw new Error('Unknown ledger target 2B-boundary-maintenance')
    }
    if (target.boundaryMaintenance.status !== 'in-progress') {
      throw new Error('Batch 2B boundary maintenance is not in progress')
    }
    return migrationLedgerSchema.parse({
      ...ledger,
      entries: ledger.entries.map((entry) => entry.batch === '2B' ? {
        ...entry,
        boundaryMaintenance: {
          ...entry.boundaryMaintenance,
          status: 'complete',
          maintenanceSha: verifiedRun.sha,
          verification: [
            {
              gate: 'batch2b-boundary-maintenance-local-verify',
              command: 'npm run verify',
              outcome: 'passed',
              evidence: 'all approved Batch 2B boundary-maintenance gates passed',
            },
            {
              gate: 'batch2b-boundary-maintenance-remote-ci',
              command: 'GitHub Actions CI / verify',
              outcome: 'passed',
              evidence: 'the pushed boundary-maintenance candidate completed Node 24 CI',
              commitSha: verifiedRun.sha,
              runUrl: verifiedRun.runUrl,
            },
          ],
        },
      } : entry),
    })
  }
  if (batch === '2B') {
    const target = ledger.entries.find((entry) => entry.batch === '2B')
    if (!target) throw new Error('Unknown ledger batch 2B')
    if (target.status !== 'in-progress') throw new Error('Batch 2B is not in progress')
    return migrationLedgerSchema.parse({
      ...ledger,
      entries: ledger.entries.map((entry) => entry.batch === '2B' ? {
        ...entry,
        status: 'complete',
        implementationSha: verifiedRun.sha,
        verification: [
          {
            gate: 'batch2b-local-verify',
            command: 'npm run verify',
            outcome: 'passed',
            evidence: 'all Batch 2B offline implementation and verification gates passed',
          },
          {
            gate: 'batch2b-remote-ci',
            command: 'GitHub Actions CI / verify',
            outcome: 'passed',
            evidence: 'the exact Batch 2B implementation candidate passed Node 24 CI',
            commitSha: verifiedRun.sha,
            runUrl: verifiedRun.runUrl,
          },
        ],
      } : entry),
    })
  }
  if (batch === '3A') {
    const target = ledger.entries.find((entry) => entry.batch === '3A')
    if (!target) throw new Error('Unknown ledger batch 3A')
    if (target.status !== 'in-progress') throw new Error('Batch 3A is not in progress')
    const batch2B = ledger.entries.find((entry) => entry.batch === '2B')
    if (!batch2B?.persistenceIdentityMaintenance) {
      throw new Error('Batch 3A requires Batch 2B persistence identity maintenance')
    }
    if (batch2B.persistenceIdentityMaintenance.status !== 'in-progress') {
      throw new Error('Batch 2B persistence identity maintenance is not in progress')
    }
    return migrationLedgerSchema.parse({
      ...ledger,
      entries: ledger.entries.map((entry) => {
        if (entry.batch === '2B') return {
          ...entry,
          persistenceIdentityMaintenance: {
            ...entry.persistenceIdentityMaintenance,
            status: 'complete',
            candidateSha: verifiedRun.sha,
            remoteEvidenceGate: 'batch3a-remote-ci',
            verification: [{
              gate: 'batch2b-persistence-identity-maintenance-local-verify',
              command: 'npm run verify',
              outcome: 'passed',
              evidence: 'the reviewed persistence identity payload passed the candidate gates',
            }],
          },
        }
        if (entry.batch === '3A') return {
          ...entry,
          status: 'complete',
          implementationSha: verifiedRun.sha,
          verification: [
            {
              gate: 'batch3a-local-verify',
              command: 'npm run verify',
              outcome: 'passed',
              evidence: 'all Batch 3A local candidate gates passed',
            },
            {
              gate: 'batch3a-remote-ci',
              command: 'GitHub Actions CI / verify',
              outcome: 'passed',
              evidence: 'the exact Batch 3A candidate passed canonical CI',
              commitSha: verifiedRun.sha,
              runUrl: verifiedRun.runUrl,
            },
          ],
        }
        return entry
      }),
    })
  }
  const target = ledger.entries.find((entry) => entry.batch === batch)
  if (!target) throw new Error(`Unknown ledger batch ${batch}`)
  if (target.status !== 'in-review') throw new Error(`Batch ${batch} is not in review`)
  const gate = `batch${batch.toLowerCase().replace(/[^a-z0-9]+/g, '')}-remote-ci`
  if (target.verification.some((item) => item.gate === gate)) {
    throw new Error(`Batch ${batch} already records remote CI`)
  }

  return migrationLedgerSchema.parse({
    ...ledger,
    entries: ledger.entries.map((entry) => entry.batch === batch ? {
      ...entry,
      status: 'complete',
      ...(batch === '2A' ? {
        implementationSha: verifiedRun.sha,
        incidents: ['docs/migration/incidents/2026-07-13-legacy-cache-isolation.md'],
      } : {}),
      verification: [
        ...entry.verification,
        {
          gate,
          command: 'GitHub Actions CI / verify',
          outcome: 'passed',
          evidence: 'the pushed acceptance candidate completed the Node 24 verify job successfully',
          commitSha: verifiedRun.sha,
          runUrl: verifiedRun.runUrl,
        },
      ],
    } : entry),
  })
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
  const ledgerInput = migrationLedgerSchema.parse(JSON.parse(readFileSync(
    input.sourceFile,
    'utf8',
  )) as unknown)
  const verifiedRun = await verifySuccessfulCiProof(
    input.proofInput,
    input.expectedCandidateSha,
    input.fetchImplementation,
    input.githubToken,
  )
  const updated = recordSuccessfulCi(ledgerInput, input.batch, verifiedRun)
  atomicWriteLedger(
    input.sourceFile,
    input.repoRoot,
    `${JSON.stringify(updated, null, 2)}\n`,
  )
  return updated
}
