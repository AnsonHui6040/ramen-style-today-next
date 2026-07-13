import { createHash } from 'node:crypto'

import type { Diagnostic } from '../contracts/diagnostic.js'
import type {
  ClassificationModel,
  ConceptKey,
  ConceptRecord,
} from '../contracts/model.js'
import type { SerializableCondition } from '../contracts/question-model.js'
import { compareCodePoints } from '../contracts/source-path.js'
import { DiagnosticCollector } from './collector.js'
import { parseDefinitionBundle } from './parse.js'
import { stableJson } from './stable-json.js'

export type CompileResult =
  | { ok: true; model: ClassificationModel; diagnostics: readonly Diagnostic[] }
  | { ok: false; diagnostics: readonly Diagnostic[] }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function duplicateValues(values: readonly string[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].sort(compareCodePoints)
}

function inventoryKey(kind: ConceptRecord['kind'], id: string): ConceptKey {
  return `${kind}/${id}`
}

function optionIdentity(questionId: string, optionId: string) {
  return `${questionId}:${optionId}`
}

interface ConditionQuestionReference {
  questionId: string
  path: string
}

type ParsedDefinition = NonNullable<ReturnType<typeof parseDefinitionBundle>['definition']>
type ParsedQuestion = ParsedDefinition['questions'][number]

function collectConditionQuestionReferences(
  condition: SerializableCondition,
  path: string,
  references: ConditionQuestionReference[],
) {
  switch (condition.type) {
    case 'answered':
    case 'answer-includes':
      references.push({ questionId: condition.questionId, path: `${path}/questionId` })
      return
    case 'all':
    case 'any':
      condition.conditions.forEach((child, index) => {
        collectConditionQuestionReferences(child, `${path}/conditions/${index}`, references)
      })
      return
    case 'not':
      collectConditionQuestionReferences(condition.condition, `${path}/condition`, references)
  }
}

function questionConditionReferences(
  question: ParsedQuestion,
  questionIndex: number,
) {
  const references: ConditionQuestionReference[] = []
  const questionPath = `/questions/${questionIndex}`
  if (question.availableWhen) {
    collectConditionQuestionReferences(
      question.availableWhen,
      `${questionPath}/availableWhen`,
      references,
    )
  }
  question.options.forEach((option, optionIndex) => {
    if (option.availableWhen) {
      collectConditionQuestionReferences(
        option.availableWhen,
        `${questionPath}/options/${optionIndex}/availableWhen`,
        references,
      )
    }
  })
  question.allowedOptions?.forEach((row, rowIndex) => {
    collectConditionQuestionReferences(
      row.when,
      `${questionPath}/allowedOptions/${rowIndex}/when`,
      references,
    )
  })
  question.selection.overrides?.forEach((override, overrideIndex) => {
    collectConditionQuestionReferences(
      override.when,
      `${questionPath}/selection/overrides/${overrideIndex}/when`,
      references,
    )
  })
  if (question.autoAnswer?.when) {
    collectConditionQuestionReferences(
      question.autoAnswer.when,
      `${questionPath}/autoAnswer/when`,
      references,
    )
  }
  return references
}

function flowHasCycle(dependencies: ReadonlyMap<string, ReadonlySet<string>>) {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (questionId: string): boolean => {
    if (visiting.has(questionId)) return true
    if (visited.has(questionId)) return false
    visiting.add(questionId)
    for (const dependency of dependencies.get(questionId) ?? []) {
      if (visit(dependency)) return true
    }
    visiting.delete(questionId)
    visited.add(questionId)
    return false
  }
  return [...dependencies.keys()].some(visit)
}

function buildInventory(
  definition: ParsedDefinition,
  sourceFile: string,
) {
  const records: ConceptRecord[] = []
  for (const question of definition.questions) {
    records.push({
      key: inventoryKey('question', question.id),
      kind: 'question',
      id: question.id,
      sourceFile,
      messageIds: [question.messageIds.title, question.messageIds.description],
    })
    for (const option of question.options) {
      records.push({
        key: inventoryKey('option', optionIdentity(question.id, option.id)),
        kind: 'option',
        id: option.id,
        ownerQuestionId: question.id,
        sourceFile,
        messageIds: [option.messageIds.label, option.messageIds.description]
          .filter((messageId): messageId is string => messageId !== undefined),
      })
    }
  }
  for (const style of definition.styles) {
    records.push({
      key: inventoryKey('style', style.id),
      kind: 'style',
      id: style.id,
      sourceFile: style.sourceFile,
      messageIds: [style.messageId],
    })
    for (const intensity of style.intensities) records.push({
      key: inventoryKey('intensity', `${style.id}:${intensity}`),
      kind: 'intensity',
      id: `${style.id}:${intensity}`,
      sourceFile: style.sourceFile,
      messageIds: [],
    })
    for (const noodle of style.noodles) records.push({
      key: inventoryKey('noodle', `${style.id}:${noodle}`),
      kind: 'noodle',
      id: `${style.id}:${noodle}`,
      sourceFile: style.sourceFile,
      messageIds: [],
    })
  }
  records.push({
    key: 'policy/default',
    kind: 'policy',
    id: 'default',
    sourceFile: definition.policy.sourceFile,
    messageIds: [],
  })
  return records.sort((left, right) => compareCodePoints(left.key, right.key))
}

export function compileClassification(input: unknown, sourceFile: string): CompileResult {
  const parsed = parseDefinitionBundle(input, sourceFile)
  if (!parsed.definition) return { ok: false, diagnostics: parsed.diagnostics }

  const definition = parsed.definition
  const collector = new DiagnosticCollector()
  for (const id of duplicateValues(definition.questions.map((item) => item.id))) {
    collector.error({ code: 'QUESTION_DUPLICATE_ID', sourceFile, path: '/questions', entityId: id, message: `Duplicate question ${id}` })
  }
  const optionIdentities = definition.questions.flatMap((question) => question.options.map(
    (item) => optionIdentity(question.id, item.id),
  ))
  for (const [questionIndex, question] of definition.questions.entries()) {
    for (const id of duplicateValues(question.options.map((item) => item.id))) {
      const identity = optionIdentity(question.id, id)
      collector.error({
        code: 'OPTION_DUPLICATE_ID',
        sourceFile,
        path: `/questions/${questionIndex}/options`,
        entityId: identity,
        message: `Duplicate option ${identity}`,
      })
    }
  }
  for (const id of duplicateValues(definition.styles.map((item) => item.id))) {
    collector.error({ code: 'STYLE_DUPLICATE_ID', sourceFile, path: '/styles', entityId: id, message: `Duplicate style ${id}` })
  }

  const questionIds = new Set(definition.questions.map((item) => item.id))
  const dependencies = new Map(
    definition.questions.map((question) => [question.id, new Set<string>()]),
  )
  for (const [questionIndex, question] of definition.questions.entries()) {
    for (const reference of questionConditionReferences(question, questionIndex)) {
      if (!questionIds.has(reference.questionId)) {
        collector.error({
          code: 'REFERENCE_UNKNOWN',
          sourceFile,
          path: reference.path,
          entityId: question.id,
          message: `Unknown question dependency ${reference.questionId}`,
        })
      } else {
        dependencies.get(question.id)?.add(reference.questionId)
      }
    }
  }
  if (flowHasCycle(dependencies)) collector.error({
    code: 'FLOW_CYCLE',
    sourceFile,
    path: '/questions',
    message: 'Question dependency graph contains a cycle',
  })

  const optionIdentitySet = new Set(optionIdentities)
  for (const [index, style] of definition.styles.entries()) {
    const identity = optionIdentity(
      style.familyOptionId.questionId,
      style.familyOptionId.optionId,
    )
    if (!optionIdentitySet.has(identity)) collector.error({
      code: 'REFERENCE_UNKNOWN',
      sourceFile: style.sourceFile,
      path: `/styles/${index}/familyOptionId`,
      entityId: style.id,
      message: `Unknown family option ${identity}`,
    })
  }
  const totalWeight = definition.questions.reduce((sum, question) => sum + (question.weight ?? 0), 0)
  if (totalWeight !== 100) collector.error({
    code: 'POLICY_WEIGHT_TOTAL',
    sourceFile: definition.policy.sourceFile,
    path: '/questions',
    message: `Question weights total ${totalWeight}, expected 100`,
    expected: 100,
    received: totalWeight,
  })

  const inventory = buildInventory(definition, sourceFile)
  for (const key of duplicateValues(inventory.map((item) => item.key))) {
    collector.error({
      code: 'CONCEPT_DUPLICATE_KEY',
      sourceFile,
      path: '/inventory',
      entityId: key,
      message: `Duplicate concept key ${key}`,
    })
  }

  const diagnostics = collector.toArray()
  if (collector.hasErrors()) return { ok: false, diagnostics }
  const dataVersion = createHash('sha256').update(stableJson(definition)).digest('hex')
  const model = deepFreeze({
    modelVersion: definition.modelVersion,
    dataVersion,
    provenance: definition.provenance,
    questions: definition.questions,
    styles: definition.styles,
    policy: definition.policy,
    inventory,
  } satisfies ClassificationModel)
  return { ok: true, model, diagnostics }
}
