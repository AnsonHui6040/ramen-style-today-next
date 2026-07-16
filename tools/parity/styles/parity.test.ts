import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { CompiledStyleModel } from '@ramen-style/classification-core'
import { styleModel } from '@ramen-style/classification-core/generated/style-model'
import { describe, expect, it } from 'vitest'

import {
  legacyStyleObservationSchema,
  parseLegacyStyleRawCases,
  type LegacyStyleObservation,
} from './contracts.js'
import {
  compareStyleParity,
  runStyleParity,
  serializeStyleParityResult,
  type StyleParityFailure,
  type StyleParityResult,
} from './parity.js'
import {
  verifyCommittedStyleFixtures,
  type StyleFixtureVerificationResult,
} from './verify-fixtures.js'

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T

const repositoryRoot = resolve(import.meta.dirname, '../../..')
const paritySourcePath = resolve(import.meta.dirname, 'parity.ts')
const parityCliPath = resolve(repositoryRoot, 'tools/parity/styles/parity.ts')
const packageJsonPath = resolve(repositoryRoot, 'package.json')
const casesPath = resolve(
  import.meta.dirname,
  '../fixtures/styles/legacy-v1/cases.json',
)
const fixtureVerification = verifyCommittedStyleFixtures()
const rawCases = parseLegacyStyleRawCases(
  JSON.parse(readFileSync(casesPath, 'utf8')) as unknown,
)
const frozenObservation = legacyStyleObservationSchema.parse(rawCases[0])

function cloneCurrent() {
  return structuredClone(styleModel) as unknown as Mutable<CompiledStyleModel>
}

function cloneLegacy() {
  return structuredClone(frozenObservation) as unknown as Mutable<LegacyStyleObservation>
}

function setField(target: object, key: string, value: unknown) {
  Reflect.set(target, key, value)
}

function compare(
  currentModel: CompiledStyleModel = styleModel,
  legacyObservation: LegacyStyleObservation | Mutable<LegacyStyleObservation> = frozenObservation,
) {
  return compareStyleParity({
    currentModel,
    legacyObservation: legacyObservation as unknown as LegacyStyleObservation,
    fixtureVerification,
  })
}

function expectFailure(
  result: StyleParityResult,
  pointerPart?: string,
): StyleParityFailure {
  expect(result.status).toBe('fail')
  if (result.status !== 'fail') throw new Error('expected style parity failure')
  expect(result.totalMismatchCount).toBeGreaterThan(0)
  if (pointerPart) {
    const displayed = result.mismatches.some(({ pointer }) => pointer.includes(pointerPart))
    expect(displayed || result.truncated).toBe(true)
  }
  return result
}

function injectedDependencies(
  verifyFixtures: () => StyleFixtureVerificationResult = verifyCommittedStyleFixtures,
  loadLegacyObservation: () => LegacyStyleObservation = () => frozenObservation,
) {
  return {
    currentModel: styleModel,
    verifyFixtures,
    loadLegacyObservation,
  }
}

function findLegacyCopies(kind: 'bonus' | 'conflict', id: string) {
  return cloneLegacy().adjustments.filter((copy) => copy.kind === kind && copy.id === id)
}

describe('Task 15 fixture gate and offline boundary', () => {
  it('accepts the valid committed fixture before comparison', () => {
    const result = runStyleParity([], injectedDependencies())
    expect(result.status).toBe('pass')
  })

  it.each([
    ['missing cases', 'style cases bytes are missing', '/fixture/cases'],
    ['missing manifest', 'style manifest bytes are missing', '/fixture/manifest'],
    ['manifest identity drift', 'style manifest identity drifted', '/fixture/manifest'],
    ['raw fixture drift', 'style case bytes drifted', '/fixture/cases'],
    ['canonical cases hash drift', 'style corpus identity drifted', '/fixture'],
  ])('rejects %s', (_label, message, pointer) => {
    const result = runStyleParity([], injectedDependencies(() => {
      throw new Error(message)
    }))
    expectFailure(result, pointer)
  })

  it('stops before loading or comparing when offline verification fails', () => {
    let loads = 0
    const result = runStyleParity([], injectedDependencies(
      () => {
        throw new Error('fixture verification failed')
      },
      () => {
        loads += 1
        return frozenObservation
      },
    ))
    expectFailure(result, '/fixture')
    expect(loads).toBe(0)
  })

  it('imports neither the live extractor nor authoring entrypoint', () => {
    const source = readFileSync(paritySourcePath, 'utf8')
    expect(source).not.toMatch(/from ['"].*(?:extractor|extract)\.js['"]/)
  })

  it('does not reference a neighboring checkout or machine path', () => {
    const source = readFileSync(paritySourcePath, 'utf8')
    expect(source).not.toContain('legacyStyleRepositoryIdentity')
    expect(source).not.toContain('/Users/')
    expect(source).not.toMatch(/child_process|spawnSync|execFile/)
  })

  it('has no network-capable imports', () => {
    const source = readFileSync(paritySourcePath, 'utf8')
    expect(source).not.toMatch(/node:(?:http|https|http2|dns|net|tls|dgram)/)
    expect(source).not.toMatch(/\bfetch\s*\(/)
  })
})

describe('Task 15 exact inventory and identities', () => {
  it('reports every exact frozen and normalized count', () => {
    const result = compare()
    expect(result).toMatchObject({
      status: 'pass',
      styleCount: 18,
      coreCount: 54,
      subtypeCount: 270,
      ruleCount: 378,
      bonusCount: 18,
      conflictCount: 7,
      legacyBonusCopyCount: 54,
      legacyConflictCopyCount: 21,
      exclusionTagCount: 6,
      copyRoleCount: 8,
    })
  })

  it('reports the exact fixture and current identities', () => {
    const result = compare()
    expect(result).toMatchObject({
      status: 'pass',
      fixtureCasesHash: 'cd48d42b596e1d7d71757a8cec109f7787d21596a8905a06c505fefbd0f93517',
      fixtureContentHash: 'd33119e4d36a8b37314805dc8e439f724a37bf62b91fd3288a780ad67c2c3028',
      manifestHash: 'fa1a4714a77ce70489b56c54b82a812b28cd18dbc31a668a62ae51cc12e9586b',
      semanticHash: '9fb9832c434b22fcd8397809b14117a47c358a266694df24ba68fd290fc5f585',
      dataVersion: 'c5b3b3353b42618875f1c20d64449ec513601b60215351f757dbd1e48d1fee28',
    })
  })

  it.each([
    ['style', (model: Mutable<CompiledStyleModel>) => model.styles.reverse(), '/orderedStyleIds'],
    ['core', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.cores.reverse(), '/orderedCoreIds'],
    ['subtype', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.cores[0]!.subtypes.reverse(), '/orderedSubtypeIds'],
  ])('rejects reordered %s IDs', (_label, mutate, pointer) => {
    const model = cloneCurrent()
    mutate(model)
    expectFailure(compare(model), pointer)
  })

  it.each([
    ['missing style', (model: Mutable<CompiledStyleModel>) => model.styles.pop(), '/styles/'],
    ['extra style', (model: Mutable<CompiledStyleModel>) => {
      const extra = structuredClone(model.styles[0]!)
      setField(extra, 'id', 'extra-style')
      setField(extra, 'displayPriority', 99)
      extra.cores = []
      extra.adjustments = []
      model.styles.push(extra)
    }, '/styles/extra-style'],
    ['duplicate style', (model: Mutable<CompiledStyleModel>) => model.styles.push(structuredClone(model.styles[0]!)), '/styles/shoyu-chintan'],
    ['missing core', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.cores.pop(), '/cores/'],
    ['extra core', (model: Mutable<CompiledStyleModel>) => {
      const extra = structuredClone(model.styles[0]!.cores[0]!)
      setField(extra, 'id', 'shoyu-chintan:extra')
      setField(extra, 'intensityId', 'extra')
      setField(extra, 'priority', 99)
      extra.rules = []
      extra.subtypes = []
      model.styles[0]!.cores.push(extra)
    }, '/cores/shoyu-chintan:extra'],
    ['duplicate core', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.cores.push(structuredClone(model.styles[0]!.cores[0]!)), '/cores/shoyu-chintan:clean'],
    ['wrong core parent', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.cores[0]!, 'parentStyleId', 'miso'), '/parentStyleId'],
    ['missing subtype', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.cores[0]!.subtypes.pop(), '/subtypes/'],
    ['extra subtype', (model: Mutable<CompiledStyleModel>) => {
      const extra = structuredClone(model.styles[0]!.cores[0]!.subtypes[0]!)
      setField(extra, 'id', 'shoyu-chintan:clean:extra')
      setField(extra, 'noodleId', 'extra')
      setField(extra, 'priority', 99)
      model.styles[0]!.cores[0]!.subtypes.push(extra)
    }, '/subtypes/shoyu-chintan:clean:extra'],
    ['duplicate subtype', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.cores[0]!.subtypes.push(structuredClone(model.styles[0]!.cores[0]!.subtypes[0]!)), '/subtypes/shoyu-chintan:clean:thin-straight'],
    ['wrong subtype parent', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.cores[0]!.subtypes[0]!, 'parentCoreId', 'miso:clean'), '/parentCoreId'],
  ])('rejects %s', (_label, mutate, pointer) => {
    const model = cloneCurrent()
    mutate(model)
    expectFailure(compare(model), pointer)
  })

  it.each([
    ['inventory reorder', (model: Mutable<CompiledStyleModel>) => model.inventory.reverse(), '/orderedInventoryKeys'],
    ['missing inventory record', (model: Mutable<CompiledStyleModel>) => model.inventory.pop(), '/inventory/'],
    ['extra inventory record', (model: Mutable<CompiledStyleModel>) => {
      const extra = structuredClone(model.inventory[0]!)
      setField(extra, 'key', 'style/extra-style')
      setField(extra, 'kind', 'style')
      setField(extra, 'id', 'extra-style')
      model.inventory.push(extra)
    }, 'style~1extra-style'],
    ['duplicate inventory record', (model: Mutable<CompiledStyleModel>) => model.inventory.push(structuredClone(model.inventory[0]!)), '/inventory/'],
    ['inventory kind mismatch', (model: Mutable<CompiledStyleModel>) => setField(model.inventory[0]!, 'kind', 'style'), '/kind'],
  ])('rejects %s', (_label, mutate, pointer) => {
    const model = cloneCurrent()
    mutate(model)
    expectFailure(compare(model), pointer)
  })
})

describe('Task 15 style, core, subtype, tag, and copy-role projection', () => {
  it.each([
    ['family', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!, 'family', 'dry'), '/family'],
    ['accent', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!, 'accent', '#000000'), '/accent'],
    ['display priority', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!, 'displayPriority', 99), '/displayPriority'],
    ['intensity priority', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.cores[0]!, 'priority', 99), '/priority'],
    ['noodle priority', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.cores[0]!.subtypes[0]!, 'priority', 99), '/priority'],
    ['supported intensity matrix', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.supportedIntensityIds.reverse(), '/supportedIntensityIds'],
    ['supported noodle matrix', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.supportedNoodleIds.pop(), '/supportedNoodleIds'],
    ['copy role', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.messageIds, 'label', ''), '/copyRoles'],
    ['per-style tag', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.exclusionTags.push('dairy'), '/exclusionTagIds'],
    ['global tag', (model: Mutable<CompiledStyleModel>) => model.exclusionTags.pop(), '/exclusionTags'],
    ['exclusion mapping', (model: Mutable<CompiledStyleModel>) => setField(model.exclusionTags[0]!, 'optionId', 'wrong-option'), '/optionId'],
    ['exclusion question binding', (model: Mutable<CompiledStyleModel>) => setField(model.exclusionTags[0]!, 'questionId', 'wrong-question'), '/questionId'],
  ])('rejects %s mismatch', (_label, mutate, pointer) => {
    const model = cloneCurrent()
    mutate(model)
    expectFailure(compare(model), pointer)
  })

  it('compares copy roles but not localized copy values', () => {
    const legacy = cloneLegacy()
    legacy.styles[0]!.copySources[0]!.value = 'not compared localized copy'
    legacy.adjustments[0]!.copySources[0]!.value = 'not compared reason copy'
    expect(compare(styleModel, legacy).status).toBe('pass')
  })

  it('compares stable message slots but not message ID spelling', () => {
    const model = cloneCurrent()
    model.styles[0]!.messageIds.label = 'changed-but-present'
    model.styles[0]!.cores[0]!.messageIds.summaryTemplate = 'changed-but-present'
    model.styles[0]!.cores[0]!.subtypes[0]!.messageIds.labelTemplate = 'changed-but-present'
    model.styles[0]!.adjustments[0]!.labelMessageId = 'changed-but-present'
    expect(compare(model).status).toBe('pass')
  })

  it.each([
    ['bonus', (model: Mutable<CompiledStyleModel>) => model.styles
      .flatMap(({ adjustments }) => adjustments)
      .find(({ kind }) => kind === 'bonus')!],
    ['conflict', (model: Mutable<CompiledStyleModel>) => model.styles
      .flatMap(({ adjustments }) => adjustments)
      .find(({ kind }) => kind === 'conflict')!],
  ])('requires the current %s labelMessageId slot for its copy role', (_kind, select) => {
    const model = cloneCurrent()
    setField(select(model), 'labelMessageId', '')
    expectFailure(compare(model), '/copyRole')
  })

  it('rejects global tag order drift', () => {
    const model = cloneCurrent()
    model.exclusionTags.reverse()
    expectFailure(compare(model), '/orderedExclusionTagIds')
  })

  it('rejects legacy global tag order drift', () => {
    const legacy = cloneLegacy()
    legacy.exclusionTags.reverse()
    expectFailure(compare(styleModel, legacy), '/orderedExclusionTagIds')
  })

  it('rejects copy-role order drift', () => {
    const legacy = cloneLegacy()
    legacy.copyRoles.reverse()
    expectFailure(compare(styleModel, legacy), '/copyRoles')
  })
})

describe('Task 15 exact rule representation', () => {
  it.each([
    ['missing rule', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.cores[0]!.rules.pop(), '/rules/'],
    ['extra rule', (model: Mutable<CompiledStyleModel>) => {
      const extra = structuredClone(model.styles[0]!.cores[0]!.rules[0]!)
      setField(extra, 'id', 'shoyu-chintan:clean:extra')
      setField(extra, 'questionId', 'extra')
      setField(extra, 'priority', 99)
      model.styles[0]!.cores[0]!.rules.push(extra)
    }, '/rules/shoyu-chintan:clean:extra'],
    ['duplicate rule', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.cores[0]!.rules.push(structuredClone(model.styles[0]!.cores[0]!.rules[0]!)), '/rules/shoyu-chintan:clean:form'],
    ['wrong rule parent', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.cores[0]!.rules[0]!, 'parentCoreId', 'miso:clean'), '/parentCoreId'],
    ['question ID', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.cores[0]!.rules[0]!, 'questionId', 'wrong-question'), '/questionId'],
    ['priority', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.cores[0]!.rules[0]!, 'priority', 99), '/priority'],
    ['target missing', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.cores[0]!.rules[0]!.targets.pop(), '/targets'],
    ['target extra', (model: Mutable<CompiledStyleModel>) => model.styles[0]!.cores[0]!.rules[0]!.targets.push(structuredClone(model.styles[0]!.cores[0]!.rules[0]!.targets[0]!)), '/targets'],
    ['tier', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.cores[0]!.rules[0]!.targets[0]!, 'tier', 'partial'), '/tier'],
    ['option', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.cores[0]!.rules[0]!.targets[0]!, 'optionId', 'wrong-option'), '/optionId'],
    ['hit representation', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.cores[0]!.rules[0]!.targets[0]!, 'tier', 'miss'), '/hitRepresentation'],
    ['miss representation', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.cores[0]!.rules[0]!, 'fallbackTier', 'partial'), '/missRepresentation'],
    ['target order', (model: Mutable<CompiledStyleModel>) => {
      const rule = model.styles
        .flatMap(({ cores }) => cores)
        .flatMap(({ rules }) => rules)
        .find(({ targets }) => targets.length > 1)!
      rule.targets.reverse()
    }, '/targets'],
  ])('rejects %s mismatch', (_label, mutate, pointer) => {
    const model = cloneCurrent()
    mutate(model)
    expectFailure(compare(model), pointer)
  })

  it('rejects legacy tier order drift', () => {
    const legacy = cloneLegacy()
    legacy.rules[0]!.tiers.reverse()
    expectFailure(compare(styleModel, legacy), '/tiers')
  })

  it('rejects rule order drift', () => {
    const model = cloneCurrent()
    model.styles[0]!.cores[0]!.rules.reverse()
    expectFailure(compare(model), '/orderedRuleIds')
  })

  it('rejects target priority drift', () => {
    const model = cloneCurrent()
    setField(model.styles[0]!.cores[0]!.rules[0]!.targets[0]!, 'priority', 99)
    expectFailure(compare(model), '/targets')
  })

  it('does not add an unsupported rule source-role comparison', () => {
    const model = cloneCurrent()
    setField(model.styles[0]!.cores[0]!.rules[0]!.provenance, 'inheritedFrom', 'changed')
    expect(compare(model).status).toBe('pass')
  })
})

describe('Task 15 closed bonus normalization', () => {
  it('proves exact 54-to-18 normalization', () => {
    expect(compare()).toMatchObject({
      status: 'pass',
      legacyBonusCopyCount: 54,
      bonusCount: 18,
    })
  })

  it.each([
    ['missing copy', (legacy: Mutable<LegacyStyleObservation>) => legacy.adjustments.splice(legacy.adjustments.findIndex((copy) => copy.kind === 'bonus' && copy.id === 'tonkotsu-core'), 1), '/adjustments/bonus/tonkotsu-core'],
    ['extra copy', (legacy: Mutable<LegacyStyleObservation>) => {
      const copy = structuredClone(legacy.adjustments.find((entry) => entry.kind === 'bonus' && entry.id === 'tonkotsu-core')!)
      copy.parentCoreId = 'tonkotsu:extra'
      legacy.adjustments.push(copy)
    }, '/adjustments/bonus/tonkotsu-core'],
    ['duplicate copy identity', (legacy: Mutable<LegacyStyleObservation>) => legacy.adjustments.push(structuredClone(legacy.adjustments.find((copy) => copy.kind === 'bonus' && copy.id === 'tonkotsu-core')!)), '/adjustmentCopies/'],
    ['copy priority disagreement', (legacy: Mutable<LegacyStyleObservation>) => {
      const copies = legacy.adjustments.filter((copy) => copy.kind === 'bonus' && copy.id === 'tonkotsu-core')
      copies[1]!.sourceOrdinal = 7
    }, '/priority'],
    ['operand disagreement', (legacy: Mutable<LegacyStyleObservation>) => {
      const copies = legacy.adjustments.filter((copy) => copy.kind === 'bonus' && copy.id === 'tonkotsu-core')
      if (copies[1]?.kind === 'bonus') copies[1].points += 1
    }, '/points'],
    ['condition disagreement', (legacy: Mutable<LegacyStyleObservation>) => {
      const copies = legacy.adjustments.filter((copy) => copy.kind === 'bonus' && copy.id === 'tonkotsu-core')
      if (copies[1]?.kind === 'bonus') copies[1].conditions[0]!.optionIds[0] = 'wrong-option'
    }, '/conditions'],
    ['source role disagreement', (legacy: Mutable<LegacyStyleObservation>) => {
      const copies = legacy.adjustments.filter((copy) => copy.kind === 'bonus' && copy.id === 'tonkotsu-core')
      setField(copies[1]!, 'sourceRole', 'core-conflict')
    }, '/sourceRole'],
    ['wrong style core', (legacy: Mutable<LegacyStyleObservation>) => {
      const copies = legacy.adjustments.filter((copy) => copy.kind === 'bonus' && copy.id === 'tonkotsu-core')
      copies[1]!.parentCoreId = 'miso:standard'
    }, '/appliesToCoreIds'],
    ['incomplete scope', (legacy: Mutable<LegacyStyleObservation>) => {
      const index = legacy.adjustments.findIndex((copy) => copy.kind === 'bonus' && copy.id === 'tonkotsu-core' && copy.parentCoreId.endsWith(':heavy'))
      legacy.adjustments.splice(index, 1)
    }, '/appliesToCoreIds'],
  ])('rejects bonus %s', (_label, mutate, pointer) => {
    const legacy = cloneLegacy()
    mutate(legacy)
    expectFailure(compare(styleModel, legacy), pointer)
  })

  it('rejects a bonus appliesToCoreIds mismatch', () => {
    const model = cloneCurrent()
    const bonus = model.styles.find(({ id }) => id === 'tonkotsu')!.adjustments[0]!
    bonus.appliesToCoreIds.reverse()
    expectFailure(compare(model), '/appliesToCoreIds')
  })

  it('rejects a missing current logical bonus', () => {
    const model = cloneCurrent()
    model.styles[0]!.adjustments.splice(0, 1)
    expectFailure(compare(model), '/adjustments/bonus/classic-shoyu')
  })

  it('rejects an extra current logical bonus', () => {
    const model = cloneCurrent()
    const extra = structuredClone(model.styles[0]!.adjustments[0]!)
    setField(extra, 'id', 'extra-bonus')
    setField(extra, 'priority', 99)
    model.styles[0]!.adjustments.push(extra)
    expectFailure(compare(model), '/adjustments/bonus/extra-bonus')
  })
})

describe('Task 15 closed conflict normalization', () => {
  it('proves exact 21-to-7 normalization', () => {
    expect(compare()).toMatchObject({
      status: 'pass',
      legacyConflictCopyCount: 21,
      conflictCount: 7,
    })
  })

  it.each([
    ['missing copy', (legacy: Mutable<LegacyStyleObservation>) => legacy.adjustments.splice(legacy.adjustments.findIndex((copy) => copy.kind === 'conflict' && copy.id === 'jiro-yuzu'), 1), '/adjustments/conflict/jiro-yuzu'],
    ['extra copy', (legacy: Mutable<LegacyStyleObservation>) => {
      const copy = structuredClone(legacy.adjustments.find((entry) => entry.kind === 'conflict' && entry.id === 'jiro-yuzu')!)
      copy.parentCoreId = 'jiro:extra'
      legacy.adjustments.push(copy)
    }, '/adjustments/conflict/jiro-yuzu'],
    ['duplicate copy identity', (legacy: Mutable<LegacyStyleObservation>) => legacy.adjustments.push(structuredClone(legacy.adjustments.find((copy) => copy.kind === 'conflict' && copy.id === 'jiro-yuzu')!)), '/adjustmentCopies/'],
    ['copy priority disagreement', (legacy: Mutable<LegacyStyleObservation>) => {
      const copies = legacy.adjustments.filter((copy) => copy.kind === 'conflict' && copy.id === 'jiro-yuzu')
      copies[1]!.sourceOrdinal = 7
    }, '/priority'],
    ['operand disagreement', (legacy: Mutable<LegacyStyleObservation>) => {
      const copies = legacy.adjustments.filter((copy) => copy.kind === 'conflict' && copy.id === 'jiro-yuzu')
      if (copies[1]?.kind === 'conflict') copies[1].penalty += 1
    }, '/penalty'],
    ['condition disagreement', (legacy: Mutable<LegacyStyleObservation>) => {
      const copies = legacy.adjustments.filter((copy) => copy.kind === 'conflict' && copy.id === 'jiro-yuzu')
      if (copies[1]?.kind === 'conflict') copies[1].whenAll[0]!.optionIds[0] = 'wrong-option'
    }, '/conditions'],
    ['source role disagreement', (legacy: Mutable<LegacyStyleObservation>) => {
      const copies = legacy.adjustments.filter((copy) => copy.kind === 'conflict' && copy.id === 'jiro-yuzu')
      setField(copies[1]!, 'sourceRole', 'core-bonus')
    }, '/sourceRole'],
    ['incomplete scope', (legacy: Mutable<LegacyStyleObservation>) => {
      const index = legacy.adjustments.findIndex((copy) => copy.kind === 'conflict' && copy.id === 'jiro-yuzu' && copy.parentCoreId.endsWith(':heavy'))
      legacy.adjustments.splice(index, 1)
    }, '/appliesToCoreIds'],
  ])('rejects conflict %s', (_label, mutate, pointer) => {
    const legacy = cloneLegacy()
    mutate(legacy)
    expectFailure(compare(styleModel, legacy), pointer)
  })

  it('rejects a conflict appliesToCoreIds mismatch', () => {
    const model = cloneCurrent()
    const conflict = model.styles.find(({ id }) => id === 'jiro')!.adjustments.find(({ kind }) => kind === 'conflict')!
    conflict.appliesToCoreIds.reverse()
    expectFailure(compare(model), '/appliesToCoreIds')
  })

  it('rejects missing and extra current logical conflicts', () => {
    const missing = cloneCurrent()
    const missingStyle = missing.styles.find(({ id }) => id === 'jiro')!
    missingStyle.adjustments.splice(missingStyle.adjustments.findIndex(({ kind }) => kind === 'conflict'), 1)
    expectFailure(compare(missing), '/adjustments/conflict/')

    const extra = cloneCurrent()
    const extraStyle = extra.styles.find(({ id }) => id === 'jiro')!
    const adjustment = structuredClone(extraStyle.adjustments.find(({ kind }) => kind === 'conflict')!)
    setField(adjustment, 'id', 'extra-conflict')
    setField(adjustment, 'priority', 99)
    extraStyle.adjustments.push(adjustment)
    expectFailure(compare(extra), '/adjustments/conflict/extra-conflict')
  })

  it('rejects bonus-after-conflict phase order', () => {
    const model = cloneCurrent()
    model.styles.find(({ id }) => id === 'jiro')!.adjustments.reverse()
    expectFailure(compare(model), '/orderedAdjustmentIds')
  })
})

describe('Task 15 adjustment conditions and inert operands', () => {
  it.each([
    ['condition question', (model: Mutable<CompiledStyleModel>) => {
      const adjustment = model.styles[0]!.adjustments[0]!
      if (adjustment.kind === 'bonus') {
        setField(adjustment.conditions[0]!, 'questionId', 'wrong-question')
      }
    }, '/questionId'],
    ['condition option', (model: Mutable<CompiledStyleModel>) => {
      const condition = model.styles
        .flatMap(({ adjustments }) => adjustments)
        .flatMap((adjustment) => adjustment.kind === 'bonus'
          ? adjustment.conditions
          : adjustment.whenAll)
        .find(({ optionIds }) => optionIds.length > 1)!
      condition.optionIds.reverse()
    }, '/optionIds'],
    ['condition priority', (model: Mutable<CompiledStyleModel>) => {
      const adjustment = model.styles[0]!.adjustments[0]!
      if (adjustment.kind === 'bonus') setField(adjustment.conditions[0]!, 'priority', 99)
    }, '/priority'],
    ['condition order', (model: Mutable<CompiledStyleModel>) => {
      const adjustment = model.styles[0]!.adjustments[0]!
      if (adjustment.kind === 'bonus') adjustment.conditions.reverse()
    }, '/conditions'],
    ['bonus operand', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.adjustments[0]!, 'points', 999), '/points'],
    ['minimum matches', (model: Mutable<CompiledStyleModel>) => setField(model.styles[0]!.adjustments[0]!, 'minMatches', 999), '/minMatches'],
  ])('rejects %s mismatch', (_label, mutate, pointer) => {
    const model = cloneCurrent()
    mutate(model)
    expectFailure(compare(model), pointer)
  })

  it('compares penalty as inert representation without executing it', () => {
    const model = cloneCurrent()
    const conflict = model.styles.find(({ id }) => id === 'jiro')!.adjustments.find(({ kind }) => kind === 'conflict')!
    setField(conflict, 'penalty', 999)
    expectFailure(compare(model), '/penalty')
  })

  it('compares current bonus priority to legacy sourceOrdinal', () => {
    const model = cloneCurrent()
    setField(model.styles[0]!.adjustments[0]!, 'priority', 99)
    expectFailure(compare(model), '/priority')
  })

  it('compares current conflict priority to legacy sourceOrdinal', () => {
    const model = cloneCurrent()
    const conflict = model.styles
      .flatMap(({ adjustments }) => adjustments)
      .find(({ kind }) => kind === 'conflict')!
    setField(conflict, 'priority', 99)
    expectFailure(compare(model), '/priority')
  })

  it('rejects legacy adjustment-copy order drift before normalization can pass', () => {
    const legacy = cloneLegacy()
    legacy.adjustments.reverse()
    expectFailure(compare(styleModel, legacy), '/orderedAdjustmentIds')
  })
})

describe('Task 15 deterministic bounded diagnostics', () => {
  it('uses deterministic JSON-pointer-like paths', () => {
    const model = cloneCurrent()
    setField(model.styles[0]!, 'family', 'dry')
    const failure = expectFailure(compare(model), '/styles/shoyu-chintan/family')
    expect(failure.mismatches[0]!.pointer).toMatch(/^\/(?:[a-zA-Z0-9:<>-]+\/)*[a-zA-Z0-9:<>-]+$/)
  })

  it('is independent of mutation application order', () => {
    const left = cloneCurrent()
    setField(left.styles[0]!, 'family', 'dry')
    setField(left.styles[1]!, 'accent', '#000000')
    const right = cloneCurrent()
    setField(right.styles[1]!, 'accent', '#000000')
    setField(right.styles[0]!, 'family', 'dry')
    expect(serializeStyleParityResult(compare(left))).toBe(
      serializeStyleParityResult(compare(right)),
    )
  })

  it('reports the exact total mismatch count for a scalar mutation', () => {
    const model = cloneCurrent()
    setField(model.styles[0]!, 'family', 'dry')
    expect(expectFailure(compare(model)).totalMismatchCount).toBe(1)
  })

  it('bounds displayed mismatches without hiding the total', () => {
    const model = cloneCurrent()
    for (const style of model.styles) {
      setField(style, 'family', 'wrong')
      setField(style, 'accent', '#000000')
    }
    const failure = expectFailure(compare(model))
    expect(failure.totalMismatchCount).toBeGreaterThan(failure.displayedMismatchCount)
    expect(failure.displayedMismatchCount).toBe(20)
    expect(failure.truncated).toBe(true)
    expect(serializeStyleParityResult(failure).length).toBeLessThan(12_000)
  })

  it('emits no stack or absolute path', () => {
    const model = cloneCurrent()
    setField(model.styles[0]!, 'family', '/Users/private/secret')
    const output = serializeStyleParityResult(compare(model))
    expect(output).not.toContain('stack')
    expect(output).not.toContain('/Users/')
    expect(output).not.toContain(repositoryRoot)
  })

  it('does not dump the frozen corpus or localized copy', () => {
    const model = cloneCurrent()
    setField(model.styles[0]!, 'family', 'dry')
    const output = serializeStyleParityResult(compare(model))
    expect(output).not.toContain(frozenObservation.styles[0]!.copySources[0]!.value)
    expect(output).not.toContain(JSON.stringify(frozenObservation))
  })

  it('does not repair mutated inputs', () => {
    const model = cloneCurrent()
    setField(model.styles[0]!, 'family', 'dry')
    compare(model)
    expect(model.styles[0]!.family).toBe('dry')
  })
})

describe('Task 15 truth boundary and CLI', () => {
  it('contains no scoring, flow, recommendation, eligibility, confidence, catalog, or Finder execution import', () => {
    const source = readFileSync(paritySourcePath, 'utf8')
    expect(source).not.toMatch(/from ['"].*(?:scoring|flow|recommend|catalog|finder)/i)
    expect(source).not.toMatch(/\bevaluateFlow\b|\bdecodeAnswerDraft\b/)
  })

  it('contains no legacy execution, fixture write, temporary artifact, or expected-divergence path', () => {
    const source = readFileSync(paritySourcePath, 'utf8')
    expect(source).not.toMatch(/writeFile|mkdtemp|tmpdir|expected-divergence/i)
    expect(source).not.toMatch(/legacy-instrumentation|runLegacy|extractor/)
  })

  it('defines the exact offline package script', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>
    }
    expect(packageJson.scripts?.['parity:styles']).toBe(
      'tsx tools/parity/styles/parity.ts',
    )
  })

  it('accepts exactly zero arguments', () => {
    expect(runStyleParity([], injectedDependencies()).status).toBe('pass')
  })

  it.each([
    ['unknown option', ['--style', 'tonkotsu']],
    ['extra positional argument', ['tonkotsu']],
  ])('rejects %s', (_label, arguments_) => {
    const result = runStyleParity(arguments_, injectedDependencies())
    const failure = expectFailure(result, '/arguments')
    expect(failure.mismatches[0]!.code).toBe('STYLE_PARITY_ARGUMENT_INVALID')
  })

  it('serializes bounded success JSON', () => {
    const output = serializeStyleParityResult(runStyleParity([], injectedDependencies()))
    expect(JSON.parse(output)).toMatchObject({ status: 'pass', styleCount: 18 })
    expect(output.length).toBeLessThan(2_000)
  })

  it('returns a non-pass result for CLI failure', () => {
    expect(runStyleParity(['unexpected'], injectedDependencies()).status).toBe('fail')
  })

  it('sets a non-zero process exit code and emits bounded stderr for CLI failure', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', parityCliPath, 'unexpected'],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr)).toMatchObject({
      status: 'fail',
      mismatches: [{ code: 'STYLE_PARITY_ARGUMENT_INVALID' }],
    })
    expect(result.stderr).not.toContain('stack')
  })

  it('sets a zero process exit code and emits bounded stdout for CLI success', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', parityCliPath],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'pass', styleCount: 18 })
    expect(result.stdout.length).toBeLessThan(2_000)
  })

  it('is byte-identical across repeated ordinary runs', () => {
    const first = serializeStyleParityResult(runStyleParity([], injectedDependencies()))
    const second = serializeStyleParityResult(runStyleParity([], injectedDependencies()))
    expect(second).toBe(first)
  })

  it('does not depend on unused legacy copy values during normalization', () => {
    const copies = findLegacyCopies('bonus', 'tonkotsu-core')
    expect(copies).toHaveLength(3)
    const legacy = cloneLegacy()
    for (const copy of legacy.adjustments) {
      copy.copySources[0]!.value = `${copy.parentCoreId} untranslated value ignored`
    }
    expect(compare(styleModel, legacy).status).toBe('pass')
  })
})
