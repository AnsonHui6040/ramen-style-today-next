import { DiagnosticCollector } from '../compiler/collector.js'
import { compareDiagnostics, type Diagnostic } from '../contracts/diagnostic.js'
import type { ClassificationModel } from '../contracts/model.js'
import { orderedQuestions } from '../flow/options.js'
import type { FlowAnswers } from '../flow/types.js'
import {
  classificationStateSource,
  CURRENT_SCHEMA_VERSION,
  type RestoreResult,
  type StoredClassificationPayload,
  type ValidationResult,
} from './contracts.js'
import { deepFreeze } from './freeze.js'
import { migrateStoredClassification, sourceFileFor } from './migrate.js'
import { parseStoredPayloadV1 } from './payload-schema.js'
import { repairAnswers } from './repair.js'

function versionDiagnostics(
  payload: StoredClassificationPayload,
  model: ClassificationModel,
  sourceFile: string,
): Diagnostic[] {
  const collector = new DiagnosticCollector()
  for (const [field, stored, current] of [
    ['modelVersion', payload.modelVersion, model.modelVersion],
    ['dataVersion', payload.dataVersion, model.dataVersion],
  ] as const) {
    if (stored !== current) collector.warning({
      code: 'PERSIST_MODEL_VERSION_CHANGED',
      sourceFile,
      path: `/${field}`,
      message: `Stored ${field} differs from the current model; answers were revalidated`,
      expected: current,
      received: stored,
    })
  }
  return [...collector.toArray()]
}

/** Structural validation of a version 1 payload plus model and data version comparison. */
export function validateStoredPayload(
  input: unknown,
  model: ClassificationModel,
): ValidationResult {
  const collector = new DiagnosticCollector()
  const parsed = parseStoredPayloadV1(input, classificationStateSource, collector)
  if (!parsed) return { ok: false, diagnostics: collector.toArray() }
  const payload = deepFreeze({
    schemaVersion: 1 as const,
    modelVersion: parsed.modelVersion,
    dataVersion: parsed.dataVersion,
    ...(parsed.currentQuestionId === undefined ? {} : { currentQuestionId: parsed.currentQuestionId }),
    answers: Object.fromEntries(
      Object.entries(parsed.answers).map(([id, values]) => [id, [...values]]),
    ),
  })
  return {
    ok: true,
    payload,
    diagnostics: Object.freeze(versionDiagnostics(payload, model, classificationStateSource)),
  }
}

/**
 * Parses, migrates, repairs and resumes stored classification state. A failed result means the
 * caller should quarantine the raw value; a successful result is always complete or has an
 * interactive resume question.
 */
export function restoreQuestionnaire(input: unknown, model: ClassificationModel): RestoreResult {
  const migrated = migrateStoredClassification(input, model)
  if (!migrated.ok) return migrated

  const sourceFile = sourceFileFor(migrated.sourceVersion)
  const repaired = repairAnswers(
    model,
    migrated.payload.answers,
    migrated.payload.currentQuestionId,
    { sourceFile },
  )
  const diagnostics = [
    ...migrated.diagnostics,
    ...(migrated.sourceVersion === 'legacy-unversioned'
      ? []
      : versionDiagnostics(migrated.payload, model, sourceFile)),
    ...repaired.diagnostics,
  ].sort(compareDiagnostics)

  return deepFreeze({
    ok: true as const,
    sourceVersion: migrated.sourceVersion,
    answers: repaired.answers,
    resumeQuestionId: repaired.resumeQuestionId,
    complete: repaired.complete,
    ...(repaired.completedAnswers ? { completedAnswers: repaired.completedAnswers } : {}),
    diagnostics,
  })
}

/** Builds the version 1 payload for saving; the current model and data versions are stamped. */
export function serializeClassificationPayload(
  model: ClassificationModel,
  answers: FlowAnswers,
  currentQuestionId?: string,
): StoredClassificationPayload {
  const ordered: Record<string, readonly string[]> = {}
  for (const question of orderedQuestions(model)) {
    ordered[question.id] = [...(Object.hasOwn(answers, question.id) ? answers[question.id] ?? [] : [])]
  }
  return deepFreeze({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    modelVersion: model.modelVersion,
    dataVersion: model.dataVersion,
    ...(currentQuestionId === undefined ? {} : { currentQuestionId }),
    answers: ordered,
  })
}
