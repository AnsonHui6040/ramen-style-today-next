import {
  compareDiagnostics,
  type Diagnostic,
} from '../../contracts/diagnostic.js'
import type {
  CompiledQuestionModel,
  QuestionDefinitionSource,
} from '../../contracts/question-model.js'
import { compareCodePoints } from '../../contracts/source-path.js'
import { DiagnosticCollector } from '../collector.js'
import { stableJson } from '../stable-json.js'
import { canonicalizeQuestionSource, type CanonicalQuestion } from './canonicalize.js'
import { deriveQuestionGraph } from './dependencies.js'
import {
  conditionNodesForQuestions,
  deriveQuestionFacts,
  exploreQuestionSemantics,
  normalizeSemanticAnswers,
  resolveForcedAnswers,
  type SemanticAnswers,
} from './explore.js'

export interface ForcedFixedPointProof {
  readonly diagnostics: readonly Diagnostic[]
  readonly answers: SemanticAnswers
  readonly iterations: number
  readonly upperBound: number
}

export interface QuestionModelProof {
  readonly diagnostics: readonly Diagnostic[]
  readonly coverage: {
    readonly questionIds: readonly string[]
    readonly optionIds: readonly string[]
  }
  readonly validSelectionKeysByQuestion: Readonly<Record<string, readonly string[]>>
  readonly forcedIterationUpperBound: number
}

const proofSource = 'runtime://question-proof'

function duplicateValues<T>(values: readonly T[]) {
  const seen = new Set<T>()
  const duplicates = new Set<T>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

function localDiagnostics(
  definition: readonly QuestionDefinitionSource[],
  questions: readonly CanonicalQuestion[],
) {
  const collector = new DiagnosticCollector()
  for (const questionId of duplicateValues(definition.map(({ id }) => id)).sort(compareCodePoints)) {
    collector.error({
      code: 'QUESTION_DUPLICATE_ID',
      sourceFile: proofSource,
      path: '/questions',
      entityId: questionId,
      message: `Duplicate question ${questionId}`,
    })
  }
  for (const [questionIndex, question] of definition.entries()) {
    for (const optionId of duplicateValues(question.options.map(({ id }) => id)).sort(compareCodePoints)) {
      collector.error({
        code: 'OPTION_DUPLICATE_ID',
        sourceFile: proofSource,
        path: `/questions/${questionIndex}/options`,
        entityId: `${question.id}:${optionId}`,
        message: `Duplicate option ${question.id}:${optionId}`,
      })
    }
    for (const order of duplicateValues(question.options.map(({ order }) => order)).sort((a, b) => a - b)) {
      collector.error({
        code: 'OPTION_ORDER_DUPLICATE',
        sourceFile: proofSource,
        path: `/questions/${questionIndex}/options`,
        entityId: question.id,
        message: `Duplicate option order ${order}`,
        received: order,
      })
    }
  }

  const questionById = new Map(questions.map((question) => [question.id, question]))
  for (const [questionIndex, question] of questions.entries()) {
    const selectionRanges = [question.selection, ...question.selection.overrides]
    const invalidRange = selectionRanges.some(({ min, max }) => (
      min > max || max > question.options.length
    ))
    const invalidSingle = question.selection.type === 'single'
      && selectionRanges.some(({ max }) => max !== 1)
    const exclusiveOptions = question.options.filter(({ exclusive }) => exclusive)
    const exclusiveNotLegalAlone = exclusiveOptions.length > 0
      && !(question.selection.min <= 1 && question.selection.max >= 1)
    if (
      invalidRange
      || invalidSingle
      || exclusiveOptions.length > 1
      || exclusiveNotLegalAlone
    ) {
      collector.error({
        code: 'QUESTION_SELECTION_INVALID',
        sourceFile: proofSource,
        path: `/questions/${questionIndex}/selection`,
        entityId: question.id,
        message: `Question ${question.id} has invalid local selection constraints`,
      })
    }

    const optionIds = new Set(question.options.map(({ id }) => id))
    const unknownOwnedIds = new Set([
      ...question.allowedOptions.flatMap(({ selection }) => (
        selection.type === 'only' ? selection.optionIds : []
      )),
      ...question.initialUiOptionIds,
    ].filter((optionId) => !optionIds.has(optionId)))
    for (const optionId of [...unknownOwnedIds].sort(compareCodePoints)) collector.error({
      code: 'CONDITION_REFERENCE_UNKNOWN',
      sourceFile: proofSource,
      path: `/questions/${questionIndex}`,
      entityId: question.id,
      message: `Question ${question.id} references unknown owned option ${optionId}`,
    })
  }

  for (const condition of conditionNodesForQuestions(questions)) {
    if (condition.type !== 'answer-includes') continue
    const owner = questionById.get(condition.questionId)
    if (owner && !owner.options.some(({ id }) => id === condition.optionId)) collector.error({
      code: 'CONDITION_REFERENCE_UNKNOWN',
      sourceFile: proofSource,
      path: '/questions',
      entityId: condition.questionId,
      message: `Condition references unknown option ${condition.questionId}:${condition.optionId}`,
    })
  }
  return collector.toArray()
}

function mergeDiagnostics(...groups: readonly (readonly Diagnostic[])[]) {
  return [...groups.flat()].sort(compareDiagnostics)
}

export function proveForcedFixedPoint(
  model: CompiledQuestionModel,
  initialAnswers: SemanticAnswers = {},
): ForcedFixedPointProof {
  const resolution = resolveForcedAnswers(
    model.questions,
    model.topologicalOrder,
    initialAnswers,
  )
  const collector = new DiagnosticCollector()
  if (resolution.status === 'cycle') collector.error({
    code: 'FLOW_FORCED_CYCLE',
    sourceFile: proofSource,
    path: '/questions',
    message: 'Forced resolution repeated a canonical answer-state key before fixed point',
    ...(resolution.repeatedStateKey ? { received: resolution.repeatedStateKey } : {}),
  })
  if (resolution.status === 'upper-bound') collector.error({
    code: 'FLOW_FORCED_NON_IDEMPOTENT',
    sourceFile: proofSource,
    path: '/questions',
    message: 'Forced resolution exceeded its model-sized iteration upper bound',
    expected: resolution.upperBound,
  })
  if (resolution.status === 'fixed') {
    const repeated = resolveForcedAnswers(
      model.questions,
      model.topologicalOrder,
      resolution.answers,
    )
    if (
      repeated.status !== 'fixed'
      || stableJson(repeated.answers) !== stableJson(resolution.answers)
    ) collector.error({
      code: 'FLOW_FORCED_NON_IDEMPOTENT',
      sourceFile: proofSource,
      path: '/questions',
      message: 'Forced resolution changed an already resolved canonical state',
    })
  }
  return {
    diagnostics: collector.toArray(),
    answers: resolution.answers,
    iterations: resolution.iterations,
    upperBound: resolution.upperBound,
  }
}

function emptyProof(diagnostics: readonly Diagnostic[]): QuestionModelProof {
  return {
    diagnostics,
    coverage: { questionIds: [], optionIds: [] },
    validSelectionKeysByQuestion: {},
    forcedIterationUpperBound: 0,
  }
}

export function proveQuestionModel(
  definition: readonly QuestionDefinitionSource[],
): QuestionModelProof {
  const questions = canonicalizeQuestionSource(definition)
  const graph = deriveQuestionGraph(questions)
  const structuralDiagnostics = mergeDiagnostics(
    graph.diagnostics,
    localDiagnostics(definition, questions),
  )
  if (structuralDiagnostics.length > 0) return emptyProof(structuralDiagnostics)

  const exploration = exploreQuestionSemantics(definition)
  const collector = new DiagnosticCollector()
  const emitted = new Set<string>()
  const emit = (
    code: 'FLOW_EMPTY_BRANCH'
      | 'FLOW_IMPOSSIBLE_COMPLETION'
      | 'FLOW_FORCED_CYCLE'
      | 'FLOW_FORCED_NON_IDEMPOTENT'
      | 'FLOW_DEAD_QUESTION'
      | 'FLOW_DEAD_OPTION'
      | 'QUESTION_SELECTION_INVALID',
    path: string,
    message: string,
    entityId?: string,
  ) => {
    const key = `${code}\0${entityId ?? ''}`
    if (emitted.has(key)) return
    emitted.add(key)
    collector.error({
      code,
      sourceFile: proofSource,
      path,
      ...(entityId ? { entityId } : {}),
      message,
    })
  }

  for (const failure of exploration.forcedFailures) {
    emit(
      failure.status === 'cycle' ? 'FLOW_FORCED_CYCLE' : 'FLOW_FORCED_NON_IDEMPOTENT',
      '/questions',
      failure.status === 'cycle'
        ? 'Forced resolution repeated a canonical answer-state key before fixed point'
        : 'Forced resolution exceeded its model-sized iteration upper bound',
    )
  }
  if (exploration.forcedNonIdempotentStateKeys.length > 0) emit(
    'FLOW_FORCED_NON_IDEMPOTENT',
    '/questions',
    'Forced resolution changed an already resolved semantic state',
  )

  const questionIndex = new Map(questions.map(({ id }, index) => [id, index]))
  const coveredQuestionIds = new Set(exploration.coverage.questionIds)
  const coveredOptionIds = new Set(exploration.coverage.optionIds)
  for (const question of questions) {
    const index = questionIndex.get(question.id)!
    if (!coveredQuestionIds.has(question.id)) {
      emit(
        'FLOW_DEAD_QUESTION',
        `/questions/${index}`,
        `Question ${question.id} is unreachable in every semantic environment`,
        question.id,
      )
      continue
    }
    for (const [optionIndex, option] of question.options.entries()) {
      if (!coveredOptionIds.has(`${question.id}:${option.id}`)) emit(
        'FLOW_DEAD_OPTION',
        `/questions/${index}/options/${optionIndex}`,
        `Option ${question.id}:${option.id} is unavailable in every reachable environment`,
        `${question.id}:${option.id}`,
      )
    }
  }

  const stateByKey = new Map(exploration.reachableStates.map((state) => [
    state.signatureKey,
    state,
  ]))
  const canComplete = new Set(
    exploration.reachableStates.filter(({ complete }) => complete).map(({ signatureKey }) => (
      signatureKey
    )),
  )
  let changed = true
  while (changed) {
    changed = false
    for (const state of exploration.reachableStates) {
      if (
        !canComplete.has(state.signatureKey)
        && state.successorSignatureKeys.some((key) => canComplete.has(key))
      ) {
        canComplete.add(state.signatureKey)
        changed = true
      }
    }
  }

  for (const state of exploration.reachableStates) {
    const normalized = normalizeSemanticAnswers(questions, state.answers)
    if (stableJson(normalizeSemanticAnswers(questions, normalized)) !== stableJson(normalized)) emit(
      'FLOW_FORCED_NON_IDEMPOTENT',
      '/questions',
      'Canonical answer normalization is not idempotent',
    )
    const facts = deriveQuestionFacts(questions, state.answers)
    for (const question of questions) {
      const item = facts[question.id]!
      if (!item.reachable) continue
      const index = questionIndex.get(question.id)!
      if (item.allowedOptionIds.length === 0 && item.bounds.min > 0) emit(
        'FLOW_EMPTY_BRANCH',
        `/questions/${index}/allowedOptions`,
        `Reachable question ${question.id} has no allowed options`,
        question.id,
      )
      if (question.initialUiOptionIds.length > 0 && item.forcedEligibility === 'interactive') {
        const initialKey = JSON.stringify(question.initialUiOptionIds)
        const legalKeys = new Set(item.legalSelections.map((selection) => JSON.stringify(selection)))
        if (!legalKeys.has(initialKey)) emit(
          'QUESTION_SELECTION_INVALID',
          `/questions/${index}/initialUiOptionIds`,
          `Initial UI selection for ${question.id} is not legal in every interactive environment`,
          question.id,
        )
      }
      if (
        item.forcedEligibility === 'forced'
        && state.signature.answerValidity[question.id] !== 'valid'
      ) emit(
        'FLOW_FORCED_NON_IDEMPOTENT',
        `/questions/${index}/autoAnswer`,
        `Forced answer for ${question.id} is not legal at fixed point`,
        question.id,
      )
    }
    for (const [questionId, answer] of Object.entries(state.answers)) {
      const question = questions.find(({ id }) => id === questionId)
      if (!question) continue
      const exclusive = new Set(question.options.filter(({ exclusive }) => exclusive).map(({ id }) => id))
      if (answer.length > 1 && answer.some((optionId) => exclusive.has(optionId))) emit(
        'FLOW_IMPOSSIBLE_COMPLETION',
        `/questions/${questionIndex.get(questionId)!}/selection`,
        `Canonical answer for ${questionId} mixes exclusive and ordinary options`,
        questionId,
      )
    }
    if (state.complete) {
      const completeIsValid = state.signature.reachableQuestionIds.every((questionId) => (
        state.signature.answerValidity[questionId] === 'valid'
      )) && questions.filter(({ id }) => !state.signature.reachableQuestionIds.includes(id))
        .every(({ id }) => !Object.prototype.hasOwnProperty.call(state.answers, id))
      if (!completeIsValid) emit(
        'FLOW_IMPOSSIBLE_COMPLETION',
        '/questions',
        'A complete semantic state has missing reachable or extra unreachable answers',
      )
    }
  }

  for (const state of exploration.reachableStates) {
    if (canComplete.has(state.signatureKey)) continue
    if (state.successorSignatureKeys.length > 0) continue
    const nextQuestionId = state.nextQuestionId
    if (!nextQuestionId) {
      emit(
        'FLOW_IMPOSSIBLE_COMPLETION',
        '/questions',
        'Reachable incomplete state has no legal next action',
      )
      continue
    }
    const facts = deriveQuestionFacts(questions, state.answers)[nextQuestionId]!
    if (facts.allowedOptionIds.length === 0 && facts.bounds.min > 0) continue
    emit(
      'FLOW_IMPOSSIBLE_COMPLETION',
      `/questions/${questionIndex.get(nextQuestionId)!}/selection`,
      `Reachable state cannot complete through question ${nextQuestionId}`,
      nextQuestionId,
    )
  }

  for (const completeKey of canComplete) {
    if (!stateByKey.has(completeKey)) emit(
      'FLOW_IMPOSSIBLE_COMPLETION',
      '/questions',
      'Completion proof referenced an unknown semantic state',
    )
  }

  return {
    diagnostics: collector.toArray(),
    coverage: exploration.coverage,
    validSelectionKeysByQuestion: exploration.validSelectionKeysByQuestion,
    forcedIterationUpperBound: exploration.forcedIterationUpperBound,
  }
}
