import type { Diagnostic } from '../../contracts/diagnostic.js'
import type { SerializableCondition } from '../../contracts/question-model.js'
import { compareCodePoints } from '../../contracts/source-path.js'
import { DiagnosticCollector } from '../collector.js'
import type { CanonicalQuestion } from './canonicalize.js'

const graphDiagnosticSource = 'runtime://question-graph'

export interface ConditionReference {
  readonly ownerQuestionId: string
  readonly referencedQuestionId: string
  readonly path: string
}

export interface QuestionGraph {
  readonly semanticDependencies: Readonly<Record<string, readonly string[]>>
  readonly dependentClosures: Readonly<Record<string, readonly string[]>>
  readonly topologicalOrder: readonly string[]
  readonly diagnostics: readonly Diagnostic[]
}

export function conditionReferences(condition: SerializableCondition): readonly string[] {
  switch (condition.type) {
    case 'answered':
    case 'answer-includes':
      return [condition.questionId]
    case 'not':
      return conditionReferences(condition.condition)
    case 'all':
    case 'any':
      return [...new Set(condition.conditions.flatMap(conditionReferences))].sort(compareCodePoints)
  }
}

function collectConditionReferences(
  condition: SerializableCondition,
  ownerQuestionId: string,
  path: string,
  references: ConditionReference[],
) {
  switch (condition.type) {
    case 'answered':
    case 'answer-includes':
      references.push({
        ownerQuestionId,
        referencedQuestionId: condition.questionId,
        path: `${path}/questionId`,
      })
      return
    case 'not':
      collectConditionReferences(
        condition.condition,
        ownerQuestionId,
        `${path}/condition`,
        references,
      )
      return
    case 'all':
    case 'any':
      condition.conditions.forEach((child, index) => {
        collectConditionReferences(
          child,
          ownerQuestionId,
          `${path}/conditions/${index}`,
          references,
        )
      })
  }
}

export function extractConditionReferences(
  questions: readonly CanonicalQuestion[],
): readonly ConditionReference[] {
  const references: ConditionReference[] = []
  questions.forEach((question, questionIndex) => {
    const questionPath = `/questions/${questionIndex}`
    if (question.availableWhen) {
      collectConditionReferences(
        question.availableWhen,
        question.id,
        `${questionPath}/availableWhen`,
        references,
      )
    }
    question.options.forEach((option, optionIndex) => {
      if (option.availableWhen) {
        collectConditionReferences(
          option.availableWhen,
          question.id,
          `${questionPath}/options/${optionIndex}/availableWhen`,
          references,
        )
      }
    })
    question.allowedOptions.forEach((row, rowIndex) => {
      collectConditionReferences(
        row.when,
        question.id,
        `${questionPath}/allowedOptions/${rowIndex}/when`,
        references,
      )
    })
    question.selection.overrides.forEach((override, overrideIndex) => {
      collectConditionReferences(
        override.when,
        question.id,
        `${questionPath}/selection/overrides/${overrideIndex}/when`,
        references,
      )
    })
    if (question.autoAnswer?.when) {
      collectConditionReferences(
        question.autoAnswer.when,
        question.id,
        `${questionPath}/autoAnswer/when`,
        references,
      )
    }
  })
  return references
}

function duplicateOrders(questions: readonly CanonicalQuestion[]) {
  const counts = new Map<number, number>()
  for (const question of questions) counts.set(question.order, (counts.get(question.order) ?? 0) + 1)
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([order]) => order)
    .sort((left, right) => left - right)
}

function orderedQuestionIds(questions: readonly CanonicalQuestion[]) {
  return [...new Set(questions.map(({ id }) => id))]
}

export function deriveQuestionGraph(
  questions: readonly CanonicalQuestion[],
): QuestionGraph {
  const collector = new DiagnosticCollector()
  for (const order of duplicateOrders(questions)) collector.error({
    code: 'QUESTION_ORDER_DUPLICATE',
    sourceFile: graphDiagnosticSource,
    path: '/questions',
    message: `Duplicate question order ${order}`,
    received: order,
  })

  const questionIds = orderedQuestionIds(questions)
  const questionIdSet = new Set(questionIds)
  const canonicalIndex = new Map(questionIds.map((id, index) => [id, index]))
  const compareQuestionIds = (left: string, right: string) => (
    (canonicalIndex.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (canonicalIndex.get(right) ?? Number.MAX_SAFE_INTEGER)
      || compareCodePoints(left, right)
  )
  const dependencies = new Map(questionIds.map((id) => [id, new Set<string>()]))
  for (const reference of extractConditionReferences(questions)) {
    if (!questionIdSet.has(reference.referencedQuestionId)) {
      collector.error({
        code: 'CONDITION_REFERENCE_UNKNOWN',
        sourceFile: graphDiagnosticSource,
        path: reference.path,
        entityId: reference.ownerQuestionId,
        message: `Unknown question dependency ${reference.referencedQuestionId}`,
      })
      continue
    }
    dependencies.get(reference.ownerQuestionId)?.add(reference.referencedQuestionId)
  }

  const semanticDependencies = Object.fromEntries(questionIds.map((questionId) => [
    questionId,
    [...(dependencies.get(questionId) ?? [])].sort(compareQuestionIds),
  ]))
  const dependents = new Map(questionIds.map((id) => [id, new Set<string>()]))
  for (const [ownerQuestionId, ownerDependencies] of dependencies) {
    for (const dependency of ownerDependencies) {
      dependents.get(dependency)?.add(ownerQuestionId)
    }
  }

  const dependentClosures = Object.fromEntries(questionIds.map((questionId) => {
    const visited = new Set([questionId])
    const pending = [...(dependents.get(questionId) ?? [])].sort(compareQuestionIds)
    while (pending.length > 0) {
      const dependent = pending.shift()!
      if (visited.has(dependent)) continue
      visited.add(dependent)
      pending.push(...[...(dependents.get(dependent) ?? [])].sort(compareQuestionIds))
    }
    visited.delete(questionId)
    return [questionId, [...visited].sort(compareQuestionIds)]
  }))

  const indegree = new Map(questionIds.map((id) => [id, dependencies.get(id)?.size ?? 0]))
  const ready = questionIds.filter((id) => indegree.get(id) === 0).sort(compareQuestionIds)
  const topologicalOrder: string[] = []
  while (ready.length > 0) {
    const questionId = ready.shift()!
    topologicalOrder.push(questionId)
    for (const dependent of [...(dependents.get(questionId) ?? [])].sort(compareQuestionIds)) {
      const nextIndegree = (indegree.get(dependent) ?? 0) - 1
      indegree.set(dependent, nextIndegree)
      if (nextIndegree === 0) {
        ready.push(dependent)
        ready.sort(compareQuestionIds)
      }
    }
  }
  if (topologicalOrder.length !== questionIds.length) collector.error({
    code: 'FLOW_CYCLE',
    sourceFile: graphDiagnosticSource,
    path: '/questions',
    message: 'Question dependency graph contains a cycle',
  })

  return {
    semanticDependencies,
    dependentClosures,
    topologicalOrder,
    diagnostics: collector.toArray(),
  }
}
