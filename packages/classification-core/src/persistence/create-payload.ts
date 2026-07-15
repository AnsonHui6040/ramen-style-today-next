import { deepFreeze } from '../contracts/deep-freeze.js'
import type { CompiledQuestionModel } from '../contracts/question-model.js'
import type { AnswerDraft, QuestionId } from '../flow/types.js'
import type {
  CreateStoredPayloadResult,
  PersistenceDiagnostic,
  PersistenceRepair,
  StoredClassificationPayloadV1,
} from './contracts.js'
import { decodeCurrentAnswerDraft } from './decode-answers.js'
import {
  appendJsonPointer,
  sortPersistenceDiagnostics,
  summarizeReceived,
} from './diagnostics.js'
import { clonePlainData } from './decode-envelope.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { persistenceLimits } from './limits.js'
import { questionModelMigrationRegistry } from './model-migrations.js'
import { projectRepairedSubmittedAnswers } from './repair.js'
import { resolveResumeQuestion } from './resume.js'

const submittedAnswersPath = '/submittedAnswers'
const cursorQuestionIdPath = '/cursorQuestionId'
const hasOwn = (value: object, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(value, key)
)

function invalidModelArtifact(): never {
  throw new PersistenceInvariantError(
    'PERSISTENCE_MODEL_ARTIFACT_INVALID',
    'Current question model produced an invalid persistence payload artifact',
  )
}

function snapshotCurrentModel(
  model: CompiledQuestionModel,
): CompiledQuestionModel {
  const cloned = clonePlainData(model)
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned)) {
    return invalidModelArtifact()
  }
  const trustedModel = deepFreeze(cloned) as unknown as CompiledQuestionModel
  const metadata: unknown = trustedModel.metadata
  if (
    metadata === null
      || typeof metadata !== 'object'
      || (metadata as Partial<CompiledQuestionModel['metadata']>).modelVersion
        !== questionModelMigrationRegistry.current.questionModelVersion
      || (metadata as Partial<CompiledQuestionModel['metadata']>).semanticHash
        !== questionModelMigrationRegistry.current.questionSemanticHash
  ) return invalidModelArtifact()
  return trustedModel
}

function invalidSubmittedState(
  model: CompiledQuestionModel,
  diagnostics: readonly PersistenceDiagnostic[],
): CreateStoredPayloadResult {
  return deepFreeze({
    status: 'invalid-submitted-state',
    diagnostics: sortPersistenceDiagnostics(model, diagnostics),
  }) as CreateStoredPayloadResult
}

function repairDiagnostics(
  repairs: readonly PersistenceRepair[],
): readonly PersistenceDiagnostic[] {
  const diagnostics: PersistenceDiagnostic[] = []
  const seen = new Set<string>()

  for (const repair of repairs) {
    if (repair.code === 'canonicalize-answer-order') continue
    if (!('questionId' in repair)) return invalidModelArtifact()
    const code = repair.code === 'remove-submitted-forced-answer'
      ? 'PERSISTENCE_SUBMITTED_ANSWER_FOR_FORCED_QUESTION'
      : 'PERSISTENCE_SUBMITTED_STATE_REQUIRES_REPAIR'
    const key = `${code}\u0000${repair.questionId}`
    if (seen.has(key)) continue
    seen.add(key)
    diagnostics.push({
      stage: 'payload-build',
      code,
      path: appendJsonPointer(submittedAnswersPath, repair.questionId),
      questionId: repair.questionId,
    })
  }
  return diagnostics
}

function cursorIsBoundedString(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const summary = summarizeReceived(value)
  return summary?.kind === 'string'
    && summary.codePointCount <= persistenceLimits.maxIdCodePoints
}

function cursorDiagnostic(): PersistenceDiagnostic {
  return {
    stage: 'payload-build',
    code: 'PERSISTENCE_CURSOR_INVALID',
    path: cursorQuestionIdPath,
  }
}

function sameSelection(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  return left !== undefined
    && right !== undefined
    && left.length === right.length
    && left.every((optionId, index) => optionId === right[index])
}

function sameSubmittedAnswers(left: AnswerDraft, right: AnswerDraft): boolean {
  const leftQuestionIds = Object.keys(left)
  const rightQuestionIds = Object.keys(right)
  if (leftQuestionIds.length !== rightQuestionIds.length) return false

  for (const questionId of leftQuestionIds) {
    if (!hasOwn(right, questionId)) return false
    if (!sameSelection(
      left[questionId as QuestionId],
      right[questionId as QuestionId],
    )) return false
  }
  return true
}

function hasExactPayloadFields(payload: StoredClassificationPayloadV1): boolean {
  const required = [
    'schemaVersion',
    'questionModelVersion',
    'questionSemanticHash',
    'submittedAnswers',
  ]
  const expected = hasOwn(payload, 'cursorQuestionId')
    ? [...required, 'cursorQuestionId']
    : required
  const fields = Object.keys(payload)
  return fields.length === expected.length
    && expected.every((field) => hasOwn(payload, field))
}

export function sameStoredClassificationPayloadV1(
  left: StoredClassificationPayloadV1,
  right: StoredClassificationPayloadV1,
): boolean {
  if (!hasExactPayloadFields(left) || !hasExactPayloadFields(right)) return false
  const leftHasCursor = hasOwn(left, 'cursorQuestionId')
  const rightHasCursor = hasOwn(right, 'cursorQuestionId')
  return left.schemaVersion === right.schemaVersion
    && left.questionModelVersion === right.questionModelVersion
    && left.questionSemanticHash === right.questionSemanticHash
    && leftHasCursor === rightHasCursor
    && (!leftHasCursor || left.cursorQuestionId === right.cursorQuestionId)
    && sameSubmittedAnswers(left.submittedAnswers, right.submittedAnswers)
}

function createStoredClassificationPayloadV1Internal(
  model: CompiledQuestionModel,
  submittedAnswers: AnswerDraft,
  cursorQuestionId?: QuestionId,
): CreateStoredPayloadResult {
  const trustedModel = snapshotCurrentModel(model)
  const decoded = decodeCurrentAnswerDraft(trustedModel, submittedAnswers)
  if (!decoded.ok) return invalidSubmittedState(trustedModel, decoded.diagnostics)

  const projection = projectRepairedSubmittedAnswers(trustedModel, decoded.draft)
  if (projection.status === 'invalid') return invalidModelArtifact()
  const semanticRepairDiagnostics = repairDiagnostics(
    projection.repairs,
  )
  if (semanticRepairDiagnostics.length > 0) {
    return invalidSubmittedState(trustedModel, semanticRepairDiagnostics)
  }

  if (
    cursorQuestionId !== undefined
      && !cursorIsBoundedString(cursorQuestionId)
  ) return invalidSubmittedState(trustedModel, [cursorDiagnostic()])
  const resolved = resolveResumeQuestion(
    trustedModel,
    projection.flowState,
    cursorQuestionId,
  )
  if (cursorQuestionId !== undefined) {
    if (
      resolved.repairs.length > 0
        || resolved.resumeQuestionId !== cursorQuestionId
    ) return invalidSubmittedState(trustedModel, [cursorDiagnostic()])
  }

  const payload: StoredClassificationPayloadV1 = {
    schemaVersion: 1,
    questionModelVersion: trustedModel.metadata.modelVersion,
    questionSemanticHash: trustedModel.metadata.semanticHash,
    ...(cursorQuestionId === undefined ? {} : { cursorQuestionId }),
    submittedAnswers: projection.submittedAnswers,
  }
  return deepFreeze({ status: 'created', payload }) as CreateStoredPayloadResult
}

export function createStoredClassificationPayloadV1(
  model: CompiledQuestionModel,
  submittedAnswers: AnswerDraft,
  cursorQuestionId?: QuestionId,
): CreateStoredPayloadResult {
  try {
    return createStoredClassificationPayloadV1Internal(
      model,
      submittedAnswers,
      cursorQuestionId,
    )
  } catch (error) {
    if (error instanceof PersistenceInvariantError) throw error
    return invalidModelArtifact()
  }
}
