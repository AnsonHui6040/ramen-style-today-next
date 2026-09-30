// Deterministic scenario space for the restore parity harness. Values below are legacy test
// data (the legacy global value sets plus invalid values); they are not derived from the new model.

const forms = [undefined, 'soup', 'tsukemen', 'dry']
const archetypes = [
  undefined, 'chintan', 'paitan', 'konbusui-light', 'gyokai-rich', 'miso-rich',
  'tsukemen-other', 'aburasoba', 'taiwan-mazesoba', 'soupless-tantan', 'dry-other',
]
const universe = {
  form: ['soup', 'tsukemen', 'dry'],
  archetype: archetypes.filter((value): value is string => value !== undefined),
  tare: ['shoyu', 'shio', 'miso', 'spicy-sesame', 'none'],
  source: ['pork', 'chicken', 'duck', 'beef', 'fish-seafood', 'shellfish', 'shrimp-crab', 'vegetable', 'mixed', 'unsure'],
  body: ['light', 'balanced', 'rich', 'backfat-heavy', 'ultra-heavy'],
  noodle: ['thin-straight', 'medium-thin-straight', 'medium-thick-straight', 'medium-thick-wavy', 'extra-thick'],
  signature: ['nori-spinach', 'corn-butter', 'bean-sprout-garlic-backfat', 'fish-kombu', 'yuzu-citrus', 'no-preference'],
  exclusions: ['pork', 'chicken', 'duck', 'beef', 'fish-seafood', 'shellfish', 'shrimp-crab', 'dairy', 'none'],
}
const singleFields = ['form', 'archetype', 'tare', 'body', 'noodle'] as const
const multiFields = ['source', 'signature', 'exclusions'] as const
const invalidSingles: unknown[] = ['not-a-value', 7, null, ['x'], '']

function multiVariants(field: (typeof multiFields)[number]): unknown[] {
  const values = universe[field]
  const exclusive = field === 'source' ? 'unsure' : field === 'signature' ? 'no-preference' : 'none'
  const others = values.filter((value) => value !== exclusive)
  return [
    ...values.map((value) => [value]),
    [], [others[0], others[0]], [others[0], others[1], others[2]], [others[2], others[0], others[1]],
    [others[0], others[1]], [exclusive, others[0]], [others[0], exclusive], [others[0], 'not-a-value'],
    'text', [1], null,
    ...(field === 'exclusions' ? [['seafood'], ['pork', 'seafood'], ['seafood', 'shellfish'], ['seafood', 'none']] : []),
  ]
}

const defaults = {
  tare: 'shoyu', source: ['pork'], body: 'rich', noodle: 'extra-thick', signature: ['corn-butter'], exclusions: ['none'],
}

const envelopes: { phase: unknown; stepIndex: unknown }[] = [
  ...[0, 2, 3, 5, 7, 9].map((stepIndex) => ({ phase: 'questions', stepIndex })),
  ...[0, 4].map((stepIndex) => ({ phase: 'intro', stepIndex })),
  { phase: 'results', stepIndex: 7 },
]

function envelopeJson(answers: unknown, envelope: { phase: unknown; stepIndex: unknown }, locale = 'en') {
  return JSON.stringify({ ...envelope, locale, answers })
}

function mulberry32(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildRestoreScenarios(): (string | null)[] {
  const raws: (string | null)[] = []

  // Raw-input malformed set.
  raws.push(
    null, '', ' ', 'not json', '{', '{"phase":"questions"', 'null', '[]', '"text"', '1', 'true', '0',
    '{}', '{"answers":null}', '{"answers":[]}', '{"answers":"x"}', '{"answers":{}}',
    '{"phase":"results","stepIndex":1e400,"answers":{}}', '{"stepIndex":1e400}',
    '{"a":{"b":{"c":{"d":{"e":{}}}}}}', '{"__proto__":{"phase":"results"}}',
  )

  // Envelope field fuzz over a healthy and an empty answer set.
  const healthy = {
    form: 'soup', archetype: 'paitan', tare: 'shoyu', source: ['pork', 'chicken'], body: 'rich',
    noodle: 'medium-thick-straight', signature: ['nori-spinach'], exclusions: ['none'],
  }
  const phases: unknown[] = [undefined, 'intro', 'questions', 'results', 'x', 1, null, ['questions']]
  const steps: unknown[] = [undefined, -1, 0, 1, 1.5, 3, 7, 8, 99, '3', null, [], true]
  const localesFuzz: unknown[] = [undefined, 'zh-TW', 'en', 'ja', 'fr', 3, null]
  for (const answers of [healthy, {}, undefined]) {
    for (const phase of phases) for (const stepIndex of steps) {
      raws.push(JSON.stringify({ phase, stepIndex, locale: 'ja', answers }))
    }
    for (const locale of localesFuzz) {
      raws.push(JSON.stringify({ phase: 'questions', stepIndex: 3, locale, answers }))
    }
  }

  // Answer space: every form and archetype pair with each other question varied in turn.
  for (const form of forms) for (const archetype of archetypes) {
    const base = { form, archetype, ...defaults }
    const push = (answers: unknown) => {
      for (const envelope of envelopes) raws.push(envelopeJson(answers, envelope))
    }
    push(base)
    for (const field of singleFields) {
      if (field === 'form' || field === 'archetype') continue
      for (const value of [undefined, ...universe[field], ...invalidSingles]) {
        push({ ...base, [field]: value })
      }
    }
    for (const field of multiFields) {
      for (const value of multiVariants(field)) push({ ...base, [field]: value })
    }
  }

  // Invalid form and archetype values, and missing upstream answers with populated downstream ones.
  for (const value of [...invalidSingles, undefined]) {
    for (const envelope of envelopes) {
      raws.push(envelopeJson({ ...healthy, form: value }, envelope))
      raws.push(envelopeJson({ ...healthy, archetype: value }, envelope))
    }
  }

  // Seeded random combinations (fixed seed, no runtime randomness).
  const random = mulberry32(0x2b2b)
  const pick = <T,>(values: readonly T[]) => values[Math.floor(random() * values.length)]!
  for (let count = 0; count < 20000; count += 1) {
    const answers: Record<string, unknown> = { form: pick(forms), archetype: pick(archetypes) }
    for (const field of ['tare', 'body', 'noodle'] as const) {
      answers[field] = random() < 0.2 ? undefined : random() < 0.15 ? pick(invalidSingles) : pick(universe[field])
    }
    for (const field of multiFields) {
      const variants = multiVariants(field)
      answers[field] = random() < 0.15 ? undefined : pick(variants)
    }
    raws.push(envelopeJson(answers, {
      phase: pick(['questions', 'questions', 'intro', 'results', undefined]),
      stepIndex: pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1, 1.5]),
    }, pick(['zh-TW', 'en', 'ja', 'xx'])))
  }
  return raws
}

const ok = { form: 'soup', archetype: 'paitan', tare: 'shoyu', source: ['pork', 'chicken'], body: 'rich', noodle: 'medium-thick-straight', signature: ['nori-spinach'], exclusions: ['none'] }
const fixture = (phase: string, stepIndex: number, answers: unknown, locale = 'zh-TW') => (
  JSON.stringify({ phase, stepIndex, locale, answers })
)

/** Named legacy-parity fixtures: the new behavior must equal legacy exactly. */
export const namedParityFixtures: { id: string; raw: string | null }[] = [
  { id: 'P1 no stored value', raw: null },
  { id: 'P2 corrupt JSON keeps fallback', raw: '{"phase":' },
  { id: 'P3 non-object JSON', raw: '[1,2]' },
  { id: 'P4 fractional step index restores the first question', raw: fixture('questions', 1.5, { form: 'soup', source: [], signature: [], exclusions: ['none'] }) },
  { id: 'P5 negative step index', raw: fixture('questions', -3, ok) },
  { id: 'P6 oversized step index is clamped', raw: fixture('questions', 99, ok) },
  { id: 'P7 unknown phase and locale', raw: fixture('nope', 3, ok, 'fr') },
  { id: 'P8 seafood alias expansion', raw: fixture('questions', 7, { ...ok, exclusions: ['seafood', 'dairy'] }) },
  { id: 'P9 duplicate and unknown values', raw: fixture('questions', 3, { ...ok, source: ['pork', 'pork', 'zzz'] }) },
  { id: 'P10 exclusive value with others', raw: fixture('questions', 3, { ...ok, source: ['unsure', 'pork'], signature: ['no-preference', 'corn-butter'] }) },
  { id: 'P11 valid results snapshot', raw: fixture('results', 7, ok) },
  { id: 'P12 healthy questions snapshot at a forced-skipping step', raw: fixture('questions', 2, { form: 'dry', archetype: 'soupless-tantan', tare: 'spicy-sesame', source: [], signature: [], exclusions: ['none'] }) },
  { id: 'P13 incomplete results snapshot falls back to intro', raw: fixture('results', 0, { form: 'soup', source: [], signature: [], exclusions: ['none'] }) },
]

/** Named approved-divergence fixtures D1 to D8 from the approved plan. */
export const namedDivergenceFixtures: {
  id: string
  raw: string
  expectedLabels: string[]
  coreLevel?: { complete: boolean; resumeQuestionId: string }
}[] = [
  { id: 'D1 branch-stale archetype', raw: fixture('questions', 3, { form: 'soup', archetype: 'miso-rich', tare: 'shoyu', source: ['pork'], signature: [], exclusions: ['none'] }), expectedLabels: ['BC-1', 'BC-2'] },
  { id: 'D2 restricted tare', raw: fixture('questions', 2, { form: 'tsukemen', archetype: 'konbusui-light', tare: 'spicy-sesame', source: [], signature: [], exclusions: ['none'] }), expectedLabels: ['BC-1'] },
  { id: 'D3 over-limit source keeps the first two in stored order', raw: fixture('questions', 7, { ...ok, source: ['duck', 'pork', 'chicken'] }), expectedLabels: ['BC-1', 'BC-3'] },
  { id: 'D4 missing prefix', raw: fixture('questions', 5, { form: 'soup', source: [], signature: [], exclusions: ['none'] }), expectedLabels: ['BC-2'] },
  { id: 'D5 stuck at the last question', raw: fixture('questions', 7, { ...ok, source: [] }), expectedLabels: ['BC-2', 'BC-3'] },
  { id: 'D6 bypassed conditional branch', raw: fixture('questions', 7, { form: 'tsukemen', archetype: 'miso-rich', tare: 'shoyu', source: ['pork'], body: 'rich', noodle: 'extra-thick', signature: ['corn-butter'], exclusions: ['none'] }), expectedLabels: ['BC-1', 'BC-3', 'BC-4'] },
  { id: 'D7 unsettled intro', raw: fixture('intro', 2, { form: 'dry', archetype: 'soupless-tantan', source: [], signature: [], exclusions: ['none'] }), expectedLabels: ['BC-4'] },
  {
    id: 'D8 incomplete results snapshot (core-level)',
    raw: fixture('results', 7, { ...ok, source: [] }),
    expectedLabels: [],
    coreLevel: { complete: false, resumeQuestionId: 'source' },
  },
]
