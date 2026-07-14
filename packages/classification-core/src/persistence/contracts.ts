import type { DiagnosticCode } from '../contracts/diagnostic-codes.js'
import type {
  AnswerDraft,
  FlowState,
  OptionId,
  QuestionId,
} from '../flow/types.js'

export type ClassificationRestoreSource =
  | {
      readonly kind: 'legacy-unversioned'
      readonly sourceId:
        'ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37'
      readonly answers: unknown
    }
  | {
      readonly kind: 'versioned'
      readonly payload: unknown
    }

export interface StoredClassificationPayloadV1 {
  readonly schemaVersion: 1
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly cursorQuestionId?: QuestionId
  readonly submittedAnswers: AnswerDraft
}

export type AppliedMigration =
  | {
      readonly kind: 'legacy-lineage'
      readonly fromSourceId:
        'ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37'
      readonly toSchemaVersion: 1
      readonly toQuestionModelVersion: string
      readonly toQuestionSemanticHash: string
    }
  | {
      readonly kind: 'schema'
      readonly fromSchemaVersion: number
      readonly toSchemaVersion: number
    }
  | {
      readonly kind: 'question-model'
      readonly fromQuestionModelVersion: string
      readonly fromQuestionSemanticHash: string
      readonly toQuestionModelVersion: string
      readonly toQuestionSemanticHash: string
    }

export type PersistenceRepair =
  | {
      readonly code:
        | 'remove-unreachable-answer'
        | 'remove-disallowed-option'
        | 'remove-stale-under-min-answer'
        | 'remove-submitted-forced-answer'
        | 'canonicalize-answer-order'
      readonly questionId: QuestionId
      readonly beforeOptionIds: readonly OptionId[]
      readonly afterOptionIds?: readonly OptionId[]
    }
  | {
      readonly code: 'drop-unknown-cursor' | 'normalize-cursor'
      readonly beforeCursorQuestionId: string
      readonly afterCursorQuestionId?: QuestionId
    }

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

export type SuccessfulFlowState = Extract<
  FlowState,
  { readonly status: 'incomplete' | 'complete' }
>

export type RestoreChange =
  | {
      readonly kind: 'migration'
      readonly migration: AppliedMigration
    }
  | {
      readonly kind: 'repair'
      readonly repair: PersistenceRepair
    }

export type RestoreResult =
  | {
      readonly status: 'restored'
      readonly submittedAnswers: AnswerDraft
      readonly flowState: SuccessfulFlowState
      readonly resumeQuestionId?: QuestionId
      readonly migrations: readonly []
      readonly repairs: readonly []
      readonly changes: readonly []
      readonly writeBackRequired: false
    }
  | {
      readonly status: 'restored-with-changes'
      readonly submittedAnswers: AnswerDraft
      readonly flowState: SuccessfulFlowState
      readonly resumeQuestionId?: QuestionId
      readonly migrations: readonly AppliedMigration[]
      readonly repairs: readonly PersistenceRepair[]
      readonly changes: NonEmptyReadonlyArray<RestoreChange>
      readonly writeBackRequired: true
      readonly normalizedPayload: StoredClassificationPayloadV1
    }
  | {
      readonly status: 'unsupported'
      readonly reason:
        | 'unsupported-schema-version'
        | 'unsupported-question-model'
        | 'question-model-integrity-error'
      readonly diagnostics: readonly PersistenceDiagnostic[]
    }
  | {
      readonly status: 'invalid'
      readonly diagnostics: readonly PersistenceDiagnostic[]
      readonly diagnosticSubmittedSubset?: AnswerDraft
    }

export type CreateStoredPayloadResult =
  | {
      readonly status: 'created'
      readonly payload: StoredClassificationPayloadV1
    }
  | {
      readonly status: 'invalid-submitted-state'
      readonly diagnostics: readonly PersistenceDiagnostic[]
    }

export type PersistenceDiagnosticCode =
  | 'PERSISTENCE_SOURCE_INVALID'
  | 'PERSISTENCE_SOURCE_UNSUPPORTED'
  | 'PERSISTENCE_RESOURCE_LIMIT'
  | 'PERSISTENCE_DATA_NOT_PLAIN'
  | 'PERSISTENCE_ACCESSOR_FORBIDDEN'
  | 'PERSISTENCE_DANGEROUS_KEY'
  | 'PERSISTENCE_CIRCULAR_REFERENCE'
  | 'PERSISTENCE_REQUIRED_FIELD_MISSING'
  | 'PERSISTENCE_UNKNOWN_FIELD'
  | 'PERSISTENCE_FIELD_TYPE_INVALID'
  | 'PERSISTENCE_SCHEMA_VERSION_UNSUPPORTED'
  | 'PERSISTENCE_QUESTION_MODEL_UNSUPPORTED'
  | 'PERSISTENCE_QUESTION_MODEL_INTEGRITY'
  | 'PERSISTENCE_SEMANTIC_HASH_INVALID'
  | 'PERSISTENCE_LEGACY_FIELD_SHAPE_INVALID'
  | 'PERSISTENCE_LEGACY_EMPTY_SELECTION_INVALID'
  | 'PERSISTENCE_LEGACY_EXPANSION_CONFLICT'
  | 'PERSISTENCE_MIGRATION_FAILED'
  | 'PERSISTENCE_SUBMITTED_STATE_REQUIRES_REPAIR'
  | 'PERSISTENCE_SUBMITTED_ANSWER_FOR_FORCED_QUESTION'
  | 'PERSISTENCE_CURSOR_INVALID'

export type AnswerDiagnosticCode = Extract<DiagnosticCode, `ANSWER_${string}`>

export type PublicPersistenceDiagnosticCode =
  | PersistenceDiagnosticCode
  | AnswerDiagnosticCode

export type PersistencePipelineStage =
  | 'source'
  | 'minimal-envelope'
  | 'schema-decode'
  | 'schema-migration'
  | 'model-compatibility'
  | 'model-migration'
  | 'answer-decode'
  | 'flow-evaluation'
  | 'repair-projection'
  | 'resume-resolution'
  | 'payload-build'

export type JsonPointer = string

export type BoundedReceivedSummary =
  | { readonly kind: 'null' }
  | { readonly kind: 'array'; readonly count: number }
  | { readonly kind: 'object'; readonly keyCount: number }
  | {
      readonly kind: 'string'
      readonly codePointCount: number
      readonly stableId?: string
    }
  | {
      readonly kind: 'number' | 'boolean' | 'symbol' | 'function' | 'bigint'
    }

export interface PersistenceDiagnostic {
  readonly stage: PersistencePipelineStage
  readonly code: PublicPersistenceDiagnosticCode
  readonly path: JsonPointer
  readonly questionId?: string
  readonly optionId?: string
  readonly received?: BoundedReceivedSummary
}

export type PersistenceInvariantCode =
  | 'PERSISTENCE_MIGRATION_INVARIANT'
  | 'PERSISTENCE_REPAIR_NON_IDEMPOTENT'
  | 'PERSISTENCE_RESUME_INCONSISTENT'
  | 'PERSISTENCE_MODEL_ARTIFACT_INVALID'
