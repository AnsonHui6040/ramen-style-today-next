import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

import type { ParityAnswers, ParityEngine, ParityPosition } from './engine.js'

const extractedFunctions = [
  'getSelectedValues',
  'resetPreferenceAnswers',
  'writeForcedQuestionValue',
  'getForcedQuestionValue',
  'applyForcedAnswersFromStep',
  'getPreviousInteractiveStep',
] as const

/**
 * Loads the frozen legacy questionnaire logic so it can act as the parity oracle.
 * Top-level App.tsx helpers are extracted from the legacy source text verbatim; the state
 * handlers that live inside the React component are transcribed below with line references.
 */
export async function loadLegacyEngine(legacyRoot: string): Promise<ParityEngine> {
  const root = resolve(legacyRoot)
  const appSource = readFileSync(join(root, 'src/App.tsx'), 'utf8')
  const file = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const pieces: string[] = []
  for (const name of extractedFunctions) {
    const node = file.statements.find((statement) => (
      ts.isFunctionDeclaration(statement) && statement.name?.text === name
    ))
    if (!node) throw new Error(`legacy App.tsx no longer defines ${name}`)
    pieces.push(node.getText(file).replace(/^function /, 'export function '))
  }
  const config = pathToFileURL(join(root, 'src/config/questions.ts')).href
  const module = [
    `import { questionBank, resolveQuestionOptions } from ${JSON.stringify(config)}`,
    'export { questionBank, resolveQuestionOptions }',
    ...pieces,
  ].join('\n\n')
  const directory = mkdtempSync(join(tmpdir(), 'legacy-oracle-'))
  const modulePath = join(directory, 'oracle.ts')
  writeFileSync(modulePath, module)
  const schemaModule = await import(pathToFileURL(join(root, 'src/domain/schema.ts')).href)
  const oracle = await import(pathToFileURL(modulePath).href)
  const { questionBank, resolveQuestionOptions } = oracle
  type Question = (typeof questionBank)[number]
  const indexOf = (questionId: string) => questionBank.findIndex((question: Question) => question.id === questionId)
  const options = (questionId: string, answers: ParityAnswers): string[] => (
    resolveQuestionOptions(questionBank[indexOf(questionId)], answers.form, answers.archetype)
      .map((option: { value: string }) => option.value)
  )
  const clone = (answers: ParityAnswers): ParityAnswers => ({
    ...answers,
    source: [...answers.source],
    signature: [...answers.signature],
    exclusions: [...answers.exclusions],
  })

  // Transcribed from legacy src/App.tsx writeSingleValue (lines 401-436).
  const writeSingle = (questionId: string, previous: ParityAnswers, value: string): ParityAnswers => {
    const next = clone(previous)
    switch (questionId) {
      case 'form':
        if (previous.form === value) return previous
        return oracle.resetPreferenceAnswers({ ...next, form: value, archetype: undefined })
      case 'archetype':
        if (previous.archetype === value) return previous
        return oracle.resetPreferenceAnswers({ ...next, archetype: value })
      case 'tare':
        next.tare = value
        return next
      case 'body':
        next.body = value
        return next
      case 'noodle':
        next.noodle = value
        return next
      default:
        return previous
    }
  }

  // Transcribed from legacy src/App.tsx writeMultipleValue (lines 439-503).
  const writeMultiple = (questionId: string, previous: ParityAnswers, value: string): ParityAnswers => {
    const currentQuestion = questionBank[indexOf(questionId)]
    const questionOptions = resolveQuestionOptions(currentQuestion, previous.form, previous.archetype)
    const allowedValues = questionOptions.map((option: { value: string }) => option.value)
    const exclusiveValues = questionOptions
      .filter((option: { exclusive?: boolean }) => option.exclusive)
      .map((option: { value: string }) => option.value)
    const isExclusive = exclusiveValues.includes(value)
    const currentValues = (oracle.getSelectedValues(questionId, previous) as string[])
      .filter((candidate) => allowedValues.includes(candidate))
    if (isExclusive) return { ...previous, [questionId]: [value] }
    const withoutExclusive = currentValues.filter((candidate) => !exclusiveValues.includes(candidate))
    const nextValues = withoutExclusive.includes(value)
      ? withoutExclusive.filter((candidate) => candidate !== value)
      : withoutExclusive.length < currentQuestion.maxSelections
        ? [...withoutExclusive, value]
        : withoutExclusive
    if (questionId === 'exclusions') {
      return { ...previous, exclusions: nextValues.length ? nextValues : ['none'] }
    }
    return { ...previous, [questionId]: nextValues }
  }

  return {
    questions: () => questionBank.map((question: Question) => ({
      id: question.id,
      selectionType: question.selectionType,
      minSelections: question.minSelections,
      maxSelections: question.maxSelections,
    })),
    options,
    forced: (questionId, answers) => oracle.getForcedQuestionValue(indexOf(questionId), answers),
    select: (questionId, answers, value) => {
      const question = questionBank[indexOf(questionId)]
      return question.selectionType === 'single'
        ? writeSingle(questionId, answers, value)
        : writeMultiple(questionId, answers, value)
    },
    settle: (answers, questionId): ParityPosition => {
      const settled = oracle.applyForcedAnswersFromStep(answers, indexOf(questionId))
      return { questionId: questionBank[settled.stepIndex].id, answers: settled.answers }
    },
    previous: (answers, questionId) => (
      questionBank[oracle.getPreviousInteractiveStep(indexOf(questionId), answers)].id
    ),
    // Transcribed from legacy src/App.tsx canContinue (lines 396-399).
    canContinue: (answers, questionId) => {
      const question = questionBank[indexOf(questionId)]
      const offered = new Set(options(questionId, answers))
      const selected = (oracle.getSelectedValues(questionId, answers) as string[])
        .filter((value) => offered.has(value))
      return selected.length >= question.minSelections
        && (question.id !== 'archetype' || offered.size > 0)
    },
    complete: (answers) => schemaModule.toCompletedAnswers(answers) ?? null,
  }
}
