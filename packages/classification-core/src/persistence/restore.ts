import { deepFreeze } from '../contracts/deep-freeze.js'
import type { CompiledQuestionModel } from '../contracts/question-model.js'
import { decodeAnswerDraft } from '../flow/decode.js'
import type { AnswerDraft, QuestionId } from '../flow/types.js'
import type {
  AppliedMigration,
  ClassificationRestoreSource,
  NonEmptyReadonlyArray,
  PersistenceDiagnostic,
  PersistenceRepair,
  RestoreChange,
  RestoreResult,
  StoredClassificationPayloadV1,
} from './contracts.js'
import { decodeCurrentAnswerDraft } from './decode-answers.js'
import {
  clonePlainData,
  decodeRestoreSource,
  type DecodeFailure,
} from './decode-envelope.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { migrateVerifiedLegacyAnswers } from './legacy-lineage.js'
import {
  migrateQuestionModelToCurrent,
  questionModelMigrationRegistry,
} from './model-migrations.js'
import { projectRepairedSubmittedAnswers } from './repair.js'
import { resolveResumeQuestion } from './resume.js'
import {
  migrateSchemaToCurrent,
  schemaMigrationRegistry,
} from './schema-migrations.js'

type UnsupportedReason = Extract<
  RestoreResult,
  { readonly status: 'unsupported' }
>['reason']

interface DecodedRestoreDraft {
  readonly draft: AnswerDraft
  readonly migrations: readonly AppliedMigration[]
  readonly cursorQuestionId?: string
}

function invalidModelArtifact(): never {
  throw new PersistenceInvariantError(
    'PERSISTENCE_MODEL_ARTIFACT_INVALID',
    'Current question model produced an invalid persistence restore artifact',
  )
}

function snapshotModel(model: CompiledQuestionModel): CompiledQuestionModel {
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

function invalid(
  diagnostics: readonly PersistenceDiagnostic[],
  diagnosticSubmittedSubset?: AnswerDraft,
): RestoreResult {
  return deepFreeze({
    status: 'invalid',
    diagnostics,
    ...(diagnosticSubmittedSubset === undefined
      ? {}
      : { diagnosticSubmittedSubset }),
  }) as RestoreResult
}

function unsupported(
  reason: UnsupportedReason,
  diagnostics: readonly PersistenceDiagnostic[],
): RestoreResult {
  return deepFreeze({ status: 'unsupported', reason, diagnostics }) as RestoreResult
}

function failureIsOnly(
  failure: DecodeFailure,
  code: PersistenceDiagnostic['code'],
): boolean {
  return failure.diagnostics.length > 0
    && failure.diagnostics.every((diagnostic) => diagnostic.code === code)
}

function diagnosticSubset(input: unknown): AnswerDraft | undefined {
  const decoded = decodeAnswerDraft(input)
  return decoded.ok ? decoded.draft as AnswerDraft : undefined
}

function decodeRestoreDraft(
  model: CompiledQuestionModel,
  source: ClassificationRestoreSource,
): DecodedRestoreDraft | RestoreResult {
  if (source.kind === 'legacy-unversioned') {
    const migrated = migrateVerifiedLegacyAnswers(model, source.answers)
    if (!migrated.ok) return invalid(migrated.diagnostics)
    return {
      draft: migrated.draft,
      migrations: migrated.migrations,
    }
  }

  const schema = migrateSchemaToCurrent(schemaMigrationRegistry, source.payload)
  if (!schema.ok) {
    return failureIsOnly(schema, 'PERSISTENCE_SCHEMA_VERSION_UNSUPPORTED')
      ? unsupported('unsupported-schema-version', schema.diagnostics)
      : invalid(schema.diagnostics)
  }

  const migratedModel = migrateQuestionModelToCurrent(
    questionModelMigrationRegistry,
    schema.payload,
  )
  if (!migratedModel.ok) {
    if (failureIsOnly(
      migratedModel,
      'PERSISTENCE_QUESTION_MODEL_UNSUPPORTED',
    )) return unsupported('unsupported-question-model', migratedModel.diagnostics)
    if (failureIsOnly(
      migratedModel,
      'PERSISTENCE_QUESTION_MODEL_INTEGRITY',
    )) return unsupported('question-model-integrity-error', migratedModel.diagnostics)
    return invalid(migratedModel.diagnostics)
  }

  const decodedAnswers = decodeCurrentAnswerDraft(
    model,
    migratedModel.payload.submittedAnswers,
  )
  if (!decodedAnswers.ok) return invalid(
    decodedAnswers.diagnostics,
    diagnosticSubset(migratedModel.payload.submittedAnswers),
  )

  return {
    draft: decodedAnswers.draft,
    migrations: [...schema.migrations, ...migratedModel.migrations],
    ...(migratedModel.payload.cursorQuestionId === undefined
      ? {}
      : { cursorQuestionId: migratedModel.payload.cursorQuestionId }),
  }
}

function normalizedCursor(
  originalCursor: string | undefined,
  resumeQuestionId: QuestionId | undefined,
  cursorRepairs: readonly PersistenceRepair[],
): QuestionId | undefined {
  if (originalCursor === undefined || resumeQuestionId === undefined) return undefined
  return cursorRepairs.some(({ code }) => code === 'drop-unknown-cursor')
    ? undefined
    : resumeQuestionId
}

function buildNormalizedPayload(
  model: CompiledQuestionModel,
  submittedAnswers: AnswerDraft,
  cursorQuestionId?: QuestionId,
): StoredClassificationPayloadV1 {
  return deepFreeze({
    schemaVersion: 1,
    questionModelVersion: model.metadata.modelVersion,
    questionSemanticHash: model.metadata.semanticHash,
    ...(cursorQuestionId === undefined ? {} : { cursorQuestionId }),
    submittedAnswers,
  }) as StoredClassificationPayloadV1
}

function restoreClassificationInternal(
  model: CompiledQuestionModel,
  input: ClassificationRestoreSource,
): RestoreResult {
  const trustedModel = snapshotModel(model)
  const decodedSource = decodeRestoreSource(input)
  if (!decodedSource.ok) {
    return failureIsOnly(decodedSource, 'PERSISTENCE_SOURCE_UNSUPPORTED')
      ? unsupported('unsupported-source', decodedSource.diagnostics)
      : invalid(decodedSource.diagnostics)
  }

  const decoded = decodeRestoreDraft(trustedModel, decodedSource.source)
  if ('status' in decoded) return decoded

  const projection = projectRepairedSubmittedAnswers(trustedModel, decoded.draft)
  if (projection.status === 'invalid') {
    return invalid(projection.diagnostics, decoded.draft)
  }

  const resume = resolveResumeQuestion(
    trustedModel,
    projection.flowState,
    decoded.cursorQuestionId,
  )
  const repairs = deepFreeze([
    ...projection.repairs,
    ...resume.repairs,
  ]) as readonly PersistenceRepair[]
  const changes = deepFreeze([
    ...decoded.migrations.map((migration): RestoreChange => ({
      kind: 'migration',
      migration,
    })),
    ...repairs.map((repair): RestoreChange => ({ kind: 'repair', repair })),
  ]) as readonly RestoreChange[]

  const common = {
    submittedAnswers: projection.submittedAnswers,
    flowState: projection.flowState,
    ...(resume.resumeQuestionId === undefined
      ? {}
      : { resumeQuestionId: resume.resumeQuestionId }),
  }
  if (changes.length === 0) {
    return deepFreeze({
      status: 'restored',
      ...common,
      migrations: [] as const,
      repairs: [] as const,
      changes: [] as const,
      writeBackRequired: false,
    }) as RestoreResult
  }

  const cursorQuestionId = normalizedCursor(
    decoded.cursorQuestionId,
    resume.resumeQuestionId,
    resume.repairs,
  )
  return deepFreeze({
    status: 'restored-with-changes',
    ...common,
    migrations: decoded.migrations,
    repairs,
    changes: changes as NonEmptyReadonlyArray<RestoreChange>,
    writeBackRequired: true,
    normalizedPayload: buildNormalizedPayload(
      trustedModel,
      projection.submittedAnswers,
      cursorQuestionId,
    ),
  }) as RestoreResult
}

export function restoreClassification(
  model: CompiledQuestionModel,
  source: ClassificationRestoreSource,
): RestoreResult {
  try {
    return restoreClassificationInternal(model, source)
  } catch (error) {
    if (error instanceof PersistenceInvariantError) throw error
    return invalidModelArtifact()
  }
}
