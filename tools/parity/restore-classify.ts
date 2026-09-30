import type { LegacyRestoreOracle, LegacyState } from './legacy-restore-engine.js'
import type { ParityAnswers } from './engine.js'

// This module must never import the new persistence code: categories are decided from the
// frozen legacy behavior alone, so the new implementation cannot move a scenario between
// categories. A test asserts that no import from the classification core exists here.

/** Approved divergences BC-1 to BC-4 as a bit set; 0 means legacy parity is required. */
export const BC1 = 1
export const BC2 = 2
export const BC3 = 4
export const BC4 = 8

// Legacy dependency rule (`resetPreferenceAnswers`): the preference questions depend on the
// archetype, and the archetype depends on the form. `exclusions` depends on nothing.
const upstreamOf: Record<string, string | undefined> = {
  archetype: 'form',
  tare: 'archetype',
  source: 'archetype',
  body: 'archetype',
  noodle: 'archetype',
  signature: 'archetype',
}

function selected(answers: ParityAnswers, questionId: string): string[] {
  const value = (answers as unknown as Record<string, unknown>)[questionId]
  if (Array.isArray(value)) return value as string[]
  return typeof value === 'string' ? [value] : []
}

/** Legacy-side walk over the questions: first unsatisfied interactive question and unsettled forced ones. */
function walk(oracle: LegacyRestoreOracle, answers: ParityAnswers) {
  const unsettled: number[] = []
  let firstUnsatisfied: number | undefined
  for (const [index, question] of oracle.questions.entries()) {
    const offered = oracle.offered(question.id, answers)
    const satisfied = selected(answers, question.id).filter((value) => offered.includes(value)).length
      >= question.minSelections
    if (satisfied) continue
    if (oracle.forcedAt(index, answers) !== undefined) {
      unsettled.push(index)
      continue
    }
    firstUnsatisfied = index
    break
  }
  return { firstUnsatisfied, unsettled }
}

/** Labels the divergences a legacy final state implies; 0 means the state is healthy. */
export function classify(
  oracle: LegacyRestoreOracle,
  legacy: LegacyState,
): number {
  let labels = 0
  const { answers } = legacy
  const last = oracle.questions.length - 1

  // BC-1: stale, unknown, not-offered, over-limit or upstream-less answers persist in legacy.
  for (const question of oracle.questions) {
    const values = selected(answers, question.id)
    const offered = oracle.offered(question.id, answers)
    const upstream = upstreamOf[question.id]
    if (values.some((value) => !offered.includes(value))
      || values.length > question.maxSelections
      || (upstream !== undefined && values.length > 0 && selected(answers, upstream).length === 0)) {
      labels |= BC1
    }
  }

  const { firstUnsatisfied, unsettled } = walk(oracle, answers)
  const placed = legacy.phase === 'questions' || legacy.phase === 'intro'

  // BC-2: legacy places the user ahead of the first unsatisfied required question.
  if (placed && firstUnsatisfied !== undefined && legacy.stepIndex > firstUnsatisfied) labels |= BC2

  // BC-3: legacy leaves the user at the final question with answers that cannot be completed.
  if (legacy.phase === 'questions' && legacy.stepIndex === last && !oracle.completable(answers)) {
    labels |= BC3
  }

  // BC-4: forced answers that legacy restore never wrote, or an intro placed on a forced step.
  if (unsettled.length > 0) labels |= BC4
  if (legacy.phase === 'intro' && oracle.forcedAt(legacy.stepIndex, answers) !== undefined) {
    labels |= BC4
  }
  return labels
}

export function labelNames(labels: number) {
  return [
    labels & BC1 ? 'BC-1' : '',
    labels & BC2 ? 'BC-2' : '',
    labels & BC3 ? 'BC-3' : '',
    labels & BC4 ? 'BC-4' : '',
  ].filter(Boolean)
}
