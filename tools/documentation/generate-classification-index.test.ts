import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { expect, test } from 'vitest'

const sourceRoot = resolve(import.meta.dirname, '../..')

test('write mode rejects an owned output symlink before changing any output', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-cli-'))
  const externalRoot = mkdtempSync(join(tmpdir(), 'ramen-index-outside-'))
  try {
    const documentationRoot = join(repoRoot, 'tools/documentation')
    mkdirSync(documentationRoot, { recursive: true })
    for (const file of [
      'build-index.ts',
      'generate-classification-index.ts',
      'relations.ts',
      'scan-imports.ts',
    ]) {
      cpSync(join(sourceRoot, 'tools/documentation', file), join(documentationRoot, file))
    }

    for (const file of [
      'packages/classification-core/src/definitions/synthetic.ts',
      'packages/classification-core/src/compiler/source-schema.ts',
      'packages/classification-core/src/compiler/compile.ts',
      'packages/classification-core/src/compiler/compile.test.ts',
    ]) {
      const target = join(repoRoot, file)
      mkdirSync(resolve(target, '..'), { recursive: true })
      writeFileSync(target, '')
    }
    const validation = join(repoRoot, 'tools/validation/validate-classification.ts')
    mkdirSync(resolve(validation, '..'), { recursive: true })
    writeFileSync(validation, "import '@ramen-style/classification-core/compiler'\n")

    writeFileSync(join(repoRoot, '.gitignore'), 'node_modules/\n')
    symlinkSync(join(sourceRoot, 'node_modules'), join(repoRoot, 'node_modules'), 'dir')
    execFileSync('git', ['init', '--quiet'], { cwd: repoRoot })

    const classificationRoot = join(repoRoot, 'docs/classification')
    mkdirSync(classificationRoot, { recursive: true })
    writeFileSync(join(classificationRoot, 'change-map.md'), '# Change map\n')
    const manifest = join(classificationRoot, 'manifest.json')
    writeFileSync(manifest, 'manifest remains unchanged\n')
    const externalTarget = join(externalRoot, 'outside.md')
    writeFileSync(externalTarget, 'outside remains unchanged\n')
    symlinkSync(externalTarget, join(classificationRoot, 'index.md'))

    const result = spawnSync(
      process.execPath,
      [
        join(sourceRoot, 'node_modules/tsx/dist/cli.mjs'),
        join(documentationRoot, 'generate-classification-index.ts'),
        '--write',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'DOC_INDEX_DRIFT unexpected owned-path entry docs/classification/index.md',
    )
    expect(readFileSync(externalTarget, 'utf8')).toBe('outside remains unchanged\n')
    expect(readFileSync(manifest, 'utf8')).toBe('manifest remains unchanged\n')
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(externalRoot, { recursive: true, force: true })
  }
})
