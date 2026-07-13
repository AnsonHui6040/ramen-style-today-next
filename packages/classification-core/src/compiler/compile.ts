import { createHash } from 'node:crypto'

import { compareDiagnostics, type Diagnostic } from '../contracts/diagnostic.js'
import type {
  ClassificationModel,
  ConceptKey,
  ConceptRecord,
} from '../contracts/model.js'
import type {
  CompiledQuestion,
  QuestionDefinitionSource,
} from '../contracts/question-model.js'
import { compareCodePoints } from '../contracts/source-path.js'
import { DiagnosticCollector } from './collector.js'
import { parseDefinitionBundle } from './parse.js'
import { compileQuestions } from './questions/compile.js'
import { extractConditionReferences } from './questions/dependencies.js'
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

type ParsedDefinition = NonNullable<ReturnType<typeof parseDefinitionBundle>['definition']>

function buildInventory(
  definition: ParsedDefinition,
  questions: readonly CompiledQuestion[],
  sourceFile: string,
) {
  const records: ConceptRecord[] = []
  for (const question of questions) {
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
  const questionCompilation = compileQuestions(
    definition.questions as readonly QuestionDefinitionSource[],
  )
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
  for (const reference of extractConditionReferences(definition.questions)) {
    if (!questionIds.has(reference.referencedQuestionId)) collector.error({
      code: 'REFERENCE_UNKNOWN',
      sourceFile,
      path: reference.path,
      entityId: reference.ownerQuestionId,
      message: `Unknown question dependency ${reference.referencedQuestionId}`,
    })
  }
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

  const inventory = questionCompilation.ok
    ? buildInventory(definition, questionCompilation.model.questions, sourceFile)
    : []
  if (questionCompilation.ok) {
    for (const key of duplicateValues(inventory.map((item) => item.key))) {
      collector.error({
        code: 'CONCEPT_DUPLICATE_KEY',
        sourceFile,
        path: '/inventory',
        entityId: key,
        message: `Duplicate concept key ${key}`,
      })
    }
  }

  const diagnostics = [
    ...collector.toArray(),
    ...questionCompilation.diagnostics,
  ].sort(compareDiagnostics)
  if (collector.hasErrors() || !questionCompilation.ok) return { ok: false, diagnostics }
  const dataVersion = createHash('sha256').update(stableJson({
    ...definition,
    questions: questionCompilation.model.questions,
  })).digest('hex')
  const model = deepFreeze({
    modelVersion: definition.modelVersion,
    dataVersion,
    provenance: definition.provenance,
    questions: questionCompilation.model.questions,
    styles: definition.styles,
    policy: definition.policy,
    inventory,
  } satisfies ClassificationModel)
  return { ok: true, model, diagnostics }
}
