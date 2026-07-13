import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
})
