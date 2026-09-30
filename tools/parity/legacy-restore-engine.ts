import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

import type { ParityAnswers } from './engine.js'

export type LegacyPhase = 'intro' | 'questions' | 'results'

export interface LegacyState {
  phase: LegacyPhase
  stepIndex: number
  locale: string
  answers: ParityAnswers
}

export interface LegacyQuestionMeta {
  id: string
  minSelections: number
  maxSelections: number
}

/** The frozen legacy persistence behavior, used as the parity oracle. */
export interface LegacyRestoreOracle {
  questions: LegacyQuestionMeta[]
  /** Frozen `readStoredState` run against a storage stub that returns `raw`. */
  restore(raw: string | null): LegacyState
  /** Frozen `restoreUserAnswers`. */
  restoreAnswers(value: unknown): ParityAnswers
  /** Frozen `toCompletedAnswers`, `null` when the answers cannot be completed. */
  completable(answers: ParityAnswers): boolean
  /** Frozen `resolveQuestionOptions` values. */
  offered(questionId: string, answers: ParityAnswers): string[]
  /** Frozen `getForcedQuestionValue` for a step index. */
  forcedAt(stepIndex: number, answers: ParityAnswers): string | undefined
}

const extractedNames = [
  'getStorage',
  'isLocale',
  'isStoredState',
  'getStoredStepIndex',
  'createInitialAnswers',
  'readStoredState',
  'resetPreferenceAnswers',
  'writeForcedQuestionValue',
  'getForcedQuestionValue',
  'applyForcedAnswersFromStep',
] as const

/**
 * Loads the legacy restore path. Top-level helpers are extracted verbatim from the frozen
 * `src/App.tsx` with the TypeScript compiler API, so no legacy behavior is transcribed.
 */
export async function loadLegacyRestoreOracle(legacyRoot: string): Promise<LegacyRestoreOracle> {
  const root = resolve(legacyRoot)
  const appSource = readFileSync(join(root, 'src/App.tsx'), 'utf8')
  const file = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const pieces: string[] = []
  const storageKey = file.statements.find((statement) => (
    ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => (
      ts.isIdentifier(declaration.name) && declaration.name.text === 'STORAGE_KEY'
    ))
  ))
  if (!storageKey) throw new Error('legacy App.tsx no longer defines STORAGE_KEY')
  pieces.push(storageKey.getText(file))
  for (const name of extractedNames) {
    const node = file.statements.find((statement) => (
      ts.isFunctionDeclaration(statement) && statement.name?.text === name
    ))
    if (!node) throw new Error(`legacy App.tsx no longer defines ${name}`)
    pieces.push(node.getText(file).replace(/^function /, 'export function '))
  }
  const url = (path: string) => JSON.stringify(pathToFileURL(join(root, path)).href)
  const module = [
    `import { questionBank, resolveQuestionOptions } from ${url('src/config/questions.ts')}`,
    `import { restoreUserAnswers, toCompletedAnswers } from ${url('src/domain/schema.ts')}`,
    `import { locales } from ${url('src/i18n.ts')}`,
    'export { questionBank, resolveQuestionOptions, restoreUserAnswers, toCompletedAnswers }',
    ...pieces,
  ].join('\n\n')
  const directory = mkdtempSync(join(tmpdir(), 'legacy-restore-oracle-'))
  const modulePath = join(directory, 'oracle.ts')
  writeFileSync(modulePath, module)
  const oracle = await import(pathToFileURL(modulePath).href)
  const { questionBank, resolveQuestionOptions } = oracle
  type Question = (typeof questionBank)[number]
  const indexOf = (questionId: string) => questionBank.findIndex((question: Question) => question.id === questionId)

  return {
    questions: questionBank.map((question: Question) => ({
      id: question.id,
      minSelections: question.minSelections,
      maxSelections: question.maxSelections,
    })),
    restore(raw) {
      const target = globalThis as unknown as { window?: unknown }
      const previous = target.window
      target.window = { localStorage: { getItem: () => raw } }
      try {
        return oracle.readStoredState() as LegacyState
      } finally {
        if (previous === undefined) delete target.window
        else target.window = previous
      }
    },
    restoreAnswers: (value) => oracle.restoreUserAnswers(value) as ParityAnswers,
    completable: (answers) => oracle.toCompletedAnswers(answers) !== null,
    offered: (questionId, answers) => (
      resolveQuestionOptions(questionBank[indexOf(questionId)], answers.form, answers.archetype)
        .map((option: { value: string }) => option.value)
    ),
    forcedAt: (stepIndex, answers) => oracle.getForcedQuestionValue(stepIndex, answers),
  }
}
