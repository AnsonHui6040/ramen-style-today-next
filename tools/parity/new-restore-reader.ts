import {
  orderedQuestions,
  restoreQuestionnaire,
  type FlowAnswers,
} from '@ramen-style/classification-core'
import type { ClassificationModel } from '@ramen-style/classification-core/compiler'

import type { ParityAnswers } from './engine.js'
import type { LegacyPhase, LegacyState } from './legacy-restore-engine.js'

// Test-only legacy envelope reader. It reproduces the legacy `phase`, `locale` and
// results-fallback envelope rules around the core restore API so that the whole legacy
// `readStoredState` behavior can be compared. The production envelope belongs to Batch 5A.

const locales = ['zh-TW', 'en', 'ja']

export function fromFlow(flow: FlowAnswers): ParityAnswers {
  const single = (id: string) => flow[id]?.[0]
  return {
    form: single('form'),
    archetype: single('archetype'),
    tare: single('tare'),
    source: [...(flow.source ?? [])],
    body: single('body'),
    noodle: single('noodle'),
    signature: [...(flow.signature ?? [])],
    exclusions: [...(flow.exclusions ?? [])],
  }
}

export function readNewState(
  raw: string | null,
  model: ClassificationModel,
): { state: LegacyState; complete: boolean } {
  const questions = orderedQuestions(model)
  const fallback: LegacyState = {
    phase: 'intro',
    stepIndex: 0,
    locale: 'zh-TW',
    answers: { source: [], signature: [], exclusions: ['none'] },
  }
  if (!raw) return { state: fallback, complete: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { state: fallback, complete: false }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { state: fallback, complete: false }
  }
  const stored = parsed as Record<string, unknown>
  const restored = restoreQuestionnaire(stored, model)
  if (!restored.ok) return { state: fallback, complete: false }

  const phase: LegacyPhase = stored.phase === 'questions' || stored.phase === 'results'
    ? stored.phase
    : 'intro'
  const locale = typeof stored.locale === 'string' && locales.includes(stored.locale)
    ? stored.locale
    : 'zh-TW'
  const answers = fromFlow(restored.answers)
  const resumeIndex = questions.findIndex((question) => question.id === restored.resumeQuestionId)
  const rawStep = stored.stepIndex
  const envelopeStep = typeof rawStep === 'number' && Number.isInteger(rawStep) && rawStep >= 0
    ? Math.min(rawStep, questions.length - 1)
    : 0

  if (phase === 'results') {
    return restored.complete
      ? { state: { phase, stepIndex: envelopeStep, locale, answers }, complete: true }
      // Envelope rule (Decision 7): an incomplete results snapshot falls back to intro at the
      // start while preserving the recoverable answers.
      : { state: { phase: 'intro', stepIndex: 0, locale, answers }, complete: false }
  }
  return { state: { phase, stepIndex: resumeIndex, locale, answers }, complete: restored.complete }
}
