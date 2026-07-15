import { randomUUID } from 'node:crypto'
import {
  lstat,
  open,
  readFile,
  rename,
  unlink,
} from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { questionModel } from '@ramen-style/classification-core'
import {
  compileStyles,
  renderStyleArtifact,
  styleDefinitionBundle,
  type CompiledQuestionModel,
  type StyleDefinitionBundleSource,
} from '@ramen-style/classification-core/compiler'

const generatedStyleModelRelativePath =
  'packages/classification-core/src/generated/style-model.ts'

export const styleArtifactRepositoryRoot = resolve(import.meta.dirname, '../..')
export const generatedStyleModelPath = resolve(
  styleArtifactRepositoryRoot,
  generatedStyleModelRelativePath,
)

const approvedOutputDirectories = [
  styleArtifactRepositoryRoot,
  resolve(styleArtifactRepositoryRoot, 'packages'),
  resolve(styleArtifactRepositoryRoot, 'packages/classification-core'),
  resolve(styleArtifactRepositoryRoot, 'packages/classification-core/src'),
  resolve(styleArtifactRepositoryRoot, 'packages/classification-core/src/generated'),
] as const

interface StyleArtifactStats {
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
}

interface StyleArtifactFileHandle {
  writeFile(content: string): Promise<void>
  sync(): Promise<void>
  close(): Promise<void>
}

export interface StyleArtifactFileSystem {
  lstat(path: string): Promise<StyleArtifactStats>
  readFile(path: string): Promise<string>
  open(path: string, flags: 'wx', mode: number): Promise<StyleArtifactFileHandle>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
}

const nodeFileSystem: StyleArtifactFileSystem = {
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

export interface RunStyleGeneratorOptions {
  readonly mode: 'write' | 'check'
  readonly fileSystem?: StyleArtifactFileSystem
  readonly renderArtifact?: () => string
  readonly createTemporaryId?: () => string
}

function hasCode(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}

async function assertSafeTarget(fileSystem: StyleArtifactFileSystem) {
  for (const directory of approvedOutputDirectories) {
    try {
      const current = await fileSystem.lstat(directory)
      if (current.isSymbolicLink() || !current.isDirectory()) {
        throw new Error('style model output boundary must use regular directories')
      }
    } catch (error) {
      if (error instanceof Error
        && error.message === 'style model output boundary must use regular directories') {
        throw error
      }
      // Security boundary: do not retain paths or trap details from the caught error.
      // eslint-disable-next-line preserve-caught-error
      throw new Error('style model output boundary must use regular directories')
    }
  }

  try {
    const target = await fileSystem.lstat(generatedStyleModelPath)
    if (target.isSymbolicLink() || !target.isFile()) {
      throw new Error('style model output must be a regular file')
    }
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return
    if (error instanceof Error
      && error.message === 'style model output must be a regular file') throw error
    // Security boundary: do not retain paths or trap details from the caught error.
    // eslint-disable-next-line preserve-caught-error
    throw new Error('style model output could not be safely inspected')
  }
}

async function readExisting(fileSystem: StyleArtifactFileSystem) {
  try {
    return await fileSystem.readFile(generatedStyleModelPath)
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined
    // Security boundary: do not retain paths or trap details from the caught error.
    // eslint-disable-next-line preserve-caught-error
    throw new Error('style model artifact could not be read')
  }
}

async function removeTemporaryFile(
  fileSystem: StyleArtifactFileSystem,
  temporaryPath: string,
) {
  try {
    await fileSystem.unlink(temporaryPath)
    return true
  } catch (error) {
    return hasCode(error, 'ENOENT')
  }
}

function temporaryPath(createTemporaryId: () => string) {
  const identifier = createTemporaryId()
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(identifier)) {
    throw new Error('style model temporary identifier is invalid')
  }
  return resolve(
    dirname(generatedStyleModelPath),
    `.${basename(generatedStyleModelPath)}.tmp-${identifier}`,
  )
}

function boundedCompilationFailure(result: Extract<
  ReturnType<typeof compileStyles>,
  { readonly ok: false }
>) {
  const codes = [...new Set(result.diagnostics.map(({ code }) => code))]
    .slice(0, 5)
    .join(', ')
  return new Error(`style model compilation failed: ${codes || 'invalid style definitions'}`)
}

export function compileAndRenderStyleArtifact(
  definitions: StyleDefinitionBundleSource = styleDefinitionBundle,
  acceptedQuestionModel: CompiledQuestionModel = questionModel,
) {
  const result = compileStyles(
    definitions,
    acceptedQuestionModel,
    definitions.sourceFile,
  )
  if (!result.ok) throw boundedCompilationFailure(result)
  return renderStyleArtifact(result.model)
}

export async function runStyleGenerator({
  mode,
  fileSystem = nodeFileSystem,
  renderArtifact = compileAndRenderStyleArtifact,
  createTemporaryId = randomUUID,
}: RunStyleGeneratorOptions) {
  const rendered = renderArtifact()
  await assertSafeTarget(fileSystem)
  const current = await readExisting(fileSystem)
  if (current === rendered) {
    return mode === 'check' ? 'current' as const : 'unchanged' as const
  }
  if (mode === 'check') {
    throw new Error('style model artifact drift. Run npm run styles:generate')
  }

  const sibling = temporaryPath(createTemporaryId)
  let handle: StyleArtifactFileHandle | undefined
  let temporaryCreated = false
  try {
    handle = await fileSystem.open(sibling, 'wx', 0o644)
    temporaryCreated = true
    await handle.writeFile(rendered)
    await handle.sync()
    await handle.close()
    handle = undefined
    await fileSystem.rename(sibling, generatedStyleModelPath)
  } catch {
    if (handle) {
      try {
        await handle.close()
      } catch {
        // Cleanup below is still required even when close reports a failure.
      }
    }
    if (temporaryCreated && !await removeTemporaryFile(fileSystem, sibling)) {
      throw new Error('style model artifact publication and temporary cleanup failed')
    }
    throw new Error('style model artifact publication failed')
  }
  return 'written' as const
}

async function main() {
  const arguments_ = process.argv.slice(2)
  if (arguments_.length !== 1) {
    throw new Error('Use exactly one argument: --write or --check')
  }
  const argument = arguments_[0]
  const mode = argument === '--write'
    ? 'write' as const
    : argument === '--check'
      ? 'check' as const
      : undefined
  if (!mode) throw new Error('Use exactly one argument: --write or --check')
  const result = await runStyleGenerator({ mode })
  console.log(`style model artifact ${result}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'style model generation failed'
    console.error(message.slice(0, 500))
    process.exitCode = 1
  })
}
