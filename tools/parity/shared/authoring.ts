import { createHash, randomBytes } from 'node:crypto'
import {
  accessSync,
  closeSync,
  constants,
  cpSync,
  createReadStream,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from 'node:fs'
import { spawn } from 'node:child_process'
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'

import {
  type AuthoringEnvironment,
  type AuthoringExpectedLineage,
  type CopyValidatedDependencyProvisioning,
  type CreateAuthoringEnvironmentInput,
  type ExtractorTools,
  type FixtureAuthoringAdapter,
  type FixtureAuthoringCommandResult,
  type FixtureAuthoringResult,
  type IgnoredPathFingerprint,
  type InstrumentationTransactionDescriptor,
  type ManifestBuildInput,
  type NpmConfigIdentity,
  type PublicationCleanupWarning,
  type PublicationError,
  type RunFixtureAuthoringOptions,
  type SpawnRequest,
  type SpawnResult,
} from './contracts.js'

export const trustedTools = {
  git: '/usr/bin/git',
  node: '/Users/ansonhui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node',
  npmCli: '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js',
  sandboxExec: '/usr/bin/sandbox-exec',
} as const

export const ignoredExtractorSensitivePaths = [
  'node_modules/.tmp/tsconfig.app.tsbuildinfo',
  'node_modules/.tmp/tsconfig.node.tsbuildinfo',
] as const

export type IgnoredExtractorSensitivePath =
  (typeof ignoredExtractorSensitivePaths)[number]

type LockReleaseState = 'held' | 'released' | 'indeterminate'

interface LockReleaseResult {
  readonly state: LockReleaseState
  readonly error?: unknown
}

class PublicationFailureException extends Error {
  constructor(
    readonly publicationCode: PublicationError['code'],
    message: string,
  ) {
    super(message)
  }
}

type RecoveryArchiveEntry =
  | {
      readonly path: string
      readonly type: 'directory'
    }
  | {
      readonly path: string
      readonly type: 'file'
      readonly contentBase64: string
    }

interface RecoveryArchiveIdentity {
  readonly file: FileIdentity
  readonly sha256: string
}

interface ExpectedFixtureFile {
  readonly json: Uint8Array
  readonly sha256: string
  readonly identity: FileIdentity
}

interface ExpectedFixtureFiles {
  readonly cases: ExpectedFixtureFile
  readonly manifest: ExpectedFixtureFile
}

interface FileIdentity {
  readonly dev: number
  readonly ino: number
  readonly mode: number
  readonly size: number
  readonly mtimeMs: number
}

const sandboxProfile = '(version 1)(allow default)(deny network*)'
const copyValidatedCommandDeadlineMs = 120_000
const copyValidatedTerminationGraceMs = 2_000
const maximumExternalMessageLength = 300
const publicationCleanupAttemptLimit = 3
const publicationCleanupWarningMessage =
  'Published fixtures; retained a verified recovery backup after backup cleanup failed.'
const indeterminateLockReleaseMessage =
  'publication lock release is indeterminate; recovery required'
const publicationFailedMessage = 'legacy extraction or publication failed'

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

function parseFixtureJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
}

function bytesEqual(left: Uint8Array | string, right: Uint8Array | string) {
  return Buffer.from(left).equals(Buffer.from(right))
}

function validateFixtureDirectoryOnDisk<
  Seed,
  Case,
  Manifest,
  Expected extends AuthoringExpectedLineage,
>(
  directory: string,
  directoryIdentity: FileIdentity,
  expected: ExpectedFixtureFiles,
  adapter: FixtureAuthoringAdapter<Seed, Case, Manifest, Expected>,
  seeds: readonly Seed[],
  manifest: Manifest,
) {
  revalidateRegularDirectory(directory, directoryIdentity, 'fixture directory')
  const entries = readdirSync(directory).sort(codePointCompare)
  revalidateRegularDirectory(directory, directoryIdentity, 'fixture directory')
  if (JSON.stringify(entries) !== JSON.stringify(['cases.json', 'manifest.json'])) {
    throw new Error('fixture directory must contain exactly cases.json and manifest.json')
  }

  const casesPath = join(directory, 'cases.json')
  const manifestPath = join(directory, 'manifest.json')
  revalidateRegularFile(casesPath, expected.cases.identity, 'fixture cases file')
  revalidateRegularFile(manifestPath, expected.manifest.identity, 'fixture manifest file')
  const actualCases = readNoFollowFileWithIdentity(casesPath, 'fixture cases file')
  const actualManifest = readNoFollowFileWithIdentity(manifestPath, 'fixture manifest file')
  if (!identitiesEqual(actualCases.identity, expected.cases.identity)) {
    throw new Error('fixture cases file identity changed')
  }
  if (!identitiesEqual(actualManifest.identity, expected.manifest.identity)) {
    throw new Error('fixture manifest file identity changed')
  }
  revalidateRegularFile(casesPath, expected.cases.identity, 'fixture cases file')
  revalidateRegularFile(manifestPath, expected.manifest.identity, 'fixture manifest file')

  const cases = adapter.validateCases(
    adapter.parseRawCases(parseFixtureJson(actualCases.bytes, 'fixture cases')),
    seeds,
  )
  parseFixtureJson(actualManifest.bytes, 'fixture manifest')
  const canonicalCasesJson = adapter.serializeCases(cases)
  const canonicalManifestJson = adapter.serializeManifest(manifest)
  if (!bytesEqual(actualCases.bytes, canonicalCasesJson)) {
    throw new Error('fixture cases file is not stable canonical JSON')
  }
  if (!bytesEqual(actualManifest.bytes, canonicalManifestJson)) {
    throw new Error('fixture manifest file is not stable canonical JSON')
  }

  const actualCasesHash = sha256Bytes(actualCases.bytes)

  if (
    !bytesEqual(actualCases.bytes, expected.cases.json)
    || actualCasesHash !== expected.cases.sha256
  ) throw new Error('fixture cases file does not match generated cases')
  if (
    !bytesEqual(actualManifest.bytes, expected.manifest.json)
    || sha256Bytes(actualManifest.bytes) !== expected.manifest.sha256
  ) throw new Error('fixture manifest file does not match generated manifest')

  revalidateRegularFile(casesPath, expected.cases.identity, 'fixture cases file')
  revalidateRegularFile(manifestPath, expected.manifest.identity, 'fixture manifest file')
  revalidateRegularDirectory(directory, directoryIdentity, 'fixture directory')
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
  readonly path: string
  readonly status: ' M' | '??'
  readonly oldHash: string
  readonly newHash: string
}

const compatibilityInstrumentation = {
  targets: [
    { path: 'src/App.tsx', status: ' M' as const },
    { path: 'src/parity-question-extractor.test.tsx', status: '??' as const },
  ],
  extractionTestPath: 'src/parity-question-extractor.test.tsx',
  dependencyProvisioning: { kind: 'npm-ci' as const },
}

function assertSafeInstrumentationPath(path: string) {
  if (
    path.length === 0
    || path.length > 240
    || isAbsolute(path)
    || path.includes('\\')
    || !/^[A-Za-z0-9._/-]+$/.test(path)
    || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) throw new Error('invalid instrumentation descriptor path')
}

function assertExactOwnKeys(
  value: object,
  expectedKeys: readonly string[],
  label: string,
) {
  const receivedKeys = Object.keys(value).sort(codePointCompare)
  const canonicalExpectedKeys = [...expectedKeys].sort(codePointCompare)
  if (JSON.stringify(receivedKeys) !== JSON.stringify(canonicalExpectedKeys)) {
    throw new Error(`invalid ${label} keys`)
  }
}

function validateInstrumentationDescriptor(
  descriptor: CreateAuthoringEnvironmentInput<AuthoringExpectedLineage>['instrumentation'],
  expected: AuthoringExpectedLineage,
) {
  const received = descriptor ?? compatibilityInstrumentation
  assertExactOwnKeys(
    received,
    ['targets', 'extractionTestPath', 'dependencyProvisioning'],
    'instrumentation descriptor',
  )
  if (received.targets.length === 0 || received.targets.length > 16) {
    throw new Error('invalid instrumentation descriptor targets')
  }
  const seen = new Set<string>()
  const targets = received.targets.map((target) => {
    assertExactOwnKeys(target, ['path', 'status'], 'instrumentation target')
    assertSafeInstrumentationPath(target.path)
    if ((target.status !== ' M' && target.status !== '??') || seen.has(target.path)) {
      throw new Error('invalid instrumentation descriptor targets')
    }
    seen.add(target.path)
    return Object.freeze({ path: target.path, status: target.status })
  })
  assertSafeInstrumentationPath(received.extractionTestPath)
  if (
    !/\.test\.tsx?$/.test(received.extractionTestPath)
    || !targets.some(({ path, status }) => (
      path === received.extractionTestPath && status === '??'
    ))
  ) throw new Error('invalid instrumentation descriptor extraction entrypoint')

  const dependencyProvisioningValue: unknown = received.dependencyProvisioning
  if (
    !dependencyProvisioningValue
    || typeof dependencyProvisioningValue !== 'object'
    || Array.isArray(dependencyProvisioningValue)
  ) throw new Error('invalid instrumentation descriptor dependency policy')
  const dependencyProvisioning = dependencyProvisioningValue as
    InstrumentationTransactionDescriptor['dependencyProvisioning']
  let canonicalDependencyProvisioning: InstrumentationTransactionDescriptor['dependencyProvisioning']
  if (dependencyProvisioning.kind === 'npm-ci') {
    assertExactOwnKeys(dependencyProvisioning, ['kind'], 'npm-ci dependency policy')
    if (typeof (expected as { readonly npmVersion?: unknown }).npmVersion !== 'string') {
      throw new Error('invalid instrumentation descriptor dependency evidence')
    }
    canonicalDependencyProvisioning = Object.freeze({ kind: 'npm-ci' })
  } else if (dependencyProvisioning.kind === 'copy-validated') {
    assertExactOwnKeys(
      dependencyProvisioning,
      [
        'kind',
        'sourcePath',
        'installedLockfilePath',
        'installedLockfileHash',
        'dependencyTreeHash',
      ],
      'copy-validated dependency policy',
    )
    if (
      (expected as { readonly npmVersion?: unknown }).npmVersion !== undefined
      || dependencyProvisioning.sourcePath !== 'node_modules'
      || dependencyProvisioning.installedLockfilePath !== 'node_modules/.package-lock.json'
      || !/^[a-f0-9]{64}$/.test(dependencyProvisioning.installedLockfileHash)
      || !/^[a-f0-9]{64}$/.test(dependencyProvisioning.dependencyTreeHash)
    ) throw new Error('invalid instrumentation descriptor dependency evidence')
    canonicalDependencyProvisioning = Object.freeze({
      kind: 'copy-validated',
      sourcePath: dependencyProvisioning.sourcePath,
      installedLockfilePath: dependencyProvisioning.installedLockfilePath,
      installedLockfileHash: dependencyProvisioning.installedLockfileHash,
      dependencyTreeHash: dependencyProvisioning.dependencyTreeHash,
    })
  } else {
    throw new Error('invalid instrumentation descriptor dependency policy')
  }
  return Object.freeze({
    targets: Object.freeze(targets),
    extractionTestPath: received.extractionTestPath,
    dependencyProvisioning: canonicalDependencyProvisioning,
  })
}

function parseInstrumentationPatchTargets(
  bytes: Buffer,
  expectedTargets: readonly { readonly path: string; readonly status: ' M' | '??' }[],
): readonly InstrumentationPatchTarget[] {
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
  if (
    targets.length !== expectedTargets.length
    || targets.some((target, index) => (
      target.path !== expectedTargets[index]?.path
      || target.oldHash === undefined
      || target.newHash === undefined
      || target.newHash === '0'.repeat(40)
      || (
        expectedTargets[index]?.status === ' M'
        && target.oldHash === '0'.repeat(40)
      )
      || (
        expectedTargets[index]?.status === '??'
        && target.oldHash !== '0'.repeat(40)
      )
    ))
  ) throw new Error('instrumentation patch content mismatch')
  return targets.map((target, index) => ({
    path: target.path,
    status: expectedTargets[index]!.status,
    oldHash: target.oldHash!,
    newHash: target.newHash!,
  }))
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

type DependencyTreeManifestEntry =
  | {
      readonly path: string
      readonly type: 'directory'
    }
  | {
      readonly path: string
      readonly type: 'regular-file'
      readonly sha256: string
    }
  | {
      readonly path: string
      readonly type: 'symbolic-link'
      readonly target: string
    }

interface DependencyTreeSnapshot {
  readonly manifest: readonly DependencyTreeManifestEntry[]
  readonly manifestJson: string
  readonly manifestHash: string
}

interface CopyValidatedSourceIdentity {
  readonly source: string
  readonly tree: DependencyTreeSnapshot
  readonly installedLockfile: string
  readonly installedLockfileIdentity: FileIdentity
  readonly installedLockfileHash: string
}

function assertSafeDependencyRelativePath(path: string) {
  let containsControlCharacter = false
  for (const character of path) {
    const codePoint = character.codePointAt(0)!
    if (codePoint <= 31 || codePoint === 127) {
      containsControlCharacter = true
      break
    }
  }
  if (
    !path
    || path.length > 1_024
    || isAbsolute(path)
    || path.includes('\\')
    || containsControlCharacter
    || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) throw new Error('unsafe dependency entry path')
}

function snapshotDependencyTree(root: string): DependencyTreeSnapshot {
  assertNoFollowPath(root, { kind: 'directory', allowMissingLeaf: false })
  const entries: DependencyTreeManifestEntry[] = []
  const visit = (directory: string, prefix: string) => {
    const directoryIdentity = snapshotRegularDirectory(directory, 'dependency directory')
    const names = readdirSync(directory).sort(codePointCompare)
    revalidateRegularDirectory(directory, directoryIdentity, 'dependency directory')
    for (const name of names) {
      const relativePath = prefix ? `${prefix}/${name}` : name
      assertSafeDependencyRelativePath(relativePath)
      const path = join(directory, name)
      const stats = lstatSync(path)
      const identity = statsIdentity(stats)
      if (stats.isDirectory() && !stats.isSymbolicLink()) {
        entries.push({ path: relativePath, type: 'directory' })
        visit(path, relativePath)
        continue
      }
      if (stats.isFile() && !stats.isSymbolicLink()) {
        const bytes = readNoFollowFile(path, `dependency file ${relativePath}`)
        entries.push({
          path: relativePath,
          type: 'regular-file',
          sha256: sha256Bytes(bytes),
        })
        continue
      }
      if (stats.isSymbolicLink()) {
        const target = readlinkSync(path)
        if (isAbsolute(target)) throw new Error('dependency symbolic link is absolute')
        const lexicalTarget = resolve(dirname(path), target)
        if (!pathIsWithinOrEqual(lexicalTarget, root)) {
          throw new Error('dependency symbolic link escapes its root')
        }
        let resolvedTarget: string
        try {
          resolvedTarget = realpathSync(path)
        } catch {
          throw new Error('dependency symbolic link is broken or cyclic')
        }
        if (!pathIsWithinOrEqual(resolvedTarget, root)) {
          throw new Error('dependency symbolic link escapes its root')
        }
        const received = lstatSync(path)
        if (!received.isSymbolicLink() || !identitiesEqual(identity, statsIdentity(received))) {
          throw new Error('dependency symbolic link identity changed')
        }
        if (readlinkSync(path) !== target) {
          throw new Error('dependency symbolic link identity changed')
        }
        entries.push({ path: relativePath, type: 'symbolic-link', target })
        continue
      }
      throw new Error('unsupported dependency entry')
    }
    revalidateRegularDirectory(directory, directoryIdentity, 'dependency directory')
  }
  visit(root, '')
  const manifestJson = stableJson(entries)
  return {
    manifest: entries,
    manifestJson,
    manifestHash: sha256Bytes(manifestJson),
  }
}

function snapshotCopyValidatedSource(
  legacyRoot: string,
  policy: CopyValidatedDependencyProvisioning,
): CopyValidatedSourceIdentity {
  const source = resolve(legacyRoot, policy.sourcePath)
  assertDescendant(source, legacyRoot, 'source dependency tree')
  const tree = snapshotDependencyTree(source)
  if (tree.manifestHash !== policy.dependencyTreeHash) {
    throw new Error('dependency tree hash mismatch')
  }
  const installedLockfile = resolve(legacyRoot, policy.installedLockfilePath)
  assertDescendant(installedLockfile, source, 'installed dependency lockfile')
  const installed = readNoFollowFileWithIdentity(
    installedLockfile,
    'installed dependency lockfile',
  )
  const installedLockfileHash = sha256Bytes(installed.bytes)
  if (installedLockfileHash !== policy.installedLockfileHash) {
    throw new Error('dependency lock hash mismatch')
  }
  return {
    source,
    tree,
    installedLockfile,
    installedLockfileIdentity: installed.identity,
    installedLockfileHash,
  }
}

function revalidateCopyValidatedSource(identity: CopyValidatedSourceIdentity) {
  const received = snapshotDependencyTree(identity.source)
  if (received.manifestJson !== identity.tree.manifestJson) {
    throw new Error('source dependency tree changed')
  }
  revalidateRegularFile(
    identity.installedLockfile,
    identity.installedLockfileIdentity,
    'installed dependency lockfile',
  )
  const lockHash = sha256Bytes(readNoFollowFile(
    identity.installedLockfile,
    'installed dependency lockfile',
  ))
  if (lockHash !== identity.installedLockfileHash) {
    throw new Error('source dependency lock changed')
  }
}

function copyValidatedDependencies(
  identity: CopyValidatedSourceIdentity,
  destination: string,
  hook?: AuthoringEnvironment<AuthoringExpectedLineage>['hooks']['afterDependencyCopy'],
) {
  assertNoFollowPath(destination, { kind: 'directory', allowMissingLeaf: true })
  cpSync(identity.source, destination, {
    dereference: false,
    errorOnExist: true,
    force: false,
    preserveTimestamps: true,
    recursive: true,
    verbatimSymlinks: true,
  })
  hook?.({ source: identity.source, destination })
  const copied = snapshotDependencyTree(destination)
  if (copied.manifestJson !== identity.tree.manifestJson) {
    throw new Error('destination dependency manifest mismatch')
  }
  revalidateCopyValidatedSource(identity)
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

export async function spawnAuthoringCommand(request: SpawnRequest): Promise<SpawnResult> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(request.executable, [...request.args], {
      cwd: request.cwd,
      env: { ...request.environment },
      detached: request.deadlineMs !== undefined,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let deadline: ReturnType<typeof setTimeout> | undefined
    let escalation: ReturnType<typeof setTimeout> | undefined
    const appendBounded = (current: string, chunk: Buffer) => (
      `${current}${chunk.toString('utf8')}`.slice(-65_536)
    )
    const clearTimers = () => {
      if (deadline) clearTimeout(deadline)
      if (escalation) clearTimeout(escalation)
    }
    const signalProcessGroup = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return
      try {
        process.kill(-child.pid, signal)
      } catch {
        try {
          child.kill(signal)
        } catch {
          // The close/error handlers own the bounded result.
        }
      }
    }
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk)
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimers()
      reject(error)
    })
    child.on('close', (exitCode) => {
      if (settled) return
      settled = true
      clearTimers()
      if (timedOut) {
        reject(new Error(`${request.role} exceeded ${request.deadlineMs} ms deadline`))
        return
      }
      resolvePromise({ stdout, stderr, exitCode: exitCode ?? 1 })
    })
    if (request.deadlineMs !== undefined) {
      deadline = setTimeout(() => {
        timedOut = true
        signalProcessGroup('SIGTERM')
        escalation = setTimeout(
          () => signalProcessGroup('SIGKILL'),
          request.terminationGraceMs ?? 0,
        )
      }, request.deadlineMs)
    }
  })
}

export function createAuthoringEnvironment<Expected extends AuthoringExpectedLineage>(
  input: CreateAuthoringEnvironmentInput<Expected>,
): AuthoringEnvironment<Expected> {
  const instrumentation = validateInstrumentationDescriptor(
    input.instrumentation,
    input.expected,
  )
  const tools = input.tools ?? trustedTools
  if (
    instrumentation.dependencyProvisioning.kind === 'copy-validated'
    && (
      tools.node !== trustedTools.node
      || tools.sandboxExec !== trustedTools.sandboxExec
    )
  ) throw new Error('copy-validated requires shared trusted executables')
  return {
    inheritedEnvironment: input.inheritedEnvironment ?? {},
    legacyRoot: resolve(input.legacyRoot),
    toolRoot: resolve(input.toolRoot),
    destination: resolve(input.destination),
    patchPath: resolve(input.patchPath),
    seedsPath: resolve(input.seedsPath),
    authoringSources: input.authoringSources.map((source) => ({
      relativePath: source.relativePath,
      path: resolve(source.path),
    })),
    tools,
    expected: input.expected,
    instrumentation,
    spawn: input.spawn ?? spawnAuthoringCommand,
    randomToken: input.randomToken ?? (() => randomBytes(16).toString('hex')),
    ...(input.onRunPaths ? { onRunPaths: input.onRunPaths } : {}),
    hooks: input.hooks ?? {},
  }
}

function makeChildEnvironment(
  extractionRoot: string,
  seedCapability: string,
  tools: ExtractorTools,
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

function makeCopyValidatedChildEnvironment(
  extractionRoot: string,
  seedCapability: string,
  tools: ExtractorTools,
) {
  const home = join(extractionRoot, '.home')
  const temporary = join(extractionRoot, '.tmp')
  for (const directory of [home, temporary]) {
    assertDescendant(directory, extractionRoot, 'isolated runtime directory')
    ensureSafeDirectory(directory)
  }
  const pathDirectories = [dirname(tools.node), '/usr/bin', '/bin']
  for (const directory of pathDirectories) {
    for (const command of ['npm', 'npx']) {
      try {
        accessSync(join(directory, command), constants.X_OK)
        throw new Error('copy-validated PATH exposes npm or npx')
      } catch (error) {
        if (
          !(error instanceof Error && 'code' in error)
          || (error.code !== 'ENOENT' && error.code !== 'EACCES')
        ) throw error
      }
    }
  }
  return {
    CI: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: home,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PATH: pathDirectories.join(':'),
    RAMEN_PARITY_SEED: seedCapability,
    TMPDIR: temporary,
    TZ: 'UTC',
  } as const
}

function validateNpmConfigFiles(
  environment: AuthoringEnvironment<AuthoringExpectedLineage>,
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
  environment: AuthoringEnvironment<AuthoringExpectedLineage>,
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

async function verifyOriginalCheckoutIdentity(
  environment: AuthoringEnvironment<AuthoringExpectedLineage>,
  childEnvironment: Readonly<Record<string, string>>,
  expectedRootIdentity: FileIdentity,
) {
  revalidateRegularDirectory(
    environment.legacyRoot,
    expectedRootIdentity,
    'legacy root',
  )
  const failures: unknown[] = []
  const capture = async (verification: () => Promise<void> | void) => {
    try {
      await verification()
    } catch (error) {
      failures.push(error)
    }
  }

  await capture(async () => {
    assertExpectedValue(exactLine(await execute(environment, {
      role: 'legacy-head',
      executable: environment.tools.git,
      args: ['-C', environment.legacyRoot, 'rev-parse', 'HEAD'],
      cwd: environment.legacyRoot,
      environment: childEnvironment,
    })), environment.expected.commit, 'legacy commit')
  })
  await capture(async () => {
    assertExpectedValue(exactLine(await execute(environment, {
      role: 'legacy-tree',
      executable: environment.tools.git,
      args: ['-C', environment.legacyRoot, 'rev-parse', 'HEAD^{tree}'],
      cwd: environment.legacyRoot,
      environment: childEnvironment,
    })), environment.expected.treeHash, 'legacy tree')
  })
  await capture(async () => {
    const status = await execute(environment, {
      role: 'legacy-status',
      executable: environment.tools.git,
      args: ['-C', environment.legacyRoot, 'status', '--porcelain=v1', '--untracked-files=all'],
      cwd: environment.legacyRoot,
      environment: childEnvironment,
    })
    if (status.trim()) throw new Error('legacy checkout is dirty')
  })
  for (const [path, expectedHash] of Object.entries(environment.expected.trackedSourceHashes)) {
    await capture(() => {
      const absolute = resolve(environment.legacyRoot, path)
      assertDescendant(absolute, environment.legacyRoot, 'tracked source')
      const bytes = readNoFollowFile(absolute, `tracked source ${path}`)
      assertExpectedValue(sha256Bytes(bytes), expectedHash, `tracked source hash ${path}`)
    })
  }
  await capture(() => {
    const lockfile = resolve(environment.legacyRoot, environment.expected.lockfilePath)
    assertDescendant(lockfile, environment.legacyRoot, 'legacy lockfile')
    const lockfileBytes = readNoFollowFile(lockfile, 'legacy lockfile')
    assertExpectedValue(sha256Bytes(lockfileBytes), environment.expected.lockfileHash, 'lockfile hash')
  })
  if (failures.length > 0) {
    throw new Error(sanitizeExternalError(
      failures.map((error) => sanitizeExternalError(error, 120)).join('; '),
      maximumExternalMessageLength,
    ))
  }
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

function parseRawExtractionJson(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown
  } catch {
    throw new Error('raw extraction output is not valid JSON')
  }
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

function regularFileIdentityMatches(path: string, expected: FileIdentity) {
  const stats = lstatIfPresent(path)
  return Boolean(
    stats
    && stats.isFile()
    && !stats.isSymbolicLink()
    && identitiesEqual(expected, statsIdentity(stats)),
  )
}

function recoveryEntryPath(root: string, path: string) {
  const relation = relative(resolve(root), resolve(path))
  const segments = relation.split(sep)
  if (
    !relation
    || isAbsolute(relation)
    || relation === '..'
    || relation.startsWith(`..${sep}`)
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) throw new Error('recovery backup contains an unsafe relative path')
  return segments.join('/')
}

function collectRecoveryArchiveEntries(
  root: string,
  directory: string,
): readonly RecoveryArchiveEntry[] {
  const directoryIdentity = snapshotRegularDirectory(directory, 'recovery source directory')
  const entries: RecoveryArchiveEntry[] = []
  const names = readdirSync(directory).sort(codePointCompare)
  for (const name of names) {
    const path = join(directory, name)
    const relativePath = recoveryEntryPath(root, path)
    const stats = lstatSync(path)
    if (stats.isSymbolicLink()) {
      throw new Error('recovery backup contains a symbolic link')
    }
    if (stats.isDirectory()) {
      entries.push({ path: relativePath, type: 'directory' })
      entries.push(...collectRecoveryArchiveEntries(root, path))
      continue
    }
    if (stats.isFile()) {
      entries.push({
        path: relativePath,
        type: 'file',
        contentBase64: readNoFollowFile(path, `recovery file ${relativePath}`).toString('base64'),
      })
      continue
    }
    throw new Error('recovery backup contains an unsupported file type')
  }
  revalidateRegularDirectory(directory, directoryIdentity, 'recovery source directory')
  return entries
}

// This authoring transaction assumes cooperative non-privileged local authors on the
// declared macOS host; it does not claim safety against a hostile same-user race
// between the final no-follow revalidation and the operating-system filesystem call.
function verifyRecoveryArchivePath(
  path: string,
  expected: FileIdentity,
  expectedHash: string,
  recoveryParent: string,
) {
  if (dirname(resolve(path)) !== resolve(recoveryParent)) {
    throw new Error('recovery archive escaped the approved same-parent boundary')
  }
  assertNoFollowPath(recoveryParent, { kind: 'directory', allowMissingLeaf: false })
  revalidateRegularFile(path, expected, 'recovery archive')
  const canonicalParent = realpathSync(recoveryParent)
  const canonicalPath = realpathSync(path)
  if (dirname(canonicalPath) !== canonicalParent) {
    throw new Error('recovery archive canonical path escaped the approved boundary')
  }
  const bytes = readNoFollowFile(path, 'recovery archive')
  if (sha256Bytes(bytes) !== expectedHash) throw new Error('recovery archive hash changed')
  revalidateRegularFile(path, expected, 'recovery archive')
  return canonicalPath
}

function createVerifiedRecoveryArchive(
  backupPath: string,
  backupIdentity: FileIdentity,
  archivePath: string,
  recoveryParent: string,
): RecoveryArchiveIdentity {
  revalidateRegularDirectory(backupPath, backupIdentity, 'backup output')
  const bytes = stableJson({
    schemaVersion: 1,
    entries: collectRecoveryArchiveEntries(backupPath, backupPath),
  })
  revalidateRegularDirectory(backupPath, backupIdentity, 'backup output')
  let archiveCreated = false
  try {
    writeExclusive(archivePath, bytes)
    archiveCreated = true
    const file = snapshotRegularFile(archivePath, 'recovery archive')
    const sha256 = sha256Bytes(bytes)
    verifyRecoveryArchivePath(archivePath, file, sha256, recoveryParent)
    return { file, sha256 }
  } catch (error) {
    const stats = archiveCreated ? lstatIfPresent(archivePath) : undefined
    if (stats?.isFile() && !stats.isSymbolicLink()) unlinkSync(archivePath)
    throw error
  }
}

function combineErrors(primary: unknown, secondary: readonly unknown[]) {
  const primaryMessage = sanitizeExternalError(primary, maximumExternalMessageLength)
  const message = secondary.length === 0
    ? primaryMessage
    : sanitizeExternalError(
        `${primaryMessage} [cleanup: ${secondary
          .map((error) => sanitizeExternalError(error, 80)).join('; ')}]`,
        maximumExternalMessageLength,
      )
  return primary instanceof PublicationFailureException
    ? new PublicationFailureException(primary.publicationCode, message)
    : new Error(message)
}

async function executeWithSourceRevalidation(
  environment: AuthoringEnvironment<AuthoringExpectedLineage>,
  request: Omit<SpawnRequest, 'environment'> & {
    readonly environment: Readonly<Record<string, string>>
  },
  sourceIdentity: CopyValidatedSourceIdentity,
) {
  let output: string | undefined
  let commandError: unknown
  try {
    output = await execute(environment, request)
  } catch (error) {
    commandError = error
  }
  let identityError: unknown
  try {
    revalidateCopyValidatedSource(sourceIdentity)
  } catch (error) {
    identityError = error
  }
  if (commandError && identityError) throw combineErrors(commandError, [identityError])
  if (commandError) throw commandError
  if (identityError) throw identityError
  return output!
}

export async function runFixtureAuthoring<
  Seed,
  Case,
  Manifest,
  Expected extends AuthoringExpectedLineage,
>(
  environment: AuthoringEnvironment<Expected>,
  adapter: FixtureAuthoringAdapter<Seed, Case, Manifest, Expected>,
  options: RunFixtureAuthoringOptions,
): Promise<FixtureAuthoringResult<Case, Manifest>> {
  const outputParent = dirname(environment.destination)
  const outputName = basename(environment.destination)
  const token = environment.randomToken()
  if (!/^[a-f0-9]{32,128}$/.test(token)) throw new Error('invalid extraction token')
  const paths = {
    staging: join(outputParent, `.${outputName}.staging-${token}`),
    backup: join(outputParent, `.${outputName}.backup-${token}`),
    recoveryArchive: join(outputParent, `.${outputName}.recovery-${token}.json`),
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
  let legacyRootIdentity: FileIdentity | undefined
  let trustedChildEnvironment: ReturnType<typeof makeChildEnvironment> | undefined
  let stagingIdentity: FileIdentity | undefined
  let worktreeAttempted = false
  let backupIdentity: FileIdentity | undefined
  let recoveryArchiveIdentity: RecoveryArchiveIdentity | undefined
  let expectedFixtureFiles: ExpectedFixtureFiles | undefined
  let installedOutputIdentity: FileIdentity | undefined
  let publicationTargetMutated = false
  let preCommitRecoveryComplete = true
  let publicationCommitted = false
  let indeterminateRelease = false
  let publicationWarning: PublicationCleanupWarning | undefined
  let primaryError: unknown
  const cleanupErrors: unknown[] = []
  let ignoredBefore: readonly IgnoredPathFingerprint[] = []
  let ignoredAfter: readonly IgnoredPathFingerprint[] = []
  let seeds: readonly Seed[] = []
  let cases: readonly Case[] = []
  let manifest: Manifest | undefined
  let copyValidatedSourceIdentity: CopyValidatedSourceIdentity | undefined

  const releaseLock = (invokePostInstallHook: boolean): LockReleaseResult => {
    if (lockDescriptor === undefined && !lockIdentity) return { state: 'released' }
    try {
      if (invokePostInstallHook) environment.hooks.beforeReleaseLock?.(lock)
      if (lockDescriptor !== undefined) {
        closeSync(lockDescriptor)
        lockDescriptor = undefined
      }
      if (!lockIdentity) {
        return {
          state: 'indeterminate',
          error: new Error('extraction lock identity is unavailable'),
        }
      }
      revalidateRegularFile(lock, lockIdentity, 'extraction lock')
      unlinkSync(lock)
      lockIdentity = undefined
      return { state: 'released' }
    } catch (error) {
      return {
        state: lockIdentity && regularFileIdentityMatches(lock, lockIdentity)
          ? 'held'
          : 'indeterminate',
        error,
      }
    }
  }

  const assertPublicationLockHeld = () => {
    if (!lockIdentity) throw new Error('publication lock ownership is not proven')
    revalidateRegularFile(lock, lockIdentity, 'extraction lock')
  }

  try {
    legacyRootIdentity = snapshotRegularDirectory(environment.legacyRoot, 'legacy root')
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
    const patchTargets = parseInstrumentationPatchTargets(
      patchBytes,
      environment.instrumentation.targets,
    )
    const seedBytes = readNoFollowFile(
      environment.seedsPath,
      'seed source',
      environment.hooks.beforeReadSeeds,
    )
    assertExpectedValue(sha256Bytes(seedBytes), environment.expected.seedsHash, 'seed hash')
    seeds = adapter.parseSeeds(JSON.parse(seedBytes.toString('utf8')) as unknown)
    const authoringSourceIdentity = environment.authoringSources.map((source) => ({
      path: source.relativePath,
      hash: sha256Bytes(readNoFollowFile(source.path, `authoring source ${source.relativePath}`)),
    }))
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
    trustedChildEnvironment = childEnvironment

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
    if (environment.instrumentation.dependencyProvisioning.kind === 'npm-ci') {
      const npmVersion = exactLine(await execute(environment, {
        role: 'npm-version',
        executable: environment.tools.node,
        args: [environment.tools.npmCli, '--version'],
        cwd: environment.legacyRoot,
        environment: childEnvironment,
      }))
      assertExpectedValue(
        npmVersion,
        (environment.expected as { readonly npmVersion: string }).npmVersion,
        'npm version',
      )
    }

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
    await verifyOriginalCheckoutIdentity(
      environment,
      childEnvironment,
      legacyRootIdentity,
    )

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
    const expectedChangedFiles = environment.instrumentation.targets
      .map(({ status, path }) => ({ status, path }))
      .sort((left, right) => codePointCompare(left.path, right.path))
    if (JSON.stringify(changedFiles) !== JSON.stringify(expectedChangedFiles)) {
      throw new Error('instrumentation patch drift')
    }

    const physicalNodeModules = join(worktree, 'node_modules')
    assertDescendant(physicalNodeModules, paths.extractionRoot, 'temporary node_modules')
    const dependencyProvisioning = environment.instrumentation.dependencyProvisioning
    if (dependencyProvisioning.kind === 'npm-ci') {
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
    } else {
      copyValidatedSourceIdentity = snapshotCopyValidatedSource(
        environment.legacyRoot,
        dependencyProvisioning,
      )
      copyValidatedDependencies(
        copyValidatedSourceIdentity,
        physicalNodeModules,
        environment.hooks.afterDependencyCopy,
      )
    }
    assertNoFollowPath(physicalNodeModules, { kind: 'directory', allowMissingLeaf: false })
    const vitest = join(physicalNodeModules, 'vitest/vitest.mjs')
    assertNoFollowPath(vitest, { kind: 'file', allowMissingLeaf: false })
    if (dependencyProvisioning.kind === 'npm-ci') {
      ensureSafeDirectory(join(physicalNodeModules, '.tmp'))
      await execute(environment, {
        role: 'legacy-full-suite',
        executable: environment.tools.node,
        args: [vitest, 'run'],
        cwd: worktree,
        environment: childEnvironment,
      })
    } else {
      const copyEnvironment = makeCopyValidatedChildEnvironment(
        paths.extractionRoot,
        '',
        environment.tools,
      )
      await executeWithSourceRevalidation(environment, {
        role: 'legacy-full-suite',
        executable: environment.tools.sandboxExec,
        args: [
          '-p',
          sandboxProfile,
          environment.tools.node,
          vitest,
          'run',
        ],
        cwd: worktree,
        environment: copyEnvironment,
        deadlineMs: copyValidatedCommandDeadlineMs,
        terminationGraceMs: copyValidatedTerminationGraceMs,
      }, copyValidatedSourceIdentity!)
    }

    writeExclusive(capability, stableJson({
      schemaVersion: 1,
      seedPath: seedCopy,
      rawOutputPath: rawOutput,
      token,
    }))
    const capabilityIdentity = snapshotRegularFile(capability, 'raw output capability')
    revalidateRegularFile(capability, capabilityIdentity, 'raw output capability')
    const extractionEnvironment = dependencyProvisioning.kind === 'copy-validated'
      ? makeCopyValidatedChildEnvironment(
        paths.extractionRoot,
        capability,
        environment.tools,
      )
      : makeChildEnvironment(
        paths.extractionRoot,
        capability,
        environment.tools,
        npmConfigs,
      )
    const extractionRequest = {
      role: 'legacy-network-denied-extraction' as const,
      executable: environment.tools.sandboxExec,
      args: [
        '-p',
        sandboxProfile,
        environment.tools.node,
        vitest,
        'run',
        environment.instrumentation.extractionTestPath,
      ],
      cwd: worktree,
      environment: extractionEnvironment,
      ...(dependencyProvisioning.kind === 'copy-validated'
        ? {
            deadlineMs: copyValidatedCommandDeadlineMs,
            terminationGraceMs: copyValidatedTerminationGraceMs,
          }
        : {}),
    }
    if (dependencyProvisioning.kind === 'copy-validated') {
      await executeWithSourceRevalidation(
        environment,
        extractionRequest,
        copyValidatedSourceIdentity!,
      )
    } else {
      await execute(environment, extractionRequest)
    }
    environment.hooks.afterExtraction?.()
    const rawIdentity = snapshotRegularFile(rawOutput, 'raw output')
    environment.hooks.beforeReadRaw?.(rawOutput)
    revalidateRegularFile(rawOutput, rawIdentity, 'raw output')
    const rawBytes = readNoFollowFile(rawOutput, 'raw output')
    cases = adapter.validateCases(
      adapter.parseRawCases(parseRawExtractionJson(rawBytes)),
      seeds,
    )

    const casesJson = adapter.serializeCases(cases)
    const revalidatedAuthoringSourceIdentity = environment.authoringSources.map((source) => ({
      path: source.relativePath,
      hash: sha256Bytes(readNoFollowFile(source.path, `authoring source ${source.relativePath}`)),
    }))
    if (JSON.stringify(revalidatedAuthoringSourceIdentity) !== JSON.stringify(authoringSourceIdentity)) {
      throw new Error('authoring source identity changed during extraction')
    }
    const manifestInput = {
      cases,
      fixtureContentHash: sha256Bytes(casesJson),
      expected: environment.expected,
      dependencyProvisioning: environment.instrumentation.dependencyProvisioning,
      authoringSources: authoringSourceIdentity,
      instrumentationHash: verifiedPatchHash,
    } as ManifestBuildInput<Case, Expected>
    manifest = adapter.buildManifest(manifestInput)
    const manifestJson = adapter.serializeManifest(manifest)

    if (!options.verifyOnly) {
      mkdirSync(paths.staging, { mode: 0o700 })
      stagingIdentity = snapshotRegularDirectory(paths.staging, 'staging output')
      const casesPath = join(paths.staging, 'cases.json')
      const manifestPath = join(paths.staging, 'manifest.json')
      writeExclusive(casesPath, casesJson)
      const casesIdentity = snapshotRegularFile(casesPath, 'fixture cases file')
      writeExclusive(manifestPath, manifestJson)
      const manifestIdentity = snapshotRegularFile(manifestPath, 'fixture manifest file')
      expectedFixtureFiles = {
        cases: {
          json: casesJson,
          sha256: sha256Bytes(casesJson),
          identity: casesIdentity,
        },
        manifest: {
          json: manifestJson,
          sha256: sha256Bytes(manifestJson),
          identity: manifestIdentity,
        },
      }
      validateFixtureDirectoryOnDisk(
        paths.staging,
        stagingIdentity,
        expectedFixtureFiles,
        adapter,
        seeds,
        manifest,
      )
    }
  } catch (error) {
    primaryError = error
  }

  if (copyValidatedSourceIdentity) {
    try {
      revalidateCopyValidatedSource(copyValidatedSourceIdentity)
    } catch (error) {
      if (!primaryError) primaryError = error
      else cleanupErrors.push(error)
    }
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

  if (legacyRootIdentity && trustedChildEnvironment) {
    try {
      await verifyOriginalCheckoutIdentity(
        environment,
        trustedChildEnvironment,
        legacyRootIdentity,
      )
    } catch (error) {
      if (!primaryError) primaryError = error
      else cleanupErrors.push(error)
    }
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

  try {
    if (extractionRootIdentity) removeOwnedPath(paths.extractionRoot, extractionRootIdentity)
  } catch (error) {
    cleanupErrors.push(error)
  }

  if (!primaryError && cleanupErrors.length === 0 && !options.verifyOnly) {
    try {
      assertNoFollowPath(outputParent, { kind: 'directory', allowMissingLeaf: false })
      if (lstatIfPresent(environment.destination)) {
        if (!options.replace) throw new Error('output already exists; pass --replace')
        const existingOutputIdentity = snapshotRegularDirectory(
          environment.destination,
          'existing output',
        )
        renameSync(environment.destination, paths.backup)
        backupIdentity = existingOutputIdentity
        publicationTargetMutated = true
        preCommitRecoveryComplete = false
        revalidateRegularDirectory(paths.backup, existingOutputIdentity, 'backup output')
      }
      if (!stagingIdentity) throw new Error('staging output is missing')
      if (!expectedFixtureFiles) throw new Error('validated fixture files are missing')
      if (manifest === undefined) throw new Error('fixture manifest is missing')
      environment.hooks.beforePublishStaging?.(paths.staging)
      validateFixtureDirectoryOnDisk(
        paths.staging,
        stagingIdentity,
        expectedFixtureFiles,
        adapter,
        seeds,
        manifest,
      )
      assertNoFollowPath(environment.destination, {
        kind: 'directory',
        allowMissingLeaf: true,
      })
      const replacementIdentity = stagingIdentity
      renameSync(paths.staging, environment.destination)
      stagingIdentity = undefined
      installedOutputIdentity = replacementIdentity
      publicationTargetMutated = true
      preCommitRecoveryComplete = false
      revalidateRegularDirectory(
        environment.destination,
        replacementIdentity,
        'installed output',
      )
      environment.hooks.afterPublishStaging?.(environment.destination)
      validateFixtureDirectoryOnDisk(
        environment.destination,
        installedOutputIdentity,
        expectedFixtureFiles,
        adapter,
        seeds,
        manifest,
      )
      if (backupIdentity) {
        recoveryArchiveIdentity = createVerifiedRecoveryArchive(
          paths.backup,
          backupIdentity,
          paths.recoveryArchive,
          outputParent,
        )
      }
    } catch (error) {
      primaryError = error
    }
  }

  if (
    !primaryError
    && installedOutputIdentity
    && backupIdentity
    && !recoveryArchiveIdentity
  ) {
    primaryError = new Error('recovery archive is missing before publication commit')
  }

  if (!primaryError && installedOutputIdentity) {
    const releaseResult = releaseLock(true)
    if (releaseResult.state === 'released') {
      publicationCommitted = true
    } else if (releaseResult.state === 'held') {
      primaryError = releaseResult.error ?? new Error('publication lock release failed while held')
    } else {
      indeterminateRelease = true
      primaryError = new PublicationFailureException(
        'recovery-required',
        indeterminateLockReleaseMessage,
      )
    }
  }

  if (publicationCommitted && backupIdentity && recoveryArchiveIdentity) {
    const retainedBackupIdentity = backupIdentity
    const retainedRecoveryArchive = recoveryArchiveIdentity
    let backupRemoved = false
    for (let attempt = 1; attempt <= publicationCleanupAttemptLimit; attempt += 1) {
      try {
        environment.hooks.beforeRemoveBackup?.(paths.backup)
        removeOwnedPath(paths.backup, retainedBackupIdentity)
        backupIdentity = undefined
        backupRemoved = true
        break
      } catch {
        if (attempt === publicationCleanupAttemptLimit) {
          try {
            const recoveryBackupPath = verifyRecoveryArchivePath(
              paths.recoveryArchive,
              retainedRecoveryArchive.file,
              retainedRecoveryArchive.sha256,
              outputParent,
            )
            publicationWarning = {
              code: 'backup-cleanup-failed',
              recoveryBackupPath,
              cleanupAttempts: attempt,
              message: publicationCleanupWarningMessage,
            }
          } catch {
            publicationWarning = undefined
          }
        }
      }
    }
    if (backupRemoved) {
      for (let attempt = 1; attempt <= publicationCleanupAttemptLimit; attempt += 1) {
        let recoveryBackupPath: string | undefined
        try {
          recoveryBackupPath = verifyRecoveryArchivePath(
            paths.recoveryArchive,
            retainedRecoveryArchive.file,
            retainedRecoveryArchive.sha256,
            outputParent,
          )
          unlinkSync(paths.recoveryArchive)
          recoveryArchiveIdentity = undefined
          break
        } catch {
          if (attempt === publicationCleanupAttemptLimit && recoveryBackupPath) {
            publicationWarning = {
              code: 'backup-cleanup-failed',
              recoveryBackupPath,
              cleanupAttempts: attempt,
              message: publicationCleanupWarningMessage,
            }
          }
        }
      }
    }
  }

  if (
    primaryError
    && publicationTargetMutated
    && !publicationCommitted
    && !indeterminateRelease
  ) {
    try {
      preCommitRecoveryComplete = false
      assertPublicationLockHeld()
      if (installedOutputIdentity) {
        removeOwnedPath(environment.destination, installedOutputIdentity)
        installedOutputIdentity = undefined
      }
      assertPublicationLockHeld()
      if (backupIdentity) {
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
      } else if (lstatIfPresent(environment.destination)) {
        throw new Error('rollback failed to restore the original absent destination')
      }
      assertPublicationLockHeld()
      if (recoveryArchiveIdentity) {
        verifyRecoveryArchivePath(
          paths.recoveryArchive,
          recoveryArchiveIdentity.file,
          recoveryArchiveIdentity.sha256,
          outputParent,
        )
        unlinkSync(paths.recoveryArchive)
        recoveryArchiveIdentity = undefined
      }
      assertPublicationLockHeld()
      environment.hooks.afterRollbackVerified?.(environment.destination)
      preCommitRecoveryComplete = true
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

  if (!publicationCommitted && !indeterminateRelease && preCommitRecoveryComplete) {
    const releaseResult = releaseLock(false)
    if (releaseResult.state === 'held') {
      cleanupErrors.push(
        releaseResult.error ?? new Error('publication lock release failed while held'),
      )
    } else if (releaseResult.state === 'indeterminate') {
      if (primaryError) cleanupErrors.unshift(primaryError)
      primaryError = new PublicationFailureException(
        'recovery-required',
        indeterminateLockReleaseMessage,
      )
    }
  }

  const evidence = {
    cases,
    manifest: manifest as Manifest,
    ignoredFingerprintsBefore: ignoredBefore,
    ignoredFingerprintsAfter: ignoredAfter,
  }
  if (publicationCommitted) {
    if (publicationWarning) {
      return {
        ...evidence,
        status: 'published-with-cleanup-warning',
        published: true,
        warning: publicationWarning,
      }
    }
    return { ...evidence, status: 'published', published: true }
  }
  if (primaryError) throw combineErrors(primaryError, cleanupErrors)
  if (cleanupErrors.length > 0) throw combineErrors('extractor cleanup failed', cleanupErrors)
  if (options.verifyOnly) return { ...evidence, status: 'verified', published: false }
  throw new Error('publication did not reach its commit point')
}

export async function runFixtureAuthoringCommand<
  Seed,
  Case,
  Manifest,
  Expected extends AuthoringExpectedLineage,
>(
  environment: AuthoringEnvironment<Expected>,
  adapter: FixtureAuthoringAdapter<Seed, Case, Manifest, Expected>,
  options: RunFixtureAuthoringOptions,
): Promise<FixtureAuthoringCommandResult<Case, Manifest>> {
  try {
    return await runFixtureAuthoring(environment, adapter, options)
  } catch (error) {
    const recoveryRequired = error instanceof PublicationFailureException
      && error.publicationCode === 'recovery-required'
    return {
      status: 'failed',
      published: false,
      error: recoveryRequired
        ? { code: 'recovery-required', message: indeterminateLockReleaseMessage }
        : { code: 'publication-failed', message: publicationFailedMessage },
    }
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
