import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { scanCoreConsumers } from './scan-imports.js'

describe('core consumer scanner', () => {
  test('finds consumers while excluding core, tests, and index infrastructure', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-'))
    try {
      mkdirSync(join(repoRoot, 'apps/web'), { recursive: true })
      mkdirSync(join(repoRoot, 'packages/classification-core/src'), { recursive: true })
      mkdirSync(join(repoRoot, 'tools/documentation'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'apps/web/consumer.ts'),
        "import type { ClassificationModel } from '@ramen-style/classification-core'\n",
      )
      writeFileSync(
        join(repoRoot, 'apps/web/consumer.test.ts'),
        "import '@ramen-style/classification-core'\n",
      )
      writeFileSync(
        join(repoRoot, 'packages/classification-core/src/internal.ts'),
        "import '@ramen-style/classification-core/compiler'\n",
      )
      writeFileSync(
        join(repoRoot, 'tools/documentation/generator.ts'),
        "import '@ramen-style/classification-core/compiler'\n",
      )

      expect([...scanCoreConsumers(
        repoRoot,
        ['apps', 'packages', 'tools'],
        new Set([
          'apps/web/consumer.ts',
          'apps/web/consumer.test.ts',
          'packages/classification-core/src/internal.ts',
          'tools/documentation/generator.ts',
        ]),
      )]).toEqual([
        'apps/web/consumer.ts',
      ])
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  test('finds CommonJS package imports in cts consumers', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-'))
    try {
      mkdirSync(join(repoRoot, 'apps/web'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'apps/web/commonjs.cts'),
        "const core = require('@ramen-style/classification-core/compiler')\n",
      )

      expect([...scanCoreConsumers(
        repoRoot,
        ['apps'],
        new Set(['apps/web/commonjs.cts']),
      )]).toEqual(['apps/web/commonjs.cts'])
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  test('excludes consumers outside the eligible repository inventory', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-'))
    try {
      mkdirSync(join(repoRoot, 'apps/web'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'apps/web/eligible.ts'),
        "import '@ramen-style/classification-core'\n",
      )
      writeFileSync(
        join(repoRoot, 'apps/web/ignored-local.ts'),
        "import '@ramen-style/classification-core'\n",
      )

      expect([...scanCoreConsumers(
        repoRoot,
        ['apps'],
        new Set(['apps/web/eligible.ts']),
      )]).toEqual(['apps/web/eligible.ts'])
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  test('excludes comparator-only utility imports without hiding compiler consumers', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-'))
    try {
      mkdirSync(join(repoRoot, 'tools/migration'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'tools/migration/order-only.ts'),
        "import { compareCodePoints } from '@ramen-style/classification-core/compiler'\n",
      )
      writeFileSync(
        join(repoRoot, 'tools/migration/compiler-consumer.ts'),
        [
          "import { compareCodePoints, stableJson } from '@ramen-style/classification-core/compiler'",
          'void compareCodePoints',
          'void stableJson',
          '',
        ].join('\n'),
      )
      writeFileSync(
        join(repoRoot, 'tools/migration/mixed-consumer.cts'),
        [
          "import { compareCodePoints } from '@ramen-style/classification-core/compiler'",
          "const core = require('@ramen-style/classification-core/compiler')",
          'void compareCodePoints',
          'void core',
          '',
        ].join('\n'),
      )

      expect([...scanCoreConsumers(
        repoRoot,
        ['tools'],
        new Set([
          'tools/migration/order-only.ts',
          'tools/migration/compiler-consumer.ts',
          'tools/migration/mixed-consumer.cts',
        ]),
      )]).toEqual([
        'tools/migration/compiler-consumer.ts',
        'tools/migration/mixed-consumer.cts',
      ])
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})
