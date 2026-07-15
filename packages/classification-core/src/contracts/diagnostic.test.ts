import { describe, expect, test } from 'vitest'

import { diagnosticCodes, type DiagnosticCode } from './diagnostic-codes.js'
import {
  compareDiagnostics,
  makeDiagnostic,
  type Diagnostic,
} from './diagnostic.js'

const approvedStyleDiagnosticCodes = [
  'STYLE_DUPLICATE_ID',
  'STYLE_FAMILY_UNKNOWN',
  'STYLE_FAMILY_MISMATCH',
  'STYLE_MODEL_VERSION_MISMATCH',
  'STYLE_DISPLAY_PRIORITY_DUPLICATE',
  'STYLE_INTENSITY_EMPTY',
  'STYLE_INTENSITY_UNKNOWN',
  'STYLE_INTENSITY_DUPLICATE',
  'STYLE_NOODLE_EMPTY',
  'STYLE_NOODLE_UNKNOWN',
  'STYLE_NOODLE_DUPLICATE',
  'STYLE_RULE_DUPLICATE_ID',
  'STYLE_RULE_MISSING',
  'STYLE_RULE_EMPTY',
  'STYLE_RULE_QUESTION_UNKNOWN',
  'STYLE_RULE_OPTION_UNKNOWN',
  'STYLE_RULE_OPTION_WRONG_OWNER',
  'STYLE_RULE_OPTION_DUPLICATE',
  'STYLE_RULE_TIER_OVERLAP',
  'STYLE_ADJUSTMENT_DUPLICATE_ID',
  'STYLE_ADJUSTMENT_PRIORITY_DUPLICATE',
  'STYLE_ADJUSTMENT_CONDITION_EMPTY',
  'STYLE_ADJUSTMENT_CONDITION_PRIORITY_DUPLICATE',
  'STYLE_ADJUSTMENT_CONDITION_DUPLICATE',
  'STYLE_ADJUSTMENT_QUESTION_UNKNOWN',
  'STYLE_ADJUSTMENT_OPTION_UNKNOWN',
  'STYLE_ADJUSTMENT_OPTION_WRONG_OWNER',
  'STYLE_ADJUSTMENT_OPTION_DUPLICATE',
  'STYLE_ADJUSTMENT_VALUE_INVALID',
  'STYLE_EXCLUSION_TAG_UNKNOWN',
  'STYLE_EXCLUSION_TAG_DUPLICATE',
  'STYLE_EXCLUSION_TAG_MISMATCH',
  'STYLE_CORE_ID_COLLISION',
  'STYLE_SUBTYPE_ID_COLLISION',
  'STYLE_PARENT_MISMATCH',
  'STYLE_PRIORITY_DUPLICATE',
  'STYLE_INVENTORY_MISMATCH',
] as const

function acceptsDiagnosticCode(code: DiagnosticCode) {
  return code
}

// @ts-expect-error undeclared diagnostic codes are outside the closed registry
acceptsDiagnosticCode('STYLE_UNDECLARED')

function diagnostic(overrides: Partial<Diagnostic>): Diagnostic {
  return makeDiagnostic({
    severity: 'error',
    code: 'STRUCTURE_INVALID',
    sourceFile: 'packages/classification-core/src/definitions/styles/demo.ts',
    path: '/definitions/0',
    message: 'Invalid style',
    ...overrides,
  })
}

describe('style diagnostics', () => {
  test.each(approvedStyleDiagnosticCodes)('registers %s with a mutation witness', (code) => {
    expect(diagnosticCodes).toContain(code)
    expect(makeDiagnostic({
      severity: 'error',
      code,
      sourceFile: 'packages/classification-core/src/definitions/styles/demo.ts',
      path: '/definitions/0',
      entityId: 'demo-style',
      message: `Witness ${code}`,
    }).code).toBe(code)
  })

  test('sorts by sourceFile, path, code, entityId, then message', () => {
    const input = [
      diagnostic({ entityId: 'beta', message: 'alpha message' }),
      diagnostic({ entityId: 'alpha', message: 'zeta message' }),
      diagnostic({ entityId: 'alpha', message: 'alpha message' }),
      diagnostic({ message: 'missing entity' }),
    ]

    expect([...input].sort(compareDiagnostics).map((item) => [
      item.entityId,
      item.message,
    ])).toEqual([
      [undefined, 'missing entity'],
      ['alpha', 'alpha message'],
      ['alpha', 'zeta message'],
      ['beta', 'alpha message'],
    ])
  })

  test('uses message as the final total-order tie-breaker', () => {
    const left = diagnostic({ entityId: 'demo', message: 'alpha' })
    const right = diagnostic({ entityId: 'demo', message: 'beta' })
    expect(compareDiagnostics(left, right)).toBeLessThan(0)
    expect(compareDiagnostics(right, left)).toBeGreaterThan(0)
  })
})
