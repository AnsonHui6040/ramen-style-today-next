import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  main,
  styleFixtureAuthoringSourcePaths,
  verifyCommittedStyleFixtures,
  verifyStyleFixtureSet,
  type StyleFixtureVerificationInput,
} from './verify-fixtures.js'

type JsonObject = Record<string, unknown>
type Mutation = (value: JsonObject) => void

const toolRoot = resolve(import.meta.dirname, '../../..')
const fixtureRoot = resolve(toolRoot, 'tools/parity/fixtures/styles/legacy-v1')

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('expected test object')
  }
  return value as JsonObject
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('expected test array')
  return value
}

function jsonBytes(value: unknown) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function readCommittedInput(): StyleFixtureVerificationInput {
  return {
    casesBytes: readFileSync(resolve(fixtureRoot, 'cases.json')),
    manifestBytes: readFileSync(resolve(fixtureRoot, 'manifest.json')),
    instrumentationBytes: readFileSync(resolve(
      toolRoot,
      'tools/parity/styles/legacy-instrumentation.patch',
    )),
    seedBytes: readFileSync(resolve(toolRoot, 'tools/parity/styles/seeds.json')),
    authoringSources: styleFixtureAuthoringSourcePaths.map((path) => ({
      path,
      bytes: readFileSync(resolve(toolRoot, path)),
    })),
  }
}

function mutateManifest(
  input: StyleFixtureVerificationInput,
  mutation: Mutation,
): StyleFixtureVerificationInput {
  const manifest = object(JSON.parse(Buffer.from(input.manifestBytes).toString('utf8')))
  mutation(manifest)
  return { ...input, manifestBytes: jsonBytes(manifest) }
}

function mutateCases(
  input: StyleFixtureVerificationInput,
  mutation: Mutation,
): StyleFixtureVerificationInput {
  const cases = object(JSON.parse(Buffer.from(input.casesBytes).toString('utf8')))
  mutation(cases)
  return { ...input, casesBytes: jsonBytes(cases) }
}

function observation(cases: JsonObject) {
  return object(array(cases.cases)[0])
}

function messageFrom(action: () => unknown) {
  try {
    action()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('expected verification failure')
}

describe('offline style fixture verification', () => {
  test('validates committed evidence without a checkout input', () => {
    const result = verifyCommittedStyleFixtures()
    expect(result).toMatchObject({
      status: 'pass',
      caseCount: 1,
      coverage: {
        styles: 18,
        cores: 54,
        subtypes: 270,
        rules: 378,
        bonusCopies: 54,
        conflictCopies: 21,
        exclusionTags: 6,
        copyRoles: 8,
      },
    })
    expect(Object.isFrozen(result)).toBe(true)
  })

  test('accepts no CLI arguments and emits the committed result', () => {
    expect(main([])).toEqual(verifyCommittedStyleFixtures())
  })

  test.each([
    ['checkout flag', ['--legacy-checkout', '/tmp/legacy']],
    ['fixture target', ['--target', '/tmp/fixtures']],
    ['network override', ['--network']],
    ['positional path', ['/tmp/legacy']],
  ])('rejects %s CLI input', (_label, arguments_) => {
    expect(() => main(arguments_)).toThrow('Usage: verify-fixtures.ts')
  })

  const absenceAndFormatMutations: readonly (readonly [
    string,
    (input: StyleFixtureVerificationInput) => StyleFixtureVerificationInput,
  ])[] = [
    ['missing cases', (input: StyleFixtureVerificationInput) => ({
      ...input,
      casesBytes: undefined as unknown as Uint8Array,
    })],
    ['missing manifest', (input: StyleFixtureVerificationInput) => ({
      ...input,
      manifestBytes: undefined as unknown as Uint8Array,
    })],
    ['missing instrumentation', (input: StyleFixtureVerificationInput) => ({
      ...input,
      instrumentationBytes: undefined as unknown as Uint8Array,
    })],
    ['missing seeds', (input: StyleFixtureVerificationInput) => ({
      ...input,
      seedBytes: undefined as unknown as Uint8Array,
    })],
    ['malformed cases', (input: StyleFixtureVerificationInput) => ({
      ...input,
      casesBytes: Buffer.from('{'),
    })],
    ['malformed manifest', (input: StyleFixtureVerificationInput) => ({
      ...input,
      manifestBytes: Buffer.from('{'),
    })],
    ['wrong cases root', (input: StyleFixtureVerificationInput) => ({
      ...input,
      casesBytes: jsonBytes([]),
    })],
    ['wrong manifest root', (input: StyleFixtureVerificationInput) => ({
      ...input,
      manifestBytes: jsonBytes([]),
    })],
  ]

  test.each(absenceAndFormatMutations)('rejects %s', (_label, mutation) => {
    expect(() => verifyStyleFixtureSet(mutation(readCommittedInput()))).toThrow()
  })

  const canonicalByteDriftMutations: readonly (readonly [
    string,
    (input: StyleFixtureVerificationInput) => StyleFixtureVerificationInput,
  ])[] = [
    ['cases whitespace', (input: StyleFixtureVerificationInput) => ({
      ...input,
      casesBytes: Buffer.concat([input.casesBytes, Buffer.from('\n')]),
    })],
    ['manifest whitespace', (input: StyleFixtureVerificationInput) => ({
      ...input,
      manifestBytes: Buffer.concat([input.manifestBytes, Buffer.from('\n')]),
    })],
    ['cases object insertion order', (input: StyleFixtureVerificationInput) => {
      const parsed = object(JSON.parse(Buffer.from(input.casesBytes).toString('utf8')))
      return { ...input, casesBytes: jsonBytes(Object.fromEntries(Object.entries(parsed).reverse())) }
    }],
    ['manifest object insertion order', (input: StyleFixtureVerificationInput) => {
      const parsed = object(JSON.parse(Buffer.from(input.manifestBytes).toString('utf8')))
      return {
        ...input,
        manifestBytes: jsonBytes(Object.fromEntries(Object.entries(parsed).reverse())),
      }
    }],
    ...(['styles', 'cores', 'subtypes', 'rules', 'adjustments', 'exclusionTags', 'copyRoles']
      .map((field) => [
        `reversed ${field}`,
        (input: StyleFixtureVerificationInput) => mutateCases(input, (root) => {
          array(observation(root)[field]).reverse()
        }),
      ] as const)),
  ]

  test.each(canonicalByteDriftMutations)('rejects canonical byte drift: %s', (_label, mutation) => {
    expect(() => verifyStyleFixtureSet(mutation(readCommittedInput()))).toThrow()
  })

  const manifestMutations: readonly (readonly [string, Mutation])[] = [
    ['repository host', (root) => { object(object(root.source).repository).host = 'example.com' }],
    ['repository owner', (root) => { object(object(root.source).repository).owner = 'other' }],
    ['repository name', (root) => { object(object(root.source).repository).repository = 'other' }],
    ['legacy commit', (root) => { object(root.source).commit = '0'.repeat(40) }],
    ['legacy tree', (root) => { object(root.source).treeHash = '0'.repeat(40) }],
    ['lockfile path', (root) => { object(root.source).lockfilePath = 'other-lock.json' }],
    ['lockfile hash', (root) => { object(root.source).lockfileHash = '0'.repeat(64) }],
    ['tracked source missing', (root) => {
      const hashes = object(object(root.source).trackedSourceHashes)
      delete hashes[Object.keys(hashes)[0]!]
    }],
    ['tracked source extra', (root) => {
      object(object(root.source).trackedSourceHashes)['extra.ts'] = '0'.repeat(64)
    }],
    ['tracked source hash', (root) => {
      const hashes = object(object(root.source).trackedSourceHashes)
      hashes[Object.keys(hashes)[0]!] = '0'.repeat(64)
    }],
    ['instrumentation version', (root) => { object(root.instrumentation).version = 2 }],
    ['instrumentation hash', (root) => {
      object(root.instrumentation).hash = '0'.repeat(64)
    }],
    ['seed schema', (root) => { object(root.seeds).schemaVersion = 2 }],
    ['seed hash', (root) => { object(root.seeds).hash = '0'.repeat(64) }],
    ['extractor version', (root) => { object(root.extractor).version = 2 }],
    ['extractor aggregate', (root) => { object(root.extractor).hash = '0'.repeat(64) }],
    ['runtime Node', (root) => { object(root.runtime).nodeVersion = '24.99.0' }],
    ['runtime npm claim', (root) => { object(root.runtime).npmVersion = '11.13.0' }],
    ['runtime timezone', (root) => { object(root.runtime).timezone = 'Asia/Hong_Kong' }],
    ['runtime locale', (root) => { object(root.runtime).locale = 'en_US.UTF-8' }],
    ['dependency policy', (root) => { object(root.runtime).dependencies = 'npm-ci' }],
    ['installed lock', (root) => {
      object(root.runtime).installedLockfileHash = '0'.repeat(64)
    }],
    ['dependency tree', (root) => { object(root.runtime).dependencyTreeHash = '0'.repeat(64) }],
    ['sandbox policy', (root) => { object(root.runtime).network = 'allowed' }],
    ['full-suite ordering', (root) => { object(root.runtime).fullSuiteBeforeExtraction = false }],
    ['case count', (root) => { root.caseCount = 2 }],
    ['cases hash', (root) => { root.casesHash = '0'.repeat(64) }],
    ['fixture-content hash', (root) => { root.fixtureContentHash = '0'.repeat(64) }],
    ['ordered styles', (root) => { array(root.orderedStyleIds).reverse() }],
    ['ordered cores', (root) => { array(root.orderedCoreIds).reverse() }],
    ['ordered subtypes', (root) => { array(root.orderedSubtypeIds).reverse() }],
    ['ordered rules', (root) => { array(root.orderedRuleIds).reverse() }],
    ['ordered adjustments', (root) => { array(root.orderedAdjustmentCopyIds).reverse() }],
    ['ordered tags', (root) => { array(root.orderedExclusionTagIds).reverse() }],
    ['ordered copy roles', (root) => { array(root.orderedCopyRoles).reverse() }],
    ...(['styles', 'cores', 'subtypes', 'rules', 'bonusCopies', 'conflictCopies',
      'exclusionTags', 'copyRoles'].map((field) => [
        `coverage ${field}`,
        (root: JsonObject) => {
          const coverage = object(root.coverage)
          coverage[field] = Number(coverage[field]) + 1
        },
      ] as const)),
  ]

  test.each(manifestMutations)('rejects manifest identity drift: %s', (_label, mutation) => {
    const input = mutateManifest(readCommittedInput(), mutation)
    expect(() => verifyStyleFixtureSet(input)).toThrow()
  })

  test('rejects patch and seed byte drift', () => {
    const input = readCommittedInput()
    expect(() => verifyStyleFixtureSet({
      ...input,
      instrumentationBytes: Buffer.concat([input.instrumentationBytes, Buffer.from('\n')]),
    })).toThrow()
    expect(() => verifyStyleFixtureSet({
      ...input,
      seedBytes: Buffer.concat([input.seedBytes, Buffer.from('\n')]),
    })).toThrow()
  })

  test.each(styleFixtureAuthoringSourcePaths)('rejects %s byte drift', (path) => {
    const input = readCommittedInput()
    expect(() => verifyStyleFixtureSet({
      ...input,
      authoringSources: input.authoringSources.map((source) => source.path === path
        ? { ...source, bytes: Buffer.concat([source.bytes, Buffer.from('\n')]) }
        : source),
    })).toThrow()
  })

  const authoringSourceSetMutations: readonly (readonly [
    string,
    (
      sources: StyleFixtureVerificationInput['authoringSources'],
    ) => StyleFixtureVerificationInput['authoringSources'],
  ])[] = [
    ['missing source', (sources: StyleFixtureVerificationInput['authoringSources']) => (
      sources.slice(1)
    )],
    ['extra source', (sources: StyleFixtureVerificationInput['authoringSources']) => ([
      ...sources,
      { path: 'extra.ts', bytes: Buffer.from('extra') },
    ] as unknown as StyleFixtureVerificationInput['authoringSources'])],
    ['reordered sources', (sources: StyleFixtureVerificationInput['authoringSources']) => (
      [...sources].reverse()
    )],
  ]

  test.each(authoringSourceSetMutations)('rejects authoring source set drift: %s', (_label, mutation) => {
    const input = readCommittedInput()
    expect(() => verifyStyleFixtureSet({
      ...input,
      authoringSources: mutation(input.authoringSources),
    })).toThrow()
  })

  const caseMutations: readonly (readonly [string, Mutation])[] = [
    ...(['styles', 'cores', 'subtypes', 'rules', 'exclusionTags', 'copyRoles'].map((field) => [
      `missing ${field}`,
      (root: JsonObject) => { array(observation(root)[field]).pop() },
    ] as const)),
    ...(['styles', 'cores', 'subtypes', 'rules', 'exclusionTags', 'copyRoles'].map((field) => [
      `duplicate ${field}`,
      (root: JsonObject) => {
        const values = array(observation(root)[field])
        values.push(structuredClone(values[0]))
      },
    ] as const)),
    ['missing bonus copy', (root) => {
      const values = array(observation(root).adjustments)
      values.splice(values.findIndex((value) => object(value).kind === 'bonus'), 1)
    }],
    ['missing conflict copy', (root) => {
      const values = array(observation(root).adjustments)
      values.splice(values.findIndex((value) => object(value).kind === 'conflict'), 1)
    }],
    ['duplicate adjustment copy', (root) => {
      const values = array(observation(root).adjustments)
      values.push(structuredClone(values[0]))
    }],
    ['broken core parent', (root) => {
      object(array(observation(root).cores)[0]).parentStyleId = 'missing-style'
    }],
    ['broken subtype parent', (root) => {
      object(array(observation(root).subtypes)[0]).parentCoreId = 'missing:core'
    }],
    ['broken rule parent', (root) => {
      object(array(observation(root).rules)[0]).parentCoreId = 'missing:core'
    }],
    ['broken adjustment parent', (root) => {
      object(array(observation(root).adjustments)[0]).parentCoreId = 'missing:core'
    }],
    ['missing rule tier', (root) => {
      array(object(array(observation(root).rules)[0]).tiers).pop()
    }],
    ['missing rule target', (root) => {
      for (const rule of array(observation(root).rules)) {
        for (const tier of array(object(rule).tiers)) {
          const targets = array(object(tier).targets)
          if (targets.length > 0) {
            targets.pop()
            return
          }
        }
      }
      throw new Error('expected target')
    }],
    ['missing adjustment condition', (root) => {
      const adjustment = object(array(observation(root).adjustments)[0])
      const conditions = adjustment.kind === 'bonus'
        ? array(adjustment.conditions)
        : array(adjustment.whenAll)
      conditions.pop()
    }],
    ['missing adjustment option', (root) => {
      for (const value of array(observation(root).adjustments)) {
        const adjustment = object(value)
        const conditions = adjustment.kind === 'bonus'
          ? array(adjustment.conditions)
          : array(adjustment.whenAll)
        for (const condition of conditions) {
          const options = array(object(condition).optionIds)
          if (options.length > 1) {
            options.pop()
            return
          }
        }
      }
      throw new Error('expected multi-option condition')
    }],
  ]

  test.each(caseMutations)('rejects corpus coverage drift: %s', (_label, mutation) => {
    expect(() => verifyStyleFixtureSet(mutateCases(readCommittedInput(), mutation))).toThrow()
  })

  const forbiddenContentMutations: readonly (readonly [string, Mutation])[] = [
    ['timestamp', (root: JsonObject) => { observation(root).timestamp = '2026-07-16T00:00:00Z' }],
    ['savedAt', (root: JsonObject) => { observation(root).savedAt = '2026-07-16T00:00:00Z' }],
    ['semantic hash', (root: JsonObject) => { observation(root).semanticHash = '0'.repeat(64) }],
    ['dataVersion', (root: JsonObject) => { observation(root).dataVersion = '0'.repeat(64) }],
    ['scoring result', (root: JsonObject) => { observation(root).score = 1 }],
    ['ranking', (root: JsonObject) => { observation(root).ranking = [] }],
    ['recommendation', (root: JsonObject) => { observation(root).recommendation = 'demo' }],
    ['eligibility', (root: JsonObject) => { observation(root).eligibility = true }],
    ['confidence', (root: JsonObject) => { observation(root).confidence = 1 }],
    ...([
      '/var/folders/legacy',
      'C:\\Users\\legacy',
      '\\\\server\\share\\legacy',
      'file:///Users/legacy',
    ].map((path) => [
      `machine path ${path}`,
      (root: JsonObject) => {
        const style = object(array(observation(root).styles)[0])
        object(array(style.copySources)[0]).value = path
      },
    ] as const)),
  ]

  test.each(forbiddenContentMutations)('rejects forbidden fixture content: %s', (_label, mutation) => {
    expect(() => verifyStyleFixtureSet(mutateCases(readCommittedInput(), mutation))).toThrow()
  })

  test('has a closed offline read-only implementation boundary', () => {
    const source = readFileSync(
      resolve(toolRoot, 'tools/parity/styles/verify-fixtures.ts'),
      'utf8',
    )
    for (const forbidden of [
      "from './extractor.js'",
      "from './extract.js'",
      'node:child_process',
      'fetch(',
      'http:',
      'https:',
      'writeFile',
      'mkdir',
      'rename',
      'rmSync',
      'localStorage',
      'generated/style-model',
    ]) expect(source).not.toContain(forbidden)
  })

  test('does not modify any committed input mtime', () => {
    const paths = [
      resolve(fixtureRoot, 'cases.json'),
      resolve(fixtureRoot, 'manifest.json'),
      resolve(toolRoot, 'tools/parity/styles/legacy-instrumentation.patch'),
      resolve(toolRoot, 'tools/parity/styles/seeds.json'),
      ...styleFixtureAuthoringSourcePaths.map((path) => resolve(toolRoot, path)),
    ]
    const before = paths.map((path) => statSync(path).mtimeMs)
    verifyCommittedStyleFixtures()
    expect(paths.map((path) => statSync(path).mtimeMs)).toEqual(before)
  })

  test('returns byte-identical deterministic evidence repeatedly', () => {
    expect(verifyCommittedStyleFixtures()).toEqual(verifyCommittedStyleFixtures())
  })

  test('emits deterministic bounded errors without stack or machine paths', () => {
    const input = readCommittedInput()
    const broken = mutateCases(input, (root) => {
      observation(root).timestamp = '/Users/private/2026-07-16T00:00:00Z'
      array(observation(root).styles).reverse()
    })
    const first = messageFrom(() => verifyStyleFixtureSet(broken))
    const second = messageFrom(() => verifyStyleFixtureSet(broken))
    expect(second).toBe(first)
    expect(first.length).toBeLessThanOrEqual(300)
    expect(first).not.toContain('/Users/')
    expect(first).not.toContain('at verify')
    expect(first).not.toContain('\n')
  })
})
