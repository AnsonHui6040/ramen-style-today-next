import { createHash } from 'node:crypto'

import { z } from 'zod'

export const legacyStyleObservationSchemaVersion = 1 as const
export const styleFixtureSchemaVersion = 1 as const
export const styleExtractorVersion = 1 as const
export const styleInstrumentationVersion = 1 as const
export const legacyStyleRepositoryIdentity = {
  host: 'github.com',
  owner: 'AnsonHui6040',
  repository: 'ramen-style-today',
  commit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  treeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
} as const
export const styleLegacyLockfileHash =
  'be7ff42d1012d310916d38c082f63f8b5263981c6bd2ded2ff0f6dabe7fc29d2' as const
export const styleExtractionNodeVersion = '24.14.0' as const
export const styleInstalledLockfileHash =
  'b2cfca89d746d1605cc9d14de89b896866b73581ce83f212669b28e1c447cd6e' as const
export const styleDependencyTreeHash =
  'edbb010c241e278706dc2c0ee44b4f25f03c7423303f19eb23bbeb0f26203826' as const
export const styleInstrumentationHash =
  '8565602601ef24b9f70ca34d2683a33933e0f8c4522a3374e53290dad567d516' as const
export const styleSeedsHash =
  'b405c8866a2909e07201f3003865ff2f296e83a43cc1ca3c6d05f8eb79735f68' as const
export const legacyStyleTrackedSourceCount = 66 as const
export const legacyStyleTrackedSourceHashesHash =
  '620205eb20d687bc750973d97b6877018d1ea9fb62e591f7bac1eadd22e1084a' as const

export const styleCopyRoleIds = [
  'style-label',
  'style-summary',
  'core-label',
  'core-summary',
  'subtype-label',
  'subtype-summary',
  'bonus-reason',
  'conflict-reason',
] as const

export type StyleCopyRole = (typeof styleCopyRoleIds)[number]
export type LegacyMatchTier = 'exact' | 'adjacent' | 'partial' | 'miss'

const tierIds = ['exact', 'adjacent', 'partial', 'miss'] as const
const styleCopyRolePriority = new Map(
  styleCopyRoleIds.map((role, priority) => [role, priority]),
)
const tierPriority = new Map(tierIds.map((tier, priority) => [tier, priority]))
const optionIdsByQuestion = {
  form: ['soup', 'tsukemen', 'dry'],
  archetype: [
    'chintan',
    'paitan',
    'konbusui-light',
    'gyokai-rich',
    'miso-rich',
    'tsukemen-other',
    'aburasoba',
    'taiwan-mazesoba',
    'soupless-tantan',
    'dry-other',
  ],
  tare: ['shoyu', 'shio', 'miso', 'spicy-sesame', 'none'],
  source: [
    'pork',
    'chicken',
    'duck',
    'beef',
    'fish-seafood',
    'shellfish',
    'shrimp-crab',
    'vegetable',
    'mixed',
    'unsure',
  ],
  body: ['light', 'balanced', 'rich', 'backfat-heavy', 'ultra-heavy'],
  noodle: [
    'thin-straight',
    'medium-thin-straight',
    'medium-thick-straight',
    'medium-thick-wavy',
    'extra-thick',
  ],
  signature: [
    'nori-spinach',
    'corn-butter',
    'bean-sprout-garlic-backfat',
    'fish-kombu',
    'yuzu-citrus',
    'no-preference',
  ],
} as const
const optionPriorityByQuestion: ReadonlyMap<string, ReadonlyMap<string, number>> = new Map(
  Object.entries(optionIdsByQuestion).map(
  ([questionId, optionIds]) => [
    questionId,
    new Map<string, number>(optionIds.map((optionId, priority) => [optionId, priority])),
  ],
  ),
)
const stableIdSchema = z.string()
  .min(1)
  .max(240)
  .regex(/^[a-z0-9]+(?:(?:-|:)[a-z0-9]+)*$/)
const repositoryPathSchema = z.string().min(1).max(512).refine((value) => (
  !value.startsWith('/')
    && !value.includes('\\')
    && value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
), 'expected a repository-relative path')
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const prioritySchema = z.number().int().nonnegative().max(10_000)
const copyValueSchema = z.string().min(1).max(8_192)

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
  return `${JSON.stringify(stableValue(value), null, 2)}\n`
}

export function computeLegacyStyleTrackedSourceHashesHash(
  hashes: Readonly<Record<string, string>>,
) {
  return createHash('sha256')
    .update('ramen-legacy-style-tracked-sources-v1\0')
    .update(stableJson(hashes))
    .digest('hex')
}

function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>()
  const freeze = (current: unknown): void => {
    if (!current || typeof current !== 'object' || seen.has(current)) return
    seen.add(current)
    for (const child of Object.values(current)) freeze(child)
    Object.freeze(current)
  }
  freeze(value)
  return value
}

const copySourceSchema = z.strictObject({
  role: z.enum(styleCopyRoleIds),
  value: copyValueSchema,
})

const styleObservationSchema = z.strictObject({
  id: stableIdSchema,
  family: z.enum(['soup', 'tsukemen', 'dry']),
  displayPriority: prioritySchema,
  accent: z.string().regex(/^#[a-f0-9]{6}$/),
  exclusionTagIds: z.array(stableIdSchema).max(32),
  copySources: z.tuple([
    copySourceSchema.extend({ role: z.literal('style-label') }),
    copySourceSchema.extend({ role: z.literal('style-summary') }),
  ]),
})

const coreObservationSchema = z.strictObject({
  id: stableIdSchema,
  parentStyleId: stableIdSchema,
  intensityId: z.enum(['clean', 'standard', 'heavy']),
  priority: prioritySchema,
  copySources: z.tuple([
    copySourceSchema.extend({ role: z.literal('core-label') }),
    copySourceSchema.extend({ role: z.literal('core-summary') }),
  ]),
})

const subtypeObservationSchema = z.strictObject({
  id: stableIdSchema,
  parentStyleId: stableIdSchema,
  parentCoreId: stableIdSchema,
  noodleId: z.enum([
    'thin-straight',
    'medium-thin-straight',
    'medium-thick-straight',
    'medium-thick-wavy',
    'extra-thick',
  ]),
  priority: prioritySchema,
  copySources: z.tuple([
    copySourceSchema.extend({ role: z.literal('subtype-label') }),
    copySourceSchema.extend({ role: z.literal('subtype-summary') }),
  ]),
})

const ruleTierSchema = z.strictObject({
  tier: z.enum(tierIds),
  targets: z.array(z.strictObject({
    optionId: stableIdSchema,
    priority: prioritySchema,
  })).max(256),
})

const ruleObservationSchema = z.strictObject({
  id: stableIdSchema,
  parentStyleId: stableIdSchema,
  parentCoreId: stableIdSchema,
  questionId: stableIdSchema,
  priority: prioritySchema,
  tiers: z.array(ruleTierSchema).length(tierIds.length),
})

const adjustmentConditionSchema = z.strictObject({
  priority: prioritySchema,
  questionId: stableIdSchema,
  optionIds: z.array(stableIdSchema).min(1).max(256),
})

const adjustmentBase = {
  id: stableIdSchema,
  parentStyleId: stableIdSchema,
  parentCoreId: stableIdSchema,
  sourceOrdinal: prioritySchema,
} as const

const bonusObservationSchema = z.strictObject({
  kind: z.literal('bonus'),
  ...adjustmentBase,
  sourceRole: z.literal('core-bonus'),
  points: z.number().finite().nonnegative(),
  minMatches: z.number().int().positive().max(256),
  conditions: z.array(adjustmentConditionSchema).min(1).max(256),
  copySources: z.tuple([
    copySourceSchema.extend({ role: z.literal('bonus-reason') }),
  ]),
})

const conflictObservationSchema = z.strictObject({
  kind: z.literal('conflict'),
  ...adjustmentBase,
  sourceRole: z.literal('core-conflict'),
  penalty: z.number().finite().nonnegative(),
  whenAll: z.array(adjustmentConditionSchema).min(1).max(256),
  copySources: z.tuple([
    copySourceSchema.extend({ role: z.literal('conflict-reason') }),
  ]),
})

const adjustmentObservationSchema = z.discriminatedUnion('kind', [
  bonusObservationSchema,
  conflictObservationSchema,
])

const exclusionTagObservationSchema = z.strictObject({
  id: stableIdSchema,
  priority: prioritySchema,
})

const copyRoleObservationSchema = z.strictObject({
  id: z.enum(styleCopyRoleIds),
  priority: prioritySchema,
})

const coverageSchema = z.strictObject({
  styles: z.number().int().positive().max(1_024),
  cores: z.number().int().positive().max(4_096),
  subtypes: z.number().int().positive().max(16_384),
  rules: z.number().int().positive().max(16_384),
  bonusCopies: z.number().int().nonnegative().max(4_096),
  conflictCopies: z.number().int().nonnegative().max(4_096),
  exclusionTags: z.number().int().positive().max(256),
  copyRoles: z.number().int().positive().max(64),
})

const structuralObservationSchema = z.strictObject({
  schemaVersion: z.literal(legacyStyleObservationSchemaVersion),
  id: z.literal('legacy-style-catalog'),
  styles: z.array(styleObservationSchema).min(1).max(1_024),
  cores: z.array(coreObservationSchema).min(1).max(4_096),
  subtypes: z.array(subtypeObservationSchema).min(1).max(16_384),
  rules: z.array(ruleObservationSchema).min(1).max(16_384),
  adjustments: z.array(adjustmentObservationSchema).max(4_096),
  exclusionTags: z.array(exclusionTagObservationSchema).min(1).max(256),
  copyRoles: z.array(copyRoleObservationSchema).length(styleCopyRoleIds.length),
  coverage: coverageSchema,
})

export type LegacyStyleObservation = z.input<typeof structuralObservationSchema>
export type LegacyStyleAdjustmentObservation = LegacyStyleObservation['adjustments'][number]

function sortPriorityAndId<
  Value extends { readonly priority: number; readonly id: string },
>(left: Value, right: Value) {
  return left.priority - right.priority || compareCodePoints(left.id, right.id)
}

function canonicalizeObservation(
  input: z.infer<typeof structuralObservationSchema>,
): z.infer<typeof structuralObservationSchema> {
  const styles = [...input.styles]
    .map((style) => ({
      ...style,
      exclusionTagIds: [...style.exclusionTagIds],
      copySources: [...style.copySources]
        .sort((left, right) => (
          styleCopyRolePriority.get(left.role)! - styleCopyRolePriority.get(right.role)!
        )) as typeof style.copySources,
    }))
    .sort((left, right) => (
      left.displayPriority - right.displayPriority || compareCodePoints(left.id, right.id)
    ))
  const stylePriority = new Map(styles.map(({ id }, priority) => [id, priority]))
  const cores = [...input.cores]
    .map((core) => ({
      ...core,
      copySources: [...core.copySources]
        .sort((left, right) => (
          styleCopyRolePriority.get(left.role)! - styleCopyRolePriority.get(right.role)!
        )) as typeof core.copySources,
    }))
    .sort((left, right) => (
      (stylePriority.get(left.parentStyleId) ?? Number.MAX_SAFE_INTEGER)
        - (stylePriority.get(right.parentStyleId) ?? Number.MAX_SAFE_INTEGER)
      || left.priority - right.priority
      || compareCodePoints(left.id, right.id)
    ))
  const corePriority = new Map(cores.map(({ id }, priority) => [id, priority]))
  const subtypes = [...input.subtypes]
    .map((subtype) => ({
      ...subtype,
      copySources: [...subtype.copySources]
        .sort((left, right) => (
          styleCopyRolePriority.get(left.role)! - styleCopyRolePriority.get(right.role)!
        )) as typeof subtype.copySources,
    }))
    .sort((left, right) => (
      (corePriority.get(left.parentCoreId) ?? Number.MAX_SAFE_INTEGER)
        - (corePriority.get(right.parentCoreId) ?? Number.MAX_SAFE_INTEGER)
      || left.priority - right.priority
      || compareCodePoints(left.id, right.id)
    ))
  const rules = [...input.rules]
    .map((rule) => ({
      ...rule,
      tiers: [...rule.tiers]
        .map((tier) => ({
          ...tier,
          targets: [...tier.targets].sort((left, right) => (
            left.priority - right.priority || compareCodePoints(left.optionId, right.optionId)
          )),
        }))
        .sort((left, right) => tierPriority.get(left.tier)! - tierPriority.get(right.tier)!),
    }))
    .sort((left, right) => (
      (corePriority.get(left.parentCoreId) ?? Number.MAX_SAFE_INTEGER)
        - (corePriority.get(right.parentCoreId) ?? Number.MAX_SAFE_INTEGER)
      || left.priority - right.priority
      || compareCodePoints(left.id, right.id)
    ))
  const adjustments = [...input.adjustments]
    .map((adjustment) => {
      const conditions = adjustment.kind === 'bonus'
        ? adjustment.conditions
        : adjustment.whenAll
      const canonicalConditions = [...conditions]
        .map((condition) => ({
          ...condition,
          optionIds: [...condition.optionIds].sort((left, right) => (
            (optionPriorityByQuestion.get(condition.questionId)?.get(left)
              ?? Number.MAX_SAFE_INTEGER)
              - (optionPriorityByQuestion.get(condition.questionId)?.get(right)
                ?? Number.MAX_SAFE_INTEGER)
            || compareCodePoints(left, right)
          )),
        }))
        .sort((left, right) => (
          left.priority - right.priority || compareCodePoints(left.questionId, right.questionId)
        ))
      return adjustment.kind === 'bonus'
        ? { ...adjustment, conditions: canonicalConditions }
        : { ...adjustment, whenAll: canonicalConditions }
    })
    .sort((left, right) => (
      (corePriority.get(left.parentCoreId) ?? Number.MAX_SAFE_INTEGER)
        - (corePriority.get(right.parentCoreId) ?? Number.MAX_SAFE_INTEGER)
      || (left.kind === right.kind ? 0 : left.kind === 'bonus' ? -1 : 1)
      || left.sourceOrdinal - right.sourceOrdinal
      || compareCodePoints(left.id, right.id)
    ))
  const exclusionTags = [...input.exclusionTags].sort(sortPriorityAndId)
  const tagPriority = new Map(exclusionTags.map(({ id, priority }) => [id, priority]))
  for (const style of styles) {
    style.exclusionTagIds.sort((left, right) => (
      (tagPriority.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (tagPriority.get(right) ?? Number.MAX_SAFE_INTEGER)
      || compareCodePoints(left, right)
    ))
  }
  return {
    ...input,
    styles,
    cores,
    subtypes,
    rules,
    adjustments,
    exclusionTags,
    copyRoles: [...input.copyRoles].sort(sortPriorityAndId),
  }
}

const forbiddenObservationKeys = new Set([
  'absoluteCheckoutPath',
  'absolutePath',
  'canonicalStyleModel',
  'ciIdentity',
  'currentCompiledStyleModel',
  'currentRuntime',
  'eligibility',
  'implementationSha',
  'recommendations',
  'savedAt',
  'temporaryPath',
  'timestamp',
])

function assertObservationBoundary(value: unknown, ancestors = new WeakSet<object>()): void {
  if (typeof value === 'string') {
    if (
      /^(?:file:|\/|\\\\|[A-Za-z]:[\\/])/i.test(value)
      || /^\/\//.test(value)
    ) {
      throw new Error('style observation contains a machine path')
    }
    return
  }
  if (!value || typeof value !== 'object') return
  if (ancestors.has(value)) throw new Error('style observation contains a cycle')
  ancestors.add(value)
  if (Array.isArray(value)) {
    for (const child of value) assertObservationBoundary(child, ancestors)
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenObservationKeys.has(key)) {
        throw new Error('style observation contains current-only metadata')
      }
      assertObservationBoundary(child, ancestors)
    }
  }
  ancestors.delete(value)
}

export const legacyStyleObservationSchema = structuralObservationSchema.transform((value) => {
  assertObservationBoundary(value)
  return deepFreeze(canonicalizeObservation(value))
})

const adjustmentCopySeedSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('bonus'),
    id: stableIdSchema,
    parentCoreId: stableIdSchema,
    sourceRole: z.literal('core-bonus'),
    sourceOrdinal: prioritySchema,
  }),
  z.strictObject({
    kind: z.literal('conflict'),
    id: stableIdSchema,
    parentCoreId: stableIdSchema,
    sourceRole: z.literal('core-conflict'),
    sourceOrdinal: prioritySchema,
  }),
])

const seedCaseSchema = z.strictObject({
  id: z.literal('legacy-style-catalog'),
  styleIds: z.array(stableIdSchema).min(1).max(1_024),
  coreIds: z.array(stableIdSchema).min(1).max(4_096),
  subtypeIds: z.array(stableIdSchema).min(1).max(16_384),
  ruleIds: z.array(stableIdSchema).min(1).max(16_384),
  adjustmentCopies: z.array(adjustmentCopySeedSchema).max(4_096),
  exclusionTagIds: z.array(stableIdSchema).min(1).max(256),
  copyRoles: z.tuple(styleCopyRoleIds.map((role) => z.literal(role)) as [
    z.ZodLiteral<'style-label'>,
    z.ZodLiteral<'style-summary'>,
    z.ZodLiteral<'core-label'>,
    z.ZodLiteral<'core-summary'>,
    z.ZodLiteral<'subtype-label'>,
    z.ZodLiteral<'subtype-summary'>,
    z.ZodLiteral<'bonus-reason'>,
    z.ZodLiteral<'conflict-reason'>,
  ]),
})

export const legacyStyleSeedFileSchema = z.strictObject({
  schemaVersion: z.literal(legacyStyleObservationSchemaVersion),
  case: seedCaseSchema,
}).transform((value) => deepFreeze(value))

export type LegacyStyleSeedFile = z.infer<typeof legacyStyleSeedFileSchema>
export type LegacyStyleSeedCase = LegacyStyleSeedFile['case']

function assertUnique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`duplicate ${label} identity`)
}

function assertUniquePriorities(
  values: readonly { readonly priority: number }[],
  label: string,
) {
  assertUnique(values.map(({ priority }) => String(priority)), `${label} priority`)
}

function adjustmentCopyIdentity(
  adjustment: Pick<
    LegacyStyleAdjustmentObservation,
    'kind' | 'id' | 'parentCoreId' | 'sourceRole' | 'sourceOrdinal'
  >,
) {
  return [
    adjustment.kind,
    adjustment.id,
    adjustment.parentCoreId,
    adjustment.sourceRole,
    adjustment.sourceOrdinal,
  ].join(':')
}

export function orderedAdjustmentCopyIds(
  adjustments: readonly LegacyStyleAdjustmentObservation[],
) {
  return adjustments.map(adjustmentCopyIdentity)
}

function validateOneObservation(
  input: LegacyStyleObservation,
  seed: LegacyStyleSeedCase,
): LegacyStyleObservation {
  const observation = legacyStyleObservationSchema.parse(input)
  const styles = new Map(observation.styles.map((style) => [style.id, style]))
  const cores = new Map(observation.cores.map((core) => [core.id, core]))
  assertUnique(observation.styles.map(({ id }) => id), 'style')
  assertUnique(observation.cores.map(({ id }) => id), 'core')
  assertUnique(observation.subtypes.map(({ id }) => id), 'subtype')
  assertUnique(observation.rules.map(({ id }) => id), 'rule')
  assertUnique(orderedAdjustmentCopyIds(observation.adjustments), 'adjustment copy')
  assertUnique(observation.exclusionTags.map(({ id }) => id), 'exclusion tag')
  assertUnique(observation.copyRoles.map(({ id }) => id), 'copy role')
  assertUniquePriorities(observation.styles.map(({ displayPriority }) => ({
    priority: displayPriority,
  })), 'style')
  assertUniquePriorities(observation.exclusionTags, 'exclusion tag')
  assertUniquePriorities(observation.copyRoles, 'copy role')

  for (const core of observation.cores) {
    if (!styles.has(core.parentStyleId) || core.id !== `${core.parentStyleId}:${core.intensityId}`) {
      throw new Error('core parent identity mismatch')
    }
  }
  for (const style of observation.styles) {
    assertUnique(style.exclusionTagIds, `style exclusion tag ${style.id}`)
    assertUniquePriorities(
      observation.cores.filter(({ parentStyleId }) => parentStyleId === style.id),
      `core ${style.id}`,
    )
    if (style.exclusionTagIds.some((id) => (
      !observation.exclusionTags.some((tag) => tag.id === id)
    ))) throw new Error('style exclusion tag identity mismatch')
  }
  for (const subtype of observation.subtypes) {
    const core = cores.get(subtype.parentCoreId)
    if (
      !core
      || subtype.parentStyleId !== core.parentStyleId
      || subtype.id !== `${subtype.parentCoreId}:${subtype.noodleId}`
    ) throw new Error('subtype parent identity mismatch')
  }
  for (const core of observation.cores) {
    assertUniquePriorities(
      observation.subtypes.filter(({ parentCoreId }) => parentCoreId === core.id),
      `subtype ${core.id}`,
    )
    assertUniquePriorities(
      observation.rules.filter(({ parentCoreId }) => parentCoreId === core.id),
      `rule ${core.id}`,
    )
    for (const kind of ['bonus', 'conflict'] as const) {
      const adjustmentCopies = observation.adjustments.filter((adjustment) => (
        adjustment.parentCoreId === core.id && adjustment.kind === kind
      ))
      assertUnique(
        adjustmentCopies.map(({ id }) => id),
        `${kind} adjustment ${core.id}`,
      )
      assertUnique(
        adjustmentCopies.map(({ sourceOrdinal }) => String(sourceOrdinal)),
        `${kind} source ordinal ${core.id}`,
      )
    }
  }
  for (const rule of observation.rules) {
    const core = cores.get(rule.parentCoreId)
    if (
      !core
      || rule.parentStyleId !== core.parentStyleId
      || rule.id !== `${rule.parentCoreId}:${rule.questionId}`
      || rule.tiers.map(({ tier }) => tier).join('\0') !== tierIds.join('\0')
    ) throw new Error('rule identity or tier mismatch')
    const allTargets = rule.tiers.flatMap(({ targets }) => targets)
    assertUnique(allTargets.map(({ optionId }) => optionId), 'rule target')
    for (const tier of rule.tiers) {
      assertUnique(tier.targets.map(({ optionId }) => optionId), 'rule target')
      if (tier.tier === 'miss' && tier.targets.length !== 0) {
        throw new Error('miss tier must contain no explicit targets')
      }
    }
  }
  for (const adjustment of observation.adjustments) {
    const core = cores.get(adjustment.parentCoreId)
    if (!core || adjustment.parentStyleId !== core.parentStyleId) {
      throw new Error('adjustment parent identity mismatch')
    }
    const conditions = adjustment.kind === 'bonus'
      ? adjustment.conditions
      : adjustment.whenAll
    assertUniquePriorities(conditions, `adjustment condition ${adjustment.id}`)
    assertUnique(conditions.map(({ questionId, optionIds }) => (
      `${questionId}\0${optionIds.join('\0')}`
    )), `adjustment condition ${adjustment.id}`)
    for (const condition of conditions) {
      assertUnique(condition.optionIds, `adjustment option ${adjustment.id}`)
    }
  }

  const expectedCoverage = {
    styles: observation.styles.length,
    cores: observation.cores.length,
    subtypes: observation.subtypes.length,
    rules: observation.rules.length,
    bonusCopies: observation.adjustments.filter(({ kind }) => kind === 'bonus').length,
    conflictCopies: observation.adjustments.filter(({ kind }) => kind === 'conflict').length,
    exclusionTags: observation.exclusionTags.length,
    copyRoles: observation.copyRoles.length,
  }
  if (JSON.stringify(observation.coverage) !== JSON.stringify(expectedCoverage)) {
    throw new Error('style observation coverage mismatch')
  }

  const actualSeedProjection: LegacyStyleSeedCase = {
    id: observation.id,
    styleIds: observation.styles.map(({ id }) => id),
    coreIds: observation.cores.map(({ id }) => id),
    subtypeIds: observation.subtypes.map(({ id }) => id),
    ruleIds: observation.rules.map(({ id }) => id),
    adjustmentCopies: observation.adjustments.map((adjustment) => ({
      kind: adjustment.kind,
      id: adjustment.id,
      parentCoreId: adjustment.parentCoreId,
      sourceRole: adjustment.sourceRole,
      sourceOrdinal: adjustment.sourceOrdinal,
    })) as LegacyStyleSeedCase['adjustmentCopies'],
    exclusionTagIds: observation.exclusionTags.map(({ id }) => id),
    copyRoles: observation.copyRoles.map(({ id }) => id) as LegacyStyleSeedCase['copyRoles'],
  }
  if (stableJson(actualSeedProjection) !== stableJson(seed)) {
    throw new Error('style observation does not match deterministic seed coverage')
  }
  return observation
}

export function parseLegacyStyleRawCases(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('raw style extraction envelope is invalid')
  }
  const record = input as Record<string, unknown>
  if (
    Object.keys(record).sort(compareCodePoints).join('\0') !== 'cases\0schemaVersion'
    || record.schemaVersion !== legacyStyleObservationSchemaVersion
    || !Array.isArray(record.cases)
  ) throw new Error('raw style extraction envelope is invalid')
  return record.cases.map((entry) => structuralObservationSchema.parse(entry))
}

export function validateLegacyStyleCases(
  cases: readonly LegacyStyleObservation[],
  seeds: readonly LegacyStyleSeedCase[],
) {
  if (cases.length !== 1 || seeds.length !== 1) {
    throw new Error('style extraction requires one complete observation case')
  }
  return deepFreeze([validateOneObservation(cases[0]!, seeds[0]!)])
}

export function canonicalizeLegacyStyleCases(
  cases: readonly LegacyStyleObservation[],
) {
  return stableJson({
    schemaVersion: legacyStyleObservationSchemaVersion,
    cases: cases.map((observation) => legacyStyleObservationSchema.parse(observation)),
  })
}

export function computeLegacyStyleCasesHash(
  cases: readonly LegacyStyleObservation[],
) {
  return createHash('sha256')
    .update('ramen-legacy-style-observations-v1\0')
    .update(canonicalizeLegacyStyleCases(cases))
    .digest('hex')
}

export function serializeLegacyStyleCases(
  cases: readonly LegacyStyleObservation[],
) {
  return Buffer.from(canonicalizeLegacyStyleCases(cases))
}

export function computeStyleExtractorAuthoringHash(
  sources: readonly { readonly path: string; readonly hash: string }[],
) {
  const digest = createHash('sha256')
  digest.update('ramen-style-extractor-authoring-v1\0')
  for (const source of sources) {
    digest.update(source.path)
    digest.update('\0')
    digest.update(source.hash)
    digest.update('\0')
  }
  return digest.digest('hex')
}

const styleAuthoringSourcesSchema = z.tuple([
  z.strictObject({
    path: z.literal('tools/parity/shared/contracts.ts'),
    hash: sha256Schema,
  }),
  z.strictObject({
    path: z.literal('tools/parity/shared/authoring.ts'),
    hash: sha256Schema,
  }),
  z.strictObject({
    path: z.literal('tools/parity/styles/contracts.ts'),
    hash: sha256Schema,
  }),
  z.strictObject({
    path: z.literal('tools/parity/styles/extractor.ts'),
    hash: sha256Schema,
  }),
  z.strictObject({
    path: z.literal('tools/parity/styles/extract.ts'),
    hash: sha256Schema,
  }),
])

export const styleFixtureManifestSchema = z.strictObject({
  fixtureSchemaVersion: z.literal(styleFixtureSchemaVersion),
  source: z.strictObject({
    repository: z.strictObject({
      host: z.literal('github.com'),
      owner: z.literal(legacyStyleRepositoryIdentity.owner),
      repository: z.literal(legacyStyleRepositoryIdentity.repository),
    }),
    commit: z.literal(legacyStyleRepositoryIdentity.commit),
    treeHash: z.literal(legacyStyleRepositoryIdentity.treeHash),
    trackedSourceHashes: z.record(repositoryPathSchema, sha256Schema),
    lockfilePath: z.literal('package-lock.json'),
    lockfileHash: z.literal(styleLegacyLockfileHash),
  }),
  extractor: z.strictObject({
    version: z.literal(styleExtractorVersion),
    sources: styleAuthoringSourcesSchema,
    hash: sha256Schema,
  }),
  instrumentation: z.strictObject({
    version: z.literal(styleInstrumentationVersion),
    hash: z.literal(styleInstrumentationHash),
  }),
  seeds: z.strictObject({
    schemaVersion: z.literal(legacyStyleObservationSchemaVersion),
    hash: z.literal(styleSeedsHash),
  }),
  runtime: z.strictObject({
    nodeVersion: z.literal(styleExtractionNodeVersion),
    timezone: z.literal('UTC'),
    locale: z.literal('C.UTF-8'),
    dependencies: z.literal('copy-validated'),
    installedLockfileHash: z.literal(styleInstalledLockfileHash),
    dependencyTreeHash: z.literal(styleDependencyTreeHash),
    network: z.literal('denied'),
    fullSuiteBeforeExtraction: z.literal(true),
  }),
  orderedStyleIds: z.array(stableIdSchema).min(1).max(1_024),
  orderedCoreIds: z.array(stableIdSchema).min(1).max(4_096),
  orderedSubtypeIds: z.array(stableIdSchema).min(1).max(16_384),
  orderedRuleIds: z.array(stableIdSchema).min(1).max(16_384),
  orderedAdjustmentCopyIds: z.array(z.string().min(1).max(1_024)).max(4_096),
  orderedExclusionTagIds: z.array(stableIdSchema).min(1).max(256),
  orderedCopyRoles: z.tuple(styleCopyRoleIds.map((role) => z.literal(role)) as [
    z.ZodLiteral<'style-label'>,
    z.ZodLiteral<'style-summary'>,
    z.ZodLiteral<'core-label'>,
    z.ZodLiteral<'core-summary'>,
    z.ZodLiteral<'subtype-label'>,
    z.ZodLiteral<'subtype-summary'>,
    z.ZodLiteral<'bonus-reason'>,
    z.ZodLiteral<'conflict-reason'>,
  ]),
  coverage: coverageSchema,
  caseCount: z.literal(1),
  casesHash: sha256Schema,
  fixtureContentHash: sha256Schema,
}).superRefine((manifest, context) => {
  if (manifest.extractor.hash !== computeStyleExtractorAuthoringHash(manifest.extractor.sources)) {
    context.addIssue({
      code: 'custom',
      path: ['extractor', 'hash'],
      message: 'extractor hash must match ordered authoring sources',
    })
  }
  if (
    Object.keys(manifest.source.trackedSourceHashes).length
      !== legacyStyleTrackedSourceCount
    || computeLegacyStyleTrackedSourceHashesHash(
      manifest.source.trackedSourceHashes,
    ) !== legacyStyleTrackedSourceHashesHash
  ) context.addIssue({
    code: 'custom',
    path: ['source', 'trackedSourceHashes'],
    message: 'tracked source hashes must match the frozen full-suite closure',
  })
  const countChecks = [
    ['orderedStyleIds', manifest.orderedStyleIds.length, manifest.coverage.styles],
    ['orderedCoreIds', manifest.orderedCoreIds.length, manifest.coverage.cores],
    ['orderedSubtypeIds', manifest.orderedSubtypeIds.length, manifest.coverage.subtypes],
    ['orderedRuleIds', manifest.orderedRuleIds.length, manifest.coverage.rules],
    [
      'orderedAdjustmentCopyIds',
      manifest.orderedAdjustmentCopyIds.length,
      manifest.coverage.bonusCopies + manifest.coverage.conflictCopies,
    ],
    [
      'orderedExclusionTagIds',
      manifest.orderedExclusionTagIds.length,
      manifest.coverage.exclusionTags,
    ],
    ['orderedCopyRoles', manifest.orderedCopyRoles.length, manifest.coverage.copyRoles],
  ] as const
  for (const [path, received, expected] of countChecks) {
    if (received !== expected) context.addIssue({
      code: 'custom',
      path: [path],
      message: `${path} must match coverage`,
    })
  }
}).transform((value) => deepFreeze(value))

export type StyleFixtureManifest = z.infer<typeof styleFixtureManifestSchema>

export function serializeStyleFixtureManifest(manifest: StyleFixtureManifest) {
  return Buffer.from(stableJson(styleFixtureManifestSchema.parse(manifest)))
}
