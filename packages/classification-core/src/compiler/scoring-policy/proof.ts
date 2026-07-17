import type { CompiledQuestionModel } from '../../contracts/question-model.js'
import type { ScoringPolicyDefinition } from '../../contracts/scoring-policy.js'
import { compareCodePoints } from '../../contracts/source-path.js'
import type { CompiledStyleModel } from '../../contracts/style-model.js'
import { DiagnosticCollector } from '../collector.js'

const scoreScale = 10
const expectedTiers = ['exact', 'adjacent', 'partial', 'miss'] as const

function duplicates(values: readonly string[]) {
  const seen = new Set<string>()
  const duplicate = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value)
    seen.add(value)
  }
  return [...duplicate].sort(compareCodePoints)
}

function isScoreUnit(value: number) {
  if (!Number.isFinite(value)) return false
  const scaled = value * scoreScale
  const rounded = Math.round(scaled)
  return Number.isSafeInteger(rounded)
    && Math.abs(scaled - rounded) <= Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8
}

export function proveScoringPolicy(
  source: ScoringPolicyDefinition,
  questionModel: CompiledQuestionModel,
  styleModel: CompiledStyleModel,
  classificationModelVersion: string,
) {
  const collector = new DiagnosticCollector()
  const sourceFile = source.sourceFile
  const questions = new Map(questionModel.questions.map((question) => [
    question.id,
    question,
  ]))

  if (source.modelVersion !== classificationModelVersion) collector.error({
    code: 'POLICY_MODEL_VERSION_MISMATCH',
    sourceFile,
    path: '/modelVersion',
    message: 'Scoring policy and classification model versions must match',
    expected: classificationModelVersion,
    received: source.modelVersion,
  })

  if (styleModel.metadata.questionModelVersion !== questionModel.metadata.modelVersion
    || styleModel.metadata.questionSemanticHash !== questionModel.metadata.semanticHash) {
    collector.error({
      code: 'POLICY_IDENTITY_BINDING_INVALID',
      sourceFile,
      path: '/identity',
      message: 'Style model question identity does not match the scoring question model',
      expected: {
        modelVersion: questionModel.metadata.modelVersion,
        semanticHash: questionModel.metadata.semanticHash,
      },
      received: {
        modelVersion: styleModel.metadata.questionModelVersion,
        semanticHash: styleModel.metadata.questionSemanticHash,
      },
    })
  }

  for (const questionId of duplicates(source.scoredQuestions.map(({ questionId }) => questionId))) {
    collector.error({
      code: 'POLICY_SCORED_QUESTION_DUPLICATE',
      sourceFile,
      path: '/scoredQuestions',
      entityId: questionId,
      message: `Duplicate scored question ${questionId}`,
    })
  }
  for (const priority of duplicates(source.scoredQuestions.map(({ priority }) => String(priority)))) {
    collector.error({
      code: 'POLICY_SCORED_QUESTION_PRIORITY_DUPLICATE',
      sourceFile,
      path: '/scoredQuestions',
      entityId: priority,
      message: `Duplicate scored question priority ${priority}`,
    })
  }

  for (const [index, scored] of source.scoredQuestions.entries()) {
    const question = questions.get(scored.questionId)
    if (!question) {
      collector.error({
        code: 'POLICY_SCORED_QUESTION_UNKNOWN',
        sourceFile,
        path: `/scoredQuestions/${index}/questionId`,
        entityId: scored.questionId,
        message: `Unknown scored question ${scored.questionId}`,
      })
      continue
    }
    if (question.weight !== scored.weight) collector.error({
      code: 'POLICY_QUESTION_WEIGHT_MISMATCH',
      sourceFile,
      path: `/scoredQuestions/${index}/weight`,
      entityId: scored.questionId,
      message: `Scoring weight does not match question ${scored.questionId}`,
      expected: question.weight,
      received: scored.weight,
    })
  }

  const sortedQuestions = [...source.scoredQuestions].sort((left, right) => (
    left.priority - right.priority
    || compareCodePoints(left.questionId, right.questionId)
  ))
  const priorities = sortedQuestions.map(({ priority }) => priority)
  if (sortedQuestions.length !== 7
    || priorities.some((priority, index) => priority !== index)
    || sortedQuestions.some(({ questionId }) => questionId === 'exclusions')) {
    collector.error({
      code: 'POLICY_ORDERING_INVALID',
      sourceFile,
      path: '/scoredQuestions',
      message: 'Scored questions must be the seven ordered non-exclusion questions',
    })
  }
  const weightTotal = sortedQuestions.reduce((sum, { weight }) => sum + weight, 0)
  if (weightTotal !== 100) collector.error({
    code: 'POLICY_WEIGHT_TOTAL',
    sourceFile,
    path: '/scoredQuestions',
    message: `Scoring weights total ${weightTotal}, expected 100`,
    expected: 100,
    received: weightTotal,
  })

  for (const tier of duplicates(source.tiers.map(({ tier }) => tier))) {
    collector.error({
      code: 'POLICY_TIER_DUPLICATE',
      sourceFile,
      path: '/tiers',
      entityId: tier,
      message: `Duplicate scoring tier ${tier}`,
    })
  }
  for (const priority of duplicates(source.tiers.map(({ priority }) => String(priority)))) {
    collector.error({
      code: 'POLICY_TIER_PRIORITY_DUPLICATE',
      sourceFile,
      path: '/tiers',
      entityId: priority,
      message: `Duplicate tier priority ${priority}`,
    })
  }
  const sortedTiers = [...source.tiers].sort((left, right) => (
    left.priority - right.priority || compareCodePoints(left.tier, right.tier)
  ))
  if (sortedTiers.length !== expectedTiers.length
    || sortedTiers.some(({ tier, priority }, index) => (
      tier !== expectedTiers[index] || priority !== index
    ))) collector.error({
    code: 'POLICY_TIER_SET_INVALID',
    sourceFile,
    path: '/tiers',
    message: 'Scoring tiers must be exact, adjacent, partial, miss in priority order',
  })
  if (sortedTiers[0]?.ratio !== 1
    || sortedTiers.at(-1)?.ratio !== 0
    || sortedTiers.some(({ ratio }, index) => (
      index > 0 && ratio > sortedTiers[index - 1]!.ratio
    ))) collector.error({
    code: 'POLICY_RATIO_ORDER_INVALID',
    sourceFile,
    path: '/tiers',
    message: 'Tier ratios must decrease from exact one to miss zero',
  })

  const scoreValues = [
    source.arithmetic.scoreFloor,
    source.adjustments.bonusCap,
    source.adjustments.penaltyCap,
    source.confidence.lastResultGap,
    source.confidence.lowConfidenceTieGap,
    ...styleModel.styles.flatMap(({ adjustments }) => adjustments.map((adjustment) => (
      adjustment.kind === 'bonus' ? adjustment.points : adjustment.penalty
    ))),
    ...source.scoredQuestions.flatMap(({ weight }) => (
      source.tiers.map(({ ratio }) => weight * ratio)
    )),
  ]
  const baseWeightTotal = source.scoredQuestions.reduce((sum, { weight }) => sum + weight, 0)
  const maximumScore = baseWeightTotal + source.adjustments.bonusCap
  const largestIntermediate = maximumScore + source.adjustments.penaltyCap
  const bonusRationalSafe = styleModel.styles.every(({ adjustments }) => (
    adjustments.every((adjustment) => {
      if (adjustment.kind !== 'bonus') return true
      const operandUnits = Math.round(adjustment.points * scoreScale)
      return adjustment.conditions.length > 0
        && Number.isSafeInteger(operandUnits)
        && Number.isSafeInteger(operandUnits * adjustment.conditions.length)
    })
  ))
  if (source.arithmetic.scoreDecimalPlaces !== 1
    || source.arithmetic.scoreRounding !== 'nearest-score-unit-ties-up'
    || scoreValues.some((value) => !isScoreUnit(value))
    || !isScoreUnit(maximumScore)
    || !isScoreUnit(largestIntermediate)
    || !bonusRationalSafe
    || !Number.isSafeInteger(largestIntermediate * scoreScale)) collector.error({
    code: 'POLICY_SCORE_SCALE_INVALID',
    sourceFile,
    path: '/arithmetic',
    message: 'All score operands and bounds must be safe integer score units',
  })

  if (source.adjustments.bonusCap < 0
    || source.adjustments.penaltyCap < 0
    || maximumScore <= 0) collector.error({
    code: 'POLICY_BUDGET_INVALID',
    sourceFile,
    path: '/adjustments',
    message: 'Scoring budgets and derived maximum must be valid',
  })

  if (JSON.stringify(source.adjustments.phases) !== JSON.stringify(['bonus', 'conflict'])
    || JSON.stringify(source.ranking.coreKeys) !== JSON.stringify([
      'score-desc',
      'core-priority-asc',
      'core-id-asc',
    ])
    || JSON.stringify(source.ranking.styleKeys) !== JSON.stringify([
      'score-desc',
      'display-priority-asc',
      'style-id-asc',
    ])) collector.error({
    code: 'POLICY_ORDERING_INVALID',
    sourceFile,
    path: '/ranking',
    message: 'Scoring phases and comparator tokens must use the closed order',
  })

  const form = questions.get(source.ranking.primaryFamilyQuestionId)
  if (!form) collector.error({
    code: 'POLICY_REFERENCE_UNKNOWN',
    sourceFile,
    path: '/ranking/primaryFamilyQuestionId',
    entityId: source.ranking.primaryFamilyQuestionId,
    message: 'Primary family question is unknown',
  })
  const styleFamilies = new Set(styleModel.styles.map(({ family }) => family))
  const formOptions = new Set(form?.options.map(({ id }) => id) ?? [])
  if ([...styleFamilies].some((family) => !formOptions.has(family))) collector.error({
    code: 'POLICY_REFERENCE_UNKNOWN',
    sourceFile,
    path: '/ranking/primaryFamilyQuestionId',
    message: 'Primary family question does not own every style family option',
  })

  for (const [index, uncertainty] of source.confidence.uncertainty.entries()) {
    if (uncertainty.kind !== 'answer-includes') continue
    const question = questions.get(uncertainty.questionId)
    if (!question) {
      collector.error({
        code: 'POLICY_REFERENCE_UNKNOWN',
        sourceFile,
        path: `/confidence/uncertainty/${index}/questionId`,
        entityId: uncertainty.questionId,
        message: `Unknown confidence question ${uncertainty.questionId}`,
      })
      continue
    }
    const owner = questionModel.questions.find(({ options }) => (
      options.some(({ id }) => id === uncertainty.optionId)
    ))
    if (!owner) collector.error({
      code: 'POLICY_OPTION_UNKNOWN',
      sourceFile,
      path: `/confidence/uncertainty/${index}/optionId`,
      entityId: uncertainty.optionId,
      message: `Unknown confidence option ${uncertainty.optionId}`,
    })
    else if (owner.id !== question.id) collector.error({
      code: 'POLICY_OPTION_WRONG_OWNER',
      sourceFile,
      path: `/confidence/uncertainty/${index}/optionId`,
      entityId: uncertainty.optionId,
      message: `Confidence option ${uncertainty.optionId} belongs to another question`,
      expected: question.id,
      received: owner.id,
    })
  }
  const uncertaintyPriorities = source.confidence.uncertainty.map(({ priority }) => String(priority))
  if (duplicates(uncertaintyPriorities).length
    || source.confidence.rounding !== 'nearest-integer-ties-toward-positive-infinity'
    || source.confidence.minimum > source.confidence.maximum
    || source.confidence.lowConfidenceThreshold < source.confidence.minimum
    || source.confidence.lowConfidenceThreshold > source.confidence.maximum) {
    collector.error({
      code: 'POLICY_CONFIDENCE_INVALID',
      sourceFile,
      path: '/confidence',
      message: 'Confidence policy is internally inconsistent',
    })
  }

  return collector.toArray()
}
