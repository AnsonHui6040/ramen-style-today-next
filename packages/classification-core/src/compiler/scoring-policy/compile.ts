import { createHash } from 'node:crypto'

import { deepFreeze } from '../../contracts/deep-freeze.js'
import type { Diagnostic } from '../../contracts/diagnostic.js'
import type { CompiledQuestionModel } from '../../contracts/question-model.js'
import type {
  CompiledScoringPolicy,
  ScoringPolicyDefinition,
} from '../../contracts/scoring-policy.js'
import { compareCodePoints } from '../../contracts/source-path.js'
import type { CompiledStyleModel } from '../../contracts/style-model.js'
import { stableJson } from '../stable-json.js'
import { proveScoringPolicy } from './proof.js'

export type CompileScoringPolicyResult =
  | {
      readonly ok: true
      readonly model: CompiledScoringPolicy
      readonly diagnostics: readonly Diagnostic[]
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }

function sha256(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function canonicalBehavior(source: ScoringPolicyDefinition) {
  return {
    scoredQuestions: [...source.scoredQuestions].sort((left, right) => (
      left.priority - right.priority
      || compareCodePoints(left.questionId, right.questionId)
    )),
    tiers: [...source.tiers].sort((left, right) => (
      left.priority - right.priority || compareCodePoints(left.tier, right.tier)
    )),
    arithmetic: source.arithmetic,
    adjustments: {
      phases: ['bonus', 'conflict'] as const,
      bonusCap: source.adjustments.bonusCap,
      penaltyCap: source.adjustments.penaltyCap,
    },
    ranking: {
      coreKeys: [
        'score-desc',
        'core-priority-asc',
        'core-id-asc',
      ] as const,
      styleKeys: [
        'score-desc',
        'display-priority-asc',
        'style-id-asc',
      ] as const,
      primaryFamilyQuestionId: source.ranking.primaryFamilyQuestionId,
      primaryLimit: source.ranking.primaryLimit,
      alternativeLimit: source.ranking.alternativeLimit,
    },
    confidence: {
      ...source.confidence,
      uncertainty: [...source.confidence.uncertainty].sort((left, right) => (
        left.priority - right.priority || compareCodePoints(left.kind, right.kind)
      )),
    },
  }
}

export function compileScoringPolicy(
  source: ScoringPolicyDefinition,
  questionModel: CompiledQuestionModel,
  styleModel: CompiledStyleModel,
  classificationModelVersion: string,
): CompileScoringPolicyResult {
  const diagnostics = proveScoringPolicy(
    source,
    questionModel,
    styleModel,
    classificationModelVersion,
  )
  if (diagnostics.some(({ severity }) => severity === 'error')) {
    return { ok: false, diagnostics }
  }

  const behavior = canonicalBehavior(source)
  const sourceProjection = {
    modelVersion: source.modelVersion,
    ...behavior,
  }
  const baseWeightTotal = behavior.scoredQuestions.reduce(
    (sum, { weight }) => sum + weight,
    0,
  )
  const derived = {
    baseWeightTotal,
    maximumScore: baseWeightTotal + behavior.adjustments.bonusCap,
    scoreScale: 10,
  } as const
  const componentIdentity = {
    questionModel: {
      modelVersion: questionModel.metadata.modelVersion,
      semanticHash: questionModel.metadata.semanticHash,
    },
    styleModel: {
      modelVersion: styleModel.metadata.modelVersion,
      semanticHash: styleModel.metadata.semanticHash,
    },
  }
  const semanticProjection = {
    modelVersion: source.modelVersion,
    ...componentIdentity,
    policy: behavior,
    derived,
  }
  const dataProjection = {
    ...semanticProjection,
    questionModel: {
      ...componentIdentity.questionModel,
      sourceHash: questionModel.metadata.sourceHash,
    },
    styleModel: {
      ...componentIdentity.styleModel,
      dataVersion: styleModel.metadata.dataVersion,
    },
  }
  const model: CompiledScoringPolicy = {
    metadata: {
      schemaVersion: '1',
      compilerVersion: '1',
      modelVersion: source.modelVersion,
      questionModelVersion: questionModel.metadata.modelVersion,
      questionSemanticHash: questionModel.metadata.semanticHash,
      styleModelVersion: styleModel.metadata.modelVersion,
      styleSemanticHash: styleModel.metadata.semanticHash,
      sourceHash: sha256(sourceProjection),
      semanticHash: sha256(semanticProjection),
      dataVersion: sha256(dataProjection),
    },
    ...behavior,
    derived,
  }
  return { ok: true, model: deepFreeze(model), diagnostics }
}
