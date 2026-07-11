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

      expect([...scanCoreConsumers(repoRoot, ['apps', 'packages', 'tools'])]).toEqual([
        'apps/web/consumer.ts',
      ])
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})
