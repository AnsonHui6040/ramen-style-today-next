import { createHash } from 'node:crypto'
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  assertNoFollowPath,
  createAuthoringEnvironment,
  runFixtureAuthoring,
  trustedTools,
} from './authoring.js'
import * as authoringModule from './authoring.js'
import type {
  AuthoringEnvironment,
  FixtureAuthoringAdapter,
  InstrumentationTransactionDescriptor,
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
const originalTrustedTools = { ...trustedTools }
const commit = 'a'.repeat(40)
const treeHash = 'b'.repeat(40)
const originalApp = 'export default function App() { return null }\n'
const patchedApp = 'export default function App() { return "instrumented" }\n'
const patchedTest = 'export const observer = true\n'
const styleObservationPath = 'src/parity-style-observer.test.ts'
const styleObservation = 'export const styleObserver = true\n'

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

function addedObservationPatch(
  path = styleObservationPath,
  content = styleObservation,
) {
  return [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    `index ${'0'.repeat(40)}..${gitBlobHash(content)}`,
    '--- /dev/null',
    `+++ b/${path}`,
    '@@ -0,0 +1 @@',
    `+${content.trimEnd()}`,
    '',
  ].join('\n')
}

type DependencyManifestEntry =
  | { readonly path: string; readonly type: 'directory' }
  | { readonly path: string; readonly type: 'regular-file'; readonly sha256: string }
  | { readonly path: string; readonly type: 'symbolic-link'; readonly target: string }

function stableValueForTest(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValueForTest)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, child]) => [key, stableValueForTest(child)]))
  }
  return value
}

function dependencyManifestHashForTest(root: string) {
  const entries: DependencyManifestEntry[] = []
  const visit = (directory: string, prefix: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      const relativePath = prefix ? `${prefix}/${name}` : name
      const stats = lstatSync(path)
      if (stats.isDirectory()) {
        entries.push({ path: relativePath, type: 'directory' })
        visit(path, relativePath)
      } else if (stats.isFile()) {
        entries.push({
          path: relativePath,
          type: 'regular-file',
          sha256: sha256(readFileSync(path)),
        })
      } else if (stats.isSymbolicLink()) {
        entries.push({
          path: relativePath,
          type: 'symbolic-link',
          target: readlinkSync(path),
        })
      } else {
        throw new Error('unsupported test dependency entry')
      }
    }
  }
  visit(root, '')
  const bytes = `${JSON.stringify(stableValueForTest(entries), null, 2)}\n`
  return sha256(bytes)
}

interface CopyValidatedFixture {
  readonly environment: AuthoringEnvironment
  readonly legacyRoot: string
  readonly sourceDependencies: string
  readonly spawnRecords: SpawnRequest[]
}

function fakeCopyValidatedFixture(input: {
  readonly events?: string[]
  readonly targetPath?: string
  readonly descriptorTargets?: readonly { readonly path: string; readonly status: ' M' | '??' }[]
  readonly extractionTestPath?: string
  readonly policyOverrides?: Readonly<Record<string, unknown>>
  readonly afterDependencyCopy?: (paths: {
    readonly source: string
    readonly destination: string
  }) => void
  readonly onRole?: (request: SpawnRequest, sourceDependencies: string) => void
  readonly failRole?: SpawnRequest['role']
  readonly substitutedTool?: 'node' | 'sandboxExec'
} = {}): CopyValidatedFixture {
  const root = mkdtempSync(join(process.cwd(), '.shared-authoring-copy-test-'))
  roots.push(root)
  const sharedToolPaths = {
    git: join(root, 'tools/git'),
    node: join(root, 'tools/node'),
    npmCli: join(root, 'tools/npm-cli.js'),
    sandboxExec: join(root, 'tools/sandbox-exec'),
  }
  for (const path of Object.values(sharedToolPaths)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '#!/bin/sh\nexit 1\n', { mode: 0o700 })
  }
  Object.assign(trustedTools, sharedToolPaths)
  const legacyRoot = join(root, 'legacy')
  const toolRoot = join(root, 'authoring')
  const destination = join(toolRoot, 'fixtures/fake-v1')
  const patchPath = join(toolRoot, 'instrumentation.patch')
  const seedsPath = join(toolRoot, 'seeds.json')
  const authoringPath = join(toolRoot, 'fake-authoring.ts')
  const sourcePath = join(legacyRoot, 'src/App.tsx')
  const lockfilePath = join(legacyRoot, 'package-lock.json')
  const sourceDependencies = join(legacyRoot, 'node_modules')
  const installedLockfile = join(sourceDependencies, '.package-lock.json')
  const vitest = join(sourceDependencies, 'vitest/vitest.mjs')
  const vitestLink = join(sourceDependencies, '.bin/vitest')
  const targetPath = input.targetPath ?? styleObservationPath
  const substitutePath = input.substitutedTool
    ? join(root, `tools/substitute-${input.substitutedTool}`)
    : undefined
  const toolPaths = {
    ...sharedToolPaths,
    ...(input.substitutedTool && substitutePath
      ? { [input.substitutedTool]: substitutePath }
      : {}),
  }
  for (const path of [
    sourcePath,
    patchPath,
    seedsPath,
    authoringPath,
    installedLockfile,
    vitest,
    vitestLink,
  ]) mkdirSync(dirname(path), { recursive: true })
  writeFileSync(sourcePath, originalApp)
  writeFileSync(lockfilePath, '{"lockfileVersion":3}\n')
  writeFileSync(patchPath, addedObservationPatch(targetPath))
  writeFileSync(seedsPath, '{"seeds":[{"id":"case-a"}]}\n')
  writeFileSync(authoringPath, '// fake authoring source\n')
  writeFileSync(installedLockfile, '{"installed":true}\n')
  writeFileSync(vitest, '// fake vitest\n')
  symlinkSync('../vitest/vitest.mjs', vitestLink)
  if (substitutePath) {
    mkdirSync(dirname(substitutePath), { recursive: true })
    writeFileSync(substitutePath, '#!/bin/sh\nexit 1\n', { mode: 0o700 })
  }

  const events = input.events ?? []
  const spawnRecords: SpawnRequest[] = []
  const spawn = async (request: SpawnRequest) => {
    spawnRecords.push(structuredClone(request))
    input.onRole?.(request, sourceDependencies)
    if (request.role === input.failRole) {
      return { stdout: '', stderr: `${request.role} failed`, exitCode: 1 }
    }
    if (request.role === 'git-version') return { stdout: 'git version 2.50.1\n' }
    if (request.role === 'node-version') return { stdout: 'v24.14.0\n' }
    if (request.role === 'npm-version' || request.role === 'npm-ci') {
      throw new Error(`copy-validated invoked forbidden role ${request.role}`)
    }
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
      const addedPath = join(request.cwd, targetPath)
      mkdirSync(dirname(addedPath), { recursive: true })
      writeFileSync(addedPath, styleObservation)
      return { stdout: '' }
    }
    if (request.role === 'patch-diff-check') return { stdout: '' }
    if (request.role === 'patch-diff-files') return { stdout: `?? ${targetPath}\0` }
    if (request.role === 'legacy-full-suite') {
      events.push('full-suite')
      expect(readlinkSync(join(request.cwd, 'node_modules/.bin/vitest')))
        .toBe('../vitest/vitest.mjs')
      return { stdout: 'Tests passed\n' }
    }
    if (request.role === 'legacy-network-denied-extraction') {
      events.push('extraction')
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

  const instrumentation = {
    targets: input.descriptorTargets ?? [{ path: targetPath, status: '??' as const }],
    extractionTestPath: input.extractionTestPath ?? targetPath,
    dependencyProvisioning: {
      kind: 'copy-validated' as const,
      sourcePath: 'node_modules',
      installedLockfilePath: 'node_modules/.package-lock.json',
      installedLockfileHash: sha256(readFileSync(installedLockfile)),
      dependencyTreeHash: dependencyManifestHashForTest(sourceDependencies),
      ...input.policyOverrides,
    },
  }
  const environment = createAuthoringEnvironment({
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
    },
    instrumentation,
    spawn,
    hooks: {
      afterDependencyCopy: input.afterDependencyCopy,
    },
  } as unknown as Parameters<typeof createAuthoringEnvironment>[0]) as unknown as AuthoringEnvironment

  return { environment, legacyRoot, sourceDependencies, spawnRecords }
}

function fakeEnvironment(input: {
  readonly events: string[]
  readonly spawnRecords?: SpawnRequest[]
  readonly instrumentation?: InstrumentationTransactionDescriptor
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
    ...(input.instrumentation ? { instrumentation: input.instrumentation } : {}),
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
  Object.assign(trustedTools, originalTrustedTools)
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

test('uses a generic added observation target with copy-validated dependencies', async () => {
  const events: string[] = []
  const fixture = fakeCopyValidatedFixture({ events })

  const result = await runFixtureAuthoring(
    fixture.environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { verifyOnly: true },
  )

  expect(result.status).toBe('verified')
  expect(events).toEqual(['full-suite', 'extraction'])
  expect(fixture.spawnRecords.map(({ role }) => role)).not.toContain('npm-version')
  expect(fixture.spawnRecords.map(({ role }) => role)).not.toContain('npm-ci')

  const fullSuite = fixture.spawnRecords.find(({ role }) => role === 'legacy-full-suite')
  const extraction = fixture.spawnRecords.find(
    ({ role }) => role === 'legacy-network-denied-extraction',
  )
  if (!fullSuite || !extraction) throw new Error('missing sandbox command records')
  const expectedEnvironmentKeys = [
    'CI',
    'GIT_CONFIG_NOSYSTEM',
    'HOME',
    'LANG',
    'LC_ALL',
    'PATH',
    'RAMEN_PARITY_SEED',
    'TMPDIR',
    'TZ',
  ]
  const expectedPrefix = [
    '-p',
    '(version 1)(allow default)(deny network*)',
    fixture.environment.tools.node,
    join(fullSuite.cwd, 'node_modules/vitest/vitest.mjs'),
    'run',
  ]
  expect(fullSuite.executable).toBe(fixture.environment.tools.sandboxExec)
  expect(extraction.executable).toBe(fixture.environment.tools.sandboxExec)
  expect(fullSuite.args).toEqual(expectedPrefix)
  expect(extraction.args).toEqual([...expectedPrefix, styleObservationPath])
  for (const request of [fullSuite, extraction]) {
    expect(Object.keys(request.environment).sort()).toEqual(expectedEnvironmentKeys)
    expect(request.environment).toMatchObject({
      CI: '1',
      GIT_CONFIG_NOSYSTEM: '1',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      PATH: `${dirname(fixture.environment.tools.node)}:/usr/bin:/bin`,
      TZ: 'UTC',
    })
    const bounded = request as SpawnRequest & {
      readonly deadlineMs?: number
      readonly terminationGraceMs?: number
    }
    expect(bounded.deadlineMs).toBe(120_000)
    expect(bounded.terminationGraceMs).toBe(2_000)
  }
  expect(fullSuite.environment.RAMEN_PARITY_SEED).toBe('')
  expect(extraction.environment.RAMEN_PARITY_SEED).toMatch(/capability-[a-f0-9]+\.json$/)
})

test('uses isolated regular-file trusted tool doubles for copy-validated fixtures', () => {
  const fixture = fakeCopyValidatedFixture()
  const root = dirname(fixture.legacyRoot)

  for (const tool of Object.values(fixture.environment.tools)) {
    expect(tool.startsWith(`${root}/`)).toBe(true)
    const stats = lstatSync(tool)
    expect(stats.isFile()).toBe(true)
    expect(stats.isSymbolicLink()).toBe(false)
  }
})

test('rejects unsafe, duplicate, or undeclared instrumentation paths', () => {
  const invalidDescriptors = [
    {
      descriptorTargets: [{ path: '../escape.test.ts', status: '??' as const }],
      extractionTestPath: '../escape.test.ts',
    },
    {
      descriptorTargets: [
        { path: styleObservationPath, status: '??' as const },
        { path: styleObservationPath, status: '??' as const },
      ],
      extractionTestPath: styleObservationPath,
    },
    {
      descriptorTargets: [{ path: styleObservationPath, status: '??' as const }],
      extractionTestPath: 'src/not-declared.test.ts',
    },
  ]

  for (const descriptor of invalidDescriptors) {
    expect(() => fakeCopyValidatedFixture(descriptor)).toThrow(/instrumentation descriptor/)
  }
})

test('binds copy-validated commands to the shared trusted Node and sandbox', () => {
  for (const substitutedTool of ['node', 'sandboxExec'] as const) {
    expect(() => fakeCopyValidatedFixture({ substitutedTool }))
      .toThrow('copy-validated requires shared trusted executables')
  }
})

test('rejects unknown and cross-arm dependency policy keys', () => {
  for (const policyOverrides of [
    { npmVersion: '11.12.1' },
    { args: ['--network-enabled'] },
    { kind: 'npm-ci' },
  ]) {
    expect(() => fakeCopyValidatedFixture({ policyOverrides }))
      .toThrow(/invalid .* dependency policy keys/)
  }

  for (const dependencyProvisioning of [
    { kind: 'npm-ci', args: ['--network-enabled'] },
    { kind: 'npm-ci', dependencyTreeHash: '0'.repeat(64) },
  ]) {
    const instrumentation = {
      targets: [
        { path: 'src/App.tsx', status: ' M' },
        { path: 'src/parity-question-extractor.test.tsx', status: '??' },
      ],
      extractionTestPath: 'src/parity-question-extractor.test.tsx',
      dependencyProvisioning,
    } as unknown as InstrumentationTransactionDescriptor
    expect(() => fakeEnvironment({ events: [], instrumentation }))
      .toThrow('invalid npm-ci dependency policy keys')
  }
})

test('rejects a descriptor target set that disagrees with the patch', async () => {
  const fixture = fakeCopyValidatedFixture({
    descriptorTargets: [
      { path: 'src/App.tsx', status: ' M' },
      { path: styleObservationPath, status: '??' },
    ],
  })

  await expect(runFixtureAuthoring(
    fixture.environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { verifyOnly: true },
  )).rejects.toThrow('instrumentation patch content mismatch')
})

test('rejects installed-lock and dependency-manifest hash drift', async () => {
  for (const policyOverrides of [
    { installedLockfileHash: '0'.repeat(64) },
    { dependencyTreeHash: '0'.repeat(64) },
  ]) {
    const fixture = fakeCopyValidatedFixture({ policyOverrides })
    await expect(runFixtureAuthoring(
      fixture.environment,
      fakeAdapter([{ id: 'case-a', observed: true }]),
      { verifyOnly: true },
    )).rejects.toThrow(/dependency (?:lock|tree) hash mismatch/)
  }
})

test('rejects escaping, absolute, broken, and special dependency entries', async () => {
  for (const target of ['../../escape', '/tmp/escape', '../missing']) {
    const fixture = fakeCopyValidatedFixture()
    const link = join(fixture.sourceDependencies, '.bin/vitest')
    unlinkSync(link)
    symlinkSync(target, link)
    await expect(runFixtureAuthoring(
      fixture.environment,
      fakeAdapter([{ id: 'case-a', observed: true }]),
      { verifyOnly: true },
    )).rejects.toThrow(/dependency symbolic link/)
  }

  const fixture = fakeCopyValidatedFixture()
  const fifo = join(fixture.sourceDependencies, 'unsupported.fifo')
  const result = spawnSync('/usr/bin/mkfifo', [fifo])
  expect(result.status).toBe(0)
  await expect(runFixtureAuthoring(
    fixture.environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { verifyOnly: true },
  )).rejects.toThrow('unsupported dependency entry')
})

test('rejects a destination dependency manifest mismatch before legacy code runs', async () => {
  const events: string[] = []
  const fixture = fakeCopyValidatedFixture({
    events,
    afterDependencyCopy: ({ destination }) => {
      writeFileSync(join(destination, 'injected.js'), 'injected')
    },
  })

  await expect(runFixtureAuthoring(
    fixture.environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { verifyOnly: true },
  )).rejects.toThrow('destination dependency manifest mismatch')
  expect(events).toEqual([])
})

test('revalidates source dependencies after copy and after each sandbox command', async () => {
  const afterCopy = fakeCopyValidatedFixture({
    afterDependencyCopy: ({ source }) => {
      writeFileSync(join(source, 'after-copy.js'), 'drift')
    },
  })
  await expect(runFixtureAuthoring(
    afterCopy.environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { verifyOnly: true },
  )).rejects.toThrow('source dependency tree changed')

  const afterCommand = fakeCopyValidatedFixture({
    onRole: (request, source) => {
      if (request.role === 'legacy-full-suite') {
        writeFileSync(join(source, 'after-command.js'), 'drift')
      }
    },
  })
  await expect(runFixtureAuthoring(
    afterCommand.environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { verifyOnly: true },
  )).rejects.toThrow('source dependency tree changed')
})

test('revalidates source dependencies during cleanup after command failure', async () => {
  const fixture = fakeCopyValidatedFixture({
    failRole: 'legacy-full-suite',
    onRole: (request, source) => {
      if (request.role === 'legacy-full-suite') {
        writeFileSync(join(source, 'failure-drift.js'), 'drift')
      }
    },
  })

  await expect(runFixtureAuthoring(
    fixture.environment,
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { verifyOnly: true },
  )).rejects.toThrow(/cleanup: source dependency tree changed/)
})

test('terminates a timed-out sandbox process group and escalates to SIGKILL', async () => {
  const root = mkdtempSync(join(process.cwd(), '.shared-authoring-timeout-test-'))
  roots.push(root)
  const marker = join(root, 'sigterm-marker')
  const script = join(root, 'hang.mjs')
  writeFileSync(script, [
    "import { writeFileSync } from 'node:fs'",
    'process.on(\'SIGTERM\', () => writeFileSync(process.argv[2], \'received\'))',
    'setInterval(() => {}, 1_000)',
    '',
  ].join('\n'))
  const spawnAuthoringCommand = (
    authoringModule as typeof authoringModule & {
      readonly spawnAuthoringCommand?: (request: SpawnRequest) => Promise<unknown>
    }
  ).spawnAuthoringCommand
  expect(spawnAuthoringCommand).toBeTypeOf('function')
  if (!spawnAuthoringCommand) return

  await expect(spawnAuthoringCommand({
    role: 'legacy-full-suite',
    executable: process.execPath,
    args: [script, marker],
    cwd: root,
    environment: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    deadlineMs: 300,
    terminationGraceMs: 50,
  } as SpawnRequest)).rejects.toThrow('deadline')
  expect(readFileSync(marker, 'utf8')).toBe('received')
})
