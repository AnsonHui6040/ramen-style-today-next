import { createHash, randomBytes } from 'node:crypto'
import {
  closeSync,
  constants,
  createReadStream,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from 'node:fs'
import { spawn } from 'node:child_process'
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  computeExtractorAuthoringHash,
  deriveObservableCoverage,
  extractorAuthoringSourcePaths,
  fixtureManifestSchema,
  legacyObservableSeedFileSchema,
  legacyObservableTraceCaseSchema,
  type LegacyObservableAction,
  type LegacyObservableTraceCase,
  type LegacyObservableTraceFrame,
} from './contracts.js'

export const trustedTools = {
  git: '/usr/bin/git',
  node: '/Users/ansonhui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node',
  npmCli: '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js',
  sandboxExec: '/usr/bin/sandbox-exec',
} as const

export const legacySourceIdentity = {
  host: 'github.com',
  owner: 'AnsonHui6040',
  repository: 'ramen-style-today',
  commit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  treeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
} as const

export const ignoredExtractorSensitivePaths = [
  'node_modules/.tmp/tsconfig.app.tsbuildinfo',
  'node_modules/.tmp/tsconfig.node.tsbuildinfo',
] as const

export type IgnoredExtractorSensitivePath =
  (typeof ignoredExtractorSensitivePaths)[number]

export interface IgnoredPathFingerprint {
  readonly path: IgnoredExtractorSensitivePath
  readonly exists: boolean
  readonly type: 'missing' | 'regular-file' | 'directory' | 'symbolic-link' | 'other'
  readonly size: number | null
  readonly mtimeMs: number | null
  readonly sha256: string | null
}

export type SpawnRole =
  | 'git-version'
  | 'node-version'
  | 'npm-version'
  | 'legacy-remote'
  | 'legacy-head'
  | 'legacy-tree'
  | 'legacy-status'
  | 'git-worktree-add'
  | 'patch-check'
  | 'patch-apply'
  | 'patch-diff-check'
  | 'patch-diff-files'
  | 'npm-ci'
  | 'legacy-full-suite'
  | 'legacy-network-denied-extraction'
  | 'git-worktree-remove'
  | 'git-worktree-prune'

export interface SpawnRequest {
  readonly role: SpawnRole
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly environment: Readonly<Record<string, string>>
  readonly npmConfigIdentity?: NpmConfigIdentity
}

export interface NpmConfigIdentity {
  readonly userConfig: NpmConfigFileIdentity
  readonly globalConfig: NpmConfigFileIdentity
}

interface NpmConfigFileIdentity {
  readonly path: string
  readonly type: 'regular-file'
  readonly symbolicLink: false
  readonly validatedParentsContainSymbolicLink: false
  readonly size: 0
}

export interface SpawnResult {
  readonly stdout: string
  readonly stderr?: string
  readonly exitCode?: number
}

export interface ExpectedExtractorLineage {
  readonly identity: {
    readonly host: 'github.com'
    readonly owner: string
    readonly repository: string
  }
  readonly commit: string
  readonly treeHash: string
  readonly trackedSourceHashes: Readonly<Record<string, string>>
  readonly lockfilePath: string
  readonly lockfileHash: string
  readonly patchHash: string
  readonly seedsHash: string
  readonly nodeVersion: string
  readonly npmVersion: string
}

interface RunPaths {
  readonly staging: string
  readonly backup: string
  readonly extractionRoot: string
}

export interface ExtractorHooks {
  beforeReadPatch?: (path: string) => void
  beforePatchCheck?: (paths: {
    readonly externalPatch: string
    readonly boundPatch: string
  }) => void
  beforeReadSeeds?: (path: string) => void
  beforeReadRaw?: (path: string) => void
  beforeNpmInvocation?: (paths: {
    readonly userConfig: string
    readonly globalConfig: string
  }) => void
  beforePublishStaging?: (path: string) => void
  afterPublishStaging?: (path: string) => void
  beforeRollback?: (path: string) => void
}

export interface ExtractorEnvironment {
  readonly inheritedEnvironment: Readonly<Record<string, string | undefined>>
  readonly legacyRoot: string
  readonly toolRoot: string
  readonly destination: string
  readonly patchPath: string
  readonly seedsPath: string
  readonly authoringSources: readonly AuthoringSource[]
  readonly tools: typeof trustedTools
  readonly expected: ExpectedExtractorLineage
  readonly spawn: (request: SpawnRequest) => Promise<SpawnResult>
  readonly randomToken: () => string
  readonly onRunPaths?: (paths: RunPaths) => void
  readonly hooks: ExtractorHooks
}

export interface CreateExtractorEnvironmentInput {
  readonly inheritedEnvironment?: Readonly<Record<string, string | undefined>>
  readonly legacyRoot: string
  readonly toolRoot: string
  readonly destination: string
  readonly patchPath: string
  readonly seedsPath: string
  readonly authoringSources?: readonly AuthoringSource[]
  readonly tools?: typeof trustedTools
  readonly expected: ExpectedExtractorLineage
  readonly spawn?: (request: SpawnRequest) => Promise<SpawnResult>
  readonly randomToken?: () => string
  readonly onRunPaths?: (paths: RunPaths) => void
  readonly hooks?: ExtractorHooks
}

export interface RunLegacyExtractorOptions {
  readonly replace?: boolean
  readonly verifyOnly: boolean
}

export interface LegacyExtractorResult {
  readonly cases: readonly LegacyObservableTraceCase[]
  readonly manifest: unknown
  readonly published: boolean
  readonly ignoredFingerprintsBefore: readonly IgnoredPathFingerprint[]
  readonly ignoredFingerprintsAfter: readonly IgnoredPathFingerprint[]
}

interface FileIdentity {
  readonly dev: number
  readonly ino: number
  readonly mode: number
  readonly size: number
  readonly mtimeMs: number
}

export interface AuthoringSource {
  readonly relativePath: (typeof extractorAuthoringSourcePaths)[number]
  readonly path: string
}

interface RawTraceCase {
  readonly seedIndex: number
  readonly id: string
  readonly actions: readonly LegacyObservableAction[]
  readonly frames: readonly LegacyObservableTraceFrame[]
}

const sandboxProfile = '(version 1)(allow default)(deny network*)'
const extractionSeed = 'ramen-question-observable-v1'
const maximumExternalMessageLength = 300
const defaultAuthoringSources = extractorAuthoringSourcePaths.map((relativePath) => ({
  relativePath,
  path: fileURLToPath(new URL(`./${basename(relativePath)}`, import.meta.url)),
}))

export function sanitizeExternalError(error: unknown, maximumLength = 300) {
  const ansiEscape = new RegExp(`${String.fromCodePoint(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')
  const raw = (error instanceof Error ? error.message : String(error))
    .replace(ansiEscape, '')
  const oneLine = Array.from(raw)
    .map((character) => {
      const codePoint = character.codePointAt(0)!
      return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? ' ' : character
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  if (oneLine.length <= maximumLength) return oneLine || 'external command failed'
  return oneLine.slice(0, maximumLength)
}

function codePointCompare(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!)
  const sharedLength = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => codePointCompare(left, right))
      .map(([key, child]) => [key, stableValue(child)]))
  }
  return value
}

function stableJson(value: unknown) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function lstatIfPresent(path: string) {
  try {
    return lstatSync(path)
  } catch (error) {
    if (isMissingPathError(error)) return undefined
    throw error
  }
}

function statsIdentity(stats: Stats): FileIdentity {
  return {
    dev: stats.dev,
    ino: stats.ino,
    mode: stats.mode,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
  }
}

function identitiesEqual(left: FileIdentity, right: FileIdentity) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
}

export function assertNoFollowPath(
  path: string,
  options: { readonly kind: 'file' | 'directory'; readonly allowMissingLeaf: boolean },
) {
  if (!isAbsolute(path)) throw new Error(`security-sensitive path must be absolute: ${path}`)
  const parsed = parse(resolve(path))
  const segments = relative(parsed.root, resolve(path)).split(sep).filter(Boolean)
  let current = parsed.root
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]!)
    const stats = lstatIfPresent(current)
    const leaf = index === segments.length - 1
    if (!stats) {
      if (leaf && options.allowMissingLeaf) return undefined
      throw new Error(`security-sensitive path is missing: ${current}`)
    }
    if (stats.isSymbolicLink()) throw new Error(`symbolic link is forbidden: ${current}`)
    if (!leaf && !stats.isDirectory()) throw new Error(`path parent is not a directory: ${current}`)
    if (leaf && options.kind === 'file' && !stats.isFile()) {
      throw new Error(`expected a regular file: ${current}`)
    }
    if (leaf && options.kind === 'directory' && !stats.isDirectory()) {
      throw new Error(`expected a directory: ${current}`)
    }
    if (leaf) return statsIdentity(stats)
  }
  throw new Error(`unable to validate path: ${path}`)
}

function ensureSafeDirectory(path: string) {
  if (!isAbsolute(path)) throw new Error(`directory must be absolute: ${path}`)
  const parsed = parse(resolve(path))
  const segments = relative(parsed.root, resolve(path)).split(sep).filter(Boolean)
  let current = parsed.root
  for (const segment of segments) {
    current = join(current, segment)
    const stats = lstatIfPresent(current)
    if (!stats) {
      mkdirSync(current, { mode: 0o700 })
      const created = lstatSync(current)
      if (!created.isDirectory() || created.isSymbolicLink()) {
        throw new Error(`failed to create a physical directory: ${current}`)
      }
      continue
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`symbolic link or non-directory parent is forbidden: ${current}`)
    }
  }
}

function assertDescendant(path: string, root: string, label: string) {
  const relation = relative(resolve(root), resolve(path))
  if (!relation || relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error(`${label} must be a strict descendant of its extraction root`)
  }
}

function pathIsWithinOrEqual(path: string, root: string) {
  const relation = relative(resolve(root), resolve(path))
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))
}

function snapshotRegularFile(path: string, label: string) {
  const identity = assertNoFollowPath(path, { kind: 'file', allowMissingLeaf: false })
  if (!identity) throw new Error(`${label} is missing`)
  return identity
}

function revalidateRegularFile(path: string, expected: FileIdentity, label: string) {
  let received: FileIdentity
  try {
    received = snapshotRegularFile(path, label)
  } catch {
    throw new Error(`${label} identity changed`)
  }
  if (!identitiesEqual(expected, received)) throw new Error(`${label} identity changed`)
}

function readNoFollowFile(path: string, label: string, hook?: (path: string) => void) {
  return readNoFollowFileWithIdentity(path, label, hook).bytes
}

function readNoFollowFileWithIdentity(
  path: string,
  label: string,
  hook?: (path: string) => void,
) {
  const identity = snapshotRegularFile(path, label)
  hook?.(path)
  revalidateRegularFile(path, identity, label)
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const bytes = readFileSync(descriptor)
    revalidateRegularFile(path, identity, label)
    return { bytes, identity }
  } finally {
    closeSync(descriptor)
  }
}

function sha256Bytes(bytes: Uint8Array | string) {
  return createHash('sha256').update(bytes).digest('hex')
}

function gitBlobHash(bytes: Uint8Array) {
  return createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest('hex')
}

interface InstrumentationPatchTarget {
  readonly path: 'src/App.tsx' | 'src/parity-question-extractor.test.tsx'
  readonly oldHash: string
  readonly newHash: string
}

function parseInstrumentationPatchTargets(bytes: Buffer): readonly InstrumentationPatchTarget[] {
  const lines = bytes.toString('utf8').split('\n')
  const targets: Array<{ path: string; oldHash?: string; newHash?: string }> = []
  for (const line of lines) {
    const header = /^diff --git a\/([^ ]+) b\/([^ ]+)$/.exec(line)
    if (header) {
      if (header[1] !== header[2]) throw new Error('instrumentation patch content mismatch')
      targets.push({ path: header[1]! })
      continue
    }
    const index = /^index ([a-f0-9]{40})\.\.([a-f0-9]{40})(?: [0-7]{6})?$/.exec(line)
    if (index && targets.length > 0) {
      const target = targets.at(-1)!
      if (target.oldHash !== undefined) throw new Error('instrumentation patch content mismatch')
      target.oldHash = index[1]!
      target.newHash = index[2]!
    }
  }
  const expectedPaths = [
    'src/App.tsx',
    'src/parity-question-extractor.test.tsx',
  ]
  if (
    targets.length !== expectedPaths.length
    || targets.some((target, index) => (
      target.path !== expectedPaths[index]
      || target.oldHash === undefined
      || target.newHash === undefined
      || target.newHash === '0'.repeat(40)
      || (index === 0 && target.oldHash === '0'.repeat(40))
      || (index === 1 && target.oldHash !== '0'.repeat(40))
    ))
  ) throw new Error('instrumentation patch content mismatch')
  return targets as InstrumentationPatchTarget[]
}

function revalidateBoundPatch(
  externalPatch: string,
  externalIdentity: FileIdentity,
  boundPatch: string,
  boundIdentity: FileIdentity,
  expectedHash: string,
) {
  revalidateRegularFile(
    externalPatch,
    externalIdentity,
    'external instrumentation patch',
  )
  revalidateRegularFile(boundPatch, boundIdentity, 'bound instrumentation patch')
  const bytes = readNoFollowFile(boundPatch, 'bound instrumentation patch')
  revalidateRegularFile(boundPatch, boundIdentity, 'bound instrumentation patch')
  assertExpectedValue(sha256Bytes(bytes), expectedHash, 'bound instrumentation patch hash')
}

function verifyInstrumentationPatchBase(
  worktree: string,
  targets: readonly InstrumentationPatchTarget[],
) {
  for (const target of targets) {
    const path = resolve(worktree, target.path)
    assertDescendant(path, worktree, 'instrumentation patch target')
    if (target.oldHash === '0'.repeat(40)) {
      if (lstatIfPresent(path)) throw new Error('instrumentation patch content mismatch')
      continue
    }
    const bytes = readNoFollowFile(path, `instrumentation patch base ${target.path}`)
    if (gitBlobHash(bytes) !== target.oldHash) {
      throw new Error('instrumentation patch content mismatch')
    }
  }
}

function verifyInstrumentationPatchResult(
  worktree: string,
  targets: readonly InstrumentationPatchTarget[],
) {
  for (const target of targets) {
    const path = resolve(worktree, target.path)
    assertDescendant(path, worktree, 'instrumentation patch target')
    const bytes = readNoFollowFile(path, `instrumentation patch result ${target.path}`)
    if (gitBlobHash(bytes) !== target.newHash) {
      throw new Error('instrumentation patch content mismatch')
    }
  }
}

async function sha256RegularFile(path: string, expected: FileIdentity) {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  const digest = createHash('sha256')
  await new Promise<void>((resolvePromise, reject) => {
    createReadStream(path, { fd: descriptor, autoClose: true })
      .on('data', (chunk) => digest.update(chunk))
      .on('error', reject)
      .on('end', resolvePromise)
  })
  revalidateRegularFile(path, expected, 'fingerprinted file')
  return digest.digest('hex')
}

export async function fingerprintIgnoredPath(
  root: string,
  path: IgnoredExtractorSensitivePath,
): Promise<IgnoredPathFingerprint> {
  assertNoFollowPath(root, { kind: 'directory', allowMissingLeaf: false })
  const absolute = resolve(root, path)
  assertDescendant(absolute, root, 'ignored path')
  const segments = path.split('/')
  let current = root
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]!)
    const stats = lstatIfPresent(current)
    if (!stats) {
      return { path, exists: false, type: 'missing', size: null, mtimeMs: null, sha256: null }
    }
    if (stats.isSymbolicLink()) {
      return {
        path,
        exists: true,
        type: 'symbolic-link',
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        sha256: null,
      }
    }
    if (index < segments.length - 1 && !stats.isDirectory()) {
      return {
        path,
        exists: true,
        type: 'other',
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        sha256: null,
      }
    }
    if (index === segments.length - 1) {
      const type = stats.isFile()
        ? 'regular-file'
        : stats.isDirectory()
          ? 'directory'
          : 'other'
      return {
        path,
        exists: true,
        type,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        sha256: type === 'regular-file'
          ? await sha256RegularFile(current, statsIdentity(stats))
          : null,
      }
    }
  }
  throw new Error(`unable to fingerprint ignored path ${path}`)
}

export function normalizeGithubRepository(remote: string) {
  const trimmed = remote.trim()
  const patterns = [
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i,
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
    /^github:([^/]+)\/([^/]+?)(?:\.git)?$/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(trimmed)
    if (match?.[1] && match[2]) {
      return {
        host: 'github.com' as const,
        owner: match[1],
        repository: match[2],
      }
    }
  }
  throw new Error('unsupported legacy repository remote')
}

async function defaultSpawn(request: SpawnRequest): Promise<SpawnResult> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(request.executable, [...request.args], {
      cwd: request.cwd,
      env: { ...request.environment },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const appendBounded = (current: string, chunk: Buffer) => (
      `${current}${chunk.toString('utf8')}`.slice(-65_536)
    )
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk)
    })
    child.on('error', reject)
    child.on('close', (exitCode) => resolvePromise({
      stdout,
      stderr,
      exitCode: exitCode ?? 1,
    }))
  })
}

export function createExtractorEnvironment(
  input: CreateExtractorEnvironmentInput,
): ExtractorEnvironment {
  const requestedAuthoringSources = input.authoringSources ?? defaultAuthoringSources
  if (
    requestedAuthoringSources.length !== extractorAuthoringSourcePaths.length
    || requestedAuthoringSources.some((source, index) => (
      source.relativePath !== extractorAuthoringSourcePaths[index]
    ))
  ) throw new Error('authoring source set mismatch')
  return {
    inheritedEnvironment: input.inheritedEnvironment ?? {},
    legacyRoot: resolve(input.legacyRoot),
    toolRoot: resolve(input.toolRoot),
    destination: resolve(input.destination),
    patchPath: resolve(input.patchPath),
    seedsPath: resolve(input.seedsPath),
    authoringSources: requestedAuthoringSources.map((source) => ({
      relativePath: source.relativePath,
      path: resolve(source.path),
    })),
    tools: input.tools ?? trustedTools,
    expected: input.expected,
    spawn: input.spawn ?? defaultSpawn,
    randomToken: input.randomToken ?? (() => randomBytes(16).toString('hex')),
    ...(input.onRunPaths ? { onRunPaths: input.onRunPaths } : {}),
    hooks: input.hooks ?? {},
  }
}

function makeChildEnvironment(
  extractionRoot: string,
  seedCapability: string,
  tools: typeof trustedTools,
  npmConfigs: { readonly userConfig: string; readonly globalConfig: string },
) {
  const home = join(extractionRoot, '.home')
  const temporary = join(extractionRoot, '.tmp')
  const npmCache = join(extractionRoot, '.npm-cache')
  for (const directory of [home, temporary, npmCache]) {
    assertDescendant(directory, extractionRoot, 'isolated runtime directory')
    ensureSafeDirectory(directory)
  }
  return {
    CI: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: home,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NPM_CONFIG_CACHE: npmCache,
    NPM_CONFIG_GLOBALCONFIG: npmConfigs.globalConfig,
    NPM_CONFIG_USERCONFIG: npmConfigs.userConfig,
    PATH: `${dirname(tools.node)}:/usr/bin:/bin`,
    RAMEN_PARITY_SEED: seedCapability,
    TMPDIR: temporary,
    TZ: 'UTC',
  } as const
}

function validateNpmConfigFiles(
  environment: ExtractorEnvironment,
  extractionRoot: string,
  npmConfigs: { readonly userConfig: string; readonly globalConfig: string },
  identities: { readonly userConfig: FileIdentity; readonly globalConfig: FileIdentity },
): NpmConfigIdentity {
  if (npmConfigs.userConfig === npmConfigs.globalConfig) {
    throw new Error('npm config paths must be distinct')
  }
  for (const [label, path] of [
    ['npm user config', npmConfigs.userConfig],
    ['npm global config', npmConfigs.globalConfig],
  ] as const) {
    assertDescendant(path, extractionRoot, label)
    if (pathIsWithinOrEqual(path, environment.legacyRoot)) {
      throw new Error(`${label} must not refer to the original checkout`)
    }
    const inheritedHome = environment.inheritedEnvironment.HOME
    const inheritedNpmConfigPaths = [
      inheritedHome,
      inheritedHome ? join(inheritedHome, '.npmrc') : undefined,
      environment.inheritedEnvironment.NPM_CONFIG_USERCONFIG,
      environment.inheritedEnvironment.NPM_CONFIG_GLOBALCONFIG,
      environment.inheritedEnvironment.npm_config_userconfig,
      environment.inheritedEnvironment.npm_config_globalconfig,
    ].filter((candidate): candidate is string => Boolean(candidate))
    if (inheritedNpmConfigPaths.some((candidate) => resolve(candidate) === resolve(path))) {
      throw new Error(`${label} must not refer to inherited HOME`)
    }
    if ([
      '/dev/null',
      '/etc/npmrc',
      '/usr/local/etc/npmrc',
      '/opt/homebrew/etc/npmrc',
    ].some((systemPath) => pathIsWithinOrEqual(path, systemPath))) {
      throw new Error(`${label} must not refer to system npm configuration`)
    }
  }
  revalidateRegularFile(npmConfigs.userConfig, identities.userConfig, 'npm user config')
  revalidateRegularFile(npmConfigs.globalConfig, identities.globalConfig, 'npm global config')
  if (readNoFollowFile(npmConfigs.userConfig, 'npm user config').length !== 0) {
    throw new Error('npm user config must be empty')
  }
  if (readNoFollowFile(npmConfigs.globalConfig, 'npm global config').length !== 0) {
    throw new Error('npm global config must be empty')
  }
  return {
    userConfig: {
      path: npmConfigs.userConfig,
      type: 'regular-file',
      symbolicLink: false,
      validatedParentsContainSymbolicLink: false,
      size: 0,
    },
    globalConfig: {
      path: npmConfigs.globalConfig,
      type: 'regular-file',
      symbolicLink: false,
      validatedParentsContainSymbolicLink: false,
      size: 0,
    },
  }
}

async function execute(
  environment: ExtractorEnvironment,
  request: Omit<SpawnRequest, 'environment'> & {
    readonly environment: Readonly<Record<string, string>>
  },
) {
  try {
    const result = await environment.spawn(request)
    if ((result.exitCode ?? 0) !== 0) {
      throw new Error(result.stderr || result.stdout || `${request.role} exited non-zero`)
    }
    return result.stdout
  } catch (error) {
    throw new Error(sanitizeExternalError(error, maximumExternalMessageLength), {
      cause: error,
    })
  }
}

function exactLine(output: string) {
  return output.replace(/[\r\n]+$/g, '')
}

function parsePatchStatus(output: string) {
  if (!output) return []
  if (!output.endsWith('\0')) throw new Error('instrumentation patch drift')

  return output.slice(0, -1).split('\0').map((record) => {
    if (record.length < 4 || record[2] !== ' ') {
      throw new Error('instrumentation patch drift')
    }
    const status = record.slice(0, 2)
    const path = record.slice(3)
    if ((status !== ' M' && status !== '??') || !path) {
      throw new Error('instrumentation patch drift')
    }
    return { status, path }
  })
}

function assertExpectedValue(actual: string, expected: string, label: string) {
  if (actual !== expected) throw new Error(`${label} mismatch`)
}

function fingerprintsEqual(
  before: readonly IgnoredPathFingerprint[],
  after: readonly IgnoredPathFingerprint[],
) {
  return JSON.stringify(before) === JSON.stringify(after)
}

function assertTrustedTool(path: string, label: string) {
  const identity = assertNoFollowPath(path, { kind: 'file', allowMissingLeaf: false })
  if (!identity) throw new Error(`trusted ${label} is missing`)
}

function parseRawCases(bytes: Buffer): readonly RawTraceCase[] {
  let input: unknown
  try {
    input = JSON.parse(bytes.toString('utf8')) as unknown
  } catch {
    throw new Error('raw extraction output is not valid JSON')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('raw extraction output must be an object')
  }
  const object = input as Record<string, unknown>
  if (
    Object.keys(object).sort().join('\0') !== 'cases\0schemaVersion'
    || object.schemaVersion !== 1
    || !Array.isArray(object.cases)
  ) throw new Error('raw extraction output has an invalid envelope')

  return object.cases.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`raw extraction case ${index} must be an object`)
    }
    const rawCase = value as Record<string, unknown>
    if (Object.keys(rawCase).sort().join('\0') !== 'actions\0frames\0id\0seedIndex') {
      throw new Error('raw seed binding mismatch')
    }
    if (
      typeof rawCase.seedIndex !== 'number'
      || typeof rawCase.id !== 'string'
      || !Array.isArray(rawCase.actions)
      || !Array.isArray(rawCase.frames)
    ) throw new Error('raw seed binding mismatch')
    return rawCase as unknown as RawTraceCase
  })
}

function bindAndValidateCases(
  seeds: ReturnType<typeof legacyObservableSeedFileSchema.parse>,
  rawCases: readonly RawTraceCase[],
) {
  if (rawCases.length !== seeds.cases.length) throw new Error('raw seed binding mismatch')
  return rawCases.map((rawCase, index) => {
    const seed = seeds.cases[index]!
    if (
      rawCase.seedIndex !== index
      || rawCase.id !== seed.id
      || JSON.stringify(rawCase.actions) !== JSON.stringify(seed.actions)
    ) throw new Error('raw seed binding mismatch')
    const withoutCoverage = {
      id: rawCase.id,
      actions: rawCase.actions,
      frames: rawCase.frames,
    }
    return legacyObservableTraceCaseSchema.parse({
      ...withoutCoverage,
      coverageTags: deriveObservableCoverage(withoutCoverage),
    })
  })
}

function writeExclusive(path: string, content: string | Uint8Array) {
  writeFileSync(path, content, { flag: 'wx', mode: 0o600 })
}

function removeOwnedPath(path: string, expected?: FileIdentity) {
  const stats = lstatIfPresent(path)
  if (!stats) return
  if (stats.isSymbolicLink()) throw new Error(`refusing to remove symbolic link ${path}`)
  const matches = stats.isDirectory()
    ? expected === undefined || directoryIdentitiesEqual(expected, statsIdentity(stats))
    : expected === undefined || identitiesEqual(expected, statsIdentity(stats))
  if (!matches) {
    throw new Error(`run-owned path identity changed: ${path}`)
  }
  rmSync(path, { recursive: true, force: true })
}

function combineErrors(primary: unknown, secondary: readonly unknown[]) {
  const primaryMessage = sanitizeExternalError(primary, maximumExternalMessageLength)
  if (secondary.length === 0) return new Error(primaryMessage)
  const detail = secondary.map((error) => sanitizeExternalError(error, 80)).join('; ')
  return new Error(sanitizeExternalError(
    `${primaryMessage} [cleanup: ${detail}]`,
    maximumExternalMessageLength,
  ))
}

export async function runLegacyExtractor(
  environment: ExtractorEnvironment,
  options: RunLegacyExtractorOptions,
): Promise<LegacyExtractorResult> {
  const outputParent = dirname(environment.destination)
  const outputName = basename(environment.destination)
  const token = environment.randomToken()
  if (!/^[a-f0-9]{32,128}$/.test(token)) throw new Error('invalid extraction token')
  const paths = {
    staging: join(outputParent, `.${outputName}.staging-${token}`),
    backup: join(outputParent, `.${outputName}.backup-${token}`),
    extractionRoot: join(outputParent, `.${outputName}.extract-${token}`),
  }
  const worktree = join(paths.extractionRoot, 'worktree')
  const boundPatch = join(paths.extractionRoot, 'instrumentation.patch')
  const seedCopy = join(paths.extractionRoot, 'seed-copy.json')
  const rawOutput = join(paths.extractionRoot, 'raw-output.json')
  const capability = join(paths.extractionRoot, `capability-${token}.json`)
  const npmConfigs = {
    userConfig: join(paths.extractionRoot, 'npm-user-config'),
    globalConfig: join(paths.extractionRoot, 'npm-global-config'),
  }
  const lock = join(outputParent, `.${outputName}.lock`)
  environment.onRunPaths?.(paths)

  let lockDescriptor: number | undefined
  let lockIdentity: FileIdentity | undefined
  let extractionRootIdentity: FileIdentity | undefined
  let stagingIdentity: FileIdentity | undefined
  let worktreeAttempted = false
  let backupIdentity: FileIdentity | undefined
  let installedOutputIdentity: FileIdentity | undefined
  let published = false
  let primaryError: unknown
  const cleanupErrors: unknown[] = []
  let ignoredBefore: readonly IgnoredPathFingerprint[] = []
  let ignoredAfter: readonly IgnoredPathFingerprint[] = []
  let cases: readonly LegacyObservableTraceCase[] = []
  let manifest: unknown

  try {
    assertNoFollowPath(environment.legacyRoot, { kind: 'directory', allowMissingLeaf: false })
    assertNoFollowPath(environment.toolRoot, { kind: 'directory', allowMissingLeaf: false })
    assertNoFollowPath(environment.patchPath, { kind: 'file', allowMissingLeaf: false })
    assertNoFollowPath(environment.seedsPath, { kind: 'file', allowMissingLeaf: false })
    for (const source of environment.authoringSources) {
      assertNoFollowPath(source.path, { kind: 'file', allowMissingLeaf: false })
    }
    ensureSafeDirectory(outputParent)
    assertNoFollowPath(outputParent, { kind: 'directory', allowMissingLeaf: false })
    assertNoFollowPath(environment.destination, {
      kind: 'directory',
      allowMissingLeaf: true,
    })
    for (const tool of Object.entries(environment.tools)) assertTrustedTool(tool[1], tool[0])

    const {
      bytes: patchBytes,
      identity: externalPatchIdentity,
    } = readNoFollowFileWithIdentity(
      environment.patchPath,
      'instrumentation patch',
      environment.hooks.beforeReadPatch,
    )
    const verifiedPatchHash = sha256Bytes(patchBytes)
    assertExpectedValue(verifiedPatchHash, environment.expected.patchHash, 'patch hash')
    const patchTargets = parseInstrumentationPatchTargets(patchBytes)
    const seedBytes = readNoFollowFile(
      environment.seedsPath,
      'seed source',
      environment.hooks.beforeReadSeeds,
    )
    assertExpectedValue(sha256Bytes(seedBytes), environment.expected.seedsHash, 'seed hash')
    const seeds = legacyObservableSeedFileSchema.parse(
      JSON.parse(seedBytes.toString('utf8')) as unknown,
    )
    const authoringSourceIdentity = environment.authoringSources.map((source) => ({
      path: source.relativePath,
      hash: sha256Bytes(readNoFollowFile(source.path, `authoring source ${source.relativePath}`)),
    }))
    const authoringHash = computeExtractorAuthoringHash(authoringSourceIdentity)

    ignoredBefore = await Promise.all(ignoredExtractorSensitivePaths.map((path) => (
      fingerprintIgnoredPath(environment.legacyRoot, path)
    )))

    try {
      lockDescriptor = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
      writeFileSync(lockDescriptor, `${process.pid}\n`)
      closeSync(lockDescriptor)
      lockDescriptor = undefined
      lockIdentity = snapshotRegularFile(lock, 'extraction lock')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        throw new Error('extraction lock is already held', { cause: error })
      }
      throw error
    }

    if (!options.verifyOnly && lstatIfPresent(environment.destination) && !options.replace) {
      throw new Error('output already exists; pass --replace')
    }

    mkdirSync(paths.extractionRoot, { mode: 0o700 })
    extractionRootIdentity = snapshotRegularDirectory(paths.extractionRoot, 'extraction root')
    assertDescendant(boundPatch, paths.extractionRoot, 'bound instrumentation patch')
    writeExclusive(boundPatch, patchBytes)
    const boundPatchIdentity = snapshotRegularFile(boundPatch, 'bound instrumentation patch')
    writeExclusive(npmConfigs.userConfig, '')
    writeExclusive(npmConfigs.globalConfig, '')
    const npmConfigIdentities = {
      userConfig: snapshotRegularFile(npmConfigs.userConfig, 'npm user config'),
      globalConfig: snapshotRegularFile(npmConfigs.globalConfig, 'npm global config'),
    }
    const childEnvironment = makeChildEnvironment(
      paths.extractionRoot,
      '',
      environment.tools,
      npmConfigs,
    )

    const gitVersion = exactLine(await execute(environment, {
      role: 'git-version',
      executable: environment.tools.git,
      args: ['--version'],
      cwd: environment.legacyRoot,
      environment: childEnvironment,
    }))
    if (!/^git version 2\./.test(gitVersion)) throw new Error('trusted Git version mismatch')
    const nodeVersion = exactLine(await execute(environment, {
      role: 'node-version',
      executable: environment.tools.node,
      args: ['--version'],
      cwd: environment.legacyRoot,
      environment: childEnvironment,
    })).replace(/^v/, '')
    assertExpectedValue(nodeVersion, environment.expected.nodeVersion, 'Node version')
    const npmVersion = exactLine(await execute(environment, {
      role: 'npm-version',
      executable: environment.tools.node,
      args: [environment.tools.npmCli, '--version'],
      cwd: environment.legacyRoot,
      environment: childEnvironment,
    }))
    assertExpectedValue(npmVersion, environment.expected.npmVersion, 'npm version')

    const remote = normalizeGithubRepository(exactLine(await execute(environment, {
      role: 'legacy-remote',
      executable: environment.tools.git,
      args: ['-C', environment.legacyRoot, 'config', '--get', 'remote.origin.url'],
      cwd: environment.legacyRoot,
      environment: childEnvironment,
    })))
    if (JSON.stringify(remote) !== JSON.stringify(environment.expected.identity)) {
      throw new Error('legacy repository identity mismatch')
    }
    assertExpectedValue(exactLine(await execute(environment, {
      role: 'legacy-head',
      executable: environment.tools.git,
      args: ['-C', environment.legacyRoot, 'rev-parse', 'HEAD'],
      cwd: environment.legacyRoot,
      environment: childEnvironment,
    })), environment.expected.commit, 'legacy commit')
    assertExpectedValue(exactLine(await execute(environment, {
      role: 'legacy-tree',
      executable: environment.tools.git,
      args: ['-C', environment.legacyRoot, 'rev-parse', 'HEAD^{tree}'],
      cwd: environment.legacyRoot,
      environment: childEnvironment,
    })), environment.expected.treeHash, 'legacy tree')
    const status = await execute(environment, {
      role: 'legacy-status',
      executable: environment.tools.git,
      args: ['-C', environment.legacyRoot, 'status', '--porcelain=v1', '--untracked-files=all'],
      cwd: environment.legacyRoot,
      environment: childEnvironment,
    })
    if (status.trim()) throw new Error('legacy checkout is dirty')

    for (const [path, expectedHash] of Object.entries(environment.expected.trackedSourceHashes)) {
      const absolute = resolve(environment.legacyRoot, path)
      assertDescendant(absolute, environment.legacyRoot, 'tracked source')
      const bytes = readNoFollowFile(absolute, `tracked source ${path}`)
      assertExpectedValue(sha256Bytes(bytes), expectedHash, `tracked source hash ${path}`)
    }
    const lockfile = resolve(environment.legacyRoot, environment.expected.lockfilePath)
    assertDescendant(lockfile, environment.legacyRoot, 'legacy lockfile')
    const lockfileBytes = readNoFollowFile(lockfile, 'legacy lockfile')
    assertExpectedValue(sha256Bytes(lockfileBytes), environment.expected.lockfileHash, 'lockfile hash')

    worktreeAttempted = true
    await execute(environment, {
      role: 'git-worktree-add',
      executable: environment.tools.git,
      args: ['-C', environment.legacyRoot, 'worktree', 'add', '--detach', worktree, environment.expected.commit],
      cwd: environment.legacyRoot,
      environment: childEnvironment,
    })
    assertNoFollowPath(worktree, { kind: 'directory', allowMissingLeaf: false })
    writeExclusive(seedCopy, seedBytes.toString('utf8'))
    const seedCopyIdentity = snapshotRegularFile(seedCopy, 'copied seeds')
    revalidateRegularFile(seedCopy, seedCopyIdentity, 'copied seeds')
    environment.hooks.beforePatchCheck?.({
      externalPatch: environment.patchPath,
      boundPatch,
    })
    revalidateBoundPatch(
      environment.patchPath,
      externalPatchIdentity,
      boundPatch,
      boundPatchIdentity,
      verifiedPatchHash,
    )
    verifyInstrumentationPatchBase(worktree, patchTargets)

    await execute(environment, {
      role: 'patch-check',
      executable: environment.tools.git,
      args: [
        '-C',
        worktree,
        'apply',
        '--unidiff-zero',
        '--check',
        boundPatch,
      ],
      cwd: worktree,
      environment: childEnvironment,
    })
    revalidateBoundPatch(
      environment.patchPath,
      externalPatchIdentity,
      boundPatch,
      boundPatchIdentity,
      verifiedPatchHash,
    )
    await execute(environment, {
      role: 'patch-apply',
      executable: environment.tools.git,
      args: ['-C', worktree, 'apply', '--unidiff-zero', boundPatch],
      cwd: worktree,
      environment: childEnvironment,
    })
    verifyInstrumentationPatchResult(worktree, patchTargets)
    await execute(environment, {
      role: 'patch-diff-check',
      executable: environment.tools.git,
      args: ['-C', worktree, 'diff', '--check'],
      cwd: worktree,
      environment: childEnvironment,
    })
    const changedFiles = parsePatchStatus(await execute(environment, {
      role: 'patch-diff-files',
      executable: environment.tools.git,
      args: [
        '-C',
        worktree,
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
        '--',
      ],
      cwd: worktree,
      environment: childEnvironment,
    })).sort((left, right) => codePointCompare(left.path, right.path))
    const expectedChangedFiles = [
      { status: ' M', path: 'src/App.tsx' },
      { status: '??', path: 'src/parity-question-extractor.test.tsx' },
    ]
    if (JSON.stringify(changedFiles) !== JSON.stringify(expectedChangedFiles)) {
      throw new Error('instrumentation patch drift')
    }

    environment.hooks.beforeNpmInvocation?.(npmConfigs)
    const npmConfigIdentity = validateNpmConfigFiles(
      environment,
      paths.extractionRoot,
      npmConfigs,
      npmConfigIdentities,
    )
    await execute(environment, {
      role: 'npm-ci',
      executable: environment.tools.node,
      args: [environment.tools.npmCli, 'ci', '--ignore-scripts'],
      cwd: worktree,
      environment: childEnvironment,
      npmConfigIdentity,
    })
    const physicalNodeModules = join(worktree, 'node_modules')
    assertDescendant(physicalNodeModules, paths.extractionRoot, 'temporary node_modules')
    assertNoFollowPath(physicalNodeModules, { kind: 'directory', allowMissingLeaf: false })
    const vitest = join(physicalNodeModules, 'vitest/vitest.mjs')
    assertNoFollowPath(vitest, { kind: 'file', allowMissingLeaf: false })
    ensureSafeDirectory(join(physicalNodeModules, '.tmp'))

    await execute(environment, {
      role: 'legacy-full-suite',
      executable: environment.tools.node,
      args: [vitest, 'run'],
      cwd: worktree,
      environment: childEnvironment,
    })

    writeExclusive(capability, stableJson({
      schemaVersion: 1,
      seedPath: seedCopy,
      rawOutputPath: rawOutput,
      token,
    }))
    const capabilityIdentity = snapshotRegularFile(capability, 'raw output capability')
    revalidateRegularFile(capability, capabilityIdentity, 'raw output capability')
    const extractionEnvironment = makeChildEnvironment(
      paths.extractionRoot,
      capability,
      environment.tools,
      npmConfigs,
    )
    await execute(environment, {
      role: 'legacy-network-denied-extraction',
      executable: environment.tools.sandboxExec,
      args: [
        '-p',
        sandboxProfile,
        environment.tools.node,
        vitest,
        'run',
        'src/parity-question-extractor.test.tsx',
      ],
      cwd: worktree,
      environment: extractionEnvironment,
    })
    const rawIdentity = snapshotRegularFile(rawOutput, 'raw output')
    environment.hooks.beforeReadRaw?.(rawOutput)
    revalidateRegularFile(rawOutput, rawIdentity, 'raw output')
    const rawBytes = readNoFollowFile(rawOutput, 'raw output')
    cases = bindAndValidateCases(seeds, parseRawCases(rawBytes))

    const casesPayload = {
      schemaVersion: 1,
      cases,
    }
    const casesJson = stableJson(casesPayload)
    const revalidatedAuthoringSourceIdentity = environment.authoringSources.map((source) => ({
      path: source.relativePath,
      hash: sha256Bytes(readNoFollowFile(source.path, `authoring source ${source.relativePath}`)),
    }))
    if (JSON.stringify(revalidatedAuthoringSourceIdentity) !== JSON.stringify(authoringSourceIdentity)) {
      throw new Error('authoring source identity changed during extraction')
    }
    manifest = fixtureManifestSchema.parse({
      fixtureSchemaVersion: 1,
      caseSchemaVersion: 1,
      source: {
        repository: environment.expected.identity,
        commit: environment.expected.commit,
        treeHash: environment.expected.treeHash,
        trackedSourceHashes: environment.expected.trackedSourceHashes,
        lockfilePath: environment.expected.lockfilePath,
        lockfileHash: environment.expected.lockfileHash,
      },
      extractor: {
        version: 1,
        sources: authoringSourceIdentity,
        hash: authoringHash,
      },
      instrumentation: { version: 1, hash: verifiedPatchHash },
      runtime: {
        nodeVersion: environment.expected.nodeVersion,
        npmVersion: environment.expected.npmVersion,
        timezone: 'UTC',
        locale: 'C.UTF-8',
        seed: extractionSeed,
        lifecycleScripts: 'disabled',
        extractionNetwork: 'denied',
        dependencies: 'physical-isolated',
        fullSuiteBeforeExtraction: true,
        npmConfigPolicy: {
          userConfig: 'isolated-empty-file',
          globalConfig: 'isolated-empty-file',
          distinctFiles: true,
          npmArgvModified: false,
        },
      },
      caseIds: cases.map(({ id }) => id),
      caseCount: cases.length,
      fixtureContentHash: sha256Bytes(casesJson),
    })

    if (!options.verifyOnly) {
      mkdirSync(paths.staging, { mode: 0o700 })
      stagingIdentity = snapshotRegularDirectory(paths.staging, 'staging output')
      writeExclusive(join(paths.staging, 'cases.json'), casesJson)
      writeExclusive(join(paths.staging, 'manifest.json'), stableJson(manifest))
      legacyObservableTraceCaseSchema.array().parse(cases)
      fixtureManifestSchema.parse(manifest)
    }
  } catch (error) {
    primaryError = error
  }

  if (worktreeAttempted) {
    try {
      const environmentForCleanup = makeChildEnvironment(
        paths.extractionRoot,
        '',
        environment.tools,
        npmConfigs,
      )
      await execute(environment, {
        role: 'git-worktree-remove',
        executable: environment.tools.git,
        args: ['-C', environment.legacyRoot, 'worktree', 'remove', '--force', worktree],
        cwd: environment.legacyRoot,
        environment: environmentForCleanup,
      })
    } catch (error) {
      cleanupErrors.push(error)
    }
    try {
      const environmentForCleanup = makeChildEnvironment(
        paths.extractionRoot,
        '',
        environment.tools,
        npmConfigs,
      )
      await execute(environment, {
        role: 'git-worktree-prune',
        executable: environment.tools.git,
        args: ['-C', environment.legacyRoot, 'worktree', 'prune', '--expire', 'now'],
        cwd: environment.legacyRoot,
        environment: environmentForCleanup,
      })
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  try {
    if (extractionRootIdentity) removeOwnedPath(paths.extractionRoot, extractionRootIdentity)
  } catch (error) {
    cleanupErrors.push(error)
  }

  try {
    ignoredAfter = await Promise.all(ignoredExtractorSensitivePaths.map((path) => (
      fingerprintIgnoredPath(environment.legacyRoot, path)
    )))
    if (!fingerprintsEqual(ignoredBefore, ignoredAfter)) {
      throw new Error('original ignored path changed')
    }
  } catch (error) {
    if (!primaryError) primaryError = error
    else cleanupErrors.push(error)
  }

  if (!primaryError && !options.verifyOnly) {
    try {
      assertNoFollowPath(outputParent, { kind: 'directory', allowMissingLeaf: false })
      if (lstatIfPresent(environment.destination)) {
        if (!options.replace) throw new Error('output already exists; pass --replace')
        const existingOutputIdentity = snapshotRegularDirectory(
          environment.destination,
          'existing output',
        )
        renameSync(environment.destination, paths.backup)
        revalidateRegularDirectory(paths.backup, existingOutputIdentity, 'backup output')
        backupIdentity = existingOutputIdentity
      }
      if (!stagingIdentity) throw new Error('staging output is missing')
      environment.hooks.beforePublishStaging?.(paths.staging)
      revalidateRegularDirectory(paths.staging, stagingIdentity, 'staging output')
      assertNoFollowPath(environment.destination, {
        kind: 'directory',
        allowMissingLeaf: true,
      })
      const replacementIdentity = stagingIdentity
      renameSync(paths.staging, environment.destination)
      stagingIdentity = undefined
      installedOutputIdentity = replacementIdentity
      revalidateRegularDirectory(
        environment.destination,
        replacementIdentity,
        'installed output',
      )
      environment.hooks.afterPublishStaging?.(environment.destination)
      published = true
    } catch (error) {
      primaryError = error
    }
  }

  if (!primaryError && published && backupIdentity) {
    try {
      removeOwnedPath(paths.backup, backupIdentity)
      backupIdentity = undefined
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  if (primaryError && installedOutputIdentity) {
    try {
      removeOwnedPath(environment.destination, installedOutputIdentity)
      installedOutputIdentity = undefined
      published = false
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  if (primaryError && backupIdentity) {
    try {
      environment.hooks.beforeRollback?.(paths.backup)
      revalidateRegularDirectory(paths.backup, backupIdentity, 'backup output')
      if (lstatIfPresent(environment.destination)) {
        throw new Error('rollback destination is not empty')
      }
      const previousOutputIdentity = backupIdentity
      renameSync(paths.backup, environment.destination)
      backupIdentity = undefined
      revalidateRegularDirectory(
        environment.destination,
        previousOutputIdentity,
        'restored output',
      )
      published = false
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  if (stagingIdentity) {
    try {
      removeOwnedPath(paths.staging, stagingIdentity)
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  if (lockDescriptor !== undefined) {
    try {
      closeSync(lockDescriptor)
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (lockIdentity) {
    try {
      revalidateRegularFile(lock, lockIdentity, 'extraction lock')
      unlinkSync(lock)
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  if (primaryError) throw combineErrors(primaryError, cleanupErrors)
  if (cleanupErrors.length > 0) throw combineErrors('extractor cleanup failed', cleanupErrors)
  return {
    cases,
    manifest,
    published,
    ignoredFingerprintsBefore: ignoredBefore,
    ignoredFingerprintsAfter: ignoredAfter,
  }
}

function snapshotRegularDirectory(path: string, label: string) {
  const identity = assertNoFollowPath(path, { kind: 'directory', allowMissingLeaf: false })
  if (!identity) throw new Error(`${label} is missing`)
  return identity
}

function revalidateRegularDirectory(path: string, expected: FileIdentity, label: string) {
  let received: FileIdentity
  try {
    received = snapshotRegularDirectory(path, label)
  } catch {
    throw new Error(`${label} identity changed`)
  }
  if (!directoryIdentitiesEqual(expected, received)) throw new Error(`${label} identity changed`)
}

function directoryIdentitiesEqual(left: FileIdentity, right: FileIdentity) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
}
