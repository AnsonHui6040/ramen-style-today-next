import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

const patch = readFileSync(
  new URL('./legacy-instrumentation.patch', import.meta.url),
  'utf8',
)

function patchTargets(value: string) {
  return Array.from(value.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm), (match) => ({
    before: match[1],
    after: match[2],
  }))
}

describe('legacy persistence instrumentation boundary', () => {
  test('patches only the shared transaction targets', () => {
    expect(patchTargets(patch)).toEqual([
      { before: 'src/App.tsx', after: 'src/App.tsx' },
      {
        before: 'src/parity-question-extractor.test.tsx',
        after: 'src/parity-question-extractor.test.tsx',
      },
    ])
    expect(patch).toContain('-const STORAGE_KEY =')
    expect(patch).toContain('+export const STORAGE_KEY =')
  })

  test('drives public questionnaire actions and reads the actual saved answers', () => {
    expect(patch).toContain("render(<App />)")
    expect(patch).toContain('user.click(')
    expect(patch).toContain("querySelectorAll<HTMLButtonElement>('.choice-card')")
    expect(patch).toContain('window.localStorage.getItem(STORAGE_KEY)')
    expect(patch).toContain('observedAnswers: readSavedAnswers()')
  })

  test('calls the existing restore function with the exact seed input', () => {
    expect(patch).toContain("from './domain/schema'")
    expect(patch).toContain('restoreUserAnswers(seedCase.legacyInput)')
    expect(patch).toContain('observedLegacyOutput: toJsonValue(observedLegacyOutput)')
  })

  test('uses the bounded authoring capability and publishes strict raw cases', () => {
    expect(patch).toContain('process.env.RAMEN_PARITY_SEED')
    expect(patch).toContain("schemaVersion: 1")
    expect(patch).toContain('capability.seedPath')
    expect(patch).toContain('capability.rawOutputPath')
    expect(patch).toContain("flag: 'wx'")
    expect(patch).toContain('assertObservationCase(observation)')
    expect(patch).not.toContain('seedIndex')
  })

  test('accepts the shared authoring transaction token contract', () => {
    expect(patch).toContain('/^[a-f0-9]{32,128}$/')
    expect(patch).not.toContain('/^[a-f0-9]{64}$/')
  })

  test.each([
    'normalizedPayload',
    'canonicalAnswers',
    'migrations',
    'repairs',
    'diagnostics',
    'flowState',
    'resumeQuestionId',
    'writeBackRequired',
    'evaluateFlow',
    'questionModel',
    'decodeAnswerDraft',
    'RestoreResult',
  ])('does not add current-runtime field or logic %s', (forbidden) => {
    expect(patch).not.toContain(forbidden)
  })

  test('does not embed local paths, source identities, or extraction results', () => {
    expect(patch).not.toContain('/Users/')
    expect(patch).not.toContain('eebf00b7ddfbbe6f01ff598e57f1e17197068a37')
    expect(patch).not.toContain('3e527de876cfeccfd3154ddc492830d71c4cfd9a')
    expect(patch).not.toContain('casesHash')
    expect(patch).not.toContain('manifest')
  })
})
