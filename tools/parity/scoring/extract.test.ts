import { describe, expect, test, vi } from 'vitest'

import {
  parseScoringExtractArguments,
  runScoringExtractCommand,
} from './extract.js'

describe('scoring extractor CLI', () => {
  test('accepts only an absolute legacy checkout and one publication mode', () => {
    expect(parseScoringExtractArguments([
      '--legacy-checkout', '/tmp/legacy', '--replace',
    ])).toEqual({ legacyCheckout: '/tmp/legacy', replace: true, verifyOnly: false })
    expect(() => parseScoringExtractArguments([
      '--legacy-checkout', 'relative',
    ])).toThrow()
    expect(() => parseScoringExtractArguments([
      '--legacy-checkout', '/tmp/legacy', '--replace', '--verify-only',
    ])).toThrow()
  })

  test('projects bounded command output without temporary paths', async () => {
    const writeStdout = vi.fn()
    await runScoringExtractCommand(
      ['--legacy-checkout', '/tmp/legacy', '--verify-only'],
      {
        run: vi.fn(async () => ({
          status: 'verified',
          published: false,
          cases: [{ id: 'case' }],
          manifest: { casesHash: 'a'.repeat(64), coverage: { cases: 1 } },
          ignoredFingerprintsBefore: [],
          ignoredFingerprintsAfter: [],
        })) as never,
        writeStdout,
        setExitCode: vi.fn(),
      },
    )
    expect(writeStdout).toHaveBeenCalledWith(expect.not.stringContaining('/tmp/'))
  })
})
