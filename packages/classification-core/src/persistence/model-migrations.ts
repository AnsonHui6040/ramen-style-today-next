import { deepFreeze } from '../contracts/deep-freeze.js'
import { questionModel } from '../generated/question-model.js'
import type { AppliedMigration } from './contracts.js'
import {
  clonePlainData,
  decodeFailure,
  makePersistenceDiagnostic,
  type DecodeFailure,
} from './decode-envelope.js'
import {
  decodeStoredPayloadV1Structure,
  type StructurallyDecodedPayloadV1,
} from './decode-v1.js'
import { summarizeReceived } from './diagnostics.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { persistenceLimits } from './limits.js'
import { scanPlainData } from './plain-data.js'

type AppliedQuestionModelMigration = Extract<
  AppliedMigration,
  { readonly kind: 'question-model' }
>

export interface QuestionModelIdentity {
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
}

export type QuestionModelMigrationStepResult =
  | {
      readonly ok: true
      readonly submittedAnswers: unknown
    }
  | {
      readonly ok: false
    }

export interface QuestionModelMigrationStep {
  readonly from: QuestionModelIdentity
  readonly to: QuestionModelIdentity
  readonly migrateSubmittedAnswers: (
    submittedAnswers: unknown,
  ) => QuestionModelMigrationStepResult
}

export interface QuestionModelMigrationRegistry {
  readonly current: QuestionModelIdentity
  readonly migrations: readonly QuestionModelMigrationStep[]
}

export type MigrateQuestionModelToCurrentResult =
  | {
      readonly ok: true
      readonly payload: StructurallyDecodedPayloadV1
      readonly migrations: readonly AppliedQuestionModelMigration[]
    }
  | DecodeFailure

export const questionModelMigrationRegistry: QuestionModelMigrationRegistry = deepFreeze({
  current: {
    questionModelVersion: questionModel.metadata.modelVersion,
    questionSemanticHash: questionModel.metadata.semanticHash,
  },
  migrations: [],
})

interface ValidatedQuestionModelMigrationRegistry {
  readonly current: QuestionModelIdentity
  readonly migrationsBySource: ReadonlyMap<string, QuestionModelMigrationStep>
}

const semanticHashPattern = /^[0-9a-f]{64}$/

function migrationInvariant(): never {
  throw new PersistenceInvariantError(
    'PERSISTENCE_MIGRATION_INVARIANT',
    'Persistence question-model migration registry produced an invalid state',
  )
}

function identityKey(identity: QuestionModelIdentity): string {
  return `${identity.questionModelVersion}\u0000${identity.questionSemanticHash}`
}

function isValidIdentity(identity: unknown): identity is QuestionModelIdentity {
  if (!identity || typeof identity !== 'object') return false
  const candidate = identity as Partial<QuestionModelIdentity>
  const versionSummary = summarizeReceived(candidate.questionModelVersion)
  return typeof candidate.questionModelVersion === 'string'
    && versionSummary?.kind === 'string'
    && versionSummary.codePointCount <= persistenceLimits.maxModelVersionCodePoints
    && typeof candidate.questionSemanticHash === 'string'
    && semanticHashPattern.test(candidate.questionSemanticHash)
}

function sameIdentity(left: QuestionModelIdentity, right: QuestionModelIdentity): boolean {
  return left.questionModelVersion === right.questionModelVersion
    && left.questionSemanticHash === right.questionSemanticHash
}

function validateRegistry(
  registry: QuestionModelMigrationRegistry,
): ValidatedQuestionModelMigrationRegistry {
  try {
    const currentInput: unknown = registry.current
    const migrations = registry.migrations
    if (!isValidIdentity(currentInput)) return migrationInvariant()
    const current: QuestionModelIdentity = {
      questionModelVersion: currentInput.questionModelVersion,
      questionSemanticHash: currentInput.questionSemanticHash,
    }
    if (
      current.questionModelVersion !== questionModel.metadata.modelVersion
        || current.questionSemanticHash !== questionModel.metadata.semanticHash
        || !Array.isArray(migrations)
    ) return migrationInvariant()

    const bySource = new Map<string, QuestionModelMigrationStep>()
    for (const step of migrations) {
      const from = step?.from && {
        questionModelVersion: step.from.questionModelVersion,
        questionSemanticHash: step.from.questionSemanticHash,
      }
      const to = step?.to && {
        questionModelVersion: step.to.questionModelVersion,
        questionSemanticHash: step.to.questionSemanticHash,
      }
      const migrateSubmittedAnswers = step?.migrateSubmittedAnswers
      if (
        !step
          || typeof step !== 'object'
          || !isValidIdentity(from)
          || !isValidIdentity(to)
          || sameIdentity(from, to)
          || from.questionModelVersion === current.questionModelVersion
          || typeof migrateSubmittedAnswers !== 'function'
      ) return migrationInvariant()
      const key = identityKey(from)
      if (bySource.has(key)) return migrationInvariant()
      bySource.set(key, { from, to, migrateSubmittedAnswers })
    }

    const currentKey = identityKey(current)
    for (const sourceKey of bySource.keys()) {
      const visited = new Set<string>()
      let key = sourceKey
      while (key !== currentKey) {
        if (visited.has(key)) return migrationInvariant()
        visited.add(key)
        const step = bySource.get(key)
        if (!step) return migrationInvariant()
        key = identityKey(step.to)
      }
    }
    return { current, migrationsBySource: bySource }
  } catch (error) {
    if (error instanceof PersistenceInvariantError) throw error
    return migrationInvariant()
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

function modelDiagnostic(
  code:
    | 'PERSISTENCE_QUESTION_MODEL_INTEGRITY'
    | 'PERSISTENCE_QUESTION_MODEL_UNSUPPORTED'
    | 'PERSISTENCE_MIGRATION_FAILED',
  path: string,
): DecodeFailure {
  return decodeFailure([
    makePersistenceDiagnostic(
      code === 'PERSISTENCE_MIGRATION_FAILED'
        ? 'model-migration'
        : 'model-compatibility',
      code,
      path,
    ),
  ])
}

export function migrateQuestionModelToCurrent(
  registry: QuestionModelMigrationRegistry,
  input: unknown,
): MigrateQuestionModelToCurrentResult {
  const validatedRegistry = validateRegistry(registry)
  const migrationsBySource = validatedRegistry.migrationsBySource
  const decoded = decodeStoredPayloadV1Structure(input)
  if (!decoded.ok) return decoded

  let working = decoded.payload
  const inputIdentity: QuestionModelIdentity = {
    questionModelVersion: working.questionModelVersion,
    questionSemanticHash: working.questionSemanticHash,
  }
  if (sameIdentity(inputIdentity, validatedRegistry.current)) {
    return deepFreeze({ ok: true, payload: working, migrations: [] })
  }
  if (
    inputIdentity.questionModelVersion
      === validatedRegistry.current.questionModelVersion
  ) {
    return modelDiagnostic(
      'PERSISTENCE_QUESTION_MODEL_INTEGRITY',
      '/questionSemanticHash',
    )
  }
  if (!migrationsBySource.has(identityKey(inputIdentity))) {
    return modelDiagnostic(
      'PERSISTENCE_QUESTION_MODEL_UNSUPPORTED',
      '/questionModelVersion',
    )
  }

  const evidence: AppliedQuestionModelMigration[] = []
  let workingIdentity = inputIdentity
  while (!sameIdentity(workingIdentity, validatedRegistry.current)) {
    const step = migrationsBySource.get(identityKey(workingIdentity))
    if (!step) return migrationInvariant()

    let stepResult: QuestionModelMigrationStepResult
    try {
      stepResult = cloneTrusted(
        step.migrateSubmittedAnswers(cloneTrusted(working.submittedAnswers)),
      )
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
      return modelDiagnostic('PERSISTENCE_MIGRATION_FAILED', '/submittedAnswers')
    }
    if (!hasExactKeys(stepResult, ['ok', 'submittedAnswers'])) {
      return migrationInvariant()
    }

    const submittedAnswers = cloneTrusted(stepResult.submittedAnswers)
    evidence.push({
      kind: 'question-model',
      fromQuestionModelVersion: step.from.questionModelVersion,
      fromQuestionSemanticHash: step.from.questionSemanticHash,
      toQuestionModelVersion: step.to.questionModelVersion,
      toQuestionSemanticHash: step.to.questionSemanticHash,
    })
    working = deepFreeze({
      schemaVersion: 1,
      questionModelVersion: step.to.questionModelVersion,
      questionSemanticHash: step.to.questionSemanticHash,
      ...(working.cursorQuestionId === undefined
        ? {}
        : { cursorQuestionId: working.cursorQuestionId }),
      submittedAnswers,
    })
    workingIdentity = step.to
  }

  return deepFreeze({ ok: true, payload: working, migrations: evidence })
}
