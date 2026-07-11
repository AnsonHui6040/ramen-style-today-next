import { describe, expect, test } from 'vitest'

import { makeDiagnostic } from '../contracts/diagnostic.js'
import { DiagnosticCollector } from './collector.js'

describe('structured diagnostics', () => {
  test('aggregates and deterministically sorts independent findings', () => {
    const collector = new DiagnosticCollector()
    collector.error({
      code: 'REFERENCE_UNKNOWN',
      sourceFile: 'packages/core/b.ts',
      path: '/questions/1/dependsOn/0',
      message: 'Unknown question',
      entityId: 'demo-second',
    })
    collector.warning({
      code: 'STRUCTURE_INVALID',
      sourceFile: 'packages/core/a.ts',
      path: '/questions/0/id',
      message: 'Invalid ID',
    })

    expect(collector.toArray().map((item) => item.code)).toEqual([
      'STRUCTURE_INVALID',
      'REFERENCE_UNKNOWN',
    ])
    expect(collector.hasErrors()).toBe(true)
  })

  test('rejects unstable machine paths and dot paths', () => {
    expect(() => makeDiagnostic({
      severity: 'error',
      code: 'STRUCTURE_INVALID',
      sourceFile: '/Users/name/source.ts',
      path: 'questions.0.id',
      message: 'Bad location',
    })).toThrow('diagnostic sourceFile')
    expect(() => makeDiagnostic({
      severity: 'error',
      code: 'STRUCTURE_INVALID',
      sourceFile: 'packages/core/source.ts',
      path: 'questions.0.id',
      message: 'Bad data path',
    })).toThrow('diagnostic path')
  })
})
