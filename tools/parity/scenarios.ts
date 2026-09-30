import { createHash } from 'node:crypto'

import type { ParityAnswers, ParityEngine } from './engine.js'

export type ParitySection = readonly unknown[]
export type ParityTables = Record<string, ParitySection>

const forms = [undefined, 'soup', 'tsukemen', 'dry'] as const
const archetypes = [
  undefined,
  'chintan',
  'paitan',
  'konbusui-light',
  'gyokai-rich',
  'miso-rich',
  'tsukemen-other',
  'aburasoba',
  'taiwan-mazesoba',
  'soupless-tantan',
  'dry-other',
] as const
const validPairs = [
  ['soup', 'chintan'],
  ['soup', 'paitan'],
  ['tsukemen', 'konbusui-light'],
  ['tsukemen', 'gyokai-rich'],
  ['tsukemen', 'miso-rich'],
  ['tsukemen', 'tsukemen-other'],
  ['dry', 'aburasoba'],
  ['dry', 'taiwan-mazesoba'],
  ['dry', 'soupless-tantan'],
  ['dry', 'dry-other'],
] as const

export function emptyAnswers(): ParityAnswers {
  return { source: [], signature: [], exclusions: ['none'] }
}

function withPair(form?: string, archetype?: string): ParityAnswers {
  return { ...emptyAnswers(), form, archetype }
}

function subsets(values: readonly string[], maxSize: number) {
  const result: string[][] = [[]]
  for (const value of values) {
    for (const existing of [...result]) {
      if (existing.length < maxSize) result.push([...existing, value])
    }
  }
  return result
}

/** Fills every question with its first offered option, following forced answers. */
function fullAnswers(engine: ParityEngine, form: string, archetype: string): ParityAnswers {
  let answers = withPair(form, archetype)
  for (const question of engine.questions()) {
    if (question.id === 'form' || question.id === 'archetype') continue
    const offered = engine.options(question.id, answers)
    if (offered[0] !== undefined) answers = engine.select(question.id, answers, offered[0])
  }
  return answers
}

export function buildTables(engine: ParityEngine): ParityTables {
  const questions = engine.questions()
  const tables: ParityTables & Record<string, unknown[]> = {}

  tables.questions = questions.map((question) => ({ ...question }))

  // Resolved options for every question under every form/archetype combination.
  tables.options = forms.flatMap((form) => archetypes.flatMap((archetype) => (
    questions.map((question) => [
      form ?? null,
      archetype ?? null,
      question.id,
      engine.options(question.id, withPair(form, archetype)),
    ])
  )))

  tables.forced = forms.flatMap((form) => archetypes.flatMap((archetype) => (
    questions.map((question) => [
      form ?? null,
      archetype ?? null,
      question.id,
      engine.forced(question.id, withPair(form, archetype)) ?? null,
    ])
  )))

  // Navigation for every valid form/archetype: settle from each question, and step back.
  tables.navigation = validPairs.flatMap(([form, archetype]) => {
    const answers = fullAnswers(engine, form, archetype)
    return questions.map((question) => {
      const cleared = { ...withPair(form, archetype) }
      return [
        form,
        archetype,
        question.id,
        engine.settle(cleared, question.id),
        engine.settle(answers, question.id),
        engine.previous(cleared, question.id),
        engine.previous(answers, question.id),
      ]
    })
  })

  // Exhaustive selection transitions: every selection state × every offered click.
  tables.selection = validPairs.flatMap(([form, archetype]) => (
    questions.flatMap((question) => {
      if (question.id === 'form' || question.id === 'archetype') return []
      const base = withPair(form, archetype)
      const offered = engine.options(question.id, base)
      const states: string[][] = question.selectionType === 'single'
        ? [[], ...offered.map((value) => [value])]
        : subsets(offered, question.maxSelections + 1)
      return states.flatMap((state) => {
        const start = { ...base, ...stateAnswer(question.id, question.selectionType, state) }
        return offered.map((click) => [
          form,
          archetype,
          question.id,
          state,
          click,
          engine.select(question.id, start, click),
          engine.canContinue(start, question.id),
        ])
      })
    })
  ))

  // Choosing a form or archetype clears dependent answers; repeated choices change nothing.
  tables.reset = validPairs.flatMap(([form, archetype]) => {
    const answers = fullAnswers(engine, form, archetype)
    const formTargets = engine.options('form', answers)
    const archetypeTargets = archetypes.filter((value): value is NonNullable<typeof value> => !!value)
    return [
      ...formTargets.map((value) => ['form', form, archetype, value, engine.select('form', answers, value)]),
      ...archetypeTargets
        .filter((value) => engine.options('archetype', answers).includes(value))
        .map((value) => ['archetype', form, archetype, value, engine.select('archetype', answers, value)]),
    ]
  })

  // Completion: each question is validated independently against otherwise valid answers.
  tables.completion = validPairs.flatMap(([form, archetype]) => {
    const valid = fullAnswers(engine, form, archetype)
    const universeOf = (questionId: string) => [...new Set(
      forms.flatMap((f) => archetypes.flatMap((a) => engine.options(questionId, withPair(f, a)))),
    )].sort()
    const rows: unknown[] = [[form, archetype, 'valid', engine.complete(valid)]]
    for (const question of questions) {
      if (question.id === 'form' || question.id === 'archetype') continue
      // Own options plus one value that belongs to no question, so unknown values are covered.
      const values = [...universeOf(question.id), 'unknown-value']
      const candidates: string[][] = question.selectionType === 'single'
        ? [[], ...values.map((value) => [value])]
        : [...subsets(values, question.maxSelections + 1), [values[0]!, values[0]!]]
      for (const candidate of candidates) {
        rows.push([
          form,
          archetype,
          question.id,
          candidate,
          engine.complete({ ...valid, ...stateAnswer(question.id, question.selectionType, candidate) }),
        ])
      }
    }
    rows.push([form, archetype, 'no-form', engine.complete({ ...valid, form: undefined })])
    rows.push([form, archetype, 'no-archetype', engine.complete({ ...valid, archetype: undefined })])
    for (const [otherForm, otherArchetype] of validPairs) {
      rows.push([
        form,
        archetype,
        `pair:${otherForm}:${otherArchetype}`,
        engine.complete({ ...valid, form: otherForm, archetype: otherArchetype }),
      ])
    }
    return rows
  })

  return tables
}

function stateAnswer(questionId: string, selectionType: string, values: readonly string[]) {
  if (selectionType === 'single') return { [questionId]: values[0] }
  return { [questionId]: [...values] }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    )
  }
  return value
}

export interface SectionDigest {
  count: number
  sha256: string
}

export function digestTables(tables: ParityTables): Record<string, SectionDigest> {
  return Object.fromEntries(Object.entries(tables).map(([name, rows]) => [
    name,
    {
      count: rows.length,
      sha256: createHash('sha256').update(JSON.stringify(canonical(rows))).digest('hex'),
    },
  ]))
}

export function firstDifference(left: ParityTables, right: ParityTables) {
  for (const name of Object.keys(left)) {
    const a = left[name] ?? []
    const b = right[name] ?? []
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      if (JSON.stringify(canonical(a[index])) !== JSON.stringify(canonical(b[index]))) {
        return { section: name, index, expected: canonical(a[index]), received: canonical(b[index]) }
      }
    }
  }
  return undefined
}
