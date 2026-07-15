import { createHash } from 'node:crypto'

import { z } from 'zod'

export const legacyPersistenceCaseIds = [
  'write-initial-shapes',
  'write-single-multiple-shapes',
  'write-forced-answer',
  'restore-seafood',
  'restore-empty-initial-arrays',
  'restore-exclusive-normalization',
] as const

const writeCaseIds = legacyPersistenceCaseIds.slice(0, 3) as [
  (typeof legacyPersistenceCaseIds)[0],
  (typeof legacyPersistenceCaseIds)[1],
  (typeof legacyPersistenceCaseIds)[2],
]

const restoreCaseIds = legacyPersistenceCaseIds.slice(3) as [
  (typeof legacyPersistenceCaseIds)[3],
  (typeof legacyPersistenceCaseIds)[4],
  (typeof legacyPersistenceCaseIds)[5],
]

export type LegacyPersistenceCaseId = (typeof legacyPersistenceCaseIds)[number]

export type LegacyPublicAction =
  | { readonly type: 'start' }
  | { readonly type: 'select'; readonly optionIndex: number }
  | { readonly type: 'continue' }

export type LegacyPersistenceObservation =
  | {
      readonly kind: 'legacy-write-observation'
      readonly actions: readonly LegacyPublicAction[]
      readonly observedAnswers: unknown
    }
  | {
      readonly kind: 'legacy-restore-observation'
      readonly legacyInput: unknown
      readonly observedLegacyOutput: unknown
    }

export type LegacyPersistenceObservationCase =
  | ({ readonly id: (typeof writeCaseIds)[number] } & Extract<
      LegacyPersistenceObservation,
      { readonly kind: 'legacy-write-observation' }
    >)
  | ({ readonly id: (typeof restoreCaseIds)[number] } & Extract<
      LegacyPersistenceObservation,
      { readonly kind: 'legacy-restore-observation' }
    >)

const legacyPublicActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('start'),
  }),
  z.strictObject({
    type: z.literal('select'),
    optionIndex: z.number().int().nonnegative().max(255),
  }),
  z.strictObject({
    type: z.literal('continue'),
  }),
])

const publicActionsSchema = z.array(legacyPublicActionSchema).min(1).max(128)
const jsonValueSchema = z.json()

const writeObservationShape = {
  kind: z.literal('legacy-write-observation'),
  actions: publicActionsSchema,
  observedAnswers: jsonValueSchema,
} as const

const restoreObservationShape = {
  kind: z.literal('legacy-restore-observation'),
  legacyInput: jsonValueSchema,
  observedLegacyOutput: jsonValueSchema,
} as const

function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>()
  const freeze = (current: unknown): void => {
    if (!current || typeof current !== 'object' || seen.has(current)) return
    seen.add(current)
    for (const child of Object.values(current)) freeze(child)
    Object.freeze(current)
  }
  freeze(value)
  return value
}

const observationSchema = z.discriminatedUnion('kind', [
  z.strictObject(writeObservationShape),
  z.strictObject(restoreObservationShape),
])

export const legacyPersistenceObservationSchema = observationSchema.transform(
  (value): LegacyPersistenceObservation => deepFreeze(value),
)

const observationCaseSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    id: z.enum(writeCaseIds),
    ...writeObservationShape,
  }),
  z.strictObject({
    id: z.enum(restoreCaseIds),
    ...restoreObservationShape,
  }),
])

export const legacyPersistenceObservationCaseSchema = observationCaseSchema.transform(
  (value): LegacyPersistenceObservationCase => deepFreeze(value),
)

const seedCaseSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    id: z.enum(writeCaseIds),
    kind: z.literal('legacy-write-observation'),
    actions: publicActionsSchema,
  }),
  z.strictObject({
    id: z.enum(restoreCaseIds),
    kind: z.literal('legacy-restore-observation'),
    legacyInput: jsonValueSchema,
  }),
])

export const legacyPersistenceSeedFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  cases: z.array(seedCaseSchema).length(legacyPersistenceCaseIds.length),
}).superRefine((seedFile, context) => {
  seedFile.cases.forEach((seedCase, index) => {
    if (seedCase.id !== legacyPersistenceCaseIds[index]) {
      context.addIssue({
        code: 'custom',
        path: ['cases', index, 'id'],
        message: 'seed cases must use the exact deterministic case order',
      })
    }
  })
}).transform((value) => deepFreeze(value))

export type LegacyPersistenceSeedFile = z.infer<typeof legacyPersistenceSeedFileSchema>
export type LegacyPersistenceSeedCase = LegacyPersistenceSeedFile['cases'][number]

export function parseLegacyPersistenceObservation(
  value: unknown,
): LegacyPersistenceObservation {
  return legacyPersistenceObservationSchema.parse(value)
}

export function parseLegacyPersistenceObservationCase(
  value: unknown,
): LegacyPersistenceObservationCase {
  return legacyPersistenceObservationCaseSchema.parse(value)
}

export function parseLegacyPersistenceSeedFile(
  value: unknown,
): LegacyPersistenceSeedFile {
  return legacyPersistenceSeedFileSchema.parse(value)
}

function compareCodePoints(left: string, right: string) {
  const leftIterator = left[Symbol.iterator]()
  const rightIterator = right[Symbol.iterator]()
  while (true) {
    const leftResult = leftIterator.next()
    const rightResult = rightIterator.next()
    if (leftResult.done || rightResult.done) {
      if (leftResult.done === rightResult.done) return 0
      return leftResult.done ? -1 : 1
    }
    const difference = leftResult.value.codePointAt(0)! - rightResult.value.codePointAt(0)!
    if (difference !== 0) return difference
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodePoints(left, right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    )
  }
  return value
}

export function canonicalizeLegacyPersistenceCases(
  cases: readonly LegacyPersistenceObservationCase[],
) {
  const parsedCases = z.array(observationCaseSchema).min(1).max(1024).parse(cases)
  return JSON.stringify(canonicalValue(parsedCases))
}

export function computeLegacyPersistenceCasesHash(
  cases: readonly LegacyPersistenceObservationCase[],
) {
  return createHash('sha256')
    .update('ramen-legacy-persistence-observations-v1\0')
    .update(canonicalizeLegacyPersistenceCases(cases))
    .digest('hex')
}
