import { describe, expect, test } from 'vitest'
import { PersistenceInvariantError } from './invariant-error.js'
import {
  migrateSchemaToCurrent,
  schemaMigrationRegistry,
  type SchemaMigrationRegistry,
  type SchemaMigrationStep,
} from './schema-migrations.js'
import { currentV1 } from './test-fixtures.js'

function oldSchema(overrides: Readonly<Record<string, unknown>> = {}): unknown {
  return {
    schemaVersion: 0,
    questionModelVersion: 'old.1',
    questionSemanticHash: 'a'.repeat(64),
    answers: { oldForm: ['broth'] },
    ...overrides,
  }
}

function v0ToV1(
  migrate: SchemaMigrationStep['migrate'] = (payload) => ({
    ok: true,
    payload: {
      schemaVersion: 1,
      questionModelVersion: payload.questionModelVersion,
      questionSemanticHash: payload.questionSemanticHash,
      submittedAnswers: payload.answers,
    },
  }),
): SchemaMigrationStep {
  return {
    fromSchemaVersion: 0,
    toSchemaVersion: 1,
    migrate,
  }
}

function registry(
  migrations: readonly SchemaMigrationStep[],
  currentSchemaVersion = 1,
): SchemaMigrationRegistry {
  return { currentSchemaVersion, migrations }
}

function expectFailureCode(result: ReturnType<typeof migrateSchemaToCurrent>, code: string) {
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ code }),
  ]))
  expect(Object.isFrozen(result)).toBe(true)
}

describe('migrateSchemaToCurrent', () => {
  test('applies sequential schema migrations with schema-only evidence', () => {
    const result = migrateSchemaToCurrent(registry([v0ToV1()]), oldSchema())

    expect(result).toMatchObject({
      ok: true,
      payload: {
        schemaVersion: 1,
        questionModelVersion: 'old.1',
        questionSemanticHash: 'a'.repeat(64),
        submittedAnswers: { oldForm: ['broth'] },
      },
      migrations: [{
        kind: 'schema',
        fromSchemaVersion: 0,
        toSchemaVersion: 1,
      }],
    })
    if (!result.ok) return
    expect(result.migrations.every(({ kind }) => kind === 'schema')).toBe(true)
    expect(Object.isFrozen(result.payload.submittedAnswers)).toBe(true)
  })

  test('does not create fake evidence for the current V1 schema', () => {
    const result = migrateSchemaToCurrent(schemaMigrationRegistry, currentV1())

    expect(result).toMatchObject({ ok: true, migrations: [] })
  })

  test.each([2, 99])('returns unsupported for unknown schema %s', (schemaVersion) => {
    expectFailureCode(
      migrateSchemaToCurrent(schemaMigrationRegistry, currentV1({ schemaVersion })),
      'PERSISTENCE_SCHEMA_VERSION_UNSUPPORTED',
    )
  })

  test('returns migration failed for a registered explicit data rejection', () => {
    const rejecting = v0ToV1(() => ({ ok: false }))

    expectFailureCode(
      migrateSchemaToCurrent(registry([rejecting]), oldSchema()),
      'PERSISTENCE_MIGRATION_FAILED',
    )
  })

  test.each([
    ['duplicate source', registry([v0ToV1(), v0ToV1()])],
    ['skip', registry([{ ...v0ToV1(), toSchemaVersion: 2 }], 2)],
    ['gap', registry([v0ToV1()], 2)],
    ['cycle', registry([
      v0ToV1(),
      { fromSchemaVersion: 1, toSchemaVersion: 0, migrate: () => ({ ok: false }) },
    ], 2)],
  ])('throws a bounded invariant for a %s registry', (_name, invalidRegistry) => {
    expect(() => migrateSchemaToCurrent(invalidRegistry, oldSchema())).toThrow(
      PersistenceInvariantError,
    )
    try {
      migrateSchemaToCurrent(invalidRegistry, oldSchema())
    } catch (error) {
      expect(error).toMatchObject({ invariantCode: 'PERSISTENCE_MIGRATION_INVARIANT' })
      expect((error as Error).message).not.toContain('oldForm')
    }
  })

  test('rejects a trusted current schema without a matching structural decoder', () => {
    const invalidRegistry = registry([], 2)

    expect(() => migrateSchemaToCurrent(
      invalidRegistry,
      currentV1({ schemaVersion: 2 }),
    )).toThrow(PersistenceInvariantError)
    try {
      migrateSchemaToCurrent(invalidRegistry, currentV1({ schemaVersion: 2 }))
    } catch (error) {
      expect(error).toMatchObject({ invariantCode: 'PERSISTENCE_MIGRATION_INVARIANT' })
    }
  })

  test('turns migration exceptions and impossible outputs into bounded invariants', () => {
    const throwing = v0ToV1(() => {
      throw new Error('private migration payload')
    })
    const impossible = v0ToV1(() => ({
      ok: true,
      payload: { schemaVersion: 7 },
    }))

    for (const step of [throwing, impossible]) {
      expect(() => migrateSchemaToCurrent(registry([step]), oldSchema())).toThrow(
        PersistenceInvariantError,
      )
      try {
        migrateSchemaToCurrent(registry([step]), oldSchema())
      } catch (error) {
        expect(error).toMatchObject({ invariantCode: 'PERSISTENCE_MIGRATION_INVARIANT' })
        expect((error as Error).message).not.toContain('private migration payload')
      }
    }
  })

  test('does not disguise an impossible rejection shape as external data failure', () => {
    const malformed = v0ToV1(() => ({
      ok: false,
      privateReason: 'private migration payload',
    }) as unknown as ReturnType<SchemaMigrationStep['migrate']>)

    expect(() => migrateSchemaToCurrent(registry([malformed]), oldSchema())).toThrow(
      PersistenceInvariantError,
    )
  })

  test('does not mutate external input and returns deterministic frozen data', () => {
    const input = oldSchema() as Record<string, unknown>
    const migrationRegistry = registry([v0ToV1()])
    const first = migrateSchemaToCurrent(migrationRegistry, input)
    const second = migrateSchemaToCurrent(migrationRegistry, input)

    expect(first).toEqual(second)
    expect(input).toEqual(oldSchema())
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(first)).toBe(true)
  })
})
