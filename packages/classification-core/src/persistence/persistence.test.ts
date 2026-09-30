import { describe, expect, test } from 'vitest'

import { compileClassification } from '../compiler/compile.js'
import { diagnosticCodes } from '../contracts/diagnostic-codes.js'
import { classificationDefinition } from '../definitions/bundle.js'
import {
  completeAnswers,
  createInitialAnswers,
  forcedOptionId,
  migrateStoredClassification,
  orderedQuestions,
  repairAnswers,
  resolveOptionIds,
  restoreQuestionnaire,
  serializeClassificationPayload,
  validateStoredPayload,
  type FlowAnswers,
} from '../index.js'

const compiled = compileClassification(
  classificationDefinition,
  'packages/classification-core/src/definitions/bundle.ts',
)
if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics))
const model = compiled.model

const blank = (): Record<string, string[]> => ({
  form: [], archetype: [], tare: [], source: [], body: [], noodle: [], signature: [], exclusions: ['none'],
})
const answers = (overrides: Record<string, string[]>): FlowAnswers => ({ ...blank(), ...overrides })
const codes = (result: { diagnostics: readonly { code: string }[] }) => result.diagnostics.map((item) => item.code)

const legacyIekei = {
  form: 'soup', archetype: 'paitan', tare: 'shoyu', source: ['pork', 'chicken'],
  body: 'rich', noodle: 'medium-thick-straight', signature: ['nori-spinach'], exclusions: ['none'],
}

const iekei = {
  form: ['soup'], archetype: ['paitan'], tare: ['shoyu'], source: ['pork', 'chicken'],
  body: ['rich'], noodle: ['medium-thick-straight'], signature: ['nori-spinach'], exclusions: ['none'],
}

function legacy(state: Record<string, unknown>) {
  return { phase: 'questions', locale: 'zh-TW', stepIndex: 0, answers: {}, ...state }
}

describe('migration contract', () => {
  test('rejects non-object input and invalid versions without repair', () => {
    for (const input of [null, [], 'text', 1, true]) {
      const result = migrateStoredClassification(input, model)
      expect(result.ok).toBe(false)
      expect(codes(result)).toEqual(['MIGRATION_INPUT_INVALID'])
    }
    for (const schemaVersion of [0, -1, 1.5, '1', null, Infinity]) {
      const result = migrateStoredClassification({ schemaVersion }, model)
      expect(result.ok).toBe(false)
      expect(codes(result)).toEqual(['MIGRATION_INPUT_INVALID'])
    }
  })

  test('fails future schema versions with MIGRATION_UNHANDLED_VERSION and never repairs them', () => {
    for (const schemaVersion of [2, 99, Number.MAX_SAFE_INTEGER]) {
      const input = { schemaVersion, answers: iekei }
      const migrated = migrateStoredClassification(input, model)
      expect(migrated.ok).toBe(false)
      expect(codes(migrated)).toEqual(['MIGRATION_UNHANDLED_VERSION'])
      expect(migrated.diagnostics[0]).toMatchObject({ severity: 'error', path: '/schemaVersion' })
      const restored = restoreQuestionnaire(input, model)
      expect(restored.ok).toBe(false)
      expect(codes(restored)).toEqual(['MIGRATION_UNHANDLED_VERSION'])
    }
  })

  test('validates version 1 structure as unknown input and aggregates every issue', () => {
    const result = migrateStoredClassification({
      schemaVersion: 1,
      modelVersion: '',
      dataVersion: 5,
      answers: { form: 'soup', source: [1] },
      locale: 'en',
    }, model)
    expect(result.ok).toBe(false)
    const paths = result.diagnostics.map((item) => item.path)
    expect(codes(result).every((code) => code === 'PERSIST_PAYLOAD_INVALID')).toBe(true)
    expect(paths).toEqual(expect.arrayContaining([
      '/modelVersion', '/dataVersion', '/answers/form', '/answers/source/0', '/locale',
    ]))
  })

  test('accepts a valid version 1 payload and keeps stale values for repair', () => {
    const payload = serializeClassificationPayload(model, answers(iekei), 'body')
    const result = migrateStoredClassification(payload, model)
    expect(result).toMatchObject({ ok: true, sourceVersion: 1 })
    expect(Object.isFrozen(payload)).toBe(true)
    expect(Object.isFrozen(payload.answers)).toBe(true)
    expect(validateStoredPayload(payload, model)).toMatchObject({ ok: true, diagnostics: [] })
  })
})

describe('legacy unversioned migration', () => {
  test('applies legacy sanitization and normalizes scalars to arrays', () => {
    const result = migrateStoredClassification(legacy({
      stepIndex: 3,
      answers: { form: 'soup', archetype: 'paitan', tare: 'shoyu', source: ['pork', 'pork', 'not-a-source', 'unsure'], exclusions: [] },
    }), model)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sourceVersion).toBe('legacy-unversioned')
    expect(result.payload.answers).toMatchObject({
      form: ['soup'], archetype: ['paitan'], tare: ['shoyu'], source: ['pork'], body: [], signature: [], exclusions: ['none'],
    })
    expect(result.payload.currentQuestionId).toBe('source')
    expect(codes(result)).toEqual(['REPAIR_ANSWER_UNKNOWN_OPTION'])
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'warning',
      sourceFile: 'runtime://local-storage/legacy-state',
      path: '/answers/source/2',
      entityId: 'source',
    })
  })

  test('expands the retired seafood exclusion and reports it', () => {
    const result = migrateStoredClassification(legacy({ answers: { exclusions: ['pork', 'seafood', 'shellfish'] } }), model)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.answers.exclusions).toEqual(['pork', 'fish-seafood', 'shellfish', 'shrimp-crab'])
    expect(codes(result)).toEqual(['MIGRATION_LEGACY_ALIAS_EXPANDED'])
  })

  test('removes exclusive values combined with others and never reports canonicalization', () => {
    const result = migrateStoredClassification(legacy({
      answers: { source: ['unsure', 'pork'], signature: ['no-preference', 'corn-butter'], exclusions: ['none', 'beef'] },
    }), model)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.answers).toMatchObject({ source: ['pork'], signature: ['corn-butter'], exclusions: ['beef'] })
    expect(result.diagnostics).toEqual([])
  })

  test('ignores unusable legacy fields exactly as legacy does and reports them', () => {
    const result = migrateStoredClassification(legacy({
      stepIndex: 1.5,
      answers: { form: 7, source: 'pork', exclusions: 'beef', tare: null },
    }), model)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.answers).toMatchObject({ form: [], source: [], exclusions: ['none'], tare: [] })
    expect(result.payload.currentQuestionId).toBe('form')
    expect(codes(result).every((code) => code === 'MIGRATION_LEGACY_FIELD_IGNORED')).toBe(true)
    expect(result.diagnostics.map((item) => item.path)).toEqual(
      expect.arrayContaining(['/stepIndex', '/answers/form', '/answers/source', '/answers/exclusions', '/answers/tare']),
    )
    const nonObject = migrateStoredClassification(legacy({ answers: [] }), model)
    expect(nonObject.ok && codes(nonObject)).toEqual(['MIGRATION_LEGACY_FIELD_IGNORED'])
  })

  test('clamps the legacy step index to the last question', () => {
    for (const [stepIndex, expected] of [[0, 'form'], [7, 'exclusions'], [8, 'exclusions'], [1e9, 'exclusions'], [-1, 'form']] as const) {
      const result = migrateStoredClassification(legacy({ stepIndex }), model)
      expect(result.ok && result.payload.currentQuestionId).toBe(expected)
    }
  })

  test('ignores phase, locale and unknown fields without reporting them', () => {
    const result = migrateStoredClassification({ phase: 'results', locale: 'ja', extra: 1 }, model)
    expect(result.ok && result.diagnostics).toEqual([])
    expect(result.ok && Object.keys(result.payload)).not.toEqual(expect.arrayContaining(['phase', 'locale']))
  })
})

describe('repair (approved divergences BC-1 to BC-4)', () => {
  test('BC-1 drops a branch-stale archetype and clears dependents', () => {
    const result = repairAnswers(model, answers({
      form: ['soup'], archetype: ['miso-rich'], tare: ['shoyu'], source: ['pork'],
    }), 'source')
    expect(result.answers).toMatchObject({ form: ['soup'], archetype: [], tare: [], source: [] })
    expect(result.resumeQuestionId).toBe('archetype')
    expect(codes(result)).toEqual(expect.arrayContaining([
      'REPAIR_ANSWER_NOT_OFFERED', 'REPAIR_DEPENDENTS_CLEARED', 'REPAIR_RESUME_MOVED',
    ]))
    expect(result.complete).toBe(false)
  })

  test('BC-1 drops an option the archetype does not offer', () => {
    const result = repairAnswers(model, answers({
      form: ['tsukemen'], archetype: ['konbusui-light'], tare: ['spicy-sesame'],
    }), 'tare')
    expect(result.answers.tare).toEqual([])
    expect(result.resumeQuestionId).toBe('tare')
    expect(codes(result)).toEqual(['REPAIR_ANSWER_NOT_OFFERED'])
  })

  test('over-limit keeps the first N valid values in stored order without clearing the answer', () => {
    const result = repairAnswers(model, answers({ ...iekei, source: ['duck', 'pork', 'chicken'] }), 'exclusions')
    expect(result.answers.source).toEqual(['duck', 'pork'])
    expect(codes(result)).toEqual(['REPAIR_ANSWER_OVER_LIMIT'])
    expect(result.complete).toBe(true)
    const exclusive = repairAnswers(model, answers({ ...iekei, source: ['unsure', 'chicken', 'duck', 'pork'] }))
    expect(exclusive.answers.source).toEqual(['chicken', 'duck'])
    expect(codes(exclusive)).toEqual(expect.arrayContaining(['REPAIR_EXCLUSIVE_CONFLICT', 'REPAIR_ANSWER_OVER_LIMIT']))
  })

  test('an over-limit single-choice answer changes and invalidates its dependents', () => {
    const result = repairAnswers(model, answers({ ...iekei, form: ['soup', 'dry'] }))
    expect(result.answers.form).toEqual(['soup'])
    expect(result.answers.archetype).toEqual([])
    expect(result.answers.tare).toEqual([])
    expect(result.answers.exclusions).toEqual(['none'])
    expect(codes(result)).toContain('REPAIR_ANSWER_OVER_LIMIT')
    expect(codes(result).filter((code) => code === 'REPAIR_DEPENDENTS_CLEARED')).toHaveLength(6)
    expect(result.resumeQuestionId).toBe('archetype')
  })

  test('BC-2 moves the resume position back to the earliest unanswered question', () => {
    const result = repairAnswers(model, answers({ form: ['soup'] }), 'noodle')
    expect(result.resumeQuestionId).toBe('archetype')
    expect(codes(result)).toEqual(['REPAIR_RESUME_MOVED'])
  })

  test('BC-3 repairs a state stuck at the final question', () => {
    const result = repairAnswers(model, answers({ ...iekei, source: [] }), 'exclusions')
    expect(result.complete).toBe(false)
    expect(result.resumeQuestionId).toBe('source')
  })

  test('BC-1, BC-3 and BC-4 together complete a bypassed conditional branch', () => {
    const result = repairAnswers(model, answers({
      form: ['tsukemen'], archetype: ['miso-rich'], tare: ['shoyu'], source: ['pork'],
      body: ['rich'], noodle: ['extra-thick'], signature: ['corn-butter'],
    }), 'exclusions')
    expect(result.complete).toBe(true)
    expect(result.answers.tare).toEqual(['miso'])
    expect(result.completedAnswers).toBeDefined()
    expect(codes(result)).toEqual(['REPAIR_ANSWER_NOT_OFFERED', 'REPAIR_FORCED_ANSWER_APPLIED'])
  })

  test('BC-4 writes forced answers even for an intro-style state and skips them on resume', () => {
    const result = repairAnswers(model, answers({ form: ['dry'], archetype: ['soupless-tantan'] }), 'tare')
    expect(result.answers.tare).toEqual(['spicy-sesame'])
    expect(result.resumeQuestionId).toBe('source')
    expect(codes(result)).toEqual(['REPAIR_FORCED_ANSWER_APPLIED'])
  })

  test('drops unknown questions and options and reports each one', () => {
    const result = repairAnswers(model, { ...answers({ form: ['soup', 'nope'] }), ghost: ['x'] })
    expect(result.answers).not.toHaveProperty('ghost')
    expect(codes(result)).toEqual(expect.arrayContaining(['REPAIR_ANSWER_UNKNOWN_QUESTION', 'REPAIR_ANSWER_UNKNOWN_OPTION']))
  })

  test('an unknown or later requested resume question moves to the first actionable one', () => {
    const unknown = repairAnswers(model, answers({ form: ['soup'] }), 'ghost')
    expect(unknown.resumeQuestionId).toBe('archetype')
    expect(codes(unknown)).toEqual(['REPAIR_RESUME_MOVED'])
    const earlier = repairAnswers(model, answers(iekei), 'archetype')
    expect(earlier.resumeQuestionId).toBe('archetype')
    expect(earlier.diagnostics).toEqual([])
    const missing = repairAnswers(model, answers(iekei))
    expect(missing.resumeQuestionId).toBe('exclusions')
  })

  test('a requested forced question resumes at the next interactive question', () => {
    const result = repairAnswers(model, answers({ form: ['dry'], archetype: ['soupless-tantan'], tare: ['spicy-sesame'] }), 'tare')
    expect(result.resumeQuestionId).toBe('source')
    expect(result.diagnostics).toEqual([])
  })
})

describe('restore', () => {
  test('restores a healthy legacy state with no repair diagnostics', () => {
    const result = restoreQuestionnaire(legacy({ stepIndex: 7, answers: legacyIekei }), model)
    expect(result).toMatchObject({ ok: true, complete: true, resumeQuestionId: 'exclusions', sourceVersion: 'legacy-unversioned' })
    expect(result.ok && result.diagnostics).toEqual([])
    expect(result.ok && result.completedAnswers).toEqual(completeAnswers(model, answers(iekei)))
  })

  test('revalidates and warns when model or data version differ but rejects nothing', () => {
    const payload = { ...serializeClassificationPayload(model, answers(iekei), 'body'), modelVersion: 'old', dataVersion: 'older' }
    const result = restoreQuestionnaire(payload, model)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.diagnostics.map((item) => [item.code, item.path])).toEqual([
      ['PERSIST_MODEL_VERSION_CHANGED', '/dataVersion'],
      ['PERSIST_MODEL_VERSION_CHANGED', '/modelVersion'],
    ])
    expect(result.resumeQuestionId).toBe('body')
    expect(validateStoredPayload(payload, model).diagnostics).toHaveLength(2)
  })

  test('repairs a stale payload written under an older model', () => {
    const payload = { ...serializeClassificationPayload(model, answers({ ...iekei, archetype: ['gyokai-rich'] })), modelVersion: 'old' }
    const result = restoreQuestionnaire(payload, model)
    expect(result.ok && result.answers.archetype).toEqual([])
    expect(result.ok && result.resumeQuestionId).toBe('archetype')
  })

  test('a payload without a resume question resumes at the first actionable question', () => {
    const payload = serializeClassificationPayload(model, answers({ form: ['soup'] }))
    const result = restoreQuestionnaire(payload, model)
    expect(result.ok && result.resumeQuestionId).toBe('archetype')
  })
})

describe('guarantees', () => {
  function scenarios(): Record<string, string[]>[] {
    const list: Record<string, string[]>[] = []
    const forms = [[], ['soup'], ['tsukemen'], ['dry'], ['soup', 'dry']]
    const archetypes = [[], ['chintan'], ['paitan'], ['miso-rich'], ['gyokai-rich'], ['soupless-tantan'], ['aburasoba'], ['dry-other'], ['nope']]
    const someValues = [[], ['pork'], ['pork', 'chicken', 'duck'], ['unsure', 'pork'], ['shoyu'], ['miso'], ['spicy-sesame'], ['none'], ['rich'], ['extra-thick'], ['corn-butter', 'no-preference']]
    for (const form of forms) for (const archetype of archetypes) {
      for (let seed = 0; seed < 22; seed += 1) {
        const pick = (offset: number) => someValues[(seed * 7 + offset * 3) % someValues.length]!
        list.push({ form, archetype, tare: pick(1).slice(0, 1), source: pick(2), body: pick(3).slice(0, 1), noodle: pick(4).slice(0, 1), signature: pick(5), exclusions: pick(6) })
      }
    }
    return list
  }

  test('every restored state is complete or resumes at an interactive question', () => {
    const questions = orderedQuestions(model)
    for (const scenario of scenarios()) {
      for (const requested of [undefined, 'form', 'source', 'exclusions', 'ghost']) {
        const result = repairAnswers(model, scenario, requested)
        if (result.complete) {
          expect(completeAnswers(model, result.answers)).toBeDefined()
        } else {
          expect(result.completedAnswers).toBeUndefined()
        }
        const resumeIndex = questions.findIndex((question) => question.id === result.resumeQuestionId)
        expect(resumeIndex).toBeGreaterThanOrEqual(0)
        expect(forcedOptionId(model, result.resumeQuestionId, result.answers)).toBeUndefined()
        expect(resolveOptionIds(model, result.resumeQuestionId, result.answers).length).toBeGreaterThan(0)
      }
    }
  })

  test('repair is idempotent and repaired answers restore to the same state', () => {
    for (const scenario of scenarios()) {
      const first = repairAnswers(model, scenario, 'exclusions')
      const second = repairAnswers(model, first.answers, first.resumeQuestionId)
      expect(second.answers).toEqual(first.answers)
      expect(second.resumeQuestionId).toBe(first.resumeQuestionId)
      expect(second.complete).toBe(first.complete)
      expect(second.diagnostics).toEqual([])
      const payload = serializeClassificationPayload(model, first.answers, first.resumeQuestionId)
      const restored = restoreQuestionnaire(payload, model)
      expect(restored.ok && restored.answers).toEqual(first.answers)
      expect(restored.ok && restored.resumeQuestionId).toBe(first.resumeQuestionId)
      expect(restored.ok && restored.diagnostics).toEqual([])
    }
  })

  test('repair is deterministic regardless of input key order and never invents answers', () => {
    for (const scenario of scenarios().slice(0, 300)) {
      const reversed = Object.fromEntries(Object.entries(scenario).reverse())
      expect(repairAnswers(model, reversed, 'source')).toEqual(repairAnswers(model, scenario, 'source'))
      const result = repairAnswers(model, scenario)
      for (const question of orderedQuestions(model)) {
        const stored = scenario[question.id] ?? []
        const repaired = result.answers[question.id] ?? []
        const extras = repaired.filter((value) => !stored.includes(value))
        const allowedExtras = [question.emptyFallbackOptionId, forcedOptionId(model, question.id, result.answers)]
        expect(extras.every((value) => allowedExtras.includes(value))).toBe(true)
      }
    }
  })

  test('inputs are never mutated and results are deeply frozen', () => {
    const input = structuredClone(scenarios()[40]!)
    const snapshot = structuredClone(input)
    const frozenInput = Object.freeze(Object.fromEntries(Object.entries(input).map(([k, v]) => [k, Object.freeze(v)])))
    const result = repairAnswers(model, frozenInput, 'source')
    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.answers)).toBe(true)
    expect(Object.isFrozen(result.answers.source)).toBe(true)
    expect(Object.isFrozen(result.diagnostics)).toBe(true)
    const restored = restoreQuestionnaire(legacy({ answers: legacyIekei }), model)
    expect(Object.isFrozen(restored)).toBe(true)
    expect(Object.isFrozen(createInitialAnswers(model))).toBe(true)
  })

  test('every emitted diagnostic code is declared', () => {
    const declared = new Set<string>(diagnosticCodes)
    for (const scenario of scenarios().slice(0, 300)) {
      for (const item of repairAnswers(model, scenario, 'ghost').diagnostics) {
        expect(declared.has(item.code)).toBe(true)
      }
    }
  })
})
