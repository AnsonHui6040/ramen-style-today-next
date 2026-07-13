import { describe, expect, test } from 'vitest'

import {
  formatMismatchDiagnostic,
  hasObservableBranchChange,
  validateFixtureCoverage,
} from './parity.js'
import {
  casesWithOrphanTag,
  expectedCase,
  requiredCoverage,
} from './test-fixtures.js'

describe('observable fixture coverage', () => {
  test('rejects fabricated and orphan coverage tags', () => {
    const result = validateFixtureCoverage(casesWithOrphanTag, requiredCoverage)
    expect(result.diagnostics.map(({ code }) => code)).toContain('PARITY_COVERAGE_INVALID')
  })

  test('accepts either branch-change observation and rejects neither', () => {
    expect(hasObservableBranchChange(['behavior:branch-visible-change'])).toBe(true)
    expect(hasObservableBranchChange(['behavior:branch-answer-change'])).toBe(true)
    expect(hasObservableBranchChange([
      'behavior:branch-visible-change',
      'behavior:branch-answer-change',
    ])).toBe(true)
    expect(hasObservableBranchChange(['transition:toggle'])).toBe(false)
  })

  test('keeps every bounded replay field in mismatch diagnostics', () => {
    const report = formatMismatchDiagnostic({
      caseId: expectedCase.id,
      pointer: '/frames/1/visibleOptionIds/0',
      expectedValue: '"soup"',
      receivedValue: '"dry"',
      replayCommand: `npm run parity:questions -- --case ${expectedCase.id}`,
    }, expectedCase, 'a'.repeat(64), 'b'.repeat(64), '/tmp/parity-artifact.json')
    for (const value of [
      'case=form-select',
      'pointer=/frames/1/visibleOptionIds/0',
      'expected="soup"',
      'received="dry"',
      `semanticHash=${'a'.repeat(64)}`,
      `fixtureHash=${'b'.repeat(64)}`,
      `npm run parity:questions -- --case ${expectedCase.id}`,
      'actions=0:select:form:soup',
      'artifact=/tmp/parity-artifact.json',
    ]) expect(report).toContain(value)
    expect(report.length).toBeLessThanOrEqual(4096)
  })
})
