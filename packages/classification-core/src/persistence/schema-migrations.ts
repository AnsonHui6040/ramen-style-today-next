import { deepFreeze } from '../contracts/deep-freeze.js'
import type { AppliedMigration } from './contracts.js'
import {
  clonePlainData,
  decodeFailure,
  decodeMinimalEnvelope,
  isDecoderReflectionFailure,
  makePersistenceDiagnostic,
  reflectionFailure,
  type DecodeFailure,
} from './decode-envelope.js'
import {
  decodeStoredPayloadV1Structure,
  type StructurallyDecodedPayloadV1,
} from './decode-v1.js'
import { summarizeReceived } from './diagnostics.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { scanPlainData } from './plain-data.js'

type AppliedSchemaMigration = Extract<AppliedMigration, { readonly kind: 'schema' }>

export type SchemaMigrationStepResult =
  | {
      readonly ok: true
      readonly payload: unknown
    }
  | {
      readonly ok: false
    }

export interface SchemaMigrationStep {
  readonly fromSchemaVersion: number
  readonly toSchemaVersion: number
  readonly migrate: (
    payload: Readonly<Record<string, unknown>>,
  ) => SchemaMigrationStepResult
}

export interface SchemaMigrationRegistry {
  readonly currentSchemaVersion: number
  readonly migrations: readonly SchemaMigrationStep[]
}

export type MigrateSchemaToCurrentResult =
  | {
      readonly ok: true
      readonly payload: StructurallyDecodedPayloadV1
      readonly migrations: readonly AppliedSchemaMigration[]
    }
  | DecodeFailure

export const schemaMigrationRegistry: SchemaMigrationRegistry = deepFreeze({
  currentSchemaVersion: 1,
  migrations: [],
})

interface ValidatedSchemaMigrationRegistry {
  readonly currentSchemaVersion: 1
  readonly migrationsBySource: ReadonlyMap<number, SchemaMigrationStep>
}

function migrationInvariant(): never {
  throw new PersistenceInvariantError(
    'PERSISTENCE_MIGRATION_INVARIANT',
    'Persistence schema migration registry produced an invalid state',
  )
}

function isSchemaVersion(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
}

function validateRegistry(
  registry: SchemaMigrationRegistry,
): ValidatedSchemaMigrationRegistry {
  try {
    const currentSchemaVersion = registry.currentSchemaVersion
    const migrations = registry.migrations
    if (currentSchemaVersion !== 1) return migrationInvariant()
    if (!Array.isArray(migrations)) return migrationInvariant()

    const bySource = new Map<number, SchemaMigrationStep>()
    for (const step of migrations) {
      const fromSchemaVersion = step?.fromSchemaVersion
      const toSchemaVersion = step?.toSchemaVersion
      const migrate = step?.migrate
      if (
        !step
          || typeof step !== 'object'
          || !isSchemaVersion(fromSchemaVersion)
          || !isSchemaVersion(toSchemaVersion)
          || fromSchemaVersion >= currentSchemaVersion
          || toSchemaVersion !== fromSchemaVersion + 1
          || typeof migrate !== 'function'
          || bySource.has(fromSchemaVersion)
      ) return migrationInvariant()
      bySource.set(fromSchemaVersion, {
        fromSchemaVersion,
        toSchemaVersion,
        migrate,
      })
    }

    for (const sourceVersion of bySource.keys()) {
      const visited = new Set<number>()
      let version = sourceVersion
      while (version !== currentSchemaVersion) {
        if (visited.has(version)) return migrationInvariant()
        visited.add(version)
        const step = bySource.get(version)
        if (!step) return migrationInvariant()
        version = step.toSchemaVersion
      }
    }
    return { currentSchemaVersion, migrationsBySource: bySource }
  } catch (error) {
    if (error instanceof PersistenceInvariantError) throw error
    return migrationInvariant()
  }
}

function cloneExternalRecord(input: unknown):
  | { readonly ok: true; readonly record: Record<string, unknown> }
  | DecodeFailure {
  try {
    const cloned = clonePlainData(input)
    if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned)) {
      return reflectionFailure('schema-migration')
    }
    return { ok: true, record: cloned as Record<string, unknown> }
  } catch (error) {
    if (!isDecoderReflectionFailure(error)) throw error
    return reflectionFailure('schema-migration')
  }
}

function cloneTrusted<T>(input: T): T {
  try {
    if (!scanPlainData(input).ok) return migrationInvariant()
    return clonePlainData(input) as T
  } catch {
    return migrationInvariant()
  }
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length
    && expected.every((key) => keys.includes(key))
}

function migrationFailed(): DecodeFailure {
  return decodeFailure([
    makePersistenceDiagnostic(
      'schema-migration',
      'PERSISTENCE_MIGRATION_FAILED',
      '',
    ),
  ])
}

function unsupportedSchema(schemaVersion: number): DecodeFailure {
  return decodeFailure([
    makePersistenceDiagnostic(
      'schema-migration',
      'PERSISTENCE_SCHEMA_VERSION_UNSUPPORTED',
      '/schemaVersion',
      summarizeReceived(schemaVersion),
    ),
  ])
}

export function migrateSchemaToCurrent(
  registry: SchemaMigrationRegistry,
  input: unknown,
): MigrateSchemaToCurrentResult {
  const validatedRegistry = validateRegistry(registry)
  const migrationsBySource = validatedRegistry.migrationsBySource
  const minimal = decodeMinimalEnvelope(input)
  if (!minimal.ok) return minimal

  const schemaVersion = minimal.envelope.schemaVersion
  if (!isSchemaVersion(schemaVersion)) return migrationInvariant()
  if (schemaVersion === validatedRegistry.currentSchemaVersion) {
    const current = decodeStoredPayloadV1Structure(input)
    if (!current.ok) return current
    return deepFreeze({ ok: true, payload: current.payload, migrations: [] })
  }

  if (!migrationsBySource.has(schemaVersion)) return unsupportedSchema(schemaVersion)
  const cloned = cloneExternalRecord(input)
  if (!cloned.ok) return cloned

  let working = deepFreeze(cloned.record) as Readonly<Record<string, unknown>>
  let workingVersion = schemaVersion
  const evidence: AppliedSchemaMigration[] = []
  while (workingVersion !== validatedRegistry.currentSchemaVersion) {
    const step = migrationsBySource.get(workingVersion)
    if (!step) return migrationInvariant()

    let stepResult: SchemaMigrationStepResult
    try {
      stepResult = cloneTrusted(step.migrate(working))
    } catch {
      return migrationInvariant()
    }
    if (
      !stepResult
        || typeof stepResult !== 'object'
        || typeof stepResult.ok !== 'boolean'
    ) return migrationInvariant()
    if (!stepResult.ok) {
      if (!hasExactKeys(stepResult, ['ok'])) return migrationInvariant()
      return migrationFailed()
    }
    if (!hasExactKeys(stepResult, ['ok', 'payload'])) return migrationInvariant()

    const nextPayload = cloneTrusted(stepResult.payload)
    if (
      nextPayload === null
        || typeof nextPayload !== 'object'
        || Array.isArray(nextPayload)
    ) return migrationInvariant()
    const nextRecord = nextPayload as Record<string, unknown>
    if (nextRecord.schemaVersion !== step.toSchemaVersion) return migrationInvariant()

    evidence.push({
      kind: 'schema',
      fromSchemaVersion: step.fromSchemaVersion,
      toSchemaVersion: step.toSchemaVersion,
    })
    working = deepFreeze(nextRecord)
    workingVersion = step.toSchemaVersion
  }

  const current = decodeStoredPayloadV1Structure(working)
  if (!current.ok) return migrationInvariant()
  return deepFreeze({
    ok: true,
    payload: current.payload,
    migrations: evidence,
  })
}
