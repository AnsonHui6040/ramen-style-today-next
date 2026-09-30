import { DiagnosticCollector } from '../compiler/collector.js'
import type { ClassificationModel } from '../contracts/model.js'
import {
  classificationStateSource,
  CURRENT_SCHEMA_VERSION,
  legacyStateSource,
  type MigrationResult,
  type SourceVersion,
  type StoredClassificationPayload,
} from './contracts.js'
import { deepFreeze, isPlainObject } from './freeze.js'
import { legacyUnversionedToV1 } from './legacy.js'
import { parseStoredPayloadV1 } from './payload-schema.js'

interface MigrationStep {
  readonly from: SourceVersion
  readonly to: number
  readonly migrate: (
    input: Readonly<Record<string, unknown>>,
    model: ClassificationModel,
    collector: DiagnosticCollector,
  ) => StoredClassificationPayload
}

/** Ordered registry; a future v1ToV2 is appended here without changing version detection. */
const migrationSteps: readonly MigrationStep[] = [
  { from: 'legacy-unversioned', to: 1, migrate: legacyUnversionedToV1 },
]

export function sourceFileFor(sourceVersion: SourceVersion) {
  return sourceVersion === 'legacy-unversioned' ? legacyStateSource : classificationStateSource
}

/**
 * Detects the payload version and migrates it to the current schema. Unsupported future
 * versions and invalid input fail without any repair; the caller keeps the raw value.
 */
export function migrateStoredClassification(
  input: unknown,
  model: ClassificationModel,
): MigrationResult {
  const collector = new DiagnosticCollector()
  const fail = (): MigrationResult => ({ ok: false, diagnostics: collector.toArray() })

  if (!isPlainObject(input)) {
    collector.error({
      code: 'MIGRATION_INPUT_INVALID',
      sourceFile: legacyStateSource,
      path: '',
      message: 'Stored state must be a JSON object',
    })
    return fail()
  }

  if (!Object.hasOwn(input, 'schemaVersion')) {
    const step = migrationSteps.find((candidate) => candidate.from === 'legacy-unversioned')!
    const payload = step.migrate(input, model, collector)
    return {
      ok: true,
      sourceVersion: 'legacy-unversioned',
      payload,
      diagnostics: collector.toArray(),
    }
  }

  const version = input.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    collector.error({
      code: 'MIGRATION_INPUT_INVALID',
      sourceFile: classificationStateSource,
      path: '/schemaVersion',
      message: 'schemaVersion must be a positive integer',
      received: version,
    })
    return fail()
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    collector.error({
      code: 'MIGRATION_UNHANDLED_VERSION',
      sourceFile: classificationStateSource,
      path: '/schemaVersion',
      message: `Stored schemaVersion ${version} is newer than the supported version ${CURRENT_SCHEMA_VERSION}`,
      expected: CURRENT_SCHEMA_VERSION,
      received: version,
    })
    return fail()
  }

  const parsed = parseStoredPayloadV1(input, classificationStateSource, collector)
  if (!parsed) return fail()
  const payload = deepFreeze({
    schemaVersion: 1 as const,
    modelVersion: parsed.modelVersion,
    dataVersion: parsed.dataVersion,
    ...(parsed.currentQuestionId === undefined ? {} : { currentQuestionId: parsed.currentQuestionId }),
    answers: Object.fromEntries(
      Object.entries(parsed.answers).map(([id, values]) => [id, [...values]]),
    ),
  })
  return { ok: true, sourceVersion: version, payload, diagnostics: collector.toArray() }
}
