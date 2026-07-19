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

  test('accepts reserved runtime identifier segments and rejects path-like runtime sources', () => {
    for (const sourceFile of [
      'runtime://parse-definition-bundle',
      'runtime://local-storage/legacy-state',
    ]) {
      expect(makeDiagnostic({
        severity: 'error',
        code: 'STRUCTURE_INVALID',
        sourceFile,
        path: '',
        message: 'Stable runtime source',
      }).sourceFile).toBe(sourceFile)
    }

    for (const sourceFile of [
      'runtime://',
      'runtime:///Users/private/project/input.json',
      'runtime://C:/private/input.json',
      'runtime://C:\\private\\input.json',
      'runtime://local-storage/./legacy-state',
      'runtime://local-storage/../legacy-state',
      'runtime://local-storage//legacy-state',
      'runtime://https://example.com/input',
      'runtime://local-storage/legacy_state',
      'runtime://local-storage/legacy\nstate',
    ]) {
      expect(() => makeDiagnostic({
        severity: 'error',
        code: 'STRUCTURE_INVALID',
        sourceFile,
        path: '',
        message: 'Unstable runtime source',
      }), sourceFile).toThrow('diagnostic sourceFile')
    }
  })

  test('applies stable runtime source validation to related references', () => {
    expect(() => makeDiagnostic({
      severity: 'error',
      code: 'STRUCTURE_INVALID',
      sourceFile: 'runtime://parse-definition-bundle',
      path: '',
      message: 'Related source is unstable',
      related: [{
        sourceFile: 'runtime:///Users/private/related.json',
        path: '/input',
      }],
    })).toThrow('diagnostic related references')
  })

  test('deduplicates only exact five-field diagnostic identities', () => {
    const collector = new DiagnosticCollector()
    const exact = {
      code: 'STRUCTURE_INVALID' as const,
      sourceFile: 'packages/core/styles.ts',
      path: '/definitions/0',
      entityId: 'demo-style',
      message: 'Invalid style',
    }
    collector.error(exact)
    collector.error(exact)
    collector.error({ ...exact, message: 'Different message' })
    collector.error({ ...exact, entityId: 'other-style' })

    expect(collector.toArray()).toHaveLength(3)
  })

  test('produces byte-identical diagnostics from reversed invalid input', () => {
    const findings = [
      {
        code: 'STRUCTURE_INVALID' as const,
        sourceFile: 'packages/core/styles.ts',
        path: '/definitions/0',
        entityId: 'beta',
        message: 'Unknown beta option',
      },
      {
        code: 'STRUCTURE_INVALID' as const,
        sourceFile: 'packages/core/styles.ts',
        path: '/definitions/0',
        entityId: 'alpha',
        message: 'Unknown zeta option',
      },
      {
        code: 'STRUCTURE_INVALID' as const,
        sourceFile: 'packages/core/styles.ts',
        path: '/definitions/0',
        entityId: 'alpha',
        message: 'Unknown alpha option',
      },
    ]
    const collect = (values: typeof findings) => {
      const collector = new DiagnosticCollector()
      for (const finding of values) collector.error(finding)
      return JSON.stringify(collector.toArray())
    }

    expect(collect(findings)).toBe(collect([...findings].reverse()))
  })
})
