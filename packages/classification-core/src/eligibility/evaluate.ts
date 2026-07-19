import { deepFreeze } from '../contracts/deep-freeze.js'
import type {
  EligibilityCandidate,
  EligibilityCandidateEvaluation,
  EligibilityDiagnostic,
  EligibilityOutcome,
  EligibilityReason,
  EvaluateEligibilityResult,
} from '../contracts/eligibility.js'
import type { CompiledEligibilityRule } from '../contracts/eligibility-policy.js'
import type { ClassificationModel } from '../contracts/model.js'
import { compareCodePoints } from '../contracts/source-path.js'
import type { ScoringOutcome, StyleScoreTrace } from '../contracts/scoring.js'
import type { ExclusionTagId, StyleId } from '../contracts/style-model.js'
import type { CompletedAnswers } from '../flow/types.js'
import { classificationModel as acceptedModel } from '../generated/classification-model.js'
import { validateCompletedAnswers } from '../scoring/answers.js'
import { verifyScoreTrace } from '../scoring/trace.js'

const diagnostics = {
  answers: {
    severity: 'error',
    code: 'ELIGIBILITY_COMPLETED_ANSWERS_INVALID',
    sourceFile: 'runtime://eligibility',
    path: '/answers',
    message: 'Completed answers are invalid for eligibility evaluation',
  },
  scoring: {
    severity: 'error',
    code: 'ELIGIBILITY_SCORING_RESULT_INVALID',
    sourceFile: 'runtime://eligibility',
    path: '/scoringOutcome',
    message: 'Scoring outcome is invalid for eligibility evaluation',
  },
  model: {
    severity: 'error',
    code: 'ELIGIBILITY_MODEL_IDENTITY_MISMATCH',
    sourceFile: 'runtime://eligibility',
    path: '/model',
    message: 'Classification model identity is invalid for eligibility evaluation',
  },
  unresolved: {
    severity: 'error',
    code: 'ELIGIBILITY_DECISION_UNRESOLVED',
    sourceFile: 'runtime://eligibility',
    path: '/decisions',
    message: 'An eligibility decision could not be resolved',
  },
  invariant: {
    severity: 'error',
    code: 'ELIGIBILITY_INVARIANT_FAILED',
    sourceFile: 'runtime://eligibility',
    path: '/trace',
    message: 'Eligibility invariant verification failed',
  },
} as const satisfies Record<string, EligibilityDiagnostic>

class EligibilityDecisionError extends Error {}
class EligibilityInvariantError extends Error {}

function failure(diagnostic: EligibilityDiagnostic): EvaluateEligibilityResult {
  return deepFreeze({ ok: false, diagnostics: [diagnostic] }) as EvaluateEligibilityResult
}

function sameMetadata(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  keys: readonly string[],
) {
  return keys.every((key) => actual[key] === expected[key])
}

function eligibilityShape(model: ClassificationModel) {
  return JSON.stringify({
    questionModel: model.questionModel,
    styleExclusionTags: [...model.styleModel.styles]
      .sort((left, right) => compareCodePoints(left.id, right.id))
      .map(({ id, exclusionTags }) => ({
        id,
        exclusionTags: [...exclusionTags].sort(compareCodePoints),
      })),
    exclusionsQuestionId: model.eligibilityPolicy.exclusionsQuestionId,
    noneOptionId: model.eligibilityPolicy.noneOptionId,
    rules: [...model.eligibilityPolicy.rules]
      .sort((left, right) => left.priority - right.priority || compareCodePoints(left.id, right.id))
      .map((rule) => ({
        ...rule,
        restrictionTagIds: [...rule.restrictionTagIds].sort(compareCodePoints),
        blockedStyleIds: [...rule.blockedStyleIds].sort(compareCodePoints),
      })),
    selection: model.eligibilityPolicy.selection,
  })
}

const acceptedEligibilityShape = eligibilityShape(acceptedModel)

function hasAcceptedIdentity(model: ClassificationModel): boolean {
  try {
    const metadata = model.eligibilityPolicy.metadata
    const expected = acceptedModel.eligibilityPolicy.metadata
    return model.modelVersion === acceptedModel.modelVersion
      && model.dataVersion === acceptedModel.dataVersion
      && eligibilityShape(model) === acceptedEligibilityShape
      && sameMetadata(
        metadata as unknown as Record<string, unknown>,
        expected as unknown as Record<string, unknown>,
        [
          'schemaVersion', 'compilerVersion', 'modelVersion',
          'questionModelVersion', 'questionSemanticHash',
          'styleModelVersion', 'styleSemanticHash', 'styleDataVersion',
          'scoringPolicyModelVersion', 'scoringPolicySemanticHash',
          'scoringPolicyDataVersion', 'sourceHash', 'semanticHash', 'dataVersion',
        ],
      )
      && metadata.modelVersion === model.modelVersion
      && metadata.questionModelVersion === model.questionModel.metadata.modelVersion
      && metadata.questionSemanticHash === model.questionModel.metadata.semanticHash
      && metadata.styleModelVersion === model.styleModel.metadata.modelVersion
      && metadata.styleSemanticHash === model.styleModel.metadata.semanticHash
      && metadata.styleDataVersion === model.styleModel.metadata.dataVersion
      && metadata.scoringPolicyModelVersion === model.policy.metadata.modelVersion
      && metadata.scoringPolicySemanticHash === model.policy.metadata.semanticHash
      && metadata.scoringPolicyDataVersion === model.policy.metadata.dataVersion
  } catch {
    return false
  }
}

function validateScoringOutcome(
  model: ClassificationModel,
  answers: CompletedAnswers,
  outcome: ScoringOutcome,
): boolean {
  try {
    if (
      outcome.modelVersion !== model.modelVersion
        || outcome.dataVersion !== model.dataVersion
    ) return false
    verifyScoreTrace(model, answers, outcome)
    return true
  } catch {
    return false
  }
}

function orderedRules(model: ClassificationModel) {
  return [...model.eligibilityPolicy.rules]
    .sort((left, right) => left.priority - right.priority || compareCodePoints(left.id, right.id))
}

function selectedRules(
  model: ClassificationModel,
  answers: CompletedAnswers,
): readonly CompiledEligibilityRule[] {
  const selected = new Set<string>(answers[model.eligibilityPolicy.exclusionsQuestionId])
  return orderedRules(model).filter(({ exclusionOptionId }) => selected.has(exclusionOptionId))
}

function candidateFor(
  model: ClassificationModel,
  trace: StyleScoreTrace,
  rules: readonly CompiledEligibilityRule[],
): EligibilityCandidate {
  const style = model.styleModel.styles.find(({ id }) => id === trace.styleId)
  const core = trace.coreCandidates.find(({ selected }) => selected)
  if (!style || !core || core.coreId !== trace.selectedCoreId) {
    throw new EligibilityDecisionError()
  }
  const reasons: EligibilityReason[] = []
  const styleTags = new Set<ExclusionTagId>(style.exclusionTags)
  for (const rule of rules) {
    if (!rule.blockedStyleIds.includes(style.id)) continue
    for (const tagId of rule.restrictionTagIds) {
      if (!styleTags.has(tagId)) continue
      reasons.push({
        code: 'ELIGIBILITY_EXCLUSION_CONFLICT',
        ruleId: rule.id,
        exclusionOptionId: rule.exclusionOptionId,
        restrictionTagId: tagId,
        styleId: style.id,
        coreId: core.coreId,
        subtypeId: trace.subtypeResolution.selectedSubtypeId,
      })
    }
  }
  return {
    styleId: style.id,
    coreId: core.coreId,
    subtypeId: trace.subtypeResolution.selectedSubtypeId,
    family: style.family,
    group: trace.group,
    originalRank: trace.groupRank,
    originalDisplayPosition: trace.displayPosition,
    score: trace.rankingKeys.score,
    confidence: trace.confidence?.confidence ?? null,
    scoringTrace: trace,
    decision: reasons.length ? 'blocked' : 'eligible',
    reasons,
  }
}

function requireCandidates(
  byId: ReadonlyMap<StyleId, EligibilityCandidate>,
  ids: readonly StyleId[],
) {
  return ids.map((id) => {
    const candidate = byId.get(id)
    if (!candidate) throw new EligibilityDecisionError()
    return candidate
  })
}

export function applyEligibilityPolicy(
  model: ClassificationModel,
  answers: CompletedAnswers,
  scoringOutcome: ScoringOutcome,
): EligibilityOutcome {
  const rules = selectedRules(model, answers)
  const selectedExclusions = rules.map(({ exclusionOptionId }) => exclusionOptionId)
  const activeOptions = new Set(selectedExclusions)
  const candidates = scoringOutcome.trace.styleCandidates.map((trace) => (
    candidateFor(model, trace, rules)
  ))
  const byId = new Map(candidates.map((candidate) => [candidate.styleId, candidate] as const))
  if (byId.size !== model.styleModel.styles.length) throw new EligibilityDecisionError()
  const primary = requireCandidates(
    byId,
    scoringOutcome.trace.primaryRanking.map(({ styleId }) => styleId),
  )
  const alternative = requireCandidates(
    byId,
    scoringOutcome.trace.alternativeRanking.map(({ styleId }) => styleId),
  )
  const eligiblePrimary = primary.filter(({ decision }) => decision === 'eligible')
  const eligibleAlternative = alternative.filter(({ decision }) => decision === 'eligible')
  const blockedCandidates = [...primary, ...alternative]
    .filter(({ decision }) => decision === 'blocked')
  const highestBlockedPrimary = primary.find(({ decision }) => decision === 'blocked') ?? null
  const selectedPrimary = eligiblePrimary[0] ?? null
  const blockedLead = highestBlockedPrimary && (
    !selectedPrimary || highestBlockedPrimary.score >= selectedPrimary.score
  ) ? highestBlockedPrimary : null
  const selectedPrimaryResults = eligiblePrimary.slice(
    0,
    model.eligibilityPolicy.selection.primaryLimit,
  )
  const selectedAlternatives = eligibleAlternative.slice(
    0,
    model.eligibilityPolicy.selection.alternativeLimit,
  )
  const candidateEvaluations: EligibilityCandidateEvaluation[] = candidates.map((candidate) => {
    const style = model.styleModel.styles.find(({ id }) => id === candidate.styleId)
    if (!style) throw new EligibilityDecisionError()
    const tagSet = new Set(style.exclusionTags)
    return {
      styleId: candidate.styleId,
      coreId: candidate.coreId,
      subtypeId: candidate.subtypeId,
      evaluatedRestrictionTagIds: style.exclusionTags,
      rules: orderedRules(model).map((rule) => {
        const active = activeOptions.has(rule.exclusionOptionId)
        return {
          ruleId: rule.id,
          exclusionOptionId: rule.exclusionOptionId,
          active,
          restrictionTagIds: rule.restrictionTagIds,
          matchedRestrictionTagIds: active
            ? rule.restrictionTagIds.filter((tagId) => tagSet.has(tagId))
            : [],
        }
      }),
      decision: candidate.decision,
      reasons: candidate.reasons,
    }
  })
  const outcome: EligibilityOutcome = {
    modelVersion: model.modelVersion,
    dataVersion: model.dataVersion,
    originalScoringOutcome: scoringOutcome,
    selectedExclusions,
    candidateDecisions: [...primary, ...alternative],
    eligiblePrimaryRanking: eligiblePrimary,
    eligibleAlternativeRanking: eligibleAlternative,
    selectedPrimary,
    selectedPrimaryResults,
    selectedAlternatives,
    blockedCandidates,
    blockedLead,
    noPrimaryEligible: eligiblePrimary.length === 0,
    noEligibleCandidate: eligiblePrimary.length + eligibleAlternative.length === 0,
    diagnostics: [],
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
        semanticHash: model.eligibilityPolicy.metadata.semanticHash,
        dataVersion: model.eligibilityPolicy.metadata.dataVersion,
      },
      scoringIdentity: {
        modelVersion: model.policy.metadata.modelVersion,
        semanticHash: model.policy.metadata.semanticHash,
        dataVersion: model.policy.metadata.dataVersion,
      },
      selectedExclusions,
      originalPrimaryStyleIds: primary.map(({ styleId }) => styleId),
      originalAlternativeStyleIds: alternative.map(({ styleId }) => styleId),
      candidateDecisions: [...primary, ...alternative],
      candidateEvaluations,
      eligiblePrimaryStyleIds: eligiblePrimary.map(({ styleId }) => styleId),
      eligibleAlternativeStyleIds: eligibleAlternative.map(({ styleId }) => styleId),
      selectedPrimaryStyleIds: selectedPrimaryResults.map(({ styleId }) => styleId),
      selectedAlternativeStyleIds: selectedAlternatives.map(({ styleId }) => styleId),
      blockedLeadStyleId: blockedLead?.styleId ?? null,
      noPrimaryEligible: eligiblePrimary.length === 0,
      noEligibleCandidate: eligiblePrimary.length + eligibleAlternative.length === 0,
    },
  }
  if (
    outcome.candidateDecisions.length !== model.styleModel.styles.length
      || outcome.candidateDecisions.some(({ decision, reasons }) => (
        (decision === 'eligible') !== (reasons.length === 0)
      ))
  ) throw new EligibilityInvariantError()
  return outcome
}

export function evaluateEligibility(
  model: ClassificationModel,
  input: CompletedAnswers,
  scoringOutcome: ScoringOutcome,
): EvaluateEligibilityResult {
  if (!hasAcceptedIdentity(model)) return failure(diagnostics.model)
  const validation = validateCompletedAnswers(acceptedModel.questionModel, input)
  if (!validation.ok) return failure(diagnostics.answers)
  if (!validateScoringOutcome(acceptedModel, validation.answers, scoringOutcome)) {
    return failure(diagnostics.scoring)
  }
  try {
    const scoringSnapshot = structuredClone(scoringOutcome)
    return deepFreeze({
      ok: true,
      outcome: applyEligibilityPolicy(acceptedModel, validation.answers, scoringSnapshot),
    }) as EvaluateEligibilityResult
  } catch (error) {
    if (error instanceof EligibilityDecisionError) return failure(diagnostics.unresolved)
    return failure(diagnostics.invariant)
  }
}
