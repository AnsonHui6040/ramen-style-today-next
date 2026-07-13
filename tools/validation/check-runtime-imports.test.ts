import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import * as ts from 'typescript'
import { describe, expect, test } from 'vitest'

import { checkRuntimeImports } from './check-runtime-imports.js'

const nodeNextOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
} satisfies ts.CompilerOptions
const runtimeFamilies = [
  { importExtension: '.js', sourceExtension: '.ts', declarationExtension: '.d.ts' },
  { importExtension: '.mjs', sourceExtension: '.mts', declarationExtension: '.d.mts' },
  { importExtension: '.cjs', sourceExtension: '.cts', declarationExtension: '.d.cts' },
] as const

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

  test.each(runtimeFamilies)('matches NodeNext $importExtension to $sourceExtension extension substitution', ({
    importExtension,
    sourceExtension,
  }) => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-nodenext-'))
    try {
      const sourceRoot = join(repoRoot, 'packages/classification-core/src')
      const entry = join(sourceRoot, 'index.ts')
      const specifier = `./bridge${importExtension}`
      const sourceTarget = join(sourceRoot, `bridge${sourceExtension}`)
      mkdirSync(join(sourceRoot, 'definitions'), { recursive: true })
      writeFileSync(entry, `export * from '${specifier}'\n`)
      writeFileSync(join(sourceRoot, `bridge${importExtension}`), 'export const harmless = true\n')
      writeFileSync(
        sourceTarget,
        "export * from './definitions/questions.js'\n",
      )
      writeFileSync(
        join(sourceRoot, 'definitions/questions.ts'),
        'export const definitionsOnly = true\n',
      )

      const typescriptResolved = ts.resolveModuleName(
        specifier,
        entry,
        nodeNextOptions,
        ts.sys,
      ).resolvedModule?.resolvedFileName
      expect(typescriptResolved).toBe(sourceTarget)

      const result = checkRuntimeImports(
        repoRoot,
        'packages/classification-core/src/index.ts',
      )
      expect(result.forbidden).toEqual([{
        from: `packages/classification-core/src/bridge${sourceExtension}`,
        specifier: './definitions/questions.js',
        reason: 'forbidden-path:definitions',
      }])
      expect(result.visited).toContain(`packages/classification-core/src/bridge${sourceExtension}`)
      expect(result.visited).not.toContain(`packages/classification-core/src/bridge${importExtension}`)
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  test.each(runtimeFamilies)(
    'rejects declaration-only $declarationExtension backing for $importExtension',
    ({ importExtension, declarationExtension }) => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-declaration-only-'))
      try {
        const sourceRoot = join(repoRoot, 'packages/classification-core/src')
        const entry = join(sourceRoot, 'index.ts')
        const specifier = `./bridge${importExtension}`
        const declaration = join(sourceRoot, `bridge${declarationExtension}`)
        mkdirSync(sourceRoot, { recursive: true })
        writeFileSync(entry, `export { value } from '${specifier}'\n`)
        writeFileSync(declaration, 'export declare const value: boolean\n')

        expect(ts.resolveModuleName(
          specifier,
          entry,
          nodeNextOptions,
          ts.sys,
        ).resolvedModule?.resolvedFileName).toBe(declaration)

        const result = checkRuntimeImports(
          repoRoot,
          'packages/classification-core/src/index.ts',
        )
        expect(result.forbidden).toEqual([{
          from: 'packages/classification-core/src/index.ts',
          specifier,
          reason: 'unresolved-local-import',
        }])
        expect(result.visited).toEqual(['packages/classification-core/src/index.ts'])
      } finally {
        rmSync(repoRoot, { recursive: true, force: true })
      }
    },
  )

  test.each(runtimeFamilies)(
    'uses exact $importExtension runtime backing when $declarationExtension shadows it',
    ({ importExtension, declarationExtension }) => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-declaration-shadow-'))
      try {
        const sourceRoot = join(repoRoot, 'packages/classification-core/src')
        const entry = join(sourceRoot, 'index.ts')
        const specifier = `./bridge${importExtension}`
        const declaration = join(sourceRoot, `bridge${declarationExtension}`)
        const runtimeTarget = join(sourceRoot, `bridge${importExtension}`)
        mkdirSync(sourceRoot, { recursive: true })
        writeFileSync(entry, `export { value } from '${specifier}'\n`)
        writeFileSync(declaration, 'export declare const value: boolean\n')
        writeFileSync(
          runtimeTarget,
          importExtension === '.cjs'
            ? "require('node:fs')\nexports.value = true\n"
            : "import 'node:fs'\nexport const value = true\n",
        )

        expect(ts.resolveModuleName(
          specifier,
          entry,
          nodeNextOptions,
          ts.sys,
        ).resolvedModule?.resolvedFileName).toBe(declaration)

        const result = checkRuntimeImports(
          repoRoot,
          'packages/classification-core/src/index.ts',
        )
        expect(result.forbidden).toEqual([{
          from: `packages/classification-core/src/bridge${importExtension}`,
          specifier: 'node:fs',
          reason: 'forbidden-module:node',
        }])
        expect(result.visited).toContain(`packages/classification-core/src/bridge${importExtension}`)
        expect(result.visited).not.toContain(
          `packages/classification-core/src/bridge${declarationExtension}`,
        )
      } finally {
        rmSync(repoRoot, { recursive: true, force: true })
      }
    },
  )

  test.each(runtimeFamilies)(
    'never treats an explicit $declarationExtension declaration as runtime backing',
    ({ declarationExtension }) => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-explicit-declaration-'))
      try {
        const sourceRoot = join(repoRoot, 'packages/classification-core/src')
        const specifier = `./bridge${declarationExtension}`
        mkdirSync(sourceRoot, { recursive: true })
        writeFileSync(join(sourceRoot, 'index.ts'), `export { value } from '${specifier}'\n`)
        writeFileSync(
          join(sourceRoot, `bridge${declarationExtension}`),
          'export declare const value: boolean\n',
        )

        const result = checkRuntimeImports(
          repoRoot,
          'packages/classification-core/src/index.ts',
        )
        expect(result.forbidden).toEqual([{
          from: 'packages/classification-core/src/index.ts',
          specifier,
          reason: 'unresolved-local-import',
        }])
        expect(result.visited).toEqual(['packages/classification-core/src/index.ts'])
      } finally {
        rmSync(repoRoot, { recursive: true, force: true })
      }
    },
  )

  test('fails closed on a computed dynamic import', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-computed-import-'))
    try {
      mkdirSync(join(repoRoot, 'packages/classification-core/src'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'packages/classification-core/src/index.ts'),
        [
          "const target = 'node:fs'",
          'export const load = () => import(target)',
          "const harmless = 'import(target)'",
          'void harmless',
          '',
        ].join('\n'),
      )

      expect(checkRuntimeImports(
        repoRoot,
        'packages/classification-core/src/index.ts',
      ).forbidden).toEqual([{
        from: 'packages/classification-core/src/index.ts',
        specifier: 'import(<nonliteral>)',
        reason: 'nonliteral-dynamic-module-load',
      }])
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  test('fails closed on a computed CommonJS require', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-computed-require-'))
    try {
      mkdirSync(join(repoRoot, 'packages/classification-core/src'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'packages/classification-core/src/index.ts'),
        [
          "const target = './compiler/index.js'",
          'export const load = () => require(target)',
          "const harmless = 'require(target)'",
          'void harmless',
          '',
        ].join('\n'),
      )

      expect(checkRuntimeImports(
        repoRoot,
        'packages/classification-core/src/index.ts',
      ).forbidden).toEqual([{
        from: 'packages/classification-core/src/index.ts',
        specifier: 'require(<nonliteral>)',
        reason: 'nonliteral-dynamic-module-load',
      }])
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  test('keeps literal dynamic import and require targets in ordinary validation', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-literal-loads-'))
    try {
      const sourceRoot = join(repoRoot, 'packages/classification-core/src')
      mkdirSync(sourceRoot, { recursive: true })
      writeFileSync(
        join(sourceRoot, 'index.ts'),
        [
          "void import('./dynamic.js')",
          "const loaded = require('./commonjs.js')",
          'void loaded',
          '',
        ].join('\n'),
      )
      writeFileSync(join(sourceRoot, 'dynamic.ts'), "import 'node:crypto'\n")
      writeFileSync(join(sourceRoot, 'commonjs.ts'), "import 'zod'\n")

      const result = checkRuntimeImports(
        repoRoot,
        'packages/classification-core/src/index.ts',
      )
      expect(result.forbidden.map(({ reason }) => reason)).toEqual([
        'forbidden-module:node',
        'forbidden-module:zod',
      ])
      expect(result.visited).toContain('packages/classification-core/src/commonjs.ts')
      expect(result.visited).toContain('packages/classification-core/src/dynamic.ts')
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  test('does not classify a core-package prefix collision as a local route', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-runtime-core-prefix-'))
    try {
      mkdirSync(join(repoRoot, 'packages/classification-core/src'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'packages/classification-core/src/index.ts'),
        "import '@ramen-style/classification-core-utils'\n",
      )

      expect(checkRuntimeImports(
        repoRoot,
        'packages/classification-core/src/index.ts',
      ).forbidden).toEqual([])
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
