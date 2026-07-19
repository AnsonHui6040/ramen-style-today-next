import { rename } from 'node:fs/promises'
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import type { QuestionDefinitionSource } from '@ramen-style/classification-core/compiler'
import {
  compileAndRenderQuestionArtifact,
  runQuestionGenerator,
} from './generate-question-model.js'

const temporaryRoots: string[] = []
const duplicateOrderDefinition: readonly QuestionDefinitionSource[] = [
  {
    id: 'first',
    order: 0,
    messageIds: { title: 'first-title', description: 'first-description' },
    selection: { type: 'single', min: 1, max: 1 },
    options: [{
      id: 'value',
      order: 0,
      messageIds: { label: 'first-value-label' },
    }],
  },
  {
    id: 'second',
    order: 0,
    messageIds: { title: 'second-title', description: 'second-description' },
    selection: { type: 'single', min: 1, max: 1 },
    options: [{
      id: 'value',
      order: 0,
      messageIds: { label: 'second-value-label' },
    }],
  },
]

async function temporaryOutput(content = 'original artifact\n') {
  const root = await mkdtemp(join(tmpdir(), 'ramen-question-model-'))
  temporaryRoots.push(root)
  const outputPath = join(root, 'question-model.ts')
  await writeFile(outputPath, content, 'utf8')
  return { root, outputPath }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    rm(root, { recursive: true, force: true })
  )))
})

describe('question model generator', () => {
  test('check mode reports actionable drift without writing', async () => {
    const { outputPath } = await temporaryOutput()
    const before = await readFile(outputPath, 'utf8')

    await expect(runQuestionGenerator({
      mode: 'check',
      rendered: `${before}\n`,
      outputPath,
    })).rejects.toThrow(
      'question model artifact drift. Run npm run questions:generate',
    )
    expect(await readFile(outputPath, 'utf8')).toBe(before)
  })

  test('check mode accepts exact bytes and remains read-only', async () => {
    const { outputPath } = await temporaryOutput()
    const before = await stat(outputPath)

    await expect(runQuestionGenerator({
      mode: 'check',
      rendered: 'original artifact\n',
      outputPath,
    })).resolves.toBe('current')
    expect(await stat(outputPath)).toMatchObject({
      ino: before.ino,
      mtimeMs: before.mtimeMs,
    })
  })

  test('write mode atomically replaces through a sibling only when bytes differ', async () => {
    const { root, outputPath } = await temporaryOutput()
    const renames: [string, string][] = []

    await expect(runQuestionGenerator({
      mode: 'write',
      rendered: 'replacement artifact\n',
      outputPath,
      renameFile: async (from, to) => {
        renames.push([from, to])
        await rename(from, to)
      },
    })).resolves.toBe('written')
    expect(renames).toHaveLength(1)
    expect(dirname(renames[0]![0])).toBe(dirname(outputPath))
    expect(renames[0]![1]).toBe(outputPath)
    expect(await readFile(outputPath, 'utf8')).toBe('replacement artifact\n')
    expect(await readdir(root)).toEqual(['question-model.ts'])

    renames.length = 0
    const before = await stat(outputPath)
    await expect(runQuestionGenerator({
      mode: 'write',
      rendered: 'replacement artifact\n',
      outputPath,
      renameFile: async (from, to) => {
        renames.push([from, to])
        await rename(from, to)
      },
    })).resolves.toBe('unchanged')
    expect(renames).toEqual([])
    expect(await stat(outputPath)).toMatchObject({
      ino: before.ino,
      mtimeMs: before.mtimeMs,
    })
  })

  test('compile-and-render surfaces proof failures', () => {
    expect(() => compileAndRenderQuestionArtifact(duplicateOrderDefinition)).toThrow(
      /question model compilation failed[\s\S]*QUESTION_ORDER_DUPLICATE/,
    )
  })
})
