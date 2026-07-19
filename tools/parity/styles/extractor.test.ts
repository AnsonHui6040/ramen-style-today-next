import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test, vi } from 'vitest'

import {
  computeLegacyStyleTrackedSourceHashesHash,
  legacyStyleTrackedSourceCount,
  legacyStyleTrackedSourceHashesHash,
} from './contracts.js'
import {
  createStyleExtractorEnvironment,
  legacyStyleSourceIdentity,
  styleDependencyTreeHash,
  styleExtractionNodeVersion,
  styleExtractorAuthoringSourcePaths,
  styleInstalledLockfileHash,
  styleInstrumentationHash,
  styleInstrumentationDescriptor,
  styleExpectedLineage,
  styleLegacyLockfileHash,
  styleSeedsHash,
  styleTrackedSourceHashes,
} from './extractor.js'
import {
  parseExtractArguments,
  runExtractCommand,
  type ExtractCommandDependencies,
} from './extract.js'

const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex')

describe('style extractor identity and instrumentation', () => {
  test('binds the exact frozen legacy repository identity', () => {
    expect(legacyStyleSourceIdentity).toEqual({
      repository: {
        host: 'github.com',
        owner: 'AnsonHui6040',
        repository: 'ramen-style-today',
      },
      commit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
      treeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
    })
  })

  test('binds the complete reviewed tracked style source set', () => {
    expect(Object.keys(styleTrackedSourceHashes)).toHaveLength(legacyStyleTrackedSourceCount)
    expect(computeLegacyStyleTrackedSourceHashesHash(styleTrackedSourceHashes))
      .toBe(legacyStyleTrackedSourceHashesHash)
    expect(styleTrackedSourceHashes).toMatchObject({
      'index.html': '6a12466cb2cdf498e30c91572e166b30dd0a8926bec2c32e1bf4e7d3dbd5c1b0',
      'package.json': '6bb13faa4bc9abb2cd603c75e4d1d83e36c2b738e5a348f3c8cc7322656b81ab',
      'src/App.tsx': 'fcc56466e6f1cdf970295857efe1aafa0be9a980cc70fb043c7e36b6bdddc244',
      'src/config/questions.ts': '4ee41855fa849d650e0d970cc3e39114ff5f73c648833613e700846bff764906',
      'src/config/styles.ts': '9e8dee82efc4a1dd29cec3e1534f050135812d4031ac2e7c36dda0063860853f',
      'src/data/questions.json': '0136f6f71fdc0f09da8da045aa97303069631882ef2a240dd1a9fbc48a8992f2',
      'src/data/styles.json': '207293e50bae4c9459d5506b445f50a798a58439ba52c54e710b3d10ff7d09d3',
      'src/domain/questionRules.ts': '465a0575ef45ee93cf1843acc1e102802ff28d3203a32bc33f8ab49411742385',
      'src/domain/ramenMap.ts': 'e08fc40347fee40a123de53de33a1ea1709092ba4353411f3548cc213c7b4c10',
      'src/domain/schema.ts': '7c0abe9767fd57d7bbde3209cd4241eafbe0f5c63415947e1efea6ac718cc0a9',
      'src/domain/types.ts': 'b91a35b5db4f8e27204616236f050897d4e9e205f583644084f439a3cb3d343e',
      'src/lib/scoring/explainer.ts': 'ee2f58df6b145184c3107a83c8679348d8f868846c2ba2669b38d189c41b6de1',
      'src/lib/scoring/scorer.ts': 'befc80c7d648712968a2fee74eab8825feb1d583f4e3bbd35478684c27846cfe',
      'src/test/setup.ts': '24bfe9f743e71f5992b8b0b85e757e6a0937c6f3cbd5966691c03b450b2b5c39',
      'tsconfig.app.json': 'ee487b7e4e869055507d4eff0383f14515e07e3f0e433213b2f1e6e04f0de907',
      'tsconfig.json': '770b4140bbb581e2dfd9ea9946ffc9c75a1d86ba7d2db5f77c83e37cbdf9d808',
      'tsconfig.node.json': '90a22c920cbc14624fb4658b58f15c875abf3234224f3933f211849c3ada3242',
      'vite.config.ts': '0ebe1b813bdeb70dcfea7673d502bb30fb2928936d3bca5d2dcae9c2b8a23065',
    })
  })

  test('fixes the adapter lineage even when an untyped caller attempts injection', () => {
    const environment = createStyleExtractorEnvironment({
      legacyRoot: '/tmp/legacy',
      toolRoot: process.cwd(),
      destination: '/tmp/destination',
      patchPath: '/tmp/instrumentation.patch',
      seedsPath: '/tmp/seeds.json',
      expected: {
        identity: { host: 'evil.example', owner: 'evil', repository: 'evil' },
        commit: '0'.repeat(40),
        treeHash: '0'.repeat(40),
        trackedSourceHashes: {},
        lockfilePath: 'other-lock.json',
        lockfileHash: '0'.repeat(64),
        patchHash: '0'.repeat(64),
        seedsHash: '0'.repeat(64),
        nodeVersion: '99.0.0',
      },
    } as unknown as Parameters<typeof createStyleExtractorEnvironment>[0])
    expect(environment.expected).toBe(styleExpectedLineage)
    expect(environment.expected).toEqual(styleExpectedLineage)
  })

  test('binds exact lock, runtime, installed-lock, and dependency-tree identities', () => {
    expect(styleLegacyLockfileHash)
      .toBe('be7ff42d1012d310916d38c082f63f8b5263981c6bd2ded2ff0f6dabe7fc29d2')
    expect(styleExtractionNodeVersion).toBe('24.14.0')
    expect(styleInstalledLockfileHash)
      .toBe('b2cfca89d746d1605cc9d14de89b896866b73581ce83f212669b28e1c447cd6e')
    expect(styleDependencyTreeHash)
      .toBe('edbb010c241e278706dc2c0ee44b4f25f03c7423303f19eb23bbeb0f26203826')
  })

  test('declares one added observation target and exact extraction test', () => {
    expect(styleInstrumentationDescriptor).toEqual({
      targets: [{ path: 'src/parity-style-observer.test.ts', status: '??' }],
      extractionTestPath: 'src/parity-style-observer.test.ts',
      dependencyProvisioning: {
        kind: 'copy-validated',
        sourcePath: 'node_modules',
        installedLockfilePath: 'node_modules/.package-lock.json',
        installedLockfileHash: styleInstalledLockfileHash,
        dependencyTreeHash: styleDependencyTreeHash,
      },
    })
    expect(styleInstrumentationDescriptor.dependencyProvisioning)
      .not.toHaveProperty('npmVersion')
  })

  test('freezes the style descriptor against adapter-side mutation', () => {
    expect(Object.isFrozen(styleInstrumentationDescriptor)).toBe(true)
    expect(Object.isFrozen(styleInstrumentationDescriptor.targets)).toBe(true)
    expect(Object.isFrozen(styleInstrumentationDescriptor.dependencyProvisioning)).toBe(true)
    expect(() => (styleInstrumentationDescriptor.targets as Array<unknown>).push({}))
      .toThrow()
  })

  test('uses only the five reviewed authoring source files', () => {
    expect(styleExtractorAuthoringSourcePaths).toEqual([
      'tools/parity/shared/contracts.ts',
      'tools/parity/shared/authoring.ts',
      'tools/parity/styles/contracts.ts',
      'tools/parity/styles/extractor.ts',
      'tools/parity/styles/extract.ts',
    ])
  })

  test('patch adds only the declared observer without modifying legacy behavior files', () => {
    const patch = readFileSync(
      resolve(process.cwd(), 'tools/parity/styles/legacy-instrumentation.patch'),
      'utf8',
    )
    expect(patch.match(/^diff --git /gm)).toHaveLength(1)
    expect(patch).toContain('diff --git a/src/parity-style-observer.test.ts b/src/parity-style-observer.test.ts')
    expect(patch).not.toContain('a/src/App.tsx')
    expect(patch).not.toContain('a/src/lib/scoring')
    expect(patch).not.toContain('scoreQuestionnaire(')
  })

  test('seeds and patch hashes bind tracked authoring inputs', () => {
    const patch = readFileSync(
      resolve(process.cwd(), 'tools/parity/styles/legacy-instrumentation.patch'),
    )
    const seeds = readFileSync(resolve(process.cwd(), 'tools/parity/styles/seeds.json'))
    expect(sha256(patch)).toBe(styleInstrumentationHash)
    expect(sha256(seeds)).toBe(styleSeedsHash)
  })

  test('keeps packages independent of style observation tooling', () => {
    const source = [
      readFileSync(resolve(process.cwd(), 'packages/classification-core/src/compiler/styles/compile.ts'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'packages/classification-core/src/compiler/styles/proof.ts'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'packages/classification-core/src/definitions/styles/index.ts'), 'utf8'),
    ].join('\n')
    expect(source).not.toContain('tools/parity/styles')
    expect(source).not.toContain('LegacyStyleObservation')
  })

  test('retains the reviewed style tooling plus the complete Task 15 pair', () => {
    const reviewedFiles = [
      'contracts.test.ts',
      'contracts.ts',
      'extract.ts',
      'extractor.test.ts',
      'extractor.ts',
      'legacy-instrumentation.patch',
      'seeds.json',
      'verify-fixtures.test.ts',
      'verify-fixtures.ts',
    ]
    const task15Files = ['parity.test.ts', 'parity.ts']
    const receivedFiles = readdirSync(
      resolve(process.cwd(), 'tools/parity/styles'),
    ).sort()
    const task15Present = task15Files.some((file) => receivedFiles.includes(file))
    expect(receivedFiles).toEqual([
      ...reviewedFiles,
      ...(task15Present ? task15Files : []),
    ].sort())
    const fixtureRoot = resolve(
      process.cwd(),
      'tools/parity/fixtures/styles/legacy-v1',
    )
    expect(existsSync(fixtureRoot)).toBe(true)
    expect(readdirSync(fixtureRoot).sort()).toEqual([
      'cases.json',
      'manifest.json',
    ])
  })
})

describe('style extractor CLI', () => {
  test('parses create, replace, and verify-only modes', () => {
    const checkout = '/tmp/legacy'
    expect(parseExtractArguments(['--legacy-checkout', checkout])).toEqual({
      legacyCheckout: checkout,
      replace: false,
      verifyOnly: false,
    })
    expect(parseExtractArguments(['--legacy-checkout', checkout, '--replace']))
      .toEqual({ legacyCheckout: checkout, replace: true, verifyOnly: false })
    expect(parseExtractArguments(['--verify-only', '--legacy-checkout', checkout]))
      .toEqual({ legacyCheckout: checkout, replace: false, verifyOnly: true })
  })

  test.each([
    [],
    ['--legacy-checkout'],
    ['--legacy-checkout', 'relative/path'],
    ['--legacy-checkout', '/tmp/legacy', '--unknown'],
    ['--legacy-checkout', '/tmp/legacy', '--legacy-checkout', '/tmp/other'],
    ['--legacy-checkout', '/tmp/legacy', '--replace', '--replace'],
    ['--legacy-checkout', '/tmp/legacy', '--verify-only', '--verify-only'],
    ['--legacy-checkout', '/tmp/legacy', '--replace', '--verify-only'],
    ['--legacy-checkout', '/tmp/legacy', 'extra'],
    ['--legacy-checkout', '/tmp/legacy', '--target', '/tmp/output'],
    ['--legacy-checkout', '/tmp/legacy', '--skip-tests'],
    ['--legacy-checkout', '/tmp/legacy', '--force-identity'],
    ['--legacy-checkout', '/tmp/legacy', '--network-override'],
    ['--legacy-checkout', '/tmp/legacy', '--timeout', '1'],
    ['--legacy-checkout', '/tmp/legacy', '--node', '/tmp/node'],
    ['--legacy-checkout', '/tmp/legacy', '--npm', '/tmp/npm'],
  ].map((arguments_) => [arguments_]))('rejects invalid argv %j', (arguments_) => {
    expect(() => parseExtractArguments(arguments_)).toThrow(
      'extract.ts --legacy-checkout <absolute-path> [--replace|--verify-only]',
    )
  })

  test('projects a bounded successful command result without temporary paths', async () => {
    const writeStdout = vi.fn()
    const setExitCode = vi.fn()
    const run = vi.fn(async () => ({
      status: 'verified' as const,
      published: false as const,
      cases: [{ id: 'legacy-style-catalog' }],
      manifest: { casesHash: 'a'.repeat(64), coverage: { styles: 18 } },
      ignoredFingerprintsBefore: [],
      ignoredFingerprintsAfter: [],
    }))
    const dependencies = { run, writeStdout, setExitCode } as unknown as ExtractCommandDependencies

    await runExtractCommand(
      ['--legacy-checkout', '/tmp/legacy', '--verify-only'],
      dependencies,
    )

    expect(run).toHaveBeenCalledOnce()
    expect(writeStdout).toHaveBeenCalledOnce()
    expect(writeStdout.mock.calls[0]?.[0]).not.toContain('/tmp/')
    expect(writeStdout.mock.calls[0]?.[0]).not.toContain('stack')
    expect(setExitCode).not.toHaveBeenCalled()
  })

  test('sets exit code one for the shared bounded failure union', async () => {
    const writeStdout = vi.fn()
    const setExitCode = vi.fn()
    const dependencies = {
      run: vi.fn(async () => ({
        status: 'failed' as const,
        published: false as const,
        error: { code: 'publication-failed' as const, message: 'style authoring failed' },
      })),
      writeStdout,
      setExitCode,
    } as unknown as ExtractCommandDependencies

    await runExtractCommand(['--legacy-checkout', '/tmp/legacy'], dependencies)

    expect(setExitCode).toHaveBeenCalledWith(1)
    expect(writeStdout.mock.calls[0]?.[0]).not.toContain('stack')
  })
})
