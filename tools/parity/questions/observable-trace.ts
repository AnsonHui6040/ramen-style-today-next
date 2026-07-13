import {
  applyAnswer,
  evaluateFlow,
  getNextInteractiveQuestion,
  getPreviousInteractiveQuestion,
  updatePendingSelection,
  type AnswerDraft,
  type CompiledQuestion,
  type CompiledQuestionModel,
  type OptionId,
  type PendingQuestionState,
  type QuestionId,
  type SerializableCondition,
} from '@ramen-style/classification-core/compiler'
import {
  deriveObservableCoverage,
  type LegacyObservableAction,
  type LegacyObservableTraceFrame,
  type LegacyObservedAnswers,
  type LegacyObservedAnswerValue,
  type LegacyObservedChanges,
} from './contracts.js'

export interface ObservableTrace {
  readonly actions: readonly LegacyObservableAction[]
  readonly frames: readonly LegacyObservableTraceFrame[]
}

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)

function rejectSeed(detail: string): never {
  throw new Error(`PARITY_SEED_NOT_LEGACY_REPRESENTABLE: seed is not legacy-representable: ${detail}`)
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function cloneAnswers(answers: LegacyObservedAnswers): LegacyObservedAnswers {
  return Object.fromEntries(Object.entries(answers).flatMap(([questionId, value]) => (
    value === undefined
      ? []
      : [[questionId, typeof value === 'string' ? value : [...value]]]
  )))
}

function observedChanges(
  previous: LegacyObservableTraceFrame,
  current: LegacyObservableTraceFrame,
): LegacyObservedChanges | undefined {
  const visibleOptionIds = (
    previous.displayedQuestionId !== undefined
    && previous.displayedQuestionId === current.displayedQuestionId
    && previous.visibleOptionIds !== undefined
    && current.visibleOptionIds !== undefined
    && !valuesEqual(previous.visibleOptionIds, current.visibleOptionIds)
  ) ? {
      questionId: current.displayedQuestionId,
      before: previous.visibleOptionIds,
      after: current.visibleOptionIds,
    } : undefined

  const answers = previous.legacyAnswers && current.legacyAnswers
    ? [...new Set([
        ...Object.keys(previous.legacyAnswers),
        ...Object.keys(current.legacyAnswers),
      ])].flatMap((questionId) => {
        const before = previous.legacyAnswers?.[questionId]
        const after = current.legacyAnswers?.[questionId]
        if (valuesEqual(before, after)) return []
        return [{
          questionId,
          ...(before === undefined ? {} : { before }),
          ...(after === undefined ? {} : { after }),
        }]
      })
    : []

  if (!visibleOptionIds && answers.length === 0) return undefined
  return {
    ...(visibleOptionIds ? { visibleOptionIds } : {}),
    ...(answers.length > 0 ? { answers } : {}),
  }
}

function conditionMatches(
  condition: SerializableCondition,
  answers: Readonly<Record<string, readonly string[]>>,
): boolean {
  switch (condition.type) {
    case 'answered': return hasOwn(answers, condition.questionId)
    case 'answer-includes': return answers[condition.questionId]?.includes(condition.optionId) ?? false
    case 'all': return condition.conditions.every((child) => conditionMatches(child, answers))
    case 'any': return condition.conditions.some((child) => conditionMatches(child, answers))
    case 'not': return !conditionMatches(condition.condition, answers)
  }
}

export function projectDisabledOptionIds(
  visibleOptionIds: readonly OptionId[],
  pendingOptionIds: readonly OptionId[],
  exclusiveOptionIds: readonly OptionId[],
  maxSelections: number,
): readonly OptionId[] {
  const pending = new Set(pendingOptionIds)
  const exclusive = new Set(exclusiveOptionIds)
  const selectionCapReached = pendingOptionIds.length >= maxSelections
  const hasExclusiveSelected = exclusiveOptionIds.some((id) => pending.has(id))

  return visibleOptionIds.filter((id) =>
    !pending.has(id)
      && !exclusive.has(id)
      && selectionCapReached
      && !hasExclusiveSelected,
  )
}

export function executeObservableTrace(
  model: CompiledQuestionModel,
  inputActions: readonly LegacyObservableAction[],
): ObservableTrace {
  const actions = structuredClone(inputActions) as readonly LegacyObservableAction[]
  const questions = [...model.questions].sort((left, right) => left.order - right.order)
  const questionById = new Map(questions.map((question) => [question.id, question]))
  const questionPosition = new Map(questions.map(({ id }, index) => [id, index]))
  let draft: AnswerDraft = {}
  let state = evaluateFlow(model, draft)
  let currentQuestionId = questions.find(({ id }) => (
    state.interactiveQuestionIds.includes(id as QuestionId)
  ))?.id
  if (!currentQuestionId) rejectSeed('initial interactive question is missing')

  const pendingByQuestion = new Map<string, readonly string[]>()
  const legacyAnswers: Record<string, LegacyObservedAnswerValue> = {}
  for (const question of questions) {
    if (question.selection.type === 'multiple') {
      legacyAnswers[question.id] = [...question.initialUiOptionIds]
    }
  }
  const frames: LegacyObservableTraceFrame[] = []

  const questionState = (question: CompiledQuestion): PendingQuestionState<string, string> => {
    const allowedOptionIds = state.allowedOptionIdsByQuestion[question.id as QuestionId] ?? []
    const override = question.selection.overrides.find(({ when }) => conditionMatches(
      when,
      state.canonicalAnswers as Readonly<Record<string, readonly string[]>>,
    ))
    return {
      questionId: question.id,
      optionOrder: question.options.map(({ id }) => id),
      allowedOptionIds,
      exclusiveOptionIds: question.selection.type === 'single'
        ? question.options.map(({ id }) => id)
        : question.options.filter(({ exclusive }) => exclusive).map(({ id }) => id),
      minSelections: override?.min ?? question.selection.min,
      maxSelections: override?.max ?? question.selection.max,
      initialUiOptionIds: question.initialUiOptionIds,
      emptyBehavior: question.pendingSelection.emptyBehavior,
    }
  }

  const initialPending = (question: CompiledQuestion) => {
    const saved = pendingByQuestion.get(question.id)
    if (saved) return saved
    const submitted = draft[question.id as QuestionId]
    if (submitted) return submitted
    const allowed = new Set(questionState(question).allowedOptionIds)
    return question.initialUiOptionIds.filter((id) => allowed.has(id))
  }

  const setLegacyAnswer = (question: CompiledQuestion, optionIds: readonly string[]) => {
    if (question.selection.type === 'single') {
      const value = optionIds[0]
      if (value === undefined) delete legacyAnswers[question.id]
      else legacyAnswers[question.id] = value
      return
    }
    legacyAnswers[question.id] = [...optionIds]
  }

  const pushFrame = (
    frame: Omit<LegacyObservableTraceFrame, 'sequence' | 'observedChanges'>,
  ) => {
    const base: LegacyObservableTraceFrame = { sequence: frames.length, ...frame }
    const changes = frames.length > 0 ? observedChanges(frames.at(-1)!, base) : undefined
    frames.push(Object.freeze(changes ? { ...base, observedChanges: changes } : base))
  }

  const pushInteractive = (
    transition: 'initial' | 'toggle' | 'next' | 'previous',
    questionId: string,
    actionIndex?: number,
    navigation?: LegacyObservableTraceFrame['navigation'],
  ) => {
    const question = questionById.get(questionId)
    if (!question) rejectSeed(`unknown displayed question ${questionId}`)
    const pending = initialPending(question)
    pendingByQuestion.set(question.id, [...pending])
    const pendingState = questionState(question)
    const visible = [...pendingState.allowedOptionIds]
    const disabled = projectDisabledOptionIds(
      visible as OptionId[],
      pending as OptionId[],
      pendingState.exclusiveOptionIds as OptionId[],
      pendingState.maxSelections,
    )
    pushFrame({
      transition,
      ...(actionIndex === undefined ? {} : { actionIndex }),
      displayedQuestionId: question.id,
      visibleOptionIds: visible,
      disabledOptionIds: disabled,
      pendingOptionIds: [...pending],
      legacyAnswers: cloneAnswers(legacyAnswers),
      ...(navigation ? { navigation } : {}),
    })
  }

  pushInteractive('initial', currentQuestionId)

  actions.forEach((action, actionIndex) => {
    if (!currentQuestionId) rejectSeed(`action ${actionIndex} occurs after completion`)
    if (action.type === 'select' || action.type === 'deselect') {
      if (action.questionId !== currentQuestionId) rejectSeed(`action ${actionIndex} targets another question`)
      const question = questionById.get(currentQuestionId)!
      const pendingState = questionState(question)
      const pending = [...initialPending(question)]
      const visible = pendingState.allowedOptionIds
      const disabled = projectDisabledOptionIds(
        visible as OptionId[],
        pending as OptionId[],
        pendingState.exclusiveOptionIds as OptionId[],
        pendingState.maxSelections,
      )
      if (!visible.includes(action.optionId) || disabled.includes(action.optionId as OptionId)) {
        rejectSeed(`action ${actionIndex} targets a hidden or disabled option`)
      }
      const wasSelected = pending.includes(action.optionId)
      if (wasSelected !== (action.type === 'deselect')) {
        rejectSeed(`action ${actionIndex} does not change the pending selection`)
      }
      const result = updatePendingSelection(pendingState, pending, {
        type: action.type,
        optionId: action.optionId,
      })
      const isSelected = result.optionIds.includes(action.optionId)
      if (result.diagnostics.length > 0 || isSelected !== (action.type === 'select') || valuesEqual(
        pending,
        result.optionIds,
      )) rejectSeed(`action ${actionIndex} produced an unchanged toggle`)
      pendingByQuestion.set(question.id, result.optionIds)
      setLegacyAnswer(question, result.optionIds)
      pushInteractive('toggle', question.id, actionIndex)
      return
    }

    if (action.fromQuestionId !== currentQuestionId) {
      rejectSeed(`action ${actionIndex} starts from another question`)
    }
    const question = questionById.get(currentQuestionId)!
    if (action.type === 'previous') {
      const previous = getPreviousInteractiveQuestion(state, currentQuestionId as QuestionId)
      if (!previous) rejectSeed(`action ${actionIndex} has no previous question`)
      currentQuestionId = previous
      pushInteractive('previous', currentQuestionId, actionIndex, {
        direction: 'previous',
        reachedQuestionId: currentQuestionId,
      })
      return
    }

    const pending = initialPending(question)
    const accepted = applyAnswer(model, draft, {
      questionId: currentQuestionId as QuestionId,
      optionIds: pending as OptionId[],
    })
    if (!accepted.accepted) rejectSeed(`action ${actionIndex} continue was rejected`)
    pushFrame({
      transition: 'submit',
      actionIndex,
      displayedQuestionId: currentQuestionId,
      legacyAnswers: cloneAnswers(legacyAnswers),
    })

    draft = accepted.draft
    state = evaluateFlow(model, accepted.draft)
    pendingByQuestion.delete(question.id)
    for (const invalidated of accepted.invalidatedQuestionIds) {
      pendingByQuestion.delete(invalidated)
      const invalidatedQuestion = questionById.get(invalidated)
      if (invalidatedQuestion?.selection.type === 'multiple') {
        legacyAnswers[invalidated] = [...invalidatedQuestion.initialUiOptionIds]
      } else {
        delete legacyAnswers[invalidated]
      }
    }
    const forced = accepted.forcedChanges
      .filter(({ nextOptionIds }) => nextOptionIds !== undefined)
      .sort((left, right) => (
        (questionPosition.get(left.questionId) ?? Number.MAX_SAFE_INTEGER)
          - (questionPosition.get(right.questionId) ?? Number.MAX_SAFE_INTEGER)
      ))
    for (const change of forced) {
      const forcedQuestion = questionById.get(change.questionId)!
      const optionIds = change.nextOptionIds ?? []
      setLegacyAnswer(forcedQuestion, optionIds)
      const value = forcedQuestion.selection.type === 'single' ? optionIds[0]! : [...optionIds]
      pushFrame({
        transition: 'forced-skip',
        actionIndex,
        legacyAnswers: cloneAnswers(legacyAnswers),
        forcedAutoAnswer: { questionId: forcedQuestion.id, value },
      })
    }

    if (state.status === 'complete') {
      currentQuestionId = undefined
      pushFrame({
        transition: 'complete',
        actionIndex,
        legacyAnswers: cloneAnswers(legacyAnswers),
        navigation: { direction: 'next', reachedScreen: 'results' },
        completionMarker: 'results',
      })
      return
    }
    const next = getNextInteractiveQuestion(state, question.id as QuestionId)
    if (!next) rejectSeed(`action ${actionIndex} has no terminal next question`)
    currentQuestionId = next
    pushInteractive('next', currentQuestionId, actionIndex, {
      direction: 'next',
      reachedQuestionId: currentQuestionId,
    })
  })

  deriveObservableCoverage({ actions, frames })
  return Object.freeze({ actions: Object.freeze(actions), frames: Object.freeze(frames) })
}
