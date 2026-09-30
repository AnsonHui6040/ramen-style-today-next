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
import type { DefinitionBundleSource } from './source-schema.js'
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

type QuestionSource = DefinitionBundleSource['questions'][number]

export function questionOptionList(question: QuestionSource) {
  return question.optionSet.kind === 'flat'
    ? question.optionSet.options
    : question.optionSet.branches.flatMap((branch) => branch.options)
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
    for (const option of questionOptionList(question)) {
      records.push({
        key: inventoryKey('option', `${question.id}:${option.id}`),
        kind: 'option',
        id: `${question.id}:${option.id}`,
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

function validateFlow(
  definition: DefinitionBundleSource,
  collector: DiagnosticCollector,
) {
  const byId = new Map(definition.questions.map((question) => [question.id, question]))
  const orders = definition.questions.map((question) => String(question.order))
  for (const order of duplicateValues(orders)) {
    collector.error({
      code: 'FLOW_ORDER_INVALID',
      sourceFile: definition.questions[0]!.sourceFile,
      path: '/questions',
      message: `Question order ${order} is used more than once`,
    })
  }
  for (const [index, question] of definition.questions.entries()) {
    const at = (suffix: string) => `/questions/${index}${suffix}`
    const fail = (
      code: 'REFERENCE_UNKNOWN' | 'FLOW_ORDER_INVALID' | 'FLOW_BRANCH_INCOMPLETE',
      suffix: string,
      message: string,
    ) => collector.error({
      code,
      sourceFile: question.sourceFile,
      path: at(suffix),
      entityId: question.id,
      message,
    })
    for (const [dependencyIndex, dependency] of question.dependsOn.entries()) {
      const target = byId.get(dependency)
      if (target && target.order >= question.order) fail(
        'FLOW_ORDER_INVALID',
        `/dependsOn/${dependencyIndex}`,
        `Question ${question.id} must come after its dependency ${dependency}`,
      )
    }
    const universe = new Set(questionOptionList(question).map((option) => option.id))
    if (question.emptyFallbackOptionId && !universe.has(question.emptyFallbackOptionId)) fail(
      'REFERENCE_UNKNOWN',
      '/emptyFallbackOptionId',
      `Unknown fallback option ${question.emptyFallbackOptionId}`,
    )
    const selector = (
      by: string,
      suffix: string,
    ) => {
      if (!question.dependsOn.includes(by)) fail(
        'REFERENCE_UNKNOWN',
        suffix,
        `Question ${question.id} selects by ${by} without depending on it`,
      )
      const target = byId.get(by)
      return target ? new Set(questionOptionList(target).map((option) => option.id)) : undefined
    }
    if (question.optionSet.kind === 'branch') {
      const selectorOptions = selector(question.optionSet.by, '/optionSet/by')
      const seen = new Set<string>()
      for (const [branchIndex, branch] of question.optionSet.branches.entries()) {
        if (selectorOptions && !selectorOptions.has(branch.when)) fail(
          'REFERENCE_UNKNOWN',
          `/optionSet/branches/${branchIndex}/when`,
          `Unknown branch selector option ${branch.when}`,
        )
        if (seen.has(branch.when)) fail(
          'FLOW_BRANCH_INCOMPLETE',
          `/optionSet/branches/${branchIndex}/when`,
          `Branch ${branch.when} is defined more than once`,
        )
        seen.add(branch.when)
      }
      for (const option of selectorOptions ?? []) {
        if (!seen.has(option)) fail(
          'FLOW_BRANCH_INCOMPLETE',
          '/optionSet/branches',
          `No branch defined for selector option ${option}`,
        )
      }
    }
    if (question.restriction) {
      const selectorOptions = selector(question.restriction.by, '/restriction/by')
      const seen = new Set<string>()
      for (const [allowIndex, allow] of question.restriction.allow.entries()) {
        if (selectorOptions && !selectorOptions.has(allow.when)) fail(
          'REFERENCE_UNKNOWN',
          `/restriction/allow/${allowIndex}/when`,
          `Unknown restriction selector option ${allow.when}`,
        )
        if (seen.has(allow.when)) fail(
          'FLOW_BRANCH_INCOMPLETE',
          `/restriction/allow/${allowIndex}/when`,
          `Restriction for ${allow.when} is defined more than once`,
        )
        seen.add(allow.when)
        for (const [optionIndex, optionId] of allow.optionIds.entries()) {
          if (!universe.has(optionId)) fail(
            'REFERENCE_UNKNOWN',
            `/restriction/allow/${allowIndex}/optionIds/${optionIndex}`,
            `Restriction allows unknown option ${optionId}`,
          )
        }
      }
    }
  }
}

export function compileClassification(input: unknown, sourceFile: string): CompileResult {
  const parsed = parseDefinitionBundle(input, sourceFile)
  if (!parsed.definition) return { ok: false, diagnostics: parsed.diagnostics }

  const definition = parsed.definition
  const collector = new DiagnosticCollector()
  for (const id of duplicateValues(definition.questions.map((item) => item.id))) {
    collector.error({ code: 'QUESTION_DUPLICATE_ID', sourceFile, path: '/questions', entityId: id, message: `Duplicate question ${id}` })
  }
  const optionIds = definition.questions.flatMap((question) => questionOptionList(question).map((item) => item.id))
  for (const [index, question] of definition.questions.entries()) {
    for (const id of duplicateValues(questionOptionList(question).map((item) => item.id))) {
      collector.error({
        code: 'OPTION_DUPLICATE_ID',
        sourceFile: question.sourceFile,
        path: `/questions/${index}/optionSet`,
        entityId: `${question.id}:${id}`,
        message: `Duplicate option ${id} in question ${question.id}`,
      })
    }
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
  validateFlow(definition, collector)

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
