import type {
  QuestionDefinitionSource,
  SerializableCondition,
} from '../../contracts/question-model.js'
import { compareCodePoints } from '../../contracts/source-path.js'
import { stableJson } from '../stable-json.js'
import {
  canonicalizeQuestionSource,
  type CanonicalQuestion,
} from './canonicalize.js'
import { deriveQuestionGraph, type QuestionGraph } from './dependencies.js'

export type SemanticAnswers = Readonly<Record<string, readonly string[]>>

export interface SemanticAnswerState {
  readonly submittedAnswers: SemanticAnswers
  readonly forcedAnswers: SemanticAnswers
  readonly canonicalAnswers: SemanticAnswers
}

export interface SemanticSignature {
  readonly conditionTruthVector: readonly boolean[]
  readonly reachableQuestionIds: readonly string[]
  readonly allowedOptionIdsByQuestion: Readonly<Record<string, readonly string[]>>
  readonly effectiveSelectionBounds: Readonly<Record<
    string,
    { readonly min: number; readonly max: number }
  >>
  readonly forcedEligibility: Readonly<
    Record<string, 'interactive' | 'forced' | 'unreachable'>
  >
  readonly answerValidity: Readonly<
    Record<string, 'missing' | 'valid' | 'stale' | 'invalid'>
  >
}

export type RepresentativeKind =
  | 'unanswered'
  | 'minimum'
  | 'maximum'
  | 'below-minimum'
  | 'above-maximum'
  | 'exclusive'
  | 'exclusive-conflict'
  | 'forced-singleton'
  | 'empty-branch'
  | 'stale'
  | 'allow-all'
  | 'condition-combination'

export interface RepresentativeCase {
  readonly kind: RepresentativeKind
  readonly questionId: string
  readonly optionIds?: readonly string[]
  readonly signature: SemanticSignature
}

export interface ReachableSemanticState extends SemanticAnswerState {
  readonly signature: SemanticSignature
  readonly signatureKey: string
  readonly complete: boolean
  readonly nextQuestionId?: string
  readonly legalSelectionCount: number
  readonly successorSignatureKeys: readonly string[]
}

export interface ForcedResolution extends SemanticAnswerState {
  readonly status: 'fixed' | 'cycle' | 'upper-bound'
  readonly iterations: number
  readonly upperBound: number
  readonly repeatedStateKey?: string
}

export interface QuestionSemanticExploration {
  readonly questions: readonly CanonicalQuestion[]
  readonly graph: QuestionGraph
  readonly signatures: readonly SemanticSignature[]
  readonly representativeSignatures: readonly SemanticSignature[]
  readonly representativeCases: readonly RepresentativeCase[]
  readonly reachableStates: readonly ReachableSemanticState[]
  readonly validSelectionKeysByQuestion: Readonly<Record<string, readonly string[]>>
  readonly coverage: {
    readonly questionIds: readonly string[]
    readonly optionIds: readonly string[]
  }
  readonly forcedFailures: readonly ForcedResolution[]
  readonly forcedNonIdempotentStateKeys: readonly string[]
  readonly forcedIterationUpperBound: number
}

interface QuestionFacts {
  readonly reachable: boolean
  readonly allowedOptionIds: readonly string[]
  readonly bounds: { readonly min: number; readonly max: number }
  readonly forcedEligibility: 'interactive' | 'forced' | 'unreachable'
  readonly legalSelections: readonly (readonly string[])[]
  readonly decisionSelectionType: 'implicit-all' | 'all' | 'only' | 'none'
}

interface QueuedState extends SemanticAnswerState {
  readonly signature: SemanticSignature
  readonly signatureKey: string
  readonly forcedResolution: ForcedResolution
}

interface MutableReachableState extends SemanticAnswerState {
  signature: SemanticSignature
  signatureKey: string
  complete: boolean
  nextQuestionId?: string
  legalSelectionCount: number
  successorSignatureKeys: string[]
}

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)

export function evaluateCondition(
  condition: SerializableCondition,
  answers: SemanticAnswers,
): boolean {
  switch (condition.type) {
    case 'answered':
      return hasOwn(answers, condition.questionId)
    case 'answer-includes':
      return answers[condition.questionId]?.includes(condition.optionId) ?? false
    case 'all':
      return condition.conditions.every((child) => evaluateCondition(child, answers))
    case 'any':
      return condition.conditions.some((child) => evaluateCondition(child, answers))
    case 'not':
      return !evaluateCondition(condition.condition, answers)
  }
}

function conditionRoots(questions: readonly CanonicalQuestion[]) {
  return questions.flatMap((question) => [
    ...(question.availableWhen ? [question.availableWhen] : []),
    ...question.options.flatMap((option) => option.availableWhen ? [option.availableWhen] : []),
    ...question.allowedOptions.map(({ when }) => when),
    ...question.selection.overrides.map(({ when }) => when),
    ...(question.autoAnswer?.when ? [question.autoAnswer.when] : []),
  ])
}

function appendConditionNodes(
  condition: SerializableCondition,
  nodesByKey: Map<string, SerializableCondition>,
) {
  const key = stableJson(condition)
  if (!nodesByKey.has(key)) nodesByKey.set(key, condition)
  switch (condition.type) {
    case 'answered':
    case 'answer-includes':
      return
    case 'not':
      appendConditionNodes(condition.condition, nodesByKey)
      return
    case 'all':
    case 'any':
      condition.conditions.forEach((child) => appendConditionNodes(child, nodesByKey))
  }
}

export function conditionNodesForQuestions(questions: readonly CanonicalQuestion[]) {
  const nodesByKey = new Map<string, SerializableCondition>()
  conditionRoots(questions).forEach((condition) => appendConditionNodes(condition, nodesByKey))
  return [...nodesByKey.values()]
}

function combinations<T>(items: readonly T[], count: number) {
  const result: T[][] = []
  const visit = (start: number, selected: T[]) => {
    if (selected.length === count) {
      result.push([...selected])
      return
    }
    const remaining = count - selected.length
    for (let index = start; index <= items.length - remaining; index += 1) {
      selected.push(items[index]!)
      visit(index + 1, selected)
      selected.pop()
    }
  }
  visit(0, [])
  return result
}

function legalSelections(
  question: CanonicalQuestion,
  allowedOptionIds: readonly string[],
  bounds: { readonly min: number; readonly max: number },
) {
  const allowed = new Set(allowedOptionIds)
  const ordinary = question.options.filter((option) => (
    allowed.has(option.id) && !option.exclusive
  )).map(({ id }) => id)
  const exclusive = question.options.filter((option) => (
    allowed.has(option.id) && option.exclusive
  )).map(({ id }) => id)
  const maximum = Math.min(
    bounds.max,
    ordinary.length,
    question.selection.type === 'single' ? 1 : Number.MAX_SAFE_INTEGER,
  )
  const selections: string[][] = []
  for (let count = bounds.min; count <= maximum; count += 1) {
    selections.push(...combinations(ordinary, count))
  }
  if (bounds.min <= 1 && bounds.max >= 1) {
    selections.push(...exclusive.map((optionId) => [optionId]))
  }
  return selections
}

function selectedDecisionType(
  question: CanonicalQuestion,
  answers: SemanticAnswers,
) {
  if (question.allowedOptions.length === 0) return 'implicit-all' as const
  return question.allowedOptions.find(({ when }) => evaluateCondition(when, answers))
    ?.selection.type ?? 'none'
}

function allowedOptionIds(
  question: CanonicalQuestion,
  answers: SemanticAnswers,
) {
  const available = question.options.filter((option) => (
    !option.availableWhen || evaluateCondition(option.availableWhen, answers)
  ))
  if (question.allowedOptions.length === 0) return available.map(({ id }) => id)
  const row = question.allowedOptions.find(({ when }) => evaluateCondition(when, answers))
  if (!row) return []
  if (row.selection.type === 'all') return available.map(({ id }) => id)
  const selected = new Set(row.selection.optionIds)
  return available.filter(({ id }) => selected.has(id)).map(({ id }) => id)
}

function effectiveBounds(question: CanonicalQuestion, answers: SemanticAnswers) {
  const override = question.selection.overrides.find(({ when }) => (
    evaluateCondition(when, answers)
  ))
  return override
    ? { min: override.min, max: override.max }
    : { min: question.selection.min, max: question.selection.max }
}

function questionFacts(
  question: CanonicalQuestion,
  answers: SemanticAnswers,
): QuestionFacts {
  const reachable = !question.availableWhen || evaluateCondition(question.availableWhen, answers)
  const bounds = effectiveBounds(question, answers)
  if (!reachable) return {
    reachable,
    allowedOptionIds: [],
    bounds,
    forcedEligibility: 'unreachable',
    legalSelections: [],
    decisionSelectionType: selectedDecisionType(question, answers),
  }
  const allowed = allowedOptionIds(question, answers)
  const selections = legalSelections(question, allowed, bounds)
  const autoAnswerEligible = question.autoAnswer !== undefined
    && (!question.autoAnswer.when || evaluateCondition(question.autoAnswer.when, answers))
    && allowed.length === 1
    && selections.some((selection) => (
      selection.length === 1 && selection[0] === allowed[0]
    ))
  return {
    reachable,
    allowedOptionIds: allowed,
    bounds,
    forcedEligibility: autoAnswerEligible ? 'forced' : 'interactive',
    legalSelections: selections,
    decisionSelectionType: selectedDecisionType(question, answers),
  }
}

export function deriveQuestionFacts(
  questions: readonly CanonicalQuestion[],
  answers: SemanticAnswers,
) {
  return Object.fromEntries(questions.map((question) => [
    question.id,
    questionFacts(question, answers),
  ])) as Readonly<Record<string, QuestionFacts>>
}

function canonicalSelection(question: CanonicalQuestion, optionIds: readonly string[]) {
  const optionIndex = new Map(question.options.map(({ id }, index) => [id, index]))
  return [...optionIds].sort((left, right) => (
    (optionIndex.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (optionIndex.get(right) ?? Number.MAX_SAFE_INTEGER)
      || compareCodePoints(left, right)
  ))
}

function selectionKey(question: CanonicalQuestion, optionIds: readonly string[]) {
  return JSON.stringify(canonicalSelection(question, optionIds))
}

function classifyAnswer(
  question: CanonicalQuestion,
  facts: QuestionFacts,
  answers: SemanticAnswers,
  validSelectionKeys: ReadonlySet<string>,
): SemanticSignature['answerValidity'][string] {
  if (!hasOwn(answers, question.id)) return 'missing'
  const answer = answers[question.id] ?? []
  const known = new Set(question.options.map(({ id }) => id))
  if (new Set(answer).size !== answer.length || answer.some((optionId) => !known.has(optionId))) {
    return 'invalid'
  }
  const key = selectionKey(question, answer)
  const currentKeys = new Set(facts.legalSelections.map((selection) => JSON.stringify(selection)))
  if (facts.reachable && currentKeys.has(key)) return 'valid'
  if (validSelectionKeys.has(key)) return 'stale'
  return 'invalid'
}

export function semanticSignature(
  questions: readonly CanonicalQuestion[],
  state: SemanticAnswerState,
  validSelectionKeysByQuestion: Readonly<Record<string, readonly string[]>> = {},
): SemanticSignature {
  const facts = deriveQuestionFacts(questions, state.canonicalAnswers)
  const allowedOptionIdsByQuestion: Record<string, readonly string[]> = {}
  const effectiveSelectionBounds: Record<string, { readonly min: number; readonly max: number }> = {}
  const forcedEligibility: Record<string, 'interactive' | 'forced' | 'unreachable'> = {}
  const answerValidity: Record<string, 'missing' | 'valid' | 'stale' | 'invalid'> = {}
  for (const question of questions) {
    const item = facts[question.id]!
    allowedOptionIdsByQuestion[question.id] = item.allowedOptionIds
    effectiveSelectionBounds[question.id] = item.bounds
    forcedEligibility[question.id] = item.forcedEligibility
    answerValidity[question.id] = classifyAnswer(
      question,
      item,
      state.submittedAnswers,
      new Set(validSelectionKeysByQuestion[question.id] ?? []),
    )
  }
  return {
    conditionTruthVector: conditionNodesForQuestions(questions).map((condition) => (
      evaluateCondition(condition, state.canonicalAnswers)
    )),
    reachableQuestionIds: questions.filter((question) => facts[question.id]!.reachable)
      .map(({ id }) => id),
    allowedOptionIdsByQuestion,
    effectiveSelectionBounds,
    forcedEligibility,
    answerValidity,
  }
}

export function normalizeSemanticAnswers(
  questions: readonly CanonicalQuestion[],
  answers: SemanticAnswers,
) {
  return Object.fromEntries(questions.flatMap((question) => (
    hasOwn(answers, question.id)
      ? [[question.id, canonicalSelection(question, answers[question.id] ?? [])] as const]
      : []
  )))
}

function resolvedStateKey(
  questions: readonly CanonicalQuestion[],
  forcedAnswers: SemanticAnswers,
  canonicalAnswers: SemanticAnswers,
) {
  return stableJson({
    forcedAnswers: normalizeSemanticAnswers(questions, forcedAnswers),
    canonicalAnswers: normalizeSemanticAnswers(questions, canonicalAnswers),
  })
}

function withAnswer(
  questions: readonly CanonicalQuestion[],
  answers: SemanticAnswers,
  questionId: string,
  optionIds: readonly string[],
) {
  return normalizeSemanticAnswers(questions, { ...answers, [questionId]: optionIds })
}

function withoutAnswer(
  questions: readonly CanonicalQuestion[],
  answers: SemanticAnswers,
  questionId: string,
) {
  return Object.fromEntries(questions.flatMap((question) => (
    question.id !== questionId && hasOwn(answers, question.id)
      ? [[question.id, answers[question.id] ?? []] as const]
      : []
  )))
}

function mergeCanonicalAnswers(
  questions: readonly CanonicalQuestion[],
  submittedAnswers: SemanticAnswers,
  forcedAnswers: SemanticAnswers,
) {
  return Object.fromEntries(questions.flatMap((question) => {
    if (hasOwn(forcedAnswers, question.id)) {
      return [[question.id, forcedAnswers[question.id] ?? []] as const]
    }
    if (hasOwn(submittedAnswers, question.id)) {
      return [[question.id, submittedAnswers[question.id] ?? []] as const]
    }
    return []
  }))
}

export function forcedIterationBound(questions: readonly CanonicalQuestion[]) {
  return questions.length + questions.reduce((sum, question) => sum + question.options.length, 0) + 1
}

export function resolveForcedAnswers(
  questions: readonly CanonicalQuestion[],
  topologicalOrder: readonly string[],
  initialSubmittedAnswers: SemanticAnswers = {},
): ForcedResolution {
  const submittedAnswers = normalizeSemanticAnswers(questions, initialSubmittedAnswers)
  let forcedAnswers: SemanticAnswers = {}
  let canonicalAnswers = mergeCanonicalAnswers(questions, submittedAnswers, forcedAnswers)
  const upperBound = forcedIterationBound(questions)
  const seen = new Set([resolvedStateKey(questions, forcedAnswers, canonicalAnswers)])
  const questionById = new Map(questions.map((question) => [question.id, question]))
  const orderedQuestions = [
    ...topologicalOrder.flatMap((questionId) => {
      const question = questionById.get(questionId)
      return question ? [question] : []
    }),
    ...questions.filter(({ id }) => !topologicalOrder.includes(id)),
  ]

  for (let iteration = 1; iteration <= upperBound; iteration += 1) {
    let changed = false
    for (const question of orderedQuestions) {
      const facts = questionFacts(question, canonicalAnswers)
      if (facts.forcedEligibility === 'forced') {
        const forcedOptionIds = [facts.allowedOptionIds[0]!]
        if (
          !hasOwn(forcedAnswers, question.id)
          || selectionKey(question, forcedAnswers[question.id] ?? []) !== JSON.stringify(forcedOptionIds)
        ) {
          forcedAnswers = withAnswer(questions, forcedAnswers, question.id, forcedOptionIds)
          changed = true
        }
      } else if (hasOwn(forcedAnswers, question.id)) {
        forcedAnswers = withoutAnswer(questions, forcedAnswers, question.id)
        changed = true
      }
      canonicalAnswers = mergeCanonicalAnswers(questions, submittedAnswers, forcedAnswers)
    }
    if (!changed) return {
      status: 'fixed',
      submittedAnswers,
      forcedAnswers,
      canonicalAnswers,
      iterations: iteration,
      upperBound,
    }
    const key = resolvedStateKey(questions, forcedAnswers, canonicalAnswers)
    if (seen.has(key)) return {
      status: 'cycle',
      submittedAnswers,
      forcedAnswers,
      canonicalAnswers,
      iterations: iteration,
      upperBound,
      repeatedStateKey: key,
    }
    seen.add(key)
  }
  return {
    status: 'upper-bound',
    submittedAnswers,
    forcedAnswers,
    canonicalAnswers,
    iterations: upperBound,
    upperBound,
  }
}

function referencedOptionGroups(questions: readonly CanonicalQuestion[]) {
  const groupsByQuestion = new Map<string, Map<string, readonly string[]>>()
  const collect = (condition: SerializableCondition): Map<string, Set<string>> => {
    const collected = new Map<string, Set<string>>()
    const merge = (from: Map<string, Set<string>>) => {
      for (const [questionId, optionIds] of from) {
        const target = collected.get(questionId) ?? new Set<string>()
        optionIds.forEach((optionId) => target.add(optionId))
        collected.set(questionId, target)
      }
    }
    switch (condition.type) {
      case 'answered':
        break
      case 'answer-includes':
        collected.set(condition.questionId, new Set([condition.optionId]))
        break
      case 'not':
        merge(collect(condition.condition))
        break
      case 'all':
      case 'any':
        condition.conditions.forEach((child) => merge(collect(child)))
        break
    }
    for (const [questionId, optionIds] of collected) {
      const question = questions.find(({ id }) => id === questionId)
      if (!question) continue
      const ordered = canonicalSelection(question, [...optionIds])
      const groups = groupsByQuestion.get(questionId) ?? new Map<string, readonly string[]>()
      for (let count = 1; count <= ordered.length; count += 1) {
        for (const combination of combinations(ordered, count)) {
          groups.set(JSON.stringify(combination), combination)
        }
      }
      groupsByQuestion.set(questionId, groups)
    }
    return collected
  }
  conditionRoots(questions).forEach(collect)
  return Object.fromEntries(questions.map((question) => [
    question.id,
    [...(groupsByQuestion.get(question.id)?.values() ?? [])],
  ])) as Readonly<Record<string, readonly (readonly string[])[]>>
}

function makeRepresentativeCases(
  questions: readonly CanonicalQuestion[],
  topologicalOrder: readonly string[],
  states: readonly ReachableSemanticState[],
  validSelectionKeysByQuestion: Readonly<Record<string, readonly string[]>>,
) {
  const cases: RepresentativeCase[] = []
  const seen = new Set<string>()
  const namedGroups = referencedOptionGroups(questions)
  const add = (
    kind: RepresentativeKind,
    question: CanonicalQuestion,
    baseState: ReachableSemanticState,
    optionIds?: readonly string[],
  ) => {
    const submittedAnswers = optionIds === undefined
      ? withoutAnswer(questions, baseState.submittedAnswers, question.id)
      : withAnswer(questions, baseState.submittedAnswers, question.id, optionIds)
    const resolved = resolveForcedAnswers(questions, topologicalOrder, submittedAnswers)
    const signature = semanticSignature(questions, resolved, validSelectionKeysByQuestion)
    const key = `${kind}\0${question.id}\0${JSON.stringify(optionIds)}\0${stableJson(signature)}`
    if (seen.has(key)) return
    seen.add(key)
    cases.push({
      kind,
      questionId: question.id,
      ...(optionIds === undefined ? {} : { optionIds: canonicalSelection(question, optionIds) }),
      signature,
    })
  }

  for (const state of states) {
    const facts = deriveQuestionFacts(questions, state.canonicalAnswers)
    for (const question of questions) {
      const item = facts[question.id]!
      if (!item.reachable) continue
      add('unanswered', question, state)

      const minimum = item.legalSelections.find((selection) => selection.length === item.bounds.min)
      if (minimum) add('minimum', question, state, minimum)
      const maximum = item.legalSelections.reduce<readonly string[] | undefined>((largest, selection) => (
        largest === undefined || selection.length > largest.length ? selection : largest
      ), undefined)
      if (maximum) add('maximum', question, state, maximum)

      const belowCount = item.bounds.min - 1
      if (belowCount >= 0 && belowCount <= question.options.length) {
        add(
          'below-minimum',
          question,
          state,
          question.options.slice(0, belowCount).map(({ id }) => id),
        )
      }
      const aboveCount = item.bounds.max + 1
      if (aboveCount <= question.options.length) add(
        'above-maximum',
        question,
        state,
        question.options.slice(0, aboveCount).map(({ id }) => id),
      )

      const exclusiveOptions = question.options.filter(({ exclusive }) => exclusive)
      const ordinary = question.options.find(({ exclusive }) => !exclusive)
      for (const exclusive of exclusiveOptions) {
        add('exclusive', question, state, [exclusive.id])
        if (ordinary) add(
          'exclusive-conflict',
          question,
          state,
          canonicalSelection(question, [exclusive.id, ordinary.id]),
        )
      }
      if (item.forcedEligibility === 'forced') add(
        'forced-singleton',
        question,
        state,
        [item.allowedOptionIds[0]!],
      )
      if (item.allowedOptionIds.length === 0) add('empty-branch', question, state, [])
      const currentLegalKeys = new Set(item.legalSelections.map((selection) => JSON.stringify(selection)))
      for (const key of validSelectionKeysByQuestion[question.id] ?? []) {
        if (!currentLegalKeys.has(key)) add(
          'stale',
          question,
          state,
          JSON.parse(key) as string[],
        )
      }
      if (item.decisionSelectionType === 'all') {
        add('allow-all', question, state, minimum ?? [])
      }
      for (const optionIds of namedGroups[question.id] ?? []) add(
        'condition-combination',
        question,
        state,
        optionIds,
      )
    }
  }
  return cases
}

function sortedSelectionKeys(keys: ReadonlySet<string>) {
  return [...keys].sort(compareCodePoints)
}

export function exploreQuestionSemantics(
  definition: readonly QuestionDefinitionSource[],
): QuestionSemanticExploration {
  const questions = canonicalizeQuestionSource(definition)
  const graph = deriveQuestionGraph(questions)
  const order = graph.topologicalOrder
  const validKeySets = new Map(questions.map(({ id }) => [id, new Set<string>()]))
  const coveredQuestions = new Set<string>()
  const coveredOptions = new Set<string>()
  const forcedFailures: ForcedResolution[] = []
  const forcedNonIdempotentStateKeys = new Set<string>()
  const queue: QueuedState[] = []
  const queuedKeys = new Set<string>()

  const resolveState = (submittedAnswers: SemanticAnswers): QueuedState => {
    const forcedResolution = resolveForcedAnswers(questions, order, submittedAnswers)
    const signature = semanticSignature(questions, forcedResolution)
    return {
      submittedAnswers: forcedResolution.submittedAnswers,
      forcedAnswers: forcedResolution.forcedAnswers,
      canonicalAnswers: forcedResolution.canonicalAnswers,
      signature,
      signatureKey: stableJson(signature),
      forcedResolution,
    }
  }
  const enqueue = (state: QueuedState) => {
    if (queuedKeys.has(state.signatureKey)) return
    queuedKeys.add(state.signatureKey)
    queue.push(state)
  }
  enqueue(resolveState({}))

  const mutableStates: MutableReachableState[] = []
  while (queue.length > 0) {
    const queued = queue.shift()!
    if (queued.forcedResolution.status !== 'fixed') forcedFailures.push(queued.forcedResolution)
    if (queued.forcedResolution.status === 'fixed') {
      const idempotence = resolveForcedAnswers(questions, order, queued.submittedAnswers)
      if (
        idempotence.status !== 'fixed'
        || resolvedStateKey(
          questions,
          idempotence.forcedAnswers,
          idempotence.canonicalAnswers,
        ) !== resolvedStateKey(questions, queued.forcedAnswers, queued.canonicalAnswers)
      ) {
        forcedNonIdempotentStateKeys.add(queued.signatureKey)
      }
    }
    const facts = deriveQuestionFacts(questions, queued.canonicalAnswers)
    for (const question of questions) {
      const item = facts[question.id]!
      if (!item.reachable) continue
      coveredQuestions.add(question.id)
      item.legalSelections.flat().forEach((optionId) => (
        coveredOptions.add(`${question.id}:${optionId}`)
      ))
      item.legalSelections.forEach((selection) => (
        validKeySets.get(question.id)?.add(JSON.stringify(selection))
      ))
    }

    const complete = queued.signature.reachableQuestionIds.every((questionId) => {
      const question = questions.find(({ id }) => id === questionId)!
      const item = facts[questionId]!
      if (item.forcedEligibility === 'forced') return classifyAnswer(
        question,
        item,
        queued.canonicalAnswers,
        new Set(),
      ) === 'valid'
      return queued.signature.answerValidity[questionId] === 'valid'
    })
    const nextQuestionId = complete ? undefined : order.find((questionId) => (
      queued.signature.forcedEligibility[questionId] === 'interactive'
      && queued.signature.answerValidity[questionId] === 'missing'
    ))
    const nextFacts = nextQuestionId ? facts[nextQuestionId] : undefined
    const state: MutableReachableState = {
      submittedAnswers: queued.submittedAnswers,
      forcedAnswers: queued.forcedAnswers,
      canonicalAnswers: queued.canonicalAnswers,
      signature: queued.signature,
      signatureKey: queued.signatureKey,
      complete,
      ...(nextQuestionId ? { nextQuestionId } : {}),
      legalSelectionCount: nextFacts?.legalSelections.length ?? 0,
      successorSignatureKeys: [],
    }
    mutableStates.push(state)
    if (!nextQuestionId || !nextFacts) continue
    for (const selection of nextFacts.legalSelections) {
      const child = resolveState(withAnswer(
        questions,
        queued.submittedAnswers,
        nextQuestionId,
        selection,
      ))
      if (!state.successorSignatureKeys.includes(child.signatureKey)) {
        state.successorSignatureKeys.push(child.signatureKey)
      }
      enqueue(child)
    }
  }

  const validSelectionKeysByQuestion = Object.fromEntries(questions.map((question) => [
    question.id,
    sortedSelectionKeys(validKeySets.get(question.id) ?? new Set()),
  ]))
  const reachableStates: ReachableSemanticState[] = mutableStates.map((state) => ({
    ...state,
    successorSignatureKeys: [...state.successorSignatureKeys],
  }))
  const representativeCases = makeRepresentativeCases(
    questions,
    order,
    reachableStates,
    validSelectionKeysByQuestion,
  )
  const representativeByKey = new Map<string, SemanticSignature>()
  for (const state of reachableStates) {
    const signature = semanticSignature(questions, state, validSelectionKeysByQuestion)
    representativeByKey.set(stableJson(signature), signature)
  }
  for (const item of representativeCases) {
    representativeByKey.set(stableJson(item.signature), item.signature)
  }

  return {
    questions,
    graph,
    signatures: reachableStates.filter(({ complete }) => complete).map((state) => (
      semanticSignature(questions, state, validSelectionKeysByQuestion)
    )),
    representativeSignatures: [...representativeByKey.values()],
    representativeCases,
    reachableStates,
    validSelectionKeysByQuestion,
    coverage: {
      questionIds: questions.filter(({ id }) => coveredQuestions.has(id)).map(({ id }) => id),
      optionIds: questions.flatMap((question) => question.options.flatMap((option) => (
        coveredOptions.has(`${question.id}:${option.id}`) ? [`${question.id}:${option.id}`] : []
      ))),
    },
    forcedFailures,
    forcedNonIdempotentStateKeys: [...forcedNonIdempotentStateKeys].sort(compareCodePoints),
    forcedIterationUpperBound: forcedIterationBound(questions),
  }
}
