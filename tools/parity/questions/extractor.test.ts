import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, test } from 'vitest'

import {
  assertNoFollowPath,
  createExtractorEnvironment,
  fingerprintIgnoredPath,
  normalizeGithubRepository,
  runLegacyExtractor,
  sanitizeExternalError,
  type CreateExtractorEnvironmentInput,
  type ExtractorEnvironment,
  type SpawnRequest,
} from './extractor.js'
import { parseExtractArguments } from './extract.js'

const roots: string[] = []
const hash = (character: string) => character.repeat(64)
const commit = 'a'.repeat(40)
const treeHash = 'b'.repeat(40)
const fixtureOriginalApp = 'export default function App() { return null }\n'
const fixturePatchedApp = 'export default function App() { return "instrumented" }\n'
const fixturePatchedTest = 'export const observer = true\n'

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

async function createExtractorFixture(
  options: FixtureOptions = {},
): Promise<ExtractorFixture> {
  const root = mkdtempSync(join(process.cwd(), '.task9-extractor-test-'))
  roots.push(root)
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
    expect(extraction.executable).toBe('/usr/bin/sandbox-exec')
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
      '/Users/ansonhui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node',
      '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js',
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
})
