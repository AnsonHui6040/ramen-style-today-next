import { randomUUID } from 'node:crypto'
import {
  lstat,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  compileQuestions,
  questionDefinitions,
  renderQuestionArtifact,
  type QuestionDefinitionSource,
} from '@ramen-style/classification-core/compiler'

export const generatedQuestionModelPath = resolve(
  import.meta.dirname,
  '../../packages/classification-core/src/generated/question-model.ts',
)

type RenameFile = (from: string, to: string) => Promise<void>

export interface RunQuestionGeneratorOptions {
  readonly mode: 'write' | 'check'
  readonly rendered: string
  readonly outputPath?: string
  readonly renameFile?: RenameFile
}

async function readExisting(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

async function removeIfPresent(path: string) {
  try {
    await unlink(path)
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
}

async function assertSafeWriteTarget(path: string) {
  const parent = await lstat(dirname(path))
  if (parent.isSymbolicLink() || !parent.isDirectory()) {
    throw new Error('question model output parent must be a regular directory')
  }
  try {
    const target = await lstat(path)
    if (target.isSymbolicLink() || !target.isFile()) {
      throw new Error('question model output must be a regular file')
    }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
}

export function compileAndRenderQuestionArtifact(
  definitions: readonly QuestionDefinitionSource[] = questionDefinitions,
) {
  const result = compileQuestions(definitions)
  if (!result.ok) {
    throw new Error(
      `question model compilation failed\n${JSON.stringify(result.diagnostics, null, 2)}`,
    )
  }
  return renderQuestionArtifact(result.model)
}

export async function runQuestionGenerator({
  mode,
  rendered,
  outputPath = generatedQuestionModelPath,
  renameFile = rename,
}: RunQuestionGeneratorOptions) {
  const current = await readExisting(outputPath)
  if (current === rendered) return mode === 'check' ? 'current' as const : 'unchanged' as const
  if (mode === 'check') {
    throw new Error('question model artifact drift. Run npm run questions:generate')
  }

  await assertSafeWriteTarget(outputPath)
  const temporaryPath = resolve(
    dirname(outputPath),
    `.${basename(outputPath)}.tmp-${process.pid}-${randomUUID()}`,
  )
  try {
    await writeFile(temporaryPath, rendered, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o644,
    })
    await renameFile(temporaryPath, outputPath)
  } catch (error) {
    await removeIfPresent(temporaryPath)
    throw error
  }
  return 'written' as const
}

async function main() {
  const argument = process.argv[2]
  const mode = argument === '--write'
    ? 'write' as const
    : argument === '--check'
      ? 'check' as const
      : undefined
  if (!mode) throw new Error('Use --write or --check')
  await runQuestionGenerator({
    mode,
    rendered: compileAndRenderQuestionArtifact(),
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
