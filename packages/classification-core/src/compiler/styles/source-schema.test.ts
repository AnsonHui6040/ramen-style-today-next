import { describe, expect, test } from 'vitest'

import {
  parseStyleDefinitionBundle,
  styleDefinitionBundleSchema,
} from './source-schema.js'
import {
  styleBundleFallbackSource,
  styleDefinitionBundleFixture,
} from './test-fixtures.js'

type StyleBundleFixture = ReturnType<typeof styleDefinitionBundleFixture>

function expectRejected(mutator: (input: StyleBundleFixture) => void) {
  const input = structuredClone(styleDefinitionBundleFixture())
  mutator(input)
  expect(styleDefinitionBundleSchema.safeParse(input).success).toBe(false)
}

describe('style definition source schema', () => {
  test('accepts the closed canonical source shape', () => {
    expect(styleDefinitionBundleSchema.safeParse(styleDefinitionBundleFixture()).success)
      .toBe(true)
  })

  test('rejects missing and unknown root fields', () => {
    const missing: Partial<StyleBundleFixture> = styleDefinitionBundleFixture()
    delete missing.modelVersion
    expect(styleDefinitionBundleSchema.safeParse(missing).success).toBe(false)
    expectRejected((input) => {
      Object.assign(input, { unexpected: true })
    })
  })

  test('rejects unknown nested fields and non-array collections', () => {
    expectRejected((input) => {
      Object.assign(input.taxonomy.families[0]!, { unexpected: true })
    })
    expect(styleDefinitionBundleSchema.safeParse({
      ...styleDefinitionBundleFixture(),
      definitions: {},
    }).success).toBe(false)
  })

  test.each([
    ['family', (input: StyleBundleFixture) => { input.definitions[0]!.family = 'broth' }],
    ['intensity', (input: StyleBundleFixture) => {
      input.definitions[0]!.supportedIntensityIds[0] = 'extreme'
    }],
    ['noodle', (input: StyleBundleFixture) => {
      input.definitions[0]!.supportedNoodleIds[0] = 'flat'
    }],
    ['tag', (input: StyleBundleFixture) => {
      input.definitions[0]!.exclusionTags[0] = 'beef'
    }],
    ['tier', (input: StyleBundleFixture) => {
      input.definitions[0]!.baseRules[0]!.tiers[0]!.tier = 'miss'
    }],
  ])('rejects an invalid closed %s value', (_label, mutator) => {
    expectRejected(mutator)
  })

  test.each([
    ['fractional', 0.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
    ['negative', -1],
  ])('rejects %s priority', (_label, priority) => {
    expectRejected((input) => {
      input.definitions[0]!.displayPriority = priority
    })
  })

  test('accepts the maximum safe nonnegative priority', () => {
    const input = styleDefinitionBundleFixture()
    input.definitions[0]!.displayPriority = Number.MAX_SAFE_INTEGER
    expect(styleDefinitionBundleSchema.safeParse(input).success).toBe(true)
  })

  test.each([
    ['zero points', 'points', 0],
    ['negative points', 'points', -1],
    ['NaN points', 'points', Number.NaN],
    ['infinite points', 'points', Number.POSITIVE_INFINITY],
    ['zero penalty', 'penalty', 0],
    ['negative penalty', 'penalty', -1],
    ['NaN penalty', 'penalty', Number.NaN],
    ['infinite penalty', 'penalty', Number.POSITIVE_INFINITY],
  ] as const)('rejects %s', (_label, field, value) => {
    expectRejected((input) => {
      if (field === 'points') input.definitions[0]!.bonuses[0]!.points = value
      else input.definitions[0]!.conflicts[0]!.penalty = value
    })
  })

  test.each([
    ['zero', 0],
    ['fractional', 0.5],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
    ['larger than conditions', 2],
  ])('rejects %s minMatches', (_label, minMatches) => {
    expectRejected((input) => {
      input.definitions[0]!.bonuses[0]!.minMatches = minMatches
    })
  })

  test.each([
    '/Users/anson/style.ts',
    'C:\\repo\\style.ts',
    '../styles/style.ts',
    './styles/style.ts',
    'styles\\style.ts',
  ])('rejects unstable repository source %s', (sourceFile) => {
    expectRejected((input) => {
      input.definitions[0]!.sourceFile = sourceFile
    })
  })

  test('rejects empty required root and taxonomy collections', () => {
    expectRejected((input) => {
      input.definitions = []
    })
    expectRejected((input) => {
      input.taxonomy.families = []
    })
  })

  test('leaves duplicate and empty semantic findings for registered diagnostics', () => {
    const input = styleDefinitionBundleFixture()
    input.definitions[0]!.supportedIntensityIds = []
    input.definitions[0]!.supportedNoodleIds = []
    input.definitions[0]!.baseRules = []
    input.definitions[0]!.conflicts[0]!.whenAll = []
    expect(styleDefinitionBundleSchema.safeParse(input).success).toBe(true)

    const duplicateInput = styleDefinitionBundleFixture()
    duplicateInput.definitions.push(structuredClone(duplicateInput.definitions[0]!))
    expect(styleDefinitionBundleSchema.safeParse(duplicateInput).success).toBe(true)
  })

  test('uses the required repository fallback for malformed roots', () => {
    const result = parseStyleDefinitionBundle(null, styleBundleFallbackSource)

    expect(result.definition).toBeUndefined()
    expect(result.diagnostics).toEqual([expect.objectContaining({
      code: 'STRUCTURE_INVALID',
      sourceFile: styleBundleFallbackSource,
      path: '',
      message: 'Invalid style definition structure',
    })])
    expect(JSON.stringify(result.diagnostics)).not.toContain('/Users/')
  })
})
