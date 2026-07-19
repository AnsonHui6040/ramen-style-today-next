import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  canonicalizeLegacyStyleCases,
  computeLegacyStyleTrackedSourceHashesHash,
  computeLegacyStyleCasesHash,
  computeStyleExtractorAuthoringHash,
  legacyStyleRepositoryIdentity,
  legacyStyleTrackedSourceCount,
  legacyStyleTrackedSourceHashesHash,
  legacyStyleObservationSchema,
  legacyStyleSeedFileSchema,
  parseLegacyStyleRawCases,
  styleDependencyTreeHash,
  styleCopyRoleIds,
  styleExtractionNodeVersion,
  styleFixtureManifestSchema,
  styleInstalledLockfileHash,
  styleInstrumentationHash,
  styleLegacyLockfileHash,
  styleSeedsHash,
  validateLegacyStyleCases,
  type LegacyStyleObservation,
  type LegacyStyleSeedCase,
} from './contracts.js'
import { styleTrackedSourceHashes } from './extractor.js'

function validSeedCase(): LegacyStyleSeedCase {
  return {
    id: 'legacy-style-catalog' as const,
    styleIds: ['demo'],
    coreIds: ['demo:clean'],
    subtypeIds: ['demo:clean:thin-straight'],
    ruleIds: ['demo:clean:form'],
    adjustmentCopies: [
      {
        kind: 'bonus' as const,
        id: 'demo-bonus',
        parentCoreId: 'demo:clean',
        sourceRole: 'core-bonus' as const,
        sourceOrdinal: 0,
      },
      {
        kind: 'conflict' as const,
        id: 'demo-conflict',
        parentCoreId: 'demo:clean',
        sourceRole: 'core-conflict' as const,
        sourceOrdinal: 0,
      },
    ],
    exclusionTagIds: ['pork'],
    copyRoles: [...styleCopyRoleIds] as LegacyStyleSeedCase['copyRoles'],
  }
}

function validObservation(): LegacyStyleObservation {
  return {
    schemaVersion: 1,
    id: 'legacy-style-catalog',
    styles: [{
      id: 'demo',
      family: 'soup',
      displayPriority: 0,
      accent: '#123456',
      exclusionTagIds: ['pork'],
      copySources: [
        { role: 'style-label', value: 'Demo' },
        { role: 'style-summary', value: 'Summary' },
      ],
    }],
    cores: [{
      id: 'demo:clean',
      parentStyleId: 'demo',
      intensityId: 'clean',
      priority: 0,
      copySources: [
        { role: 'core-label', value: 'Clean' },
        { role: 'core-summary', value: 'Clean summary' },
      ],
    }],
    subtypes: [{
      id: 'demo:clean:thin-straight',
      parentStyleId: 'demo',
      parentCoreId: 'demo:clean',
      noodleId: 'thin-straight',
      priority: 0,
      copySources: [
        { role: 'subtype-label', value: 'Thin' },
        { role: 'subtype-summary', value: 'Thin summary' },
      ],
    }],
    rules: [{
      id: 'demo:clean:form',
      parentStyleId: 'demo',
      parentCoreId: 'demo:clean',
      questionId: 'form',
      priority: 0,
      tiers: [
        { tier: 'exact', targets: [{ optionId: 'soup', priority: 0 }] },
        { tier: 'adjacent', targets: [] },
        { tier: 'partial', targets: [] },
        { tier: 'miss', targets: [] },
      ],
    }],
    adjustments: [
      {
        kind: 'bonus',
        id: 'demo-bonus',
        parentStyleId: 'demo',
        parentCoreId: 'demo:clean',
        sourceRole: 'core-bonus',
        sourceOrdinal: 0,
        points: 3,
        minMatches: 1,
        conditions: [{ priority: 0, questionId: 'form', optionIds: ['soup'] }],
        copySources: [{ role: 'bonus-reason', value: 'Bonus' }],
      },
      {
        kind: 'conflict',
        id: 'demo-conflict',
        parentStyleId: 'demo',
        parentCoreId: 'demo:clean',
        sourceRole: 'core-conflict',
        sourceOrdinal: 0,
        penalty: 4,
        whenAll: [{ priority: 0, questionId: 'form', optionIds: ['soup'] }],
        copySources: [{ role: 'conflict-reason', value: 'Conflict' }],
      },
    ],
    exclusionTags: [{ id: 'pork', priority: 0 }],
    copyRoles: styleCopyRoleIds.map((id, priority) => ({ id, priority })),
    coverage: {
      styles: 1,
      cores: 1,
      subtypes: 1,
      rules: 1,
      bonusCopies: 1,
      conflictCopies: 1,
      exclusionTags: 1,
      copyRoles: styleCopyRoleIds.length,
    },
  }
}

function reversedObservation(): LegacyStyleObservation {
  const value = multiObservation()
  value.styles.reverse()
  value.cores.reverse()
  value.subtypes.reverse()
  value.rules.reverse()
  value.adjustments.reverse()
  value.exclusionTags.reverse()
  value.copyRoles.reverse()
  for (const style of value.styles) style.exclusionTagIds.reverse()
  for (const rule of value.rules) {
    rule.tiers.reverse()
    for (const tier of rule.tiers) tier.targets.reverse()
  }
  for (const adjustment of value.adjustments) {
    const conditions = adjustment.kind === 'bonus'
      ? adjustment.conditions
      : adjustment.whenAll
    conditions.reverse()
    for (const condition of conditions) condition.optionIds.reverse()
  }
  return value
}

function multiObservation(): LegacyStyleObservation {
  const value = structuredClone(validObservation())
  value.styles[0]!.exclusionTagIds.push('dairy')
  value.styles.push({
    id: 'demo-two',
    family: 'dry',
    displayPriority: 1,
    accent: '#654321',
    exclusionTagIds: ['pork', 'dairy'],
    copySources: [
      { role: 'style-label', value: 'Demo two' },
      { role: 'style-summary', value: 'Second summary' },
    ],
  })
  value.cores.push({
    id: 'demo-two:standard',
    parentStyleId: 'demo-two',
    intensityId: 'standard',
    priority: 0,
    copySources: [
      { role: 'core-label', value: 'Standard' },
      { role: 'core-summary', value: 'Standard summary' },
    ],
  })
  value.subtypes.push({
    id: 'demo-two:standard:extra-thick',
    parentStyleId: 'demo-two',
    parentCoreId: 'demo-two:standard',
    noodleId: 'extra-thick',
    priority: 0,
    copySources: [
      { role: 'subtype-label', value: 'Extra thick' },
      { role: 'subtype-summary', value: 'Extra thick summary' },
    ],
  })
  value.rules[0]!.tiers[0]!.targets.push({ optionId: 'dry', priority: 2 })
  value.rules.push({
    id: 'demo-two:standard:archetype',
    parentStyleId: 'demo-two',
    parentCoreId: 'demo-two:standard',
    questionId: 'archetype',
    priority: 0,
    tiers: [
      {
        tier: 'exact',
        targets: [
          { optionId: 'aburasoba', priority: 6 },
          { optionId: 'dry-other', priority: 9 },
        ],
      },
      { tier: 'adjacent', targets: [] },
      { tier: 'partial', targets: [] },
      { tier: 'miss', targets: [] },
    ],
  })
  if (value.adjustments[0]?.kind !== 'bonus') throw new Error('expected bonus fixture')
  value.adjustments[0].conditions.push({
    priority: 1,
    questionId: 'body',
    optionIds: ['light', 'balanced'],
  })
  if (value.adjustments[1]?.kind !== 'conflict') throw new Error('expected conflict fixture')
  value.adjustments[1].whenAll.push({
    priority: 1,
    questionId: 'body',
    optionIds: ['light', 'balanced'],
  })
  value.exclusionTags.push({ id: 'dairy', priority: 1 })
  value.coverage = {
    styles: 2,
    cores: 2,
    subtypes: 2,
    rules: 2,
    bonusCopies: 1,
    conflictCopies: 1,
    exclusionTags: 2,
    copyRoles: styleCopyRoleIds.length,
  }
  return value
}

function reverseObjectInsertionOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectInsertionOrder)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reverseObjectInsertionOrder(child)]),
    )
  }
  return value
}

function validManifestInput() {
  const observation = validObservation()
  const sources = [
    { path: 'tools/parity/shared/contracts.ts', hash: 'e'.repeat(64) },
    { path: 'tools/parity/shared/authoring.ts', hash: 'e'.repeat(64) },
    { path: 'tools/parity/styles/contracts.ts', hash: 'e'.repeat(64) },
    { path: 'tools/parity/styles/extractor.ts', hash: 'e'.repeat(64) },
    { path: 'tools/parity/styles/extract.ts', hash: 'e'.repeat(64) },
  ] as const
  return {
    fixtureSchemaVersion: 1,
    source: {
      repository: {
        host: legacyStyleRepositoryIdentity.host,
        owner: legacyStyleRepositoryIdentity.owner,
        repository: legacyStyleRepositoryIdentity.repository,
      },
      commit: legacyStyleRepositoryIdentity.commit,
      treeHash: legacyStyleRepositoryIdentity.treeHash,
      trackedSourceHashes: styleTrackedSourceHashes,
      lockfilePath: 'package-lock.json',
      lockfileHash: styleLegacyLockfileHash,
    },
    extractor: {
      version: 1,
      sources,
      hash: computeStyleExtractorAuthoringHash(sources),
    },
    instrumentation: { version: 1, hash: styleInstrumentationHash },
    seeds: { schemaVersion: 1, hash: styleSeedsHash },
    runtime: {
      nodeVersion: styleExtractionNodeVersion,
      timezone: 'UTC',
      locale: 'C.UTF-8',
      dependencies: 'copy-validated',
      installedLockfileHash: styleInstalledLockfileHash,
      dependencyTreeHash: styleDependencyTreeHash,
      network: 'denied',
      fullSuiteBeforeExtraction: true,
    },
    orderedStyleIds: ['demo'],
    orderedCoreIds: ['demo:clean'],
    orderedSubtypeIds: ['demo:clean:thin-straight'],
    orderedRuleIds: ['demo:clean:form'],
    orderedAdjustmentCopyIds: [
      'bonus:demo-bonus:demo:clean:core-bonus:0',
      'conflict:demo-conflict:demo:clean:core-conflict:0',
    ],
    orderedExclusionTagIds: ['pork'],
    orderedCopyRoles: [...styleCopyRoleIds],
    coverage: observation.coverage,
    caseCount: 1,
    casesHash: computeLegacyStyleCasesHash([observation]),
    fixtureContentHash: '4'.repeat(64),
  }
}

describe('legacy style observation contracts', () => {
  test('accepts the strict observation root and freezes it', () => {
    const parsed = legacyStyleObservationSchema.parse(validObservation())
    expect(parsed).toEqual(validObservation())
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.styles)).toBe(true)
  })

  test.each([
    ['timestamp', '2026-07-16T00:00:00Z'],
    ['savedAt', '2026-07-16T00:00:00Z'],
    ['currentCompiledStyleModel', {}],
    ['recommendations', []],
    ['eligibility', true],
    ['absolutePath', '/Users/example/legacy'],
  ])('rejects forbidden observation field %s', (key, value) => {
    expect(() => legacyStyleObservationSchema.parse({
      ...validObservation(),
      [key]: value,
    })).toThrow()
  })

  test.each([
    'style-label',
    'style-summary',
    'core-label',
    'core-summary',
    'subtype-label',
    'subtype-summary',
    'bonus-reason',
    'conflict-reason',
  ])('retains the approved copy role %s', (role) => {
    expect(styleCopyRoleIds).toContain(role)
  })

  test('uses fixed exact, adjacent, partial, and miss tier order', () => {
    const parsed = legacyStyleObservationSchema.parse(validObservation())
    expect(parsed.rules[0]?.tiers.map(({ tier }) => tier)).toEqual([
      'exact',
      'adjacent',
      'partial',
      'miss',
    ])
  })

  test.each([
    ['duplicate style', (value: LegacyStyleObservation) => value.styles.push({ ...value.styles[0]! })],
    ['duplicate core', (value: LegacyStyleObservation) => value.cores.push({ ...value.cores[0]! })],
    ['duplicate subtype', (value: LegacyStyleObservation) => value.subtypes.push({ ...value.subtypes[0]! })],
    ['duplicate rule', (value: LegacyStyleObservation) => value.rules.push({ ...value.rules[0]! })],
    ['duplicate adjustment copy', (value: LegacyStyleObservation) => value.adjustments.push({ ...value.adjustments[0]! })],
  ])('rejects %s identity', (_label, mutate) => {
    const value = structuredClone(validObservation())
    mutate(value)
    expect(() => validateLegacyStyleCases([value], [
      {
        id: 'legacy-style-catalog',
        styleIds: ['demo'],
        coreIds: ['demo:clean'],
        subtypeIds: ['demo:clean:thin-straight'],
        ruleIds: ['demo:clean:form'],
        adjustmentCopies: [
          {
            kind: 'bonus',
            id: 'demo-bonus',
            parentCoreId: 'demo:clean',
            sourceRole: 'core-bonus',
            sourceOrdinal: 0,
          },
          {
            kind: 'conflict',
            id: 'demo-conflict',
            parentCoreId: 'demo:clean',
            sourceRole: 'core-conflict',
            sourceOrdinal: 0,
          },
        ],
        exclusionTagIds: ['pork'],
        copyRoles: [...styleCopyRoleIds],
      },
    ])).toThrow(/duplicate/i)
  })

  test('canonicalizes reversed arrays and object insertion order byte-identically', () => {
    const canonicalObservation = multiObservation()
    const canonical = canonicalizeLegacyStyleCases([canonicalObservation])
    const reversed = canonicalizeLegacyStyleCases([reversedObservation()])
    const insertionReversed = canonicalizeLegacyStyleCases([
      reverseObjectInsertionOrder(canonicalObservation) as LegacyStyleObservation,
    ])
    expect(reversed).toBe(canonical)
    expect(insertionReversed).toBe(canonical)
    expect(computeLegacyStyleCasesHash([reversedObservation()]))
      .toBe(computeLegacyStyleCasesHash([canonicalObservation]))
  })

  test('canonicalizes target and condition option order by approved legacy priority', () => {
    const canonical = structuredClone(validObservation())
    canonical.rules[0]!.tiers[0]!.targets = [
      { optionId: 'soup', priority: 0 },
      { optionId: 'dry', priority: 2 },
    ]
    if (canonical.adjustments[0]?.kind !== 'bonus') {
      throw new Error('expected bonus fixture')
    }
    canonical.adjustments[0].conditions[0]!.optionIds = ['soup', 'dry']
    const reversed = structuredClone(canonical)
    reversed.rules[0]!.tiers[0]!.targets.reverse()
    if (reversed.adjustments[0]?.kind === 'bonus') {
      reversed.adjustments[0].conditions[0]!.optionIds.reverse()
    }
    expect(canonicalizeLegacyStyleCases([reversed]))
      .toBe(canonicalizeLegacyStyleCases([canonical]))
  })

  test.each([
    'styles',
    'cores',
    'subtypes',
    'rules',
    'bonusCopies',
    'conflictCopies',
    'exclusionTags',
    'copyRoles',
  ] as const)('rejects %s coverage drift', (field) => {
    const observation = structuredClone(validObservation())
    observation.coverage[field] += 1
    expect(() => validateLegacyStyleCases([observation], [validSeedCase()]))
      .toThrow(/coverage mismatch/i)
  })

  test.each([
    ['core parent', (value: LegacyStyleObservation) => {
      value.cores[0]!.parentStyleId = 'wrong'
    }],
    ['subtype parent', (value: LegacyStyleObservation) => {
      value.subtypes[0]!.parentCoreId = 'wrong:clean'
    }],
    ['rule parent', (value: LegacyStyleObservation) => {
      value.rules[0]!.parentCoreId = 'wrong:clean'
    }],
    ['adjustment parent', (value: LegacyStyleObservation) => {
      value.adjustments[0]!.parentCoreId = 'wrong:clean'
    }],
    ['explicit miss target', (value: LegacyStyleObservation) => {
      value.rules[0]!.tiers[3]!.targets.push({ optionId: 'dry', priority: 2 })
    }],
  ])('rejects %s mismatch', (_label, mutate) => {
    const observation = structuredClone(validObservation())
    mutate(observation)
    expect(() => validateLegacyStyleCases([observation], [validSeedCase()])).toThrow()
  })

  test.each([
    'styleIds',
    'coreIds',
    'subtypeIds',
    'ruleIds',
    'adjustmentCopies',
    'exclusionTagIds',
  ] as const)('rejects seed %s coverage drift', (field) => {
    const seed = validSeedCase()
    seed[field] = [] as never
    expect(() => validateLegacyStyleCases([validObservation()], [seed])).toThrow(/seed coverage/i)
  })

  test('binds the complete deterministic seed inventory', () => {
    const seed = legacyStyleSeedFileSchema.parse(JSON.parse(readFileSync(
      resolve(process.cwd(), 'tools/parity/styles/seeds.json'),
      'utf8',
    )) as unknown)
    expect(seed.case.styleIds).toHaveLength(18)
    expect(seed.case.coreIds).toHaveLength(54)
    expect(seed.case.subtypeIds).toHaveLength(270)
    expect(seed.case.ruleIds).toHaveLength(378)
    expect(seed.case.adjustmentCopies.filter(({ kind }) => kind === 'bonus')).toHaveLength(54)
    expect(seed.case.adjustmentCopies.filter(({ kind }) => kind === 'conflict')).toHaveLength(21)
    expect(seed.case.exclusionTagIds).toEqual([
      'pork',
      'chicken',
      'duck',
      'fish-seafood',
      'shellfish',
      'dairy',
    ])
    expect(seed.case.copyRoles).toEqual(styleCopyRoleIds)
  })

  test('parses only the strict raw extraction envelope', () => {
    expect(parseLegacyStyleRawCases({
      schemaVersion: 1,
      cases: [validObservation()],
    })).toHaveLength(1)
    expect(() => parseLegacyStyleRawCases([validObservation()])).toThrow(/envelope/i)
    expect(() => parseLegacyStyleRawCases({
      schemaVersion: 1,
      cases: [validObservation()],
      temporaryPath: '/tmp/worktree',
    })).toThrow(/envelope/i)
  })

  test('requires exact seed ordering and stable adjustment-copy identity', () => {
    const parsed = legacyStyleSeedFileSchema.parse({
      schemaVersion: 1,
      case: {
        id: 'legacy-style-catalog',
        styleIds: ['demo'],
        coreIds: ['demo:clean'],
        subtypeIds: ['demo:clean:thin-straight'],
        ruleIds: ['demo:clean:form'],
        adjustmentCopies: [{
          kind: 'bonus',
          id: 'demo-bonus',
          parentCoreId: 'demo:clean',
          sourceRole: 'core-bonus',
          sourceOrdinal: 0,
        }],
        exclusionTagIds: ['pork'],
        copyRoles: [...styleCopyRoleIds],
      },
    })
    expect(parsed.case.adjustmentCopies[0]).toEqual({
      kind: 'bonus',
      id: 'demo-bonus',
      parentCoreId: 'demo:clean',
      sourceRole: 'core-bonus',
      sourceOrdinal: 0,
    })
  })

  test.each([
    '/tmp/legacy-copy',
    '/var/folders/legacy-copy',
    '/opt/legacy-copy',
    'file:///Users/example/legacy-copy',
    '\\\\server\\share\\legacy-copy',
  ])('rejects nested absolute machine path %s in observed copy', (path) => {
    const observation = validObservation()
    observation.styles[0]!.copySources[0]!.value = path
    expect(() => legacyStyleObservationSchema.parse(observation)).toThrow(/machine path/i)
  })

  test('rejects reordered copy-role seed identity', () => {
    const seed = validSeedCase()
    seed.copyRoles.reverse()
    expect(() => legacyStyleSeedFileSchema.parse({
      schemaVersion: 1,
      case: seed,
    })).toThrow()
  })

  test('accepts a copy-validated manifest with no npm runtime evidence', () => {
    const manifest = styleFixtureManifestSchema.parse(validManifestInput())
    expect(manifest.runtime).not.toHaveProperty('npmVersion')
    expect(manifest.seeds.hash).toBe(styleSeedsHash)
    expect(Object.keys(manifest.source.trackedSourceHashes))
      .toHaveLength(legacyStyleTrackedSourceCount)
    expect(computeLegacyStyleTrackedSourceHashesHash(manifest.source.trackedSourceHashes))
      .toBe(legacyStyleTrackedSourceHashesHash)
  })

  test('rejects alternate repository, source, runtime, and seed identities', () => {
    const valid = validManifestInput()
    expect(() => styleFixtureManifestSchema.parse({
      ...valid,
      source: {
        ...valid.source,
        repository: { ...valid.source.repository, owner: 'alternate-owner' },
      },
    })).toThrow()
    expect(() => styleFixtureManifestSchema.parse({
      ...valid,
      source: {
        ...valid.source,
        trackedSourceHashes: {
          ...valid.source.trackedSourceHashes,
          'src/data/styles.json': '0'.repeat(64),
        },
      },
    })).toThrow(/full-suite closure/i)
    expect(() => styleFixtureManifestSchema.parse({
      ...valid,
      runtime: { ...valid.runtime, nodeVersion: '24.99.0' },
    })).toThrow()
    expect(() => styleFixtureManifestSchema.parse({
      ...valid,
      seeds: { ...valid.seeds, hash: '0'.repeat(64) },
    })).toThrow()
  })

  test('does not expose style observations to production packages', () => {
    const packageRoot = resolve(process.cwd(), 'packages')
    const collectSource = (directory: string): string[] => readdirSync(
      directory,
      { withFileTypes: true },
    ).flatMap((entry) => {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) return collectSource(path)
      return /\.(?:ts|tsx|js|mjs)$/.test(entry.name)
        ? [readFileSync(path, 'utf8')]
        : []
    })
    const packageFiles = collectSource(packageRoot).join('\n')
    expect(packageRoot).not.toContain('tools/parity/styles')
    expect(packageFiles).not.toContain('scoreQuestionnaire(')
    expect(packageFiles).not.toContain('tools/parity/styles')
    expect(packageFiles).not.toContain('LegacyStyleObservation')
  })
})
