import type { EligibilityPolicyDefinition } from '../../contracts/eligibility-policy.js'
import type { CompiledQuestionModel } from '../../contracts/question-model.js'
import type { CompiledScoringPolicy } from '../../contracts/scoring-policy.js'
import { compareCodePoints } from '../../contracts/source-path.js'
import type { CompiledStyleModel } from '../../contracts/style-model.js'
import { DiagnosticCollector } from '../collector.js'

function duplicates(values: readonly string[]) {
  const seen = new Set<string>()
  const duplicate = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value)
    seen.add(value)
  }
  return [...duplicate].sort(compareCodePoints)
}

export function proveEligibilityPolicy(
  source: EligibilityPolicyDefinition,
  questionModel: CompiledQuestionModel,
  styleModel: CompiledStyleModel,
  scoringPolicy: CompiledScoringPolicy,
  classificationModelVersion: string,
) {
  const collector = new DiagnosticCollector()
  const sourceFile = source.sourceFile
  if (source.modelVersion !== classificationModelVersion) collector.error({
    code: 'ELIGIBILITY_POLICY_MODEL_VERSION_MISMATCH',
    sourceFile,
    path: '/modelVersion',
    message: 'Eligibility policy and classification model versions must match',
    expected: classificationModelVersion,
    received: source.modelVersion,
  })

  const question = questionModel.questions.find(({ id }) => (
    id === source.exclusionsQuestionId
  ))
  if (!question) collector.error({
    code: 'ELIGIBILITY_POLICY_QUESTION_UNKNOWN',
    sourceFile,
    path: '/exclusionsQuestionId',
    entityId: source.exclusionsQuestionId,
    message: 'Eligibility exclusions question is missing',
  })
  const optionOwners = new Map<string, Set<string>>()
  for (const owner of questionModel.questions) {
    for (const option of owner.options) {
      const owners = optionOwners.get(option.id) ?? new Set<string>()
      owners.add(owner.id)
      optionOwners.set(option.id, owners)
    }
  }
  const options = new Map(question?.options.map((option) => [option.id, option]) ?? [])
  const none = options.get(source.noneOptionId)
  if (!none || !none.exclusive) collector.error({
    code: 'ELIGIBILITY_POLICY_NONE_INVALID',
    sourceFile,
    path: '/noneOptionId',
    entityId: source.noneOptionId,
    message: 'Eligibility none option must be the exclusive exclusions option',
  })

  for (const id of duplicates(source.rules.map(({ id }) => id))) collector.error({
    code: 'ELIGIBILITY_POLICY_RULE_DUPLICATE_ID',
    sourceFile,
    path: '/rules',
    entityId: id,
    message: `Duplicate eligibility rule ${id}`,
  })
  for (const priority of duplicates(source.rules.map(({ priority }) => String(priority)))) {
    collector.error({
      code: 'ELIGIBILITY_POLICY_RULE_PRIORITY_DUPLICATE',
      sourceFile,
      path: '/rules',
      entityId: priority,
      message: `Duplicate eligibility rule priority ${priority}`,
    })
  }
  for (const id of duplicates(source.rules.map(({ exclusionOptionId }) => exclusionOptionId))) {
    collector.error({
      code: 'ELIGIBILITY_POLICY_OPTION_DUPLICATE',
      sourceFile,
      path: '/rules',
      entityId: id,
      message: `Duplicate eligibility option ${id}`,
    })
  }

  const tagById = new Map(styleModel.exclusionTags.map((tag) => [tag.id, tag]))
  const observedTags: string[] = []
  for (const [index, rule] of source.rules.entries()) {
    if (!options.has(rule.exclusionOptionId)) {
      const owners = optionOwners.get(rule.exclusionOptionId)
      collector.error({
        code: owners?.size
          ? 'ELIGIBILITY_POLICY_OPTION_WRONG_OWNER'
          : 'ELIGIBILITY_POLICY_OPTION_UNKNOWN',
        sourceFile,
        path: `/rules/${index}/exclusionOptionId`,
        entityId: rule.exclusionOptionId,
        message: owners?.size
          ? `Eligibility option ${rule.exclusionOptionId} belongs to another question`
          : `Unknown eligibility option ${rule.exclusionOptionId}`,
      })
    }
    for (const duplicate of duplicates(rule.restrictionTagIds)) collector.error({
      code: 'ELIGIBILITY_POLICY_TAG_DUPLICATE',
      sourceFile,
      path: `/rules/${index}/restrictionTagIds`,
      entityId: duplicate,
      message: `Duplicate eligibility tag ${duplicate}`,
    })
    for (const tagId of rule.restrictionTagIds) {
      observedTags.push(tagId)
      const tag = tagById.get(tagId as never)
      if (!tag) collector.error({
        code: 'ELIGIBILITY_POLICY_TAG_UNKNOWN',
        sourceFile,
        path: `/rules/${index}/restrictionTagIds`,
        entityId: tagId,
        message: `Unknown eligibility tag ${tagId}`,
      })
      else if (tag.optionId !== rule.exclusionOptionId) collector.error({
        code: 'ELIGIBILITY_POLICY_TAG_OPTION_MISMATCH',
        sourceFile,
        path: `/rules/${index}/restrictionTagIds`,
        entityId: tagId,
        message: `Eligibility tag ${tagId} does not match its exclusions option`,
      })
    }
    if (rule.exclusionOptionId === source.noneOptionId && rule.restrictionTagIds.length) {
      collector.error({
        code: 'ELIGIBILITY_POLICY_NONE_INVALID',
        sourceFile,
        path: `/rules/${index}/restrictionTagIds`,
        entityId: source.noneOptionId,
        message: 'Eligibility none option cannot restrict candidates',
      })
    }
  }
  const expectedOptions = [...options.values()]
    .sort((left, right) => left.order - right.order || compareCodePoints(left.id, right.id))
    .map(({ id }) => id)
  const actualOptions = [...source.rules]
    .sort((left, right) => left.priority - right.priority || compareCodePoints(left.id, right.id))
    .map(({ exclusionOptionId }) => exclusionOptionId)
  if (expectedOptions.length !== actualOptions.length
    || expectedOptions.some((id, index) => id !== actualOptions[index])) collector.error({
    code: 'ELIGIBILITY_POLICY_OPTION_SET_INVALID',
    sourceFile,
    path: '/rules',
    message: 'Eligibility policy must cover every exclusions option in question order',
    expected: expectedOptions,
    received: actualOptions,
  })
  const expectedTags = [...tagById.keys()].sort(compareCodePoints)
  const actualTags = [...observedTags].sort(compareCodePoints)
  if (expectedTags.length !== actualTags.length
    || expectedTags.some((id, index) => id !== actualTags[index])) collector.error({
    code: 'ELIGIBILITY_POLICY_TAG_SET_INVALID',
    sourceFile,
    path: '/rules',
    message: 'Eligibility policy must cover each style exclusion tag exactly once',
    expected: expectedTags,
    received: actualTags,
  })

  if (source.selection.primaryLimit !== scoringPolicy.ranking.primaryLimit
    || source.selection.alternativeLimit !== scoringPolicy.ranking.alternativeLimit) {
    collector.error({
      code: 'ELIGIBILITY_POLICY_SELECTION_INVALID',
      sourceFile,
      path: '/selection',
      message: 'Eligibility selection limits must match scoring display limits',
    })
  }
  if (scoringPolicy.metadata.questionModelVersion !== questionModel.metadata.modelVersion
    || scoringPolicy.metadata.questionSemanticHash !== questionModel.metadata.semanticHash
    || scoringPolicy.metadata.styleModelVersion !== styleModel.metadata.modelVersion
    || scoringPolicy.metadata.styleSemanticHash !== styleModel.metadata.semanticHash) {
    collector.error({
      code: 'ELIGIBILITY_POLICY_IDENTITY_BINDING_INVALID',
      sourceFile,
      path: '/identity',
      message: 'Eligibility policy component identities do not match',
    })
  }
  return collector.toArray()
}
