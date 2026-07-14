import {
  closeSync,
  constants,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, test } from 'vitest'

import {
  assertNoFollowPath,
  createExtractorEnvironment,
  fingerprintIgnoredPath,
  normalizeGithubRepository,
  runLegacyExtractor,
  sanitizeExternalError,
  trustedTools,
  type CreateExtractorEnvironmentInput,
  type ExtractorEnvironment,
  type SpawnRequest,
} from './extractor.js'
import * as extractorModule from './extractor.js'
import * as extractModule from './extract.js'
import { parseExtractArguments, projectExtractorResultForCli } from './extract.js'

const roots: string[] = []
const hash = (character: string) => character.repeat(64)
const commit = 'a'.repeat(40)
const treeHash = 'b'.repeat(40)
const fixtureOriginalApp = 'export default function App() { return null }\n'
const fixturePatchedApp = 'export default function App() { return "instrumented" }\n'
const fixturePatchedTest = 'export const observer = true\n'
const publicationCleanupAttempts = 3

function gitBlobHash(content: string) {
  return createHash('sha1')
    .update(`blob ${Buffer.byteLength(content)}\0`)
    .update(content)
    .digest('hex')
}

function fixturePatch(appContent: string, testContent: string) {
  return [
    'diff --git a/src/App.tsx b/src/App.tsx',
    `index ${gitBlobHash(fixtureOriginalApp)}..${gitBlobHash(appContent)} 100644`,
    '--- a/src/App.tsx',
    '+++ b/src/App.tsx',
    '@@ -1 +1 @@',
    `-${fixtureOriginalApp.trimEnd()}`,
    `+${appContent.trimEnd()}`,
    'diff --git a/src/parity-question-extractor.test.tsx b/src/parity-question-extractor.test.tsx',
    'new file mode 100644',
    `index ${'0'.repeat(40)}..${gitBlobHash(testContent)}`,
    '--- /dev/null',
    '+++ b/src/parity-question-extractor.test.tsx',
    '@@ -0,0 +1 @@',
    `+${testContent.trimEnd()}`,
    '',
  ].join('\n')
}

const fixturePatchBytes = fixturePatch(fixturePatchedApp, fixturePatchedTest)
const alternateFixturePatchBytes = fixturePatch(
  'export default function App() { return "alternate" }\n',
  'export const observer = "alternate"\n',
)
const allowedEnvironmentKeys = [
  'CI',
  'GIT_CONFIG_NOSYSTEM',
  'HOME',
  'LANG',
  'LC_ALL',
  'NPM_CONFIG_CACHE',
  'NPM_CONFIG_GLOBALCONFIG',
  'NPM_CONFIG_USERCONFIG',
  'PATH',
  'RAMEN_PARITY_SEED',
  'TMPDIR',
  'TZ',
]

const seedCases = [{
  id: 'simple-case',
  actions: [
    { type: 'select', questionId: 'form', optionId: 'soup' },
    { type: 'continue', fromQuestionId: 'form' },
  ],
}]

const rawFrames = [
  {
    sequence: 0,
    transition: 'initial',
    displayedQuestionId: 'form',
    visibleOptionIds: ['soup', 'dry'],
    disabledOptionIds: [],
    pendingOptionIds: [],
    legacyAnswers: {},
  },
  {
    sequence: 1,
    transition: 'toggle',
    actionIndex: 0,
    displayedQuestionId: 'form',
    visibleOptionIds: ['soup', 'dry'],
    disabledOptionIds: [],
    pendingOptionIds: ['soup'],
    legacyAnswers: { form: 'soup' },
  },
  {
    sequence: 2,
    transition: 'submit',
    actionIndex: 1,
    displayedQuestionId: 'form',
    legacyAnswers: { form: 'soup' },
  },
  {
    sequence: 3,
    transition: 'next',
    actionIndex: 1,
    displayedQuestionId: 'archetype',
    navigation: { direction: 'next', reachedQuestionId: 'archetype' },
    legacyAnswers: { form: 'soup' },
  },
]

interface FixtureOptions {
  dirty?: boolean
  identity?: string
  reportedCommit?: string
  reportedTree?: string
  lockHash?: string
  sourceHash?: string
  patchHash?: string
  patchSurfaceOutput?: string
  rawMismatch?: 'count' | 'order' | 'id' | 'actions'
  inheritedEnvironment?: Record<string, string>
  inheritedHomeContainsExtractionRoot?: boolean
  failRole?: SpawnRequest['role']
  cleanupFailure?: boolean
  replaceExternalPatchAfterHash?: boolean
  postApplyContentMismatch?: boolean
}

interface ExtractorFixture {
  root: string
  legacyRoot: string
  destination: string
  originalNodeModules: string
  environment: ExtractorEnvironment
  spawnRecords: SpawnRequest[]
  originalFingerprintBefore: Awaited<ReturnType<typeof fingerprintIgnoredPath>>[]
  originalFingerprintAfter: () => Promise<Awaited<ReturnType<typeof fingerprintIgnoredPath>>[]>
  addOriginalNodeModulesWithTsBuildInfo: () => Promise<void>
  rewriteOriginalTsBuildInfo: () => void
  afterLegacySuite?: () => void
  runPaths: Array<{ staging: string; backup: string; extractionRoot: string }>
  authoringSourcePaths: Record<
    | 'tools/parity/questions/contracts.ts'
    | 'tools/parity/questions/extractor.ts'
    | 'tools/parity/questions/extract.ts',
    string
  >
}

function sha256File(file: string) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function publicationLockPath(destination: string) {
  return join(dirname(destination), `.${basename(destination)}.lock`)
}

function acquireCooperativePublicationLock(destination: string) {
  const lockPath = publicationLockPath(destination)
  const descriptor = openSync(
    lockPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  )
  writeFileSync(descriptor, 'cooperative-author\n')
  closeSync(descriptor)
  return lockPath
}

function expectCooperativePublicationLockHeld(destination: string) {
  try {
    const unexpectedLock = acquireCooperativePublicationLock(destination)
    unlinkSync(unexpectedLock)
  } catch (error) {
    expect((error as NodeJS.ErrnoException).code).toBe('EEXIST')
    return
  }
  throw new Error('second cooperative author acquired the publication lock')
}

function publicationDirectoryIdentity(path: string) {
  const stats = lstatSync(path)
  return { dev: stats.dev, ino: stats.ino, mode: stats.mode }
}

function publicationResidue(destination: string) {
  const outputName = basename(destination)
  return readdirSync(dirname(destination)).filter((name) => (
    name === `.${outputName}.lock`
    || name.startsWith(`.${outputName}.staging-`)
    || name.startsWith(`.${outputName}.backup-`)
    || name.startsWith(`.${outputName}.recovery-`)
  ))
}

function replaceWithByteIdenticalInode(path: string) {
  const before = lstatSync(path)
  const bytes = readFileSync(path)
  const replacement = `${path}.byte-identical-replacement`
  const copied = spawnSync('/bin/cp', ['-p', path, replacement], {
    encoding: 'utf8',
    shell: false,
  })
  if (copied.error) throw new Error(`test fixture copy failed: ${copied.error.message}`)
  if (copied.status !== 0) {
    throw new Error(
      `test fixture copy failed with status ${String(copied.status)}: ${copied.stderr.trim()}`,
    )
  }
  renameSync(replacement, path)
  const after = lstatSync(path)
  const proof = {
    bytesPreserved: readFileSync(path).equals(bytes),
    devicePreserved: before.dev === after.dev,
    modePreserved: before.mode === after.mode,
    sizePreserved: before.size === after.size,
    mtimePreserved: before.mtimeMs === after.mtimeMs,
    inodeChanged: before.ino !== after.ino,
  }
  if (Object.values(proof).some((value) => !value)) {
    throw new Error(`byte-identical inode replacement precondition failed: ${JSON.stringify(proof)}`)
  }
  return proof
}

interface FailedPublicationResult {
  readonly status: 'failed'
  readonly published: false
  readonly error: {
    readonly code: 'publication-failed' | 'recovery-required'
    readonly message: string
  }
}

type PublicExtractorResult = Awaited<ReturnType<typeof runLegacyExtractor>>
  | FailedPublicationResult

function getPublicRunBoundary() {
  const runBoundary = (extractorModule as unknown as {
    runLegacyExtractorCommand?: (
      environment: ExtractorEnvironment,
      options: { readonly replace?: boolean; readonly verifyOnly: boolean },
    ) => Promise<PublicExtractorResult>
  }).runLegacyExtractorCommand
  expect(runBoundary).toBeTypeOf('function')
  if (!runBoundary) throw new Error('missing public extractor run boundary')
  return runBoundary
}

async function createExtractorFixture(
  options: FixtureOptions = {},
): Promise<ExtractorFixture> {
  const root = mkdtempSync(join(process.cwd(), '.task9-extractor-test-'))
  roots.push(root)
  const fixtureToolRoot = join(root, 'trusted-tools')
  const fixtureTools = {
    git: join(fixtureToolRoot, 'git'),
    node: join(fixtureToolRoot, 'node'),
    npmCli: join(fixtureToolRoot, 'npm-cli.js'),
    sandboxExec: join(fixtureToolRoot, 'sandbox-exec'),
  }
  mkdirSync(fixtureToolRoot, { recursive: true })
  for (const [name, path] of Object.entries(fixtureTools)) {
    writeFileSync(path, `#!/bin/sh\n# physical fixture for ${name}\nexit 1\n`, {
      mode: 0o700,
    })
  }
  const legacyRoot = join(root, 'legacy')
  const toolRoot = join(root, 'authoring')
  const destination = join(toolRoot, 'tools/parity/fixtures/questions/legacy-v1')
  const patchPath = join(toolRoot, 'tools/parity/questions/legacy-instrumentation.patch')
  const seedsPath = join(toolRoot, 'tools/parity/questions/seeds.json')
  const authoringSourcePaths = {
    'tools/parity/questions/contracts.ts': join(
      toolRoot,
      'tools/parity/questions/contracts.ts',
    ),
    'tools/parity/questions/extractor.ts': join(
      toolRoot,
      'tools/parity/questions/extractor.ts',
    ),
    'tools/parity/questions/extract.ts': join(toolRoot, 'tools/parity/questions/extract.ts'),
  }
  const sourcePath = join(legacyRoot, 'src/App.tsx')
  const lockPath = join(legacyRoot, 'package-lock.json')
  mkdirSync(dirname(sourcePath), { recursive: true })
  mkdirSync(dirname(patchPath), { recursive: true })
  writeFileSync(sourcePath, fixtureOriginalApp)
  writeFileSync(lockPath, '{"lockfileVersion":3}\n')
  writeFileSync(patchPath, fixturePatchBytes)
  writeFileSync(seedsPath, `${JSON.stringify({ schemaVersion: 1, cases: seedCases }, null, 2)}\n`)
  for (const [path, sourcePath] of Object.entries(authoringSourcePaths)) {
    writeFileSync(sourcePath, `// deterministic fixture for ${path}\n`)
  }

  const spawnRecords: SpawnRequest[] = []
  const runPaths: ExtractorFixture['runPaths'] = []
  let afterLegacySuite: (() => void) | undefined
  const fixture = {} as ExtractorFixture

  const rawCases = () => {
    const cases = seedCases.map((seed, seedIndex) => ({
      seedIndex,
      id: seed.id,
      actions: structuredClone(seed.actions),
      frames: rawFrames,
    }))
    if (options.rawMismatch === 'count') cases.push(structuredClone(cases[0]!))
    if (options.rawMismatch === 'order') {
      cases.push({ ...structuredClone(cases[0]!), seedIndex: 1, id: 'second' })
      cases.reverse()
    }
    if (options.rawMismatch === 'id') cases[0]!.id = 'rewritten'
    if (options.rawMismatch === 'actions') cases[0]!.actions = [{
      type: 'select',
      questionId: 'form',
      optionId: 'dry',
    }]
    return cases
  }

  const spawn = async (request: SpawnRequest) => {
    spawnRecords.push(structuredClone(request))
    if (options.failRole === request.role) {
      if (request.role === 'git-worktree-add') {
        const worktree = request.args.at(-2)!
        mkdirSync(worktree, { recursive: true })
      }
      throw new Error('PRIMARY\n\u001b[31mexternal failure with secret /Users/person/key\u001b[0m')
    }
    if (request.role === 'git-version') return { stdout: 'git version 2.50.1 (Apple Git-155)\n' }
    if (request.role === 'node-version') return { stdout: 'v24.14.0\n' }
    if (request.role === 'npm-version') return { stdout: '11.12.1\n' }
    if (request.role === 'legacy-remote') return {
      stdout: `${options.identity ?? 'git@github.com:AnsonHui6040/ramen-style-today.git'}\n`,
    }
    if (request.role === 'legacy-head') return { stdout: `${options.reportedCommit ?? commit}\n` }
    if (request.role === 'legacy-tree') return { stdout: `${options.reportedTree ?? treeHash}\n` }
    if (request.role === 'legacy-status') return { stdout: options.dirty ? ' M src/App.tsx\n' : '' }
    if (request.role === 'git-worktree-add') {
      const worktree = request.args.at(-2)!
      mkdirSync(worktree, { recursive: true })
      cpSync(sourcePath, join(worktree, 'src/App.tsx'), { recursive: true })
      cpSync(lockPath, join(worktree, 'package-lock.json'))
      if (options.replaceExternalPatchAfterHash) {
        unlinkSync(patchPath)
        writeFileSync(patchPath, alternateFixturePatchBytes)
      }
      return { stdout: '' }
    }
    if (request.role === 'patch-check') return { stdout: '' }
    if (request.role === 'patch-apply') {
      writeFileSync(
        join(request.cwd, 'src/App.tsx'),
        options.postApplyContentMismatch ? 'tampered after apply\n' : fixturePatchedApp,
      )
      writeFileSync(join(request.cwd, 'src/parity-question-extractor.test.tsx'), fixturePatchedTest)
      return { stdout: '' }
    }
    if (request.role === 'patch-diff-check') return { stdout: '' }
    if (request.role === 'patch-diff-files') {
      return {
        stdout: options.patchSurfaceOutput
          ?? ' M src/App.tsx\0?? src/parity-question-extractor.test.tsx\0',
      }
    }
    if (request.role === 'npm-ci') {
      mkdirSync(join(request.cwd, 'node_modules/vitest'), { recursive: true })
      writeFileSync(join(request.cwd, 'node_modules/vitest/vitest.mjs'), '// fixture\n')
      return { stdout: '' }
    }
    if (request.role === 'legacy-full-suite') {
      afterLegacySuite?.()
      return { stdout: 'Tests 42 passed\n' }
    }
    if (request.role === 'legacy-network-denied-extraction') {
      const capabilityPath = request.environment.RAMEN_PARITY_SEED
      if (!capabilityPath) throw new Error('missing fixture capability')
      const capability = JSON.parse(readFileSync(capabilityPath, 'utf8')) as {
        rawOutputPath: string
      }
      writeFileSync(capability.rawOutputPath, `${JSON.stringify({
        schemaVersion: 1,
        cases: rawCases(),
      })}\n`, { flag: 'wx' })
      return { stdout: 'Tests 1 passed\n' }
    }
    if (request.role === 'git-worktree-remove') {
      if (options.cleanupFailure) throw new Error('cleanup\nfailed')
      const worktree = request.args.at(-1)!
      rmSync(worktree, { recursive: true, force: true })
      return { stdout: '' }
    }
    if (request.role === 'git-worktree-prune') return { stdout: '' }
    throw new Error(`Unexpected spawn role ${request.role}`)
  }

  const inheritedEnvironment = { ...options.inheritedEnvironment }
  if (options.inheritedHomeContainsExtractionRoot) inheritedEnvironment.HOME = process.cwd()

  const environmentInput = {
    inheritedEnvironment,
    legacyRoot,
    toolRoot,
    destination,
    patchPath,
    seedsPath,
    authoringSources: ([
      'tools/parity/questions/contracts.ts',
      'tools/parity/questions/extractor.ts',
      'tools/parity/questions/extract.ts',
    ] as const).map((relativePath) => ({
      relativePath,
      path: authoringSourcePaths[relativePath],
    })),
    tools: fixtureTools,
    expected: {
      identity: {
        host: 'github.com',
        owner: 'AnsonHui6040',
        repository: 'ramen-style-today',
      },
      commit,
      treeHash,
      trackedSourceHashes: {
        'src/App.tsx': options.sourceHash ?? sha256File(sourcePath),
      },
      lockfilePath: 'package-lock.json',
      lockfileHash: options.lockHash ?? sha256File(lockPath),
      patchHash: options.patchHash ?? sha256File(patchPath),
      seedsHash: sha256File(seedsPath),
      nodeVersion: '24.14.0',
      npmVersion: '11.12.1',
    },
    spawn,
    onRunPaths: (paths: ExtractorFixture['runPaths'][number]) => runPaths.push(paths),
  } satisfies CreateExtractorEnvironmentInput
  const environment = createExtractorEnvironment(environmentInput)

  const ignoredPaths = [
    'node_modules/.tmp/tsconfig.app.tsbuildinfo',
    'node_modules/.tmp/tsconfig.node.tsbuildinfo',
  ] as const
  const fingerprint = () => Promise.all(ignoredPaths.map((path) => (
    fingerprintIgnoredPath(legacyRoot, path)
  )))
  const originalFingerprintBefore = await fingerprint()
  Object.assign(fixture, {
    root,
    legacyRoot,
    destination,
    originalNodeModules: join(legacyRoot, 'node_modules'),
    environment,
    spawnRecords,
    originalFingerprintBefore,
    originalFingerprintAfter: fingerprint,
    addOriginalNodeModulesWithTsBuildInfo: async () => {
      const cache = join(legacyRoot, 'node_modules/.tmp')
      mkdirSync(cache, { recursive: true })
      writeFileSync(join(cache, 'tsconfig.app.tsbuildinfo'), 'app-cache')
      writeFileSync(join(cache, 'tsconfig.node.tsbuildinfo'), 'node-cache')
      fixture.originalFingerprintBefore = await fingerprint()
    },
    rewriteOriginalTsBuildInfo: () => {
      writeFileSync(
        join(legacyRoot, 'node_modules/.tmp/tsconfig.app.tsbuildinfo'),
        'changed-cache',
      )
    },
    runPaths,
    authoringSourcePaths,
  })
  Object.defineProperty(fixture, 'afterLegacySuite', {
    get: () => afterLegacySuite,
    set: (value) => {
      afterLegacySuite = value
    },
  })
  return fixture
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('identity and transport normalization', () => {
  test.each([
    'https://github.com/AnsonHui6040/ramen-style-today.git',
    'ssh://git@github.com/AnsonHui6040/ramen-style-today.git',
    'git@github.com:AnsonHui6040/ramen-style-today.git',
    'github:AnsonHui6040/ramen-style-today',
  ])('normalizes accepted GitHub transport %s', (remote) => {
    expect(normalizeGithubRepository(remote)).toEqual({
      host: 'github.com',
      owner: 'AnsonHui6040',
      repository: 'ramen-style-today',
    })
  })

  test('rejects a non-GitHub or malformed remote', () => {
    expect(() => normalizeGithubRepository('https://example.com/a/b.git')).toThrow(
      'unsupported legacy repository remote',
    )
  })

  test.each([
    ['identity', { identity: 'git@github.com:other/project.git' }],
    ['commit', { reportedCommit: 'c'.repeat(40) }],
    ['tree', { reportedTree: 'd'.repeat(40) }],
    ['lock', { lockHash: hash('e') }],
    ['source', { sourceHash: hash('f') }],
    ['dirty checkout', { dirty: true }],
    ['patch drift', { patchHash: hash('0') }],
  ])('rejects wrong %s', async (_name, options) => {
    const fixture = await createExtractorFixture(options)
    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow()
  })
})

describe('isolated execution and exact seed binding', () => {
  test('creates run-owned physical fixture tools without host-specific paths', async () => {
    const fixture = await createExtractorFixture()
    const toolPaths = Object.values(fixture.environment.tools)

    expect(toolPaths).toHaveLength(4)
    expect(toolPaths).not.toEqual(Object.values(trustedTools))
    for (const toolPath of toolPaths) {
      expect(toolPath.startsWith(`${fixture.root}/`)).toBe(true)
      expect(Object.values(trustedTools)).not.toContain(toolPath)
      const stats = lstatSync(toolPath)
      expect(stats.isFile()).toBe(true)
      expect(stats.isSymbolicLink()).toBe(false)
    }
  })

  test.each([
    'tools/parity/questions/contracts.ts',
    'tools/parity/questions/extractor.ts',
    'tools/parity/questions/extract.ts',
  ] as const)('changes extractor identity when authoring dependency %s changes', async (path) => {
    const baselineFixture = await createExtractorFixture()
    const baseline = await runLegacyExtractor(
      baselineFixture.environment,
      { verifyOnly: true },
    )
    const changedFixture = await createExtractorFixture()
    writeFileSync(changedFixture.authoringSourcePaths[path], `// changed ${path}\n`)
    const changed = await runLegacyExtractor(changedFixture.environment, { verifyOnly: true })

    expect((changed.manifest as { extractor: { hash: string } }).extractor.hash)
      .not.toBe((baseline.manifest as { extractor: { hash: string } }).extractor.hash)
  })

  test('includes a tracked modification and patch-created untracked file in the exact patch surface', async () => {
    const fixture = await createExtractorFixture({
      patchSurfaceOutput: ' M src/App.tsx\0?? src/parity-question-extractor.test.tsx\0',
    })

    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true }))
      .resolves.toBeDefined()
    const patchStatus = fixture.spawnRecords.find(({ role }) => role === 'patch-diff-files')
    expect(patchStatus?.args).toEqual([
      '-C',
      fixture.runPaths[0]!.extractionRoot + '/worktree',
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
      '--',
    ])
  })

  test('applies the whitespace-clean zero-context patch with explicit Git opt-in', async () => {
    const fixture = await createExtractorFixture()
    let observedBoundPatch: string | undefined
    fixture.environment.hooks.beforePatchCheck = ({ externalPatch, boundPatch }) => {
      observedBoundPatch = boundPatch
      expect(externalPatch).toBe(fixture.environment.patchPath)
      expect(boundPatch.startsWith(`${fixture.runPaths[0]!.extractionRoot}/`)).toBe(true)
      const stats = lstatSync(boundPatch)
      expect(stats.isFile()).toBe(true)
      expect(stats.isSymbolicLink()).toBe(false)
      expect(readFileSync(boundPatch)).toEqual(readFileSync(externalPatch))
    }
    await runLegacyExtractor(fixture.environment, { verifyOnly: true })

    const patchCheck = fixture.spawnRecords.find(({ role }) => role === 'patch-check')
    const patchApply = fixture.spawnRecords.find(({ role }) => role === 'patch-apply')
    expect(patchCheck?.args.slice(2, 5)).toEqual(['apply', '--unidiff-zero', '--check'])
    expect(patchApply?.args.slice(2, 4)).toEqual(['apply', '--unidiff-zero'])
    expect(patchCheck?.args.at(-1)).toBe(observedBoundPatch)
    expect(patchApply?.args.at(-1)).toBe(observedBoundPatch)
    expect(observedBoundPatch).not.toBe(fixture.environment.patchPath)
  })

  test('rejects external patch replacement after the initial verified hash', async () => {
    const fixture = await createExtractorFixture({ replaceExternalPatchAfterHash: true })

    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
      'external instrumentation patch identity changed',
    )
    expect(fixture.spawnRecords.some(({ role }) => role === 'patch-check')).toBe(false)
  })

  test('rejects replacement of the run-owned bound patch before Git reads it', async () => {
    const fixture = await createExtractorFixture()
    let hookCalled = false
    const hooks = fixture.environment.hooks as typeof fixture.environment.hooks & {
      beforePatchCheck?: (paths: {
        readonly externalPatch: string
        readonly boundPatch: string
      }) => void
    }
    hooks.beforePatchCheck = ({ boundPatch }) => {
      hookCalled = true
      unlinkSync(boundPatch)
      writeFileSync(boundPatch, alternateFixturePatchBytes)
    }

    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
      'bound instrumentation patch identity changed',
    )
    expect(hookCalled).toBe(true)
    expect(fixture.spawnRecords.some(({ role }) => role === 'patch-check')).toBe(false)
  })

  test('rejects post-apply content that does not match the verified patch result', async () => {
    const fixture = await createExtractorFixture({ postApplyContentMismatch: true })

    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
      'instrumentation patch content mismatch',
    )
    expect(fixture.spawnRecords.some(({ role }) => role === 'npm-ci')).toBe(false)
  })

  test.each([
    [
      'an extra path',
      ' M src/App.tsx\0?? src/extra.ts\0?? src/parity-question-extractor.test.tsx\0',
    ],
    [
      'a rename record',
      'R  src/App.tsx\0src/Other.tsx\0?? src/parity-question-extractor.test.tsx\0',
    ],
    [
      'an unsafe path',
      ' M src/App.tsx\0?? ../parity-question-extractor.test.tsx\0',
    ],
  ])('rejects patch status containing %s', async (_name, patchSurfaceOutput) => {
    const fixture = await createExtractorFixture({ patchSurfaceOutput })
    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
      'instrumentation patch drift',
    )
  })

  test('never reuses original dependencies or caches', async () => {
    const fixture = await createExtractorFixture()
    await fixture.addOriginalNodeModulesWithTsBuildInfo()
    const result = await runLegacyExtractor(fixture.environment, { verifyOnly: true })
    expect(fixture.spawnRecords.some(({ args }) =>
      args.some((value) => value.startsWith(fixture.originalNodeModules)),
    )).toBe(false)
    expect(await fixture.originalFingerprintAfter()).toEqual(fixture.originalFingerprintBefore)
    expect(result.ignoredFingerprintsAfter).toEqual(result.ignoredFingerprintsBefore)
  })

  test('fails when an ignored original cache changes', async () => {
    const fixture = await createExtractorFixture()
    await fixture.addOriginalNodeModulesWithTsBuildInfo()
    fixture.afterLegacySuite = () => fixture.rewriteOriginalTsBuildInfo()
    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
      'original ignored path changed',
    )
  })

  test.each([
    { mode: 'verify-only', verifyOnly: true },
    { mode: 'publication', verifyOnly: false },
  ])('rejects a post-extraction tracked mutation before $mode completion', async ({ verifyOnly }) => {
    const fixture = await createExtractorFixture()
    let publicationStarted = false
    fixture.environment.hooks.afterExtraction = () => {
      writeFileSync(join(fixture.legacyRoot, 'src/App.tsx'), 'mutated after extraction\n')
    }
    fixture.environment.hooks.beforePublishStaging = () => {
      publicationStarted = true
    }

    await expect(runLegacyExtractor(fixture.environment, { verifyOnly })).rejects.toThrow(
      'tracked source hash src/App.tsx mismatch',
    )
    expect(publicationStarted).toBe(false)
    expect(lstatSync(fixture.destination, { throwIfNoEntry: false })).toBeUndefined()
    for (const role of ['legacy-head', 'legacy-tree', 'legacy-status'] as const) {
      expect(fixture.spawnRecords.filter((record) => record.role === role)).toHaveLength(2)
    }
    const statuses = fixture.spawnRecords.filter(({ role }) => role === 'legacy-status')
    expect(statuses.every(({ args }) => args.includes('--untracked-files=all'))).toBe(true)
  })

  test('runs the full suite before network-denied extraction', async () => {
    const fixture = await createExtractorFixture()
    await runLegacyExtractor(fixture.environment, { verifyOnly: true })
    const executionOrder = fixture.spawnRecords
      .map(({ role }) => role)
      .filter((role) => [
        'npm-ci',
        'legacy-full-suite',
        'legacy-network-denied-extraction',
      ].includes(role))
    expect(executionOrder).toEqual([
      'npm-ci',
      'legacy-full-suite',
      'legacy-network-denied-extraction',
    ])
    const extraction = fixture.spawnRecords.find(
      ({ role }) => role === 'legacy-network-denied-extraction',
    )
    if (!extraction) throw new Error('missing extraction record')
    expect(extraction.executable).toBe(fixture.environment.tools.sandboxExec)
    expect(extraction.args.slice(0, 2)).toEqual([
      '-p',
      '(version 1)(allow default)(deny network*)',
    ])
  })

  test('passes only the allowlisted child environment', async () => {
    const fixture = await createExtractorFixture({
      inheritedEnvironment: {
        GIT_CONFIG_GLOBAL: '/tmp/hostile-gitconfig',
        NODE_OPTIONS: '--require=/tmp/hostile.cjs',
        NPM_CONFIG_USERCONFIG: '/tmp/hostile-npmrc',
        PATH: '/tmp/hostile-bin',
      },
    })
    await runLegacyExtractor(fixture.environment, { verifyOnly: true })
    const npmInstall = fixture.spawnRecords.find(({ role }) => role === 'npm-ci')
    if (!npmInstall) throw new Error('missing npm install record')
    const npmUserConfig = npmInstall.environment.NPM_CONFIG_USERCONFIG
    const npmGlobalConfig = npmInstall.environment.NPM_CONFIG_GLOBALCONFIG
    expect(fixture.spawnRecords.every(({ environment }) =>
      Object.keys(environment).sort().join('\0') === allowedEnvironmentKeys.join('\0'),
    )).toBe(true)
    expect(fixture.spawnRecords.every(({ environment }) =>
      environment.NPM_CONFIG_USERCONFIG === npmUserConfig
        && environment.NPM_CONFIG_GLOBALCONFIG === npmGlobalConfig
        && environment.GIT_CONFIG_NOSYSTEM === '1',
    )).toBe(true)
    expect(npmUserConfig).not.toBe(npmGlobalConfig)
    expect(npmUserConfig).not.toBe('/dev/null')
    expect(npmGlobalConfig).not.toBe('/dev/null')
    expect(fixture.spawnRecords.every(({ environment }) =>
      !environment.PATH?.includes('/tmp/hostile-bin'),
    )).toBe(true)
  })

  test('uses distinct run-owned empty npm configs without modifying npm argv', async () => {
    const fixture = await createExtractorFixture({
      inheritedEnvironment: { HOME: '/tmp/inherited-home' },
    })
    const result = await runLegacyExtractor(fixture.environment, { verifyOnly: true })
    const npmInstall = fixture.spawnRecords.find(({ role }) => role === 'npm-ci')
    if (!npmInstall) throw new Error('missing npm install record')
    const userConfig = npmInstall.environment.NPM_CONFIG_USERCONFIG
    const globalConfig = npmInstall.environment.NPM_CONFIG_GLOBALCONFIG
    const extractionRoot = fixture.runPaths[0]?.extractionRoot
    if (!userConfig || !globalConfig || !extractionRoot) throw new Error('missing npm isolation paths')

    expect(userConfig).not.toBe(globalConfig)
    expect(userConfig.startsWith(`${extractionRoot}/`)).toBe(true)
    expect(globalConfig.startsWith(`${extractionRoot}/`)).toBe(true)
    expect(npmInstall.npmConfigIdentity).toEqual({
      userConfig: {
        path: userConfig,
        type: 'regular-file',
        symbolicLink: false,
        validatedParentsContainSymbolicLink: false,
        size: 0,
      },
      globalConfig: {
        path: globalConfig,
        type: 'regular-file',
        symbolicLink: false,
        validatedParentsContainSymbolicLink: false,
        size: 0,
      },
    })
    expect([npmInstall.executable, ...npmInstall.args]).toEqual([
      fixture.environment.tools.node,
      fixture.environment.tools.npmCli,
      'ci',
      '--ignore-scripts',
    ])
    expect(userConfig.startsWith(fixture.legacyRoot)).toBe(false)
    expect(globalConfig.startsWith(fixture.legacyRoot)).toBe(false)
    expect(userConfig.startsWith('/tmp/inherited-home')).toBe(false)
    expect(globalConfig.startsWith('/tmp/inherited-home')).toBe(false)
    expect(lstatSync(userConfig, { throwIfNoEntry: false })).toBeUndefined()
    expect(lstatSync(globalConfig, { throwIfNoEntry: false })).toBeUndefined()
    expect(JSON.stringify(result.manifest)).toContain('isolated-empty-file')
    expect(JSON.stringify(result.manifest)).not.toContain(extractionRoot)
  })

  test('allows run-owned npm configs when the validated extraction root is below inherited HOME', async () => {
    const fixture = await createExtractorFixture({
      inheritedHomeContainsExtractionRoot: true,
    })

    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true }))
      .resolves.toBeDefined()
  })

  test('removes both run-owned npm configs after an npm failure', async () => {
    const fixture = await createExtractorFixture({ failRole: 'npm-ci' })
    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
      'PRIMARY external failure',
    )
    const npmInstall = fixture.spawnRecords.find(({ role }) => role === 'npm-ci')
    if (!npmInstall) throw new Error('missing npm install record')
    expect(lstatSync(npmInstall.environment.NPM_CONFIG_USERCONFIG!, {
      throwIfNoEntry: false,
    })).toBeUndefined()
    expect(lstatSync(npmInstall.environment.NPM_CONFIG_GLOBALCONFIG!, {
      throwIfNoEntry: false,
    })).toBeUndefined()
  })

  test('rejects npm config replacement immediately before npm invocation', async () => {
    const fixture = await createExtractorFixture()
    const hooks = fixture.environment.hooks as typeof fixture.environment.hooks & {
      beforeNpmInvocation?: (paths: { userConfig: string; globalConfig: string }) => void
    }
    hooks.beforeNpmInvocation = ({ userConfig }) => {
      unlinkSync(userConfig)
      symlinkSync('/dev/null', userConfig)
    }
    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
      'npm user config identity changed',
    )
  })

  test.each(['count', 'order', 'id', 'actions'] as const)(
    'rejects raw seed binding mismatch: %s',
    async (field) => {
      const fixture = await createExtractorFixture({ rawMismatch: field })
      await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
        'raw seed binding mismatch',
      )
    },
  )
})

describe('no-follow and transactional publication', () => {
  test('rejects unsafe legacy, patch, seeds, destination, and parent symlinks', async () => {
    const fixture = await createExtractorFixture()
    const target = join(fixture.root, 'target')
    writeFileSync(target, 'target')
    const unsafe = join(fixture.root, 'unsafe')
    symlinkSync(target, unsafe)
    expect(() => assertNoFollowPath(unsafe, { kind: 'file', allowMissingLeaf: false }))
      .toThrow('symbolic link')

    const destinationParent = dirname(fixture.destination)
    mkdirSync(dirname(destinationParent), { recursive: true })
    const realParent = join(fixture.root, 'elsewhere')
    mkdirSync(realParent)
    if (lstatSync(destinationParent, { throwIfNoEntry: false })) rmSync(destinationParent, { recursive: true })
    symlinkSync(realParent, destinationParent)
    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
      'symbolic link',
    )
  })

  test('rejects atomic lock contention', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(dirname(fixture.destination), { recursive: true })
    writeFileSync(join(dirname(fixture.destination), '.legacy-v1.lock'), 'busy')
    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
      'extraction lock is already held',
    )
  })

  test('uses unique same-parent staging and backup names', async () => {
    const fixture = await createExtractorFixture()
    await runLegacyExtractor(fixture.environment, { verifyOnly: true })
    await runLegacyExtractor(fixture.environment, { verifyOnly: true })
    expect(fixture.runPaths).toHaveLength(2)
    expect(new Set(fixture.runPaths.map(({ staging }) => staging)).size).toBe(2)
    expect(new Set(fixture.runPaths.map(({ backup }) => backup)).size).toBe(2)
    for (const paths of fixture.runPaths) {
      expect(dirname(paths.staging)).toBe(dirname(fixture.destination))
      expect(dirname(paths.backup)).toBe(dirname(fixture.destination))
    }
  })

  test('rejects an existing output unless replace is explicit', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: false })).rejects.toThrow(
      'output already exists; pass --replace',
    )
  })

  test.each([
    { mode: 'new destination', replace: false },
    { mode: 'existing destination', replace: true },
  ])('blocks $mode publication when pre-publication cleanup fails', async ({ replace }) => {
    const fixture = await createExtractorFixture({ cleanupFailure: true })
    if (replace) {
      mkdirSync(fixture.destination, { recursive: true })
      writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    }
    let publicationCalls = 0
    fixture.environment.hooks.beforePublishStaging = () => {
      publicationCalls += 1
    }

    await expect(runLegacyExtractor(fixture.environment, {
      replace,
      verifyOnly: false,
    })).rejects.toThrow('extractor cleanup failed')
    expect(publicationCalls).toBe(0)
    if (replace) {
      expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).toBe('old')
    } else {
      expect(lstatSync(fixture.destination, { throwIfNoEntry: false })).toBeUndefined()
    }
    expect(readdirSync(dirname(fixture.destination)).some((name) => (
      name.includes('.backup-') || name.includes('.staging-')
    ))).toBe(false)
  })

  test('rolls back the old output when publication fails after backup rename', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    fixture.environment.hooks.beforePublishStaging = () => {
      throw new Error('publish seam failure')
    }
    await expect(runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })).rejects.toThrow('publish seam failure')
    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).toBe('old')
    expect(readdirSync(dirname(fixture.destination)).some((name) =>
      name.includes('.backup-') || name.includes('.staging-'),
    )).toBe(false)
  })

  test('retains the only previous backup when publication and rollback both fail', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    fixture.environment.hooks.beforePublishStaging = () => {
      throw new Error('publish seam failure')
    }
    fixture.environment.hooks.beforeRollback = () => {
      throw new Error('rollback seam failure')
    }

    await expect(runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })).rejects.toThrow('publish seam failure')

    expect(lstatSync(fixture.destination, { throwIfNoEntry: false })).toBeUndefined()
    const retainedBackups = readdirSync(dirname(fixture.destination))
      .filter((name) => name.includes('.backup-'))
    expect(retainedBackups).toHaveLength(1)
    expect(readFileSync(join(
      dirname(fixture.destination),
      retainedBackups[0]!,
      'manifest.json',
    ), 'utf8')).toBe('old')
  })

  test('removes an installed replacement before restoring old output after a later failure', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    const hooks = fixture.environment.hooks as typeof fixture.environment.hooks & {
      afterPublishStaging?: (destination: string) => void
    }
    hooks.afterPublishStaging = () => {
      throw new Error('post-install publication failure')
    }

    await expect(runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })).rejects.toThrow('post-install publication failure')
    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).toBe('old')
    expect(readdirSync(dirname(fixture.destination)).some((name) =>
      name.includes('.backup-') || name.includes('.staging-'),
    )).toBe(false)
  })

  test('does not mutate a second author target when post-commit cleanup persistently fails', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'author-a-previous')
    const outputParent = dirname(fixture.destination)
    const authorBStaging = join(outputParent, '.author-b-staging')
    const authorBPrevious = join(outputParent, '.author-b-previous')
    let authorBLock: string | undefined
    let cleanupAttempts = 0

    fixture.environment.hooks.beforeRemoveBackup = () => {
      cleanupAttempts += 1
      if (cleanupAttempts === 1) {
        authorBLock = acquireCooperativePublicationLock(fixture.destination)
        mkdirSync(authorBStaging)
        writeFileSync(join(authorBStaging, 'manifest.json'), 'author-b-visible-target')
        renameSync(fixture.destination, authorBPrevious)
        renameSync(authorBStaging, fixture.destination)
        rmSync(authorBPrevious, { recursive: true })
      }
      throw new Error(`persistent cleanup failure with secret ${'x'.repeat(500)}`)
    }

    let result: Awaited<ReturnType<typeof runLegacyExtractor>>
    try {
      result = await runLegacyExtractor(fixture.environment, {
        replace: true,
        verifyOnly: false,
      })
    } finally {
      if (authorBLock && lstatSync(authorBLock, { throwIfNoEntry: false })) {
        unlinkSync(authorBLock)
      }
    }

    expect(cleanupAttempts).toBe(publicationCleanupAttempts)
    expect(result.status).toBe('published-with-cleanup-warning')
    expect(result.published).toBe(true)
    if (result.status !== 'published-with-cleanup-warning') {
      throw new Error('missing publication cleanup warning')
    }
    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8'))
      .toBe('author-b-visible-target')
    expect(result.warning.cleanupAttempts).toBe(publicationCleanupAttempts)
  })

  test('retains one verified recovery artifact after the fixed cleanup retry budget', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    let cleanupAttempts = 0
    fixture.environment.hooks.beforeRemoveBackup = () => {
      cleanupAttempts += 1
      throw new Error(`cleanup failed\nSECRET=${'s'.repeat(500)}`)
    }

    const result = await runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })

    expect(result.status).toBe('published-with-cleanup-warning')
    expect(result.published).toBe(true)
    if (result.status !== 'published-with-cleanup-warning') {
      throw new Error('missing publication cleanup warning')
    }
    expect(result.warning).toEqual({
      code: 'backup-cleanup-failed',
      recoveryBackupPath: result.warning.recoveryBackupPath,
      cleanupAttempts: publicationCleanupAttempts,
      message: 'Published fixtures; retained a verified recovery backup after backup cleanup failed.',
    })
    expect(result.warning.message.length).toBeLessThanOrEqual(300)
    expect(result.warning.message).not.toContain('SECRET')
    expect(cleanupAttempts).toBe(publicationCleanupAttempts)
    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).not.toBe('old')
    const retainedBackups = readdirSync(dirname(fixture.destination))
      .filter((name) => name.includes('.backup-'))
    expect(retainedBackups).toHaveLength(1)
    expect(realpathSync(result.warning.recoveryBackupPath)).toBe(result.warning.recoveryBackupPath)
    const recoveryStats = lstatSync(result.warning.recoveryBackupPath)
    expect(recoveryStats.isFile()).toBe(true)
    expect(recoveryStats.isSymbolicLink()).toBe(false)
    const recovery = JSON.parse(
      readFileSync(result.warning.recoveryBackupPath, 'utf8'),
    ) as {
      entries: Array<{ path: string; type: string; contentBase64?: string }>
    }
    expect(recovery.entries).toContainEqual({
      path: 'manifest.json',
      type: 'file',
      contentBase64: Buffer.from('old').toString('base64'),
    })
    expect(lstatSync(publicationLockPath(fixture.destination), {
      throwIfNoEntry: false,
    })).toBeUndefined()
    const secondAuthorLock = acquireCooperativePublicationLock(fixture.destination)
    unlinkSync(secondAuthorLock)
  })

  test('returns an intact recovery snapshot when cleanup partially replaces the directory backup', async () => {
    const fixture = await createExtractorFixture()
    const nested = join(fixture.destination, 'nested')
    const empty = join(fixture.destination, 'empty')
    const originalBytes = Buffer.from([0, 1, 2, 127, 128, 255])
    mkdirSync(nested, { recursive: true })
    mkdirSync(empty)
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old-manifest')
    writeFileSync(join(nested, 'payload.bin'), originalBytes)
    let cleanupAttempts = 0
    let unsafeReplacementPath: string | undefined
    let displacedBackupPath: string | undefined
    fixture.environment.hooks.beforeRemoveBackup = (backupPath) => {
      cleanupAttempts += 1
      if (cleanupAttempts === 1) {
        displacedBackupPath = `${backupPath}.partially-removed`
        renameSync(backupPath, displacedBackupPath)
        rmSync(join(displacedBackupPath, 'nested/payload.bin'))
        mkdirSync(backupPath)
        writeFileSync(join(backupPath, 'manifest.json'), 'unsafe-mutated-backup')
        unsafeReplacementPath = backupPath
      }
      throw new Error('partial recursive cleanup failure')
    }

    const result = await runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })

    expect(result.status).toBe('published-with-cleanup-warning')
    if (result.status !== 'published-with-cleanup-warning') {
      throw new Error('missing publication cleanup warning')
    }
    expect(result.published).toBe(true)
    expect(cleanupAttempts).toBe(publicationCleanupAttempts)
    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8'))
      .not.toBe('old-manifest')
    expect(result.warning.cleanupAttempts).toBe(publicationCleanupAttempts)
    expect(result.warning.recoveryBackupPath).not.toBe(unsafeReplacementPath)
    expect(result.warning.recoveryBackupPath).not.toBe(displacedBackupPath)
    expect(dirname(result.warning.recoveryBackupPath)).toBe(dirname(fixture.destination))
    expect(realpathSync(result.warning.recoveryBackupPath))
      .toBe(result.warning.recoveryBackupPath)
    const recoveryStats = lstatSync(result.warning.recoveryBackupPath)
    expect(recoveryStats.isFile()).toBe(true)
    expect(recoveryStats.isSymbolicLink()).toBe(false)
    const recovery = JSON.parse(
      readFileSync(result.warning.recoveryBackupPath, 'utf8'),
    ) as {
      schemaVersion: number
      entries: Array<{
        path: string
        type: 'directory' | 'file'
        contentBase64?: string
      }>
    }
    expect(recovery).toEqual({
      schemaVersion: 1,
      entries: [
        { path: 'empty', type: 'directory' },
        {
          path: 'manifest.json',
          type: 'file',
          contentBase64: Buffer.from('old-manifest').toString('base64'),
        },
        { path: 'nested', type: 'directory' },
        {
          path: 'nested/payload.bin',
          type: 'file',
          contentBase64: originalBytes.toString('base64'),
        },
      ],
    })
    const secondAuthorLock = acquireCooperativePublicationLock(fixture.destination)
    unlinkSync(secondAuthorLock)
  })

  test('rejects a symbolic link before serializing a recovery snapshot', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    const outside = join(fixture.root, 'outside-secret')
    writeFileSync(outside, 'must-not-enter-recovery')
    symlinkSync(outside, join(fixture.destination, 'unsafe-link'))

    await expect(runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })).rejects.toThrow('recovery backup contains a symbolic link')

    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).toBe('old')
    expect(lstatSync(join(fixture.destination, 'unsafe-link')).isSymbolicLink()).toBe(true)
  })

  test('rejects same-size invalid staged cases and restores the old publication under lock', async () => {
    const fixture = await createExtractorFixture()
    const oldCases = Buffer.from('old-cases-bytes')
    const oldManifest = Buffer.from('old-manifest-bytes')
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'cases.json'), oldCases)
    writeFileSync(join(fixture.destination, 'manifest.json'), oldManifest)
    const oldIdentity = publicationDirectoryIdentity(fixture.destination)
    const events: string[] = []
    fixture.environment.hooks.beforePublishStaging = (staging) => {
      events.push('staged-cases-corrupted')
      const path = join(staging, 'cases.json')
      const original = readFileSync(path)
      writeFileSync(path, Buffer.alloc(original.length, 'x'))
    }
    fixture.environment.hooks.beforeRollback = () => {
      events.push('rollback-under-lock')
      expectCooperativePublicationLockHeld(fixture.destination)
    }
    fixture.environment.hooks.afterRollbackVerified = () => {
      events.push('old-publication-verified')
      expectCooperativePublicationLockHeld(fixture.destination)
      expect(publicationDirectoryIdentity(fixture.destination)).toEqual(oldIdentity)
      expect(readFileSync(join(fixture.destination, 'cases.json'))).toEqual(oldCases)
      expect(readFileSync(join(fixture.destination, 'manifest.json'))).toEqual(oldManifest)
    }

    await expect(runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })).rejects.toThrow('fixture cases file identity changed')

    expect(events).toEqual([
      'staged-cases-corrupted',
      'rollback-under-lock',
      'old-publication-verified',
    ])
    expect(publicationDirectoryIdentity(fixture.destination)).toEqual(oldIdentity)
    expect(readFileSync(join(fixture.destination, 'cases.json'))).toEqual(oldCases)
    expect(readFileSync(join(fixture.destination, 'manifest.json'))).toEqual(oldManifest)
    expect(publicationResidue(fixture.destination)).toEqual([])
  })

  test('rejects invalid installed manifest and restores the old publication under lock', async () => {
    const fixture = await createExtractorFixture()
    const oldCases = Buffer.from('old-cases-bytes')
    const oldManifest = Buffer.from('old-manifest-bytes')
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'cases.json'), oldCases)
    writeFileSync(join(fixture.destination, 'manifest.json'), oldManifest)
    const oldIdentity = publicationDirectoryIdentity(fixture.destination)
    const events: string[] = []
    fixture.environment.hooks.afterPublishStaging = (destination) => {
      events.push('installed-manifest-corrupted')
      writeFileSync(join(destination, 'manifest.json'), '{invalid-json')
    }
    fixture.environment.hooks.beforeRollback = () => {
      events.push('rollback-under-lock')
      expectCooperativePublicationLockHeld(fixture.destination)
    }
    fixture.environment.hooks.afterRollbackVerified = () => {
      events.push('old-publication-verified')
      expectCooperativePublicationLockHeld(fixture.destination)
      expect(publicationDirectoryIdentity(fixture.destination)).toEqual(oldIdentity)
      expect(readFileSync(join(fixture.destination, 'cases.json'))).toEqual(oldCases)
      expect(readFileSync(join(fixture.destination, 'manifest.json'))).toEqual(oldManifest)
    }

    await expect(runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })).rejects.toThrow('fixture manifest file identity changed')

    expect(events).toEqual([
      'installed-manifest-corrupted',
      'rollback-under-lock',
      'old-publication-verified',
    ])
    expect(publicationDirectoryIdentity(fixture.destination)).toEqual(oldIdentity)
    expect(readFileSync(join(fixture.destination, 'cases.json'))).toEqual(oldCases)
    expect(readFileSync(join(fixture.destination, 'manifest.json'))).toEqual(oldManifest)
    expect(publicationResidue(fixture.destination)).toEqual([])
  })

  test('rejects a canonical installed manifest with a false fixture content hash', async () => {
    const fixture = await createExtractorFixture()
    const oldCases = Buffer.from('old-cases-bytes')
    const oldManifest = Buffer.from('old-manifest-bytes')
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'cases.json'), oldCases)
    writeFileSync(join(fixture.destination, 'manifest.json'), oldManifest)
    const oldIdentity = publicationDirectoryIdentity(fixture.destination)
    const events: string[] = []
    let canonicalMutationApplied = false
    fixture.environment.hooks.afterPublishStaging = (destination) => {
      events.push('installed-manifest-semantically-corrupted')
      const path = join(destination, 'manifest.json')
      const original = readFileSync(path, 'utf8')
      const mutated = original.replace(
        /("fixtureContentHash": ")[0-9a-f]{64}(")/,
        `$1${'0'.repeat(64)}$2`,
      )
      canonicalMutationApplied = mutated !== original
        && Buffer.byteLength(mutated) === Buffer.byteLength(original)
      writeFileSync(path, mutated)
    }
    fixture.environment.hooks.beforeRollback = () => {
      events.push('rollback-under-lock')
      expectCooperativePublicationLockHeld(fixture.destination)
    }
    fixture.environment.hooks.afterRollbackVerified = () => {
      events.push('old-publication-verified')
      expectCooperativePublicationLockHeld(fixture.destination)
      expect(publicationDirectoryIdentity(fixture.destination)).toEqual(oldIdentity)
      expect(readFileSync(join(fixture.destination, 'cases.json'))).toEqual(oldCases)
      expect(readFileSync(join(fixture.destination, 'manifest.json'))).toEqual(oldManifest)
    }

    await expect(runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })).rejects.toThrow('fixture manifest file identity changed')

    expect(events).toEqual([
      'installed-manifest-semantically-corrupted',
      'rollback-under-lock',
      'old-publication-verified',
    ])
    expect(canonicalMutationApplied).toBe(true)
    expect(publicationDirectoryIdentity(fixture.destination)).toEqual(oldIdentity)
    expect(readFileSync(join(fixture.destination, 'cases.json'))).toEqual(oldCases)
    expect(readFileSync(join(fixture.destination, 'manifest.json'))).toEqual(oldManifest)
    expect(publicationResidue(fixture.destination)).toEqual([])
  })

  test('rejects a byte-identical staged cases inode replacement under lock', async () => {
    const fixture = await createExtractorFixture()
    const oldCases = Buffer.from('old-cases-bytes')
    const oldManifest = Buffer.from('old-manifest-bytes')
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'cases.json'), oldCases)
    writeFileSync(join(fixture.destination, 'manifest.json'), oldManifest)
    const oldIdentity = publicationDirectoryIdentity(fixture.destination)
    const events: string[] = []
    let replacement: ReturnType<typeof replaceWithByteIdenticalInode> | undefined
    fixture.environment.hooks.beforePublishStaging = (staging) => {
      events.push('staged-cases-inode-replaced')
      replacement = replaceWithByteIdenticalInode(join(staging, 'cases.json'))
    }
    fixture.environment.hooks.beforeRollback = () => {
      events.push('rollback-under-lock')
      expectCooperativePublicationLockHeld(fixture.destination)
    }
    fixture.environment.hooks.afterRollbackVerified = () => {
      events.push('old-publication-verified')
      expectCooperativePublicationLockHeld(fixture.destination)
      expect(publicationDirectoryIdentity(fixture.destination)).toEqual(oldIdentity)
      expect(readFileSync(join(fixture.destination, 'cases.json'))).toEqual(oldCases)
      expect(readFileSync(join(fixture.destination, 'manifest.json'))).toEqual(oldManifest)
    }

    await expect(runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })).rejects.toThrow('fixture cases file identity changed')

    expect(replacement).toEqual({
      bytesPreserved: true,
      devicePreserved: true,
      modePreserved: true,
      sizePreserved: true,
      mtimePreserved: true,
      inodeChanged: true,
    })
    expect(events).toEqual([
      'staged-cases-inode-replaced',
      'rollback-under-lock',
      'old-publication-verified',
    ])
    expect(publicationDirectoryIdentity(fixture.destination)).toEqual(oldIdentity)
    expect(readFileSync(join(fixture.destination, 'cases.json'))).toEqual(oldCases)
    expect(readFileSync(join(fixture.destination, 'manifest.json'))).toEqual(oldManifest)
    expect(publicationResidue(fixture.destination)).toEqual([])
  })

  test('rejects a byte-identical installed manifest inode replacement under lock', async () => {
    const fixture = await createExtractorFixture()
    const oldCases = Buffer.from('old-cases-bytes')
    const oldManifest = Buffer.from('old-manifest-bytes')
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'cases.json'), oldCases)
    writeFileSync(join(fixture.destination, 'manifest.json'), oldManifest)
    const oldIdentity = publicationDirectoryIdentity(fixture.destination)
    const events: string[] = []
    let replacement: ReturnType<typeof replaceWithByteIdenticalInode> | undefined
    fixture.environment.hooks.afterPublishStaging = (destination) => {
      events.push('installed-manifest-inode-replaced')
      replacement = replaceWithByteIdenticalInode(join(destination, 'manifest.json'))
    }
    fixture.environment.hooks.beforeRollback = () => {
      events.push('rollback-under-lock')
      expectCooperativePublicationLockHeld(fixture.destination)
    }
    fixture.environment.hooks.afterRollbackVerified = () => {
      events.push('old-publication-verified')
      expectCooperativePublicationLockHeld(fixture.destination)
      expect(publicationDirectoryIdentity(fixture.destination)).toEqual(oldIdentity)
      expect(readFileSync(join(fixture.destination, 'cases.json'))).toEqual(oldCases)
      expect(readFileSync(join(fixture.destination, 'manifest.json'))).toEqual(oldManifest)
    }

    await expect(runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })).rejects.toThrow('fixture manifest file identity changed')

    expect(replacement).toEqual({
      bytesPreserved: true,
      devicePreserved: true,
      modePreserved: true,
      sizePreserved: true,
      mtimePreserved: true,
      inodeChanged: true,
    })
    expect(events).toEqual([
      'installed-manifest-inode-replaced',
      'rollback-under-lock',
      'old-publication-verified',
    ])
    expect(publicationDirectoryIdentity(fixture.destination)).toEqual(oldIdentity)
    expect(readFileSync(join(fixture.destination, 'cases.json'))).toEqual(oldCases)
    expect(readFileSync(join(fixture.destination, 'manifest.json'))).toEqual(oldManifest)
    expect(publicationResidue(fixture.destination)).toEqual([])
  })

  test('restores and verifies the original before a second author can enter', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    const events: string[] = []
    const hooks = fixture.environment.hooks as typeof fixture.environment.hooks & {
      afterRollbackVerified?: (destination: string) => void
    }
    hooks.afterPublishStaging = () => {
      events.push('installed-validation-failed')
      throw new Error('installed content validation failure')
    }
    hooks.beforeRollback = () => {
      events.push('rollback-start')
      expectCooperativePublicationLockHeld(fixture.destination)
    }
    hooks.afterRollbackVerified = () => {
      events.push('restored-identity-verified')
      expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).toBe('old')
      expectCooperativePublicationLockHeld(fixture.destination)
    }

    await expect(runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })).rejects.toThrow('installed content validation failure')

    expect(events).toEqual([
      'installed-validation-failed',
      'rollback-start',
      'restored-identity-verified',
    ])
    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).toBe('old')
    const secondAuthorLock = acquireCooperativePublicationLock(fixture.destination)
    unlinkSync(secondAuthorLock)
  })

  test('treats a proven-held release failure as pre-commit recovery under ownership', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    const events: string[] = []
    const hooks = fixture.environment.hooks as typeof fixture.environment.hooks & {
      afterRollbackVerified?: (destination: string) => void
    }
    hooks.beforeReleaseLock = () => {
      events.push('commit-release-held')
      throw new Error('lock release held failure')
    }
    hooks.beforeRollback = () => {
      events.push('rollback-under-lock')
      expectCooperativePublicationLockHeld(fixture.destination)
    }
    hooks.afterRollbackVerified = () => {
      events.push('restored-identity-verified')
      expectCooperativePublicationLockHeld(fixture.destination)
    }

    await expect(runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })).rejects.toThrow('lock release held failure')

    expect(events).toEqual([
      'commit-release-held',
      'rollback-under-lock',
      'restored-identity-verified',
    ])
    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).toBe('old')
    const secondAuthorLock = acquireCooperativePublicationLock(fixture.destination)
    unlinkSync(secondAuthorLock)
  })

  test('does not perform unlocked rollback when release state is indeterminate', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    let rollbackCalls = 0
    fixture.environment.hooks.beforeReleaseLock = (lockPath) => unlinkSync(lockPath)
    fixture.environment.hooks.beforeRollback = () => {
      rollbackCalls += 1
    }

    const error = await runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    }).then(() => undefined, (caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(
      'publication lock release is indeterminate; recovery required',
    )
    expect((error as Error).message.length).toBeLessThanOrEqual(300)
    expect(rollbackCalls).toBe(0)
    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).not.toBe('old')
    const retainedBackups = readdirSync(dirname(fixture.destination))
      .filter((name) => name.includes('.backup-'))
    expect(retainedBackups).toHaveLength(1)
    expect(readFileSync(join(
      dirname(fixture.destination),
      retainedBackups[0]!,
      'manifest.json',
    ), 'utf8')).toBe('old')
  })

  test('commits a successful replacement after lock release and backup removal', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    const events: string[] = []
    fixture.environment.hooks.afterPublishStaging = () => events.push('installed')
    fixture.environment.hooks.beforeReleaseLock = () => events.push('release-lock')
    fixture.environment.hooks.beforeRemoveBackup = () => events.push('remove-backup')

    const result = await runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })

    expect(result).toMatchObject({ status: 'published', published: true })
    expect('warning' in result).toBe(false)
    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).not.toBe('old')
    expect(events).toEqual(['installed', 'release-lock', 'remove-backup'])
    expect(readdirSync(dirname(fixture.destination)).some((name) => (
      name.includes('.backup-')
      || name.includes('.recovery-')
      || name.includes('.staging-')
      || name.endsWith('.lock')
    ))).toBe(false)
  })

  test('preserves trace evidence without entering publication in verify-only mode', async () => {
    const fixture = await createExtractorFixture()

    const result = await runLegacyExtractor(fixture.environment, { verifyOnly: true })

    expect(result.status).toBe('verified')
    expect(result.published).toBe(false)
    expect(result.cases).toHaveLength(1)
    expect(result.manifest).toBeDefined()
    expect(result.ignoredFingerprintsAfter).toEqual(result.ignoredFingerprintsBefore)
    expect(lstatSync(fixture.destination, { throwIfNoEntry: false })).toBeUndefined()
  })

  test('returns a bounded public failed result for an ordinary pre-commit failure', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    fixture.environment.hooks.afterPublishStaging = () => {
      throw new Error(`SECRET_PRECOMMIT=${'x'.repeat(600)}`)
    }

    const result = await getPublicRunBoundary()(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })

    expect(result).toEqual({
      status: 'failed',
      published: false,
      error: {
        code: 'publication-failed',
        message: 'legacy extraction or publication failed',
      },
    })
    if (result.status !== 'failed') throw new Error('missing failed publication result')
    expect(result.error.message.length).toBeLessThanOrEqual(300)
    expect(result.error.message).not.toContain('SECRET_PRECOMMIT')
    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).toBe('old')
  })

  test('returns recovery-required from the public boundary for indeterminate release', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    fixture.environment.hooks.beforeReleaseLock = (lockPath) => unlinkSync(lockPath)

    const result = await getPublicRunBoundary()(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })

    expect(result).toEqual({
      status: 'failed',
      published: false,
      error: {
        code: 'recovery-required',
        message: 'publication lock release is indeterminate; recovery required',
      },
    })
    expect(readFileSync(join(fixture.destination, 'manifest.json'), 'utf8')).not.toBe('old')
  })

  test('returns recovery-required when verify-only final lock release is indeterminate', async () => {
    const fixture = await createExtractorFixture()
    fixture.environment.hooks.afterExtraction = () => {
      unlinkSync(publicationLockPath(fixture.destination))
    }

    const result = await getPublicRunBoundary()(fixture.environment, { verifyOnly: true })

    expect(result).toEqual({
      status: 'failed',
      published: false,
      error: {
        code: 'recovery-required',
        message: 'publication lock release is indeterminate; recovery required',
      },
    })
    expect(lstatSync(fixture.destination, { throwIfNoEntry: false })).toBeUndefined()
  })

  test('keeps recovery-required precedence over an earlier extraction failure', async () => {
    const fixture = await createExtractorFixture()
    fixture.environment.hooks.afterExtraction = () => {
      unlinkSync(publicationLockPath(fixture.destination))
      throw new Error('ordinary extraction failure before final release')
    }

    const result = await getPublicRunBoundary()(fixture.environment, { verifyOnly: true })

    expect(result).toEqual({
      status: 'failed',
      published: false,
      error: {
        code: 'recovery-required',
        message: 'publication lock release is indeterminate; recovery required',
      },
    })
    expect(lstatSync(fixture.destination, { throwIfNoEntry: false })).toBeUndefined()
  })

  test('public verify-only boundary preserves trace manifest and fingerprint evidence', async () => {
    const fixture = await createExtractorFixture()

    const result = await getPublicRunBoundary()(fixture.environment, { verifyOnly: true })

    expect(result.status).toBe('verified')
    if (result.status !== 'verified') throw new Error('missing verified result')
    expect(result.published).toBe(false)
    expect(result.cases).toHaveLength(1)
    expect(result.manifest).toBeDefined()
    expect(result.ignoredFingerprintsAfter).toEqual(result.ignoredFingerprintsBefore)
  })

  test('revalidates a sensitive path immediately before raw read', async () => {
    const fixture = await createExtractorFixture()
    fixture.environment.hooks.beforeReadRaw = (rawPath) => {
      const moved = `${rawPath}.moved`
      writeFileSync(moved, '{}')
      unlinkSync(rawPath)
      symlinkSync(moved, rawPath)
    }
    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
      'raw output identity changed',
    )
  })

  test('cleans a partial worktree add and always prunes', async () => {
    const fixture = await createExtractorFixture({ failRole: 'git-worktree-add' })
    await expect(runLegacyExtractor(fixture.environment, { verifyOnly: true })).rejects.toThrow(
      'PRIMARY external failure',
    )
    expect(fixture.spawnRecords.map(({ role }) => role)).toEqual(expect.arrayContaining([
      'git-worktree-remove',
      'git-worktree-prune',
    ]))
  })

  test('preserves a bounded primary error when cleanup also fails', async () => {
    const fixture = await createExtractorFixture({
      failRole: 'legacy-full-suite',
      cleanupFailure: true,
    })
    const error = await runLegacyExtractor(fixture.environment, { verifyOnly: true })
      .then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toContain('PRIMARY external failure')
    expect(message).toContain('cleanup')
    expect(message.length).toBeLessThanOrEqual(300)
    expect(Array.from(message).every((character) => {
      const codePoint = character.codePointAt(0)!
      return codePoint > 31 && codePoint !== 127
    })).toBe(true)
  })
})

describe('bounded external error handling', () => {
  test('sanitizes to one control-free line no longer than the requested bound', () => {
    const sanitized = sanitizeExternalError(
      new Error(`first\nsecond\u001b[31m${'x'.repeat(500)}`),
      300,
    )
    expect(sanitized.length).toBeLessThanOrEqual(300)
    expect(Array.from(sanitized).every((character) => {
      const codePoint = character.codePointAt(0)!
      return codePoint > 31 && (codePoint < 127 || codePoint > 159)
    })).toBe(true)
    expect(sanitized).toMatch(/^first second/)
  })

  test('fingerprints regular files without following symbolic links', async () => {
    const root = mkdtempSync(join(process.cwd(), '.task9-fingerprint-test-'))
    roots.push(root)
    mkdirSync(join(root, 'node_modules/.tmp'), { recursive: true })
    writeFileSync(join(root, 'outside'), 'secret')
    symlinkSync(join(root, 'outside'), join(root, 'node_modules/.tmp/tsconfig.app.tsbuildinfo'))
    const result = await fingerprintIgnoredPath(
      root,
      'node_modules/.tmp/tsconfig.app.tsbuildinfo',
    )
    expect(result).toMatchObject({
      exists: true,
      type: 'symbolic-link',
      sha256: null,
    })
  })
})

describe('tracked observation patch and seed surface', () => {
  const questionTools = dirname(fileURLToPath(import.meta.url))
  const patchPath = join(questionTools, 'legacy-instrumentation.patch')
  const seedsPath = join(questionTools, 'seeds.json')

  test('patches only App plus the extraction test with observation-only additions', () => {
    const patch = readFileSync(patchPath, 'utf8')
    expect(patch.split('\n').filter((line) => /[\t ]+$/.test(line))).toEqual([])
    const patchedFiles = [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)]
      .map((match) => [match[1], match[2]])
    expect(patchedFiles).toEqual([
      ['src/App.tsx', 'src/App.tsx'],
      ['src/parity-question-extractor.test.tsx', 'src/parity-question-extractor.test.tsx'],
    ])
    const addedLines = patch.split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1))
      .join('\n')
    expect(addedLines).toContain('registerLegacyQuestionObserver')
    expect(addedLines).toContain("transition: 'forced-skip'")
    expect(addedLines).toContain("transition: 'complete'")
    const extractionTestAdditions = addedLines.slice(
      addedLines.indexOf("import { lstatSync, readFileSync, writeFileSync } from 'node:fs'"),
    )
    for (const forbidden of [
      'createInitialAnswers(',
      'getSelectedValues(',
      'getForcedQuestionValue(',
      'applyForcedAnswersFromStep(',
      'getPreviousInteractiveStep(',
      'canonicalAnswers',
      'reachableQuestionIds',
      'repairs',
      'diagnostics',
      'expectedFrames',
      'coverageTags',
    ]) expect(extractionTestAdditions).not.toContain(forbidden)
    expect(extractionTestAdditions).not.toContain('lastVisibleOptions')
    expect(extractionTestAdditions).toContain(
      "document.querySelectorAll<HTMLButtonElement>('.choice-card')",
    )
    expect(extractionTestAdditions).toContain('disabledOptionIds')
    expect(extractionTestAdditions).toContain('if (option.disabled)')
    expect(extractionTestAdditions).toContain(
      'previous?.displayedQuestionId === observation.displayedQuestionId',
    )
    expect(extractionTestAdditions).toContain('previous?.legacyAnswers !== undefined')
  })

  test('actual patch emits submit observations with only the fixed submit fields', () => {
    const patch = readFileSync(patchPath, 'utf8')
    const addedLines = patch.split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1))
    const submitStart = addedLines.lastIndexOf(
      '    emitLegacyQuestionObservation({',
      addedLines.indexOf("      transition: 'submit'"),
    )
    const submitEnd = addedLines.indexOf('    })', submitStart)
    const submitObservation = addedLines.slice(submitStart, submitEnd + 1)
    const emittedFields = submitObservation.flatMap((line) => {
      const match = /^\s+([a-zA-Z]+):/.exec(line)
      return match?.[1] ? [match[1]] : []
    })
    const extractionSurfaceFields = [
      ...emittedFields,
      ...(emittedFields.includes('visibleOptionIds')
        && addedLines.includes(
          '      ...(disabledOptionIds === undefined ? {} : { disabledOptionIds }),',
        )
        ? ['disabledOptionIds']
        : []),
    ].sort()

    expect(extractionSurfaceFields).toEqual([
      'displayedQuestionId',
      'legacyAnswers',
      'transition',
    ])
  })

  test('binds the production extractor to the corrected patch and App blob identities', () => {
    const patch = readFileSync(patchPath, 'utf8')
    const extractSource = readFileSync(join(questionTools, 'extract.ts'), 'utf8')
    const patchHash = createHash('sha256').update(patch).digest('hex')

    expect(patch).toContain(
      'index e01c13ce039f79696a64cd8eb79da6ad19cecdbb..a7f87257146f1c1c2d7bba732a5a7b944dba8025 100644',
    )
    expect(extractSource).toContain(`patchHash: '${patchHash}'`)
  })

  test('keeps seeds input-only with exactly id and actions per case', () => {
    const input = JSON.parse(readFileSync(seedsPath, 'utf8')) as {
      schemaVersion: number
      cases: Array<Record<string, unknown>>
    }
    expect(input.schemaVersion).toBe(1)
    expect(input.cases.length).toBeGreaterThan(0)
    for (const seedCase of input.cases) {
      expect(Object.keys(seedCase).sort()).toEqual(['actions', 'id'])
      expect(seedCase).not.toHaveProperty('coverageTags')
      expect(seedCase).not.toHaveProperty('frames')
    }
  })

  test('reaches the source maximum through real selects then frees capacity without a disabled click', () => {
    const input = JSON.parse(readFileSync(seedsPath, 'utf8')) as {
      cases: Array<{
        id: string
        actions: Array<Record<string, string>>
      }>
    }
    const actions = input.cases.find(({ id }) => id === 'soup-paitan-complete')?.actions
    expect(actions).toBeDefined()
    const sourceActions = actions?.filter(({ questionId }) => questionId === 'source')
    expect(sourceActions).toEqual([
      { type: 'select', questionId: 'source', optionId: 'unsure' },
      { type: 'select', questionId: 'source', optionId: 'pork' },
      { type: 'select', questionId: 'source', optionId: 'chicken' },
      { type: 'deselect', questionId: 'source', optionId: 'chicken' },
      { type: 'select', questionId: 'source', optionId: 'fish-seafood' },
    ])
  })

  test('skips the extraction-only test unless the exact raw-output capability is present', () => {
    const patch = readFileSync(patchPath, 'utf8')
    expect(patch).toContain("const extractionTest = process.env.RAMEN_PARITY_SEED ? test : test.skip")
    expect(patch).toContain('rawOutputPath')
    expect(patch).toContain("flag: 'wx'")
  })
})

describe('extract CLI arguments', () => {
  test('accepts explicit legacy verify-only and replace authoring modes', () => {
    expect(parseExtractArguments(['--legacy', '/tmp/legacy', '--verify-only'])).toEqual({
      legacy: '/tmp/legacy',
      replace: false,
      verifyOnly: true,
    })
    expect(parseExtractArguments(['--legacy', '/tmp/legacy', '--replace'])).toEqual({
      legacy: '/tmp/legacy',
      replace: true,
      verifyOnly: false,
    })
  })

  test.each([
    { arguments_: [] },
    { arguments_: ['--legacy'] },
    { arguments_: ['--legacy', 'relative'] },
    { arguments_: ['--legacy', '/tmp/legacy', '--replace', '--verify-only'] },
    { arguments_: ['--legacy', '/tmp/legacy', '--unknown'] },
  ])('rejects invalid arguments $arguments_', ({ arguments_ }) => {
    expect(() => parseExtractArguments(arguments_)).toThrow('Usage:')
  })

  test('projects exact bounded publication warning JSON without process failure metadata', async () => {
    const fixture = await createExtractorFixture()
    mkdirSync(fixture.destination, { recursive: true })
    writeFileSync(join(fixture.destination, 'manifest.json'), 'old')
    fixture.environment.hooks.beforeRemoveBackup = () => {
      throw new Error('persistent CLI cleanup failure')
    }
    const result = await runLegacyExtractor(fixture.environment, {
      replace: true,
      verifyOnly: false,
    })
    if (result.status !== 'published-with-cleanup-warning') {
      throw new Error('missing publication cleanup warning')
    }

    expect(projectExtractorResultForCli(result, 'replace')).toEqual({
      mode: 'replace',
      caseCount: 1,
      status: 'published-with-cleanup-warning',
      published: true,
      warning: result.warning,
      ignoredFingerprintsBefore: result.ignoredFingerprintsBefore,
      ignoredFingerprintsAfter: result.ignoredFingerprintsAfter,
    })
  })

  test('projects verify-only as unpublished while retaining its status', async () => {
    const fixture = await createExtractorFixture()
    const result = await runLegacyExtractor(fixture.environment, { verifyOnly: true })

    expect(projectExtractorResultForCli(result, 'verify-only')).toEqual({
      mode: 'verify-only',
      caseCount: 1,
      status: 'verified',
      published: false,
      ignoredFingerprintsBefore: result.ignoredFingerprintsBefore,
      ignoredFingerprintsAfter: result.ignoredFingerprintsAfter,
    })
  })

  test('projects exact failed publication JSON without success evidence fields', () => {
    const failed = {
      status: 'failed',
      published: false,
      error: {
        code: 'publication-failed',
        message: 'legacy extraction or publication failed',
      },
    } as const
    const projectFailed = projectExtractorResultForCli as unknown as (
      result: FailedPublicationResult,
      mode: 'replace',
    ) => unknown

    expect(projectFailed(failed, 'replace')).toEqual({
      mode: 'replace',
      ...failed,
    })
  })

  test('real CLI command boundary writes failed JSON and sets nonzero process semantics', async () => {
    const failed = {
      status: 'failed',
      published: false,
      error: {
        code: 'recovery-required',
        message: 'publication lock release is indeterminate; recovery required',
      },
    } as const
    const runExtractCommand = (extractModule as unknown as {
      runExtractCommand?: (
        arguments_: readonly string[],
        dependencies: {
          run: () => Promise<FailedPublicationResult>
          writeStdout: (value: string) => void
          setExitCode: (code: number) => void
        },
      ) => Promise<PublicExtractorResult>
    }).runExtractCommand
    expect(runExtractCommand).toBeTypeOf('function')
    if (!runExtractCommand) throw new Error('missing real CLI command boundary')
    const stdout: string[] = []
    const exitCodes: number[] = []

    const result = await runExtractCommand([
      '--legacy',
      '/tmp/non-live-legacy-fixture',
      '--replace',
    ], {
      run: async () => failed,
      writeStdout: (value) => stdout.push(value),
      setExitCode: (code) => exitCodes.push(code),
    })

    expect(result).toEqual(failed)
    expect(JSON.parse(stdout.join(''))).toEqual({ mode: 'replace', ...failed })
    expect(exitCodes).toEqual([1])
  })

  test('real CLI command preserves final-release recovery-required JSON and exit code', async () => {
    const fixture = await createExtractorFixture()
    fixture.environment.hooks.afterExtraction = () => {
      unlinkSync(publicationLockPath(fixture.destination))
    }
    const stdout: string[] = []
    const exitCodes: number[] = []

    const result = await extractModule.runExtractCommand([
      '--legacy',
      '/tmp/non-live-legacy-fixture',
      '--verify-only',
    ], {
      run: async () => getPublicRunBoundary()(fixture.environment, { verifyOnly: true }),
      writeStdout: (value) => stdout.push(value),
      setExitCode: (code) => exitCodes.push(code),
    })

    const expected = {
      status: 'failed',
      published: false,
      error: {
        code: 'recovery-required',
        message: 'publication lock release is indeterminate; recovery required',
      },
    } as const
    expect(result).toEqual(expected)
    expect(JSON.parse(stdout.join(''))).toEqual({ mode: 'verify-only', ...expected })
    expect(exitCodes).toEqual([1])
  })
})
