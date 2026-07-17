import type { ClassificationModel } from '../contracts/model.js'
import { compareCodePoints } from '../contracts/source-path.js'
import type {
  ScoreTrace,
  ScoringOutcome,
  StyleScoreTrace,
} from '../contracts/scoring.js'
import type { CompletedAnswers } from '../flow/types.js'

export class ScoringInvariantError extends Error {
  constructor() {
    super('Scoring invariant failed')
    this.name = 'ScoringInvariantError'
  }
}

const fail = (): never => { throw new ScoringInvariantError() }
const sameNumber = (left: number, right: number) => (
  Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 1e-9
)
const sameStrings = (left: readonly string[], right: readonly string[]) => (
  left.length === right.length && left.every((value, index) => value === right[index])
)
const toUnits = (value: number) => {
  const units = value * 10
  if (!Number.isSafeInteger(units)) fail()
  return units
}

function compareCore(left: StyleScoreTrace['coreCandidates'][number], right: StyleScoreTrace['coreCandidates'][number]) {
  return toUnits(right.finalTotal) - toUnits(left.finalTotal)
    || left.corePriority - right.corePriority
    || compareCodePoints(left.coreId, right.coreId)
}

function compareStyle(left: StyleScoreTrace, right: StyleScoreTrace) {
  return toUnits(right.rankingKeys.score) - toUnits(left.rankingKeys.score)
    || left.displayPriority - right.displayPriority
    || compareCodePoints(left.styleId, right.styleId)
}

function verifyStyleTrace(
  model: ClassificationModel,
  answers: CompletedAnswers,
  style: StyleScoreTrace,
): void {
  const compiledStyle = model.styleModel.styles.find(({ id }) => id === style.styleId)
  if (
    !compiledStyle
      || compiledStyle.family !== style.family
      || compiledStyle.displayPriority !== style.displayPriority
      || style.coreCandidates.length !== compiledStyle.cores.length
  ) fail()
  const acceptedStyle = compiledStyle!
  if (style.coreCandidates.length === 0) fail()
  if (!sameStrings(
    style.coreCandidates.map(({ coreId }) => coreId),
    [...style.coreCandidates].sort(compareCore).map(({ coreId }) => coreId),
  )) fail()
  if (style.coreCandidates.filter(({ selected }) => selected).length !== 1) fail()
  const selected = style.coreCandidates.find(({ selected }) => selected)
  if (
    !selected
      || selected.coreId !== style.selectedCoreId
      || selected.coreId !== style.coreCandidates[0]?.coreId
  ) fail()
  for (const core of style.coreCandidates) {
    const compiledCore = acceptedStyle.cores.find(({ id }) => id === core.coreId)
    if (
      !compiledCore
        || compiledCore.priority !== core.corePriority
        || core.styleId !== style.styleId
    ) fail()
    const acceptedCore = compiledCore!
    if (core.questionLines.length !== 7) fail()
    const expectedQuestions = [...model.policy.scoredQuestions].sort((left, right) => (
      left.priority - right.priority || compareCodePoints(left.questionId, right.questionId)
    ))
    for (let index = 0; index < core.questionLines.length; index += 1) {
      const line = core.questionLines[index]!
      const question = expectedQuestions[index]
      const rule = acceptedCore.rules.find(({ id }) => id === line.ruleId)
      const answer = answers[line.questionId]
      const tier = [...model.policy.tiers]
        .sort((left, right) => left.priority - right.priority)
        .find((candidate) => (
          candidate.tier !== 'miss'
            && answer.some((optionId) => rule?.targets.some((target) => (
              target.tier === candidate.tier && target.optionId === optionId
            )))
        )) ?? model.policy.tiers.find(({ tier: candidate }) => candidate === 'miss')
      const matchingTargets = new Set(rule?.targets.filter(({ tier: targetTier }) => (
        targetTier === tier?.tier
      )).map(({ optionId }) => optionId) ?? [])
      const matchedOptionIds = answer.filter((optionId) => matchingTargets.has(optionId))
      if (
        !question
          || !rule
          || question.questionId !== line.questionId
          || question.priority !== line.questionPriority
          || question.weight !== line.weight
          || rule.questionId !== line.questionId
          || rule.priority !== line.rulePriority
          || !sameStrings(line.answerOptionIds, answer)
          || !tier
          || tier.tier !== line.tier
          || tier.priority !== line.tierPriority
          || tier.ratio !== line.ratio
          || !sameStrings(line.matchedOptionIds, matchedOptionIds)
          || !sameNumber(line.rawPoints, line.weight * line.ratio)
          || !sameNumber(line.points, Math.floor(line.rawPoints * 10 + 0.5) / 10)
      ) fail()
    }
    let bonusBudget = toUnits(model.policy.adjustments.bonusCap)
    let penaltyBudget = toUnits(model.policy.adjustments.penaltyCap)
    const expectedAdjustmentIds = acceptedStyle.adjustments
      .filter(({ appliesToCoreIds }) => appliesToCoreIds.includes(core.coreId))
      .sort((left, right) => (
        (left.kind === 'bonus' ? 0 : 1) - (right.kind === 'bonus' ? 0 : 1)
          || left.priority - right.priority
          || compareCodePoints(left.id, right.id)
      ))
      .map(({ id }) => id)
    if (!sameStrings(
      core.adjustmentLines.map(({ id }) => id),
      expectedAdjustmentIds,
    )) fail()
    let previousAdjustmentKey = ''
    for (const line of core.adjustmentLines) {
      const compiledAdjustment = acceptedStyle.adjustments.find(({ id }) => (
        id === line.id
      ))
      if (!compiledAdjustment) fail()
      const compiledConditions = [...(
        compiledAdjustment!.kind === 'bonus'
          ? compiledAdjustment!.conditions
          : compiledAdjustment!.whenAll
      )].sort((left, right) => left.priority - right.priority)
      const compiledOperand = compiledAdjustment!.kind === 'bonus'
        ? compiledAdjustment!.points
        : compiledAdjustment!.penalty
      const compiledRequired = compiledAdjustment!.kind === 'bonus'
        ? compiledAdjustment!.minMatches
        : compiledConditions.length
      if (
        line.kind !== compiledAdjustment!.kind
          || line.priority !== compiledAdjustment!.priority
          || line.labelMessageId !== compiledAdjustment!.labelMessageId
          || line.operand !== compiledOperand
          || line.requiredMatchCount !== compiledRequired
          || line.conditions.length !== compiledConditions.length
      ) fail()
      const phase = line.kind === 'bonus' ? 0 : 1
      const key = `${phase}:${String(line.priority).padStart(12, '0')}:${line.id}`
      if (previousAdjustmentKey && compareCodePoints(previousAdjustmentKey, key) > 0) fail()
      previousAdjustmentKey = key
      if (line.conditions.length === 0) fail()
      let previousConditionPriority = -1
      for (let conditionIndex = 0; conditionIndex < line.conditions.length; conditionIndex += 1) {
        const condition = line.conditions[conditionIndex]!
        const compiledCondition = compiledConditions[conditionIndex]
        if (
          !compiledCondition
            || condition.priority !== compiledCondition.priority
            || condition.questionId !== compiledCondition.questionId
            || !sameStrings(condition.targetOptionIds, compiledCondition.optionIds)
        ) fail()
        if (condition.priority <= previousConditionPriority) fail()
        previousConditionPriority = condition.priority
        const expectedAnswer = answers[condition.questionId]
        const targets = new Set(condition.targetOptionIds)
        const matched = expectedAnswer.filter((optionId) => targets.has(optionId))
        if (
          !sameStrings(condition.answerOptionIds, expectedAnswer)
            || !sameStrings(condition.matchedOptionIds, matched)
            || condition.matched !== (matched.length > 0)
        ) fail()
      }
      const matchedCount = line.conditions.filter(({ matched }) => matched).length
      const active = matchedCount >= line.requiredMatchCount
      const operandUnits = toUnits(line.operand)
      const requestedUnits = active
        ? line.kind === 'bonus'
          ? Math.floor(
              (operandUnits * matchedCount) / line.conditions.length + 0.5,
            )
          : operandUnits
        : 0
      const budgetBefore = line.kind === 'bonus' ? bonusBudget : penaltyBudget
      const appliedUnits = Math.min(requestedUnits, budgetBefore)
      const budgetAfter = budgetBefore - appliedUnits
      const status = !active
        ? 'inactive'
        : requestedUnits > budgetBefore ? 'capped' : 'applied'
      if (
        line.matchedCount !== matchedCount
          || !sameNumber(line.matchRatio, matchedCount / line.conditions.length)
          || line.status !== status
          || toUnits(line.requestedPoints) !== requestedUnits
          || toUnits(line.budgetBefore) !== budgetBefore
          || toUnits(line.appliedPoints) !== appliedUnits
          || toUnits(line.budgetAfter) !== budgetAfter
      ) fail()
      if (line.kind === 'bonus') bonusBudget = budgetAfter
      else penaltyBudget = budgetAfter
    }
    const base = core.questionLines.reduce((total, line) => total + line.points, 0)
    const bonus = core.adjustmentLines
      .filter(({ kind }) => kind === 'bonus')
      .reduce((total, line) => total + line.appliedPoints, 0)
    const penalty = core.adjustmentLines
      .filter(({ kind }) => kind === 'conflict')
      .reduce((total, line) => total + line.appliedPoints, 0)
    if (!sameNumber(base, core.baseTotal)) fail()
    if (!sameNumber(bonus, core.bonusTotal)) fail()
    if (!sameNumber(penalty, core.penaltyTotal)) fail()
    if (!sameNumber(core.baseTotal + bonus - penalty, core.preFloorTotal)) fail()
    if (!sameNumber(Math.max(0, core.preFloorTotal), core.finalTotal)) fail()
    if (!sameNumber(core.rankingKeys.score, core.finalTotal)) fail()
  }
  if (style.subtypeResolution.matchingSubtypeIds.length !== 1) fail()
  if (
    style.subtypeResolution.matchingSubtypeIds[0]
      !== style.subtypeResolution.selectedSubtypeId
  ) fail()
  const compiledSelected = acceptedStyle.cores.find(({ id }) => id === selected!.coreId)
  const subtypeMatches = compiledSelected?.subtypes.filter(({ noodleId }) => (
    noodleId === style.subtypeResolution.noodleOptionId
  )) ?? []
  if (
    subtypeMatches.length !== 1
      || subtypeMatches[0]!.id !== style.subtypeResolution.selectedSubtypeId
      || style.subtypeResolution.noodleOptionId !== answers.noodle[0]
  ) fail()
  if (!sameNumber(style.rankingKeys.score, selected!.finalTotal)) fail()
  if (
    style.rankingKeys.displayPriority !== style.displayPriority
      || style.rankingKeys.styleId !== style.styleId
  ) fail()
}

export function verifyScoreTrace(
  model: ClassificationModel,
  _answers: CompletedAnswers,
  outcome: ScoringOutcome,
): void {
  const trace = outcome.trace
  if (trace.modelVersion !== model.modelVersion) fail()
  if (trace.dataVersion !== model.dataVersion) fail()
  if (
    trace.questionModelIdentity.modelVersion !== model.questionModel.metadata.modelVersion
      || trace.questionModelIdentity.semanticHash !== model.questionModel.metadata.semanticHash
      || trace.styleModelIdentity.modelVersion !== model.styleModel.metadata.modelVersion
      || trace.styleModelIdentity.semanticHash !== model.styleModel.metadata.semanticHash
      || trace.styleModelIdentity.dataVersion !== model.styleModel.metadata.dataVersion
      || trace.policyIdentity.semanticHash !== model.policy.metadata.semanticHash
      || trace.policyIdentity.dataVersion !== model.policy.metadata.dataVersion
  ) fail()
  if (trace.styleCandidates.length !== model.styleModel.styles.length) fail()
  const expectedCoreCount = model.styleModel.styles.reduce((count, style) => (
    count + style.cores.length
  ), 0)
  if (trace.styleCandidates.flatMap(({ coreCandidates }) => coreCandidates).length !== expectedCoreCount) fail()
  if (!sameStrings(
    trace.styleCandidates.map(({ styleId }) => styleId),
    [...trace.styleCandidates].sort(compareStyle).map(({ styleId }) => styleId),
  )) fail()
  for (const style of trace.styleCandidates) verifyStyleTrace(model, _answers, style)

  const primary = trace.styleCandidates.filter(({ group }) => group === 'primary')
  const alternative = trace.styleCandidates.filter(({ group }) => group === 'alternative')
  const primaryFamily = _answers[model.policy.ranking.primaryFamilyQuestionId][0]
  if (
    primary.some(({ family }) => family !== primaryFamily)
      || alternative.some(({ family }) => family === primaryFamily)
  ) fail()
  const verifyRanking = (
    styles: readonly StyleScoreTrace[],
    ranking: ScoreTrace['primaryRanking'],
    limit: number,
  ) => {
    if (ranking.length !== styles.length) fail()
    for (let index = 0; index < styles.length; index += 1) {
      const style = styles[index]!
      const entry = ranking[index]!
      const selected = index < limit
      if (
        style.groupRank !== index
          || style.displayPosition !== (selected ? index : null)
          || entry.styleId !== style.styleId
          || entry.score !== style.rankingKeys.score
          || entry.displayPriority !== style.displayPriority
          || entry.rankingKeys !== style.rankingKeys
          || entry.groupRank !== index
          || entry.selected !== selected
          || (selected ? !style.confidence : style.confidence !== null)
      ) fail()
    }
  }
  verifyRanking(primary, trace.primaryRanking, model.policy.ranking.primaryLimit)
  verifyRanking(alternative, trace.alternativeRanking, model.policy.ranking.alternativeLimit)

  const displayed = trace.styleCandidates.filter(({ displayPosition }) => (
    displayPosition !== null
  ))
  for (const style of displayed) {
    const confidence = style.confidence
    if (!confidence) fail()
    if (!Number.isInteger(confidence!.confidence)) fail()
    const conflictDeduction = confidence!.deductions.find(
      ({ kind }) => kind === 'applied-conflict-count',
    )
    if (
      confidence!.confidence < confidence!.minimum
        || confidence!.confidence > confidence!.maximum
    ) fail()
    const selectedCore = style.coreCandidates.find(({ selected }) => selected)
    const conflictCount = selectedCore?.adjustmentLines.filter((line) => (
      line.kind === 'conflict' && line.appliedPoints > 0
    )).length
    const groupIds = style.group === 'primary'
      ? trace.selectedPrimaryStyleIds
      : trace.selectedAlternativeStyleIds
    const groupIndex = groupIds.indexOf(style.styleId)
    const nextStyleId = groupIndex < 0 ? undefined : groupIds[groupIndex + 1]
    const nextStyle = nextStyleId === undefined
      ? undefined
      : trace.styleCandidates.find(({ styleId }) => styleId === nextStyleId)
    const expectedNextScore = nextStyle
      ? nextStyle.rankingKeys.score
      : style.rankingKeys.score - model.policy.confidence.lastResultGap
    const expectedDeductions = [...model.policy.confidence.uncertainty]
      .sort((left, right) => left.priority - right.priority)
    if (confidence!.deductions.length !== expectedDeductions.length) fail()
    for (let index = 0; index < expectedDeductions.length; index += 1) {
      const expected = expectedDeductions[index]!
      const actual = confidence!.deductions[index]!
      if (expected.kind !== actual.kind || expected.priority !== actual.priority) fail()
      if (expected.kind === 'answer-includes' && actual.kind === 'answer-includes') {
        const matched = _answers[expected.questionId as keyof CompletedAnswers]
          .includes(expected.optionId as never)
        if (
          actual.questionId !== expected.questionId
            || actual.optionId !== expected.optionId
            || actual.matched !== matched
            || actual.deduction !== (matched ? expected.deduction : 0)
        ) fail()
      } else if (
        expected.kind === 'applied-conflict-count'
          && actual.kind === 'applied-conflict-count'
      ) {
        if (
          actual.count !== conflictCount
            || actual.deductionEach !== expected.deductionEach
            || actual.deductionCap !== expected.deductionCap
            || actual.deduction !== Math.min(
              expected.deductionCap,
              (conflictCount ?? 0) * expected.deductionEach,
            )
        ) fail()
      } else fail()
    }
    const expectedUncertainty = confidence!.deductions.reduce((total, deduction) => (
      total + deduction.deduction
    ), 0)
    if (
      confidence!.maximumScore !== model.policy.derived.maximumScore
        || confidence!.maximumDerivation !== model.policy.confidence.maximumDerivation
        || confidence!.score !== style.rankingKeys.score
        || confidence!.nextScore !== expectedNextScore
        || confidence!.gapMultiplier !== model.policy.confidence.gapMultiplier
        || confidence!.gapBoostCap !== model.policy.confidence.gapBoostCap
        || confidence!.rounding !== model.policy.confidence.rounding
        || confidence!.minimum !== model.policy.confidence.minimum
        || confidence!.maximum !== model.policy.confidence.maximum
        || !sameNumber(confidence!.scoreGap, confidence!.score - confidence!.nextScore)
        || !sameNumber(
          confidence!.base,
          confidence!.score / confidence!.maximumScore * 100,
        )
        || !sameNumber(
          confidence!.gapBoostBeforeCap,
          Math.max(0, confidence!.scoreGap) * confidence!.gapMultiplier,
        )
        || !sameNumber(
          confidence!.gapBoost,
          Math.min(confidence!.gapBoostCap, confidence!.gapBoostBeforeCap),
        )
        || confidence!.uncertaintyTotal !== expectedUncertainty
        || !sameNumber(
          confidence!.rawConfidence,
          confidence!.base + confidence!.gapBoost - confidence!.uncertaintyTotal,
        )
        || confidence!.roundedConfidence !== Math.round(confidence!.rawConfidence)
        || confidence!.confidence !== Math.min(
          confidence!.maximum,
          Math.max(confidence!.minimum, confidence!.roundedConfidence),
        )
        || !conflictDeduction
        || conflictDeduction.kind !== 'applied-conflict-count'
        || conflictDeduction.count !== conflictCount
    ) fail()
  }
  const expectedPrimary = trace.primaryRanking.filter(({ selected }) => selected)
    .map(({ styleId }) => styleId)
  const expectedAlternative = trace.alternativeRanking.filter(({ selected }) => selected)
    .map(({ styleId }) => styleId)
  if (expectedPrimary.join('\0') !== trace.selectedPrimaryStyleIds.join('\0')) fail()
  if (expectedAlternative.join('\0') !== trace.selectedAlternativeStyleIds.join('\0')) fail()
  if (outcome.results.length !== expectedPrimary.length) fail()
  if (outcome.alternativeResults.length !== expectedAlternative.length) fail()
  for (const result of [...outcome.results, ...outcome.alternativeResults]) {
    const style = trace.styleCandidates.find(({ styleId }) => styleId === result.styleId)
    const core = style?.coreCandidates.find(({ selected }) => selected)
    if (
      style !== result.trace
        || core?.coreId !== result.coreId
        || core.finalTotal !== result.score
        || style.subtypeResolution.selectedSubtypeId !== result.subtypeId
        || style.confidence?.confidence !== result.confidence
    ) {
      fail()
    }
  }
  const topPrimary = outcome.results[0]
  const secondScore = topPrimary ? (outcome.results[1]?.score ?? 0) : null
  const scoreGap = topPrimary && secondScore !== null
    ? topPrimary.score - secondScore
    : null
  const confidenceBelowThreshold = topPrimary
    ? topPrimary.confidence < model.policy.confidence.lowConfidenceThreshold
    : false
  const scoreGapBelowThreshold = scoreGap === null
    ? false
    : scoreGap < model.policy.confidence.lowConfidenceTieGap
  const expectedLowConfidence = !topPrimary
    || confidenceBelowThreshold
    || scoreGapBelowThreshold
  if (
    trace.lowConfidence.hasPrimaryResult !== Boolean(topPrimary)
      || trace.lowConfidence.topConfidence !== (topPrimary?.confidence ?? null)
      || trace.lowConfidence.confidenceThreshold
        !== model.policy.confidence.lowConfidenceThreshold
      || trace.lowConfidence.confidenceBelowThreshold !== confidenceBelowThreshold
      || trace.lowConfidence.topScore !== (topPrimary?.score ?? null)
      || trace.lowConfidence.secondScore !== secondScore
      || trace.lowConfidence.scoreGap !== scoreGap
      || trace.lowConfidence.scoreGapThreshold !== model.policy.confidence.lowConfidenceTieGap
      || trace.lowConfidence.scoreGapBelowThreshold !== scoreGapBelowThreshold
      || trace.lowConfidence.lowConfidence !== expectedLowConfidence
      || outcome.lowConfidence !== expectedLowConfidence
  ) fail()
}
