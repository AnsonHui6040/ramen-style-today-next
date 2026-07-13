import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { checkRuntimeImports } from './check-runtime-imports.js'

describe('runtime import boundary', () => {
  test('keeps the real public runtime dependency graph browser-neutral', () => {
    const repoRoot = resolve(import.meta.dirname, '../..')
    const result = checkRuntimeImports(
      repoRoot,
      'packages/classification-core/src/index.ts',
    )
    expect(result.forbidden).toEqual([])
  })

  test('walks re-exports transitively and rejects forbidden modules and paths', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-imports-'))
    try {
      mkdirSync(join(repoRoot, 'packages/classification-core/src/flow'), { recursive: true })
      mkdirSync(join(repoRoot, 'packages/classification-core/src/compiler'), { recursive: true })
      mkdirSync(join(repoRoot, 'packages/classification-core/src/definitions'), { recursive: true })
      mkdirSync(join(repoRoot, 'tools'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'packages/classification-core/src/index.ts'),
        "export * from './flow/index.js'\n",
      )
      writeFileSync(
        join(repoRoot, 'packages/classification-core/src/flow/index.ts'),
        [
          "import 'node:crypto'",
          "import 'react'",
          "import 'zod'",
          "import '@legacy/questionnaire'",
          "import '@runtime/persistence'",
          "import '@runtime/scoring'",
          "import '@runtime/styles'",
          "import '@runtime/catalog'",
          "export * from '../compiler/index.js'",
          "export * from '../definitions/questions.js'",
          "export * from '../../../../tools/runtime-helper.js'",
          "const harmless = \"from 'node:fs'\"",
          'void harmless',
          '',
        ].join('\n'),
      )
      writeFileSync(
        join(repoRoot, 'packages/classification-core/src/compiler/index.ts'),
        'export const compilerOnly = true\n',
      )
      writeFileSync(
        join(repoRoot, 'packages/classification-core/src/definitions/questions.ts'),
        'export const definitionsOnly = true\n',
      )
      writeFileSync(
        join(repoRoot, 'tools/runtime-helper.ts'),
        'export const toolingOnly = true\n',
      )

      const result = checkRuntimeImports(
        repoRoot,
        'packages/classification-core/src/index.ts',
      )
      expect(result.forbidden.map(({ reason }) => reason)).toEqual([
        'forbidden-module:catalog',
        'forbidden-module:legacy',
        'forbidden-module:node',
        'forbidden-module:persistence',
        'forbidden-module:react',
        'forbidden-module:scoring',
        'forbidden-module:styles',
        'forbidden-module:zod',
        'forbidden-path:compiler',
        'forbidden-path:definitions',
        'forbidden-path:tools',
      ])
      expect(result.visited).toContain('packages/classification-core/src/flow/index.ts')
      expect(result.visited).toContain('packages/classification-core/src/compiler/index.ts')
      expect(result.forbidden.some(({ specifier }) => specifier === 'node:fs')).toBe(false)
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  test('rejects a lexical import escape without traversing the outside target', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-import-escape-'))
    const repoRoot = join(fixtureRoot, 'repo')
    try {
      mkdirSync(join(repoRoot, 'packages/classification-core/src'), { recursive: true })
      mkdirSync(join(fixtureRoot, 'outside/compiler'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'packages/classification-core/src/index.ts'),
        "export * from '../../../../outside/compiler/index.js'\n",
      )
      writeFileSync(
        join(fixtureRoot, 'outside/compiler/index.ts'),
        "import 'node:crypto'\nexport const escaped = true\n",
      )

      const result = checkRuntimeImports(
        repoRoot,
        'packages/classification-core/src/index.ts',
      )
      expect(result.forbidden).toEqual([{
        from: 'packages/classification-core/src/index.ts',
        specifier: '../../../../outside/compiler/index.js',
        reason: 'forbidden-path:outside-repository',
      }])
      expect(result.visited).toEqual(['packages/classification-core/src/index.ts'])
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  test('rejects a physical import escape through a symlink without traversing it', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-import-symlink-'))
    const repoRoot = join(fixtureRoot, 'repo')
    try {
      mkdirSync(join(repoRoot, 'packages/classification-core/src'), { recursive: true })
      mkdirSync(join(fixtureRoot, 'outside'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'packages/classification-core/src/index.ts'),
        "export * from './escaped.js'\n",
      )
      const outsideTarget = join(fixtureRoot, 'outside/escaped.ts')
      writeFileSync(outsideTarget, "import 'zod'\nexport const escaped = true\n")
      symlinkSync(
        outsideTarget,
        join(repoRoot, 'packages/classification-core/src/escaped.ts'),
      )

      const result = checkRuntimeImports(
        repoRoot,
        'packages/classification-core/src/index.ts',
      )
      expect(result.forbidden).toEqual([{
        from: 'packages/classification-core/src/index.ts',
        specifier: './escaped.js',
        reason: 'forbidden-path:outside-repository',
      }])
      expect(result.visited).toEqual(['packages/classification-core/src/index.ts'])
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  test('rejects a lexical entrypoint escape before traversal', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-entry-escape-'))
    const repoRoot = join(fixtureRoot, 'repo')
    try {
      mkdirSync(repoRoot)
      writeFileSync(
        join(fixtureRoot, 'outside-entry.ts'),
        "import 'node:crypto'\nexport const escaped = true\n",
      )

      expect(() => checkRuntimeImports(repoRoot, '../outside-entry.ts'))
        .toThrow('Runtime entrypoint must stay inside repository root')
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })

  test('rejects a physical entrypoint escape through a symlink before traversal', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-entry-symlink-'))
    const repoRoot = join(fixtureRoot, 'repo')
    try {
      mkdirSync(repoRoot)
      const outsideTarget = join(fixtureRoot, 'outside-entry.ts')
      writeFileSync(outsideTarget, "import 'zod'\nexport const escaped = true\n")
      symlinkSync(outsideTarget, join(repoRoot, 'index.ts'))

      expect(() => checkRuntimeImports(repoRoot, 'index.ts'))
        .toThrow('Runtime entrypoint must stay inside repository root')
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  })
})
