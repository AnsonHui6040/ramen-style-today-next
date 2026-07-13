import { deepFreeze } from '../contracts/deep-freeze.js'
import { makeDiagnostic, type Diagnostic } from '../contracts/diagnostic.js'
import type {
  CompiledOption,
  CompiledQuestion,
  CompiledQuestionModel,
  SerializableCondition,
} from '../contracts/question-model.js'
import { compareCodePoints } from '../contracts/source-path.js'
import { decodeAnswerDraft } from './decode.js'
import type {
  AnswerDraft,
  CompletedAnswers,
  FlowRepair,
  FlowState,
  ForcedAnswer,
  OptionId,
  QuestionId,
} from './types.js'

type Answers = Readonly<Record<string, readonly string[]>>
type MutableAnswers = Record<string, readonly string[]>

interface QuestionFacts {
  readonly reachable: boolean
  readonly allowedOptionIds: readonly string[]
  readonly bounds: { readonly min: number; readonly max: number }
  readonly forcedOptionIds?: readonly string[]
}

interface DiagnosticEntry {
  readonly diagnostic: Diagnostic
  readonly questionId?: string
  readonly optionId?: string
  readonly priority: number
}

interface IterationResult {
  readonly canonicalAnswers: Answers
  readonly forcedAnswers: Answers
  readonly repairs: readonly FlowRepair[]
  readonly diagnostics: readonly DiagnosticEntry[]
}

const draftSource = 'runtime://answer-draft'
const flowSource = 'runtime://question-flow'
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)

function escapePointerToken(value: string) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
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

function compareQuestions(left: CompiledQuestion, right: CompiledQuestion) {
  return left.order - right.order || compareCodePoints(left.id, right.id)
}

function compareOptions(left: CompiledOption, right: CompiledOption) {
  return left.order - right.order || compareCodePoints(left.id, right.id)
}

function displayQuestions(model: CompiledQuestionModel) {
  return [...model.questions].sort(compareQuestions)
}

function evaluationQuestions(
  model: CompiledQuestionModel,
  questionById: ReadonlyMap<string, CompiledQuestion>,
  displayOrder: readonly CompiledQuestion[],
) {
  const seen = new Set<string>()
  const result: CompiledQuestion[] = []
  for (const questionId of model.topologicalOrder) {
    const question = questionById.get(questionId)
    if (!question || seen.has(questionId)) continue
    seen.add(questionId)
    result.push(question)
  }
  for (const question of displayOrder) {
    if (seen.has(question.id)) continue
    seen.add(question.id)
    result.push(question)
  }
  return result
}

function orderedOptions(question: CompiledQuestion) {
  return [...question.options].sort(compareOptions)
}

function canonicalSelection(question: CompiledQuestion, optionIds: readonly string[]) {
  const optionIndex = new Map(orderedOptions(question).map(({ id }, index) => [id, index]))
  return [...optionIds].sort((left, right) => (
    (optionIndex.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (optionIndex.get(right) ?? Number.MAX_SAFE_INTEGER)
      || compareCodePoints(left, right)
  ))
}

function selectionKey(question: CompiledQuestion, optionIds: readonly string[]) {
  return JSON.stringify(canonicalSelection(question, optionIds))
}

function sameSelection(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function allowedOptionIds(question: CompiledQuestion, answers: Answers) {
  const availableOptions = orderedOptions(question).filter((option) => (
    !option.availableWhen || evaluateCondition(option.availableWhen, answers)
  ))
  if (question.allowedOptions.length === 0) return availableOptions.map(({ id }) => id)
  const row = question.allowedOptions.find(({ when }) => evaluateCondition(when, answers))
  if (!row) return []
  if (row.selection.type === 'all') return availableOptions.map(({ id }) => id)
  const selected = new Set(row.selection.optionIds)
  return availableOptions.filter(({ id }) => selected.has(id)).map(({ id }) => id)
}

function effectiveBounds(question: CompiledQuestion, answers: Answers) {
  const override = question.selection.overrides.find(({ when }) => (
    evaluateCondition(when, answers)
  ))
  return override
    ? { min: override.min, max: override.max }
    : { min: question.selection.min, max: question.selection.max }
}

function questionFacts(question: CompiledQuestion, answers: Answers): QuestionFacts {
  const reachable = !question.availableWhen || evaluateCondition(question.availableWhen, answers)
  const bounds = effectiveBounds(question, answers)
  if (!reachable) return { reachable, allowedOptionIds: [], bounds }
  const allowed = allowedOptionIds(question, answers)
  const autoAnswerEligible = question.autoAnswer !== undefined
    && (!question.autoAnswer.when || evaluateCondition(question.autoAnswer.when, answers))
    && allowed.length === 1
    && bounds.min <= 1
    && bounds.max >= 1
  return {
    reachable,
    allowedOptionIds: allowed,
    bounds,
    ...(autoAnswerEligible ? { forcedOptionIds: [allowed[0]!] } : {}),
  }
}

function isWithinBounds(optionIds: readonly string[], bounds: QuestionFacts['bounds']) {
  return optionIds.length >= bounds.min && optionIds.length <= bounds.max
}

function countIsGloballyPlausible(question: CompiledQuestion, count: number) {
  return [question.selection, ...question.selection.overrides].some(({ min, max }) => (
    count >= min && count <= max
  ))
}

function orderedAnswers(
  answers: Answers,
  displayOrder: readonly CompiledQuestion[],
): Answers {
  return Object.fromEntries(displayOrder.flatMap((question) => (
    hasOwn(answers, question.id)
      ? [[question.id, canonicalSelection(question, answers[question.id] ?? [])] as const]
      : []
  )))
}

function stateKey(
  forcedAnswers: Answers,
  canonicalAnswers: Answers,
  displayOrder: readonly CompiledQuestion[],
) {
  return JSON.stringify({
    forcedAnswers: orderedAnswers(forcedAnswers, displayOrder),
    canonicalAnswers: orderedAnswers(canonicalAnswers, displayOrder),
  })
}

function makeEntry(
  code: Diagnostic['code'],
  path: string,
  message: string,
  priority: number,
  details: {
    readonly questionId?: string
    readonly optionId?: string
    readonly expected?: unknown
    readonly received?: unknown
  } = {},
): DiagnosticEntry {
  const entityId = details.optionId && details.questionId
    ? `${details.questionId}:${details.optionId}`
    : details.questionId
  return {
    diagnostic: makeDiagnostic({
      severity: 'error',
      code,
      sourceFile: code.startsWith('FLOW_') ? flowSource : draftSource,
      path,
      ...(entityId ? { entityId } : {}),
      message,
      ...(details.expected === undefined ? {} : { expected: details.expected }),
      ...(details.received === undefined ? {} : { received: details.received }),
    }),
    ...(details.questionId ? { questionId: details.questionId } : {}),
    ...(details.optionId ? { optionId: details.optionId } : {}),
    priority,
  }
}

function semanticDraft(
  draft: Answers,
  displayOrder: readonly CompiledQuestion[],
  questionById: ReadonlyMap<string, CompiledQuestion>,
) {
  const entries: DiagnosticEntry[] = []
  const valid: MutableAnswers = {}
  const optionOwners = new Map<string, Set<string>>()
  for (const question of displayOrder) {
    for (const option of question.options) {
      const owners = optionOwners.get(option.id) ?? new Set<string>()
      owners.add(question.id)
      optionOwners.set(option.id, owners)
    }
  }

  const unknownQuestionIds = Object.keys(draft)
    .filter((questionId) => !questionById.has(questionId))
    .sort(compareCodePoints)
  for (const questionId of unknownQuestionIds) entries.push(makeEntry(
    'ANSWER_UNKNOWN_QUESTION',
    `/${escapePointerToken(questionId)}`,
    `Answer references unknown question ${questionId}`,
    0,
    { questionId, received: questionId },
  ))

  for (const question of displayOrder) {
    if (!hasOwn(draft, question.id)) continue
    const answer = draft[question.id] ?? []
    const ownedOptions = new Map(question.options.map((option) => [option.id, option]))
    const seen = new Set<string>()
    const duplicateIds = new Set<string>()
    let invalid = false
    for (const [index, optionId] of answer.entries()) {
      if (seen.has(optionId) && !duplicateIds.has(optionId)) {
        duplicateIds.add(optionId)
        entries.push(makeEntry(
          'ANSWER_DUPLICATE_OPTION',
          `/${escapePointerToken(question.id)}/${index}`,
          `Answer ${question.id} contains duplicate option ${optionId}`,
          3,
          { questionId: question.id, optionId, received: optionId },
        ))
        invalid = true
      }
      seen.add(optionId)
      if (ownedOptions.has(optionId)) continue
      const owners = optionOwners.get(optionId)
      entries.push(makeEntry(
        owners && owners.size > 0 ? 'ANSWER_WRONG_OWNER' : 'ANSWER_UNKNOWN_OPTION',
        `/${escapePointerToken(question.id)}/${index}`,
        owners && owners.size > 0
          ? `Option ${optionId} does not belong to question ${question.id}`
          : `Answer ${question.id} references unknown option ${optionId}`,
        owners && owners.size > 0 ? 2 : 1,
        { questionId: question.id, optionId, received: optionId },
      ))
      invalid = true
    }
    const exclusive = answer.find((optionId) => ownedOptions.get(optionId)?.exclusive)
    if (exclusive && answer.length > 1) {
      entries.push(makeEntry(
        'ANSWER_EXCLUSIVE_CONFLICT',
        `/${escapePointerToken(question.id)}`,
        `Exclusive option ${exclusive} cannot be combined with another selection`,
        4,
        { questionId: question.id, optionId: exclusive, received: answer },
      ))
      invalid = true
    }
    if (!invalid) valid[question.id] = canonicalSelection(question, answer)
  }
  return { entries, submittedAnswers: orderedAnswers(valid, displayOrder) }
}

function boundsDiagnostic(question: CompiledQuestion, answer: readonly string[], bounds: QuestionFacts['bounds']) {
  return makeEntry(
    'ANSWER_SELECTION_BOUNDS',
    `/${escapePointerToken(question.id)}`,
    `Answer ${question.id} does not satisfy its effective selection bounds`,
    6,
    {
      questionId: question.id,
      expected: bounds,
      received: answer.length,
    },
  )
}

function disallowedDiagnostics(
  question: CompiledQuestion,
  answer: readonly string[],
  disallowed: readonly string[],
) {
  const selectedIndexes = new Map(answer.map((optionId, index) => [optionId, index]))
  return disallowed.map((optionId) => makeEntry(
    'ANSWER_OPTION_DISALLOWED',
    `/${escapePointerToken(question.id)}/${selectedIndexes.get(optionId) ?? 0}`,
    `Option ${optionId} is not allowed for question ${question.id} in the current branch`,
    5,
    { questionId: question.id, optionId, received: optionId },
  ))
}

function repair(
  code: FlowRepair['code'],
  question: CompiledQuestion,
  previousOptionIds: readonly string[],
  canonicalOptionIds?: readonly string[],
): FlowRepair {
  return {
    code,
    questionId: question.id as QuestionId,
    previousOptionIds: canonicalSelection(question, previousOptionIds) as readonly OptionId[],
    ...(canonicalOptionIds === undefined
      ? {}
      : { canonicalOptionIds: canonicalSelection(question, canonicalOptionIds) as readonly OptionId[] }),
  }
}

function evaluateIteration(
  submittedAnswers: Answers,
  previousCanonicalAnswers: Answers,
  evaluationOrder: readonly CompiledQuestion[],
  displayOrder: readonly CompiledQuestion[],
): IterationResult {
  const working: MutableAnswers = { ...previousCanonicalAnswers }
  const forcedAnswers: MutableAnswers = {}
  const repairs: FlowRepair[] = []
  const diagnostics: DiagnosticEntry[] = []

  for (const question of evaluationOrder) {
    const facts = questionFacts(question, working)
    const submitted = hasOwn(submittedAnswers, question.id)
      ? canonicalSelection(question, submittedAnswers[question.id] ?? [])
      : undefined
    if (!submitted) {
      if (facts.forcedOptionIds) {
        forcedAnswers[question.id] = facts.forcedOptionIds
        working[question.id] = facts.forcedOptionIds
      } else {
        delete working[question.id]
      }
      continue
    }

    const globallyValid = question.validSelectionKeys.includes(selectionKey(question, submitted))
    if (!facts.reachable) {
      if (!globallyValid && !countIsGloballyPlausible(question, submitted.length)) {
        diagnostics.push(boundsDiagnostic(question, submitted, facts.bounds))
      } else if (globallyValid) {
        repairs.push(repair('remove-unreachable-answer', question, submitted))
      } else if (submitted.length > 0) {
        diagnostics.push(...disallowedDiagnostics(question, submitted, submitted))
      } else {
        diagnostics.push(boundsDiagnostic(question, submitted, facts.bounds))
      }
      delete working[question.id]
      continue
    }

    if (facts.forcedOptionIds) {
      forcedAnswers[question.id] = facts.forcedOptionIds
      working[question.id] = facts.forcedOptionIds
      if (!sameSelection(submitted, facts.forcedOptionIds)) {
        if (globallyValid) {
          repairs.push(repair(
            'replace-with-forced-answer',
            question,
            submitted,
            facts.forcedOptionIds,
          ))
        } else if (!isWithinBounds(submitted, facts.bounds)) {
          diagnostics.push(boundsDiagnostic(question, submitted, facts.bounds))
        } else {
          const allowed = new Set(facts.allowedOptionIds)
          const disallowed = submitted.filter((optionId) => !allowed.has(optionId))
          diagnostics.push(...disallowedDiagnostics(question, submitted, disallowed))
        }
      }
      continue
    }

    if (!globallyValid && !countIsGloballyPlausible(question, submitted.length)) {
      diagnostics.push(boundsDiagnostic(question, submitted, facts.bounds))
      delete working[question.id]
      continue
    }

    const allowed = new Set(facts.allowedOptionIds)
    const disallowed = submitted.filter((optionId) => !allowed.has(optionId))
    if (disallowed.length > 0) {
      if (!globallyValid) {
        diagnostics.push(...disallowedDiagnostics(question, submitted, disallowed))
        delete working[question.id]
        continue
      }
      const remainder = submitted.filter((optionId) => allowed.has(optionId))
      if (isWithinBounds(remainder, facts.bounds)) {
        working[question.id] = remainder
        repairs.push(repair('remove-disallowed-option', question, submitted, remainder))
      } else if (remainder.length < facts.bounds.min) {
        delete working[question.id]
        repairs.push(repair('remove-disallowed-option', question, submitted))
      } else {
        delete working[question.id]
        diagnostics.push(boundsDiagnostic(question, submitted, facts.bounds))
      }
      continue
    }
    if (!isWithinBounds(submitted, facts.bounds)) {
      diagnostics.push(boundsDiagnostic(question, submitted, facts.bounds))
      delete working[question.id]
      continue
    }
    working[question.id] = submitted
  }

  return {
    canonicalAnswers: orderedAnswers(working, displayOrder),
    forcedAnswers: orderedAnswers(forcedAnswers, displayOrder),
    repairs,
    diagnostics,
  }
}

function compareRepairs(
  left: FlowRepair,
  right: FlowRepair,
  questionOrder: ReadonlyMap<string, number>,
) {
  return (questionOrder.get(left.questionId) ?? Number.MAX_SAFE_INTEGER)
    - (questionOrder.get(right.questionId) ?? Number.MAX_SAFE_INTEGER)
    || compareCodePoints(left.questionId, right.questionId)
    || compareCodePoints(left.code, right.code)
    || compareCodePoints(JSON.stringify(left.previousOptionIds), JSON.stringify(right.previousOptionIds))
}

function sortedDiagnostics(
  entries: readonly DiagnosticEntry[],
  displayOrder: readonly CompiledQuestion[],
) {
  const questionOrder = new Map(displayOrder.map(({ id }, index) => [id, index]))
  const optionOrder = new Map(displayOrder.flatMap((question) => (
    orderedOptions(question).map((option, index) => [`${question.id}\0${option.id}`, index] as const)
  )))
  return [...entries].sort((left, right) => (
    (questionOrder.get(left.questionId ?? '') ?? Number.MAX_SAFE_INTEGER)
      - (questionOrder.get(right.questionId ?? '') ?? Number.MAX_SAFE_INTEGER)
    || compareCodePoints(left.questionId ?? '', right.questionId ?? '')
    || left.priority - right.priority
    || (optionOrder.get(`${left.questionId ?? ''}\0${left.optionId ?? ''}`) ?? Number.MAX_SAFE_INTEGER)
      - (optionOrder.get(`${right.questionId ?? ''}\0${right.optionId ?? ''}`) ?? Number.MAX_SAFE_INTEGER)
    || compareCodePoints(left.optionId ?? '', right.optionId ?? '')
    || compareCodePoints(left.diagnostic.code, right.diagnostic.code)
    || compareCodePoints(left.diagnostic.path, right.diagnostic.path)
  )).map(({ diagnostic }) => diagnostic)
}

function stateViews(
  canonicalAnswers: Answers,
  forcedAnswers: Answers,
  displayOrder: readonly CompiledQuestion[],
) {
  const forcedQuestionIds = new Set(Object.keys(forcedAnswers))
  const reachableQuestionIds: string[] = []
  const interactiveQuestionIds: string[] = []
  const allowedOptionIdsByQuestion: MutableAnswers = {}
  let complete = true
  for (const question of displayOrder) {
    const facts = questionFacts(question, canonicalAnswers)
    if (!facts.reachable) continue
    reachableQuestionIds.push(question.id)
    allowedOptionIdsByQuestion[question.id] = facts.allowedOptionIds
    if (!forcedQuestionIds.has(question.id)) interactiveQuestionIds.push(question.id)
    const answer = canonicalAnswers[question.id]
    if (!answer) {
      if (facts.bounds.min > 0) complete = false
      continue
    }
    const allowed = new Set(facts.allowedOptionIds)
    if (!isWithinBounds(answer, facts.bounds) || answer.some((optionId) => !allowed.has(optionId))) {
      complete = false
    }
  }
  return {
    canonicalAnswers: orderedAnswers(canonicalAnswers, displayOrder) as AnswerDraft,
    reachableQuestionIds: reachableQuestionIds as QuestionId[],
    interactiveQuestionIds: interactiveQuestionIds as QuestionId[],
    allowedOptionIdsByQuestion: orderedAnswers(
      allowedOptionIdsByQuestion,
      displayOrder,
    ) as Readonly<Partial<Record<QuestionId, readonly OptionId[]>>>,
    forcedAnswers: displayOrder.flatMap((question) => {
      const optionIds = forcedAnswers[question.id]
      return optionIds
        ? [{
            questionId: question.id as QuestionId,
            optionIds: optionIds as readonly OptionId[],
            reason: 'single-allowed-option' as const,
          }]
        : []
    }) satisfies ForcedAnswer[],
    complete,
  }
}

function invalidDecodedState(diagnostics: readonly Diagnostic[]): FlowState {
  return deepFreeze({
    status: 'invalid',
    canonicalAnswers: {},
    reachableQuestionIds: [],
    interactiveQuestionIds: [],
    allowedOptionIdsByQuestion: {},
    forcedAnswers: [],
    repairs: [],
    diagnostics,
  })
}

export function evaluateFlow(model: CompiledQuestionModel, input: unknown): FlowState {
  const decoded = decodeAnswerDraft(input)
  if (!decoded.ok) return invalidDecodedState(decoded.diagnostics)

  const displayOrder = displayQuestions(model)
  const questionById = new Map(displayOrder.map((question) => [question.id, question]))
  const evaluationOrder = evaluationQuestions(model, questionById, displayOrder)
  const semantic = semanticDraft(decoded.draft, displayOrder, questionById)
  let canonicalAnswers = semantic.submittedAnswers
  let forcedAnswers: Answers = {}
  let latestRepairs: readonly FlowRepair[] = []
  let latestDiagnostics: readonly DiagnosticEntry[] = []
  const seen = new Set([stateKey(forcedAnswers, canonicalAnswers, displayOrder)])
  const upperBound = Number.isInteger(model.forcedIterationUpperBound)
    ? Math.max(0, model.forcedIterationUpperBound)
    : 0
  let resolutionDiagnostic: DiagnosticEntry | undefined
  let fixed = false

  for (let iteration = 0; iteration < upperBound; iteration += 1) {
    const result = evaluateIteration(
      semantic.submittedAnswers,
      canonicalAnswers,
      evaluationOrder,
      displayOrder,
    )
    latestRepairs = result.repairs
    latestDiagnostics = result.diagnostics
    const previousKey = stateKey(forcedAnswers, canonicalAnswers, displayOrder)
    const nextKey = stateKey(result.forcedAnswers, result.canonicalAnswers, displayOrder)
    canonicalAnswers = result.canonicalAnswers
    forcedAnswers = result.forcedAnswers
    if (nextKey === previousKey) {
      fixed = true
      break
    }
    if (seen.has(nextKey)) {
      resolutionDiagnostic = makeEntry(
        'FLOW_FORCED_CYCLE',
        '/questions',
        'Forced resolution repeated a canonical state key before fixed point',
        7,
        { received: nextKey },
      )
      break
    }
    seen.add(nextKey)
  }
  if (!fixed && !resolutionDiagnostic) resolutionDiagnostic = makeEntry(
    'FLOW_FORCED_NON_IDEMPOTENT',
    '/questions',
    'Forced resolution exceeded the compiled iteration upper bound',
    8,
    { expected: model.forcedIterationUpperBound },
  )

  const questionOrder = new Map(displayOrder.map(({ id }, index) => [id, index]))
  const repairs = [...latestRepairs].sort((left, right) => (
    compareRepairs(left, right, questionOrder)
  ))
  const diagnosticEntries = [
    ...semantic.entries,
    ...latestDiagnostics,
    ...(resolutionDiagnostic ? [resolutionDiagnostic] : []),
  ]
  const diagnostics = sortedDiagnostics(diagnosticEntries, displayOrder)
  const views = stateViews(canonicalAnswers, forcedAnswers, displayOrder)
  const base = {
    canonicalAnswers: views.canonicalAnswers,
    reachableQuestionIds: views.reachableQuestionIds,
    interactiveQuestionIds: views.interactiveQuestionIds,
    allowedOptionIdsByQuestion: views.allowedOptionIdsByQuestion,
    forcedAnswers: views.forcedAnswers,
    repairs,
    diagnostics,
  }
  if (diagnostics.length > 0) return deepFreeze({ ...base, status: 'invalid' })
  if (!views.complete) return deepFreeze({ ...base, status: 'incomplete' })
  return deepFreeze({
    ...base,
    status: 'complete',
    completedAnswers: views.canonicalAnswers as CompletedAnswers,
  })
}
