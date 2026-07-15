import type { CompiledQuestionModel } from '../../contracts/question-model.js'
import type {
  AdjustmentConditionDefinition,
  CompiledAdjustment,
  CompiledAdjustmentCondition,
  CompiledExclusionTag,
  CompiledStyleRule,
  CompiledSubtype,
  CompileStylesResult,
  CoreId,
  ExclusionTagId,
  IntensityId,
  MatchTier,
  NoodleId,
  ResolvedStyleCoreRule,
  RuleId,
  StyleDefinition,
  StyleRuleDefinition,
  StyleRuleProvenance,
  StyleRulesStageCore,
  StyleRulesStageStyle,
  StyleRuleTierDefinition,
  SubtypeId,
} from '../../contracts/style-model.js'
import { compareCodePoints } from '../../contracts/source-path.js'
import { DiagnosticCollector } from '../collector.js'
import { stableJson } from '../stable-json.js'
import { proveStyleModel } from './proof.js'
import { parseStyleDefinitionBundle } from './source-schema.js'

const styleModelVersion = 'batch3a.1.0'
const requiredIntensityIds = ['clean', 'standard', 'heavy'] as const
const requiredNoodleIds = [
  'thin-straight',
  'medium-thin-straight',
  'medium-thick-straight',
  'medium-thick-wavy',
  'extra-thick',
] as const
const requiredExclusionTagIds = [
  'pork',
  'chicken',
  'duck',
  'fish-seafood',
  'shellfish',
  'dairy',
] as const
const requiredRuleQuestionIds = [
  'form',
  'archetype',
  'tare',
  'source',
  'body',
  'noodle',
  'signature',
] as const
const tierPriorities: Readonly<Record<MatchTier, number>> = {
  exact: 0,
  adjacent: 1,
  partial: 2,
}

function duplicateStrings(values: readonly string[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].sort(compareCodePoints)
}

function duplicateNumbers(values: readonly number[]) {
  const seen = new Set<number>()
  const duplicates = new Set<number>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].sort((left, right) => left - right)
}

function compareStableValues(left: unknown, right: unknown) {
  return compareCodePoints(stableJson(left), stableJson(right))
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length
    && left.every((value, index) => value === right[index])
}

function canonicalStringSet(values: readonly string[]) {
  return [...new Set(values)].sort(compareCodePoints)
}

function coreId(styleId: string, intensityId: IntensityId): CoreId {
  return `${styleId}:${intensityId}`
}

function subtypeId(parentCoreId: CoreId, noodleId: NoodleId): SubtypeId {
  return `${parentCoreId}:${noodleId}`
}

function ruleId(parentCoreId: CoreId, questionId: string): RuleId {
  return `${parentCoreId}:${questionId}`
}

interface RuleCandidate {
  readonly rule: StyleRuleDefinition
  readonly provenance: StyleRuleProvenance
}

export function compileStyles(
  input: unknown,
  questionModel: CompiledQuestionModel,
  sourceFile: string,
): CompileStylesResult {
  const parsed = parseStyleDefinitionBundle(input, sourceFile)
  if (!parsed.definition) return { ok: false, diagnostics: parsed.diagnostics }

  const definition = parsed.definition
  const collector = new DiagnosticCollector()
  const questionsById = new Map(
    questionModel.questions.map((question) => [question.id, question]),
  )
  const optionOwners = new Map<string, Set<string>>()
  const optionPriorities = new Map<string, Map<string, number>>()
  for (const question of questionModel.questions) {
    const priorities = new Map<string, number>()
    for (const option of question.options) {
      const owners = optionOwners.get(option.id) ?? new Set<string>()
      owners.add(question.id)
      optionOwners.set(option.id, owners)
      priorities.set(option.id, option.order)
    }
    optionPriorities.set(question.id, priorities)
  }

  if (definition.modelVersion !== styleModelVersion) collector.error({
    code: 'STYLE_MODEL_VERSION_MISMATCH',
    sourceFile: definition.sourceFile,
    path: '/modelVersion',
    entityId: definition.modelVersion,
    message: 'Style model version does not match the approved compiler contract',
    expected: styleModelVersion,
    received: definition.modelVersion,
  })

  const canonicalFamilies = [...definition.taxonomy.families].sort((left, right) => (
    left.priority - right.priority
      || compareCodePoints(left.id, right.id)
      || compareStableValues(left, right)
  ))
  const canonicalIntensities = [...definition.taxonomy.intensities].sort((left, right) => (
    left.priority - right.priority
      || compareCodePoints(left.id, right.id)
      || compareStableValues(left, right)
  ))
  const canonicalNoodles = [...definition.taxonomy.noodles].sort((left, right) => (
    left.priority - right.priority
      || compareCodePoints(left.id, right.id)
      || compareStableValues(left, right)
  ))
  const canonicalExclusionTags = [...definition.taxonomy.exclusionTags]
    .sort((left, right) => (
      left.priority - right.priority
        || compareCodePoints(left.id, right.id)
        || compareStableValues(left, right)
    ))
  const canonicalRuleQuestions = [...definition.taxonomy.ruleQuestions].sort((left, right) => (
    left.priority - right.priority
      || compareCodePoints(left.questionId, right.questionId)
      || compareStableValues(left, right)
  ))
  const canonicalStyles = [...definition.definitions].sort((left, right) => (
    left.displayPriority - right.displayPriority
      || compareCodePoints(left.id, right.id)
      || compareCodePoints(left.sourceFile, right.sourceFile)
      || compareStableValues(left, right)
  ))

  reportDuplicatePriorities(
    canonicalFamilies.map(({ priority }) => priority),
    definition.taxonomy.sourceFile,
    '/families',
    collector,
  )
  reportDuplicatePriorities(
    canonicalIntensities.map(({ priority }) => priority),
    definition.taxonomy.sourceFile,
    '/intensities',
    collector,
  )
  reportDuplicatePriorities(
    canonicalNoodles.map(({ priority }) => priority),
    definition.taxonomy.sourceFile,
    '/noodles',
    collector,
  )
  reportDuplicatePriorities(
    canonicalExclusionTags.map(({ priority }) => priority),
    definition.taxonomy.sourceFile,
    '/exclusionTags',
    collector,
  )
  reportDuplicatePriorities(
    canonicalRuleQuestions.map(({ priority }) => priority),
    definition.taxonomy.sourceFile,
    '/ruleQuestions',
    collector,
  )

  for (const priority of duplicateNumbers(
    canonicalStyles.map(({ displayPriority }) => displayPriority),
  )) collector.error({
    code: 'STYLE_DISPLAY_PRIORITY_DUPLICATE',
    sourceFile: definition.sourceFile,
    path: '/definitions',
    entityId: String(priority),
    message: `Duplicate style display priority ${priority}`,
  })
  for (const id of duplicateStrings(canonicalStyles.map(({ id }) => id))) collector.error({
    code: 'STYLE_DUPLICATE_ID',
    sourceFile: definition.sourceFile,
    path: '/definitions',
    entityId: id,
    message: `Duplicate style ${id}`,
  })
  for (const id of duplicateStrings(canonicalIntensities.map(({ id }) => id))) {
    collector.error({
      code: 'STYLE_INTENSITY_DUPLICATE',
      sourceFile: definition.taxonomy.sourceFile,
      path: '/intensities',
      entityId: id,
      message: `Duplicate intensity taxonomy member ${id}`,
    })
  }
  for (const id of duplicateStrings(canonicalNoodles.map(({ id }) => id))) {
    collector.error({
      code: 'STYLE_NOODLE_DUPLICATE',
      sourceFile: definition.taxonomy.sourceFile,
      path: '/noodles',
      entityId: id,
      message: `Duplicate noodle taxonomy member ${id}`,
    })
  }
  for (const id of duplicateStrings(canonicalExclusionTags.map(({ id }) => id))) {
    collector.error({
      code: 'STYLE_EXCLUSION_TAG_DUPLICATE',
      sourceFile: definition.taxonomy.sourceFile,
      path: '/exclusionTags',
      entityId: id,
      message: `Duplicate exclusion-tag taxonomy member ${id}`,
    })
  }

  const declaredIntensityIds = canonicalStringSet(
    canonicalIntensities.map(({ id }) => id),
  )
  const exactIntensityIds = [...requiredIntensityIds].sort(compareCodePoints)
  if (!sameStrings(declaredIntensityIds, exactIntensityIds)
    || canonicalIntensities.length !== requiredIntensityIds.length) {
    collector.error({
      code: 'STYLE_INVENTORY_MISMATCH',
      sourceFile: definition.taxonomy.sourceFile,
      path: '/intensities',
      entityId: 'intensities',
      message: 'Intensity taxonomy does not declare the exact approved inventory',
      expected: exactIntensityIds,
      received: canonicalIntensities.map(({ id }) => id),
    })
  }

  const declaredNoodleIds = canonicalStringSet(canonicalNoodles.map(({ id }) => id))
  const exactNoodleIds = [...requiredNoodleIds].sort(compareCodePoints)
  if (!sameStrings(declaredNoodleIds, exactNoodleIds)
    || canonicalNoodles.length !== requiredNoodleIds.length) {
    collector.error({
      code: 'STYLE_INVENTORY_MISMATCH',
      sourceFile: definition.taxonomy.sourceFile,
      path: '/noodles',
      entityId: 'noodles',
      message: 'Noodle taxonomy does not declare the exact approved inventory',
      expected: exactNoodleIds,
      received: canonicalNoodles.map(({ id }) => id),
    })
  }

  const declaredExclusionTagIds = canonicalStringSet(
    canonicalExclusionTags.map(({ id }) => id),
  )
  const exactExclusionTagIds = [...requiredExclusionTagIds].sort(compareCodePoints)
  if (!sameStrings(declaredExclusionTagIds, exactExclusionTagIds)
    || canonicalExclusionTags.length !== requiredExclusionTagIds.length) {
    collector.error({
      code: 'STYLE_INVENTORY_MISMATCH',
      sourceFile: definition.taxonomy.sourceFile,
      path: '/exclusionTags',
      entityId: 'exclusion-tags',
      message: 'Exclusion-tag taxonomy does not declare the exact approved inventory',
      expected: exactExclusionTagIds,
      received: canonicalExclusionTags.map(({ id }) => id),
    })
  }

  const declaredRuleQuestionIds = canonicalStringSet(
    canonicalRuleQuestions.map(({ questionId }) => questionId),
  )
  const exactRuleQuestionIds = [...requiredRuleQuestionIds].sort(compareCodePoints)
  if (!sameStrings(declaredRuleQuestionIds, exactRuleQuestionIds)
    || canonicalRuleQuestions.length !== requiredRuleQuestionIds.length) {
    collector.error({
      code: 'STYLE_INVENTORY_MISMATCH',
      sourceFile: definition.taxonomy.sourceFile,
      path: '/ruleQuestions',
      entityId: 'rule-questions',
      message: 'Rule-question taxonomy does not declare the exact approved inventory',
      expected: exactRuleQuestionIds,
      received: canonicalRuleQuestions.map(({ questionId }) => questionId),
    })
  }
  for (const [index, ruleQuestion] of canonicalRuleQuestions.entries()) {
    if (!questionsById.has(ruleQuestion.questionId)) collector.error({
      code: 'STYLE_RULE_QUESTION_UNKNOWN',
      sourceFile: definition.taxonomy.sourceFile,
      path: `/ruleQuestions/${index}/questionId`,
      entityId: ruleQuestion.questionId,
      message: `Unknown taxonomy rule question ${ruleQuestion.questionId}`,
    })
    const expectedSource = ruleQuestion.questionId === 'body'
      ? 'intensity-profile'
      : 'style-base'
    if (ruleQuestion.source !== expectedSource) collector.error({
      code: 'STYLE_INVENTORY_MISMATCH',
      sourceFile: definition.taxonomy.sourceFile,
      path: `/ruleQuestions/${index}/source`,
      entityId: ruleQuestion.questionId,
      message: `Rule question ${ruleQuestion.questionId} has the wrong source owner`,
      expected: expectedSource,
      received: ruleQuestion.source,
    })
  }

  const familyById = new Map(canonicalFamilies.map((family) => [family.id, family]))
  const intensityById = new Map<IntensityId, typeof canonicalIntensities[number]>()
  for (const intensity of canonicalIntensities) {
    if (!intensityById.has(intensity.id)) intensityById.set(intensity.id, intensity)
  }
  const noodleById = new Map<NoodleId, {
    readonly noodle: typeof canonicalNoodles[number]
    readonly path: string
  }>()
  for (const [index, noodle] of canonicalNoodles.entries()) {
    if (!noodleById.has(noodle.id)) noodleById.set(noodle.id, {
      noodle,
      path: `/noodles/${index}`,
    })
  }
  const exclusionTagById = new Map<ExclusionTagId, {
    readonly tag: typeof canonicalExclusionTags[number]
    readonly path: string
  }>()
  const compiledExclusionTags: CompiledExclusionTag[] = []
  for (const [index, tag] of canonicalExclusionTags.entries()) {
    const path = `/exclusionTags/${index}`
    if (!exclusionTagById.has(tag.id)) exclusionTagById.set(tag.id, { tag, path })
    const mappedToExclusions = optionOwners.get(tag.exclusionsOptionId)
      ?.has('exclusions') === true
    if (tag.exclusionsOptionId !== tag.id || !mappedToExclusions) collector.error({
      code: 'STYLE_EXCLUSION_TAG_MISMATCH',
      sourceFile: definition.taxonomy.sourceFile,
      path: `${path}/exclusionsOptionId`,
      entityId: tag.id,
      message: `Exclusion tag ${tag.id} does not use the required same-token mapping`,
      expected: tag.id,
      received: tag.exclusionsOptionId,
    })
    compiledExclusionTags.push({
      id: tag.id,
      priority: tag.priority,
      questionId: 'exclusions',
      optionId: tag.exclusionsOptionId,
      provenance: { sourceFile: definition.taxonomy.sourceFile, path },
    })
  }
  const rulePriorityByQuestionId = new Map(
    canonicalRuleQuestions.map(({ questionId, priority }) => [questionId, priority]),
  )

  for (const [index, family] of canonicalFamilies.entries()) {
    const formQuestion = questionsById.get('form')
    const ownerIsForm = optionOwners.get(family.formOptionId)?.has('form') === true
    if (!formQuestion || !ownerIsForm) collector.error({
      code: 'STYLE_FAMILY_MISMATCH',
      sourceFile: definition.taxonomy.sourceFile,
      path: `/families/${index}/formOptionId`,
      entityId: family.id,
      message: `Family ${family.id} does not bind to a form option`,
      expected: 'form-owned option',
      received: family.formOptionId,
    })
  }

  function optionPriority(questionId: string, optionId: string) {
    return optionPriorities.get(questionId)?.get(optionId) ?? Number.MAX_SAFE_INTEGER
  }

  function canonicalTiers(rule: StyleRuleDefinition): StyleRuleTierDefinition[] {
    return [...rule.tiers]
      .sort((left, right) => (
        tierPriorities[left.tier] - tierPriorities[right.tier]
          || compareStableValues(left, right)
      ))
      .map((tier) => ({
        tier: tier.tier,
        optionIds: [...tier.optionIds].sort((left, right) => (
          optionPriority(rule.questionId, left) - optionPriority(rule.questionId, right)
            || compareCodePoints(left, right)
        )),
      }))
  }

  function canonicalAdjustmentConditions(
    conditions: readonly AdjustmentConditionDefinition[],
  ): AdjustmentConditionDefinition[] {
    return conditions
      .map((condition) => ({
        priority: condition.priority,
        questionId: condition.questionId,
        optionIds: [...condition.optionIds].sort((left, right) => (
          optionPriority(condition.questionId, left)
            - optionPriority(condition.questionId, right)
            || compareCodePoints(left, right)
        )),
      }))
      .sort((left, right) => (
        left.priority - right.priority
          || compareCodePoints(left.questionId, right.questionId)
          || compareStableValues(left.optionIds, right.optionIds)
      ))
  }

  function reportDuplicateConditionIdentities(
    conditions: readonly AdjustmentConditionDefinition[],
    sourceFile: string,
    path: string,
    adjustmentId: string,
  ) {
    const seen = new Set<string>()
    for (const [index, condition] of conditions.entries()) {
      const identity = stableJson({
        questionId: condition.questionId,
        optionIds: condition.optionIds,
      })
      if (seen.has(identity)) collector.error({
        code: 'STYLE_ADJUSTMENT_CONDITION_DUPLICATE',
        sourceFile,
        path: `${path}/${index}`,
        entityId: `${adjustmentId}:${condition.questionId}`,
        message: `Adjustment ${adjustmentId} repeats a canonical condition`,
      })
      seen.add(identity)
    }
  }

  function validateRule(
    rule: StyleRuleDefinition,
    ruleSourceFile: string,
    path: string,
    entityId: string,
  ) {
    const question = questionsById.get(rule.questionId)
    if (!question) collector.error({
      code: 'STYLE_RULE_QUESTION_UNKNOWN',
      sourceFile: ruleSourceFile,
      path: `${path}/questionId`,
      entityId,
      message: `Unknown style rule question ${rule.questionId}`,
    })
    const tiers = canonicalTiers(rule)
    if (tiers.length === 0 || tiers.every(({ optionIds }) => optionIds.length === 0)) {
      collector.error({
        code: 'STYLE_RULE_EMPTY',
        sourceFile: ruleSourceFile,
        path: `${path}/tiers`,
        entityId,
        message: `Style rule ${rule.questionId} has no targets`,
      })
    }

    const firstTierByOption = new Map<string, MatchTier>()
    for (const [tierIndex, tier] of tiers.entries()) {
      for (const [optionIndex, optionId] of tier.optionIds.entries()) {
        const optionPath = `${path}/tiers/${tierIndex}/optionIds/${optionIndex}`
        const previousTier = firstTierByOption.get(optionId)
        if (previousTier !== undefined) collector.error({
          code: 'STYLE_RULE_OPTION_DUPLICATE',
          sourceFile: ruleSourceFile,
          path: optionPath,
          entityId,
          message: `Duplicate style rule option ${optionId}`,
        })
        if (previousTier !== undefined && previousTier !== tier.tier) collector.error({
          code: 'STYLE_RULE_TIER_OVERLAP',
          sourceFile: ruleSourceFile,
          path: optionPath,
          entityId,
          message: `Style rule option ${optionId} appears in multiple tiers`,
        })
        if (previousTier === undefined) firstTierByOption.set(optionId, tier.tier)
        if (!question) continue
        const owners = optionOwners.get(optionId)
        if (!owners) collector.error({
          code: 'STYLE_RULE_OPTION_UNKNOWN',
          sourceFile: ruleSourceFile,
          path: optionPath,
          entityId,
          message: `Unknown style rule option ${optionId}`,
        })
        else if (!owners.has(rule.questionId)) collector.error({
          code: 'STYLE_RULE_OPTION_WRONG_OWNER',
          sourceFile: ruleSourceFile,
          path: optionPath,
          entityId,
          message: `Style rule option ${optionId} belongs to another question`,
          expected: rule.questionId,
          received: [...owners].sort(compareCodePoints),
        })
      }
    }
  }

  function validateCondition(
    condition: AdjustmentConditionDefinition,
    conditionSourceFile: string,
    path: string,
    entityId: string,
  ) {
    const question = questionsById.get(condition.questionId)
    if (!question) collector.error({
      code: 'STYLE_ADJUSTMENT_QUESTION_UNKNOWN',
      sourceFile: conditionSourceFile,
      path: `${path}/questionId`,
      entityId,
      message: `Unknown adjustment question ${condition.questionId}`,
    })
    const seen = new Set<string>()
    const optionIds = [...condition.optionIds].sort((left, right) => (
      optionPriority(condition.questionId, left) - optionPriority(condition.questionId, right)
        || compareCodePoints(left, right)
    ))
    if (optionIds.length === 0) collector.error({
      code: 'STYLE_ADJUSTMENT_CONDITION_EMPTY',
      sourceFile: conditionSourceFile,
      path: `${path}/optionIds`,
      entityId,
      message: `Adjustment condition ${condition.questionId} has no options`,
    })
    for (const [optionIndex, optionId] of optionIds.entries()) {
      const optionPath = `${path}/optionIds/${optionIndex}`
      if (seen.has(optionId)) collector.error({
        code: 'STYLE_ADJUSTMENT_OPTION_DUPLICATE',
        sourceFile: conditionSourceFile,
        path: optionPath,
        entityId,
        message: `Duplicate adjustment option ${optionId}`,
      })
      seen.add(optionId)
      if (!question) continue
      const owners = optionOwners.get(optionId)
      if (!owners) collector.error({
        code: 'STYLE_ADJUSTMENT_OPTION_UNKNOWN',
        sourceFile: conditionSourceFile,
        path: optionPath,
        entityId,
        message: `Unknown adjustment option ${optionId}`,
      })
      else if (!owners.has(condition.questionId)) collector.error({
        code: 'STYLE_ADJUSTMENT_OPTION_WRONG_OWNER',
        sourceFile: conditionSourceFile,
        path: optionPath,
        entityId,
        message: `Adjustment option ${optionId} belongs to another question`,
        expected: condition.questionId,
        received: [...owners].sort(compareCodePoints),
      })
    }
  }

  const intensityCandidates = new Map<IntensityId, RuleCandidate>()
  for (const [intensityIndex, intensity] of canonicalIntensities.entries()) {
    const provenance: StyleRuleProvenance = {
      sourceFile: definition.taxonomy.sourceFile,
      path: `/intensities/${intensityIndex}/bodyRule`,
      inheritedFrom: 'intensity-profile',
    }
    validateRule(
      intensity.bodyRule,
      provenance.sourceFile,
      provenance.path,
      `intensity:${intensity.id}`,
    )
    if (!intensityCandidates.has(intensity.id)) intensityCandidates.set(intensity.id, {
      rule: intensity.bodyRule,
      provenance,
    })
  }

  const seenCoreIds = new Set<CoreId>()
  const seenSubtypeIds = new Set<SubtypeId>()
  const seenRuleIds = new Set<RuleId>()
  const seenAdjustmentIds = new Set<string>()
  const stageStyles: StyleRulesStageStyle[] = []
  for (const style of canonicalStyles) {
    const family = familyById.get(style.family)
    if (!family) collector.error({
      code: 'STYLE_FAMILY_UNKNOWN',
      sourceFile: style.sourceFile,
      path: '/family',
      entityId: style.id,
      message: `Style ${style.id} references an undeclared family ${style.family}`,
    })

    const canonicalBaseRules = canonicalRules(
      style,
      style.baseRules,
      '/baseRules',
      'style-base',
      rulePriorityByQuestionId,
    )
    reportDuplicateRuleIds(canonicalBaseRules, style, '/baseRules', collector)
    const baseRuleQuestionIds = canonicalBaseRules.map(({ rule }) => rule.questionId)
    const exactBaseRuleQuestionIds = requiredRuleQuestionIds
      .filter((questionId) => questionId !== 'body')
      .sort(compareCodePoints)
    if (!sameStrings(canonicalStringSet(baseRuleQuestionIds), exactBaseRuleQuestionIds)
      || baseRuleQuestionIds.length !== exactBaseRuleQuestionIds.length) {
      collector.error({
        code: 'STYLE_INVENTORY_MISMATCH',
        sourceFile: style.sourceFile,
        path: '/baseRules',
        entityId: style.id,
        message: `Style ${style.id} does not declare the exact six base rules`,
        expected: exactBaseRuleQuestionIds,
        received: baseRuleQuestionIds,
      })
    }
    for (const candidate of canonicalBaseRules) validateRule(
      candidate.rule,
      candidate.provenance.sourceFile,
      candidate.provenance.path,
      `${style.id}:${candidate.rule.questionId}`,
    )

    const baseFormRule = canonicalBaseRules.find(
      ({ rule }) => rule.questionId === 'form',
    )?.rule
    if (family && (!baseFormRule || !baseFormRule.tiers.some(({ tier, optionIds }) => (
      tier === 'exact' && optionIds.includes(family.formOptionId)
    )))) collector.error({
      code: 'STYLE_FAMILY_MISMATCH',
      sourceFile: style.sourceFile,
      path: '/baseRules',
      entityId: style.id,
      message: `Style ${style.id} form rule does not match family ${style.family}`,
      expected: family.formOptionId,
      received: baseFormRule === undefined ? undefined : canonicalTiers(baseFormRule),
    })

    const canonicalBonuses = [...style.bonuses].sort((left, right) => (
      left.priority - right.priority
        || compareCodePoints(left.id, right.id)
        || compareStableValues(left, right)
    ))
    const canonicalConflicts = [...style.conflicts].sort((left, right) => (
      left.priority - right.priority
        || compareCodePoints(left.id, right.id)
        || compareStableValues(left, right)
    ))
    for (const priority of duplicateNumbers(
      canonicalBonuses.map(({ priority: value }) => value),
    )) collector.error({
      code: 'STYLE_ADJUSTMENT_PRIORITY_DUPLICATE',
      sourceFile: style.sourceFile,
      path: '/bonuses',
      entityId: `${style.id}:bonus:${priority}`,
      message: `Style ${style.id} repeats bonus priority ${priority}`,
    })
    for (const priority of duplicateNumbers(
      canonicalConflicts.map(({ priority: value }) => value),
    )) collector.error({
      code: 'STYLE_ADJUSTMENT_PRIORITY_DUPLICATE',
      sourceFile: style.sourceFile,
      path: '/conflicts',
      entityId: `${style.id}:conflict:${priority}`,
      message: `Style ${style.id} repeats conflict priority ${priority}`,
    })

    for (const [bonusIndex, bonus] of canonicalBonuses.entries()) {
      const path = `/bonuses/${bonusIndex}`
      if (seenAdjustmentIds.has(bonus.id)) collector.error({
        code: 'STYLE_ADJUSTMENT_DUPLICATE_ID',
        sourceFile: style.sourceFile,
        path,
        entityId: bonus.id,
        message: `Duplicate style adjustment ${bonus.id}`,
      })
      seenAdjustmentIds.add(bonus.id)
      if (!Number.isFinite(bonus.points) || bonus.points <= 0
        || !Number.isSafeInteger(bonus.minMatches) || bonus.minMatches <= 0
        || bonus.minMatches > bonus.conditions.length) collector.error({
        code: 'STYLE_ADJUSTMENT_VALUE_INVALID',
        sourceFile: style.sourceFile,
        path,
        entityId: bonus.id,
        message: `Bonus ${bonus.id} has an invalid operand or minMatches`,
      })
      const conditions = canonicalAdjustmentConditions(bonus.conditions)
      if (conditions.length === 0) collector.error({
        code: 'STYLE_ADJUSTMENT_CONDITION_EMPTY',
        sourceFile: style.sourceFile,
        path: `${path}/conditions`,
        entityId: bonus.id,
        message: `Bonus ${bonus.id} has no conditions`,
      })
      for (const priority of duplicateNumbers(
        conditions.map(({ priority: value }) => value),
      )) collector.error({
        code: 'STYLE_ADJUSTMENT_CONDITION_PRIORITY_DUPLICATE',
        sourceFile: style.sourceFile,
        path: `${path}/conditions`,
        entityId: `${bonus.id}:${priority}`,
        message: `Bonus ${bonus.id} repeats condition priority ${priority}`,
      })
      reportDuplicateConditionIdentities(
        conditions,
        style.sourceFile,
        `${path}/conditions`,
        bonus.id,
      )
      for (const [conditionIndex, condition] of conditions.entries()) validateCondition(
        condition,
        style.sourceFile,
        `${path}/conditions/${conditionIndex}`,
        `${style.id}:${bonus.id}:${condition.questionId}`,
      )
    }

    for (const [conflictIndex, conflict] of canonicalConflicts.entries()) {
      const path = `/conflicts/${conflictIndex}`
      if (seenAdjustmentIds.has(conflict.id)) collector.error({
        code: 'STYLE_ADJUSTMENT_DUPLICATE_ID',
        sourceFile: style.sourceFile,
        path,
        entityId: conflict.id,
        message: `Duplicate style adjustment ${conflict.id}`,
      })
      seenAdjustmentIds.add(conflict.id)
      if (!Number.isFinite(conflict.penalty) || conflict.penalty <= 0) collector.error({
        code: 'STYLE_ADJUSTMENT_VALUE_INVALID',
        sourceFile: style.sourceFile,
        path,
        entityId: conflict.id,
        message: `Conflict ${conflict.id} has an invalid operand`,
      })
      const conditions = canonicalAdjustmentConditions(conflict.whenAll)
      if (conditions.length === 0) collector.error({
        code: 'STYLE_ADJUSTMENT_CONDITION_EMPTY',
        sourceFile: style.sourceFile,
        path: `${path}/whenAll`,
        entityId: conflict.id,
        message: `Conflict ${conflict.id} has no conditions`,
      })
      for (const priority of duplicateNumbers(
        conditions.map(({ priority: value }) => value),
      )) collector.error({
        code: 'STYLE_ADJUSTMENT_CONDITION_PRIORITY_DUPLICATE',
        sourceFile: style.sourceFile,
        path: `${path}/whenAll`,
        entityId: `${conflict.id}:${priority}`,
        message: `Conflict ${conflict.id} repeats condition priority ${priority}`,
      })
      reportDuplicateConditionIdentities(
        conditions,
        style.sourceFile,
        `${path}/whenAll`,
        conflict.id,
      )
      for (const [conditionIndex, condition] of conditions.entries()) validateCondition(
        condition,
        style.sourceFile,
        `${path}/whenAll/${conditionIndex}`,
        `${style.id}:${conflict.id}:${condition.questionId}`,
      )
    }

    const styleExclusionTags = canonicalMembershipIds(
      style.exclusionTags,
      canonicalExclusionTags,
    )
    for (const id of duplicateStrings(styleExclusionTags)) collector.error({
      code: 'STYLE_EXCLUSION_TAG_DUPLICATE',
      sourceFile: style.sourceFile,
      path: '/exclusionTags',
      entityId: id,
      message: `Style ${style.id} repeats exclusion tag ${id}`,
    })
    for (const id of styleExclusionTags) {
      if (!exclusionTagById.has(id)) collector.error({
        code: 'STYLE_EXCLUSION_TAG_UNKNOWN',
        sourceFile: style.sourceFile,
        path: '/exclusionTags',
        entityId: id,
        message: `Style ${style.id} references undeclared exclusion tag ${id}`,
      })
    }

    const supportedIntensityIds = [...style.supportedIntensityIds].sort((left, right) => {
      const leftPriority = intensityById.get(left)?.priority ?? Number.MAX_SAFE_INTEGER
      const rightPriority = intensityById.get(right)?.priority ?? Number.MAX_SAFE_INTEGER
      return leftPriority - rightPriority || compareCodePoints(left, right)
    })
    if (supportedIntensityIds.length === 0) collector.error({
      code: 'STYLE_INTENSITY_EMPTY',
      sourceFile: style.sourceFile,
      path: '/supportedIntensityIds',
      entityId: style.id,
      message: `Style ${style.id} declares no supported intensity`,
    })
    for (const id of duplicateStrings(supportedIntensityIds)) collector.error({
      code: 'STYLE_INTENSITY_DUPLICATE',
      sourceFile: style.sourceFile,
      path: '/supportedIntensityIds',
      entityId: id,
      message: `Style ${style.id} repeats intensity ${id}`,
    })
    for (const id of canonicalStringSet(supportedIntensityIds)) {
      if (!intensityById.has(id as IntensityId)) collector.error({
        code: 'STYLE_INTENSITY_UNKNOWN',
        sourceFile: style.sourceFile,
        path: '/supportedIntensityIds',
        entityId: id,
        message: `Style ${style.id} references undeclared intensity ${id}`,
      })
    }
    const canonicalMembership = canonicalStringSet(supportedIntensityIds)
    if (!sameStrings(canonicalMembership, declaredIntensityIds)
      || supportedIntensityIds.length !== canonicalIntensities.length) {
      collector.error({
        code: 'STYLE_INVENTORY_MISMATCH',
        sourceFile: style.sourceFile,
        path: '/supportedIntensityIds',
        entityId: style.id,
        message: `Style ${style.id} intensity membership does not match the taxonomy`,
        expected: declaredIntensityIds,
        received: supportedIntensityIds,
      })
    }

    const supportedNoodleIds = [...style.supportedNoodleIds].sort((left, right) => {
      const leftPriority = noodleById.get(left)?.noodle.priority ?? Number.MAX_SAFE_INTEGER
      const rightPriority = noodleById.get(right)?.noodle.priority ?? Number.MAX_SAFE_INTEGER
      return leftPriority - rightPriority || compareCodePoints(left, right)
    })
    if (supportedNoodleIds.length === 0) collector.error({
      code: 'STYLE_NOODLE_EMPTY',
      sourceFile: style.sourceFile,
      path: '/supportedNoodleIds',
      entityId: style.id,
      message: `Style ${style.id} declares no supported noodle`,
    })
    for (const id of duplicateStrings(supportedNoodleIds)) collector.error({
      code: 'STYLE_NOODLE_DUPLICATE',
      sourceFile: style.sourceFile,
      path: '/supportedNoodleIds',
      entityId: id,
      message: `Style ${style.id} repeats noodle ${id}`,
    })
    for (const id of supportedNoodleIds) {
      if (!noodleById.has(id)) collector.error({
        code: 'STYLE_NOODLE_UNKNOWN',
        sourceFile: style.sourceFile,
        path: '/supportedNoodleIds',
        entityId: id,
        message: `Style ${style.id} references undeclared noodle ${id}`,
      })
    }
    const canonicalNoodleMembership = canonicalStringSet(supportedNoodleIds)
    if (!sameStrings(canonicalNoodleMembership, declaredNoodleIds)
      || supportedNoodleIds.length !== canonicalNoodles.length) {
      collector.error({
        code: 'STYLE_INVENTORY_MISMATCH',
        sourceFile: style.sourceFile,
        path: '/supportedNoodleIds',
        entityId: style.id,
        message: `Style ${style.id} noodle membership does not match the taxonomy`,
        expected: declaredNoodleIds,
        received: supportedNoodleIds,
      })
    }

    const cores: StyleRulesStageCore[] = []
    for (const intensityId of supportedIntensityIds) {
      const intensity = intensityById.get(intensityId)
      const bodyCandidate = intensityCandidates.get(intensityId)
      if (!intensity || !bodyCandidate) continue
      const id = coreId(style.id, intensityId)
      if (seenCoreIds.has(id)) collector.error({
        code: 'STYLE_CORE_ID_COLLISION',
        sourceFile: style.sourceFile,
        path: '/supportedIntensityIds',
        entityId: id,
        message: `Generated core ID collision ${id}`,
      })
      seenCoreIds.add(id)

      const overrideRules = canonicalRules(
        style,
        style.intensityOverrides?.[intensityId]?.rules ?? [],
        `/intensityOverrides/${intensityId}/rules`,
        'style-intensity-override',
        rulePriorityByQuestionId,
      )
      reportDuplicateRuleIds(
        overrideRules,
        style,
        `/intensityOverrides/${intensityId}/rules`,
        collector,
      )
      for (const candidate of overrideRules) validateRule(
        candidate.rule,
        candidate.provenance.sourceFile,
        candidate.provenance.path,
        `${id}:${candidate.rule.questionId}`,
      )

      const selectedRules = new Map<string, RuleCandidate>()
      for (const candidate of canonicalBaseRules) {
        if (!selectedRules.has(candidate.rule.questionId)) {
          selectedRules.set(candidate.rule.questionId, candidate)
        }
      }
      selectedRules.set(bodyCandidate.rule.questionId, bodyCandidate)
      for (const candidate of overrideRules) {
        if (!selectedRules.has(candidate.rule.questionId)
          && !rulePriorityByQuestionId.has(candidate.rule.questionId)) collector.error({
          code: 'STYLE_INVENTORY_MISMATCH',
          sourceFile: style.sourceFile,
          path: `/intensityOverrides/${intensityId}/rules`,
          entityId: `${id}:${candidate.rule.questionId}`,
          message: `Override adds non-taxonomy rule ${candidate.rule.questionId}`,
        })
        selectedRules.set(candidate.rule.questionId, candidate)
      }

      const resolvedRules: ResolvedStyleCoreRule[] = []
      for (const questionId of requiredRuleQuestionIds) {
        const selected = selectedRules.get(questionId)
        if (!selected) {
          collector.error({
            code: 'STYLE_RULE_MISSING',
            sourceFile: style.sourceFile,
            path: '/baseRules',
            entityId: `${id}:${questionId}`,
            message: `Core ${id} is missing rule ${questionId}`,
          })
          continue
        }
        resolvedRules.push({
          questionId: selected.rule.questionId,
          tiers: canonicalTiers(selected.rule),
          provenance: { ...selected.provenance },
        })
      }

      const overrideFormRule = overrideRules.find(
        ({ rule }) => rule.questionId === 'form',
      )?.rule
      if (family && overrideFormRule && !overrideFormRule.tiers.some(({ tier, optionIds }) => (
        tier === 'exact' && optionIds.includes(family.formOptionId)
      ))) collector.error({
        code: 'STYLE_FAMILY_MISMATCH',
        sourceFile: style.sourceFile,
        path: `/intensityOverrides/${intensityId}/rules`,
        entityId: style.id,
        message: `Style ${style.id} override form rule does not match family ${style.family}`,
        expected: family.formOptionId,
        received: canonicalTiers(overrideFormRule),
      })

      const rules: CompiledStyleRule[] = resolvedRules
        .map((resolvedRule) => {
          const id = ruleId(coreId(style.id, intensityId), resolvedRule.questionId)
          if (seenRuleIds.has(id)) collector.error({
            code: 'STYLE_RULE_DUPLICATE_ID',
            sourceFile: resolvedRule.provenance.sourceFile,
            path: resolvedRule.provenance.path,
            entityId: id,
            message: `Generated rule ID collision ${id}`,
          })
          seenRuleIds.add(id)
          return {
            id,
            parentStyleId: style.id,
            parentCoreId: coreId(style.id, intensityId),
            questionId: resolvedRule.questionId,
            priority: rulePriorityByQuestionId.get(resolvedRule.questionId)
              ?? Number.MAX_SAFE_INTEGER,
            targets: resolvedRule.tiers
              .flatMap(({ tier, optionIds }) => optionIds.map((optionId) => ({
                optionId,
                tier,
                priority: optionPriority(resolvedRule.questionId, optionId),
              })))
              .sort((left, right) => (
                left.priority - right.priority
                  || compareCodePoints(left.optionId, right.optionId)
                  || tierPriorities[left.tier] - tierPriorities[right.tier]
              )),
            fallbackTier: 'miss' as const,
            provenance: { ...resolvedRule.provenance },
          }
        })
        .sort((left, right) => (
          left.priority - right.priority || compareCodePoints(left.id, right.id)
        ))

      const subtypes: CompiledSubtype[] = []
      for (const noodleId of supportedNoodleIds) {
        const candidate = noodleById.get(noodleId)
        if (!candidate) continue
        const id = subtypeId(coreId(style.id, intensityId), noodleId)
        if (seenSubtypeIds.has(id)) collector.error({
          code: 'STYLE_SUBTYPE_ID_COLLISION',
          sourceFile: style.sourceFile,
          path: '/supportedNoodleIds',
          entityId: id,
          message: `Generated subtype ID collision ${id}`,
        })
        seenSubtypeIds.add(id)
        subtypes.push({
          id,
          parentStyleId: style.id,
          parentCoreId: coreId(style.id, intensityId),
          noodleId,
          priority: candidate.noodle.priority,
          messageIds: {
            labelTemplate: candidate.noodle.labelMessageId,
            summaryTemplate: candidate.noodle.summaryMessageId,
          },
          provenance: [
            { sourceFile: style.sourceFile, path: '' },
            {
              sourceFile: definition.taxonomy.sourceFile,
              path: bodyCandidate.provenance.path,
            },
            { sourceFile: definition.taxonomy.sourceFile, path: candidate.path },
          ],
        })
      }
      const generatedNoodleIds = subtypes.map(({ noodleId }) => noodleId)
      if (!sameStrings(generatedNoodleIds, supportedNoodleIds)) collector.error({
        code: 'STYLE_INVENTORY_MISMATCH',
        sourceFile: style.sourceFile,
        path: '/supportedNoodleIds',
        entityId: coreId(style.id, intensityId),
        message: `Generated subtype matrix does not match core ${id}`,
        expected: supportedNoodleIds,
        received: generatedNoodleIds,
      })

      cores.push({
        id,
        parentStyleId: style.id,
        intensityId,
        priority: intensity.priority,
        messageIds: {
          labelTemplate: intensity.labelMessageId,
          summaryTemplate: intensity.summaryMessageId,
        },
        rules,
        subtypes,
        provenance: [
          { sourceFile: style.sourceFile, path: '' },
          { sourceFile: definition.taxonomy.sourceFile, path: bodyCandidate.provenance.path },
        ],
      })
    }

    const appliesToCoreIds = cores.map(({ id }) => id)
    const compileConditions = (
      conditions: readonly AdjustmentConditionDefinition[],
      path: string,
    ): CompiledAdjustmentCondition[] => canonicalAdjustmentConditions(conditions)
      .map((condition, index) => ({
        priority: condition.priority,
        questionId: condition.questionId,
        optionIds: [...condition.optionIds],
        provenance: {
          sourceFile: style.sourceFile,
          path: `${path}/${index}`,
        },
      }))
    const adjustments: CompiledAdjustment[] = [
      ...canonicalBonuses.map((bonus, index) => ({
        kind: 'bonus' as const,
        id: bonus.id,
        priority: bonus.priority,
        labelMessageId: bonus.labelMessageId,
        points: bonus.points,
        minMatches: bonus.minMatches,
        conditions: compileConditions(bonus.conditions, `/bonuses/${index}/conditions`),
        appliesToCoreIds: [...appliesToCoreIds],
        provenance: { sourceFile: style.sourceFile, path: `/bonuses/${index}` },
      })),
      ...canonicalConflicts.map((conflict, index) => ({
        kind: 'conflict' as const,
        id: conflict.id,
        priority: conflict.priority,
        labelMessageId: conflict.labelMessageId,
        penalty: conflict.penalty,
        whenAll: compileConditions(conflict.whenAll, `/conflicts/${index}/whenAll`),
        appliesToCoreIds: [...appliesToCoreIds],
        provenance: { sourceFile: style.sourceFile, path: `/conflicts/${index}` },
      })),
    ]

    stageStyles.push({
      id: style.id,
      family: style.family,
      displayPriority: style.displayPriority,
      messageIds: { ...style.messageIds },
      accent: style.accent,
      supportedIntensityIds,
      supportedNoodleIds,
      cores,
      adjustments,
      exclusionTags: styleExclusionTags,
      provenance: { sourceFile: style.sourceFile, path: '' },
    })
  }

  const diagnostics = collector.toArray()
  if (collector.hasErrors()) return { ok: false, diagnostics }
  return proveStyleModel({
    kind: 'style-rules-stage',
    modelVersion: definition.modelVersion,
    questionModelVersion: questionModel.metadata.modelVersion,
    questionSemanticHash: questionModel.metadata.semanticHash,
    exclusionTags: compiledExclusionTags,
    styles: stageStyles,
  }, definition)
}

function reportDuplicatePriorities(
  priorities: readonly number[],
  sourceFile: string,
  path: string,
  collector: DiagnosticCollector,
) {
  for (const priority of duplicateNumbers(priorities)) collector.error({
    code: 'STYLE_PRIORITY_DUPLICATE',
    sourceFile,
    path,
    entityId: String(priority),
    message: `Duplicate taxonomy priority ${priority}`,
  })
}

function canonicalRules(
  style: StyleDefinition,
  rules: readonly StyleRuleDefinition[],
  path: string,
  inheritedFrom: StyleRuleProvenance['inheritedFrom'],
  priorities: ReadonlyMap<string, number>,
): RuleCandidate[] {
  return [...rules]
    .sort((left, right) => (
      (priorities.get(left.questionId) ?? Number.MAX_SAFE_INTEGER)
        - (priorities.get(right.questionId) ?? Number.MAX_SAFE_INTEGER)
        || compareCodePoints(left.questionId, right.questionId)
        || compareStableValues(left, right)
    ))
    .map((rule, index) => ({
      rule,
      provenance: {
        sourceFile: style.sourceFile,
        path: `${path}/${index}`,
        inheritedFrom,
      },
    }))
}

function reportDuplicateRuleIds(
  rules: readonly RuleCandidate[],
  style: StyleDefinition,
  path: string,
  collector: DiagnosticCollector,
) {
  for (const questionId of duplicateStrings(rules.map(({ rule }) => rule.questionId))) {
    collector.error({
      code: 'STYLE_RULE_DUPLICATE_ID',
      sourceFile: style.sourceFile,
      path,
      entityId: `${style.id}:${questionId}`,
      message: `Style ${style.id} repeats rule ${questionId}`,
    })
  }
}

function canonicalMembershipIds<
  Id extends string,
  Entry extends { readonly id: Id; readonly priority: number },
>(values: readonly Id[], taxonomy: readonly Entry[]): Id[] {
  const priorityById = new Map(taxonomy.map(({ id, priority }) => [id, priority]))
  return [...values].sort((left, right) => (
    (priorityById.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (priorityById.get(right) ?? Number.MAX_SAFE_INTEGER)
      || compareCodePoints(left, right)
  ))
}
