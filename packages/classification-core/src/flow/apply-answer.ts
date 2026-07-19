import { deepFreeze } from '../contracts/deep-freeze.js'
import { makeDiagnostic, type Diagnostic } from '../contracts/diagnostic.js'
import type {
  CompiledOption,
  CompiledQuestion,
  CompiledQuestionModel,
  SerializableCondition,
} from '../contracts/question-model.js'
import { compareCodePoints } from '../contracts/source-path.js'
import { evaluateFlow } from './evaluate.js'
import type {
  AnswerDraft,
  AnswerSubmission,
  ApplyAnswerResult,
  FlowState,
  ForcedAnswerChange,
  OptionId,
  QuestionId,
} from './types.js'

type Answers = Readonly<Record<string, readonly string[]>>

interface SubmissionDiagnosticEntry {
  readonly diagnostic: Diagnostic
  readonly optionId?: string
  readonly priority: number
}

const submissionSource = 'runtime://answer-submission'
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)

function escapePointerToken(value: string) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function compareQuestions(left: CompiledQuestion, right: CompiledQuestion) {
  return left.order - right.order || compareCodePoints(left.id, right.id)
}

function compareOptions(left: CompiledOption, right: CompiledOption) {
  return left.order - right.order || compareCodePoints(left.id, right.id)
}

function displayQuestions(model: CompiledQuestionModel) {
  return [...model.questions].sort(compareQuestions)
}

function orderedOptions(question: CompiledQuestion) {
  return [...question.options].sort(compareOptions)
}

function canonicalSelection(question: CompiledQuestion, optionIds: readonly string[]) {
  const optionOrder = new Map(orderedOptions(question).map(({ id }, index) => [id, index]))
  return [...optionIds].sort((left, right) => (
    (optionOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (optionOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
    || compareCodePoints(left, right)
  ))
}

function sameSelection(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function evaluateCondition(condition: SerializableCondition, answers: Answers): boolean {
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

function effectiveBounds(question: CompiledQuestion, state: FlowState) {
  const override = question.selection.overrides.find(({ when }) => (
    evaluateCondition(when, state.canonicalAnswers as Answers)
  ))
  return override
    ? { min: override.min, max: override.max }
    : { min: question.selection.min, max: question.selection.max }
}

function copyDiagnosticValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyDiagnosticValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => (
      [key, copyDiagnosticValue(child)]
    )))
  }
  return value
}

function makeSubmissionDiagnostic(
  code: Diagnostic['code'],
  path: string,
  message: string,
  details: {
    readonly questionId?: string
    readonly optionId?: string
    readonly expected?: unknown
    readonly received?: unknown
  } = {},
) {
  const entityId = details.optionId && details.questionId
    ? `${details.questionId}:${details.optionId}`
    : details.questionId
  return makeDiagnostic({
    severity: 'error',
    code,
    sourceFile: submissionSource,
    path,
    ...(entityId ? { entityId } : {}),
    message,
    ...(details.expected === undefined
      ? {}
      : { expected: copyDiagnosticValue(details.expected) }),
    ...(details.received === undefined
      ? {}
      : { received: copyDiagnosticValue(details.received) }),
  })
}

function reject(
  draft: AnswerDraft,
  state: FlowState,
  diagnostics: readonly Diagnostic[],
): ApplyAnswerResult {
  const frozenDiagnostics = Object.isFrozen(diagnostics)
    ? diagnostics
    : deepFreeze([...diagnostics])
  return Object.freeze({
    accepted: false,
    draft,
    state,
    diagnostics: frozenDiagnostics,
  })
}

function questionDiagnostic(questionId: string, reachable: boolean) {
  return makeSubmissionDiagnostic(
    'ANSWER_QUESTION_NOT_INTERACTIVE',
    `/${escapePointerToken(questionId)}`,
    reachable
      ? `Question ${questionId} is not currently interactive`
      : `Question ${questionId} is not currently reachable`,
    { questionId, received: questionId },
  )
}

function submissionDiagnostics(
  model: CompiledQuestionModel,
  question: CompiledQuestion,
  state: FlowState,
  optionIds: readonly string[],
) {
  const entries: SubmissionDiagnosticEntry[] = []
  const ownedOptions = new Map(question.options.map((option) => [option.id, option]))
  const optionOwners = new Map<string, Set<string>>()
  for (const owner of model.questions) {
    for (const option of owner.options) {
      const owners = optionOwners.get(option.id) ?? new Set<string>()
      owners.add(owner.id)
      optionOwners.set(option.id, owners)
    }
  }
  const seen = new Set<string>()
  const duplicateIds = new Set<string>()
  const allowed = new Set<string>(
    state.allowedOptionIdsByQuestion[question.id as QuestionId] ?? [],
  )
  const path = `/${escapePointerToken(question.id)}`

  for (const [index, optionId] of optionIds.entries()) {
    if (seen.has(optionId) && !duplicateIds.has(optionId)) {
      duplicateIds.add(optionId)
      entries.push({
        diagnostic: makeSubmissionDiagnostic(
          'ANSWER_DUPLICATE_OPTION',
          `${path}/${index}`,
          `Answer ${question.id} contains duplicate option ${optionId}`,
          { questionId: question.id, optionId, received: optionId },
        ),
        optionId,
        priority: 3,
      })
    }
    seen.add(optionId)

    if (!ownedOptions.has(optionId)) {
      const owners = optionOwners.get(optionId)
      const wrongOwner = owners !== undefined && owners.size > 0
      entries.push({
        diagnostic: makeSubmissionDiagnostic(
          wrongOwner ? 'ANSWER_WRONG_OWNER' : 'ANSWER_UNKNOWN_OPTION',
          `${path}/${index}`,
          wrongOwner
            ? `Option ${optionId} does not belong to question ${question.id}`
            : `Answer ${question.id} references unknown option ${optionId}`,
          { questionId: question.id, optionId, received: optionId },
        ),
        optionId,
        priority: wrongOwner ? 2 : 1,
      })
      continue
    }

    if (!allowed.has(optionId)) entries.push({
      diagnostic: makeSubmissionDiagnostic(
        'ANSWER_OPTION_DISALLOWED',
        `${path}/${index}`,
        `Option ${optionId} is not allowed for question ${question.id} in the current branch`,
        { questionId: question.id, optionId, received: optionId },
      ),
      optionId,
      priority: 5,
    })
  }

  const exclusive = optionIds.find((optionId) => ownedOptions.get(optionId)?.exclusive)
  if (exclusive && optionIds.length > 1) entries.push({
    diagnostic: makeSubmissionDiagnostic(
      'ANSWER_EXCLUSIVE_CONFLICT',
      path,
      `Exclusive option ${exclusive} cannot be combined with another selection`,
      { questionId: question.id, optionId: exclusive, received: optionIds },
    ),
    optionId: exclusive,
    priority: 4,
  })

  const bounds = effectiveBounds(question, state)
  if (optionIds.length < bounds.min || optionIds.length > bounds.max) entries.push({
    diagnostic: makeSubmissionDiagnostic(
      'ANSWER_SELECTION_BOUNDS',
      path,
      `Answer ${question.id} does not satisfy its effective selection bounds`,
      { questionId: question.id, expected: bounds, received: optionIds.length },
    ),
    priority: 6,
  })

  const optionOrder = new Map(orderedOptions(question).map(({ id }, index) => [id, index]))
  return entries.sort((left, right) => (
    left.priority - right.priority
    || (optionOrder.get(left.optionId ?? '') ?? Number.MAX_SAFE_INTEGER)
      - (optionOrder.get(right.optionId ?? '') ?? Number.MAX_SAFE_INTEGER)
    || compareCodePoints(left.optionId ?? '', right.optionId ?? '')
    || compareCodePoints(left.diagnostic.code, right.diagnostic.code)
    || compareCodePoints(left.diagnostic.path, right.diagnostic.path)
  )).map(({ diagnostic }) => diagnostic)
}

function forcedChanges(
  questions: readonly CompiledQuestion[],
  previousState: FlowState,
  nextState: FlowState,
) {
  const previous = new Map(previousState.forcedAnswers.map((answer) => (
    [answer.questionId, answer] as const
  )))
  const next = new Map(nextState.forcedAnswers.map((answer) => (
    [answer.questionId, answer] as const
  )))
  const changes: ForcedAnswerChange[] = []
  for (const question of questions) {
    const previousAnswer = previous.get(question.id as QuestionId)
    const nextAnswer = next.get(question.id as QuestionId)
    if (
      previousAnswer
      && nextAnswer
      && sameSelection(previousAnswer.optionIds, nextAnswer.optionIds)
    ) continue
    if (!previousAnswer && !nextAnswer) continue
    changes.push({
      questionId: question.id as QuestionId,
      ...(previousAnswer ? { previousOptionIds: previousAnswer.optionIds } : {}),
      ...(nextAnswer ? { nextOptionIds: nextAnswer.optionIds } : {}),
      reason: 'single-allowed-option',
    })
  }
  return changes
}

export function applyAnswer(
  model: CompiledQuestionModel,
  draft: AnswerDraft,
  submission: AnswerSubmission,
): ApplyAnswerResult {
  const previousState = evaluateFlow(model, draft)
  if (previousState.status === 'invalid') {
    return reject(draft, previousState, previousState.diagnostics)
  }

  const questions = displayQuestions(model)
  const question = questions.find(({ id }) => id === submission.questionId)
  if (!question) {
    const questionId = String(submission.questionId)
    return reject(draft, previousState, [makeSubmissionDiagnostic(
      'ANSWER_UNKNOWN_QUESTION',
      `/${escapePointerToken(questionId)}`,
      `Answer submission references unknown question ${questionId}`,
      { questionId, received: questionId },
    )])
  }

  const reachable = previousState.reachableQuestionIds.includes(question.id as QuestionId)
  const interactive = previousState.interactiveQuestionIds.includes(question.id as QuestionId)
  if (!reachable || !interactive) {
    return reject(draft, previousState, [questionDiagnostic(question.id, reachable)])
  }

  const diagnostics = submissionDiagnostics(model, question, previousState, submission.optionIds)
  if (diagnostics.length > 0) return reject(draft, previousState, diagnostics)

  const canonicalOptionIds = canonicalSelection(
    question,
    submission.optionIds,
  ) as readonly OptionId[]
  const hasPreviousAnswer = hasOwn(draft, question.id)
  const previousOptionIds = hasPreviousAnswer
    ? canonicalSelection(question, draft[question.id as QuestionId] ?? [])
    : undefined
  if (
    previousOptionIds !== undefined
    && sameSelection(previousOptionIds, canonicalOptionIds)
  ) {
    const invalidatedQuestionIds = Object.freeze([]) as readonly QuestionId[]
    const changes = Object.freeze([]) as readonly ForcedAnswerChange[]
    return Object.freeze({
      accepted: true,
      changed: false,
      draft,
      state: previousState,
      invalidatedQuestionIds,
      forcedChanges: changes,
    })
  }

  const nextDraft: Partial<Record<QuestionId, readonly OptionId[]>> = {}
  for (const [questionId, optionIds] of Object.entries(draft)) {
    nextDraft[questionId as QuestionId] = [...optionIds]
  }
  nextDraft[question.id as QuestionId] = canonicalOptionIds
  const questionOrder = new Map(questions.map(({ id }, index) => [id, index]))
  const invalidatedQuestionIds = [
    ...(model.dependentClosures[question.id] ?? []),
  ].sort((left, right) => (
    (questionOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (questionOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
    || compareCodePoints(left, right)
  )) as QuestionId[]
  for (const questionId of invalidatedQuestionIds) delete nextDraft[questionId]

  const frozenDraft = deepFreeze(nextDraft) as AnswerDraft
  const nextState = evaluateFlow(model, frozenDraft)
  return deepFreeze({
    accepted: true,
    changed: true,
    draft: frozenDraft,
    state: nextState,
    invalidatedQuestionIds,
    forcedChanges: forcedChanges(questions, previousState, nextState),
  })
}
