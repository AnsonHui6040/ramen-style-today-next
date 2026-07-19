import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  CompiledAdjustment,
  CompiledAdjustmentCondition,
  CompiledStyleModel,
} from '@ramen-style/classification-core'
import { styleModel } from '@ramen-style/classification-core/generated/style-model'

import {
  legacyStyleObservationSchema,
  parseLegacyStyleRawCases,
  styleCopyRoleIds,
  type LegacyStyleAdjustmentObservation,
  type LegacyStyleObservation,
} from './contracts.js'
import {
  verifyCommittedStyleFixtures,
  type StyleFixtureVerificationResult,
} from './verify-fixtures.js'

const maximumDisplayedMismatches = 20
const maximumSummaryCodePoints = 160
const missingValue = '<missing>'
const tierOrder = ['exact', 'adjacent', 'partial', 'miss'] as const
const localHomePrefix = `/${['Users'].join('')}/`

export type StyleParityDiagnosticCode =
  | 'STYLE_PARITY_ARGUMENT_INVALID'
  | 'STYLE_PARITY_FIXTURE_INVALID'
  | 'STYLE_PARITY_INPUT_INVALID'
  | 'STYLE_PARITY_MISMATCH'

export interface StyleParityDiagnostic {
  readonly code: StyleParityDiagnosticCode
  readonly pointer: string
  readonly expected: string
  readonly received: string
}

interface StyleParityIdentity {
  readonly fixtureCasesHash: string
  readonly fixtureContentHash: string
  readonly manifestHash: string
  readonly semanticHash: string
  readonly dataVersion: string
}

export interface StyleParitySuccess extends StyleParityIdentity {
  readonly status: 'pass'
  readonly styleCount: 18
  readonly coreCount: 54
  readonly subtypeCount: 270
  readonly ruleCount: 378
  readonly bonusCount: 18
  readonly conflictCount: 7
  readonly legacyBonusCopyCount: 54
  readonly legacyConflictCopyCount: 21
  readonly exclusionTagCount: 6
  readonly copyRoleCount: 8
}

export interface StyleParityFailure extends StyleParityIdentity {
  readonly status: 'fail'
  readonly totalMismatchCount: number
  readonly displayedMismatchCount: number
  readonly truncated: boolean
  readonly mismatches: readonly StyleParityDiagnostic[]
}

export type StyleParityResult = StyleParitySuccess | StyleParityFailure

export interface CompareStyleParityInput {
  readonly currentModel: CompiledStyleModel
  readonly legacyObservation: LegacyStyleObservation
  readonly fixtureVerification: StyleFixtureVerificationResult
}

export interface StyleParityDependencies {
  readonly currentModel: CompiledStyleModel
  readonly verifyFixtures: () => StyleFixtureVerificationResult
  readonly loadLegacyObservation: () => LegacyStyleObservation
}

interface RawDiagnostic {
  readonly code: StyleParityDiagnosticCode
  readonly pointer: string
  readonly expected: unknown
  readonly received: unknown
}

interface ProjectedCondition {
  readonly priority: number
  readonly questionId: string
  readonly optionIds: readonly string[]
}

interface ProjectedRule {
  readonly id: string
  readonly parentStyleId: string
  readonly parentCoreId: string
  readonly questionId: string
  readonly priority: number
  readonly targets: readonly {
    readonly optionId: string
    readonly tier: string
    readonly priority: number
  }[]
  readonly tiers: readonly {
    readonly tier: string
    readonly targets: readonly {
      readonly optionId: string
      readonly priority: number
    }[]
  }[]
  readonly hitRepresentation: string
  readonly missRepresentation: string
}

interface ProjectedAdjustment {
  readonly id: string
  readonly parentStyleId: string
  readonly kind: 'bonus' | 'conflict'
  readonly phase: 'bonus' | 'conflict'
  readonly priority: number
  readonly points?: number
  readonly penalty?: number
  readonly minMatches?: number
  readonly conditions: readonly ProjectedCondition[]
  readonly appliesToCoreIds: readonly string[]
  readonly copyRole: string
}

interface StyleProjection {
  readonly coverage: {
    readonly styles: number
    readonly cores: number
    readonly subtypes: number
    readonly rules: number
    readonly bonuses: number
    readonly conflicts: number
    readonly exclusionTags: number
    readonly copyRoles: number
    readonly inventory: number
  }
  readonly orderedStyleIds: readonly string[]
  readonly orderedCoreIds: readonly string[]
  readonly orderedSubtypeIds: readonly string[]
  readonly orderedRuleIds: readonly string[]
  readonly orderedAdjustmentIds: readonly string[]
  readonly orderedExclusionTagIds: readonly string[]
  readonly orderedInventoryKeys: readonly string[]
  readonly styles: Readonly<Record<string, unknown>>
  readonly cores: Readonly<Record<string, unknown>>
  readonly subtypes: Readonly<Record<string, unknown>>
  readonly rules: Readonly<Record<string, ProjectedRule>>
  readonly adjustments: {
    readonly bonus: Readonly<Record<string, ProjectedAdjustment>>
    readonly conflict: Readonly<Record<string, ProjectedAdjustment>>
  }
  readonly exclusionTags: Readonly<Record<string, unknown>>
  readonly copyRoles: readonly {
    readonly id: string
    readonly priority: number
  }[]
  readonly inventory: Readonly<Record<string, unknown>>
}

function compareCodePoints(left: string, right: string) {
  const leftIterator = left[Symbol.iterator]()
  const rightIterator = right[Symbol.iterator]()
  while (true) {
    const leftResult = leftIterator.next()
    const rightResult = rightIterator.next()
    if (leftResult.done || rightResult.done) {
      if (leftResult.done === rightResult.done) return 0
      return leftResult.done ? -1 : 1
    }
    const difference = leftResult.value.codePointAt(0)! - rightResult.value.codePointAt(0)!
    if (difference !== 0) return difference
  }
}

function boundedText(value: string, limit = maximumSummaryCodePoints) {
  let result = ''
  let count = 0
  let pendingSpace = false
  for (const character of value) {
    if (count >= limit + 1) break
    const codePoint = character.codePointAt(0)!
    const isWhitespace = /\s/u.test(character)
    if (isWhitespace || codePoint < 32 || (codePoint >= 127 && codePoint <= 159)) {
      pendingSpace = result.length > 0
      continue
    }
    if (pendingSpace && count < limit) {
      result += ' '
      count += 1
      pendingSpace = false
    }
    if (count >= limit) break
    result += character
    count += 1
  }
  return result.trim()
}

function safeString(value: string) {
  if (
    /^(?:file:|\/|\\\\|[A-Za-z]:[\\/])/u.test(value)
    || value.includes(localHomePrefix)
  ) return '<redacted-path>'
  return boundedText(value)
}

function compactValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return safeString(value)
  if (typeof value === 'undefined') return '<undefined>'
  if (depth >= 2) return Array.isArray(value) ? '<array>' : '<object>'
  if (Array.isArray(value)) {
    const projected = value.slice(0, 5).map((child) => compactValue(child, depth + 1))
    if (value.length > projected.length) projected.push(`<${value.length - projected.length} more>`)
    return projected
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .sort(([left], [right]) => compareCodePoints(left, right))
      .slice(0, 6)
      .map(([key, child]) => [safeString(key), compactValue(child, depth + 1)])
    if (Object.keys(value).length > entries.length) entries.push(['<more>', '<object>'])
    return Object.fromEntries(entries)
  }
  return `<${typeof value}>`
}

function summarize(value: unknown) {
  const serialized = JSON.stringify(compactValue(value))
  return boundedText(serialized ?? String(value))
}

function safePointerSegment(value: string) {
  const stableId = /^[a-zA-Z0-9]+(?:(?:-|:)[a-zA-Z0-9]+)*$/u
  const inventoryKey = /^(?:style|intensity|noodle)\/[a-zA-Z0-9]+(?:(?:-|:)[a-zA-Z0-9]+)*$/u
  if (!stableId.test(value) && !inventoryKey.test(value)) return '<invalid-id>'
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function pointer(parent: string, segment: string | number) {
  const safeSegment = typeof segment === 'number'
    ? String(segment)
    : safePointerSegment(segment)
  return `${parent}/${safeSegment}`
}

function rawDiagnostic(
  diagnostics: RawDiagnostic[],
  path: string,
  expected: unknown,
  received: unknown,
  code: StyleParityDiagnosticCode = 'STYLE_PARITY_MISMATCH',
) {
  diagnostics.push({ code, pointer: path || '/', expected, received })
}

function identity(
  model: CompiledStyleModel,
  fixture?: StyleFixtureVerificationResult,
): StyleParityIdentity {
  return Object.freeze({
    fixtureCasesHash: fixture?.casesHash ?? 'unverified',
    fixtureContentHash: fixture?.fixtureContentHash ?? 'unverified',
    manifestHash: fixture?.manifestHash ?? 'unverified',
    semanticHash: model.metadata.semanticHash,
    dataVersion: model.metadata.dataVersion,
  })
}

function finalizeFailure(
  diagnostics: readonly RawDiagnostic[],
  model: CompiledStyleModel,
  fixture?: StyleFixtureVerificationResult,
): StyleParityFailure {
  const ordered = diagnostics
    .map((entry): StyleParityDiagnostic => Object.freeze({
      code: entry.code,
      pointer: entry.pointer,
      expected: summarize(entry.expected),
      received: summarize(entry.received),
    }))
    .sort((left, right) => (
      compareCodePoints(left.pointer, right.pointer)
      || compareCodePoints(left.code, right.code)
      || compareCodePoints(left.expected, right.expected)
      || compareCodePoints(left.received, right.received)
    ))
  const mismatches = Object.freeze(ordered.slice(0, maximumDisplayedMismatches))
  return Object.freeze({
    status: 'fail',
    ...identity(model, fixture),
    totalMismatchCount: ordered.length,
    displayedMismatchCount: mismatches.length,
    truncated: ordered.length > mismatches.length,
    mismatches,
  })
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodePoints(left, right))
        .map(([key, child]) => [key, stableValue(child)]),
    )
  }
  return value
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value))
}

function sameValue(left: unknown, right: unknown) {
  return stableJson(left) === stableJson(right)
}

function compareValues(
  expected: unknown,
  received: unknown,
  path: string,
  diagnostics: RawDiagnostic[],
): void {
  if (Object.is(expected, received)) return
  if (Array.isArray(expected) && Array.isArray(received)) {
    if (expected.length !== received.length) {
      rawDiagnostic(diagnostics, pointer(path, 'length'), expected.length, received.length)
    }
    const maximumLength = Math.max(expected.length, received.length)
    for (let index = 0; index < maximumLength; index += 1) {
      compareValues(
        index < expected.length ? expected[index] : missingValue,
        index < received.length ? received[index] : missingValue,
        pointer(path, index),
        diagnostics,
      )
    }
    return
  }
  if (
    expected && received
    && typeof expected === 'object' && typeof received === 'object'
    && !Array.isArray(expected) && !Array.isArray(received)
  ) {
    const expectedRecord = expected as Readonly<Record<string, unknown>>
    const receivedRecord = received as Readonly<Record<string, unknown>>
    const keys = [...new Set([
      ...Object.keys(expectedRecord),
      ...Object.keys(receivedRecord),
    ])].sort(compareCodePoints)
    for (const key of keys) {
      compareValues(
        Object.hasOwn(expectedRecord, key) ? expectedRecord[key] : missingValue,
        Object.hasOwn(receivedRecord, key) ? receivedRecord[key] : missingValue,
        pointer(path, key),
        diagnostics,
      )
    }
    return
  }
  rawDiagnostic(diagnostics, path || '/', expected, received)
}

function addUnique<Value>(
  record: Record<string, Value>,
  id: string,
  value: Value,
  path: string,
  diagnostics: RawDiagnostic[],
) {
  if (Object.hasOwn(record, id)) {
    rawDiagnostic(diagnostics, pointer(path, id), 'unique identity', 'duplicate identity')
    return
  }
  record[id] = value
}

function projectConditions(
  conditions: readonly CompiledAdjustmentCondition[] | readonly {
    readonly priority: number
    readonly questionId: string
    readonly optionIds: readonly string[]
  }[],
): readonly ProjectedCondition[] {
  return conditions.map(({ priority, questionId, optionIds }) => ({
    priority,
    questionId,
    optionIds: [...optionIds],
  }))
}

function projectCurrentAdjustment(
  adjustment: CompiledAdjustment,
  parentStyleId: string,
): ProjectedAdjustment {
  const hasLabelSlot = typeof adjustment.labelMessageId === 'string'
    && adjustment.labelMessageId.length > 0
  if (adjustment.kind === 'bonus') {
    return {
      id: adjustment.id,
      parentStyleId,
      kind: adjustment.kind,
      phase: adjustment.kind,
      priority: adjustment.priority,
      points: adjustment.points,
      minMatches: adjustment.minMatches,
      conditions: projectConditions(adjustment.conditions),
      appliesToCoreIds: [...adjustment.appliesToCoreIds],
      copyRole: hasLabelSlot ? 'bonus-reason' : 'missing-message-slot',
    }
  }
  return {
    id: adjustment.id,
    parentStyleId,
    kind: adjustment.kind,
    phase: adjustment.kind,
    priority: adjustment.priority,
    penalty: adjustment.penalty,
    conditions: projectConditions(adjustment.whenAll),
    appliesToCoreIds: [...adjustment.appliesToCoreIds],
    copyRole: hasLabelSlot ? 'conflict-reason' : 'missing-message-slot',
  }
}

function currentRuleProjection(rule: CompiledStyleModel['styles'][number]['cores'][number]['rules'][number]): ProjectedRule {
  const targets = rule.targets.map(({ optionId, tier, priority }) => ({
    optionId,
    tier: String(tier),
    priority,
  }))
  return {
    id: rule.id,
    parentStyleId: rule.parentStyleId,
    parentCoreId: rule.parentCoreId,
    questionId: rule.questionId,
    priority: rule.priority,
    targets,
    tiers: tierOrder.map((tier) => ({
      tier,
      targets: targets
        .filter((target) => target.tier === tier)
        .map(({ optionId, priority }) => ({ optionId, priority })),
    })),
    hitRepresentation: targets.some(({ tier }) => tier === 'miss')
      ? 'invalid-explicit-miss'
      : 'explicit-hits',
    missRepresentation: String(rule.fallbackTier) === 'miss'
      ? 'implicit-miss'
      : `invalid-${String(rule.fallbackTier)}`,
  }
}

function projectCurrentModel(
  model: CompiledStyleModel,
  diagnostics: RawDiagnostic[],
): StyleProjection {
  const styles: Record<string, unknown> = {}
  const cores: Record<string, unknown> = {}
  const subtypes: Record<string, unknown> = {}
  const rules: Record<string, ProjectedRule> = {}
  const bonuses: Record<string, ProjectedAdjustment> = {}
  const conflicts: Record<string, ProjectedAdjustment> = {}
  const exclusionTags: Record<string, unknown> = {}
  const inventory: Record<string, unknown> = {}
  const orderedCoreIds: string[] = []
  const orderedSubtypeIds: string[] = []
  const orderedRuleIds: string[] = []
  const orderedAdjustmentIds: string[] = []
  const observedCopyRoles = new Set<string>()

  for (const style of model.styles) {
    const styleCoreIds = style.cores.map(({ id }) => id)
    const styleSubtypeIds = style.cores.flatMap((core) => core.subtypes.map(({ id }) => id))
    const styleAdjustmentIds = style.adjustments.map(({ kind, id }) => `${kind}:${id}`)
    const styleCopyRoles: string[] = []
    if (typeof style.messageIds.label === 'string' && style.messageIds.label.length > 0) {
      styleCopyRoles.push('style-label')
      observedCopyRoles.add('style-label')
    }
    if (typeof style.messageIds.summary === 'string' && style.messageIds.summary.length > 0) {
      styleCopyRoles.push('style-summary')
      observedCopyRoles.add('style-summary')
    }
    addUnique(styles, style.id, {
      id: style.id,
      family: style.family,
      displayPriority: style.displayPriority,
      accent: style.accent,
      supportedIntensityIds: [...style.supportedIntensityIds],
      supportedNoodleIds: [...style.supportedNoodleIds],
      orderedCoreIds: styleCoreIds,
      orderedSubtypeIds: styleSubtypeIds,
      orderedAdjustmentIds: styleAdjustmentIds,
      exclusionTagIds: [...style.exclusionTags],
      copyRoles: styleCopyRoles,
    }, '/styles', diagnostics)
    orderedCoreIds.push(...styleCoreIds)
    orderedSubtypeIds.push(...styleSubtypeIds)
    orderedAdjustmentIds.push(...styleAdjustmentIds)

    for (const core of style.cores) {
      const coreCopyRoles: string[] = []
      if (typeof core.messageIds.labelTemplate === 'string' && core.messageIds.labelTemplate.length > 0) {
        coreCopyRoles.push('core-label')
        observedCopyRoles.add('core-label')
      }
      if (typeof core.messageIds.summaryTemplate === 'string' && core.messageIds.summaryTemplate.length > 0) {
        coreCopyRoles.push('core-summary')
        observedCopyRoles.add('core-summary')
      }
      const coreRuleIds = core.rules.map(({ id }) => id)
      addUnique(cores, core.id, {
        id: core.id,
        parentStyleId: core.parentStyleId,
        intensityId: core.intensityId,
        priority: core.priority,
        orderedRuleIds: coreRuleIds,
        copyRoles: coreCopyRoles,
      }, '/cores', diagnostics)
      orderedRuleIds.push(...coreRuleIds)

      for (const subtype of core.subtypes) {
        const subtypeCopyRoles: string[] = []
        if (
          typeof subtype.messageIds.labelTemplate === 'string'
          && subtype.messageIds.labelTemplate.length > 0
        ) {
          subtypeCopyRoles.push('subtype-label')
          observedCopyRoles.add('subtype-label')
        }
        if (
          typeof subtype.messageIds.summaryTemplate === 'string'
          && subtype.messageIds.summaryTemplate.length > 0
        ) {
          subtypeCopyRoles.push('subtype-summary')
          observedCopyRoles.add('subtype-summary')
        }
        addUnique(subtypes, subtype.id, {
          id: subtype.id,
          parentStyleId: subtype.parentStyleId,
          parentCoreId: subtype.parentCoreId,
          noodleId: subtype.noodleId,
          priority: subtype.priority,
          copyRoles: subtypeCopyRoles,
        }, '/subtypes', diagnostics)
      }
      for (const rule of core.rules) {
        addUnique(rules, rule.id, currentRuleProjection(rule), '/rules', diagnostics)
      }
    }

    for (const adjustment of style.adjustments) {
      const projected = projectCurrentAdjustment(adjustment, style.id)
      if (adjustment.kind === 'bonus') {
        if (projected.copyRole === 'bonus-reason') observedCopyRoles.add('bonus-reason')
        addUnique(bonuses, adjustment.id, projected, '/adjustments/bonus', diagnostics)
      } else {
        if (projected.copyRole === 'conflict-reason') observedCopyRoles.add('conflict-reason')
        addUnique(conflicts, adjustment.id, projected, '/adjustments/conflict', diagnostics)
      }
    }
  }

  for (const tag of model.exclusionTags) {
    if (String(tag.questionId) !== 'exclusions') {
      rawDiagnostic(
        diagnostics,
        `/current/exclusionTags/${safePointerSegment(tag.id)}/questionId`,
        'exclusions',
        tag.questionId,
        'STYLE_PARITY_INPUT_INVALID',
      )
    }
    if (tag.optionId !== tag.id) {
      rawDiagnostic(
        diagnostics,
        `/current/exclusionTags/${safePointerSegment(tag.id)}/optionId`,
        tag.id,
        tag.optionId,
        'STYLE_PARITY_INPUT_INVALID',
      )
    }
    addUnique(exclusionTags, tag.id, {
      id: tag.id,
      priority: tag.priority,
    }, '/exclusionTags', diagnostics)
  }
  for (const record of model.inventory) {
    addUnique(inventory, record.key, {
      key: record.key,
      kind: record.kind,
      id: record.id,
    }, '/inventory', diagnostics)
  }
  const copyRoles = styleCopyRoleIds
    .filter((id) => observedCopyRoles.has(id))
    .map((id, priority) => ({ id, priority }))
  return {
    coverage: {
      styles: Object.keys(styles).length,
      cores: Object.keys(cores).length,
      subtypes: Object.keys(subtypes).length,
      rules: Object.keys(rules).length,
      bonuses: Object.keys(bonuses).length,
      conflicts: Object.keys(conflicts).length,
      exclusionTags: Object.keys(exclusionTags).length,
      copyRoles: copyRoles.length,
      inventory: Object.keys(inventory).length,
    },
    orderedStyleIds: model.styles.map(({ id }) => id),
    orderedCoreIds,
    orderedSubtypeIds,
    orderedRuleIds,
    orderedAdjustmentIds,
    orderedExclusionTagIds: model.exclusionTags.map(({ id }) => id),
    orderedInventoryKeys: model.inventory.map(({ key }) => key),
    styles,
    cores,
    subtypes,
    rules,
    adjustments: { bonus: bonuses, conflict: conflicts },
    exclusionTags,
    copyRoles,
    inventory,
  }
}

function legacyRuleProjection(
  rule: LegacyStyleObservation['rules'][number],
): ProjectedRule {
  const targets = rule.tiers.flatMap(({ tier, targets: tierTargets }) => (
    tierTargets.map(({ optionId, priority }) => ({ optionId, tier, priority }))
  )).sort((left, right) => (
    left.priority - right.priority || compareCodePoints(left.optionId, right.optionId)
  ))
  const missIndex = rule.tiers.findIndex(({ tier }) => tier === 'miss')
  const missTier = rule.tiers[missIndex]
  return {
    id: rule.id,
    parentStyleId: rule.parentStyleId,
    parentCoreId: rule.parentCoreId,
    questionId: rule.questionId,
    priority: rule.priority,
    targets,
    tiers: rule.tiers.map(({ tier, targets: tierTargets }) => ({
      tier,
      targets: tierTargets.map(({ optionId, priority }) => ({ optionId, priority })),
    })),
    hitRepresentation: targets.some(({ tier }) => tier === 'miss')
      ? 'invalid-explicit-miss'
      : 'explicit-hits',
    missRepresentation: missIndex === rule.tiers.length - 1
      && missTier?.targets.length === 0
      ? 'implicit-miss'
      : 'invalid-miss',
  }
}

function adjustmentCopyIdentity(copy: LegacyStyleAdjustmentObservation) {
  return [
    copy.kind,
    copy.id,
    copy.parentCoreId,
    copy.sourceRole,
    copy.sourceOrdinal,
  ].join(':')
}

function projectedLegacyCopy(copy: LegacyStyleAdjustmentObservation) {
  if (copy.kind === 'bonus') {
    return {
      id: copy.id,
      kind: copy.kind,
      phase: copy.kind,
      priority: copy.sourceOrdinal,
      points: copy.points,
      minMatches: copy.minMatches,
      conditions: projectConditions(copy.conditions),
      sourceRole: copy.sourceRole,
      copyRole: copy.copySources.map(({ role }) => role),
    }
  }
  return {
    id: copy.id,
    kind: copy.kind,
    phase: copy.kind,
    priority: copy.sourceOrdinal,
    penalty: copy.penalty,
    conditions: projectConditions(copy.whenAll),
    sourceRole: copy.sourceRole,
    copyRole: copy.copySources.map(({ role }) => role),
  }
}

function fieldVariants(
  copies: readonly LegacyStyleAdjustmentObservation[],
  select: (copy: LegacyStyleAdjustmentObservation) => unknown,
) {
  return new Set(copies.map((copy) => stableJson(select(copy))))
}

function normalizeLegacyAdjustments(
  observation: LegacyStyleObservation,
  coreIdsByStyle: ReadonlyMap<string, readonly string[]>,
  diagnostics: RawDiagnostic[],
) {
  const groups = new Map<string, LegacyStyleAdjustmentObservation[]>()
  const seenCopies = new Set<string>()
  for (const copy of observation.adjustments) {
    const copyIdentity = adjustmentCopyIdentity(copy)
    if (seenCopies.has(copyIdentity)) {
      rawDiagnostic(
        diagnostics,
        pointer('/adjustmentCopies', copyIdentity),
        'unique copy identity',
        'duplicate copy identity',
      )
    }
    seenCopies.add(copyIdentity)
    const logicalIdentity = `${copy.kind}:${copy.id}`
    const copies = groups.get(logicalIdentity) ?? []
    copies.push(copy)
    groups.set(logicalIdentity, copies)
  }

  const bonus: Record<string, ProjectedAdjustment> = {}
  const conflict: Record<string, ProjectedAdjustment> = {}
  const orderedIds: string[] = []
  for (const [logicalIdentity, copies] of groups) {
    const kind = copies[0]!.kind
    const id = copies[0]!.id
    const basePath = `/adjustments/${kind}/${safePointerSegment(id)}`
    let valid = true
    if (copies.length !== 3) {
      rawDiagnostic(diagnostics, pointer(basePath, 'copies'), 3, copies.length)
      valid = false
    }
    const parentStyleIds = [...new Set(copies.map(({ parentStyleId }) => parentStyleId))]
    if (parentStyleIds.length !== 1) {
      rawDiagnostic(
        diagnostics,
        pointer(basePath, 'parentStyleId'),
        'one shared parent style',
        parentStyleIds,
      )
      valid = false
    }
    const expectedCoreIds = parentStyleIds.length === 1
      ? coreIdsByStyle.get(parentStyleIds[0]!) ?? []
      : []
    const receivedCoreIds = copies.map(({ parentCoreId }) => parentCoreId)
    if (!sameValue(expectedCoreIds, receivedCoreIds)) {
      rawDiagnostic(
        diagnostics,
        pointer(basePath, 'appliesToCoreIds'),
        expectedCoreIds,
        receivedCoreIds,
      )
      valid = false
    }
    const fields = kind === 'bonus'
      ? ['priority', 'points', 'minMatches', 'conditions', 'sourceRole', 'copyRole'] as const
      : ['priority', 'penalty', 'conditions', 'sourceRole', 'copyRole'] as const
    for (const field of fields) {
      const variants = fieldVariants(copies, (copy) => projectedLegacyCopy(copy)[field])
      if (variants.size !== 1) {
        rawDiagnostic(
          diagnostics,
          pointer(basePath, field === 'copyRole' ? 'copyRole' : field),
          'all copies identical',
          `${variants.size} variants`,
        )
        valid = false
      }
    }
    const expectedSourceRole = kind === 'bonus' ? 'core-bonus' : 'core-conflict'
    if (copies.some(({ sourceRole }) => sourceRole !== expectedSourceRole)) {
      rawDiagnostic(
        diagnostics,
        pointer(basePath, 'sourceRole'),
        expectedSourceRole,
        [...new Set(copies.map(({ sourceRole }) => sourceRole))],
      )
      valid = false
    }
    const expectedCopyRole = kind === 'bonus' ? 'bonus-reason' : 'conflict-reason'
    if (copies.some((copy) => (
      copy.copySources.length !== 1 || copy.copySources[0]?.role !== expectedCopyRole
    ))) {
      rawDiagnostic(
        diagnostics,
        pointer(basePath, 'copyRole'),
        expectedCopyRole,
        copies.map((copy) => copy.copySources.map(({ role }) => role)),
      )
      valid = false
    }
    if (!valid) continue

    const sourceCopy = copies[0]!
    const projected: ProjectedAdjustment = sourceCopy.kind === 'bonus'
      ? {
          id,
          parentStyleId: parentStyleIds[0]!,
          kind: sourceCopy.kind,
          phase: sourceCopy.kind,
          priority: sourceCopy.sourceOrdinal,
          points: sourceCopy.points,
          minMatches: sourceCopy.minMatches,
          conditions: projectConditions(sourceCopy.conditions),
          appliesToCoreIds: receivedCoreIds,
          copyRole: 'bonus-reason',
        }
      : {
          id,
          parentStyleId: parentStyleIds[0]!,
          kind: sourceCopy.kind,
          phase: sourceCopy.kind,
          priority: sourceCopy.sourceOrdinal,
          penalty: sourceCopy.penalty,
          conditions: projectConditions(sourceCopy.whenAll),
          appliesToCoreIds: receivedCoreIds,
          copyRole: 'conflict-reason',
        }
    if (kind === 'bonus') addUnique(bonus, id, projected, '/adjustments/bonus', diagnostics)
    else addUnique(conflict, id, projected, '/adjustments/conflict', diagnostics)
    orderedIds.push(logicalIdentity)
  }
  return { bonus, conflict, orderedIds }
}

function projectLegacyObservation(
  observation: LegacyStyleObservation,
  diagnostics: RawDiagnostic[],
): StyleProjection {
  const styles: Record<string, unknown> = {}
  const cores: Record<string, unknown> = {}
  const subtypes: Record<string, unknown> = {}
  const rules: Record<string, ProjectedRule> = {}
  const exclusionTags: Record<string, unknown> = {}
  const inventory: Record<string, unknown> = {}
  const coreIdsByStyle = new Map<string, readonly string[]>()

  for (const style of observation.styles) {
    const styleCores = observation.cores.filter(({ parentStyleId }) => parentStyleId === style.id)
    const styleSubtypes = observation.subtypes.filter(({ parentStyleId }) => parentStyleId === style.id)
    const supportedIntensityIds = styleCores.map(({ intensityId }) => intensityId)
    const supportedNoodleIds = styleSubtypes
      .map(({ noodleId }) => noodleId)
      .filter((id, index, values) => values.indexOf(id) === index)
    const styleCoreIds = styleCores.map(({ id }) => id)
    coreIdsByStyle.set(style.id, styleCoreIds)
    addUnique(styles, style.id, {
      id: style.id,
      family: style.family,
      displayPriority: style.displayPriority,
      accent: style.accent,
      supportedIntensityIds,
      supportedNoodleIds,
      orderedCoreIds: styleCoreIds,
      orderedSubtypeIds: styleSubtypes.map(({ id }) => id),
      orderedAdjustmentIds: [] as string[],
      exclusionTagIds: [...style.exclusionTagIds],
      copyRoles: style.copySources.map(({ role }) => role),
    }, '/styles', diagnostics)
  }
  for (const core of observation.cores) {
    addUnique(cores, core.id, {
      id: core.id,
      parentStyleId: core.parentStyleId,
      intensityId: core.intensityId,
      priority: core.priority,
      orderedRuleIds: observation.rules
        .filter(({ parentCoreId }) => parentCoreId === core.id)
        .map(({ id }) => id),
      copyRoles: core.copySources.map(({ role }) => role),
    }, '/cores', diagnostics)
  }
  for (const subtype of observation.subtypes) {
    addUnique(subtypes, subtype.id, {
      id: subtype.id,
      parentStyleId: subtype.parentStyleId,
      parentCoreId: subtype.parentCoreId,
      noodleId: subtype.noodleId,
      priority: subtype.priority,
      copyRoles: subtype.copySources.map(({ role }) => role),
    }, '/subtypes', diagnostics)
  }
  for (const rule of observation.rules) {
    addUnique(rules, rule.id, legacyRuleProjection(rule), '/rules', diagnostics)
  }
  const normalized = normalizeLegacyAdjustments(observation, coreIdsByStyle, diagnostics)
  for (const [kind, adjustments] of Object.entries({
    bonus: normalized.bonus,
    conflict: normalized.conflict,
  }) as ['bonus' | 'conflict', Record<string, ProjectedAdjustment>][]) {
    for (const adjustment of Object.values(adjustments)) {
      const style = styles[adjustment.parentStyleId] as { orderedAdjustmentIds: string[] } | undefined
      style?.orderedAdjustmentIds.push(`${kind}:${adjustment.id}`)
    }
  }
  for (const tag of observation.exclusionTags) {
    addUnique(exclusionTags, tag.id, {
      id: tag.id,
      priority: tag.priority,
    }, '/exclusionTags', diagnostics)
  }
  const inventoryRecords = [
    ...observation.styles.map(({ id }) => ({ key: `style/${id}`, kind: 'style', id })),
    ...observation.cores.map(({ id }) => ({ key: `intensity/${id}`, kind: 'intensity', id })),
    ...observation.subtypes.map(({ id }) => ({ key: `noodle/${id}`, kind: 'noodle', id })),
  ].sort((left, right) => compareCodePoints(left.key, right.key))
  for (const record of inventoryRecords) {
    addUnique(inventory, record.key, record, '/inventory', diagnostics)
  }
  return {
    coverage: {
      styles: Object.keys(styles).length,
      cores: Object.keys(cores).length,
      subtypes: Object.keys(subtypes).length,
      rules: Object.keys(rules).length,
      bonuses: Object.keys(normalized.bonus).length,
      conflicts: Object.keys(normalized.conflict).length,
      exclusionTags: Object.keys(exclusionTags).length,
      copyRoles: observation.copyRoles.length,
      inventory: Object.keys(inventory).length,
    },
    orderedStyleIds: observation.styles.map(({ id }) => id),
    orderedCoreIds: observation.cores.map(({ id }) => id),
    orderedSubtypeIds: observation.subtypes.map(({ id }) => id),
    orderedRuleIds: observation.rules.map(({ id }) => id),
    orderedAdjustmentIds: normalized.orderedIds,
    orderedExclusionTagIds: observation.exclusionTags.map(({ id }) => id),
    orderedInventoryKeys: inventoryRecords.map(({ key }) => key),
    styles,
    cores,
    subtypes,
    rules,
    adjustments: { bonus: normalized.bonus, conflict: normalized.conflict },
    exclusionTags,
    copyRoles: observation.copyRoles.map(({ id, priority }) => ({ id, priority })),
    inventory,
  }
}

export function compareStyleParity({
  currentModel,
  legacyObservation,
  fixtureVerification,
}: CompareStyleParityInput): StyleParityResult {
  const diagnostics: RawDiagnostic[] = []
  const expected = projectLegacyObservation(legacyObservation, diagnostics)
  const received = projectCurrentModel(currentModel, diagnostics)
  compareValues(expected, received, '', diagnostics)
  if (diagnostics.length > 0) {
    return finalizeFailure(diagnostics, currentModel, fixtureVerification)
  }
  return Object.freeze({
    status: 'pass',
    ...identity(currentModel, fixtureVerification),
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
}

const fixtureCasesPath = fileURLToPath(
  new URL('../fixtures/styles/legacy-v1/cases.json', import.meta.url),
)

function loadCommittedLegacyObservation() {
  const envelope = JSON.parse(readFileSync(fixtureCasesPath, 'utf8')) as unknown
  const cases = parseLegacyStyleRawCases(envelope)
  if (cases.length !== 1 || !cases[0]) throw new Error('style cases are invalid')
  return legacyStyleObservationSchema.parse(cases[0])
}

const defaultDependencies: StyleParityDependencies = {
  currentModel: styleModel,
  verifyFixtures: verifyCommittedStyleFixtures,
  loadLegacyObservation: loadCommittedLegacyObservation,
}

function fixtureFailurePointer(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('style cases') || message.includes('style case bytes')) {
    return '/fixture/cases'
  }
  if (message.includes('style manifest')) return '/fixture/manifest'
  return '/fixture'
}

export function runStyleParity(
  arguments_: readonly string[] = [],
  dependencies: StyleParityDependencies = defaultDependencies,
): StyleParityResult {
  if (arguments_.length !== 0) {
    return finalizeFailure([{
      code: 'STYLE_PARITY_ARGUMENT_INVALID',
      pointer: '/arguments',
      expected: 'zero arguments',
      received: `${arguments_.length} arguments`,
    }], dependencies.currentModel)
  }
  let fixtureVerification: StyleFixtureVerificationResult
  try {
    fixtureVerification = dependencies.verifyFixtures()
  } catch (error) {
    return finalizeFailure([{
      code: 'STYLE_PARITY_FIXTURE_INVALID',
      pointer: fixtureFailurePointer(error),
      expected: 'verified committed fixture',
      received: 'fixture verification failed',
    }], dependencies.currentModel)
  }
  let legacyObservation: LegacyStyleObservation
  try {
    legacyObservation = dependencies.loadLegacyObservation()
  } catch {
    return finalizeFailure([{
      code: 'STYLE_PARITY_FIXTURE_INVALID',
      pointer: '/fixture/cases',
      expected: 'one verified legacy observation',
      received: 'fixture loading failed',
    }], dependencies.currentModel, fixtureVerification)
  }
  try {
    return compareStyleParity({
      currentModel: dependencies.currentModel,
      legacyObservation,
      fixtureVerification,
    })
  } catch {
    return finalizeFailure([{
      code: 'STYLE_PARITY_INPUT_INVALID',
      pointer: '/projection',
      expected: 'bounded inert style inputs',
      received: 'projection failed',
    }], dependencies.currentModel, fixtureVerification)
  }
}

export function serializeStyleParityResult(result: StyleParityResult) {
  return `${JSON.stringify(result)}\n`
}

export function main(arguments_: readonly string[]) {
  const result = runStyleParity(arguments_)
  const output = serializeStyleParityResult(result)
  if (result.status === 'pass') process.stdout.write(output)
  else {
    process.stderr.write(output)
    process.exitCode = 1
  }
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
