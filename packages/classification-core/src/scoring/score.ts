import { deepFreeze } from '../contracts/deep-freeze.js'
import type { ClassificationModel } from '../contracts/model.js'
import { compareCodePoints } from '../contracts/source-path.js'
import type {
  ScoreCompletedAnswersResult,
  ScoredStyleResult,
  ScoringDiagnostic,
  ScoringOutcome,
  StyleScoreTrace,
} from '../contracts/scoring.js'
import type { CompletedAnswers } from '../flow/types.js'
import { classificationModel as acceptedModel } from '../generated/classification-model.js'
import { validateCompletedAnswers } from './answers.js'
import { addConfidence } from './confidence.js'
import { scoreCoreCandidates } from './core.js'
import { rankStyleCandidates } from './ranking.js'
import { selectCoreCandidate } from './selection.js'
import { resolveSubtype } from './subtype.js'
import {
  ScoringInvariantError,
  verifyScoreTrace,
} from './trace.js'

const diagnostics = {
  answers: {
    severity: 'error',
    code: 'SCORING_COMPLETED_ANSWERS_INVALID',
    sourceFile: 'runtime://scoring',
    path: '/answers',
    message: 'Completed answers are invalid for this classification model',
  },
  model: {
    severity: 'error',
    code: 'SCORING_MODEL_IDENTITY_MISMATCH',
    sourceFile: 'runtime://scoring',
    path: '/model',
    message: 'Classification model identity is invalid for scoring',
  },
  invariant: {
    severity: 'error',
    code: 'SCORING_INVARIANT_FAILED',
    sourceFile: 'runtime://scoring',
    path: '/trace',
    message: 'Scoring invariant verification failed',
  },
} as const satisfies Record<string, ScoringDiagnostic>

function failure(diagnostic: ScoringDiagnostic): ScoreCompletedAnswersResult {
  return deepFreeze({ ok: false, diagnostics: [diagnostic] }) as ScoreCompletedAnswersResult
}

function sameMetadata(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  keys: readonly string[],
) {
  return keys.every((key) => actual[key] === expected[key])
}

function hasAcceptedIdentity(model: ClassificationModel): boolean {
  try {
    if (model.modelVersion !== acceptedModel.modelVersion) return false
    if (model.dataVersion !== acceptedModel.dataVersion) return false
    if (model.questions !== model.questionModel.questions) return false
    if (!sameMetadata(
      model.questionModel.metadata as unknown as Record<string, unknown>,
      acceptedModel.questionModel.metadata as unknown as Record<string, unknown>,
      ['schemaVersion', 'compilerVersion', 'modelVersion', 'sourceHash', 'semanticHash'],
    )) return false
    if (!sameMetadata(
      model.styleModel.metadata as unknown as Record<string, unknown>,
      acceptedModel.styleModel.metadata as unknown as Record<string, unknown>,
      ['schemaVersion', 'compilerVersion', 'modelVersion', 'questionModelVersion', 'questionSemanticHash', 'sourceHash', 'semanticHash', 'dataVersion'],
    )) return false
    if (!sameMetadata(
      model.policy.metadata as unknown as Record<string, unknown>,
      acceptedModel.policy.metadata as unknown as Record<string, unknown>,
      ['schemaVersion', 'compilerVersion', 'modelVersion', 'questionModelVersion', 'questionSemanticHash', 'styleModelVersion', 'styleSemanticHash', 'sourceHash', 'semanticHash', 'dataVersion'],
    )) return false
    return model.policy.metadata.questionModelVersion === model.questionModel.metadata.modelVersion
      && model.policy.metadata.questionSemanticHash === model.questionModel.metadata.semanticHash
      && model.policy.metadata.styleModelVersion === model.styleModel.metadata.modelVersion
      && model.policy.metadata.styleSemanticHash === model.styleModel.metadata.semanticHash
      && model.styleModel.metadata.questionModelVersion === model.questionModel.metadata.modelVersion
      && model.styleModel.metadata.questionSemanticHash === model.questionModel.metadata.semanticHash
  } catch {
    return false
  }
}

function sameSequence(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
}

const sortedStrings = (values: readonly string[]) => [...values].sort(compareCodePoints)

function trustedScoringShape(model: ClassificationModel) {
  return JSON.stringify({
    policy: {
      scoredQuestions: [...model.policy.scoredQuestions]
        .sort((left, right) => left.priority - right.priority),
      tiers: [...model.policy.tiers].sort((left, right) => left.priority - right.priority),
      arithmetic: model.policy.arithmetic,
      adjustments: model.policy.adjustments,
      ranking: model.policy.ranking,
      confidence: {
        ...model.policy.confidence,
        uncertainty: [...model.policy.confidence.uncertainty]
          .sort((left, right) => left.priority - right.priority),
      },
      derived: model.policy.derived,
    },
    questionModel: {
      questions: [...model.questionModel.questions]
        .sort((left, right) => (
          left.order - right.order || compareCodePoints(left.id, right.id)
        ))
        .map((question) => ({
          ...question,
          options: [...question.options].sort((left, right) => (
            left.order - right.order || compareCodePoints(left.id, right.id)
          )),
        })),
      semanticDependencies: model.questionModel.semanticDependencies,
      dependentClosures: model.questionModel.dependentClosures,
      topologicalOrder: model.questionModel.topologicalOrder,
      forcedIterationUpperBound: model.questionModel.forcedIterationUpperBound,
    },
    styles: [...model.styleModel.styles]
      .sort((left, right) => compareCodePoints(left.id, right.id))
      .map((style) => ({
        id: style.id,
        family: style.family,
        displayPriority: style.displayPriority,
        cores: [...style.cores]
          .sort((left, right) => compareCodePoints(left.id, right.id))
          .map((core) => ({
            id: core.id,
            priority: core.priority,
            rules: [...core.rules]
              .sort((left, right) => compareCodePoints(left.id, right.id))
              .map((rule) => ({
                id: rule.id,
                questionId: rule.questionId,
                priority: rule.priority,
                fallbackTier: rule.fallbackTier,
                targets: [...rule.targets]
                  .sort((left, right) => (
                    compareCodePoints(left.optionId, right.optionId)
                      || compareCodePoints(left.tier, right.tier)
                      || left.priority - right.priority
                  )),
              })),
            subtypes: [...core.subtypes]
              .sort((left, right) => compareCodePoints(left.id, right.id))
              .map(({ id, noodleId, priority }) => ({ id, noodleId, priority })),
          })),
        adjustments: [...style.adjustments]
          .sort((left, right) => compareCodePoints(left.id, right.id))
          .map((adjustment) => ({
            kind: adjustment.kind,
            id: adjustment.id,
            priority: adjustment.priority,
            labelMessageId: adjustment.labelMessageId,
            operand: adjustment.kind === 'bonus' ? adjustment.points : adjustment.penalty,
            required: adjustment.kind === 'bonus'
              ? adjustment.minMatches
              : adjustment.whenAll.length,
            appliesToCoreIds: sortedStrings(adjustment.appliesToCoreIds),
            conditions: [...(
              adjustment.kind === 'bonus' ? adjustment.conditions : adjustment.whenAll
            )]
              .sort((left, right) => left.priority - right.priority)
              .map((condition) => ({
                priority: condition.priority,
                questionId: condition.questionId,
                optionIds: condition.optionIds,
              })),
          })),
      })),
  })
}

const acceptedScoringShape = trustedScoringShape(acceptedModel)

function assertTrustedStructure(model: ClassificationModel): void {
  if (trustedScoringShape(model) !== acceptedScoringShape) {
    throw new ScoringInvariantError()
  }
  if (!sameSequence(model.policy.adjustments.phases, ['bonus', 'conflict'])) {
    throw new ScoringInvariantError()
  }
  if (!sameSequence(
    model.policy.ranking.coreKeys,
    ['score-desc', 'core-priority-asc', 'core-id-asc'],
  )) throw new ScoringInvariantError()
  if (!sameSequence(
    model.policy.ranking.styleKeys,
    ['score-desc', 'display-priority-asc', 'style-id-asc'],
  )) throw new ScoringInvariantError()
  if (
    model.policy.arithmetic.scoreRounding !== 'nearest-score-unit-ties-up'
      || model.policy.confidence.rounding
        !== 'nearest-integer-ties-toward-positive-infinity'
      || model.policy.derived.scoreScale !== 10
      || model.policy.derived.baseWeightTotal !== 100
      || model.policy.derived.maximumScore
        !== model.policy.derived.baseWeightTotal + model.policy.adjustments.bonusCap
  ) throw new ScoringInvariantError()

  const expectedStyles = new Map<string, (typeof acceptedModel.styleModel.styles)[number]>(
    acceptedModel.styleModel.styles.map((style) => (
    [style.id, style] as const
    )),
  )
  if (model.styleModel.styles.length !== expectedStyles.size) {
    throw new ScoringInvariantError()
  }
  for (const style of model.styleModel.styles) {
    const expectedStyle = expectedStyles.get(style.id)
    if (
      !expectedStyle
        || style.family !== expectedStyle.family
        || style.displayPriority !== expectedStyle.displayPriority
        || style.cores.length !== expectedStyle.cores.length
        || style.adjustments.length !== expectedStyle.adjustments.length
    ) throw new ScoringInvariantError()
    const expectedCores = new Map<string, (typeof expectedStyle.cores)[number]>(
      expectedStyle.cores.map((core) => [core.id, core] as const),
    )
    for (const core of style.cores) {
      const expectedCore = expectedCores.get(core.id)
      if (
        !expectedCore
          || core.priority !== expectedCore.priority
          || core.rules.length !== expectedCore.rules.length
          || core.subtypes.length !== expectedCore.subtypes.length
      ) throw new ScoringInvariantError()
      const expectedSubtypeIds = new Set<string>(expectedCore.subtypes.map(({ id }) => id))
      if (core.subtypes.some(({ id }) => !expectedSubtypeIds.has(id))) {
        throw new ScoringInvariantError()
      }
      const expectedRuleIds = new Set<string>(expectedCore.rules.map(({ id }) => id))
      if (core.rules.some(({ id }) => !expectedRuleIds.has(id))) {
        throw new ScoringInvariantError()
      }
    }
    const expectedAdjustmentIds = new Set<string>(
      expectedStyle.adjustments.map(({ id }) => id),
    )
    if (style.adjustments.some(({ id }) => !expectedAdjustmentIds.has(id))) {
      throw new ScoringInvariantError()
    }
  }
}

export function buildStyleCandidates(
  model: ClassificationModel,
  answers: CompletedAnswers,
): readonly StyleScoreTrace[] {
  const noodleId = answers.noodle[0]
  if (!noodleId || answers.noodle.length !== 1) throw new ScoringInvariantError()
  return model.styleModel.styles.map((style): StyleScoreTrace => {
    const selected = selectCoreCandidate(scoreCoreCandidates(model.policy, style, answers))
    const core = style.cores.find(({ id }) => id === selected.selected.coreId)
    if (!core) throw new ScoringInvariantError()
    const subtypeResolution = resolveSubtype(core, noodleId)
    return {
      styleId: style.id,
      family: style.family,
      displayPriority: style.displayPriority,
      coreCandidates: selected.candidates,
      selectedCoreId: selected.selected.coreId,
      subtypeResolution,
      rankingKeys: {
        score: selected.selected.finalTotal,
        displayPriority: style.displayPriority,
        styleId: style.id,
      },
      group: style.family === answers.form[0] ? 'primary' : 'alternative',
      groupRank: -1,
      displayPosition: null,
      confidence: null,
    }
  })
}

function resultFor(candidate: StyleScoreTrace): ScoredStyleResult {
  const selectedCore = candidate.coreCandidates.find(({ selected }) => selected)
  if (!selectedCore || !candidate.confidence) throw new ScoringInvariantError()
  return {
    styleId: candidate.styleId,
    coreId: selectedCore.coreId,
    subtypeId: candidate.subtypeResolution.selectedSubtypeId,
    score: selectedCore.finalTotal,
    confidence: candidate.confidence.confidence,
    trace: candidate,
  }
}

function scoreTrusted(
  model: ClassificationModel,
  answers: CompletedAnswers,
): ScoringOutcome {
  assertTrustedStructure(model)
  const ranked = rankStyleCandidates(
    model.policy,
    answers,
    buildStyleCandidates(model, answers),
  )
  const completed = addConfidence(model.policy, answers, ranked)
  const byId = new Map(completed.styleCandidates.map((candidate) => (
    [candidate.styleId, candidate] as const
  )))
  const outcome: ScoringOutcome = {
    modelVersion: model.modelVersion,
    dataVersion: model.dataVersion,
    results: completed.selectedPrimaryStyleIds.map((id) => resultFor(byId.get(id)!)),
    alternativeResults: completed.selectedAlternativeStyleIds.map((id) => resultFor(byId.get(id)!)),
    lowConfidence: completed.lowConfidence.lowConfidence,
    trace: {
      modelVersion: model.modelVersion,
      dataVersion: model.dataVersion,
      questionModelIdentity: {
        modelVersion: model.questionModel.metadata.modelVersion,
        semanticHash: model.questionModel.metadata.semanticHash,
      },
      styleModelIdentity: {
        modelVersion: model.styleModel.metadata.modelVersion,
        semanticHash: model.styleModel.metadata.semanticHash,
        dataVersion: model.styleModel.metadata.dataVersion,
      },
      policyIdentity: {
        semanticHash: model.policy.metadata.semanticHash,
        dataVersion: model.policy.metadata.dataVersion,
      },
      styleCandidates: completed.styleCandidates,
      primaryRanking: completed.primaryRanking,
      alternativeRanking: completed.alternativeRanking,
      selectedPrimaryStyleIds: completed.selectedPrimaryStyleIds,
      selectedAlternativeStyleIds: completed.selectedAlternativeStyleIds,
      lowConfidence: completed.lowConfidence,
    },
  }
  verifyScoreTrace(model, answers, outcome)
  return outcome
}

export function scoreCompletedAnswers(
  model: ClassificationModel,
  input: CompletedAnswers,
): ScoreCompletedAnswersResult {
  if (!hasAcceptedIdentity(model)) return failure(diagnostics.model)
  const validation = validateCompletedAnswers(model.questionModel, input)
  if (!validation.ok) return failure(diagnostics.answers)
  try {
    return deepFreeze({
      ok: true,
      outcome: scoreTrusted(model, validation.answers),
    }) as ScoreCompletedAnswersResult
  } catch {
    return failure(diagnostics.invariant)
  }
}
