import { createHash } from 'node:crypto'

import { deepFreeze } from '../../contracts/deep-freeze.js'
import type {
  CompiledAdjustment,
  CompiledAdjustmentCondition,
  CompiledCore,
  CompiledExclusionTag,
  CompiledStyle,
  CompiledStyleInventoryRecord,
  CompiledStyleModel,
  CompileStylesResult,
  IntensityId,
  MatchTier,
  NoodleId,
  StyleDefinition,
  StyleDefinitionBundleSource,
  StyleFamilyId,
  StyleRuleDefinition,
  StyleRulesStage,
  StyleRulesStageStyle,
  StyleSourceReference,
} from '../../contracts/style-model.js'
import { compareCodePoints } from '../../contracts/source-path.js'
import { DiagnosticCollector } from '../collector.js'
import { stableJson } from '../stable-json.js'

const acceptedQuestionModelVersion = 'batch2a.1.0'
const acceptedQuestionSemanticHash =
  'd1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d'

const expectedStyles = [
  ['shoyu-chintan', 'soup'],
  ['shio-chintan', 'soup'],
  ['miso', 'soup'],
  ['tonkotsu', 'soup'],
  ['chicken-chintan', 'soup'],
  ['chicken-paitan', 'soup'],
  ['duck-chintan', 'soup'],
  ['duck-paitan', 'soup'],
  ['gyokai', 'soup'],
  ['shellfish-dashi', 'soup'],
  ['iekei', 'soup'],
  ['jiro', 'soup'],
  ['hakata', 'soup'],
  ['sapporo', 'soup'],
  ['konbusui-tsukemen', 'tsukemen'],
  ['gyokai-tsukemen', 'tsukemen'],
  ['aburasoba', 'dry'],
  ['taiwan-mazesoba', 'dry'],
] as const satisfies readonly (readonly [string, StyleFamilyId])[]

const expectedIntensities = [
  ['clean', 0],
  ['standard', 1],
  ['heavy', 2],
] as const satisfies readonly (readonly [IntensityId, number])[]

const expectedNoodles = [
  ['thin-straight', 0],
  ['medium-thin-straight', 1],
  ['medium-thick-straight', 2],
  ['medium-thick-wavy', 3],
  ['extra-thick', 4],
] as const satisfies readonly (readonly [NoodleId, number])[]

const expectedRuleQuestions = [
  'form',
  'archetype',
  'tare',
  'source',
  'body',
  'noodle',
  'signature',
] as const

const expectedExclusionTags = [
  'pork',
  'chicken',
  'duck',
  'fish-seafood',
  'shellfish',
  'dairy',
] as const

const tierPriority: Readonly<Record<MatchTier, number>> = {
  exact: 0,
  adjacent: 1,
  partial: 2,
}

function sha256(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function duplicates(values: readonly string[]) {
  const seen = new Set<string>()
  const duplicate = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value)
    seen.add(value)
  }
  return [...duplicate].sort(compareCodePoints)
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length
    && left.every((value, index) => value === right[index])
}

function pointerToken(value: string) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function inventoryError(
  collector: DiagnosticCollector,
  sourceFile: string,
  path: string,
  entityId: string,
  message: string,
  expected?: unknown,
  received?: unknown,
) {
  collector.error({
    code: 'STYLE_INVENTORY_MISMATCH',
    sourceFile,
    path,
    entityId,
    message,
    ...(expected === undefined ? {} : { expected }),
    ...(received === undefined ? {} : { received }),
  })
}

function parentError(
  collector: DiagnosticCollector,
  sourceFile: string,
  path: string,
  entityId: string,
  expected: unknown,
  received: unknown,
) {
  collector.error({
    code: 'STYLE_PARENT_MISMATCH',
    sourceFile,
    path,
    entityId,
    message: `Compiled style parent identity mismatch for ${entityId}`,
    expected,
    received,
  })
}

function validateExactIds(
  collector: DiagnosticCollector,
  actual: readonly string[],
  expected: readonly string[],
  sourceFile: string,
  path: string,
  entityId: string,
  label: string,
) {
  if (!sameStrings(actual, expected)) inventoryError(
    collector,
    sourceFile,
    path,
    entityId,
    `${label} does not match the complete canonical inventory`,
    expected,
    actual,
  )
}

function compareProvenance(left: StyleSourceReference, right: StyleSourceReference) {
  return compareCodePoints(left.sourceFile, right.sourceFile)
    || compareCodePoints(left.path, right.path)
    || compareCodePoints(
      'inheritedFrom' in left ? String(left.inheritedFrom) : '',
      'inheritedFrom' in right ? String(right.inheritedFrom) : '',
    )
}

function validateQuestionIdentity(
  stage: StyleRulesStage,
  source: StyleDefinitionBundleSource,
  collector: DiagnosticCollector,
) {
  if (stage.questionModelVersion !== acceptedQuestionModelVersion) collector.error({
    code: 'STYLE_MODEL_VERSION_MISMATCH',
    sourceFile: source.sourceFile,
    path: '/questionModelVersion',
    entityId: stage.questionModelVersion,
    message: 'Question model version does not match the accepted Batch 2A identity',
    expected: acceptedQuestionModelVersion,
    received: stage.questionModelVersion,
  })
  if (stage.questionSemanticHash !== acceptedQuestionSemanticHash) collector.error({
    code: 'STYLE_MODEL_VERSION_MISMATCH',
    sourceFile: source.sourceFile,
    path: '/questionSemanticHash',
    entityId: stage.questionSemanticHash,
    message: 'Question semantic hash does not match the accepted Batch 2A identity',
    expected: acceptedQuestionSemanticHash,
    received: stage.questionSemanticHash,
  })
  if (stage.modelVersion !== source.modelVersion) collector.error({
    code: 'STYLE_MODEL_VERSION_MISMATCH',
    sourceFile: source.sourceFile,
    path: '/modelVersion',
    entityId: stage.modelVersion,
    message: 'Proof-stage style model version does not match its canonical source',
    expected: source.modelVersion,
    received: stage.modelVersion,
  })
}

function validateGlobalDuplicates(stage: StyleRulesStage, collector: DiagnosticCollector) {
  const styles = stage.styles
  const cores = styles.flatMap(({ cores: values }) => values)
  const subtypes = cores.flatMap(({ subtypes: values }) => values)
  const rules = cores.flatMap(({ rules: values }) => values)
  const adjustments = styles.flatMap(({ adjustments: values }) => values)
  for (const id of duplicates(styles.map(({ id }) => id))) collector.error({
    code: 'STYLE_DUPLICATE_ID',
    sourceFile: stage.styles.find((style) => style.id === id)?.provenance.sourceFile
      ?? 'runtime://style-proof',
    path: '/styles',
    entityId: id,
    message: `Duplicate compiled style ID ${id}`,
  })
  for (const id of duplicates(cores.map(({ id }) => id))) collector.error({
    code: 'STYLE_CORE_ID_COLLISION',
    sourceFile: cores.find((core) => core.id === id)?.provenance[0]?.sourceFile
      ?? 'runtime://style-proof',
    path: '/cores',
    entityId: id,
    message: `Global compiled core ID collision ${id}`,
  })
  for (const id of duplicates(subtypes.map(({ id }) => id))) collector.error({
    code: 'STYLE_SUBTYPE_ID_COLLISION',
    sourceFile: subtypes.find((subtype) => subtype.id === id)?.provenance[0]?.sourceFile
      ?? 'runtime://style-proof',
    path: '/subtypes',
    entityId: id,
    message: `Global compiled subtype ID collision ${id}`,
  })
  for (const id of duplicates(rules.map(({ id }) => id))) collector.error({
    code: 'STYLE_RULE_DUPLICATE_ID',
    sourceFile: rules.find((rule) => rule.id === id)?.provenance.sourceFile
      ?? 'runtime://style-proof',
    path: '/rules',
    entityId: id,
    message: `Global compiled rule ID collision ${id}`,
  })
  for (const id of duplicates(adjustments.map(({ id }) => id))) collector.error({
    code: 'STYLE_ADJUSTMENT_DUPLICATE_ID',
    sourceFile: adjustments.find((adjustment) => adjustment.id === id)
      ?.provenance.sourceFile ?? 'runtime://style-proof',
    path: '/adjustments',
    entityId: id,
    message: `Global compiled adjustment ID collision ${id}`,
  })
}

function validateTargets(
  style: StyleRulesStageStyle,
  core: CompiledCore,
  collector: DiagnosticCollector,
) {
  for (const rule of core.rules) {
    const path = `/styles/${pointerToken(style.id)}/cores/${pointerToken(core.id)}`
      + `/rules/${pointerToken(rule.id)}`
    if (rule.parentStyleId !== style.id) parentError(
      collector,
      rule.provenance.sourceFile,
      `${path}/parentStyleId`,
      rule.id,
      style.id,
      rule.parentStyleId,
    )
    if (rule.parentCoreId !== core.id
      || rule.id !== `${core.id}:${rule.questionId}`) parentError(
      collector,
      rule.provenance.sourceFile,
      `${path}/parentCoreId`,
      rule.id,
      { parentCoreId: core.id, id: `${core.id}:${rule.questionId}` },
      { parentCoreId: rule.parentCoreId, id: rule.id },
    )
    const canonicalTargets = [...rule.targets].sort((left, right) => (
      left.priority - right.priority
        || compareCodePoints(left.optionId, right.optionId)
        || tierPriority[left.tier] - tierPriority[right.tier]
    ))
    if (stableJson(canonicalTargets) !== stableJson(rule.targets)) inventoryError(
      collector,
      rule.provenance.sourceFile,
      `${path}/targets`,
      rule.id,
      `Rule ${rule.id} targets are not canonically ordered`,
    )
    if (rule.fallbackTier !== 'miss') inventoryError(
      collector,
      rule.provenance.sourceFile,
      `${path}/fallbackTier`,
      rule.id,
      `Rule ${rule.id} does not preserve the required miss fallback`,
      'miss',
      rule.fallbackTier,
    )
  }
}

function conditionIdentity(
  condition: Pick<CompiledAdjustmentCondition, 'questionId' | 'optionIds'>,
) {
  return stableJson({
    questionId: condition.questionId,
    optionIds: condition.optionIds,
  })
}

function validateAdjustmentOrder(
  style: StyleRulesStageStyle,
  expectedCoreIds: readonly string[],
  collector: DiagnosticCollector,
) {
  const phase = (adjustment: CompiledAdjustment) => adjustment.kind === 'bonus' ? 0 : 1
  const canonical = [...style.adjustments].sort((left, right) => (
    phase(left) - phase(right)
      || left.priority - right.priority
      || compareCodePoints(left.id, right.id)
  ))
  if (stableJson(canonical) !== stableJson(style.adjustments)) inventoryError(
    collector,
    style.provenance.sourceFile,
    `/styles/${pointerToken(style.id)}/adjustments`,
    style.id,
    `Style ${style.id} adjustments are not canonically ordered`,
  )
  for (const adjustment of style.adjustments) {
    const path = `/styles/${pointerToken(style.id)}/adjustments/${pointerToken(adjustment.id)}`
    if (!sameStrings(adjustment.appliesToCoreIds, expectedCoreIds)) inventoryError(
      collector,
      adjustment.provenance.sourceFile,
      `${path}/appliesToCoreIds`,
      adjustment.id,
      `Adjustment ${adjustment.id} applies outside its canonical style cores`,
      expectedCoreIds,
      adjustment.appliesToCoreIds,
    )
    const conditions = adjustment.kind === 'bonus'
      ? adjustment.conditions
      : adjustment.whenAll
    const canonicalConditions = [...conditions].sort((left, right) => (
      left.priority - right.priority
        || compareCodePoints(conditionIdentity(left), conditionIdentity(right))
    ))
    if (stableJson(canonicalConditions) !== stableJson(conditions)) inventoryError(
      collector,
      adjustment.provenance.sourceFile,
      `${path}/${adjustment.kind === 'bonus' ? 'conditions' : 'whenAll'}`,
      adjustment.id,
      `Adjustment ${adjustment.id} conditions are not canonically ordered`,
    )
  }
}

function validateInventory(
  stage: StyleRulesStage,
  source: StyleDefinitionBundleSource,
  collector: DiagnosticCollector,
) {
  const expectedStyleIds = expectedStyles.map(([id]) => id)
  validateExactIds(
    collector,
    stage.styles.map(({ id }) => id),
    expectedStyleIds,
    source.sourceFile,
    '/styles',
    stage.modelVersion,
    'Compiled style IDs',
  )
  validateExactIds(
    collector,
    stage.exclusionTags.map(({ id }) => id),
    expectedExclusionTags,
    source.taxonomy.sourceFile,
    '/exclusionTags',
    stage.modelVersion,
    'Compiled exclusion-tag IDs',
  )
  const sourceTags = new Map(source.taxonomy.exclusionTags.map((tag) => [tag.id, tag]))
  for (const tagId of expectedExclusionTags) {
    const tag = stage.exclusionTags.find(({ id }) => id === tagId)
    const sourceTag = sourceTags.get(tagId)
    if (!tag) continue
    if (!sourceTag || tag.priority !== sourceTag.priority
      || tag.questionId !== 'exclusions' || tag.optionId !== tagId) {
      inventoryError(
        collector,
        tag.provenance.sourceFile,
        `/exclusionTags/${pointerToken(tag.id)}`,
        tag.id,
        `Exclusion tag ${tag.id} does not match its canonical binding`,
        { priority: sourceTag?.priority, questionId: 'exclusions', optionId: tagId },
        { priority: tag.priority, questionId: tag.questionId, optionId: tag.optionId },
      )
    }
  }

  const sourceById = new Map(source.definitions.map((style) => [style.id, style]))
  const stageStyles = [...stage.styles].sort((left, right) => (
    left.displayPriority - right.displayPriority || compareCodePoints(left.id, right.id)
  ))
  for (const [displayPriority, [styleId, family]] of expectedStyles.entries()) {
    const style = stageStyles.find(({ id }) => id === styleId)
    if (!style) continue
    const sourceStyle = sourceById.get(styleId)
    const stylePath = `/styles/${pointerToken(styleId)}`
    if (style.displayPriority !== displayPriority || style.family !== family) inventoryError(
      collector,
      style.provenance.sourceFile,
      stylePath,
      style.id,
      `Style ${style.id} does not match its canonical priority and family`,
      { displayPriority, family },
      { displayPriority: style.displayPriority, family: style.family },
    )
    if (!sourceStyle || style.provenance.sourceFile !== sourceStyle.sourceFile) inventoryError(
      collector,
      style.provenance.sourceFile,
      `${stylePath}/provenance`,
      style.id,
      `Style ${style.id} does not retain its focused canonical source ownership`,
      sourceStyle?.sourceFile,
      style.provenance.sourceFile,
    )
    validateExactIds(
      collector,
      style.supportedIntensityIds,
      expectedIntensities.map(([id]) => id),
      style.provenance.sourceFile,
      `${stylePath}/supportedIntensityIds`,
      style.id,
      `Style ${style.id} intensity membership`,
    )
    validateExactIds(
      collector,
      style.supportedNoodleIds,
      expectedNoodles.map(([id]) => id),
      style.provenance.sourceFile,
      `${stylePath}/supportedNoodleIds`,
      style.id,
      `Style ${style.id} noodle membership`,
    )

    const expectedCoreIds = expectedIntensities.map(([intensityId]) => (
      `${style.id}:${intensityId}`
    ))
    validateExactIds(
      collector,
      style.cores.map(({ id }) => id),
      expectedCoreIds,
      style.provenance.sourceFile,
      `${stylePath}/cores`,
      style.id,
      `Style ${style.id} core IDs`,
    )
    for (const [intensityId, priority] of expectedIntensities) {
      const id = `${style.id}:${intensityId}`
      const core = style.cores.find((candidate) => candidate.id === id)
      if (!core) continue
      const corePath = `${stylePath}/cores/${pointerToken(id)}`
      if (core.parentStyleId !== style.id || core.id !== id) parentError(
        collector,
        core.provenance[0]?.sourceFile ?? style.provenance.sourceFile,
        `${corePath}/parentStyleId`,
        core.id,
        { parentStyleId: style.id, id },
        { parentStyleId: core.parentStyleId, id: core.id },
      )
      if (core.intensityId !== intensityId || core.priority !== priority) inventoryError(
        collector,
        core.provenance[0]?.sourceFile ?? style.provenance.sourceFile,
        corePath,
        core.id,
        `Core ${core.id} does not match its canonical intensity inventory`,
        { intensityId, priority },
        { intensityId: core.intensityId, priority: core.priority },
      )
      const expectedSubtypeIds = expectedNoodles.map(([noodleId]) => `${id}:${noodleId}`)
      validateExactIds(
        collector,
        core.subtypes.map(({ id: subtypeId }) => subtypeId),
        expectedSubtypeIds,
        core.provenance[0]?.sourceFile ?? style.provenance.sourceFile,
        `${corePath}/subtypes`,
        core.id,
        `Core ${core.id} subtype IDs`,
      )
      for (const [noodleId, noodlePriority] of expectedNoodles) {
        const subtypeId = `${id}:${noodleId}`
        const subtype = core.subtypes.find((candidate) => candidate.id === subtypeId)
        if (!subtype) continue
        if (subtype.parentStyleId !== style.id || subtype.parentCoreId !== core.id
          || subtype.id !== subtypeId) parentError(
          collector,
          subtype.provenance[0]?.sourceFile ?? style.provenance.sourceFile,
          `${corePath}/subtypes/${pointerToken(subtypeId)}`,
          subtype.id,
          { parentStyleId: style.id, parentCoreId: core.id, id: subtypeId },
          {
            parentStyleId: subtype.parentStyleId,
            parentCoreId: subtype.parentCoreId,
            id: subtype.id,
          },
        )
        if (subtype.noodleId !== noodleId || subtype.priority !== noodlePriority) {
          inventoryError(
            collector,
            subtype.provenance[0]?.sourceFile ?? style.provenance.sourceFile,
            `${corePath}/subtypes/${pointerToken(subtypeId)}`,
            subtype.id,
            `Subtype ${subtype.id} does not match its canonical noodle inventory`,
            { noodleId, priority: noodlePriority },
            { noodleId: subtype.noodleId, priority: subtype.priority },
          )
        }
      }

      const expectedRuleIds = expectedRuleQuestions.map((questionId) => `${id}:${questionId}`)
      validateExactIds(
        collector,
        core.rules.map(({ id: ruleId }) => ruleId),
        expectedRuleIds,
        core.provenance[0]?.sourceFile ?? style.provenance.sourceFile,
        `${corePath}/rules`,
        core.id,
        `Core ${core.id} rule IDs`,
      )
      for (const [rulePriority, questionId] of expectedRuleQuestions.entries()) {
        const rule = core.rules.find((candidate) => candidate.questionId === questionId)
        if (rule && rule.priority !== rulePriority) inventoryError(
          collector,
          rule.provenance.sourceFile,
          `${corePath}/rules/${pointerToken(rule.id)}/priority`,
          rule.id,
          `Rule ${rule.id} does not match canonical question priority`,
          rulePriority,
          rule.priority,
        )
      }
      validateTargets(style, core, collector)
    }
    validateAdjustmentOrder(style, expectedCoreIds, collector)
  }

  const cores = stage.styles.flatMap(({ cores: values }) => values)
  const subtypes = cores.flatMap(({ subtypes: values }) => values)
  const rules = cores.flatMap(({ rules: values }) => values)
  const adjustments = stage.styles.flatMap(({ adjustments: values }) => values)
  const counts = {
    styles: stage.styles.length,
    cores: cores.length,
    subtypes: subtypes.length,
    rules: rules.length,
    adjustments: adjustments.length,
    bonuses: adjustments.filter(({ kind }) => kind === 'bonus').length,
    conflicts: adjustments.filter(({ kind }) => kind === 'conflict').length,
  }
  const expectedCounts = {
    styles: 18,
    cores: 54,
    subtypes: 270,
    rules: 378,
    adjustments: 25,
    bonuses: 18,
    conflicts: 7,
  }
  if (stableJson(counts) !== stableJson(expectedCounts)) inventoryError(
    collector,
    source.sourceFile,
    '/inventory',
    stage.modelVersion,
    'Compiled style entity counts do not match the complete canonical inventory',
    expectedCounts,
    counts,
  )
}

function optionPriorities(stage: StyleRulesStage) {
  const priorities = new Map<string, Map<string, number>>()
  for (const style of stage.styles) for (const core of style.cores) {
    for (const rule of core.rules) for (const target of rule.targets) {
      const question = priorities.get(rule.questionId) ?? new Map<string, number>()
      question.set(target.optionId, target.priority)
      priorities.set(rule.questionId, question)
    }
  }
  return priorities
}

function canonicalRule(
  rule: StyleRuleDefinition,
  questionPriorities: ReadonlyMap<string, number>,
  options: ReadonlyMap<string, ReadonlyMap<string, number>>,
) {
  const optionPriority = options.get(rule.questionId)
  return {
    questionId: rule.questionId,
    tiers: rule.tiers
      .map(({ tier, optionIds }) => ({
        tier,
        optionIds: [...optionIds].sort((left, right) => (
          (optionPriority?.get(left) ?? Number.MAX_SAFE_INTEGER)
            - (optionPriority?.get(right) ?? Number.MAX_SAFE_INTEGER)
            || compareCodePoints(left, right)
        )),
      }))
      .sort((left, right) => (
        tierPriority[left.tier] - tierPriority[right.tier]
          || compareCodePoints(left.tier, right.tier)
          || compareCodePoints(stableJson(left.optionIds), stableJson(right.optionIds))
      )),
    _priority: questionPriorities.get(rule.questionId) ?? Number.MAX_SAFE_INTEGER,
  }
}

function canonicalRules(
  rules: readonly StyleRuleDefinition[],
  questionPriorities: ReadonlyMap<string, number>,
  options: ReadonlyMap<string, ReadonlyMap<string, number>>,
) {
  return rules.map((rule) => canonicalRule(rule, questionPriorities, options))
    .sort((left, right) => (
      left._priority - right._priority
        || compareCodePoints(left.questionId, right.questionId)
        || compareCodePoints(stableJson(left), stableJson(right))
    ))
    .map(({ questionId, tiers }) => ({ questionId, tiers }))
}

function canonicalConditions(
  conditions: StyleDefinition['bonuses'][number]['conditions'],
  options: ReadonlyMap<string, ReadonlyMap<string, number>>,
) {
  return conditions.map((condition) => {
    const optionPriority = options.get(condition.questionId)
    return {
      priority: condition.priority,
      questionId: condition.questionId,
      optionIds: [...condition.optionIds].sort((left, right) => (
        (optionPriority?.get(left) ?? Number.MAX_SAFE_INTEGER)
          - (optionPriority?.get(right) ?? Number.MAX_SAFE_INTEGER)
          || compareCodePoints(left, right)
      )),
    }
  }).sort((left, right) => (
    left.priority - right.priority
      || compareCodePoints(conditionIdentity(left), conditionIdentity(right))
  ))
}

function canonicalSourceProjection(
  source: StyleDefinitionBundleSource,
  stage: StyleRulesStage,
) {
  const intensityPriority = new Map(
    source.taxonomy.intensities.map(({ id, priority }) => [id, priority]),
  )
  const noodlePriority = new Map(source.taxonomy.noodles.map(({ id, priority }) => [id, priority]))
  const exclusionPriority = new Map(
    source.taxonomy.exclusionTags.map(({ id, priority }) => [id, priority]),
  )
  const questionPriority = new Map(
    source.taxonomy.ruleQuestions.map(({ questionId, priority }) => [questionId, priority]),
  )
  const options = optionPriorities(stage)
  const taxonomy = {
    families: [...source.taxonomy.families].sort((left, right) => (
      left.priority - right.priority || compareCodePoints(left.id, right.id)
    )).map(({ id, priority, formOptionId }) => ({ id, priority, formOptionId })),
    intensities: [...source.taxonomy.intensities].sort((left, right) => (
      left.priority - right.priority || compareCodePoints(left.id, right.id)
    )).map(({ id, priority, labelMessageId, summaryMessageId, bodyRule }) => ({
      id,
      priority,
      labelMessageId,
      summaryMessageId,
      bodyRule: canonicalRules([bodyRule], questionPriority, options)[0],
    })),
    noodles: [...source.taxonomy.noodles].sort((left, right) => (
      left.priority - right.priority || compareCodePoints(left.id, right.id)
    )).map(({ id, priority, labelMessageId, summaryMessageId }) => ({
      id,
      priority,
      labelMessageId,
      summaryMessageId,
    })),
    exclusionTags: [...source.taxonomy.exclusionTags].sort((left, right) => (
      left.priority - right.priority || compareCodePoints(left.id, right.id)
    )).map(({ id, priority, exclusionsOptionId }) => ({ id, priority, exclusionsOptionId })),
    ruleQuestions: [...source.taxonomy.ruleQuestions].sort((left, right) => (
      left.priority - right.priority || compareCodePoints(left.questionId, right.questionId)
    )).map(({ questionId, priority, source: owner }) => ({ questionId, priority, source: owner })),
  }
  const definitions = [...source.definitions].sort((left, right) => (
    left.displayPriority - right.displayPriority || compareCodePoints(left.id, right.id)
  )).map((style) => {
    const bonuses = [...style.bonuses].sort((left, right) => (
      left.priority - right.priority || compareCodePoints(left.id, right.id)
    )).map(({ id, priority, labelMessageId, points, minMatches, conditions }) => ({
      id,
      priority,
      labelMessageId,
      points,
      minMatches,
      conditions: canonicalConditions(conditions, options),
    }))
    const conflicts = [...style.conflicts].sort((left, right) => (
      left.priority - right.priority || compareCodePoints(left.id, right.id)
    )).map(({ id, priority, labelMessageId, penalty, whenAll }) => ({
      id,
      priority,
      labelMessageId,
      penalty,
      whenAll: canonicalConditions(whenAll, options),
    }))
    const intensityOverrides = style.intensityOverrides
      ? Object.fromEntries(Object.entries(style.intensityOverrides)
        .sort(([left], [right]) => (
          (intensityPriority.get(left as IntensityId) ?? Number.MAX_SAFE_INTEGER)
            - (intensityPriority.get(right as IntensityId) ?? Number.MAX_SAFE_INTEGER)
            || compareCodePoints(left, right)
        ))
        .map(([id, override]) => [id, override
          ? { rules: canonicalRules(override.rules, questionPriority, options) }
          : override]))
      : undefined
    return {
      id: style.id,
      family: style.family,
      displayPriority: style.displayPriority,
      messageIds: { ...style.messageIds },
      accent: style.accent,
      supportedIntensityIds: [...style.supportedIntensityIds].sort((left, right) => (
        (intensityPriority.get(left) ?? Number.MAX_SAFE_INTEGER)
          - (intensityPriority.get(right) ?? Number.MAX_SAFE_INTEGER)
          || compareCodePoints(left, right)
      )),
      supportedNoodleIds: [...style.supportedNoodleIds].sort((left, right) => (
        (noodlePriority.get(left) ?? Number.MAX_SAFE_INTEGER)
          - (noodlePriority.get(right) ?? Number.MAX_SAFE_INTEGER)
          || compareCodePoints(left, right)
      )),
      baseRules: canonicalRules(style.baseRules, questionPriority, options),
      ...(intensityOverrides === undefined ? {} : { intensityOverrides }),
      bonuses,
      conflicts,
      exclusionTags: [...style.exclusionTags].sort((left, right) => (
        (exclusionPriority.get(left) ?? Number.MAX_SAFE_INTEGER)
          - (exclusionPriority.get(right) ?? Number.MAX_SAFE_INTEGER)
          || compareCodePoints(left, right)
      )),
    }
  })
  return { modelVersion: source.modelVersion, taxonomy, definitions }
}

function projectCondition(condition: CompiledAdjustmentCondition) {
  return {
    priority: condition.priority,
    questionId: condition.questionId,
    optionIds: condition.optionIds,
  }
}

function projectAdjustment(adjustment: CompiledAdjustment) {
  return adjustment.kind === 'bonus'
    ? {
        kind: adjustment.kind,
        id: adjustment.id,
        priority: adjustment.priority,
        points: adjustment.points,
        minMatches: adjustment.minMatches,
        conditions: adjustment.conditions.map(projectCondition),
        appliesToCoreIds: adjustment.appliesToCoreIds,
      }
    : {
        kind: adjustment.kind,
        id: adjustment.id,
        priority: adjustment.priority,
        penalty: adjustment.penalty,
        whenAll: adjustment.whenAll.map(projectCondition),
        appliesToCoreIds: adjustment.appliesToCoreIds,
      }
}

function semanticProjection(
  stage: StyleRulesStage,
  styles: readonly CompiledStyle[],
) {
  return {
    modelVersion: stage.modelVersion,
    questionModelVersion: stage.questionModelVersion,
    questionSemanticHash: stage.questionSemanticHash,
    exclusionTags: stage.exclusionTags.map(({ id, priority, questionId, optionId }) => ({
      id,
      priority,
      questionId,
      optionId,
    })),
    styles: styles.map((style) => ({
      id: style.id,
      family: style.family,
      displayPriority: style.displayPriority,
      supportedIntensityIds: style.supportedIntensityIds,
      supportedNoodleIds: style.supportedNoodleIds,
      cores: style.cores.map((core) => ({
        id: core.id,
        parentStyleId: core.parentStyleId,
        intensityId: core.intensityId,
        priority: core.priority,
        rules: core.rules.map((rule) => ({
          id: rule.id,
          parentStyleId: rule.parentStyleId,
          parentCoreId: rule.parentCoreId,
          questionId: rule.questionId,
          priority: rule.priority,
          targets: rule.targets.map(({ optionId, tier, priority }) => ({
            optionId,
            tier,
            priority,
          })),
          fallbackTier: rule.fallbackTier,
        })),
        subtypes: core.subtypes.map((subtype) => ({
          id: subtype.id,
          parentStyleId: subtype.parentStyleId,
          parentCoreId: subtype.parentCoreId,
          noodleId: subtype.noodleId,
          priority: subtype.priority,
        })),
      })),
      adjustments: style.adjustments.map(projectAdjustment),
      exclusionTags: style.exclusionTags,
    })),
  }
}

function withoutProvenance(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutProvenance)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'provenance')
    .map(([key, entry]) => [key, withoutProvenance(entry)]))
}

function dataProjection(
  stage: StyleRulesStage,
  exclusionTags: readonly CompiledExclusionTag[],
  styles: readonly CompiledStyle[],
  inventory: readonly CompiledStyleInventoryRecord[],
) {
  return {
    modelVersion: stage.modelVersion,
    questionModelVersion: stage.questionModelVersion,
    questionSemanticHash: stage.questionSemanticHash,
    exclusionTags: withoutProvenance(exclusionTags),
    styles: withoutProvenance(styles),
    inventory: inventory.map(({ key, kind, id, messageIds }) => ({
      key,
      kind,
      id,
      messageIds,
    })),
  }
}

function cloneProvenance(provenance: StyleSourceReference) {
  return { ...provenance }
}

function cloneStyles(stage: StyleRulesStage): CompiledStyle[] {
  return stage.styles.map((style) => ({
    id: style.id,
    family: style.family,
    displayPriority: style.displayPriority,
    messageIds: { ...style.messageIds },
    accent: style.accent,
    supportedIntensityIds: [...style.supportedIntensityIds],
    supportedNoodleIds: [...style.supportedNoodleIds],
    cores: style.cores.map((core) => ({
      id: core.id,
      parentStyleId: core.parentStyleId,
      intensityId: core.intensityId,
      priority: core.priority,
      messageIds: { ...core.messageIds },
      rules: core.rules.map((rule) => ({
        id: rule.id,
        parentStyleId: rule.parentStyleId,
        parentCoreId: rule.parentCoreId,
        questionId: rule.questionId,
        priority: rule.priority,
        targets: rule.targets.map((target) => ({ ...target })),
        fallbackTier: rule.fallbackTier,
        provenance: { ...rule.provenance },
      })),
      subtypes: core.subtypes.map((subtype) => ({
        id: subtype.id,
        parentStyleId: subtype.parentStyleId,
        parentCoreId: subtype.parentCoreId,
        noodleId: subtype.noodleId,
        priority: subtype.priority,
        messageIds: { ...subtype.messageIds },
        provenance: subtype.provenance.map(cloneProvenance).sort(compareProvenance),
      })),
      provenance: core.provenance.map(cloneProvenance).sort(compareProvenance),
    })),
    adjustments: style.adjustments.map((adjustment) => adjustment.kind === 'bonus'
      ? {
          kind: adjustment.kind,
          id: adjustment.id,
          priority: adjustment.priority,
          labelMessageId: adjustment.labelMessageId,
          points: adjustment.points,
          minMatches: adjustment.minMatches,
          conditions: adjustment.conditions.map((condition) => ({
            priority: condition.priority,
            questionId: condition.questionId,
            optionIds: [...condition.optionIds],
            provenance: cloneProvenance(condition.provenance),
          })),
          appliesToCoreIds: [...adjustment.appliesToCoreIds],
          provenance: cloneProvenance(adjustment.provenance),
        }
      : {
          kind: adjustment.kind,
          id: adjustment.id,
          priority: adjustment.priority,
          labelMessageId: adjustment.labelMessageId,
          penalty: adjustment.penalty,
          whenAll: adjustment.whenAll.map((condition) => ({
            priority: condition.priority,
            questionId: condition.questionId,
            optionIds: [...condition.optionIds],
            provenance: cloneProvenance(condition.provenance),
          })),
          appliesToCoreIds: [...adjustment.appliesToCoreIds],
          provenance: cloneProvenance(adjustment.provenance),
        }),
    exclusionTags: [...style.exclusionTags],
    provenance: cloneProvenance(style.provenance),
  }))
}

function buildInventory(styles: readonly CompiledStyle[]) {
  const inventory: CompiledStyleInventoryRecord[] = []
  for (const style of styles) {
    inventory.push({
      key: `style/${style.id}`,
      kind: 'style',
      id: style.id,
      sourceFile: style.provenance.sourceFile,
      messageIds: Object.values(style.messageIds).sort(compareCodePoints),
    })
    for (const core of style.cores) {
      inventory.push({
        key: `intensity/${core.id}`,
        kind: 'intensity',
        id: core.id,
        sourceFile: style.provenance.sourceFile,
        messageIds: Object.values(core.messageIds).sort(compareCodePoints),
      })
      for (const subtype of core.subtypes) inventory.push({
        key: `noodle/${subtype.id}`,
        kind: 'noodle',
        id: subtype.id,
        sourceFile: style.provenance.sourceFile,
        messageIds: Object.values(subtype.messageIds).sort(compareCodePoints),
      })
    }
  }
  return inventory.sort((left, right) => compareCodePoints(left.key, right.key))
}

export function proveStyleModel(
  stage: StyleRulesStage,
  source: StyleDefinitionBundleSource,
): CompileStylesResult {
  const collector = new DiagnosticCollector()
  validateQuestionIdentity(stage, source, collector)
  validateGlobalDuplicates(stage, collector)
  validateInventory(stage, source, collector)
  const diagnostics = collector.toArray()
  if (collector.hasErrors()) return { ok: false, diagnostics }

  const exclusionTags = stage.exclusionTags.map((tag) => ({
    id: tag.id,
    priority: tag.priority,
    questionId: tag.questionId,
    optionId: tag.optionId,
    provenance: cloneProvenance(tag.provenance),
  }))
  const styles = cloneStyles(stage)
  const inventory = buildInventory(styles)
  const metadata = {
    schemaVersion: '1' as const,
    compilerVersion: '1' as const,
    modelVersion: stage.modelVersion,
    questionModelVersion: stage.questionModelVersion,
    questionSemanticHash: stage.questionSemanticHash,
    sourceHash: sha256(canonicalSourceProjection(source, stage)),
    semanticHash: sha256(semanticProjection(stage, styles)),
    dataVersion: sha256(dataProjection(stage, exclusionTags, styles, inventory)),
  }
  const model: CompiledStyleModel = {
    metadata,
    exclusionTags,
    styles,
    inventory,
  }
  return { ok: true, model: deepFreeze(model), diagnostics }
}
