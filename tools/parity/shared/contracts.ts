export interface ExtractorTools {
  readonly git: string
  readonly node: string
  readonly npmCli: string
  readonly sandboxExec: string
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

export interface NpmConfigFileIdentity {
  readonly path: string
  readonly type: 'regular-file'
  readonly symbolicLink: false
  readonly validatedParentsContainSymbolicLink: false
  readonly size: 0
}

export interface NpmConfigIdentity {
  readonly userConfig: NpmConfigFileIdentity
  readonly globalConfig: NpmConfigFileIdentity
}

export interface SpawnRequest {
  readonly role: SpawnRole
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly environment: Readonly<Record<string, string>>
  readonly npmConfigIdentity?: NpmConfigIdentity
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

export interface RunPaths {
  readonly staging: string
  readonly backup: string
  readonly extractionRoot: string
}

export interface AuthoringHooks {
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
  afterExtraction?: () => void
  beforePublishStaging?: (path: string) => void
  afterPublishStaging?: (path: string) => void
  beforeReleaseLock?: (path: string) => void
  beforeRemoveBackup?: (path: string) => void
  beforeRollback?: (path: string) => void
  afterRollbackVerified?: (destination: string) => void
}

export interface AuthoringSource {
  readonly relativePath: string
  readonly path: string
}

export interface AuthoringEnvironment {
  readonly inheritedEnvironment: Readonly<Record<string, string | undefined>>
  readonly legacyRoot: string
  readonly toolRoot: string
  readonly destination: string
  readonly patchPath: string
  readonly seedsPath: string
  readonly authoringSources: readonly AuthoringSource[]
  readonly tools: ExtractorTools
  readonly expected: ExpectedExtractorLineage
  readonly spawn: (request: SpawnRequest) => Promise<SpawnResult>
  readonly randomToken: () => string
  readonly onRunPaths?: (paths: RunPaths) => void
  readonly hooks: AuthoringHooks
}

export interface CreateAuthoringEnvironmentInput {
  readonly inheritedEnvironment?: Readonly<Record<string, string | undefined>>
  readonly legacyRoot: string
  readonly toolRoot: string
  readonly destination: string
  readonly patchPath: string
  readonly seedsPath: string
  readonly authoringSources: readonly AuthoringSource[]
  readonly tools?: ExtractorTools
  readonly expected: ExpectedExtractorLineage
  readonly spawn?: (request: SpawnRequest) => Promise<SpawnResult>
  readonly randomToken?: () => string
  readonly onRunPaths?: (paths: RunPaths) => void
  readonly hooks?: AuthoringHooks
}

export interface RunFixtureAuthoringOptions {
  readonly replace?: boolean
  readonly verifyOnly: boolean
}

export interface IgnoredPathFingerprint<Path extends string = string> {
  readonly path: Path
  readonly exists: boolean
  readonly type: 'missing' | 'regular-file' | 'directory' | 'symbolic-link' | 'other'
  readonly size: number | null
  readonly mtimeMs: number | null
  readonly sha256: string | null
}

export interface ManifestBuildInput<Case> {
  readonly cases: readonly Case[]
  readonly fixtureContentHash: string
  readonly expected: ExpectedExtractorLineage
  readonly authoringSources: readonly {
    readonly path: string
    readonly hash: string
  }[]
  readonly instrumentationHash: string
}

export interface FixtureAuthoringAdapter<Seed, Case, Manifest> {
  readonly parseSeeds: (input: unknown) => readonly Seed[]
  readonly parseRawCases: (input: unknown) => readonly Case[]
  readonly validateCases: (cases: readonly Case[], seeds: readonly Seed[]) => readonly Case[]
  readonly buildManifest: (input: ManifestBuildInput<Case>) => Manifest
  readonly serializeCases: (cases: readonly Case[]) => Buffer
  readonly serializeManifest: (manifest: Manifest) => Buffer
}

export interface PublicationCleanupWarning {
  readonly code: 'backup-cleanup-failed'
  readonly recoveryBackupPath: string
  readonly cleanupAttempts: number
  readonly message: string
}

export interface PublicationError {
  readonly code: 'publication-failed' | 'recovery-required'
  readonly message: string
}

export type PublicationResult =
  | {
      readonly status: 'published'
      readonly published: true
    }
  | {
      readonly status: 'published-with-cleanup-warning'
      readonly published: true
      readonly warning: PublicationCleanupWarning
    }
  | {
      readonly status: 'failed'
      readonly published: false
      readonly error: PublicationError
    }

type SuccessfulPublicationResult = Extract<PublicationResult, { readonly published: true }>

export interface FixtureAuthoringEvidence<Case, Manifest> {
  readonly cases: readonly Case[]
  readonly manifest: Manifest
  readonly ignoredFingerprintsBefore: readonly IgnoredPathFingerprint[]
  readonly ignoredFingerprintsAfter: readonly IgnoredPathFingerprint[]
}

export type FixtureAuthoringResult<Case, Manifest> = FixtureAuthoringEvidence<Case, Manifest> & (
  | {
      readonly status: 'verified'
      readonly published: false
      readonly warning?: never
    }
  | SuccessfulPublicationResult
)

export type FixtureAuthoringCommandResult<Case, Manifest> =
  | FixtureAuthoringResult<Case, Manifest>
  | Extract<PublicationResult, { readonly status: 'failed' }>
