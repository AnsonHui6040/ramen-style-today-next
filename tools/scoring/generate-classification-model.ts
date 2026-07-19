import { randomUUID } from 'node:crypto'
import { lstat, open, readFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  classificationDefinition,
  compileClassification,
  renderClassificationArtifact,
} from '@ramen-style/classification-core/compiler'

const artifactRelativePath =
  'packages/classification-core/src/generated/classification-model.ts'

export const classificationArtifactRepositoryRoot = resolve(import.meta.dirname, '../..')
export const generatedClassificationModelPath = resolve(
  classificationArtifactRepositoryRoot,
  artifactRelativePath,
)

const approvedOutputDirectories = [
  classificationArtifactRepositoryRoot,
  resolve(classificationArtifactRepositoryRoot, 'packages'),
  resolve(classificationArtifactRepositoryRoot, 'packages/classification-core'),
  resolve(classificationArtifactRepositoryRoot, 'packages/classification-core/src'),
  resolve(classificationArtifactRepositoryRoot, 'packages/classification-core/src/generated'),
] as const

interface ArtifactStats {
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
}

interface ArtifactFileHandle {
  writeFile(content: string): Promise<void>
  sync(): Promise<void>
  close(): Promise<void>
}

export interface ClassificationArtifactFileSystem {
  lstat(path: string): Promise<ArtifactStats>
  readFile(path: string): Promise<string>
  open(path: string, flags: 'wx', mode: number): Promise<ArtifactFileHandle>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
}

const nodeFileSystem: ClassificationArtifactFileSystem = {
  lstat,
  readFile: (path) => readFile(path, 'utf8'),
  open: async (path, flags, mode) => {
    const handle = await open(path, flags, mode)
    return {
      writeFile: (content) => handle.writeFile(content, 'utf8'),
      sync: () => handle.sync(),
      close: () => handle.close(),
    }
  },
  rename,
  unlink,
}

export interface RunClassificationGeneratorOptions {
  readonly mode: 'write' | 'check'
  readonly fileSystem?: ClassificationArtifactFileSystem
  readonly renderArtifact?: () => string
  readonly createTemporaryId?: () => string
}

function hasCode(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}

async function assertSafeTarget(fileSystem: ClassificationArtifactFileSystem) {
  for (const directory of approvedOutputDirectories) {
    try {
      const current = await fileSystem.lstat(directory)
      if (current.isSymbolicLink() || !current.isDirectory()) {
        throw new Error('classification model output boundary must use regular directories')
      }
    } catch (error) {
      if (error instanceof Error
        && error.message
          === 'classification model output boundary must use regular directories') throw error
      // Security boundary: never retain caught path or trap details.
      // eslint-disable-next-line preserve-caught-error
      throw new Error('classification model output boundary must use regular directories')
    }
  }
  try {
    const target = await fileSystem.lstat(generatedClassificationModelPath)
    if (target.isSymbolicLink() || !target.isFile()) {
      throw new Error('classification model output must be a regular file')
    }
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return
    if (error instanceof Error
      && error.message === 'classification model output must be a regular file') throw error
    // Security boundary: never retain caught path or trap details.
    // eslint-disable-next-line preserve-caught-error
    throw new Error('classification model output could not be safely inspected')
  }
}

async function readExisting(fileSystem: ClassificationArtifactFileSystem) {
  try {
    return await fileSystem.readFile(generatedClassificationModelPath)
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined
    // Security boundary: never retain caught path or trap details.
    // eslint-disable-next-line preserve-caught-error
    throw new Error('classification model artifact could not be read')
  }
}

function temporaryPath(createTemporaryId: () => string) {
  const identifier = createTemporaryId()
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(identifier)) {
    throw new Error('classification model temporary identifier is invalid')
  }
  return resolve(
    dirname(generatedClassificationModelPath),
    `.${basename(generatedClassificationModelPath)}.tmp-${identifier}`,
  )
}

async function removeTemporaryFile(
  fileSystem: ClassificationArtifactFileSystem,
  path: string,
) {
  try {
    await fileSystem.unlink(path)
    return true
  } catch (error) {
    return hasCode(error, 'ENOENT')
  }
}

function boundedCompilationFailure(result: Extract<
  ReturnType<typeof compileClassification>,
  { readonly ok: false }
>) {
  const codes = [...new Set(result.diagnostics.map(({ code }) => code))]
    .slice(0, 5)
    .join(', ')
  return new Error(
    `classification model compilation failed: ${codes || 'invalid definitions'}`,
  )
}

export function compileAndRenderClassificationArtifact(
  definition: unknown = classificationDefinition,
) {
  const result = compileClassification(
    definition,
    'packages/classification-core/src/definitions/classification.ts',
  )
  if (!result.ok) throw boundedCompilationFailure(result)
  return renderClassificationArtifact(result.model)
}

export async function runClassificationGenerator({
  mode,
  fileSystem = nodeFileSystem,
  renderArtifact = compileAndRenderClassificationArtifact,
  createTemporaryId = randomUUID,
}: RunClassificationGeneratorOptions) {
  const rendered = renderArtifact()
  await assertSafeTarget(fileSystem)
  const current = await readExisting(fileSystem)
  if (current === rendered) {
    return mode === 'check' ? 'current' as const : 'unchanged' as const
  }
  if (mode === 'check') {
    throw new Error(
      'classification model artifact drift. Run npm run classification-model:generate',
    )
  }

  const sibling = temporaryPath(createTemporaryId)
  let handle: ArtifactFileHandle | undefined
  let temporaryCreated = false
  try {
    handle = await fileSystem.open(sibling, 'wx', 0o644)
    temporaryCreated = true
    await handle.writeFile(rendered)
    await handle.sync()
    await handle.close()
    handle = undefined
    await fileSystem.rename(sibling, generatedClassificationModelPath)
  } catch {
    if (handle) {
      try {
        await handle.close()
      } catch {
        // Cleanup below is still required when close reports a failure.
      }
    }
    if (temporaryCreated && !await removeTemporaryFile(fileSystem, sibling)) {
      throw new Error(
        'classification model artifact publication and temporary cleanup failed',
      )
    }
    throw new Error('classification model artifact publication failed')
  }
  return 'written' as const
}

async function main() {
  const arguments_ = process.argv.slice(2)
  if (arguments_.length !== 1) {
    throw new Error('Use exactly one argument: --write or --check')
  }
  const mode = arguments_[0] === '--write'
    ? 'write' as const
    : arguments_[0] === '--check'
      ? 'check' as const
      : undefined
  if (!mode) throw new Error('Use exactly one argument: --write or --check')
  const result = await runClassificationGenerator({ mode })
  console.log(`classification model artifact ${result}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error
      ? error.message
      : 'classification model generation failed'
    console.error(message.slice(0, 500))
    process.exitCode = 1
  })
}
