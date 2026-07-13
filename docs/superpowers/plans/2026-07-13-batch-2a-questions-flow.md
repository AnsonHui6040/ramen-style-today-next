# Batch 2A Questions and Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synthetic question inventory with eight production question definitions, a deterministic proof-producing compiler, a browser-neutral pure flow runtime, and frozen observable-transition parity evidence from the verified legacy oracle.

**Architecture:** Production definitions are the only hand-authored question source. A Node-only compiler canonicalizes and proves them before emitting a tracked immutable artifact; runtime functions consume only that artifact. A separately isolated extractor authors observable-only traces from the exact legacy tree, while ordinary verification executes the same actions through a runtime adapter and compares only the stable observable projection without accessing the legacy repository.

**Tech Stack:** Node.js 24, npm 11, npm workspaces, TypeScript 6.0.3, Zod 4.4.3 for compiler/tool decoding only, Vitest 4.1.10, ESLint 10.6.0, tsx 4.23.0, Git and GitHub Actions.

**Approved specification:** `docs/superpowers/specs/2026-07-13-batch-2a-questions-flow-design.md`

**Status:** Ready for execution.

**Approved execution correction (2026-07-13):** Tasks 1–8 are implemented and reviewed. The first Task 9 implementation in `3b65eac` failed high-risk review and must be replaced from the reviewed Task 8 baseline `7a198bf`; it is not an implementation or fixture baseline. The replacement Task 9 must pass a fresh high-risk review before Task 10 starts.

## Global Constraints

- Preserve legacy question behavior from `AnsonHui6040/ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37`, tree `3e527de876cfeccfd3154ddc492830d71c4cfd9a`.
- Do not modify the legacy checkout, production React UI, persistence, scoring, styles, eligibility, catalog, Finder, translations, or deployment.
- Keep `AnswerDraft` submitted-only. UI initial selections, pending toggles, forced answers, repairs, and navigation position are distinct data.
- Use globally unique question IDs and question-scoped option IDs. Canonical option identity is `(QuestionId, OptionId)` and documentation keys use `option/<questionId>:<optionId>`; stable message IDs remain localization lookup only.
- Source conditions are a closed serializable AST. Runtime artifacts contain no closures, Node objects, timestamps, machine paths, usernames, OS metadata, source commits, or random UUIDs.
- Canonicalize before dependency derivation, semantic exploration, diagnostics sorting, and hashing.
- Derive dependencies from every condition that affects reachability, allowed options, bounds, forced eligibility, or answer validity. Do not hand-author `dependsOn` or use `stepIndex` ranges.
- `evaluateFlow` is deterministic and read-only. `applyAnswer` is the only submitted-draft transition. `updatePendingSelection` is draft-independent.
- Frozen `legacy-v1` trace bytes and extraction manifest contain only directly observable legacy transitions, never store current implementation verification, and never change for an intentional divergence.
- Repairs, diagnostics, invalidated IDs, global reachability, accepted/rejected API objects, canonical navigation metadata, dependency closures, fixed-point metadata, and invalid external API behavior belong to compiler/runtime tests, never frozen legacy traces.
- Root runtime exports must remain browser-neutral and must not pull Zod, compiler code, extractors, React, or `node:*` into the root import graph.
- `npm run verify` is offline and read-only. `npm run verify:acceptance` adds authenticated exact-SHA GitHub evidence.
- Use TypeScript ES modules, 2-space indentation, single quotes, no semicolons, deterministic code-point ordering, and stable structured diagnostics.
- Every implementation task follows red-green TDD, runs its focused tests plus the affected package checks, and ends with a focused commit.

---

## Planned file map

```text
packages/classification-core/src/
  contracts/
    diagnostic-codes.ts                   add question compiler and flow codes
    model.ts                              mixed-domain provenance and compiled question ownership
    question-model.ts                     source-neutral compiled question contracts
    deep-freeze.ts                        browser-neutral recursive freeze
  definitions/
    questions.ts                          eight canonical production questions
    classification.ts                     production questions + retained synthetic style/policy proof data
  compiler/
    source-schema.ts                      integrate production question source schema
    compile.ts                            compile mixed classification model through question compiler
    index.ts                              Node-only question compiler exports
    questions/
      source-schema.ts                    closed Zod question/condition schema
      canonicalize.ts                     canonical intermediate representation
      dependencies.ts                     reference extraction, graph, closure, topological order
      explore.ts                          sound finite semantic equivalence exploration
      proof.ts                            completion, forced, reachability, and idempotence obligations
      compile.ts                          question compiler orchestration and hashes
      serialize.ts                        deterministic TypeScript artifact renderer
      *.test.ts                           mutation and proof regression tests
  generated/
    question-model.ts                     tracked deep-frozen deterministic artifact
  flow/
    types.ts                              submitted, canonical, forced, repair, diagnostic, and state unions
    decode.ts                             primitive unknown-input decoder
    evaluate.ts                           fixed-point canonical evaluation
    apply-answer.ts                       atomic submitted transition and dependent invalidation
    pending-selection.ts                  generic exclusive/max/empty interaction policy
    navigation.ts                         stable-ID next/previous/first helpers
    index.ts                              internal runtime assembly
    *.test.ts                             runtime behavior, invalidity, and immutability tests
  index.ts / index.test.ts                browser-neutral public surface and import smoke checks

tools/questions/
  generate-question-model.ts              explicit write/check artifact CLI
  generate-question-model.test.ts         no-drift and deterministic output tests

tools/parity/questions/
  contracts.ts                            observable trace, coverage, divergence, and manifest schemas
  observable-trace.ts                     runtime action adapter and observable projection
  compare.ts                              bounded structured trace diff
  parity.ts                               offline projection replay and observable coverage gate
  extract.ts                              controlled trace-authoring CLI
  extractor.ts                            isolation, identity, execution, seed binding, and atomic publish
  legacy-instrumentation.patch            tracked observational temporary legacy patch
  seeds.json                              ordered public-action scenario definitions without expected output
  *.test.ts                               isolation, integrity, observable coverage, and replay tests

tools/parity/fixtures/questions/
  legacy-v1/manifest.json                 frozen extraction identity and fixture content hash
  legacy-v1/cases.json                    frozen `LegacyObservableTraceCase` corpus
  expected-divergences.json               initially empty reviewed JSON-Patch-style deltas

tools/validation/validate-classification.ts production question validation entry
tools/documentation/relations.ts            production question/option ownership registry
tools/documentation/build-index.ts          per-domain provenance and readiness rendering
tools/migration/ledger-schema.ts             Batch 2A gates and semantic path ownership
tools/migration/ledger-check.ts              offline ancestry/path consistency
tools/migration/record-ci.ts                 exact-SHA acceptance recording
tools/acceptance/verify-acceptance.ts         online authenticated evidence CLI

docs/classification/index.md                 generated production question index
docs/classification/manifest.json            generated provenance, readiness, verification, and concepts
docs/migration/ledger.json                    Batch 2A canonical ownership and evidence
docs/migration/ledger.md                      generated migration summary
docs/migration/incidents/
  2026-07-13-legacy-cache-isolation.md        rejected Task 9 cache-isolation incident and remediation
AGENTS.md / README.md                         concise phase summaries and canonical pointers
package.json / package-lock.json              question, parity, verify, and acceptance commands
.github/workflows/ci.yml                       offline PR verify and acceptance-capable push workflow
```

## Specification coverage map

| Approved design sections | Implementation tasks |
| --- | --- |
| 1–4 decision, scope, boundaries, source contract | Tasks 1, 2, 11 |
| 5–8 canonical compiler, dependencies, exploration, proofs | Tasks 3–5 |
| 9–14 submitted/pending/forced/canonical state and navigation | Tasks 6–8 |
| 15 deterministic artifact and hashes | Task 5 |
| 16–18 isolated extractor, frozen observable traces, coverage, projection parity | Tasks 9–10 |
| 19 provenance and readiness | Tasks 12, 14 |
| 20 offline/online verification and exact-SHA evidence | Tasks 13–14 |
| 21 acceptance rejection conditions | Focused tests in Tasks 1–13 plus Task 14 aggregate acceptance |
| 22 required deliverables | Tasks 1–14 |

New-only semantic coverage remains owned by the already implemented Tasks 3–8: Task 3 tests dependency graphs and closures; Task 4 tests equivalence classes, global reachability proof, and compiler fixed-point obligations; Task 6 tests repairs, diagnostics, invalid draft input, canonical/global flow state, and runtime fixed-point defense; Task 7 tests accepted/rejected application results and invalidated IDs; Task 8 tests canonical stable-ID navigation and pending-operation diagnostics. Task 10 reruns these suites but must not copy their fields or coverage tags into legacy traces.

---

## Execution prerequisite

Tasks 1–8 were executed in the isolated worktree and branch `codex/batch-2a-questions-flow`. Resume Tasks 9–14 only in that isolation after the branch coordinator reconstructs the branch from the reviewed Task 8 commit and applies the parity-contract revision commit. Do not create a nested worktree, rerun Tasks 1–8, execute on `main`, or retain rejected commit `3b65eac` in the reconstructed history.

```bash
git status --porcelain
test "$(git branch --show-current)" = "codex/batch-2a-questions-flow"
git merge-base --is-ancestor 7a198bf7a9195a82e84ff4230e9fe61af40b7018 HEAD
! git merge-base --is-ancestor 3b65eac3befb6ee7b3aa460bc1ff940027830a3e HEAD
```

Expected: status is empty, the branch is the isolated Batch 2A branch, the reviewed Task 8 commit is an ancestor, and the rejected Task 9 commit is not an ancestor. Task 9 Step 0 additionally proves that only the corrected spec/plan differ from the Task 8 baseline before reimplementation begins.

---

### Task 1: Add question source and compiled-model contracts

**Files:**
- Create: `packages/classification-core/src/contracts/question-model.ts`
- Create: `packages/classification-core/src/contracts/deep-freeze.ts`
- Create: `packages/classification-core/src/compiler/questions/source-schema.ts`
- Create: `packages/classification-core/src/compiler/questions/source-schema.test.ts`
- Modify: `packages/classification-core/src/contracts/diagnostic-codes.ts`
- Modify: `packages/classification-core/src/compiler/source-schema.ts`
- Modify: `packages/classification-core/src/compiler/index.ts`

**Interfaces:**
- Consumes: existing `stableIdSchema`, repository source-path contract, Zod compiler dependency.
- Produces: `QuestionDefinitionSource`, `SerializableCondition`, `CompiledQuestionModel`, `questionDefinitionSourceSchema`, and browser-neutral `deepFreeze`.

- [ ] **Step 1: Write failing source-contract tests**

Create tests that prove functions, duplicate order, invalid restore policy, and misplaced option weight are rejected:

```ts
import { describe, expect, test } from 'vitest'
import { questionDefinitionSourceSchema } from './source-schema.js'

const validQuestion = {
  id: 'form',
  order: 0,
  messageIds: {
    title: 'question-form-title',
    description: 'question-form-description',
  },
  selection: { type: 'single', min: 1, max: 1 },
  options: [{
    id: 'soup',
    order: 0,
    messageIds: {
      label: 'option-form-soup-label',
      description: 'option-form-soup-description',
    },
  }],
  weight: 16,
} as const

describe('questionDefinitionSourceSchema', () => {
  test('accepts a serializable source question', () => {
    expect(questionDefinitionSourceSchema.safeParse(validQuestion).success).toBe(true)
  })

  test('rejects closures and option-owned weights', () => {
    expect(questionDefinitionSourceSchema.safeParse({
      ...validQuestion,
      availableWhen: () => true,
    }).success).toBe(false)
    expect(questionDefinitionSourceSchema.safeParse({
      ...validQuestion,
      options: [{ ...validQuestion.options[0], weight: 16 }],
    }).success).toBe(false)
  })

  test('requires initial options for restore-on-empty', () => {
    expect(questionDefinitionSourceSchema.safeParse({
      ...validQuestion,
      pendingSelection: {
        emptyBehavior: { type: 'restore-initial-ui-options' },
      },
    }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```bash
npx vitest run packages/classification-core/src/compiler/questions/source-schema.test.ts
```

Expected: FAIL because the module and schema do not exist.

- [ ] **Step 3: Implement the closed contracts and schema**

Define the condition union without an extension escape hatch:

```ts
export type SerializableCondition =
  | { readonly type: 'answered'; readonly questionId: string }
  | { readonly type: 'answer-includes'; readonly questionId: string; readonly optionId: string }
  | { readonly type: 'all'; readonly conditions: readonly SerializableCondition[] }
  | { readonly type: 'any'; readonly conditions: readonly SerializableCondition[] }
  | { readonly type: 'not'; readonly condition: SerializableCondition }

export type AllowedOptionSelection =
  | { readonly type: 'all' }
  | { readonly type: 'only'; readonly optionIds: readonly string[] }

export interface AllowedOptionDecisionRow {
  readonly when: SerializableCondition
  readonly selection: AllowedOptionSelection
}

export interface QuestionDefinitionSource {
  readonly id: string
  readonly order: number
  readonly messageIds: { readonly title: string; readonly description: string }
  readonly selection: {
    readonly type: 'single' | 'multiple'
    readonly min: number
    readonly max: number
    readonly overrides?: readonly {
      readonly when: SerializableCondition
      readonly min: number
      readonly max: number
    }[]
  }
  readonly availableWhen?: SerializableCondition
  readonly options: readonly OptionDefinitionSource[]
  readonly allowedOptions?: readonly AllowedOptionDecisionRow[]
  readonly autoAnswer?: {
    readonly type: 'single-allowed-option'
    readonly when?: SerializableCondition
  }
  readonly initialUiOptionIds?: readonly string[]
  readonly pendingSelection?: {
    readonly emptyBehavior:
      | { readonly type: 'allow-empty' }
      | { readonly type: 'restore-initial-ui-options' }
  }
  readonly weight?: number
}

export interface OptionDefinitionSource {
  readonly id: string
  readonly order: number
  readonly messageIds: { readonly label: string; readonly description?: string }
  readonly availableWhen?: SerializableCondition
  readonly exclusive?: boolean
}
```

Define compiled metadata and graph fields in the same file:

```ts
export interface CompiledOption {
  readonly id: string
  readonly order: number
  readonly messageIds: { readonly label: string; readonly description?: string }
  readonly availableWhen?: SerializableCondition
  readonly exclusive: boolean
}

export interface CompiledQuestion {
  readonly id: string
  readonly order: number
  readonly messageIds: { readonly title: string; readonly description: string }
  readonly selection: {
    readonly type: 'single' | 'multiple'
    readonly min: number
    readonly max: number
    readonly overrides: readonly {
      readonly when: SerializableCondition
      readonly min: number
      readonly max: number
    }[]
  }
  readonly availableWhen?: SerializableCondition
  readonly options: readonly CompiledOption[]
  readonly allowedOptions: readonly AllowedOptionDecisionRow[]
  readonly autoAnswer?: {
    readonly type: 'single-allowed-option'
    readonly when?: SerializableCondition
  }
  readonly initialUiOptionIds: readonly string[]
  readonly pendingSelection: {
    readonly emptyBehavior:
      | { readonly type: 'allow-empty' }
      | { readonly type: 'restore-initial-ui-options' }
  }
  readonly validSelectionKeys: readonly string[]
  readonly weight?: number
}

export interface CompiledQuestionModelMetadata {
  readonly schemaVersion: string
  readonly compilerVersion: string
  readonly modelVersion: string
  readonly sourceHash: string
  readonly semanticHash: string
}

export interface CompiledQuestionModel {
  readonly metadata: CompiledQuestionModelMetadata
  readonly questions: readonly CompiledQuestion[]
  readonly semanticDependencies: Readonly<Record<string, readonly string[]>>
  readonly dependentClosures: Readonly<Record<string, readonly string[]>>
  readonly topologicalOrder: readonly string[]
  readonly forcedIterationUpperBound: number
}
```

Implement `deepFreeze<T>(value: T): DeepReadonly<T>` using `Object.freeze` plus recursive `Object.values`. Build strict recursive Zod schemas with `z.lazy`, `.strictObject`, integer non-negative orders, finite non-negative question weights, and a `.superRefine` that requires non-empty initial options for `restore-initial-ui-options`.

Register the exact new compiler and runtime codes used later:

```ts
'QUESTION_ORDER_DUPLICATE'
'OPTION_ORDER_DUPLICATE'
'QUESTION_SELECTION_INVALID'
'CONDITION_REFERENCE_UNKNOWN'
'FLOW_EMPTY_BRANCH'
'FLOW_IMPOSSIBLE_COMPLETION'
'FLOW_FORCED_CYCLE'
'FLOW_FORCED_NON_IDEMPOTENT'
'FLOW_DEAD_QUESTION'
'FLOW_DEAD_OPTION'
'ANSWER_DRAFT_INVALID'
'ANSWER_UNKNOWN_QUESTION'
'ANSWER_UNKNOWN_OPTION'
'ANSWER_WRONG_OWNER'
'ANSWER_DUPLICATE_OPTION'
'ANSWER_OPTION_DISALLOWED'
'ANSWER_SELECTION_BOUNDS'
'ANSWER_EXCLUSIVE_CONFLICT'
'ANSWER_QUESTION_NOT_INTERACTIVE'
```

- [ ] **Step 4: Run contract tests, typecheck, and lint**

```bash
npx vitest run packages/classification-core/src/compiler/questions/source-schema.test.ts
npm run typecheck
npm run lint
```

Expected: all commands PASS; compiler exports the new source and compiled-model types while the runtime root still exports none of the compiler schema.

- [ ] **Step 5: Commit**

```bash
git add packages/classification-core/src/contracts packages/classification-core/src/compiler
git commit -m "Add question model contracts"
```

---

### Task 2: Author the eight production question definitions

**Files:**
- Create: `packages/classification-core/src/definitions/questions.ts`
- Create: `packages/classification-core/src/definitions/questions.test.ts`
- Create: `packages/classification-core/src/definitions/classification.ts`
- Modify: `packages/classification-core/src/definitions/synthetic.ts` (remove after callers migrate)
- Modify: `packages/classification-core/src/compiler/source-schema.ts`
- Modify: `packages/classification-core/src/compiler/compile.ts`
- Modify: `packages/classification-core/src/compiler/compile.test.ts`
- Modify: `packages/classification-core/src/contracts/model.ts`
- Modify: `tools/validation/validate-classification.ts`

**Interfaces:**
- Consumes: Task 1 `QuestionDefinitionSource` and `questionDefinitionSourceSchema`; frozen legacy `questions.json` and `questionRules.ts` only as authoring sources.
- Produces: `questionDefinitions`, `classificationDefinition`, exact eight-question/53-option production inventory, and per-domain origins.

- [ ] **Step 1: Write failing inventory and decision-table tests**

```ts
import { describe, expect, test } from 'vitest'
import { questionDefinitions } from './questions.js'

describe('production questions', () => {
  test('locks the legacy question order and weights', () => {
    expect(questionDefinitions.map(({ id, weight }) => [id, weight])).toEqual([
      ['form', 16],
      ['archetype', 16],
      ['tare', 15],
      ['source', 18],
      ['body', 14],
      ['noodle', 11],
      ['signature', 10],
      ['exclusions', 0],
    ])
  })

  test('makes exclusions interactive and policy-driven', () => {
    const exclusions = questionDefinitions.find(({ id }) => id === 'exclusions')
    expect(exclusions?.initialUiOptionIds).toEqual(['none'])
    expect(exclusions?.pendingSelection).toEqual({
      emptyBehavior: { type: 'restore-initial-ui-options' },
    })
    expect(exclusions?.autoAnswer).toBeUndefined()
  })

test('declares every archetype row for every preference question', () => {
    const archetypes = [
      'chintan', 'paitan', 'konbusui-light', 'gyokai-rich', 'miso-rich',
      'tsukemen-other', 'aburasoba', 'taiwan-mazesoba', 'soupless-tantan', 'dry-other',
    ]
    for (const id of ['tare', 'source', 'body', 'noodle', 'signature']) {
      const question = questionDefinitions.find((item) => item.id === id)
      expect(question?.allowedOptions).toHaveLength(archetypes.length)
    }
  })

  test('keeps repeated legacy values scoped to their owning question', () => {
    const source = questionDefinitions.find(({ id }) => id === 'source')
    const exclusions = questionDefinitions.find(({ id }) => id === 'exclusions')
    expect(source?.options.some(({ id }) => id === 'pork')).toBe(true)
    expect(exclusions?.options.some(({ id }) => id === 'pork')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the definitions test and confirm red**

```bash
npx vitest run packages/classification-core/src/definitions/questions.test.ts
```

Expected: FAIL because `questions.ts` does not exist.

- [ ] **Step 3: Transcribe exact production IDs and semantic rules**

Create `questions.ts` as `as const satisfies readonly QuestionDefinitionSource[]`. Use stable kebab-case message IDs such as `question-form-title`, `question-form-description`, `option-form-soup-label`, and `option-form-soup-description`; do not copy translated sentences.

The definitions must preserve these exact source facts:

```ts
export const productionQuestionIds = [
  'form', 'archetype', 'tare', 'source',
  'body', 'noodle', 'signature', 'exclusions',
] as const

export const archetypeIds = [
  'chintan', 'paitan', 'konbusui-light', 'gyokai-rich', 'miso-rich',
  'tsukemen-other', 'aburasoba', 'taiwan-mazesoba', 'soupless-tantan', 'dry-other',
] as const
```

- `form` options are `soup`, `tsukemen`, and `dry`.
- `archetype` options are selected by explicit form rows: soup → `chintan`, `paitan`; tsukemen → `konbusui-light`, `gyokai-rich`, `miso-rich`, `tsukemen-other`; dry → `aburasoba`, `taiwan-mazesoba`, `soupless-tantan`, `dry-other`.
- `form` and `exclusions` are unconditionally reachable; `archetype.availableWhen` is `answered(form)`; each preference question's `availableWhen` is `answered(archetype)`.
- `tare`, `source`, `body`, `noodle`, and `signature` contain the exact option IDs and archetype restrictions from legacy `src/data/questions.json` and `src/domain/questionRules.ts`.
- `chintan`, `paitan`, `tsukemen-other`, and `dry-other` have explicit `{ type: 'all' }` rows for every preference question.
- `tare` through `signature` use `{ type: 'single-allowed-option' }`; `form`, `archetype`, and `exclusions` do not.
- `source` and `signature` have one exclusive option (`unsure` and `no-preference`); `exclusions` has exclusive `none`.
- The question selections are `1..1`, `1..1`, `1..1`, `1..2`, `1..1`, `1..1`, `1..2`, and `1..8` respectively.

Build `classificationDefinition` with per-domain origins:

```ts
export const classificationDefinition = {
  modelVersion: 'batch2a.1.0',
  provenance: {
    questions: { origin: 'legacy-production' },
    styles: { origin: 'synthetic' },
    scoringPolicy: { origin: 'synthetic' },
  },
  questions: questionDefinitions,
  styles: syntheticStyles,
  policy: syntheticPolicy,
} as const
```

Retain the existing proof style and policy, but replace its ambiguous `familyOptionId` reference with `{ questionId: 'archetype', optionId: 'chintan' }` so reference validation remains meaningful. Change duplicate-option validation from global IDs to `(questionId, optionId)` pairs. Build inventory keys as `option/<questionId>:<optionId>` while keeping the flow/persistence option value unchanged, and add `ownerQuestionId` to option concept records. Remove the global `mode` field and the obsolete all-synthetic definition export after updating callers.

- [ ] **Step 4: Run production definition and existing compiler tests**

```bash
npx vitest run packages/classification-core/src/definitions/questions.test.ts packages/classification-core/src/compiler/compile.test.ts
npm run classification:validate
```

Expected: PASS; validation reports 8 production questions while styles and scoring remain explicitly synthetic.

- [ ] **Step 5: Commit**

```bash
git add packages/classification-core/src/definitions packages/classification-core/src/compiler tools/validation
git commit -m "Add production question definitions"
```

---

### Task 3: Canonicalize questions and derive semantic dependencies

**Files:**
- Create: `packages/classification-core/src/compiler/questions/canonicalize.ts`
- Create: `packages/classification-core/src/compiler/questions/canonicalize.test.ts`
- Create: `packages/classification-core/src/compiler/questions/dependencies.ts`
- Create: `packages/classification-core/src/compiler/questions/dependencies.test.ts`

**Interfaces:**
- Consumes: Task 1 source contracts and Task 2 definitions.
- Produces: `canonicalizeQuestionSource`, `extractConditionReferences`, and `deriveQuestionGraph` with deterministic dependencies, closures, and topological order.

- [ ] **Step 1: Write failing canonicalization and graph tests**

```ts
test('canonicalizes source order and commutative conditions', () => {
  const left = canonicalizeQuestionSource(questionDefinitions)
  const right = canonicalizeQuestionSource(
    [...questionDefinitions].reverse().map((question) => ({
      ...question,
      options: [...question.options].reverse(),
    })),
  )
  expect(stableJson(left)).toBe(stableJson(right))
})

test('derives archetype validity dependencies from decision rows', () => {
  const canonical = canonicalizeQuestionSource(questionDefinitions)
  const graph = deriveQuestionGraph(canonical)
  expect(graph.semanticDependencies.tare).toEqual(['archetype'])
  expect(graph.dependentClosures.form).toEqual([
    'archetype', 'tare', 'source', 'body', 'noodle', 'signature',
  ])
  expect(graph.dependentClosures.form).not.toContain('exclusions')
})

test('rejects duplicate order and unknown condition references', () => {
  const result = deriveQuestionGraph(canonicalizeQuestionSource(invalidDefinitions))
  expect(result.diagnostics.map(({ code }) => code)).toEqual([
    'QUESTION_ORDER_DUPLICATE',
    'CONDITION_REFERENCE_UNKNOWN',
  ])
})
```

- [ ] **Step 2: Run the focused tests and confirm red**

```bash
npx vitest run packages/classification-core/src/compiler/questions/canonicalize.test.ts packages/classification-core/src/compiler/questions/dependencies.test.ts
```

Expected: FAIL because canonicalization and graph modules do not exist.

- [ ] **Step 3: Implement canonical IR and reference collection**

Canonicalize questions and options by numeric order then `compareCodePoints(id)`. Sort `all`/`any` children by `stableJson(child)`, canonicalize `only.optionIds` by the owning question's option order, materialize absent arrays as `[]`, and never use locale comparison.

Reference extraction must visit every semantic field:

```ts
export function conditionReferences(condition: SerializableCondition): readonly string[] {
  switch (condition.type) {
    case 'answered':
    case 'answer-includes':
      return [condition.questionId]
    case 'not':
      return conditionReferences(condition.condition)
    case 'all':
    case 'any':
      return uniqueSorted(condition.conditions.flatMap(conditionReferences))
  }
}
```

Include question `availableWhen`, option `availableWhen`, every allowed-option row, `selection.overrides[].when`, and `autoAnswer.when`. Build reverse edges, transitive dependent closures, stable Kahn topological order, and cycle diagnostics. Keep display order independent.

- [ ] **Step 4: Run graph tests and compiler regression tests**

```bash
npx vitest run packages/classification-core/src/compiler/questions/canonicalize.test.ts packages/classification-core/src/compiler/questions/dependencies.test.ts packages/classification-core/src/compiler/compile.test.ts
npm run typecheck
```

Expected: PASS with the exact closure asserted above and no source-order changes.

- [ ] **Step 5: Commit**

```bash
git add packages/classification-core/src/compiler/questions
git commit -m "Derive question dependency graph"
```

---

### Task 4: Implement sound finite semantic exploration and proofs

**Files:**
- Create: `packages/classification-core/src/compiler/questions/explore.ts`
- Create: `packages/classification-core/src/compiler/questions/explore.test.ts`
- Create: `packages/classification-core/src/compiler/questions/proof.ts`
- Create: `packages/classification-core/src/compiler/questions/proof.test.ts`
- Create: `packages/classification-core/src/compiler/questions/test-fixtures.ts`

**Interfaces:**
- Consumes: canonical IR and derived graph from Task 3.
- Produces: `exploreQuestionSemantics`, `semanticSignature`, `proveForcedFixedPoint`, `proveQuestionModel`, reachable-state coverage, and deterministic proof diagnostics.

- [ ] **Step 1: Write failing soundness and negative-proof tests**

Create focused complete source fixtures in `test-fixtures.ts`: `twoOutputDefinition` has two upstream option states that keep `target` reachable but allow only `a` or only `b`; `emptyBranchDefinition` resolves a reachable required question to no options; `deadQuestionDefinition` has an always-false question condition; and `deadOptionDefinition` has an option unavailable in every reachable state. `forcedCycleCompiledModel` is an intentionally damaged compiled-model fixture that alternates two canonical forced states, bypassing source validation solely to exercise defensive cycle detection. Every source fixture uses unique IDs/orders and valid local bounds so its named proof failure is the only error.

```ts
test('does not merge branches with equal truth but different allowed outputs', () => {
  const exploration = exploreQuestionSemantics(twoOutputDefinition)
  expect(exploration.signatures.map((item) => item.allowedOptionIdsByQuestion.target)).toEqual([
    ['a'],
    ['b'],
  ])
})

test.each([
  ['empty branch', emptyBranchDefinition, 'FLOW_EMPTY_BRANCH'],
  ['dead question', deadQuestionDefinition, 'FLOW_DEAD_QUESTION'],
  ['dead option', deadOptionDefinition, 'FLOW_DEAD_OPTION'],
])('rejects %s', (_name, definition, code) => {
  const result = proveQuestionModel(definition)
  expect(result.diagnostics.map((item) => item.code)).toContain(code)
})

test('detects a repeated canonical key in defensive forced resolution', () => {
  const result = proveForcedFixedPoint(forcedCycleCompiledModel)
  expect(result.diagnostics.map((item) => item.code)).toContain('FLOW_FORCED_CYCLE')
})

test('covers every production question and option', () => {
  const proof = proveQuestionModel(questionDefinitions)
  expect(proof.diagnostics).toEqual([])
  expect(proof.coverage.questionIds).toEqual(questionDefinitions.map(({ id }) => id))
  expect(proof.coverage.optionIds).toHaveLength(53)
})
```

- [ ] **Step 2: Run proof tests and confirm red**

```bash
npx vitest run packages/classification-core/src/compiler/questions/explore.test.ts packages/classification-core/src/compiler/questions/proof.test.ts
```

Expected: FAIL because exploration and proof modules do not exist.

- [ ] **Step 3: Implement semantic signatures and representative local states**

The signature key must serialize all of these values:

```ts
export interface SemanticSignature {
  readonly conditionTruthVector: readonly boolean[]
  readonly reachableQuestionIds: readonly string[]
  readonly allowedOptionIdsByQuestion: Readonly<Record<string, readonly string[]>>
  readonly effectiveSelectionBounds: Readonly<Record<string, { readonly min: number; readonly max: number }>>
  readonly forcedEligibility: Readonly<Record<string, 'interactive' | 'forced' | 'unreachable'>>
  readonly answerValidity: Readonly<Record<string, 'missing' | 'valid' | 'stale' | 'invalid'>>
}
```

For each semantic environment, enumerate unanswered, min, max, below-min, above-max, each exclusive alone, exclusive conflict, forced singleton, empty branch, stale answer, explicit allow-all, and every option combination named by a condition. Deduplicate only by complete `stableJson(signature)`.

The proof pass must check next-action existence, satisfiable bounds, empty branches, possible completion, complete-answer coverage, exclusivity, forced legality, fixed point, idempotence, graph acyclicity, and formal question/option reachability. It also emits, for each question, the `JSON.stringify(optionIdsInCompiledOrder)` keys that are legal in at least one reachable semantic environment; runtime uses these only to distinguish deterministic branch staleness from intrinsically invalid input. Forced iteration uses a canonical state-key `Set` plus an upper bound derived from question and option counts.

- [ ] **Step 4: Run proof tests twice to prove deterministic results**

```bash
npx vitest run packages/classification-core/src/compiler/questions/explore.test.ts packages/classification-core/src/compiler/questions/proof.test.ts
npx vitest run packages/classification-core/src/compiler/questions/explore.test.ts packages/classification-core/src/compiler/questions/proof.test.ts
npm run typecheck
```

Expected: both runs PASS with identical proof outputs and the production coverage count.

- [ ] **Step 5: Commit**

```bash
git add packages/classification-core/src/compiler/questions
git commit -m "Prove production question semantics"
```

---

### Task 5: Compile and track the deterministic question artifact

**Files:**
- Create: `packages/classification-core/src/compiler/questions/compile.ts`
- Create: `packages/classification-core/src/compiler/questions/compile.test.ts`
- Create: `packages/classification-core/src/compiler/questions/serialize.ts`
- Create: `packages/classification-core/src/compiler/questions/serialize.test.ts`
- Create: `packages/classification-core/src/generated/question-model.ts`
- Create: `tools/questions/generate-question-model.ts`
- Create: `tools/questions/generate-question-model.test.ts`
- Modify: `packages/classification-core/src/compiler/compile.ts`
- Modify: `packages/classification-core/src/compiler/index.ts`
- Modify: `packages/classification-core/src/contracts/model.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 2–4 definitions, canonical IR, graph, and proof result.
- Produces: `compileQuestions`, `renderQuestionArtifact`, tracked `questionModel`, `questions:generate`, and read-only `questions:check`.

- [ ] **Step 1: Write failing hash, serialization, and drift tests**

```ts
test('separates source and semantic hashes', () => {
  const original = compileQuestions(questionDefinitions)
  const metadataOnly = compileQuestions(questionDefinitions.map((question) =>
    question.id === 'form'
      ? {
          ...question,
          messageIds: {
            ...question.messageIds,
            description: 'question-form-description-revised',
          },
        }
      : question,
  ))
  expect(original.ok && metadataOnly.ok).toBe(true)
  if (!original.ok || !metadataOnly.ok) return
  expect(original.model.metadata.sourceHash).not.toBe(metadataOnly.model.metadata.sourceHash)
  expect(original.model.metadata.semanticHash).toBe(metadataOnly.model.metadata.semanticHash)
})

test('keeps question weight opaque to flow semantics', () => {
  const original = compileQuestions(questionDefinitions)
  const reweighted = compileQuestions(questionDefinitions.map((question) =>
    question.id === 'form' ? { ...question, weight: 17 } : question,
  ))
  if (!original.ok || !reweighted.ok) throw new Error('test definitions must compile')
  expect(original.model.metadata.sourceHash).not.toBe(reweighted.model.metadata.sourceHash)
  expect(original.model.metadata.semanticHash).toBe(reweighted.model.metadata.semanticHash)
})

test('renders identical bytes from reordered equivalent source', () => {
  const reordered = [...questionDefinitions].reverse().map((question) => ({
    ...question,
    options: [...question.options].reverse(),
  }))
  expect(renderQuestionArtifact(questionDefinitions)).toBe(renderQuestionArtifact(reordered))
})

test('check mode reports drift without writing', async () => {
  const before = await readFile(generatedPath, 'utf8')
  await expect(runQuestionGenerator({ mode: 'check', rendered: `${before}\n` }))
    .rejects.toThrow('question model artifact drift')
  expect(await readFile(generatedPath, 'utf8')).toBe(before)
})
```

- [ ] **Step 2: Run compiler and generator tests and confirm red**

```bash
npx vitest run packages/classification-core/src/compiler/questions/compile.test.ts packages/classification-core/src/compiler/questions/serialize.test.ts tools/questions/generate-question-model.test.ts
```

Expected: FAIL because compiler, serializer, artifact, and CLI do not exist.

- [ ] **Step 3: Implement compile orchestration and non-circular hashes**

Use SHA-256 over canonical `stableJson` projections:

```ts
const sourceHash = sha256(stableJson(canonicalSource))
const semanticHash = sha256(stableJson({
  questions: compiledQuestions.map(projectFlowSemantics),
  semanticDependencies: graph.semanticDependencies,
  dependentClosures: graph.dependentClosures,
  topologicalOrder: graph.topologicalOrder,
}))
```

Emit metadata values exactly as:

```ts
{
  schemaVersion: '1',
  compilerVersion: '1',
  modelVersion: 'batch2a.1.0',
  sourceHash,
  semanticHash,
}
```

Attach the proof's canonical `validSelectionKeys` to each compiled question and emit `forcedIterationUpperBound` from the proven finite model size. Do not include metadata descriptions, question weights, repository identity, timestamps, or the hashes themselves in the semantic projection. `compileClassification` consumes `compileQuestions` and builds inventory from the compiled production question nodes while retaining synthetic style/policy provenance.

- [ ] **Step 4: Implement deterministic TS rendering and CLI modes**

Render this module shape with canonical object keys and arrays:

```ts
export function renderQuestionArtifact(model: CompiledQuestionModel) {
  const value = JSON.stringify(stableValue(model), null, 2)
  return [
    "import { deepFreeze } from '../contracts/deep-freeze.js'",
    '',
    `const compiledQuestionModel = ${value} as const`,
    '',
    'export const questionModel = deepFreeze(compiledQuestionModel)',
    '',
  ].join('\n')
}
```

`--write` performs an atomic sibling-file replace only when bytes differ. `--check` compiles in memory, compares exact bytes, returns non-zero with `Run npm run questions:generate`, and never writes.

Add root scripts:

```json
{
  "questions:generate": "tsx tools/questions/generate-question-model.ts --write",
  "questions:check": "tsx tools/questions/generate-question-model.ts --check"
}
```

- [ ] **Step 5: Generate once, then prove no drift**

```bash
npm run questions:generate
npm run questions:check
npx vitest run packages/classification-core/src/compiler/questions tools/questions
npm run typecheck
```

Expected: generation writes one tracked file; check and tests PASS without modifying it.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/classification-core/src tools/questions
git commit -m "Generate deterministic question model"
```

---

### Task 6: Evaluate drafts into canonical fixed-point FlowState

**Files:**
- Create: `packages/classification-core/src/flow/types.ts`
- Create: `packages/classification-core/src/flow/decode.ts`
- Create: `packages/classification-core/src/flow/decode.test.ts`
- Create: `packages/classification-core/src/flow/evaluate.ts`
- Create: `packages/classification-core/src/flow/evaluate.test.ts`
- Create: `packages/classification-core/src/flow/test-fixtures.ts`
- Create: `packages/classification-core/src/flow/index.ts`

**Interfaces:**
- Consumes: Task 5 `CompiledQuestionModel` and generated `questionModel`.
- Produces: `AnswerDraft`, `decodeAnswerDraft`, discriminated `FlowState`, `evaluateFlow`, canonical answers, forced answers, repairs, and stable diagnostics.

- [ ] **Step 1: Write failing decoder and evaluation tests**

```ts
test('decodes primitive draft structure without trusting semantic IDs', () => {
  expect(decodeAnswerDraft({ form: ['soup'] })).toEqual({
    ok: true,
    draft: { form: ['soup'] },
  })
  expect(decodeAnswerDraft({ form: 'soup' }).ok).toBe(false)
  expect(decodeAnswerDraft([]).ok).toBe(false)
})

test('keeps initial UI selections out of canonical answers', () => {
  const state = evaluateFlow(questionModel, {})
  expect(state.status).toBe('incomplete')
  expect(state.canonicalAnswers).toEqual({})
  expect(state.canonicalAnswers.exclusions).toBeUndefined()
})

test('resolves a forced tare to a fixed point', () => {
  const state = evaluateFlow(questionModel, {
    form: ['tsukemen'],
    archetype: ['miso-rich'],
  })
  expect(state.canonicalAnswers.tare).toEqual(['miso'])
  expect(state.forcedAnswers).toEqual([{
    questionId: 'tare',
    optionIds: ['miso'],
    reason: 'single-allowed-option',
  }])
})

test('repairs branch-stale under-min answers but rejects intrinsic under-min answers', () => {
  const stale = evaluateFlow(questionModel, {
    form: ['dry'],
    archetype: ['aburasoba'],
    source: ['fish-seafood'],
  })
  expect(stale.status).toBe('incomplete')
  expect(stale.canonicalAnswers.source).toBeUndefined()
  expect(stale.repairs.map(({ code }) => code)).toContain('remove-disallowed-option')

  const intrinsic = evaluateFlow(questionModel, {
    form: ['dry'],
    archetype: ['aburasoba'],
    source: [],
  })
  expect(intrinsic.status).toBe('invalid')
  expect(intrinsic.diagnostics.map(({ code }) => code)).toContain('ANSWER_SELECTION_BOUNDS')
})
```

- [ ] **Step 2: Run the focused tests and confirm red**

```bash
npx vitest run packages/classification-core/src/flow/decode.test.ts packages/classification-core/src/flow/evaluate.test.ts
```

Expected: FAIL because flow contracts and functions do not exist.

- [ ] **Step 3: Implement submitted/raw/canonical and state unions**

Derive runtime ID unions from the generated literal model and keep raw decoded keys structural:

```ts
export type QuestionId = typeof questionModel.questions[number]['id']
export type OptionId = typeof questionModel.questions[number]['options'][number]['id']
export type AnswerDraft = Readonly<Partial<Record<QuestionId, readonly OptionId[]>>>
export type DecodedAnswerDraft = Readonly<Record<string, readonly string[]>>
export type CompletedAnswers = Readonly<Record<QuestionId, readonly OptionId[]>>

export interface ForcedAnswer {
  readonly questionId: QuestionId
  readonly optionIds: readonly OptionId[]
  readonly reason: 'single-allowed-option'
}

export interface FlowRepair {
  readonly code:
    | 'remove-unreachable-answer'
    | 'remove-disallowed-option'
    | 'replace-with-forced-answer'
  readonly questionId: QuestionId
  readonly previousOptionIds: readonly OptionId[]
  readonly canonicalOptionIds?: readonly OptionId[]
}

export interface FlowStateBase {
  readonly canonicalAnswers: AnswerDraft
  readonly reachableQuestionIds: readonly QuestionId[]
  readonly interactiveQuestionIds: readonly QuestionId[]
  readonly allowedOptionIdsByQuestion: Readonly<Partial<Record<QuestionId, readonly OptionId[]>>>
  readonly forcedAnswers: readonly ForcedAnswer[]
  readonly repairs: readonly FlowRepair[]
  readonly diagnostics: readonly Diagnostic[]
}

export type FlowState =
  | (FlowStateBase & { readonly status: 'incomplete'; readonly completedAnswers?: never })
  | (FlowStateBase & { readonly status: 'invalid'; readonly completedAnswers?: never })
  | (FlowStateBase & { readonly status: 'complete'; readonly completedAnswers: CompletedAnswers })

export function evaluateFlow(
  model: CompiledQuestionModel,
  input: unknown,
): FlowState
```

`decodeAnswerDraft` accepts only a non-array plain object whose own enumerable values are arrays of strings. It returns deep-frozen data and RFC 6901 diagnostics for invalid primitive shapes. It does not discard unknown IDs; semantic validation reports those deterministically.

Create shared test fixtures with canonical option order:

```ts
export const chintanDraft = {
  form: ['soup'],
  archetype: ['chintan'],
} as const

export const misoRichDraft = {
  form: ['tsukemen'],
  archetype: ['miso-rich'],
} as const

export const completeSoupDraft = {
  form: ['soup'],
  archetype: ['chintan'],
  tare: ['shoyu'],
  source: ['pork'],
  body: ['balanced'],
  noodle: ['medium-thin-straight'],
  signature: ['no-preference'],
  exclusions: ['none'],
} as const
```

- [ ] **Step 4: Implement fixed-point evaluation and stale-state proof use**

Evaluate in compiled topological order. For each iteration:

1. validate known question and option ownership
2. resolve question reachability and allowed options
3. classify each submitted selection as valid, deterministic stale, or intrinsic invalid using the compiler-emitted valid selection keys
4. apply safe repairs only to a temporary canonical map
5. add or replace unique forced answers
6. compare the stable canonical state key and stop at fixed point

If a state key repeats, return invalid with `FLOW_FORCED_CYCLE`. Stop after the compiled iteration upper bound. Sort answers and option arrays by compiled order, repairs by question/reason, and diagnostics by question order/priority/option order/code.

- [ ] **Step 5: Add completion and immutability assertions**

Add a completed full-path fixture and verify:

```ts
const state = evaluateFlow(questionModel, completeSoupDraft)
expect(state.status).toBe('complete')
if (state.status === 'complete') expect(state.completedAnswers).toEqual(state.canonicalAnswers)
expect(() => Object.assign(state.canonicalAnswers, { form: ['dry'] })).toThrow()
expect(stableJson(evaluateFlow(questionModel, completeSoupDraft))).toBe(
  stableJson(evaluateFlow(questionModel, structuredClone(completeSoupDraft))),
)
```

- [ ] **Step 6: Run flow tests and package checks**

```bash
npx vitest run packages/classification-core/src/flow
npm run questions:check
npm run typecheck
npm run lint
```

Expected: PASS; no command modifies the generated artifact.

- [ ] **Step 7: Commit**

```bash
git add packages/classification-core/src/flow
git commit -m "Evaluate canonical question flow"
```

---

### Task 7: Apply submitted answers atomically

**Files:**
- Create: `packages/classification-core/src/flow/apply-answer.ts`
- Create: `packages/classification-core/src/flow/apply-answer.test.ts`
- Modify: `packages/classification-core/src/flow/types.ts`
- Modify: `packages/classification-core/src/flow/index.ts`

**Interfaces:**
- Consumes: Task 6 `evaluateFlow`, `AnswerDraft`, `FlowState`; Task 5 dependent closures.
- Produces: `AnswerSubmission`, `ApplyAnswerResult`, and `applyAnswer`.

- [ ] **Step 1: Write failing atomic transition tests**

```ts
test('rejects over-max and preserves the same draft object', () => {
  const draft = Object.freeze(chintanDraft)
  const result = applyAnswer(questionModel, draft, {
    questionId: 'source',
    optionIds: ['pork', 'chicken', 'duck'],
  })
  expect(result.accepted).toBe(false)
  expect(result.draft).toBe(draft)
})

test('does not invalidate descendants for a canonical no-op', () => {
  const draft = completeSoupDraft
  const result = applyAnswer(questionModel, draft, {
    questionId: 'source',
    optionIds: [...draft.source].reverse(),
  })
  expect(result.accepted).toBe(true)
  if (result.accepted) {
    expect(result.changed).toBe(false)
    expect(result.invalidatedQuestionIds).toEqual([])
    expect(result.draft).toBe(draft)
  }
})

test('changing form clears only its dependent closure', () => {
  const result = applyAnswer(questionModel, completeSoupDraft, {
    questionId: 'form',
    optionIds: ['dry'],
  })
  expect(result.accepted).toBe(true)
  if (result.accepted) {
    expect(result.invalidatedQuestionIds).toEqual([
      'archetype', 'tare', 'source', 'body', 'noodle', 'signature',
    ])
    expect(result.draft.exclusions).toEqual(completeSoupDraft.exclusions)
  }
})
```

- [ ] **Step 2: Run the transition test and confirm red**

```bash
npx vitest run packages/classification-core/src/flow/apply-answer.test.ts
```

Expected: FAIL because `applyAnswer` does not exist.

- [ ] **Step 3: Implement the discriminated transition result**

```ts
export interface AnswerSubmission {
  readonly questionId: QuestionId
  readonly optionIds: readonly OptionId[]
}

export interface ForcedAnswerChange {
  readonly questionId: QuestionId
  readonly previousOptionIds?: readonly OptionId[]
  readonly nextOptionIds?: readonly OptionId[]
  readonly reason: 'single-allowed-option'
}

export type ApplyAnswerResult =
  | {
      readonly accepted: true
      readonly changed: boolean
      readonly draft: AnswerDraft
      readonly state: FlowState
      readonly invalidatedQuestionIds: readonly QuestionId[]
      readonly forcedChanges: readonly ForcedAnswerChange[]
    }
  | {
      readonly accepted: false
      readonly draft: AnswerDraft
      readonly state: FlowState
      readonly diagnostics: readonly Diagnostic[]
    }

export function applyAnswer(
  model: CompiledQuestionModel,
  draft: AnswerDraft,
  submission: AnswerSubmission,
): ApplyAnswerResult
```

Evaluate the previous draft first. Reject unknown, unreachable, or currently forced questions; unknown/wrong-owner/disallowed/duplicate/conflicting options; and selections outside effective bounds. A full selection containing an exclusive plus any other option returns `ANSWER_EXCLUSIVE_CONFLICT` rather than guessing toggle order.

Canonicalize by compiled option order before equality comparison. For a changed accepted answer, clone only the top-level draft, set the submitted answer, delete every question in the compiled dependent closure, deep-freeze the result, and evaluate it. Diff the previous and next states' forced-answer maps in question order to produce added, replaced, and removed `ForcedAnswerChange` entries. For unchanged accepted input, return the original draft reference.

- [ ] **Step 4: Add rejection table coverage and run tests**

Use `test.each` for every rejection code:

```ts
test.each([
  ['unknown question', chintanDraft, { questionId: 'missing', optionIds: ['soup'] }, 'ANSWER_UNKNOWN_QUESTION'],
  ['duplicate option', chintanDraft, { questionId: 'source', optionIds: ['pork', 'pork'] }, 'ANSWER_DUPLICATE_OPTION'],
  ['exclusive conflict', chintanDraft, { questionId: 'source', optionIds: ['unsure', 'pork'] }, 'ANSWER_EXCLUSIVE_CONFLICT'],
  ['forced question', misoRichDraft, { questionId: 'tare', optionIds: ['miso'] }, 'ANSWER_QUESTION_NOT_INTERACTIVE'],
])('%s', (_name, draft, submission, code) => {
  const result = applyAnswer(questionModel, draft, submission)
  expect(result.accepted).toBe(false)
  if (!result.accepted) expect(result.diagnostics.map((item) => item.code)).toContain(code)
})
```

Run:

```bash
npx vitest run packages/classification-core/src/flow/apply-answer.test.ts packages/classification-core/src/flow/evaluate.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/classification-core/src/flow
git commit -m "Apply question answers atomically"
```

---

### Task 8: Add generic pending selection and stable-ID navigation

**Files:**
- Create: `packages/classification-core/src/flow/pending-selection.ts`
- Create: `packages/classification-core/src/flow/pending-selection.test.ts`
- Create: `packages/classification-core/src/flow/navigation.ts`
- Create: `packages/classification-core/src/flow/navigation.test.ts`
- Modify: `packages/classification-core/src/flow/types.ts`
- Modify: `packages/classification-core/src/flow/index.ts`

**Interfaces:**
- Consumes: evaluated per-question allowed options, bounds, exclusivity, and compiled pending policy.
- Produces: `updatePendingSelection`, `getFirstActionableQuestion`, `getNextInteractiveQuestion`, and `getPreviousInteractiveQuestion`.

- [ ] **Step 1: Write failing interaction-policy and navigation tests**

In the test module, define `makeQuestionState` as a deep-frozen builder whose defaults are one ordinary `pork` option, one exclusive `none` option, bounds `1..2`, compiled order `['pork', 'none']`, `allow-empty`, and no initial UI options. Define `sourceState` from the evaluated `source` question under `chintanDraft`, and define `select(state, current, optionId)` as `updatePendingSelection(state, current, { type: 'select', optionId }).optionIds`.

```ts
test('uses compiled empty behavior without checking exclusions ID', () => {
  const genericState = makeQuestionState({
    questionId: 'generic',
    initialUiOptionIds: ['none'],
    emptyBehavior: { type: 'restore-initial-ui-options' },
  })
  expect(updatePendingSelection(genericState, ['pork'], {
    type: 'deselect', optionId: 'pork',
  }).optionIds).toEqual(['none'])
})

test('preserves exclusive and max-selection legacy toggles', () => {
  expect(select(sourceState, ['pork'], 'unsure')).toEqual(['unsure'])
  expect(select(sourceState, ['unsure'], 'pork')).toEqual(['pork'])
  expect(select(sourceState, ['pork', 'chicken'], 'duck')).toEqual(['pork', 'chicken'])
})

test('navigates from a known forced question by compiled position', () => {
  const state = evaluateFlow(questionModel, misoRichDraft)
  expect(getNextInteractiveQuestion(state, 'tare')).toBe('source')
  expect(getPreviousInteractiveQuestion(state, 'tare')).toBe('archetype')
})
```

- [ ] **Step 2: Run focused tests and confirm red**

```bash
npx vitest run packages/classification-core/src/flow/pending-selection.test.ts packages/classification-core/src/flow/navigation.test.ts
```

Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Implement pending selection operations**

Define only explicit operations:

```ts
export interface PendingQuestionState<
  Question extends string = QuestionId,
  Option extends string = OptionId,
> {
  readonly questionId: Question
  readonly optionOrder: readonly Option[]
  readonly allowedOptionIds: readonly Option[]
  readonly exclusiveOptionIds: readonly Option[]
  readonly minSelections: number
  readonly maxSelections: number
  readonly initialUiOptionIds: readonly Option[]
  readonly emptyBehavior:
    | { readonly type: 'allow-empty' }
    | { readonly type: 'restore-initial-ui-options' }
}

export type PendingSelectionOperation<Option extends string = OptionId> =
  | { readonly type: 'select'; readonly optionId: Option }
  | { readonly type: 'deselect'; readonly optionId: Option }
```

Reject unknown/disallowed operations with diagnostics and unchanged canonical pending IDs. Selecting exclusive returns only it; selecting ordinary removes exclusive; selecting a new ordinary at max is a no-op; deselection applies compiled `emptyBehavior`; all results use compiled option order. Do not import or compare production question constants.

- [ ] **Step 4: Implement cursor-free navigation**

`getFirstActionableQuestion` returns the first interactive question without a canonical answer. Next/previous import the frozen production `questionModel` to locate the known `fromQuestionId` in compiled display order, then scan in the requested direction for an ID in `interactiveQuestionIds`; they do not store a cursor or accept `stepIndex`. Complete and invalid states return `undefined`; unknown runtime strings throw `Unknown question ID <id>` at the internal typed boundary.

- [ ] **Step 5: Run flow suite and reject question-specific branches**

```bash
npx vitest run packages/classification-core/src/flow
! rg -n "questionId === ['\"]exclusions|case ['\"]exclusions" packages/classification-core/src/flow
npm run typecheck
npm run lint
```

Expected: tests PASS and the source scan finds no exclusions-specific runtime branch.

- [ ] **Step 6: Commit**

```bash
git add packages/classification-core/src/flow
git commit -m "Add question interaction navigation"
```

---

### Task 9: Replace the rejected extractor with observable trace contracts and strict isolation

**Files:**
- Create replacement contract: `tools/parity/questions/contracts.ts`
- Create replacement tests: `tools/parity/questions/contracts.test.ts`
- Create replacement extractor: `tools/parity/questions/extractor.ts`
- Create replacement tests: `tools/parity/questions/extractor.test.ts`
- Create replacement CLI: `tools/parity/questions/extract.ts`
- Create replacement patch: `tools/parity/questions/legacy-instrumentation.patch`
- Create replacement seeds: `tools/parity/questions/seeds.json`
- Create: `docs/migration/incidents/2026-07-13-legacy-cache-isolation.md`
- Do not modify: `docs/migration/ledger.json`, `docs/migration/ledger.md`, fixtures, runtime/compiler code, or the original legacy checkout

**Interfaces:**
- Consumes: reviewed Task 8 baseline `7a198bf7a9195a82e84ff4230e9fe61af40b7018`, the corrected Sections 16–18 contract, exact legacy identity, trusted absolute Git/Node/npm paths, and public legacy UI actions.
- Produces: `LegacyObservableTraceCase`, strict manifest/divergence schemas, exact seed/raw binding, an isolated `extract.ts --legacy <path> [--replace|--verify-only]` authoring flow, the incident record, and a fresh high-risk review gate.

- [ ] **Step 0: Remove the rejected Task 9 implementation from the execution baseline**

The branch coordinator must reconstruct the task branch from the reviewed Task 8 commit and then apply this two-document contract-revision commit. Do not revert `3b65eac` on top and leave its ledger or extractor changes in history.

```bash
TASK8_BASE=7a198bf7a9195a82e84ff4230e9fe61af40b7018
REJECTED_TASK9=3b65eac3befb6ee7b3aa460bc1ff940027830a3e
git merge-base --is-ancestor "$TASK8_BASE" HEAD
! git merge-base --is-ancestor "$REJECTED_TASK9" HEAD
git diff --name-only "$TASK8_BASE"..HEAD
```

Expected: both ancestry assertions exit 0 and the diff lists only the corrected spec and plan. No rejected parity tool, fixture, or ledger change is present.

- [ ] **Step 1: Write failing observable-contract and forbidden-field tests**

```ts
const validFrame = {
  sequence: 0,
  transition: 'initial',
  displayedQuestionId: 'form',
  visibleOptionIds: ['soup', 'dry'],
  pendingOptionIds: [],
  legacyAnswers: {},
} as const

const validTraceCaseWithoutCoverage = {
  id: 'soup-chintan-complete',
  actions: [
    { type: 'select', questionId: 'form', optionId: 'soup' },
    { type: 'continue', fromQuestionId: 'form' },
  ],
  frames: [
    validFrame,
    {
      sequence: 1,
      transition: 'toggle',
      actionIndex: 0,
      displayedQuestionId: 'form',
      visibleOptionIds: ['soup', 'dry'],
      pendingOptionIds: ['soup'],
      legacyAnswers: { form: 'soup' },
    },
    {
      sequence: 2,
      transition: 'submit',
      actionIndex: 1,
      displayedQuestionId: 'form',
      legacyAnswers: { form: 'soup' },
    },
    {
      sequence: 3,
      transition: 'next',
      actionIndex: 1,
      displayedQuestionId: 'archetype',
      navigation: { direction: 'next', reachedQuestionId: 'archetype' },
      legacyAnswers: { form: 'soup' },
    },
  ],
} as const

const validTraceCase = {
  ...validTraceCaseWithoutCoverage,
  coverageTags: deriveObservableCoverage(validTraceCaseWithoutCoverage),
}

test('accepts observable frames with unobservable fields omitted', () => {
  expect(legacyObservableTraceCaseSchema.safeParse(validTraceCase).success).toBe(true)
  expect(legacyObservableTraceFrameSchema.safeParse({
    sequence: 1,
    transition: 'previous',
    actionIndex: 0,
    navigation: { direction: 'previous', reachedQuestionId: 'form' },
  }).success).toBe(true)
})

test.each([
  'canonicalAnswers', 'reachableQuestionIds', 'interactiveQuestionIds',
  'allowedOptionIdsByQuestion', 'repairs', 'diagnostics',
  'invalidatedQuestionIds', 'accepted', 'dependencyClosures',
  'fixedPointIterations',
])('rejects new-only frozen field %s', (field) => {
  expect(legacyObservableTraceFrameSchema.safeParse({
    ...validFrame,
    [field]: [],
  }).success).toBe(false)
})

test('frozen manifest rejects current verification fields', () => {
  expect(fixtureManifestSchema.safeParse({
    ...validFixtureManifest,
    verifiedSemanticHash: 'a'.repeat(64),
  }).success).toBe(false)
})

test('seed cases reject output-derived coverage metadata', () => {
  expect(legacyObservableSeedCaseSchema.safeParse({
    id: validTraceCase.id,
    actions: validTraceCase.actions,
    coverageTags: validTraceCase.coverageTags,
  }).success).toBe(false)
})
```

Keep transport-normalization, wrong identity/commit/tree/lock/source hash, dirty checkout, patch-drift, illegal path/case ID, and existing-output-without-`--replace` tests from the approved trust boundary, rewritten against the replacement implementation rather than copied from `3b65eac`.

- [ ] **Step 2: Run the contract tests and confirm red**

```bash
npx vitest run tools/parity/questions/contracts.test.ts tools/parity/questions/extractor.test.ts
```

Expected: FAIL because the observable trace schema and corrected extractor contracts are absent.

- [ ] **Step 3: Implement strict observable trace and manifest schemas**

Define the observable types exactly as approved in design Section 17, including:

```ts
export type LegacyNavigationDirection = 'next' | 'previous'
export type LegacyObservableTransition =
  | 'initial' | 'toggle' | 'submit' | 'forced-skip'
  | 'next' | 'previous' | 'complete'

export type LegacyObservableAction =
  | { readonly type: 'select'; readonly questionId: string; readonly optionId: string }
  | { readonly type: 'deselect'; readonly questionId: string; readonly optionId: string }
  | { readonly type: 'continue'; readonly fromQuestionId: string }
  | { readonly type: 'previous'; readonly fromQuestionId: string }

export interface LegacyObservableTraceCase {
  readonly id: string
  readonly actions: readonly LegacyObservableAction[]
  readonly coverageTags: readonly string[]
  readonly frames: readonly LegacyObservableTraceFrame[]
}
```

Implement `LegacyObservableTraceFrame`, `LegacyObservedAnswers`, and `LegacyObservedChanges` exactly as Section 17. Every field other than `sequence` and `transition` is optional because the legacy may not directly observe it. Strict schemas reject unknown keys. Sequence numbers begin at zero and increase by one. `initial` is the only frame without `actionIndex`. A `select` or `deselect` action maps to exactly one `toggle` frame. A `continue` action maps to exactly one `submit`, then zero or more `forced-skip`, then exactly one `next` or `complete`, all with the same action index; no other transition may share that index. A `previous` action maps to exactly one `previous` frame. `forced-skip` requires `forcedAutoAnswer`, while other transitions forbid it. `next` requires `navigation.direction: 'next'`; `previous` requires `navigation.direction: 'previous'`; `complete` requires `completionMarker: 'results'`. Target question/screen fields remain optional only where the legacy cannot directly observe them. Do not add a catch-all metadata object.

Coverage tags have only these forms:

```ts
type TraceCoverageTag =
  | `question:${string}`
  | `option:${string}:${string}`
  | `action:${LegacyObservableAction['type']}`
  | `transition:${LegacyObservableTransition}`
  | `navigation-target:${string | 'results'}`
  | `behavior:${
      | 'forced-skip'
      | 'completion'
      | 'exclusive-replacement'
      | 'max-no-op'
      | 'empty-restoration'
      | 'branch-visible-change'
      | 'branch-answer-change'
    }`
```

`deriveObservableCoverage({ actions, frames })` derives tags only after the trace passes strict action/frame validation. Frozen `coverageTags` must equal that deduplicated code-point-sorted result. Seed schemas strictly reject `coverageTags`; visible-option, navigation-target, forced-skip, completion, and named behavior tags are therefore results of observation, never seed expectations. Reject `semantic-class:*`, repair, diagnostic, invalid-input, global reachability, dependency, fixed-point, and application-result coverage.

Keep the immutable manifest fields from the approved design: schema versions; normalized repository, commit, and tree; exact source and lock hashes; extractor/instrumentation identities; isolated runtime contract; ordered case IDs/count; and fixture content hash. Strictly reject current semantic hash, parity-suite version, implementation SHA, assurance, and all excluded runtime metadata. Keep reviewed JSON-Patch-style divergence validation, but require every pointer to start `/frames/` and reject pointers naming a forbidden field.

- [ ] **Step 4: Replace the instrumentation patch with observation-only component driving**

The patch may make only these behavioral-neutral changes:

- add a test-only observer registration whose callback receives a deep-cloned read-only observation from values the component has already computed or stored
- emit observations where the existing component actually handles select/deselect, the single primary `handleContinue` event, its forced auto-answer/skip loop, its reached next/results screen, and back/previous
- extract the existing nested multi-select toggle calculation into `legacyUpdatePendingSelection` only if `App` itself calls that exact helper after extraction
- add `src/parity-question-extractor.test.tsx`, which renders `App`, drives the copied seed through public controls under `act`/`waitFor`, waits for each action to settle, and writes raw cases to the single required temporary output file

The observer and test must not export or call `createInitialAnswers`, `getSelectedValues`, `getForcedQuestionValue`, `applyForcedAnswersFromStep`, `getPreviousInteractiveStep`, or another helper to calculate expected behavior. They must not implement or infer branch, repair, validation, answer-application, navigation, forced-resolution, or completion rules. One `handleContinue` click is one `continue` seed action; its `submit`, zero-or-more `forced-skip`, and terminal `next|complete` observations share one action index and must never be represented as separate seed actions.

`src/parity-question-extractor.test.tsx` is skipped during the full-suite command unless the isolated extraction-only environment supplies its exact raw-output capability. `seeds.json` contains only schema version plus stable case IDs and ordered `LegacyObservableAction[]`; it contains no `coverageTags`, expected frame, answer, visible option, screen, navigation target, forced transition, behavior result, or internal runtime value. The extractor derives frozen coverage only after validating observed actions/frames. Add patch tests that inspect added lines and reject calls to rule helpers, hand-authored expected outputs, a second flow implementation, and any seed key other than `id` and `actions`.

- [ ] **Step 5: Write failing isolation, execution-order, binding, and publish-safety tests**

```ts
test('never reuses original dependencies or caches', async () => {
  const fixture = await createExtractorFixture()
  await fixture.addOriginalNodeModulesWithTsBuildInfo()
  await runExtractor(fixture.environment)
  expect(fixture.spawnRecords.some(({ args }) =>
    args.some((value) => value.startsWith(fixture.originalNodeModules)),
  )).toBe(false)
  expect(await fixture.originalFingerprintAfter()).toEqual(fixture.originalFingerprintBefore)
})

test('fails when an ignored original cache changes', async () => {
  const fixture = await createExtractorFixture()
  fixture.afterLegacySuite = () => fixture.rewriteOriginalTsBuildInfo()
  await expect(runExtractor(fixture.environment)).rejects.toThrow(
    'original ignored path changed',
  )
})

test('runs the full suite before network-denied extraction', async () => {
  const fixture = await createExtractorFixture()
  await runExtractor(fixture.environment)
  const executionOrder = fixture.spawnRecords
    .map(({ role }) => role)
    .filter((role) => [
      'npm-ci',
      'legacy-full-suite',
      'legacy-network-denied-extraction',
    ].includes(role))
  expect(executionOrder).toEqual([
    'npm-ci',
    'legacy-full-suite',
    'legacy-network-denied-extraction',
  ])
  const extraction = fixture.spawnRecords.find(
    ({ role }) => role === 'legacy-network-denied-extraction',
  )
  if (!extraction) throw new Error('missing extraction record')
  expect(extraction.executable).toBe('/usr/bin/sandbox-exec')
  expect(extraction.args.slice(0, 2)).toEqual([
    '-p',
    '(version 1)(allow default)(deny network*)',
  ])
})

test('passes only the allowlisted child environment', async () => {
  const fixture = await createExtractorFixture({
    inheritedEnvironment: {
      GIT_CONFIG_GLOBAL: '/tmp/hostile-gitconfig',
      NODE_OPTIONS: '--require=/tmp/hostile.cjs',
      NPM_CONFIG_USERCONFIG: '/tmp/hostile-npmrc',
      PATH: '/tmp/hostile-bin',
    },
  })
  await runExtractor(fixture.environment)
  const allowedKeys = [
    'CI', 'GIT_CONFIG_NOSYSTEM', 'HOME', 'LANG', 'LC_ALL', 'NPM_CONFIG_CACHE',
    'NPM_CONFIG_GLOBALCONFIG', 'NPM_CONFIG_USERCONFIG', 'PATH',
    'RAMEN_PARITY_SEED', 'TMPDIR', 'TZ',
  ]
  expect(fixture.spawnRecords.every(({ environment }) =>
    Object.keys(environment).sort().join('\0') === allowedKeys.join('\0'),
  )).toBe(true)
  expect(fixture.spawnRecords.every(({ environment }) =>
    environment.NPM_CONFIG_USERCONFIG === '/dev/null'
      && environment.NPM_CONFIG_GLOBALCONFIG === '/dev/null'
      && environment.GIT_CONFIG_NOSYSTEM === '1',
  )).toBe(true)
  expect(fixture.spawnRecords.every(({ environment }) =>
    !environment.PATH?.includes('/tmp/hostile-bin'),
  )).toBe(true)
})

test.each(['count', 'order', 'id', 'actions'])(
  'rejects raw seed binding mismatch: %s',
  async (field) => {
    const fixture = await createExtractorFixture({ rawMismatch: field })
    await expect(runExtractor(fixture.environment)).rejects.toThrow('raw seed binding mismatch')
  },
)
```

Also test atomic lock contention; unique same-parent staging/backup names; no-follow rejection for the legacy root, patch, seeds, raw output, destination, and every parent; path replacement immediately before read/publish/rollback; rollback after old-output rename; partial worktree-add cleanup plus prune; cleanup failure preserving the primary error; and external-error sanitization to one control-free line no longer than 300 characters.

- [ ] **Step 6: Implement isolated execution, exact binding, and transactional publication**

Use these trusted tool identities for the first lineage and verify their type/version before use:

```ts
const trustedTools = {
  git: '/usr/bin/git',
  node: '/Users/ansonhui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node',
  npmCli: '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js',
  sandboxExec: '/usr/bin/sandbox-exec',
} as const
```

Invoke npm as `[trustedTools.node, trustedTools.npmCli, 'ci', '--ignore-scripts']`. The temporary worktree gets unique physical `node_modules`, `.npm-cache`, `.home`, and `.tmp` paths beneath its validated extraction root; its build cache is the physical temporary `node_modules/.tmp`. No path may be a symlink or resolve into the original checkout. Construct child environments from this exact allowlist: `TZ`, `LANG`, `LC_ALL`, `RAMEN_PARITY_SEED`, `CI`, `GIT_CONFIG_NOSYSTEM=1`, generated `HOME`, `TMPDIR`, `NPM_CONFIG_CACHE`, `NPM_CONFIG_USERCONFIG=/dev/null`, `NPM_CONFIG_GLOBALCONFIG=/dev/null`, and a generated trusted `PATH`. Never spread `process.env`.

After `npm ci --ignore-scripts`, invoke the complete patched suite with the trusted Node executable and the temporary worktree's physical `node_modules/vitest/vitest.mjs`. Only after it passes, invoke the extraction test separately through:

```text
/usr/bin/sandbox-exec -p (version 1)(allow default)(deny network*) <trusted-node> <temporary-vitest.mjs> run src/parity-question-extractor.test.tsx
```

Fingerprint the two declared original ignored paths by no-follow `lstat`, size, `mtimeMs`, and streamed SHA-256 for regular files before the first child and after all cleanup. Bind raw count/order/IDs/actions exactly to seeds before trace-schema normalization; reject any seed or raw seed-identity object containing `coverageTags`. After strict action/frame validation, derive the frozen case's coverage tags mechanically and code-point-sort them. Sanitize every Git/npm/test/filesystem error with `sanitizeExternalError(error, 300)` before reporting it.

Acquire a same-parent lock with exclusive create. Use cryptographically unique same-parent `.staging-<token>` and `.backup-<token>` names. Revalidate no-follow identity immediately before every sensitive read, rename, rollback, and publish call. On failure, restore an old output if it was renamed, remove only validated run-owned paths, attempt absolute Git `worktree remove --force`, then absolute Git `worktree prune --expire now`; cleanup errors are attached as bounded secondary details and never replace the primary error. Document the non-privileged, non-hostile-same-user macOS threat boundary in code comments and the incident record.

- [ ] **Step 7: Record the cache-isolation incident without changing the ledger**

Create `docs/migration/incidents/2026-07-13-legacy-cache-isolation.md` with these exact facts and sections:

- rejected implementation: `3b65eac3befb6ee7b3aa460bc1ff940027830a3e`
- original tracked HEAD remained `eebf00b7ddfbbe6f01ff598e57f1e17197068a37` and tracked tree remained `3e527de876cfeccfd3154ddc492830d71c4cfd9a`
- a temporary `node_modules` symlink reused the original checkout dependency tree
- ignored `node_modules/.tmp/tsconfig.app.tsbuildinfo` and `node_modules/.tmp/tsconfig.node.tsbuildinfo` may have been refreshed
- impact is limited to ignored build-cache metadata; no tracked legacy source change was observed
- rejected fixtures, if any, are unusable and Task 10 must regenerate only after fresh review
- remediation is physical dependency/cache isolation, before/after ignored-path fingerprinting, trusted tools/environment, suite-before-network-denied-extraction, and no-follow transactional publication
- supported threat boundary and the commands used to verify tracked HEAD/tree/status

Do not edit `docs/migration/ledger.json` or `docs/migration/ledger.md`; Task 14 records the incident after exact-SHA acceptance.

- [ ] **Step 8: Run focused and live verify-only checks**

```bash
npx vitest run tools/parity/questions/contracts.test.ts tools/parity/questions/extractor.test.ts
PATH="/Users/ansonhui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/usr/bin:/bin" \
  /Users/ansonhui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  node_modules/tsx/dist/cli.mjs tools/parity/questions/extract.ts \
  --legacy /Users/ansonhui/Documents/GitHub/ramen-style-today \
  --verify-only
test -z "$(git -C /Users/ansonhui/Documents/GitHub/ramen-style-today status --porcelain)"
test "$(git -C /Users/ansonhui/Documents/GitHub/ramen-style-today rev-parse HEAD)" = "eebf00b7ddfbbe6f01ff598e57f1e17197068a37"
test "$(git -C /Users/ansonhui/Documents/GitHub/ramen-style-today rev-parse 'HEAD^{tree}')" = "3e527de876cfeccfd3154ddc492830d71c4cfd9a"
npm run typecheck
npm run lint
git diff --check
```

Expected: all commands PASS; the live run executes the full patched legacy suite before the separate network-denied extraction test, discards validated raw output, publishes no fixture, and reports matching original ignored-path fingerprints.

- [ ] **Step 9: Commit only replacement Task 9 files**

```bash
git add tools/parity/questions docs/migration/incidents/2026-07-13-legacy-cache-isolation.md
git diff --cached --name-only
git commit -m "Harden observable legacy extractor"
```

Expected: the staged list contains exactly the seven `tools/parity/questions` files and the incident file; no fixture, ledger, generated document, or implementation outside Task 9 is committed.

- [ ] **Step 10: Pass a fresh high-risk review before Task 10**

```bash
TASK8_BASE=7a198bf7a9195a82e84ff4230e9fe61af40b7018
TASK9_SHA="$(git rev-parse HEAD)"
/Users/ansonhui/.codex/plugins/cache/openai-curated-remote/superpowers/6.1.1/skills/subagent-driven-development/scripts/review-package \
  "$TASK8_BASE" "$TASK9_SHA"
```

The new reviewer must inspect the full range against corrected design Sections 16–18, run the focused tests and live `--verify-only` command, and write `.superpowers/sdd/task-9-high-risk-review.md` containing exact lines `Task-9-commit: <40-character TASK9_SHA>` and `Verdict: PASS`. Any fix creates a new commit, a new review package, and a new review. Task 10 may start only when:

```bash
TASK9_SHA="$(git rev-parse HEAD)"
rg -x "Task-9-commit: $TASK9_SHA" .superpowers/sdd/task-9-high-risk-review.md
rg -x "Verdict: PASS" .superpowers/sdd/task-9-high-risk-review.md
```

Expected: both exact-line checks succeed for the current reviewed Task 9 commit.

---

### Task 10: Freeze observable legacy traces and implement projection parity

**Files:**
- Create: `tools/parity/fixtures/questions/legacy-v1/manifest.json`
- Create: `tools/parity/fixtures/questions/legacy-v1/cases.json`
- Create: `tools/parity/fixtures/questions/expected-divergences.json`
- Create: `tools/parity/questions/observable-trace.ts`
- Create: `tools/parity/questions/observable-trace.test.ts`
- Create: `tools/parity/questions/compare.ts`
- Create: `tools/parity/questions/compare.test.ts`
- Create: `tools/parity/questions/parity.ts`
- Create: `tools/parity/questions/parity.test.ts`
- Create: `tools/parity/questions/test-fixtures.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 9 extractor and fixture contracts; Tasks 6–8 runtime APIs.
- Produces: immutable `legacy-v1` observable trace corpus, empty divergence manifest, same-action runtime projection, `parity:questions`, observable coverage validation, and bounded replay diagnostics.

- [ ] **Step 0: Enforce the fresh Task 9 high-risk review gate**

```bash
TASK9_SHA="$(git rev-parse HEAD)"
rg -x "Task-9-commit: $TASK9_SHA" .superpowers/sdd/task-9-high-risk-review.md
rg -x "Verdict: PASS" .superpowers/sdd/task-9-high-risk-review.md
test ! -e tools/parity/fixtures/questions/legacy-v1
```

Expected: the current Task 9 commit is the exact reviewed commit, its verdict is `PASS`, and no frozen corpus exists. Stop Task 10 on any failure.

- [ ] **Step 1: Write failing observable projection, coverage, and diff tests**

Create `test-fixtures.ts` with one valid `LegacyObservableTraceCase`, one identical copy with an orphan `semantic-class:*` tag, required observable coverage derived from the valid case, one received trace whose first deliberate change is `/frames/1/visibleOptionIds/0`, `formContinueActions` containing one select plus one continue, and `rejectedContinueActions` containing continue without a legal pending selection. Export them as `expectedCase`, `casesWithOrphanTag`, `requiredCoverage`, `receivedTrace`, `formContinueActions`, and `rejectedContinueActions` so each test has one controlled purpose.

```ts
test('executes seed actions and projects observable trace fields only', () => {
  const trace = executeObservableTrace(questionModel, expectedCase.actions)
  expect(trace.frames[0]).toMatchObject({
    transition: 'initial',
    displayedQuestionId: 'form',
  })
  const serialized = JSON.stringify(trace)
  for (const forbidden of [
    'canonicalAnswers', 'reachableQuestionIds', 'interactiveQuestionIds',
    'allowedOptionIdsByQuestion', 'repairs', 'diagnostics',
    'invalidatedQuestionIds', 'accepted', 'dependencyClosures',
    'fixedPointIterations',
  ]) expect(serialized).not.toContain(`"${forbidden}"`)
})

test('keeps select pending and projects its legacy-shaped answer', () => {
  const trace = executeObservableTrace(questionModel, [formContinueActions[0]])
  const actionFrames = trace.frames.filter(({ actionIndex }) => actionIndex === 0)
  expect(actionFrames.map(({ transition }) => transition)).toEqual(['toggle'])
  expect(actionFrames[0].pendingOptionIds).toEqual(['soup'])
  expect(actionFrames[0].legacyAnswers).toMatchObject({ form: 'soup' })
})

test('maps one continue action to submit then one terminal transition', () => {
  const trace = executeObservableTrace(questionModel, formContinueActions)
  const actionFrames = trace.frames.filter(({ actionIndex }) => actionIndex === 1)
  expect(actionFrames.map(({ transition }) => transition)).toEqual(['submit', 'next'])
  expect(actionFrames.every(({ actionIndex }) => actionIndex === 1)).toBe(true)
})

test('rejects continue when applyAnswer cannot represent the legacy action', () => {
  expect(() => executeObservableTrace(questionModel, rejectedContinueActions))
    .toThrow('seed is not legacy-representable')
})

test('freezes mechanically derived coverage, never seed coverage', () => {
  expect(expectedCase.coverageTags).toEqual(deriveObservableCoverage({
    actions: expectedCase.actions,
    frames: expectedCase.frames,
  }))
  expect(legacyObservableSeedCaseSchema.safeParse({
    id: expectedCase.id,
    actions: expectedCase.actions,
    coverageTags: expectedCase.coverageTags,
  }).success).toBe(false)
})

test('rejects fabricated and orphan coverage tags', () => {
  const result = validateFixtureCoverage(casesWithOrphanTag, requiredCoverage)
  expect(result.diagnostics.map(({ code }) => code)).toContain('PARITY_COVERAGE_INVALID')
})

test('reports the first JSON Pointer and a replay command', () => {
  const mismatch = compareParityCase(expectedCase, receivedTrace)
  expect(mismatch.pointer).toBe('/frames/1/visibleOptionIds/0')
  expect(mismatch.replayCommand).toContain('--case')
})

test('rejects a divergence outside observable frames', () => {
  expect(expectedDivergencesSchema.safeParse({
    schemaVersion: 1,
    entries: [{
      ...validDivergence,
      jsonPointer: '/canonicalAnswers/form',
    }],
  }).success).toBe(false)
})
```

Register `PARITY_FIXTURE_INVALID`, `PARITY_COVERAGE_INVALID`, `PARITY_MISMATCH`, `PARITY_DIVERGENCE_INVALID`, and authoring-only `PARITY_SEED_NOT_LEGACY_REPRESENTABLE` in the diagnostic registry. The last code rejects a seed/replay operation and is never serialized into a frozen case.

- [ ] **Step 2: Run parity tests and confirm red**

```bash
npx vitest run tools/parity/questions/observable-trace.test.ts tools/parity/questions/compare.test.ts tools/parity/questions/parity.test.ts
```

Expected: FAIL because the observable runtime adapter, trace comparator, and parity harness do not exist.

- [ ] **Step 3: Generate and review the frozen observable corpus explicitly**

Run the extractor only after Task 9 safety tests pass:

```bash
PATH="/Users/ansonhui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/usr/bin:/bin" \
  /Users/ansonhui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  node_modules/tsx/dist/cli.mjs tools/parity/questions/extract.ts \
  --legacy /Users/ansonhui/Documents/GitHub/ramen-style-today
```

Expected: runs the full patched legacy suite, then a separate network-denied extraction-only test; verifies unchanged tracked and declared ignored original paths; creates the absent `legacy-v1` directory and no other tracked path. Review manifest identity, ordered case IDs, content hash, raw seed binding evidence, and the complete trace diff. Create the divergence file exactly as:

```json
{
  "schemaVersion": 1,
  "entries": []
}
```

The corpus must directly observe every displayed legacy question and visible option, every seeded public action type the component exposes, all form/archetype branch rows as visible-option or answer changes, explicit allow-all rows as visible options, actual singleton forced-skip chains, observable minimum/maximum interactions, exclusive replacement, maximum-selection no-op, exclusions empty restoration, actual previous/next targets around forced positions, incomplete prefixes, and the results completion marker. Do not add a case or tag for repairs, diagnostics, invalid external inputs, invalidated IDs, global reachability, application result objects, canonical navigation behavior, dependency closures, compiler equivalence classes, or fixed-point metadata.

- [ ] **Step 4: Implement same-action runtime projection, divergence application, and replay**

`executeObservableTrace(model, actions)` owns adapter-only current displayed question ID and pending option IDs by visited question in addition to the submitted `AnswerDraft` and settled `FlowState`. It emits one `initial` frame before actions, then applies this fixed v1 operation table without consulting expected fixtures:

1. `select` or `deselect`: require `questionId` to equal the displayed question, call `updatePendingSelection`, leave `AnswerDraft` unchanged, and emit exactly one settled `toggle` frame. Project the current pending value into that question's legacy-shaped observable answer field so it matches the legacy option click's immediate `setAnswers`, but do not call `applyAnswer`.
2. `continue`: require `fromQuestionId` to equal the displayed question; call `applyAnswer(model, draft, { questionId: fromQuestionId, optionIds: pendingOptionIds })`; require `accepted: true`; then call `evaluateFlow(model, accepted.draft)` and replace adapter draft/state with the accepted settled result. Clear adapter pending projections for the committed question and any dependent IDs invalidated by the accepted result, without serializing those new-only IDs. Emit one `submit` frame. Emit one `forced-skip` frame, in compiled question order, for each actual settled forced answer traversed between `fromQuestionId` and the reached terminal screen. If settled status is `complete`, emit exactly one `complete`; otherwise obtain the reached question through `getNextInteractiveQuestion`, emit exactly one `next`, make it current, and initialize its pending value from an existing adapter pending projection, its submitted answer, or compiled initial UI options in that order. Every frame from this operation uses the continue action's single action index.
3. Rejected `applyAnswer`, a missing terminal next question, a disabled/unavailable legacy Continue control, or any action/frame sequence that violates this table rejects fixture authoring/replay with `PARITY_SEED_NOT_LEGACY_REPRESENTABLE`. Do not emit a rejected frame and do not serialize `accepted`, diagnostics, or other new API result metadata.
4. `previous`: require `fromQuestionId` to equal the displayed question, call `getPreviousInteractiveQuestion`, change only adapter navigation, preserve all adapter pending projections, initialize the reached question from an existing pending projection, submitted answer, or compiled initial UI options in that order, and emit exactly one `previous` frame. It never calls `applyAnswer`; the formal draft still changes only on `continue`.

The adapter may read runtime state to execute the operation, but it must never serialize the whole state or application result. The field-emission table is fixed in `observable-trace.ts`: initial/toggle frames emit displayed question, current visible options, pending IDs, and legacy-shaped answers; submit frames emit the submitted question and legacy-shaped answers; forced-skip frames emit the actual forced question/value; next/previous frames emit direction and reached question/results screen; complete emits the results marker and actual legacy-shaped answer state saved at completion. Single-select legacy answers project as strings and multi-select answers as arrays according to the fixed eight-question legacy representation map. `observedChanges` is a mechanical diff of consecutive projected fields.

Validate every received trace through the same strict schema, derive frozen and received coverage independently from their validated actions/frames, require each stored frozen `coverageTags` list to equal its mechanical derivation, and compare code-point-stable frames and coverage in order. A missing optional legacy field remains absent in both projections by the fixed emission table; the comparator must not delete received fields merely because expected omitted them.

Before applying a divergence, require `jsonPointer` to resolve under `/frames/`, hash the frozen observable value or stable missing sentinel, and compare `legacyValueHash`; require the current semantic hash to equal the divergence semantic hash. Apply entries in case-ID/pointer order. A mismatch prints case ID, ordered actions, first frame/pointer, bounded values, semantic hash, fixture manifest hash, and:

```text
npm run parity:questions -- --case <case-id>
```

- [ ] **Step 5: Add and run the offline command**

Add:

```json
{
  "parity:questions": "tsx tools/parity/questions/parity.ts"
}
```

Run:

```bash
npm run parity:questions
npx vitest run tools/parity/questions
npx vitest run packages/classification-core/src/compiler/questions packages/classification-core/src/flow
npm run questions:check
test -z "$(git -C /Users/ansonhui/Documents/GitHub/ramen-style-today status --porcelain)"
```

Expected: PASS, no fixture writes, and no legacy checkout changes. Compiler/runtime tests remain green as the exclusive owners of the new-only fields omitted from traces.

- [ ] **Step 6: Commit**

```bash
git add package.json tools/parity
git commit -m "Freeze observable legacy parity"
```

---

### Task 11: Enforce the browser-neutral runtime export boundary

**Files:**
- Modify: `packages/classification-core/src/index.ts`
- Modify: `packages/classification-core/src/index.test.ts`
- Modify: `packages/classification-core/src/compiler/index.ts`
- Modify: `packages/classification-core/package.json`
- Create: `tools/validation/check-runtime-imports.ts`
- Create: `tools/validation/check-runtime-imports.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 5 generated artifact and Tasks 6–8 flow runtime.
- Produces: supported package root API, compiler-only subpath, generated-artifact subpath, and `runtime:imports:check`.

- [ ] **Step 1: Write failing root-export and forbidden-import tests**

```ts
import {
  applyAnswer,
  decodeAnswerDraft,
  evaluateFlow,
  getNextInteractiveQuestion,
  questionModel,
  updatePendingSelection,
} from './index.js'

test('exports the frozen runtime without compiler APIs', async () => {
  expect(typeof evaluateFlow).toBe('function')
  expect(typeof applyAnswer).toBe('function')
  expect(typeof decodeAnswerDraft).toBe('function')
  expect(typeof updatePendingSelection).toBe('function')
  expect(typeof getNextInteractiveQuestion).toBe('function')
  expect(Object.isFrozen(questionModel)).toBe(true)
  expect(Object.isFrozen(questionModel.questions[0])).toBe(true)
  expect('compileQuestions' in await import('./index.js')).toBe(false)
})

test('root dependency graph excludes tools and Node-only modules', () => {
  const result = checkRuntimeImports(repositoryGraph, 'packages/classification-core/src/index.ts')
  expect(result.forbidden).toEqual([])
})
```

- [ ] **Step 2: Run boundary tests and confirm red**

```bash
npx vitest run packages/classification-core/src/index.test.ts tools/validation/check-runtime-imports.test.ts
```

Expected: FAIL because root exports and boundary scanner are incomplete.

- [ ] **Step 3: Export the exact runtime surface and isolate compiler APIs**

Root `src/index.ts` exports `questionModel`, flow functions, and flow/compiled-model types only. `src/compiler/index.ts` exports source schemas, definitions, compiler, proof, serializer, and diagnostic tooling. Package exports become:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./generated/question-model": "./src/generated/question-model.ts",
    "./compiler": "./src/compiler/index.ts"
  }
}
```

Do not import compiler entrypoints from runtime files. The public decoder uses only primitive checks and browser-neutral contracts.

- [ ] **Step 4: Implement transitive forbidden-import checking**

Reuse the repository's import scanner rules to walk from `src/index.ts` and fail on paths under `src/compiler`, `tools`, `src/definitions`, or imports matching `node:*`, `react`, `zod`, legacy paths, persistence, scoring, styles, or catalog modules. Add:

```json
{
  "runtime:imports:check": "tsx tools/validation/check-runtime-imports.ts"
}
```

- [ ] **Step 5: Run source, build-output, and mutation checks**

```bash
npm run runtime:imports:check
npm run build
! rg -n "from ['\"](?:node:|zod|react)|/compiler/|tools/parity" packages/classification-core/dist/index.js packages/classification-core/dist/flow packages/classification-core/dist/generated
npx vitest run packages/classification-core/src/index.test.ts tools/validation/check-runtime-imports.test.ts
npm run typecheck
```

Expected: all commands PASS and the build-output scan finds no forbidden dependency.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/classification-core tools/validation
git commit -m "Enforce question runtime boundary"
```

---

### Task 12: Generate provenance, readiness, and question ownership indexes

**Files:**
- Modify: `tools/documentation/relations.ts`
- Modify: `tools/documentation/build-index.ts`
- Modify: `tools/documentation/build-index.test.ts`
- Modify: `tools/documentation/generate-classification-index.ts`
- Modify: `docs/classification/change-map.md`
- Regenerate: `docs/classification/index.md`
- Regenerate: `docs/classification/manifest.json`
- Modify: `README.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: compiled inventory, frozen observable-trace manifest hash, current question semantic hash, and existing domain provenance.
- Produces: canonical concept ownership, explicitly scoped observable-transition parity provenance, per-domain assurance, derived readiness, and concise repository guidance.

- [ ] **Step 1: Write failing manifest and readiness tests**

```ts
test('renders per-domain provenance without upgrading unrelated domains', () => {
  const manifest = JSON.parse(buildDocumentation(model, relations, consumers, paths).manifest)
  expect(manifest.provenance.questions).toMatchObject({
    origin: 'legacy-production',
    assurance: 'compiler-validated',
    parityScope: 'legacy-observable-transition-projection',
  })
  expect(manifest.provenance.styles.assurance).toBe('structurally-validated')
  expect(manifest.provenance.scoringPolicy.assurance).toBe('structurally-validated')
  expect(manifest.readiness.status).toBe('migration-only')
})

test('lists every production question and option with canonical owners', () => {
  const manifest = JSON.parse(buildDocumentation(model, relations, consumers, paths).manifest)
  expect(manifest.concepts.filter(({ kind }) => kind === 'question')).toHaveLength(8)
  expect(manifest.concepts.filter(({ kind }) => kind === 'option')).toHaveLength(53)
  expect(manifest.concepts.find(({ key }) => key === 'question/form')?.canonicalSource)
    .toBe('packages/classification-core/src/definitions/questions.ts')
})
```

- [ ] **Step 2: Run documentation tests and confirm red**

```bash
npx vitest run tools/documentation/build-index.test.ts tools/documentation/generate-classification-index.test.ts
```

Expected: FAIL because the manifest still assumes a global synthetic model.

- [ ] **Step 3: Replace synthetic relation keys with production ownership**

Generate typed question/option relations from the compiled inventory, all pointing to:

```ts
{
  canonicalSource: 'packages/classification-core/src/definitions/questions.ts',
  validators: [
    'packages/classification-core/src/compiler/questions/source-schema.ts',
    'packages/classification-core/src/compiler/questions/compile.ts',
    'packages/classification-core/src/compiler/questions/proof.ts',
  ],
  consumers: [
    'packages/classification-core/src/flow/evaluate.ts',
  ],
  tests: [
    'packages/classification-core/src/definitions/questions.test.ts',
    'packages/classification-core/src/compiler/questions/proof.test.ts',
    'tools/parity/questions/parity.test.ts',
  ],
  migrations: [],
}
```

Retain independent synthetic style/policy relations and do not claim their semantic compilation.

- [ ] **Step 4: Render per-domain provenance and derived readiness**

The generated manifest includes normalized legacy identity, `parityScope: 'legacy-observable-transition-projection'`, immutable observable-trace manifest hash, question source/semantic hashes, current verification only when its semantic hash matches, and:

```json
{
  "readiness": {
    "status": "migration-only",
    "blockers": [
      "styles-not-migrated",
      "scoring-not-migrated",
      "persistence-not-migrated",
      "runtime-not-cut-over"
    ]
  }
}
```

Before exact-SHA acceptance is recorded, questions are `compiler-validated`; Task 14 promotes them to `parity-verified` in metadata only after authenticated evidence. That assurance means the runtime's directly observable transition projection matches the frozen legacy traces. It does not claim legacy evidence for repairs, diagnostics, invalid APIs, invalidated IDs, global reachability, dependency metadata, canonical navigation, application result objects, or fixed-point behavior. The frozen trace manifest remains unchanged.

- [ ] **Step 5: Update change guidance and regenerate tracked docs**

Add question-change instructions pointing to the approved spec, `questions.ts`, compiler proof, `questions:generate`, observable-trace projection replay, divergence approval, and Batch 2B persistence boundary. Update README/AGENTS with one concise Batch 2A summary and links to canonical manifest/index; do not duplicate hashes or case counts or describe new-only runtime semantics as legacy-proved.

Run:

```bash
npm run classification:index
npm run classification:index:check
npx vitest run tools/documentation
npm run classification:validate
```

Expected: generated docs change once and the check then PASSes without drift.

- [ ] **Step 6: Commit**

```bash
git add README.md AGENTS.md docs/classification tools/documentation
git commit -m "Index production question ownership"
```

---

### Task 13: Split offline verification from exact-SHA acceptance

**Files:**
- Modify: `tools/migration/ledger-schema.ts`
- Modify: `tools/migration/ledger-check.ts`
- Modify: `tools/migration/ledger-check.test.ts`
- Modify: `tools/migration/check-ledger.ts`
- Modify: `tools/migration/record-ci.ts`
- Modify: `tools/migration/record-ci.test.ts`
- Create: `tools/acceptance/verify-acceptance.ts`
- Create: `tools/acceptance/verify-acceptance.test.ts`
- Modify: `docs/migration/ledger.json`
- Regenerate: `docs/migration/ledger.md`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 12 manifest/provenance and all offline gates.
- Produces: Batch `2A` ledger schema with incident references, machine-readable semantic paths, offline `verify`, online `verify:acceptance`, and exact implementation-SHA ancestry/path checks.

- [ ] **Step 1: Write failing offline/online separation and semantic-path tests**

```ts
test('offline ledger check never calls fetch', async () => {
  const fetchImplementation = vi.fn(() => Promise.reject(new Error('network forbidden')))
  await expect(checkLedgerOffline(validLedger, repositoryState)).resolves.toMatchObject({ ok: true })
  expect(fetchImplementation).not.toHaveBeenCalled()
})

test('accepts metadata commits only when semantic paths are unchanged', async () => {
  await expect(verifySemanticAncestry({
    implementationSha: 'a'.repeat(40),
    candidateSha: 'b'.repeat(40),
    semanticPaths,
    changedPaths: ['docs/classification/manifest.json', 'docs/migration/ledger.json'],
  })).resolves.toBeUndefined()
  await expect(verifySemanticAncestry({
    implementationSha: 'a'.repeat(40),
    candidateSha: 'b'.repeat(40),
    semanticPaths,
    changedPaths: ['packages/classification-core/src/flow/evaluate.ts'],
  })).rejects.toThrow('semantic path changed after implementation SHA')
})

test('online acceptance authenticates the fixed owner workflow and SHA', async () => {
  await expect(verifyAcceptance(validEvidence, successfulGithubFetch)).resolves.toBeUndefined()
})

test('complete Batch 2A evidence requires the cache-isolation incident', () => {
  expect(migrationLedgerSchema.safeParse({
    ...completeLedger,
    entries: completeLedger.entries.map((entry) =>
      entry.batch === '2A' ? { ...entry, incidents: [] } : entry,
    ),
  }).success).toBe(false)
})
```

- [ ] **Step 2: Run migration/acceptance tests and confirm red**

```bash
npx vitest run tools/migration tools/acceptance
```

Expected: FAIL because checks are not split and Batch 2A fields are absent.

- [ ] **Step 3: Extend the ledger with exact Batch 2A ownership**

Add `implementationSha`, `semanticPaths`, `incidents`, and exact Batch 2A completion gates. The entry starts `in-review` with `incidents: []` and owns definitions, compiler, generated model, flow, parity tools/fixtures, docs, and verification updates. Its semantic paths are exactly:

```ts
[
  'packages/classification-core/src/definitions/questions.ts',
  'packages/classification-core/src/compiler/questions/**',
  'packages/classification-core/src/generated/question-model.ts',
  'packages/classification-core/src/flow/**',
  'tools/parity/questions/**',
  'tools/parity/fixtures/questions/**',
]
```

Required completion gates are `batch2a-local-verify` and `batch2a-remote-ci`. While the entry is `in-review`, `implementationSha` is absent and its verification array contains only the local gate after Step 6 succeeds:

```json
{
  "gate": "batch2a-local-verify",
  "command": "npm run verify",
  "outcome": "passed",
  "evidence": "all Batch 2A offline compiler, artifact, runtime, observable trace projection parity, documentation, and ledger gates passed"
}
```

The authenticated recorder sets `implementationSha` to the verified run SHA, appends `batch2a-remote-ci`, records exactly `docs/migration/incidents/2026-07-13-legacy-cache-isolation.md` in `incidents`, and changes status to `complete` in one schema-validated write. Completion rejects a missing, additional, nonexistent, or non-regular incident path. Offline ledger checks validate incident existence, path syntax, owner existence, generated Markdown, semantic hash consistency, observable-trace manifest hash, and Git ancestry without network access.

- [ ] **Step 4: Move authenticated GitHub checks behind acceptance**

Remove `authenticateLedgerRemoteCiEvidence` from `check-ledger.ts --check`. `verify-acceptance.ts` first runs or requires successful offline verification, then authenticates every recorded remote-CI proof through the fixed official API origin, repository, workflow ID/path, push event, exact SHA, completed status, and success conclusion.

Add root scripts:

```json
{
  "verify": "npm run lint && npm test && npm run typecheck && npm run build && npm run classification:validate && npm run questions:check && npm run runtime:imports:check && npm run parity:questions && npm run classification:index:check && npm run migration:ledger:check",
  "verify:acceptance": "npm run verify && tsx tools/acceptance/verify-acceptance.ts"
}
```

Neither command may invoke a write-mode generator or extractor.

- [ ] **Step 5: Split CI by event**

Keep one offline `verify` job for every push and pull request. Add an `acceptance` job only on push, after offline verify, running `npm run verify:acceptance` with `GITHUB_TOKEN`; do not expose write permissions.

```yaml
permissions:
  contents: read

jobs:
  verify:
    # existing checkout, Node 24, npm ci, npm run verify
  acceptance:
    if: github.event_name == 'push'
    needs: verify
    # same checkout and install, then npm run verify:acceptance
```

- [ ] **Step 6: Regenerate ledger Markdown and run offline gates**

```bash
npm run migration:ledger
npm run migration:ledger:check
npx vitest run tools/migration tools/acceptance
npm run verify
```

Expected: PASS without requiring `GITHUB_TOKEN` and without contacting GitHub. Record the local gate shown above only after the first successful `npm run verify`, regenerate ledger Markdown, and run `npm run verify` again so the committed candidate includes checked local evidence.

- [ ] **Step 7: Commit the implementation candidate**

```bash
git add .github package.json docs/migration tools/migration tools/acceptance
git commit -m "Prepare Batch 2A acceptance gates"
```

This commit is the initial implementation SHA candidate. Do not edit owned semantic paths after it without creating a new candidate SHA and rerunning acceptance.

---

### Task 14: Run repository acceptance and record exact evidence

**Files:**
- Modify: `docs/migration/ledger.json` through authenticated recorder
- Regenerate: `docs/migration/ledger.md`
- Regenerate: `docs/classification/manifest.json`
- Verify referenced and unchanged: `docs/migration/incidents/2026-07-13-legacy-cache-isolation.md`
- Verify unchanged: `docs/classification/index.md` (current exact-SHA verification is manifest-only)
- Modify: no owned semantic path

**Interfaces:**
- Consumes: Tasks 1–13 completed implementation candidate.
- Produces: clean repository-wide verification, exact-SHA GitHub evidence, explicitly observable-scope `parity-verified` provenance, a complete Batch 2A ledger entry that records the cache-isolation incident, and a review-ready branch.

- [ ] **Step 1: Prove the candidate is clean and fully verified offline**

```bash
npm run verify
git diff --exit-code
git status --porcelain
```

Expected: verification PASSes, diff is empty, and status prints nothing.

- [ ] **Step 2: Capture and push the implementation SHA**

```bash
IMPLEMENTATION_SHA="$(git rev-parse HEAD)"
test "${#IMPLEMENTATION_SHA}" -eq 40
git push -u origin codex/batch-2a-questions-flow
```

Expected: branch push succeeds. The SHA must be the Task 13 candidate or a newer commit that contains only pre-acceptance implementation corrections followed by another full `npm run verify`.

- [ ] **Step 3: Wait for the exact implementation-SHA push workflow**

```bash
RUN_ID="$(gh run list --workflow ci.yml --commit "$IMPLEMENTATION_SHA" --event push --json databaseId,conclusion --jq 'map(select(.conclusion == "success"))[0].databaseId')"
test -n "$RUN_ID"
gh run view "$RUN_ID" --json headSha,conclusion,url --jq '{headSha,conclusion,url}'
```

Expected: `headSha` equals `$IMPLEMENTATION_SHA` and `conclusion` is `success`. If no successful run is available, use `gh run watch <run-id> --exit-status` before repeating the query.

- [ ] **Step 4: Record authenticated evidence without touching semantic paths**

Create an untracked proof file outside the repository:

```bash
PROOF_FILE="$(mktemp -t batch2a-ci-proof).json"
RUN_URL="https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/$RUN_ID"
printf '{"schemaVersion":1,"sha":"%s","runId":%s,"runUrl":"%s"}\n' \
  "$IMPLEMENTATION_SHA" "$RUN_ID" "$RUN_URL" > "$PROOF_FILE"
npm run migration:ledger:record-ci -- 2A "$PROOF_FILE"
npm run migration:ledger
npm run classification:index
rm "$PROOF_FILE"
node -e "const l=require('./docs/migration/ledger.json');const e=l.entries.find(x=>x.batch==='2A');if(JSON.stringify(e.incidents)!=='[\"docs/migration/incidents/2026-07-13-legacy-cache-isolation.md\"]')process.exit(1)"
```

Expected: only ledger files and `docs/classification/manifest.json` change; the Batch 2A entry records exactly the incident path; the incident document and `docs/classification/index.md` remain byte-identical. `git diff --name-only "$IMPLEMENTATION_SHA"` contains no path matched by the ledger's `semanticPaths`.

- [ ] **Step 5: Verify the metadata candidate online and offline**

```bash
npm run verify
npm run verify:acceptance
git diff --check
git diff --name-only "$IMPLEMENTATION_SHA"
```

Expected: both verification tiers PASS. The classification manifest records `parityScope: 'legacy-observable-transition-projection'`, the frozen observable-trace manifest hash, current semantic hash, parity suite version, and implementation SHA; questions are `parity-verified` only for that observable scope; compiler/runtime gates independently cover excluded new-only semantics; styles/scoring are not upgraded; readiness remains `migration-only`. The ledger records the cache-isolation incident.

- [ ] **Step 6: Commit and push acceptance metadata**

```bash
git add docs/migration/ledger.json docs/migration/ledger.md docs/classification/manifest.json
git commit -m "Record Batch 2A acceptance"
git push
```

Expected: the metadata commit contains no semantic path. Its push workflow runs both offline verify and acceptance.

- [ ] **Step 7: Verify the final metadata SHA and hand off**

```bash
FINAL_SHA="$(git rev-parse HEAD)"
FINAL_RUN_ID="$(gh run list --workflow ci.yml --commit "$FINAL_SHA" --event push --json databaseId,conclusion --jq 'map(select(.conclusion == "success"))[0].databaseId')"
test -n "$FINAL_RUN_ID"
npm run verify
npm run verify:acceptance
git status --porcelain
```

Expected: exact final-SHA workflow success, both gates PASS, and status is empty. Report the implementation SHA, metadata SHA, workflow URLs, semantic hash, observable-trace manifest hash, observable parity scope, recorded incident path, tests actually run, and the continuing `migration-only` readiness. Do not merge or modify the legacy repository without separate user authorization.
