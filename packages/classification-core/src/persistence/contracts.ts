import type { Diagnostic } from '../contracts/diagnostic.js'
import type { FlowAnswers } from '../flow/types.js'

export const CURRENT_SCHEMA_VERSION = 1

/** Reserved runtime diagnostic sources for stored browser data. */
export const legacyStateSource = 'runtime://local-storage/legacy-state'
export const classificationStateSource = 'runtime://local-storage/classification-state'

/**
 * The classification-only payload. `locale`, `phase` and `savedAt` belong to the app envelope,
 * never to this payload.
 */
export interface StoredClassificationPayload {
  readonly schemaVersion: 1
  readonly modelVersion: string
  readonly dataVersion: string
  readonly currentQuestionId?: string
  /** QuestionId -> readonly OptionId[] for every question, single-choice questions included. */
  readonly answers: Readonly<Record<string, readonly string[]>>
}

export type SourceVersion = 'legacy-unversioned' | number

export type MigrationResult =
  | {
    readonly ok: true
    readonly sourceVersion: SourceVersion
    readonly payload: StoredClassificationPayload
    readonly diagnostics: readonly Diagnostic[]
  }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }

export type ValidationResult =
  | {
    readonly ok: true
    readonly payload: StoredClassificationPayload
    readonly diagnostics: readonly Diagnostic[]
  }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }

export interface RepairResult {
  readonly answers: FlowAnswers
  readonly resumeQuestionId: string
  readonly complete: boolean
  readonly completedAnswers?: FlowAnswers
  readonly diagnostics: readonly Diagnostic[]
}

export type RestoreResult =
  | {
    readonly ok: true
    readonly sourceVersion: SourceVersion
    readonly answers: FlowAnswers
    readonly resumeQuestionId: string
    readonly complete: boolean
    readonly completedAnswers?: FlowAnswers
    readonly diagnostics: readonly Diagnostic[]
  }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }
