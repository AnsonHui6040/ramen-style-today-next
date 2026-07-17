import { createHash } from 'node:crypto'

import { deepFreeze } from '../../contracts/deep-freeze.js'
import type { Diagnostic } from '../../contracts/diagnostic.js'
import type {
  CompiledEligibilityPolicy,
  EligibilityPolicyDefinition,
} from '../../contracts/eligibility-policy.js'
import type { CompiledQuestionModel } from '../../contracts/question-model.js'
import type { CompiledScoringPolicy } from '../../contracts/scoring-policy.js'
import { compareCodePoints } from '../../contracts/source-path.js'
import type { CompiledStyleModel, ExclusionTagId } from '../../contracts/style-model.js'
import { stableJson } from '../stable-json.js'
import { proveEligibilityPolicy } from './proof.js'

export type CompileEligibilityPolicyResult =
  | { readonly ok: true; readonly model: CompiledEligibilityPolicy; readonly diagnostics: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }

function sha256(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

export function compileEligibilityPolicy(
  source: EligibilityPolicyDefinition,
  questionModel: CompiledQuestionModel,
  styleModel: CompiledStyleModel,
  scoringPolicy: CompiledScoringPolicy,
  classificationModelVersion: string,
): CompileEligibilityPolicyResult {
  const diagnostics = proveEligibilityPolicy(
    source,
    questionModel,
    styleModel,
    scoringPolicy,
    classificationModelVersion,
  )
  if (diagnostics.some(({ severity }) => severity === 'error')) {
    return { ok: false, diagnostics }
  }
  const tagPriority = new Map(styleModel.exclusionTags.map(({ id, priority }) => [id, priority]))
  const rules = [...source.rules]
    .sort((left, right) => left.priority - right.priority || compareCodePoints(left.id, right.id))
    .map((rule) => {
      const restrictionTagIds = [...rule.restrictionTagIds]
        .sort((left, right) => (
          (tagPriority.get(left as ExclusionTagId) ?? Number.MAX_SAFE_INTEGER)
          - (tagPriority.get(right as ExclusionTagId) ?? Number.MAX_SAFE_INTEGER)
          || compareCodePoints(left, right)
        )) as ExclusionTagId[]
      const tagSet = new Set(restrictionTagIds)
      const blockedStyleIds = [...styleModel.styles]
        .sort((left, right) => (
          left.displayPriority - right.displayPriority || compareCodePoints(left.id, right.id)
        ))
        .filter((style) => style.exclusionTags.some((tag) => tagSet.has(tag)))
        .map(({ id }) => id)
      return {
        id: rule.id,
        priority: rule.priority,
        exclusionOptionId: rule.exclusionOptionId,
        restrictionTagIds,
        blockedStyleIds,
      }
    })
  const behavior = {
    exclusionsQuestionId: source.exclusionsQuestionId,
    noneOptionId: source.noneOptionId as 'none',
    rules,
    selection: source.selection,
  }
  const scoringIdentity = {
    modelVersion: scoringPolicy.metadata.modelVersion,
    semanticHash: scoringPolicy.metadata.semanticHash,
    dataVersion: scoringPolicy.metadata.dataVersion,
  }
  const semanticProjection = {
    modelVersion: classificationModelVersion,
    questionModel: {
      modelVersion: questionModel.metadata.modelVersion,
      semanticHash: questionModel.metadata.semanticHash,
    },
    styleModel: {
      modelVersion: styleModel.metadata.modelVersion,
      semanticHash: styleModel.metadata.semanticHash,
    },
    scoringPolicy: scoringIdentity,
    eligibility: behavior,
  }
  const dataProjection = {
    ...semanticProjection,
    questionSourceHash: questionModel.metadata.sourceHash,
    styleDataVersion: styleModel.metadata.dataVersion,
  }
  const model: CompiledEligibilityPolicy = {
    metadata: {
      schemaVersion: '1',
      compilerVersion: '1',
      modelVersion: 'batch3c.1.0',
      questionModelVersion: questionModel.metadata.modelVersion,
      questionSemanticHash: questionModel.metadata.semanticHash,
      styleModelVersion: styleModel.metadata.modelVersion,
      styleSemanticHash: styleModel.metadata.semanticHash,
      styleDataVersion: styleModel.metadata.dataVersion,
      scoringPolicyModelVersion: scoringPolicy.metadata.modelVersion,
      scoringPolicySemanticHash: scoringPolicy.metadata.semanticHash,
      scoringPolicyDataVersion: scoringPolicy.metadata.dataVersion,
      sourceHash: sha256({ modelVersion: source.modelVersion, ...behavior }),
      semanticHash: sha256(semanticProjection),
      dataVersion: sha256(dataProjection),
    },
    ...behavior,
  }
  return { ok: true, model: deepFreeze(model), diagnostics }
}
