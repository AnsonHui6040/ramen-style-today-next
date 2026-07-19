import { deepFreeze } from '../contracts/deep-freeze.js'
import type { CompiledQuestionModel } from '../contracts/question-model.js'
import { compareCodePoints } from '../contracts/source-path.js'
import { getFirstActionableQuestion } from '../flow/navigation.js'
import type { QuestionId } from '../flow/types.js'
import type {
  PersistenceRepair,
  SuccessfulFlowState,
} from './contracts.js'
import { clonePlainData } from './decode-envelope.js'
import { PersistenceInvariantError } from './invariant-error.js'

export interface ResumeResolution {
  readonly resumeQuestionId: QuestionId | undefined
  readonly repairs: readonly Extract<
    PersistenceRepair,
    { readonly code: 'drop-unknown-cursor' | 'normalize-cursor' }
  >[]
}

interface ResumeContext {
  readonly knownQuestionIds: ReadonlySet<string>
  readonly positions: ReadonlyMap<string, number>
}

function invalidModelArtifact(): never {
  throw new PersistenceInvariantError(
    'PERSISTENCE_MODEL_ARTIFACT_INVALID',
    'Current question model produced an invalid persistence resume artifact',
  )
}

function inconsistentResume(): never {
  throw new PersistenceInvariantError(
    'PERSISTENCE_RESUME_INCONSISTENT',
    'Successful incomplete persistence state has no stable resume target',
  )
}

function snapshotModel(model: CompiledQuestionModel): CompiledQuestionModel {
  const cloned = clonePlainData(model)
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned)) {
    return invalidModelArtifact()
  }
  return deepFreeze(cloned) as unknown as CompiledQuestionModel
}

function deriveResumeContext(model: CompiledQuestionModel): ResumeContext {
  if (!Array.isArray(model.questions)) return invalidModelArtifact()
  const ordered = [...model.questions].sort((left, right) => (
    left.order - right.order || compareCodePoints(left.id, right.id)
  ))
  const knownQuestionIds = new Set<string>()
  const positions = new Map<string, number>()

  for (const [position, question] of ordered.entries()) {
    if (
      !question
        || typeof question !== 'object'
        || typeof question.id !== 'string'
        || !Number.isFinite(question.order)
        || knownQuestionIds.has(question.id)
    ) return invalidModelArtifact()
    knownQuestionIds.add(question.id)
    positions.set(question.id, position)
  }
  return { knownQuestionIds, positions }
}

function resolution(
  resumeQuestionId: QuestionId | undefined,
  repairs: ResumeResolution['repairs'],
): ResumeResolution {
  return deepFreeze({ resumeQuestionId, repairs }) as ResumeResolution
}

function resolveResumeQuestionInternal(
  model: CompiledQuestionModel,
  state: SuccessfulFlowState,
  cursorQuestionId?: string,
): ResumeResolution {
  const context = deriveResumeContext(snapshotModel(model))
  if (state.status !== 'complete' && state.status !== 'incomplete') {
    return inconsistentResume()
  }

  const cursorIsKnown = cursorQuestionId === undefined
    || context.knownQuestionIds.has(cursorQuestionId)

  if (state.status === 'complete') {
    if (cursorQuestionId === undefined) return resolution(undefined, [])
    return resolution(undefined, [{
      code: cursorIsKnown ? 'normalize-cursor' : 'drop-unknown-cursor',
      beforeCursorQuestionId: cursorQuestionId,
    }])
  }

  const firstActionable = getFirstActionableQuestion(state)
  const reachable = new Set(state.reachableQuestionIds)
  const interactive = new Set(state.interactiveQuestionIds)
  if (
    firstActionable === undefined
      || !context.knownQuestionIds.has(firstActionable)
      || !reachable.has(firstActionable)
      || !interactive.has(firstActionable)
  ) return inconsistentResume()

  if (cursorQuestionId === undefined) return resolution(firstActionable, [])
  if (!cursorIsKnown) return resolution(firstActionable, [{
    code: 'drop-unknown-cursor',
    beforeCursorQuestionId: cursorQuestionId,
  }])

  const cursorPosition = context.positions.get(cursorQuestionId)
  const firstActionablePosition = context.positions.get(firstActionable)
  if (
    cursorPosition === undefined
      || firstActionablePosition === undefined
  ) return inconsistentResume()

  const cursorIsUsable = reachable.has(cursorQuestionId as QuestionId)
    && interactive.has(cursorQuestionId as QuestionId)
    && firstActionablePosition >= cursorPosition
  if (cursorIsUsable) {
    return resolution(cursorQuestionId as QuestionId, [])
  }

  return resolution(firstActionable, [{
    code: 'normalize-cursor',
    beforeCursorQuestionId: cursorQuestionId,
    afterCursorQuestionId: firstActionable,
  }])
}

export function resolveResumeQuestion(
  model: CompiledQuestionModel,
  state: SuccessfulFlowState,
  cursorQuestionId?: string,
): ResumeResolution {
  try {
    return resolveResumeQuestionInternal(model, state, cursorQuestionId)
  } catch (error) {
    if (error instanceof PersistenceInvariantError) throw error
    return invalidModelArtifact()
  }
}
