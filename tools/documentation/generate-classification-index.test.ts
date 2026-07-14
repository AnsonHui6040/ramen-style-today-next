import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { expect, test } from 'vitest'

import { installGeneratedOutputs } from './generate-classification-index.js'

const sourceRoot = resolve(import.meta.dirname, '../..')

function writeRegisteredConsumers(repoRoot: string) {
  for (const [file, importedPackage] of [
    ['tools/parity/questions/observable-trace.ts', '@ramen-style/classification-core/compiler'],
    ['tools/parity/questions/parity.ts', '@ramen-style/classification-core/compiler'],
    ['tools/questions/generate-question-model.ts', '@ramen-style/classification-core/compiler'],
    ['tools/validation/validate-classification.ts', '@ramen-style/classification-core/compiler'],
  ] as const) {
    const target = join(repoRoot, file)
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, `import '${importedPackage}'\n`)
  }
}

function writeDocumentationFixture(repoRoot: string) {
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

  const contractsTarget = join(repoRoot, 'tools/parity/questions/contracts.ts')
  mkdirSync(resolve(contractsTarget, '..'), { recursive: true })
  cpSync(join(sourceRoot, 'tools/parity/questions/contracts.ts'), contractsTarget)
  const fixtureManifest = 'tools/parity/fixtures/questions/legacy-v1/manifest.json'
  const fixtureManifestTarget = join(repoRoot, fixtureManifest)
  mkdirSync(resolve(fixtureManifestTarget, '..'), { recursive: true })
  cpSync(join(sourceRoot, fixtureManifest), fixtureManifestTarget)

  for (const file of [
    'packages/classification-core/src/definitions/questions.ts',
    'packages/classification-core/src/definitions/questions.test.ts',
    'packages/classification-core/src/definitions/synthetic.ts',
    'packages/classification-core/src/compiler/questions/source-schema.ts',
    'packages/classification-core/src/compiler/questions/compile.ts',
    'packages/classification-core/src/compiler/questions/proof.ts',
    'packages/classification-core/src/compiler/questions/proof.test.ts',
    'packages/classification-core/src/compiler/source-schema.ts',
    'packages/classification-core/src/compiler/compile.ts',
    'packages/classification-core/src/compiler/compile.test.ts',
    'packages/classification-core/src/flow/evaluate.ts',
    'tools/parity/questions/parity.test.ts',
  ]) {
    const target = join(repoRoot, file)
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, '')
  }
  writeRegisteredConsumers(repoRoot)
}

test('write mode rejects an owned output symlink before changing any output', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-cli-'))
  const externalRoot = mkdtempSync(join(tmpdir(), 'ramen-index-outside-'))
  try {
    writeDocumentationFixture(repoRoot)

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
        join(repoRoot, 'tools/documentation/generate-classification-index.ts'),
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

test('write mode rejects a symlinked classification root without writing outside the repository', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-cli-'))
  const externalRoot = mkdtempSync(join(tmpdir(), 'ramen-index-outside-'))
  try {
    writeDocumentationFixture(repoRoot)

    writeFileSync(join(repoRoot, '.gitignore'), 'node_modules/\n')
    symlinkSync(join(sourceRoot, 'node_modules'), join(repoRoot, 'node_modules'), 'dir')
    execFileSync('git', ['init', '--quiet'], { cwd: repoRoot })
    mkdirSync(join(repoRoot, 'docs'), { recursive: true })
    symlinkSync(externalRoot, join(repoRoot, 'docs/classification'), 'dir')

    const result = spawnSync(
      process.execPath,
      [
        join(sourceRoot, 'node_modules/tsx/dist/cli.mjs'),
        join(repoRoot, 'tools/documentation/generate-classification-index.ts'),
        '--write',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'DOC_INDEX_DRIFT owned output parent must be a regular repository directory',
    )
    expect(readdirSync(externalRoot)).toEqual([])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(externalRoot, { recursive: true, force: true })
  }
})

test('a second output install failure restores both originals and removes transaction artifacts', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-transaction-'))
  try {
    const classificationRoot = join(repoRoot, 'docs/classification')
    mkdirSync(classificationRoot, { recursive: true })
    const manifest = join(classificationRoot, 'manifest.json')
    const index = join(classificationRoot, 'index.md')
    writeFileSync(manifest, 'original manifest\n')
    writeFileSync(index, 'original index\n')

    let temporaryInstallCount = 0
    expect(() => installGeneratedOutputs(
      repoRoot,
      new Map([
        ['docs/classification/manifest.json', 'new manifest\n'],
        ['docs/classification/index.md', 'new index\n'],
      ]),
      {
        rename: (from, to) => {
          if (lstatSync(from).isFile() && from.includes('.tmp-')) {
            temporaryInstallCount += 1
            if (temporaryInstallCount === 2) throw new Error('simulated second install failure')
          }
          renameSync(from, to)
        },
      },
    )).toThrow('simulated second install failure')

    expect(readFileSync(manifest, 'utf8')).toBe('original manifest\n')
    expect(readFileSync(index, 'utf8')).toBe('original index\n')
    expect(readdirSync(classificationRoot).sort()).toEqual(['index.md', 'manifest.json'])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('Git inventory preserves a newline-containing eligible consumer path', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-cli-'))
  try {
    writeDocumentationFixture(repoRoot)
    const newlineConsumer = join(repoRoot, 'apps/web/line\nbreak.ts')
    mkdirSync(resolve(newlineConsumer, '..'), { recursive: true })
    writeFileSync(newlineConsumer, "import '@ramen-style/classification-core'\n")

    writeFileSync(join(repoRoot, '.gitignore'), 'node_modules/\n')
    symlinkSync(join(sourceRoot, 'node_modules'), join(repoRoot, 'node_modules'), 'dir')
    execFileSync('git', ['init', '--quiet'], { cwd: repoRoot })
    const classificationRoot = join(repoRoot, 'docs/classification')
    mkdirSync(classificationRoot, { recursive: true })
    writeFileSync(join(classificationRoot, 'change-map.md'), '# Change map\n')
    writeFileSync(join(classificationRoot, 'manifest.json'), 'old manifest\n')
    writeFileSync(join(classificationRoot, 'index.md'), 'old index\n')

    const result = spawnSync(
      process.execPath,
      [
        join(sourceRoot, 'node_modules/tsx/dist/cli.mjs'),
        join(repoRoot, 'tools/documentation/generate-classification-index.ts'),
        '--write',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'Detected core consumer is not registered: apps/web/line\\nbreak.ts',
    )
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})
