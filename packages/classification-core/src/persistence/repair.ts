import { deepFreeze } from '../contracts/deep-freeze.js'
import type { Diagnostic } from '../contracts/diagnostic.js'
import type {
  CompiledQuestion,
  CompiledQuestionModel,
} from '../contracts/question-model.js'
import { compareCodePoints } from '../contracts/source-path.js'
import { evaluateFlow } from '../flow/index.js'
import type {
  AnswerDraft,
  FlowRepair,
  FlowState,
  OptionId,
  QuestionId,
} from '../flow/types.js'
import type {
  AnswerDiagnosticCode,
  PersistenceDiagnostic,
  PersistenceRepair,
  SuccessfulFlowState,
} from './contracts.js'
import { clonePlainData } from './decode-envelope.js'
import { sortPersistenceDiagnostics } from './diagnostics.js'
import { PersistenceInvariantError } from './invariant-error.js'

interface SuccessfulRepairProjection {
  readonly status: 'incomplete' | 'complete'
  readonly submittedAnswers: AnswerDraft
  readonly repairs: readonly PersistenceRepair[]
  readonly flowState: SuccessfulFlowState
  readonly diagnostics?: never
}

interface InvalidRepairProjection {
  readonly status: 'invalid'
  readonly diagnostics: readonly PersistenceDiagnostic[]
  readonly repairs: readonly []
  readonly submittedAnswers?: never
  readonly flowState?: never
}

export type RepairProjectionResult =
  | SuccessfulRepairProjection
  | InvalidRepairProjection

interface RepairContext {
  readonly questions: readonly CompiledQuestion[]
  readonly questionById: ReadonlyMap<string, CompiledQuestion>
  readonly optionRanksByQuestion: ReadonlyMap<string, ReadonlyMap<string, number>>
}

interface ProjectedDraft {
  readonly submittedAnswers: AnswerDraft
  readonly repairs: readonly PersistenceRepair[]
}

type SuccessfulState = Extract<FlowState, { readonly status: 'incomplete' | 'complete' }>

const hasOwn = (value: object, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(value, key)
)

function invalidModelArtifact(): never {
  throw new PersistenceInvariantError(
    'PERSISTENCE_MODEL_ARTIFACT_INVALID',
    'Current question model produced an invalid persistence repair artifact',
  )
}

function nonIdempotentRepair(): never {
  throw new PersistenceInvariantError(
    'PERSISTENCE_REPAIR_NON_IDEMPOTENT',
    'Persistence submitted-state repair did not reach a fixed point',
  )
}

function snapshotModel(model: CompiledQuestionModel): CompiledQuestionModel {
  const cloned = clonePlainData(model)
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned)) {
    return invalidModelArtifact()
  }
  return deepFreeze(cloned) as unknown as CompiledQuestionModel
}

function compareQuestions(left: CompiledQuestion, right: CompiledQuestion): number {
  return left.order - right.order || compareCodePoints(left.id, right.id)
}

function compareOptions(
  left: CompiledQuestion['options'][number],
  right: CompiledQuestion['options'][number],
): number {
  return left.order - right.order || compareCodePoints(left.id, right.id)
}

function deriveRepairContext(model: CompiledQuestionModel): RepairContext {
  try {
    if (!Array.isArray(model.questions)) return invalidModelArtifact()
    const questions = [...model.questions].sort(compareQuestions)
    const questionById = new Map<string, CompiledQuestion>()
    const optionRanksByQuestion = new Map<string, ReadonlyMap<string, number>>()

    for (const question of questions) {
      if (
        !question
          || typeof question !== 'object'
          || typeof question.id !== 'string'
          || !Number.isFinite(question.order)
          || !Array.isArray(question.options)
          || questionById.has(question.id)
      ) return invalidModelArtifact()

      const optionRanks = new Map<string, number>()
      const options = [...question.options].sort(compareOptions)
      for (const [index, option] of options.entries()) {
        if (
          !option
            || typeof option !== 'object'
            || typeof option.id !== 'string'
            || !Number.isFinite(option.order)
            || optionRanks.has(option.id)
        ) return invalidModelArtifact()
        optionRanks.set(option.id, index)
      }
      questionById.set(question.id, question)
      optionRanksByQuestion.set(question.id, optionRanks)
    }

    return { questions, questionById, optionRanksByQuestion }
  } catch (error) {
    if (error instanceof PersistenceInvariantError) throw error
    return invalidModelArtifact()
  }
}

function evaluateSafely(
  model: CompiledQuestionModel,
  submittedAnswers: AnswerDraft,
): FlowState {
  try {
    return evaluateFlow(model, submittedAnswers)
  } catch {
    return invalidModelArtifact()
  }
}

function prefixedAnswerPath(path: string): string {
  return path === '' ? '/submittedAnswers' : `/submittedAnswers${path}`
}

function invalidDiagnostic(diagnostic: Diagnostic): PersistenceDiagnostic {
  return {
    stage: 'flow-evaluation',
    code: diagnostic.code as AnswerDiagnosticCode,
    path: prefixedAnswerPath(diagnostic.path),
  }
}

function invalidProjection(
  model: CompiledQuestionModel,
  state: Extract<FlowState, { readonly status: 'invalid' }>,
): InvalidRepairProjection {
  if (state.diagnostics.some(({ code }) => !code.startsWith('ANSWER_'))) {
    return invalidModelArtifact()
  }
  const result: InvalidRepairProjection = {
    status: 'invalid',
    diagnostics: sortPersistenceDiagnostics(
      model,
      state.diagnostics.map(invalidDiagnostic),
    ),
    repairs: [],
  }
  return deepFreeze(result) as InvalidRepairProjection
}

function canonicalSelection(
  context: RepairContext,
  questionId: string,
  optionIds: readonly string[],
): readonly string[] {
  const ranks = context.optionRanksByQuestion.get(questionId)
  if (!ranks) return invalidModelArtifact()
  return [...optionIds].sort((left, right) => (
    (ranks.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (ranks.get(right) ?? Number.MAX_SAFE_INTEGER)
    || compareCodePoints(left, right)
  ))
}

function sameSelection(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((optionId, index) => optionId === right[index])
}

function repairRecord(
  code: Extract<PersistenceRepair, { readonly questionId: QuestionId }>['code'],
  questionId: string,
  beforeOptionIds: readonly string[],
  afterOptionIds?: readonly string[],
): PersistenceRepair {
  return {
    code,
    questionId: questionId as QuestionId,
    beforeOptionIds: [...beforeOptionIds] as readonly OptionId[],
    ...(afterOptionIds === undefined
      ? {}
      : { afterOptionIds: [...afterOptionIds] as readonly OptionId[] }),
  }
}

function flowRepairsByQuestion(
  context: RepairContext,
  repairs: readonly FlowRepair[],
): ReadonlyMap<string, FlowRepair> {
  const byQuestion = new Map<string, FlowRepair>()
  for (const repair of repairs) {
    if (
      !context.questionById.has(repair.questionId)
        || byQuestion.has(repair.questionId)
    ) return invalidModelArtifact()
    byQuestion.set(repair.questionId, repair)
  }
  return byQuestion
}

function copySubmittedAnswers(
  context: RepairContext,
  originalDraft: AnswerDraft,
): Map<string, readonly string[]> {
  const working = new Map<string, readonly string[]>()
  for (const question of context.questions) {
    if (!hasOwn(originalDraft, question.id)) continue
    const optionIds = originalDraft[question.id as QuestionId]
    if (!Array.isArray(optionIds)) return invalidModelArtifact()
    working.set(question.id, [...optionIds])
  }
  return working
}

function orderedSubmittedAnswers(
  context: RepairContext,
  working: ReadonlyMap<string, readonly string[]>,
): AnswerDraft {
  return Object.fromEntries(context.questions.flatMap((question) => {
    const optionIds = working.get(question.id)
    return optionIds === undefined
      ? []
      : [[question.id, [...optionIds]] as const]
  })) as AnswerDraft
}

function projectFromState(
  context: RepairContext,
  originalDraft: AnswerDraft,
  state: SuccessfulState,
): ProjectedDraft {
  if (state.diagnostics.length > 0) return invalidModelArtifact()
  const working = copySubmittedAnswers(context, originalDraft)
  const flowRepairs = flowRepairsByQuestion(context, state.repairs)
  const handledFlowRepairs = new Set<string>()
  const unreachableRepairs: PersistenceRepair[] = []
  const disallowedRepairs: PersistenceRepair[] = []
  const underMinRepairs: PersistenceRepair[] = []
  const forcedRepairs: PersistenceRepair[] = []
  const orderRepairs: PersistenceRepair[] = []

  for (const question of context.questions) {
    const repair = flowRepairs.get(question.id)
    if (repair?.code !== 'remove-unreachable-answer') continue
    if (!working.has(question.id)) return invalidModelArtifact()
    unreachableRepairs.push(repairRecord(
      'remove-unreachable-answer',
      question.id,
      repair.previousOptionIds,
    ))
    working.delete(question.id)
    handledFlowRepairs.add(question.id)
  }

  for (const question of context.questions) {
    const repair = flowRepairs.get(question.id)
    if (repair?.code !== 'remove-disallowed-option') continue
    if (!working.has(question.id)) return invalidModelArtifact()
    if (repair.canonicalOptionIds === undefined) {
      underMinRepairs.push(repairRecord(
        'remove-stale-under-min-answer',
        question.id,
        repair.previousOptionIds,
      ))
      working.delete(question.id)
    } else {
      disallowedRepairs.push(repairRecord(
        'remove-disallowed-option',
        question.id,
        repair.previousOptionIds,
        repair.canonicalOptionIds,
      ))
      working.set(question.id, [...repair.canonicalOptionIds])
    }
    handledFlowRepairs.add(question.id)
  }

  const forcedQuestionIds = new Set<string>()
  for (const forced of state.forcedAnswers) {
    if (
      !context.questionById.has(forced.questionId)
        || forcedQuestionIds.has(forced.questionId)
    ) return invalidModelArtifact()
    forcedQuestionIds.add(forced.questionId)
  }
  for (const question of context.questions) {
    if (!forcedQuestionIds.has(question.id) || !working.has(question.id)) continue
    const submitted = working.get(question.id)
    if (!submitted) return invalidModelArtifact()
    forcedRepairs.push(repairRecord(
      'remove-submitted-forced-answer',
      question.id,
      canonicalSelection(context, question.id, submitted),
    ))
    working.delete(question.id)
    if (flowRepairs.get(question.id)?.code === 'replace-with-forced-answer') {
      handledFlowRepairs.add(question.id)
    }
  }

  for (const [questionId, repair] of flowRepairs) {
    if (
      repair.code === 'replace-with-forced-answer'
        && !forcedQuestionIds.has(questionId)
    ) return invalidModelArtifact()
    if (!handledFlowRepairs.has(questionId)) return invalidModelArtifact()
  }

  for (const question of context.questions) {
    const submitted = working.get(question.id)
    if (!submitted) continue
    const canonical = canonicalSelection(context, question.id, submitted)
    if (sameSelection(submitted, canonical)) continue
    orderRepairs.push(repairRecord(
      'canonicalize-answer-order',
      question.id,
      submitted,
      canonical,
    ))
    working.set(question.id, canonical)
  }

  return {
    submittedAnswers: orderedSubmittedAnswers(context, working),
    repairs: [
      ...unreachableRepairs,
      ...disallowedRepairs,
      ...underMinRepairs,
      ...forcedRepairs,
      ...orderRepairs,
    ],
  }
}

function sameSubmittedAnswers(
  context: RepairContext,
  left: AnswerDraft,
  right: AnswerDraft,
): boolean {
  for (const question of context.questions) {
    const leftHas = hasOwn(left, question.id)
    const rightHas = hasOwn(right, question.id)
    if (leftHas !== rightHas) return false
    if (!leftHas) continue
    const leftSelection = left[question.id as QuestionId]
    const rightSelection = right[question.id as QuestionId]
    if (!leftSelection || !rightSelection) return false
    if (!sameSelection(leftSelection, rightSelection)) return false
  }
  return Object.keys(left).length === Object.keys(right).length
}

function containsSubmittedForcedAnswer(
  submittedAnswers: AnswerDraft,
  state: SuccessfulState,
): boolean {
  return state.forcedAnswers.some(({ questionId }) => (
    hasOwn(submittedAnswers, questionId)
  ))
}

function sameSuccessfulState(
  left: SuccessfulState,
  right: SuccessfulState,
): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

function projectRepairedSubmittedAnswersInternal(
  model: CompiledQuestionModel,
  originalDraft: AnswerDraft,
): RepairProjectionResult {
  const trustedModel = snapshotModel(model)
  const context = deriveRepairContext(trustedModel)
  const originalState = evaluateSafely(trustedModel, originalDraft)
  if (originalState.status === 'invalid') {
    return invalidProjection(trustedModel, originalState)
  }

  const projected = projectFromState(context, originalDraft, originalState)
  const secondState = evaluateSafely(trustedModel, projected.submittedAnswers)
  if (
    secondState.status === 'invalid'
      || secondState.repairs.length > 0
      || containsSubmittedForcedAnswer(projected.submittedAnswers, secondState)
  ) return nonIdempotentRepair()

  const fixedProjection = projectFromState(
    context,
    projected.submittedAnswers,
    secondState,
  )
  if (
    fixedProjection.repairs.length > 0
      || !sameSubmittedAnswers(
        context,
        projected.submittedAnswers,
        fixedProjection.submittedAnswers,
      )
  ) return nonIdempotentRepair()

  const fixedState = evaluateSafely(trustedModel, fixedProjection.submittedAnswers)
  if (
    fixedState.status === 'invalid'
      || fixedState.repairs.length > 0
      || fixedState.status !== secondState.status
      || containsSubmittedForcedAnswer(fixedProjection.submittedAnswers, fixedState)
      || !sameSuccessfulState(secondState, fixedState)
  ) return nonIdempotentRepair()

  return deepFreeze({
    status: secondState.status,
    submittedAnswers: projected.submittedAnswers,
    repairs: projected.repairs,
    flowState: secondState,
  }) as SuccessfulRepairProjection
}

export function projectRepairedSubmittedAnswers(
  model: CompiledQuestionModel,
  originalDraft: AnswerDraft,
): RepairProjectionResult {
  try {
    return projectRepairedSubmittedAnswersInternal(model, originalDraft)
  } catch (error) {
    if (error instanceof PersistenceInvariantError) throw error
    return invalidModelArtifact()
  }
}
