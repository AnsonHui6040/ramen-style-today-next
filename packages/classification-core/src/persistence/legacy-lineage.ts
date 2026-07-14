import { deepFreeze } from '../contracts/deep-freeze.js'
import type {
  CompiledQuestion,
  CompiledQuestionModel,
} from '../contracts/question-model.js'
import type { AnswerDraft } from '../flow/types.js'
import type {
  AppliedMigration,
  PersistenceDiagnostic,
} from './contracts.js'
import { decodeCurrentAnswerDraft } from './decode-answers.js'
import {
  boundedFieldPath,
  clonePlainData,
  decodeFailure,
  inspectOwnProperty,
  isArrayValue,
  isDecoderReflectionFailure,
  isPlainRecord,
  makePersistenceDiagnostic,
  ownEnumerableStringKeys,
  ownRequiredValue,
  ownValue,
  reflectionFailure,
  scanFailure,
  type DecodeFailure,
} from './decode-envelope.js'
import {
  appendJsonPointer,
  summarizeReceived,
} from './diagnostics.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { persistenceLimits } from './limits.js'

const verifiedLegacySourceId =
  'ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37' as const
const semanticHashPattern = /^[0-9a-f]{64}$/
const legacyFieldShapes = {
  form: 'single',
  archetype: 'single',
  tare: 'single',
  source: 'multiple',
  body: 'single',
  noodle: 'single',
  signature: 'multiple',
  exclusions: 'multiple',
} as const

type LegacyField = keyof typeof legacyFieldShapes
type LegacyMigration = Extract<AppliedMigration, { readonly kind: 'legacy-lineage' }>
const legacyFields = new Set<string>(Object.keys(legacyFieldShapes))

interface SuccessfulLegacyMigration {
  readonly ok: true
  readonly draft: AnswerDraft
  readonly migrations: readonly [LegacyMigration]
}

interface LegacyModelContext {
  readonly orderedFields: readonly LegacyField[]
  readonly optionRanks: ReadonlyMap<LegacyField, ReadonlyMap<string, number>>
  readonly selectionLimits: ReadonlyMap<LegacyField, number>
  readonly modelVersion: string
  readonly semanticHash: string
}

export type MigrateVerifiedLegacyAnswersResult =
  | SuccessfulLegacyMigration
  | DecodeFailure

function invalidModelArtifact(): never {
  throw new PersistenceInvariantError(
    'PERSISTENCE_MODEL_ARTIFACT_INVALID',
    'Current question model is invalid for verified legacy persistence migration',
  )
}

function migrationInvariant(): never {
  throw new PersistenceInvariantError(
    'PERSISTENCE_MIGRATION_INVARIANT',
    'Verified legacy persistence migration produced an invalid state',
  )
}

function isLegacyField(value: string): value is LegacyField {
  return legacyFields.has(value)
}

function deriveModelContext(model: CompiledQuestionModel): LegacyModelContext {
  try {
    const modelVersionSummary = summarizeReceived(model.metadata?.modelVersion)
    if (
      !model.metadata
        || typeof model.metadata !== 'object'
        || typeof model.metadata.modelVersion !== 'string'
        || modelVersionSummary?.kind !== 'string'
        || modelVersionSummary.codePointCount
          > persistenceLimits.maxModelVersionCodePoints
        || typeof model.metadata.semanticHash !== 'string'
        || !semanticHashPattern.test(model.metadata.semanticHash)
        || !Array.isArray(model.questions)
    ) return invalidModelArtifact()

    const modelQuestions = model.questions as readonly CompiledQuestion[]
    const questions = new Map(modelQuestions.map((question) => [question.id, question]))
    if (questions.size !== modelQuestions.length) return invalidModelArtifact()

    const orderedFields = modelQuestions
      .map(({ id }) => id)
      .filter(isLegacyField)
    if (orderedFields.length !== Object.keys(legacyFieldShapes).length) {
      return invalidModelArtifact()
    }

    const optionRanks = new Map<LegacyField, ReadonlyMap<string, number>>()
    const selectionLimits = new Map<LegacyField, number>()
    for (const field of orderedFields) {
      const question = questions.get(field)
      if (
        !question
          || !Array.isArray(question.options)
          || question.selection?.type !== legacyFieldShapes[field]
      ) return invalidModelArtifact()
      const ranks = new Map<string, number>()
      question.options.forEach((option, index) => {
        if (!option || typeof option.id !== 'string' || ranks.has(option.id)) {
          return invalidModelArtifact()
        }
        ranks.set(option.id, index)
      })
      optionRanks.set(field, ranks)
      selectionLimits.set(field, Math.min(
        persistenceLimits.maxSelectionsPerQuestion,
        question.options.length,
      ))
    }

    return {
      orderedFields,
      optionRanks,
      selectionLimits,
      modelVersion: model.metadata.modelVersion,
      semanticHash: model.metadata.semanticHash,
    }
  } catch (error) {
    if (error instanceof PersistenceInvariantError) throw error
    return invalidModelArtifact()
  }
}

function legacyPreflight(
  context: LegacyModelContext,
  input: unknown,
): DecodeFailure | undefined {
  try {
    if (!isPlainRecord(input)) return undefined
    const fields = ownEnumerableStringKeys(input)
    if (fields.length > context.orderedFields.length) return decodeFailure([
      makePersistenceDiagnostic(
        'schema-migration',
        'PERSISTENCE_RESOURCE_LIMIT',
        '',
        { kind: 'object', keyCount: fields.length },
      ),
    ])

    for (const field of fields) {
      const path = boundedFieldPath('', field)
      const property = inspectOwnProperty(input, field)
      if (property.kind === 'missing') return reflectionFailure('schema-migration')
      if (property.kind === 'accessor') return decodeFailure([
        makePersistenceDiagnostic(
          'schema-migration',
          'PERSISTENCE_ACCESSOR_FORBIDDEN',
          path,
        ),
      ])
      if (!isArrayValue(property.value)) continue

      const lengthValue = ownValue(property.value, 'length')
      const length = typeof lengthValue === 'number' ? lengthValue : 0
      const selectionLimit = context.selectionLimits.get(field as LegacyField)
        ?? persistenceLimits.maxSelectionsPerQuestion
      if (length > selectionLimit) return decodeFailure([
        makePersistenceDiagnostic(
          'schema-migration',
          'PERSISTENCE_RESOURCE_LIMIT',
          path,
          { kind: 'array', count: length },
        ),
      ])
    }
    return undefined
  } catch (error) {
    if (!isDecoderReflectionFailure(error)) throw error
    return reflectionFailure('schema-migration')
  }
}

function shapeDiagnostic(path: string, received: unknown): PersistenceDiagnostic {
  return makePersistenceDiagnostic(
    'schema-migration',
    'PERSISTENCE_LEGACY_FIELD_SHAPE_INVALID',
    path,
    summarizeReceived(received),
  )
}

function cloneLegacyInput(input: unknown):
  | { readonly ok: true; readonly snapshot: Record<string, unknown> }
  | DecodeFailure {
  try {
    if (!isPlainRecord(input)) return decodeFailure([
      shapeDiagnostic('', input),
    ])
    const cloned = clonePlainData(input)
    if (!isPlainRecord(cloned)) return migrationInvariant()
    return { ok: true, snapshot: cloned }
  } catch (error) {
    if (isDecoderReflectionFailure(error)) return reflectionFailure('schema-migration')
    return migrationInvariant()
  }
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function sortByCompiledOrder(
  values: readonly string[],
  ranks: ReadonlyMap<string, number>,
): readonly string[] {
  return [...values].sort((left, right) => (
    (ranks.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (ranks.get(right) ?? Number.MAX_SAFE_INTEGER)
      || compareStrings(left, right)
  ))
}

function expandLegacyExclusions(
  values: readonly string[],
): readonly string[] | DecodeFailure {
  const mapped: string[] = []
  const sources = new Map<string, { readonly expanded: boolean }>()
  for (const value of values) {
    const replacements = value === 'seafood'
      ? ['fish-seafood', 'shellfish', 'shrimp-crab']
      : [value]
    for (const replacement of replacements) {
      const previous = sources.get(replacement)
      if (previous && (previous.expanded || value === 'seafood')) return decodeFailure([
        makePersistenceDiagnostic(
          'schema-migration',
          'PERSISTENCE_LEGACY_EXPANSION_CONFLICT',
          '/exclusions',
        ),
      ])
      sources.set(replacement, { expanded: value === 'seafood' })
      mapped.push(replacement)
    }
  }
  return mapped
}

function isDecodeFailure(
  value: readonly string[] | DecodeFailure,
): value is DecodeFailure {
  return !Array.isArray(value)
}

export function migrateVerifiedLegacyAnswers(
  model: CompiledQuestionModel,
  input: unknown,
): MigrateVerifiedLegacyAnswersResult {
  const context = deriveModelContext(model)
  const preflight = legacyPreflight(context, input)
  if (preflight) return preflight
  const scanned = scanFailure(input, 'schema-migration')
  if (scanned) return scanned
  const cloned = cloneLegacyInput(input)
  if (!cloned.ok) return cloned
  const snapshot = cloned.snapshot

  const fields = ownEnumerableStringKeys(snapshot)
  const fieldSet = new Set(fields)
  const diagnostics: PersistenceDiagnostic[] = []
  for (const field of fields) {
    if (!isLegacyField(field)) diagnostics.push(makePersistenceDiagnostic(
      'schema-migration',
      'PERSISTENCE_UNKNOWN_FIELD',
      boundedFieldPath('', field),
    ))
  }

  const mappedDraft: Record<string, readonly string[]> = {}
  for (const field of context.orderedFields) {
    if (!fieldSet.has(field)) continue
    const value = ownRequiredValue(snapshot, field)
    const path = appendJsonPointer('', field)
    if (legacyFieldShapes[field] === 'single') {
      if (typeof value !== 'string') {
        diagnostics.push(shapeDiagnostic(path, value))
        continue
      }
      mappedDraft[field] = [value]
      continue
    }

    if (!isArrayValue(value)) {
      diagnostics.push(shapeDiagnostic(path, value))
      continue
    }
    const lengthValue = ownValue(value, 'length')
    const length = typeof lengthValue === 'number' ? lengthValue : 0
    if ((field === 'source' || field === 'signature') && length === 0) continue
    if (field === 'exclusions' && length === 0) {
      diagnostics.push(makePersistenceDiagnostic(
        'schema-migration',
        'PERSISTENCE_LEGACY_EMPTY_SELECTION_INVALID',
        path,
        { kind: 'array', count: 0 },
      ))
      continue
    }

    const selections: string[] = []
    for (let index = 0; index < length; index += 1) {
      const property = inspectOwnProperty(value, String(index))
      const selection = property.kind === 'data' ? property.value : undefined
      if (typeof selection !== 'string') {
        diagnostics.push(shapeDiagnostic(appendJsonPointer(path, index), selection))
      } else {
        selections.push(selection)
      }
    }
    if (selections.length !== length) continue

    let mappedSelections: readonly string[] = selections
    if (field === 'exclusions') {
      const expanded = expandLegacyExclusions(selections)
      if (isDecodeFailure(expanded)) return expanded
      mappedSelections = expanded
    }
    mappedDraft[field] = sortByCompiledOrder(
      mappedSelections,
      context.optionRanks.get(field) ?? new Map(),
    )
  }

  if (diagnostics.length > 0) return decodeFailure(diagnostics)
  const decoded = decodeCurrentAnswerDraft(model, mappedDraft)
  if (!decoded.ok) return decoded

  const success: SuccessfulLegacyMigration = {
    ok: true,
    draft: decoded.draft,
    migrations: [{
      kind: 'legacy-lineage',
      fromSourceId: verifiedLegacySourceId,
      toSchemaVersion: 1,
      toQuestionModelVersion: context.modelVersion,
      toQuestionSemanticHash: context.semanticHash,
    }],
  }
  return deepFreeze(success) as SuccessfulLegacyMigration
}
