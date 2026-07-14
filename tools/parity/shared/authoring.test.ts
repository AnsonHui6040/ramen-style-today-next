import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  assertNoFollowPath,
  createAuthoringEnvironment,
  runFixtureAuthoring,
} from './authoring.js'
import type {
  AuthoringEnvironment,
  FixtureAuthoringAdapter,
  SpawnRequest,
} from './contracts.js'

interface FakeSeed {
  readonly id: string
}

interface FakeCase {
  readonly id: string
  readonly observed: boolean
}

interface FakeManifest {
  readonly caseIds: readonly string[]
  readonly fixtureContentHash: string
}

const roots: string[] = []
const commit = 'a'.repeat(40)
const treeHash = 'b'.repeat(40)
const originalApp = 'export default function App() { return null }\n'
const patchedApp = 'export default function App() { return "instrumented" }\n'
const patchedTest = 'export const observer = true\n'

function sha256(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex')
}

function gitBlobHash(content: string) {
  return createHash('sha1')
    .update(`blob ${Buffer.byteLength(content)}\0`)
    .update(content)
    .digest('hex')
}

function instrumentationPatch() {
  return [
    'diff --git a/src/App.tsx b/src/App.tsx',
    `index ${gitBlobHash(originalApp)}..${gitBlobHash(patchedApp)} 100644`,
    '--- a/src/App.tsx',
    '+++ b/src/App.tsx',
    '@@ -1 +1 @@',
    `-${originalApp.trimEnd()}`,
    `+${patchedApp.trimEnd()}`,
    'diff --git a/src/parity-question-extractor.test.tsx b/src/parity-question-extractor.test.tsx',
    'new file mode 100644',
    `index ${'0'.repeat(40)}..${gitBlobHash(patchedTest)}`,
    '--- /dev/null',
    '+++ b/src/parity-question-extractor.test.tsx',
    '@@ -0,0 +1 @@',
    `+${patchedTest.trimEnd()}`,
    '',
  ].join('\n')
}

function fakeEnvironment(input: {
  readonly events: string[]
  readonly spawnRecords?: SpawnRequest[]
}): AuthoringEnvironment {
  const root = mkdtempSync(join(process.cwd(), '.shared-authoring-test-'))
  roots.push(root)
  const legacyRoot = join(root, 'legacy')
  const toolRoot = join(root, 'authoring')
  const destination = join(toolRoot, 'fixtures/fake-v1')
  const patchPath = join(toolRoot, 'instrumentation.patch')
  const seedsPath = join(toolRoot, 'seeds.json')
  const authoringPath = join(toolRoot, 'fake-authoring.ts')
  const sourcePath = join(legacyRoot, 'src/App.tsx')
  const lockfilePath = join(legacyRoot, 'package-lock.json')
  const toolPaths = {
    git: join(root, 'tools/git'),
    node: join(root, 'tools/node'),
    npmCli: join(root, 'tools/npm-cli.js'),
    sandboxExec: join(root, 'tools/sandbox-exec'),
  }
  for (const path of [sourcePath, patchPath, seedsPath, authoringPath, ...Object.values(toolPaths)]) {
    mkdirSync(dirname(path), { recursive: true })
  }
  writeFileSync(sourcePath, originalApp)
  writeFileSync(lockfilePath, '{"lockfileVersion":3}\n')
  writeFileSync(patchPath, instrumentationPatch())
  writeFileSync(seedsPath, '{"seeds":[{"id":"case-a"}]}\n')
  writeFileSync(authoringPath, '// fake authoring source\n')
  for (const path of Object.values(toolPaths)) {
    writeFileSync(path, '#!/bin/sh\nexit 1\n', { mode: 0o700 })
  }
  mkdirSync(destination, { recursive: true })
  writeFileSync(join(destination, 'cases.json'), 'old-cases')
  writeFileSync(join(destination, 'manifest.json'), 'old-manifest')

  const spawn = async (request: SpawnRequest) => {
    input.spawnRecords?.push(structuredClone(request))
    if (request.role === 'git-version') return { stdout: 'git version 2.50.1\n' }
    if (request.role === 'node-version') return { stdout: 'v24.14.0\n' }
    if (request.role === 'npm-version') return { stdout: '11.12.1\n' }
    if (request.role === 'legacy-remote') {
      return { stdout: 'git@github.com:AnsonHui6040/ramen-style-today.git\n' }
    }
    if (request.role === 'legacy-head') return { stdout: `${commit}\n` }
    if (request.role === 'legacy-tree') return { stdout: `${treeHash}\n` }
    if (request.role === 'legacy-status') return { stdout: '' }
    if (request.role === 'git-worktree-add') {
      const worktree = request.args.at(-2)!
      mkdirSync(join(worktree, 'src'), { recursive: true })
      cpSync(sourcePath, join(worktree, 'src/App.tsx'))
      cpSync(lockfilePath, join(worktree, 'package-lock.json'))
      return { stdout: '' }
    }
    if (request.role === 'patch-check') return { stdout: '' }
    if (request.role === 'patch-apply') {
      writeFileSync(join(request.cwd, 'src/App.tsx'), patchedApp)
      writeFileSync(join(request.cwd, 'src/parity-question-extractor.test.tsx'), patchedTest)
      return { stdout: '' }
    }
    if (request.role === 'patch-diff-check') return { stdout: '' }
    if (request.role === 'patch-diff-files') {
      return { stdout: ' M src/App.tsx\0?? src/parity-question-extractor.test.tsx\0' }
    }
    if (request.role === 'npm-ci') {
      mkdirSync(join(request.cwd, 'node_modules/vitest'), { recursive: true })
      writeFileSync(join(request.cwd, 'node_modules/vitest/vitest.mjs'), '// fake vitest\n')
      return { stdout: '' }
    }
    if (request.role === 'legacy-full-suite') return { stdout: 'Tests passed\n' }
    if (request.role === 'legacy-network-denied-extraction') {
      const capability = JSON.parse(
        readFileSync(request.environment.RAMEN_PARITY_SEED!, 'utf8'),
      ) as { rawOutputPath: string }
      writeFileSync(capability.rawOutputPath, JSON.stringify({
        cases: [{ id: 'case-a', observed: true }],
      }))
      return { stdout: 'Tests passed\n' }
    }
    if (request.role === 'git-worktree-remove') {
      rmSync(request.args.at(-1)!, { recursive: true, force: true })
      return { stdout: '' }
    }
    if (request.role === 'git-worktree-prune') return { stdout: '' }
    throw new Error(`unexpected spawn role ${request.role}`)
  }

  return createAuthoringEnvironment({
    legacyRoot,
    toolRoot,
    destination,
    patchPath,
    seedsPath,
    authoringSources: [{ relativePath: 'fake-authoring.ts', path: authoringPath }],
    tools: toolPaths,
    expected: {
      identity: {
        host: 'github.com',
        owner: 'AnsonHui6040',
        repository: 'ramen-style-today',
      },
      commit,
      treeHash,
      trackedSourceHashes: { 'src/App.tsx': sha256(originalApp) },
      lockfilePath: 'package-lock.json',
      lockfileHash: sha256(readFileSync(lockfilePath)),
      patchHash: sha256(readFileSync(patchPath)),
      seedsHash: sha256(readFileSync(seedsPath)),
      nodeVersion: '24.14.0',
      npmVersion: '11.12.1',
    },
    spawn,
    hooks: {
      afterPublishStaging: () => input.events.push('target-installed'),
      beforeReleaseLock: () => input.events.push('release-commit'),
      beforeRemoveBackup: () => input.events.push('backup-cleanup'),
    },
  })
}

function fakeAdapter(
  cases: readonly FakeCase[],
  onValidate?: () => void,
): FixtureAuthoringAdapter<
  FakeSeed,
  FakeCase,
  FakeManifest
> {
  return {
    parseSeeds: (input) => (input as { seeds: readonly FakeSeed[] }).seeds,
    parseRawCases: () => cases,
    validateCases: (received, seeds) => {
      onValidate?.()
      expect(received.map(({ id }) => id)).toEqual(seeds.map(({ id }) => id))
      return received
    },
    buildManifest: ({ cases: received, fixtureContentHash }) => ({
      caseIds: received.map(({ id }) => id),
      fixtureContentHash,
    }),
    serializeCases: (received) => Buffer.from(JSON.stringify({ cases: received })),
    serializeManifest: (manifest) => Buffer.from(JSON.stringify(manifest)),
  }
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

test('validates the installed target before releasing the publication lock', async () => {
  const events: string[] = []
  const result = await runFixtureAuthoring(
    fakeEnvironment({ events }),
    fakeAdapter([{ id: 'case-a', observed: true }], () => {
      if (events.at(-1) === 'target-installed') {
        events.push('installed-target-validated')
      }
    }),
    { replace: true, verifyOnly: false },
  )
  expect(result.published).toBe(true)
  expect(events).toEqual([
    'target-installed',
    'installed-target-validated',
    'release-commit',
    'backup-cleanup',
  ])
})

test('rejects a concurrent author before extraction starts', async () => {
  const environment = fakeEnvironment({ events: [] })
  const lock = join(
    dirname(environment.destination),
    `.${basename(environment.destination)}.lock`,
  )
  writeFileSync(lock, 'another author\n')

  await expect(runFixtureAuthoring(
    environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { replace: true, verifyOnly: false },
  )).rejects.toThrow('extraction lock is already held')
})

test('rolls back the previous target while retaining lock ownership', async () => {
  const events: string[] = []
  const environment = fakeEnvironment({ events })
  const hooks = environment.hooks as AuthoringEnvironment['hooks'] & {
    beforePublishStaging?: (path: string) => void
    beforeRollback?: (path: string) => void
  }
  hooks.beforePublishStaging = () => {
    throw new Error('publication seam failed')
  }
  hooks.beforeRollback = () => events.push('rollback-under-lock')

  await expect(runFixtureAuthoring(
    environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { replace: true, verifyOnly: false },
  )).rejects.toThrow('publication seam failed')
  expect(events).toContain('rollback-under-lock')
  expect(readFileSync(join(environment.destination, 'manifest.json'), 'utf8'))
    .toBe('old-manifest')
})

test('does not attempt unlocked rollback after indeterminate lock release', async () => {
  const environment = fakeEnvironment({ events: [] })
  let rollbackCalls = 0
  const hooks = environment.hooks as AuthoringEnvironment['hooks'] & {
    beforeReleaseLock?: (path: string) => void
    beforeRollback?: (path: string) => void
  }
  hooks.beforeReleaseLock = (path) => unlinkSync(path)
  hooks.beforeRollback = () => {
    rollbackCalls += 1
  }

  await expect(runFixtureAuthoring(
    environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { replace: true, verifyOnly: false },
  )).rejects.toThrow('publication lock release is indeterminate; recovery required')
  expect(rollbackCalls).toBe(0)
})

test('rejects symbolic links at the no-follow boundary', () => {
  const root = mkdtempSync(join(process.cwd(), '.shared-authoring-symlink-test-'))
  roots.push(root)
  const target = join(root, 'target')
  const link = join(root, 'link')
  writeFileSync(target, 'target')
  symlinkSync(target, link)

  expect(() => assertNoFollowPath(link, {
    kind: 'file',
    allowMissingLeaf: false,
  })).toThrow('symbolic link')
})

test('keeps npm config isolated and extraction network denied', async () => {
  const spawnRecords: SpawnRequest[] = []
  const environment = fakeEnvironment({ events: [], spawnRecords })

  await runFixtureAuthoring(
    environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { verifyOnly: true },
  )

  const npm = spawnRecords.find(({ role }) => role === 'npm-ci')
  const extraction = spawnRecords.find(
    ({ role }) => role === 'legacy-network-denied-extraction',
  )
  expect(npm?.args).toEqual([environment.tools.npmCli, 'ci', '--ignore-scripts'])
  expect(npm?.environment.NPM_CONFIG_USERCONFIG)
    .not.toBe(npm?.environment.NPM_CONFIG_GLOBALCONFIG)
  expect(extraction?.args.slice(0, 2)).toEqual([
    '-p',
    '(version 1)(allow default)(deny network*)',
  ])
})

test('preserves original ignored cache fingerprints', async () => {
  const environment = fakeEnvironment({ events: [] })
  const cache = join(environment.legacyRoot, 'node_modules/.tmp')
  mkdirSync(cache, { recursive: true })
  writeFileSync(join(cache, 'tsconfig.app.tsbuildinfo'), 'app-cache')
  writeFileSync(join(cache, 'tsconfig.node.tsbuildinfo'), 'node-cache')

  const result = await runFixtureAuthoring(
    environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { verifyOnly: true },
  )
  expect(result.ignoredFingerprintsAfter).toEqual(result.ignoredFingerprintsBefore)
})

test('retains a verified recovery archive when backup cleanup fails', async () => {
  const environment = fakeEnvironment({ events: [] })
  const hooks = environment.hooks as AuthoringEnvironment['hooks'] & {
    beforeRemoveBackup?: (path: string) => void
  }
  hooks.beforeRemoveBackup = () => {
    throw new Error('persistent backup cleanup failure')
  }

  const result = await runFixtureAuthoring(
    environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { replace: true, verifyOnly: false },
  )

  expect(result.status).toBe('published-with-cleanup-warning')
  if (result.status !== 'published-with-cleanup-warning') {
    throw new Error('missing cleanup warning')
  }
  const recovery = JSON.parse(
    readFileSync(result.warning.recoveryBackupPath, 'utf8'),
  ) as { entries: Array<{ path: string; type: string; contentBase64?: string }> }
  expect(recovery.entries).toContainEqual({
    path: 'manifest.json',
    type: 'file',
    contentBase64: Buffer.from('old-manifest').toString('base64'),
  })
})
