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

import { migrationLedgerSchema } from './ledger-schema.js'
import { recordSuccessfulCiFile } from './record-ci.js'

const candidateSha = 'a'.repeat(40)
const runApiUrl = 'https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/runs/123'
const workflowApiUrl = 'https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/workflows/ci.yml'

function response(url: string, payload: unknown) {
  return {
    ok: true,
    status: 200,
    redirected: false,
    url,
    json: async () => payload,
  } as Response
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
        verification: [],
      }],
    })
    writeFileSync(sourceFile, `${JSON.stringify(input, null, 2)}\n`)
    const inodeBefore = lstatSync(sourceFile).ino
    const requestedUrls: string[] = []

    await recordSuccessfulCiFile({
      batch: '1',
      expectedCandidateSha: candidateSha,
      fetchImplementation: (async (request: string | URL | globalThis.Request) => {
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
      }) as typeof fetch,
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
