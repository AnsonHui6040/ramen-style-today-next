import { spawnSync } from 'node:child_process'
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, test } from 'vitest'

import type {
  CompiledQuestionModel,
  StyleDefinitionBundleSource,
} from '@ramen-style/classification-core/compiler'
import { questionModel } from '@ramen-style/classification-core'
import {
  compileAndRenderStyleArtifact,
  generatedStyleModelPath,
  runStyleGenerator,
  styleArtifactRepositoryRoot,
  type StyleArtifactFileSystem,
} from './generate-style-model.js'

const temporaryRoots: string[] = []
const targetRelativePath = 'packages/classification-core/src/generated/style-model.ts'

interface MappedFileSystem {
  readonly fileSystem: StyleArtifactFileSystem
  readonly events: string[]
  readonly mapPath: (path: string) => string
}

async function createMappedRepository(content?: string): Promise<{
  readonly root: string
  readonly target: string
  readonly mapped: MappedFileSystem
}> {
  const root = await mkdtemp(join(tmpdir(), 'ramen-style-artifact-'))
  temporaryRoots.push(root)
  const target = join(root, targetRelativePath)
  await mkdir(dirname(target), { recursive: true })
  if (content !== undefined) await writeFile(target, content, 'utf8')
  return { root, target, mapped: mappedFileSystem(root) }
}

function mappedFileSystem(root: string, renameFailure = false): MappedFileSystem {
  const events: string[] = []
  const mapPath = (path: string) => {
    const suffix = relative(styleArtifactRepositoryRoot, path)
    if (suffix.startsWith('..') || resolve(styleArtifactRepositoryRoot, suffix) !== path) {
      throw new Error('test adapter received a path outside the approved repository')
    }
    return join(root, suffix)
  }
  const fileSystem: StyleArtifactFileSystem = {
    lstat: async (path) => {
      events.push(`lstat:${path}`)
      return lstat(mapPath(path))
    },
    readFile: async (path) => {
      events.push(`read:${path}`)
      return readFile(mapPath(path), 'utf8')
    },
    open: async (path, flags, mode) => {
      events.push(`open:${path}:${flags}:${mode.toString(8)}`)
      const handle = await open(mapPath(path), flags, mode)
      return {
        writeFile: async (content) => {
          events.push(`write:${path}`)
          await handle.writeFile(content, 'utf8')
        },
        sync: async () => {
          events.push(`sync:${path}`)
          await handle.sync()
        },
        close: async () => {
          events.push(`close:${path}`)
          await handle.close()
        },
      }
    },
    rename: async (from, to) => {
      events.push(`rename:${from}:${to}`)
      if (renameFailure) throw new Error(`/private/unsafe trap at ${from}`)
      await rename(mapPath(from), mapPath(to))
    },
    unlink: async (path) => {
      events.push(`unlink:${path}`)
      await unlink(mapPath(path))
    },
  }
  return { fileSystem, events, mapPath }
}

function writeEvents(events: readonly string[]) {
  return events.filter((event) => /^(open|write|sync|close|rename|unlink):/.test(event))
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    rm(root, { recursive: true, force: true })
  )))
})

describe('style model generator modes', () => {
  test('generates a missing target through a flushed sibling and atomic rename', async () => {
    const { target, mapped } = await createMappedRepository()

    await expect(runStyleGenerator({
      mode: 'write',
      fileSystem: mapped.fileSystem,
      renderArtifact: () => 'generated artifact\n',
      createTemporaryId: () => 'missing-target',
    })).resolves.toBe('written')

    expect(await readFile(target, 'utf8')).toBe('generated artifact\n')
    expect(await readdir(dirname(target))).toEqual(['style-model.ts'])
    const writes = writeEvents(mapped.events)
    expect(writes.map((event) => event.split(':', 1)[0])).toEqual([
      'open',
      'write',
      'sync',
      'close',
      'rename',
    ])
    const renameEvent = writes.at(-1)!
    expect(renameEvent).toContain(`${dirname(generatedStyleModelPath)}/.style-model.ts.tmp-missing-target`)
    expect(renameEvent).toContain(`:${generatedStyleModelPath}`)
  })

  test('atomically replaces changed bytes and leaves no temporary residue', async () => {
    const { target, mapped } = await createMappedRepository('old artifact\n')
    const before = await stat(target)

    await expect(runStyleGenerator({
      mode: 'write',
      fileSystem: mapped.fileSystem,
      renderArtifact: () => 'new artifact\n',
      createTemporaryId: () => 'changed-target',
    })).resolves.toBe('written')

    expect(await readFile(target, 'utf8')).toBe('new artifact\n')
    expect((await stat(target)).ino).not.toBe(before.ino)
    expect(await readdir(dirname(target))).toEqual(['style-model.ts'])
    expect(writeEvents(mapped.events).filter((event) => event.startsWith('rename:')))
      .toHaveLength(1)
  })

  test('does not rewrite unchanged bytes or alter inode and mtime', async () => {
    const { target, mapped } = await createMappedRepository('current artifact\n')
    const before = await stat(target)

    await expect(runStyleGenerator({
      mode: 'write',
      fileSystem: mapped.fileSystem,
      renderArtifact: () => 'current artifact\n',
      createTemporaryId: () => 'unused',
    })).resolves.toBe('unchanged')

    expect(await stat(target)).toMatchObject({ ino: before.ino, mtimeMs: before.mtimeMs })
    expect(writeEvents(mapped.events)).toEqual([])
  })

  test('check accepts exact bytes without writes or mtime changes', async () => {
    const { target, mapped } = await createMappedRepository('current artifact\n')
    const before = await stat(target)

    await expect(runStyleGenerator({
      mode: 'check',
      fileSystem: mapped.fileSystem,
      renderArtifact: () => 'current artifact\n',
    })).resolves.toBe('current')

    expect(await stat(target)).toMatchObject({ ino: before.ino, mtimeMs: before.mtimeMs })
    expect(writeEvents(mapped.events)).toEqual([])
  })

  test.each([
    ['drifted', 'old artifact\n' as string | undefined],
    ['missing', undefined],
  ])('check rejects a %s target with zero writes', async (_label, content) => {
    const { target, mapped } = await createMappedRepository(content)

    await expect(runStyleGenerator({
      mode: 'check',
      fileSystem: mapped.fileSystem,
      renderArtifact: () => 'expected artifact\n',
    })).rejects.toThrow('style model artifact drift. Run npm run styles:generate')

    if (content === undefined) {
      await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
    } else {
      expect(await readFile(target, 'utf8')).toBe(content)
    }
    expect(writeEvents(mapped.events)).toEqual([])
  })
})

describe('style model generator failure safety', () => {
  test('preserves the original target and cleans the sibling after rename failure', async () => {
    const { target, root } = await createMappedRepository('original artifact\n')
    const mapped = mappedFileSystem(root, true)

    await expect(runStyleGenerator({
      mode: 'write',
      fileSystem: mapped.fileSystem,
      renderArtifact: () => 'replacement artifact\n',
      createTemporaryId: () => 'rename-failure',
    })).rejects.toThrow('style model artifact publication failed')

    expect(await readFile(target, 'utf8')).toBe('original artifact\n')
    expect(await readdir(dirname(target))).toEqual(['style-model.ts'])
    expect(writeEvents(mapped.events).map((event) => event.split(':', 1)[0])).toEqual([
      'open',
      'write',
      'sync',
      'close',
      'rename',
      'unlink',
    ])
    await expect(runStyleGenerator({
      mode: 'write',
      fileSystem: mapped.fileSystem,
      renderArtifact: () => 'replacement artifact\n',
      createTemporaryId: () => 'rename-failure-2',
    })).rejects.not.toThrow('/private/unsafe trap')
  })

  test('rejects a symlink target and a symlink ancestor without writes', async () => {
    const first = await createMappedRepository()
    const outside = join(first.root, 'outside.ts')
    await writeFile(outside, 'outside\n', 'utf8')
    await symlink(outside, first.target)

    await expect(runStyleGenerator({
      mode: 'write',
      fileSystem: first.mapped.fileSystem,
      renderArtifact: () => 'replacement\n',
    })).rejects.toThrow('style model output must be a regular file')
    expect(writeEvents(first.mapped.events)).toEqual([])
    expect(await readFile(outside, 'utf8')).toBe('outside\n')

    const second = await createMappedRepository()
    const generatedDirectory = dirname(second.target)
    const outsideDirectory = join(second.root, 'outside-directory')
    await rm(generatedDirectory, { recursive: true })
    await mkdir(outsideDirectory)
    await symlink(outsideDirectory, generatedDirectory)

    await expect(runStyleGenerator({
      mode: 'write',
      fileSystem: second.mapped.fileSystem,
      renderArtifact: () => 'replacement\n',
    })).rejects.toThrow('style model output boundary must use regular directories')
    expect(writeEvents(second.mapped.events)).toEqual([])
    expect(await readdir(outsideDirectory)).toEqual([])
  })

  test('rejects a directory target without writes', async () => {
    const { target, mapped } = await createMappedRepository()
    await mkdir(target)

    await expect(runStyleGenerator({
      mode: 'write',
      fileSystem: mapped.fileSystem,
      renderArtifact: () => 'replacement\n',
    })).rejects.toThrow('style model output must be a regular file')
    expect(writeEvents(mapped.events)).toEqual([])
    expect((await lstat(target)).isDirectory()).toBe(true)
  })

  test('does not follow or remove a pre-existing temporary symlink', async () => {
    const { root, target, mapped } = await createMappedRepository('original\n')
    const outside = join(root, 'outside-temporary-target')
    const temporary = mapped.mapPath(resolve(
      dirname(generatedStyleModelPath),
      '.style-model.ts.tmp-collision',
    ))
    await writeFile(outside, 'outside\n', 'utf8')
    await symlink(outside, temporary)

    await expect(runStyleGenerator({
      mode: 'write',
      fileSystem: mapped.fileSystem,
      renderArtifact: () => 'replacement\n',
      createTemporaryId: () => 'collision',
    })).rejects.toThrow('style model artifact publication failed')

    expect(await readFile(target, 'utf8')).toBe('original\n')
    expect(await readFile(outside, 'utf8')).toBe('outside\n')
    expect((await lstat(temporary)).isSymbolicLink()).toBe(true)
    expect(writeEvents(mapped.events).some((event) => event.startsWith('unlink:'))).toBe(false)
  })

  test('rejects an unsafe temporary token before opening a file', async () => {
    const { mapped } = await createMappedRepository('old\n')

    await expect(runStyleGenerator({
      mode: 'write',
      fileSystem: mapped.fileSystem,
      renderArtifact: () => 'new\n',
      createTemporaryId: () => '../escape',
    })).rejects.toThrow('style model temporary identifier is invalid')
    expect(writeEvents(mapped.events)).toEqual([])
  })

  test('bounds compile failures and performs zero filesystem operations', async () => {
    const { mapped } = await createMappedRepository('original\n')
    const invalid = structuredClone(
      (await import('@ramen-style/classification-core/compiler')).styleDefinitionBundle,
    ) as StyleDefinitionBundleSource & { modelVersion: string }
    invalid.modelVersion = 'future-model'

    await expect(runStyleGenerator({
      mode: 'write',
      fileSystem: mapped.fileSystem,
      renderArtifact: () => compileAndRenderStyleArtifact(
        invalid,
        questionModel as CompiledQuestionModel,
      ),
    })).rejects.toThrow('style model compilation failed: STYLE_MODEL_VERSION_MISMATCH')
    expect(mapped.events).toEqual([])
  })
})

describe('canonical style model generation', () => {
  test('renders deterministic bytes equal to the package serializer and committed target', async () => {
    const first = compileAndRenderStyleArtifact()
    const second = compileAndRenderStyleArtifact()

    expect(first).toBe(second)
    await expect(readFile(generatedStyleModelPath, 'utf8')).resolves.toBe(first)
  })

  test('uses only the fixed approved target and exposes no target argument', async () => {
    const source = await readFile(new URL('./generate-style-model.ts', import.meta.url), 'utf8')

    expect(generatedStyleModelPath).toBe(resolve(styleArtifactRepositoryRoot, targetRelativePath))
    expect(source).not.toMatch(/outputPath|targetPath|process\.argv\[3\]/)
    expect(source).toContain('const arguments_ = process.argv.slice(2)')
    expect(source).toContain('arguments_.length !== 1')
    expect(source).toContain("argument === '--write'")
    expect(source).toContain("argument === '--check'")
  })

  test('rejects extra target-like CLI arguments instead of ignoring them', () => {
    const executable = resolve(styleArtifactRepositoryRoot, 'node_modules/.bin/tsx')
    const script = fileURLToPath(new URL('./generate-style-model.ts', import.meta.url))
    const result = spawnSync(
      executable,
      [script, '--check', '/tmp/unapproved-style-model.ts'],
      {
        cwd: styleArtifactRepositoryRoot,
        encoding: 'utf8',
      },
    )

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('Use exactly one argument: --write or --check\n')
  })

  test('defines the exact generate and check npm scripts', async () => {
    const packageJson = JSON.parse(await readFile(
      new URL('../../package.json', import.meta.url),
      'utf8',
    )) as { scripts: Record<string, string> }

    expect(packageJson.scripts['styles:generate']).toBe(
      'tsx tools/styles/generate-style-model.ts --write',
    )
    expect(packageJson.scripts['styles:check']).toBe(
      'tsx tools/styles/generate-style-model.ts --check',
    )
  })
})
