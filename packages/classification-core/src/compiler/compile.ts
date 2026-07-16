import { createHash } from 'node:crypto'

import type { Diagnostic } from '../contracts/diagnostic.js'
import type {
  ClassificationModel,
  ConceptKey,
  ConceptRecord,
} from '../contracts/model.js'
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

function flowHasCycle(questions: readonly { id: string; dependsOn: readonly string[] }[]) {
  const graph = new Map(questions.map((question) => [question.id, question.dependsOn]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const dependency of graph.get(id) ?? []) {
      if (graph.has(dependency) && visit(dependency)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return [...graph.keys()].some(visit)
}

function inventoryKey(kind: ConceptRecord['kind'], id: string): ConceptKey {
  return `${kind}/${id}`
}

function buildInventory(definition: NonNullable<ReturnType<typeof parseDefinitionBundle>['definition']>) {
  const records: ConceptRecord[] = []
  for (const question of definition.questions) {
    records.push({
      key: inventoryKey('question', question.id),
      kind: 'question',
      id: question.id,
      sourceFile: question.sourceFile,
      messageIds: [question.messageId],
    })
    for (const option of question.options) {
      records.push({
        key: inventoryKey('option', option.id),
        kind: 'option',
        id: option.id,
        sourceFile: question.sourceFile,
        messageIds: [option.messageId],
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
  const optionIds = definition.questions.flatMap((question) => question.options.map((item) => item.id))
  for (const id of duplicateValues(optionIds)) {
    collector.error({ code: 'OPTION_DUPLICATE_ID', sourceFile, path: '/questions', entityId: id, message: `Duplicate option ${id}` })
  }
  for (const id of duplicateValues(definition.styles.map((item) => item.id))) {
    collector.error({ code: 'STYLE_DUPLICATE_ID', sourceFile, path: '/styles', entityId: id, message: `Duplicate style ${id}` })
  }

  const questionIds = new Set(definition.questions.map((item) => item.id))
  const optionIdSet = new Set(optionIds)
  for (const [index, question] of definition.questions.entries()) {
    for (const [dependencyIndex, dependency] of question.dependsOn.entries()) {
      if (!questionIds.has(dependency)) collector.error({
        code: 'REFERENCE_UNKNOWN',
        sourceFile: question.sourceFile,
        path: `/questions/${index}/dependsOn/${dependencyIndex}`,
        entityId: question.id,
        message: `Unknown question dependency ${dependency}`,
      })
    }
  }
  for (const [index, style] of definition.styles.entries()) {
    if (!optionIdSet.has(style.familyOptionId)) collector.error({
      code: 'REFERENCE_UNKNOWN',
      sourceFile: style.sourceFile,
      path: `/styles/${index}/familyOptionId`,
      entityId: style.id,
      message: `Unknown family option ${style.familyOptionId}`,
    })
  }
  if (flowHasCycle(definition.questions)) collector.error({
    code: 'FLOW_CYCLE',
    sourceFile,
    path: '/questions',
    message: 'Question dependency graph contains a cycle',
  })
  const totalWeight = definition.questions.reduce((sum, question) => sum + question.weight, 0)
  if (totalWeight !== 100) collector.error({
    code: 'POLICY_WEIGHT_TOTAL',
    sourceFile: definition.policy.sourceFile,
    path: '/questions',
    message: `Question weights total ${totalWeight}, expected 100`,
    expected: 100,
    received: totalWeight,
  })

  const inventory = buildInventory(definition)
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
    mode: definition.mode,
    modelVersion: definition.modelVersion,
    dataVersion,
    questions: definition.questions,
    styles: definition.styles,
    policy: definition.policy,
    inventory,
  } satisfies ClassificationModel)
  return { ok: true, model, diagnostics }
}
