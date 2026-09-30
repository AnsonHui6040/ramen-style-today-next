import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'
import {
  classificationDefinition,
  compileClassification,
} from '@ramen-style/classification-core/compiler'

import { createNewEngine } from './new-engine.js'
import { buildTables, digestTables } from './scenarios.js'

const fixture = JSON.parse(readFileSync(
  resolve(import.meta.dirname, 'fixtures/questions-flow.json'),
  'utf8',
)) as { sections: Record<string, { count: number; sha256: string }> }

describe('questions and flow legacy parity', () => {
  test('new flow reproduces every recorded legacy table exactly', () => {
    const compiled = compileClassification(
      classificationDefinition,
      'packages/classification-core/src/definitions/bundle.ts',
    )
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    // On mismatch run: npm run parity:legacy -- <legacy checkout> to locate the first difference.
    expect(digestTables(buildTables(createNewEngine(compiled.model)))).toEqual(fixture.sections)
  })
})
