import { compareCodePoints } from '../contracts/source-path.js'
import type { CompiledScoringPolicy } from '../contracts/scoring-policy.js'
import type { QuestionScoreTraceLine } from '../contracts/scoring.js'
import type { CompiledCore, CompiledStyleRule } from '../contracts/style-model.js'
import type { CompletedAnswers, OptionId, QuestionId } from '../flow/types.js'
import { ScoringInvariantError } from './trace.js'

const scoreScale = 10

export function roundScore(
  value: number,
  token: CompiledScoringPolicy['arithmetic']['scoreRounding'],
) {
  if (token !== 'nearest-score-unit-ties-up' || !Number.isFinite(value) || value < 0) {
    throw new ScoringInvariantError()
  }
  const units = Math.floor(value * scoreScale + 0.5)
  if (!Number.isSafeInteger(units)) throw new ScoringInvariantError()
  return units / scoreScale
}

function ruleByQuestion(core: CompiledCore) {
  const result = new Map<string, CompiledStyleRule>()
  for (const rule of core.rules) {
    if (result.has(rule.questionId)) throw new ScoringInvariantError()
    result.set(rule.questionId, rule)
  }
  return result
}

export function evaluateCoreRuleLines(
  policy: CompiledScoringPolicy,
  core: CompiledCore,
  answers: CompletedAnswers,
): readonly QuestionScoreTraceLine[] {
  const rules = ruleByQuestion(core)
  const questions = [...policy.scoredQuestions].sort((left, right) => (
    left.priority - right.priority || compareCodePoints(left.questionId, right.questionId)
  ))
  if (questions.length !== 7 || rules.size !== questions.length) {
    throw new ScoringInvariantError()
  }
  const questionIds = new Set<string>()
  const priorities = new Set<number>()
  return questions.map((question) => {
    if (questionIds.has(question.questionId) || priorities.has(question.priority)) {
      throw new ScoringInvariantError()
    }
    questionIds.add(question.questionId)
    priorities.add(question.priority)
    const rule = rules.get(question.questionId)
    const answerOptionIds = answers[question.questionId as QuestionId]
    if (!rule || !answerOptionIds) throw new ScoringInvariantError()

    const targetsByTier = new Map<string, Set<string>>()
    const allTargets = new Set<string>()
    for (const target of rule.targets) {
      const targets = targetsByTier.get(target.tier) ?? new Set<string>()
      if (allTargets.has(target.optionId)) throw new ScoringInvariantError()
      allTargets.add(target.optionId)
      targets.add(target.optionId)
      targetsByTier.set(target.tier, targets)
    }
    const tiers = [...policy.tiers].sort((left, right) => (
      left.priority - right.priority || compareCodePoints(left.tier, right.tier)
    ))
    if (
      tiers.length !== 4
        || new Set(tiers.map(({ priority }) => priority)).size !== tiers.length
        || new Set(tiers.map(({ tier }) => tier)).size !== tiers.length
    ) throw new ScoringInvariantError()
    const matchedTier = tiers.find(({ tier }) => (
      tier !== 'miss' && answerOptionIds.some((optionId) => targetsByTier.get(tier)?.has(optionId))
    )) ?? tiers.find(({ tier }) => tier === 'miss')
    if (!matchedTier) throw new ScoringInvariantError()
    const matchedOptionIds = matchedTier.tier === 'miss'
      ? []
      : answerOptionIds.filter((optionId) => targetsByTier.get(matchedTier.tier)?.has(optionId))
    const rawPoints = question.weight * matchedTier.ratio
    return {
      questionId: question.questionId as QuestionId,
      questionPriority: question.priority,
      answerOptionIds: [...answerOptionIds] as OptionId[],
      ruleId: rule.id,
      rulePriority: rule.priority,
      tier: matchedTier.tier,
      tierPriority: matchedTier.priority,
      matchedOptionIds: matchedOptionIds as OptionId[],
      ratio: matchedTier.ratio,
      weight: question.weight,
      rawPoints,
      points: roundScore(rawPoints, policy.arithmetic.scoreRounding),
    }
  })
}
