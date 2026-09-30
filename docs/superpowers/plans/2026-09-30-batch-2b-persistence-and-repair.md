# Batch 2B: Persistence and Repair Implementation Plan

**Status:** DRAFT — review required. This document is not implementation permission. Do not start any task below until the user has approved it in writing (AGENTS.md: "Do not start an implementation batch until its written design or plan has the required approval").

**Baseline:** `AnsonHui6040/ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37`

**Review state:** the design decisions in section 13 were approved by the user on 2026-09-30 and are encoded below. That approval settles design choices only; it is **not** implementation permission. Implementation still needs a separate final approval of this plan.

**Prerequisite:** Batch 2A is complete (ledger status `complete`, closeout commit `af13936ddef23964e7a2ea76bff159753d46af45`).

**Goal:** Add a versioned, browser-independent classification payload to `@ramen-style/classification-core` with deterministic migration from the legacy unversioned browser state, deterministic repair built only on the Batch 2A flow, and a resume question that is always actionable. Prove the migration and restore behavior against the frozen legacy implementation, and separately list every intentional behavior change for approval.

## 1. Legacy findings (read-only audit)

Sources inspected at the baseline commit: `src/App.tsx` (`readStoredState`, `saveStoredState`, `clearStoredState`, `getStoredStepIndex`, `isStoredState`, `isLocale`, `createInitialAnswers`, `applyForcedAnswersFromStep`, the persistence `useEffect`, `startFlow`, `reviewAnswers`, `restart`), `src/domain/schema.ts` (`restoreUserAnswers`, `normalizeExclusiveValues`, `normalizeAnswers`, `toCompletedAnswers`, `hasAllowedQuestionResponse`), `src/domain/questionRules.ts`, `src/domain/types.ts` and the tests `src/App.test.tsx` and `src/__tests__/lib/scoring/scorer.test.ts`. There is no other storage helper: `rg localStorage` finds only `App.tsx` and the tests.

### 1.1 Storage and payload

| Item | Legacy behavior |
| --- | --- |
| Storage key | `ramen-style-today.state.v1` (single key, `window.localStorage`) |
| Payload | `JSON.stringify` of `{ phase, stepIndex, answers, locale }` |
| `phase` | `'intro' \| 'questions' \| 'results'` |
| `stepIndex` | integer index into the 8-question array |
| `answers` | `{ form?, archetype?, tare?, source: [], body?, noodle?, signature: [], exclusions: [] }`; `undefined` fields are omitted by `JSON.stringify` |
| `locale` | `'zh-TW' \| 'en' \| 'ja'` |
| Version field | **none**. The `.v1` suffix is part of the key name, not a payload version; there is no migration chain |
| Save cadence | a `useEffect` writes the whole snapshot after every change to `answers`, `locale`, `phase` or `stepIndex`, including the first render after restore |
| Write failure | `setItem` errors are caught; a `storageUnavailable` flag shows a notice; the questionnaire keeps working |
| Clear | `restart()` resets to initial state and calls `removeItem`; nothing else ever deletes the key |
| Unavailable storage | `window` missing, `localStorage` getter throwing, or a null value all behave as "no storage" and return the fallback |

### 1.2 Restore (`readStoredState`), in order

1. No storage, or `getItem` returns a falsy value (`null` or `''`) → fallback state: `phase: 'intro'`, `stepIndex: 0`, initial answers (`source: []`, `signature: []`, `exclusions: ['none']`, everything else unset), `locale: 'zh-TW'`.
2. `JSON.parse` throws → fallback (the raw value is left in storage untouched).
3. Parsed value is not a plain object (`null`, array, string, number, boolean) → fallback.
4. `answers = restoreUserAnswers(parsed.answers)` (section 1.3). A missing or non-object `answers` restores as the initial answers.
5. `phase` is kept only when it is exactly `'questions'` or `'results'`; anything else becomes `'intro'`.
6. `stepIndex` is kept only when it is a `number` that `Number.isInteger` accepts and is `>= 0`, then clamped to `7`; anything else (fraction, negative, `NaN`, `Infinity` such as JSON `1e400`, string, missing) becomes `0`.
7. `locale` is kept only when it is one of the three known locales; otherwise `'zh-TW'`.
8. If `phase === 'results'` and `toCompletedAnswers(answers)` is `null` → state becomes `phase: 'intro'`, `stepIndex: 0`, but **keeps the restored `answers` and `locale`**.
9. If `phase !== 'questions'` (that is `'intro'`, or a valid `'results'`) → returned as is, **including the stored `stepIndex` and the restored, unsettled answers**. For a valid `'results'` the answers are the restored ones, not the completed-normalized ones.
10. If `phase === 'questions'` → `applyForcedAnswersFromStep(answers, stepIndex)` (Batch 2A `settleFrom`), which writes automatically resolved answers and returns the settled answers and step index.
11. Unknown top-level fields are ignored. Nothing is written back during restore.

### 1.3 Answer sanitization (`restoreUserAnswers`)

- Input that is not a plain object is treated as `{}`.
- Single-value fields (`form`, `archetype`, `tare`, `body`, `noodle`) are kept only if the value is a string in the field's **global value set**; otherwise unset. No cross-field check happens here (a `soup` form with a `miso-rich` archetype survives).
- Array fields (`source`, `signature`, `exclusions`): a non-array becomes `[]`; unknown values are dropped; duplicates are removed keeping first occurrence; selection limits are **not** enforced here.
- `source` and `signature` then run `normalizeExclusiveValues`: if the exclusive value (`unsure`, `no-preference`) appears together with other values it is removed.
- `exclusions`: the retired broad value `seafood` is expanded in place to `fish-seafood`, `shellfish`, `shrimp-crab` before filtering; if the restored list is empty the result is `['none']`, otherwise `none` is removed when combined with other values.
- The initial answers therefore always contain `exclusions: ['none']`, and a stored empty `exclusions` also restores as `['none']`.

### 1.4 Completion, progress and unfinishable states

- `toCompletedAnswers` re-normalizes and then requires the branch-compatible `form`/`archetype`, every question inside its offered options (the Batch 2A `completeAnswers` semantics), selection limits, and non-empty `source`/`signature`. Results restoration relies on it (step 8).
- `answeredCount` (intro screen) counts non-empty questions, treating `exclusions: ['none']` as unanswered; the intro shows "continue" and a clear button when it is above zero.
- Legacy restore performs **no repair**. For `phase: 'questions'` it only settles forced answers from the clamped step. Consequences confirmed from the code:
  - a stale combination (for example `tare` not allowed for the restored `archetype`, an archetype outside the form's branch, more than two `source` values) is restored as is; the UI filters it out when displaying the current question but it remains in state;
  - a restored `stepIndex` ahead of the first unanswered question shows a later question with earlier answers missing (for example `stepIndex: 5` with no `form`), because nothing verifies the prefix;
  - on the last question, `handleContinue` returns silently when `toCompletedAnswers` is `null`, leaving the user unable to finish (the baseline document lists this as architecture risk 8);
  - `phase: 'intro'` keeps a non-zero `stepIndex` and un-settled answers, so pressing "continue" can land on a step whose forced answer was never written.
- Existing tests cover: incomplete saved results snapshot returns to intro; a results snapshot that bypasses a conditional branch returns to intro; a fractional `stepIndex` restores to the first question; unusable storage keeps the app working; the `seafood` migration and malformed/over-limit answers in `toCompletedAnswers`. There is **no** test for corrupt JSON, unknown phase/locale, negative or oversized `stepIndex`, or stale-but-parseable `questions` phase snapshots; the parity harness in this plan must add them.

### 1.5 Existing Batch 2A APIs to consume, not duplicate

Batch 2B consumes, without changing, `createInitialAnswers`, `settleFrom`, `nextPosition`, `previousQuestionId`, `resolveOptionIds`, `selectedOptionIds`, `forcedOptionId`, `canContinue`, `completeAnswers` and `orderedQuestions`. Modules inside the same package may also import the internal helpers `findQuestion` and `isExclusiveOption` from `flow/options.ts` without adding them to the public entrypoint. Question dependencies are read directly from the compiled `dependsOn` data.

**No concrete blocker exists in the Batch 2A flow API**, so this plan makes no change to Batch 2A source. An earlier draft proposed extracting a shared `normalizeAnswers`; that is withdrawn because repair needs its own step-wise normalization and `completeAnswers` remains the single arbiter of completeness (repair results are tested against it).

## 2. Scope

In scope (all in `@ramen-style/classification-core` unless stated):

- Versioned stored classification payload contract (schema version 1) and its Zod schema, accepting `unknown`.
- A sequential migration registry with the legacy-unversioned to version 1 step, the retired `seafood` alias migration, and safe rejection of unsupported future versions.
- Deterministic repair of migrated answers using only the compiled model and Batch 2A flow, plus a resume question that is always actionable.
- A pure restore API returning immutable results with structured diagnostics and repair events.
- New diagnostic codes.
- A parity harness in `tools/parity` that reproduces the legacy restore path from the frozen source and compares it with the new API (section 8).
- Documentation, index, ledger, README and `AGENTS.md` updates (section 11).

Out of scope: scoring, `legacyWeight` semantics, style definitions, exclusion scoring or evaluation, catalog, Finder, map, the React questionnaire and any UI, localization and message catalogs, and everything owned by Batch 3 or later.

Web persistence (approved Decision 1): **no `apps/web` workspace, no production browser code, no production localStorage adapter, no production app envelope and no React code in Batch 2B.** The browser envelope (`phase`, `locale`, `savedAt`), the storage adapter, the read-only legacy source and quarantine mode are documented as contracts (section 3) and implemented in Batch 5A. A test-only legacy envelope reader under `tools/parity` is allowed solely to reproduce the frozen legacy behavior for parity.

## 3. Ownership boundaries

| Concern | Owner | Batch 2B deliverable |
| --- | --- | --- |
| Versioned classification payload, schema version | `classification-core` | schema, types, constants |
| Structural validation of `unknown` input | `classification-core` | Zod schema plus diagnostics |
| Migrations (legacy-unversioned to v1, future steps) | `classification-core` | registry and steps |
| Repair and sanitization, resume question | `classification-core` | repair policy and API, built on the flow |
| Semantic validation (answers within offered options, limits) | `classification-core` | reuse of `completeAnswers` |
| App envelope (`savedAt`, `phase`, `locale`) and the results-to-intro fallback | `apps/web` (Batch 5A) | contract documented only (section 5.5) |
| localStorage adapter, legacy-key read-only policy, quarantine and autosave gating | `apps/web` (Batch 5A) | contract documented only |
| React integration | `apps/web` (Batch 5A) | none |
| Legacy envelope reader used to prove parity | `tools/parity` (test tooling, never shipped) | oracle adapter that composes the core API with legacy envelope rules |

The core payload never contains `phase`, `locale`, `savedAt` or `stepIndex`; a legacy `stepIndex` is converted to `currentQuestionId` at the boundary.

## 4. Contracts

Initial payload version: **`schemaVersion: 1`**. The core payload contains only what is needed to restore the classification questionnaire and its version and migration semantics. It never contains `locale`, `phase` or `savedAt` (approved Decision 8).

```ts
export const CURRENT_SCHEMA_VERSION = 1

// Reserved runtime diagnostic sources:
//   'runtime://local-storage/legacy-state'          legacy-unversioned input
//   'runtime://local-storage/classification-state'  versioned input

export interface StoredClassificationPayload {
  readonly schemaVersion: 1
  readonly modelVersion: string
  readonly dataVersion: string
  readonly currentQuestionId?: string
  readonly answers: Readonly<Record<string, readonly string[]>> // QuestionId -> readonly OptionId[]
}

export type SourceVersion = 'legacy-unversioned' | number

export type MigrationResult =
  | {
    readonly ok: true
    readonly sourceVersion: SourceVersion
    readonly payload: StoredClassificationPayload
    readonly diagnostics: readonly Diagnostic[]
  }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }

export type RestoreResult =
  | {
    readonly ok: true
    readonly sourceVersion: SourceVersion
    readonly answers: FlowAnswers                    // repaired, canonical, forced answers written
    readonly resumeQuestionId: string                // always an interactive question
    readonly complete: boolean
    readonly completedAnswers?: FlowAnswers          // present only when complete (from completeAnswers)
    readonly diagnostics: readonly Diagnostic[]      // one warning per migration or repair action
  }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] } // caller quarantines the raw value
```

Payload rules (structural validation of `unknown` input, Zod, strict object):

- `schemaVersion` must be the integer `1`; `modelVersion` and `dataVersion` are required non-empty strings; `currentQuestionId` is an optional string.
- `answers` is a record whose values are arrays of strings. **One canonical representation, `QuestionId -> readonly OptionId[]`, for every question**, single-choice questions included (approved Decision 5). The legacy scalar/array mixture exists only inside `legacyUnversionedToV1` and is normalized there.
- A wrong type anywhere in a version 1 payload is a structural error (`PERSIST_PAYLOAD_INVALID`, JSON Pointer to the field) and the restore fails without repair so the caller can quarantine. A well-typed but stale value is not structural; it is repaired (section 5.3).
- A question ID that is not in the compiled model, an option not belonging to its question, a missing question key (treated as unanswered, no diagnostic) and an unknown `currentQuestionId` are semantic matters handled by repair, not structural errors.
- Results are deeply frozen, inputs are never mutated, and object key order never affects output (answers are emitted in compiled question order).

## 5. Migration and repair policy

### 5.1 Version detection and unsupported versions

`migrateStoredClassification(input, model)` classifies the parsed value:

| Input | Outcome |
| --- | --- |
| not a plain object (`null`, array, string, number, boolean) | `ok: false`, `MIGRATION_INPUT_INVALID` |
| object with an own `schemaVersion` that is an integer `1` | version 1 path |
| object with an own `schemaVersion` that is an integer greater than `1` | `ok: false`, **`MIGRATION_UNHANDLED_VERSION`**; nothing is migrated, repaired or guessed (approved Decision 4) |
| object with an own `schemaVersion` that is `0`, negative, fractional, non-numeric or otherwise not a positive integer | `ok: false`, `MIGRATION_INPUT_INVALID` |
| object without `schemaVersion` | `legacy-unversioned` path |

The migration registry is an ordered list of `{ from, to, migrate }` steps. Version 1 has one step, `legacyUnversionedToV1`; a future `v1ToV2` is appended without changing detection. Steps are pure, deterministic and return new frozen values.

### 5.2 `legacyUnversionedToV1`

The legacy key's payload is the whole legacy state object. The step reads only `answers` and `stepIndex`; `phase`, `locale` and any unknown fields are ignored, which matches legacy behavior (the future envelope owns them). It applies the exact `restoreUserAnswers` rules recorded in section 1.3:

1. A non-object `answers` is treated as absent.
2. Single-choice fields (`form`, `archetype`, `tare`, `body`, `noodle`) are kept only when the value is a string in the legacy global value set; the value becomes a one-element array. An absent field becomes `[]`.
3. Multi-choice fields (`source`, `signature`, `exclusions`): a non-array becomes `[]`; unknown values are dropped; duplicates are removed keeping the first occurrence (order preserved).
4. `source` and `signature`: the exclusive value (`unsure`, `no-preference`) is removed when it appears with other values.
5. `exclusions`: the retired `seafood` value is expanded in place to `fish-seafood`, `shellfish`, `shrimp-crab`; then unknown values and duplicates are dropped; `none` is removed when combined with other values; an empty result becomes `['none']`.
6. `stepIndex` becomes `currentQuestionId`: an integer `>= 0` is clamped to the last question index and mapped through compiled question order; any other value becomes index `0` (the first question).
7. The legacy step does **not** enforce selection limits or cross-question consistency; that is repair. Its output is exactly the legacy sanitized answers in canonical shape, which makes it directly comparable with `restoreUserAnswers` (parity layer L1).

A field that legacy silently ignores because of an unusable type (non-string single value, non-array multi value, non-integer or negative `stepIndex`, non-object `answers`) is ignored identically and reported as a `MIGRATION_LEGACY_FIELD_IGNORED` warning. Values dropped because they are not in the value set are reported as `REPAIR_ANSWER_UNKNOWN_OPTION`. `seafood` expansion is reported as `MIGRATION_LEGACY_ALIAS_EXPANDED`. Deduplication, single-to-array conversion, exclusive-value normalization, the `exclusions` fallback and the `stepIndex` clamp are canonicalization performed silently, exactly as in legacy.

### 5.3 Repair (approved divergences BC-1 to BC-4)

`repairAnswers(model, answers, requestedQuestionId?)` uses only Batch 2A flow functions and the compiled `dependsOn`, so questionnaire rules stay in one place. It processes questions once, in `orderedQuestions` order, over a working copy:

**Step A, per question (in order).**

1. *Unknown question:* answer keys that are not question IDs are removed from the result (`REPAIR_ANSWER_UNKNOWN_QUESTION`).
2. *Dependency invalidation (BC-1):* if any question in `dependsOn` ended up unanswered after its own repair, or was changed by repair, all values of this question are cleared and `REPAIR_DEPENDENTS_CLEARED` is reported once for this question (only when it had values). A question with no dependencies (for example `exclusions`) is never cleared by this rule, matching the legacy reset which keeps `exclusions`.
3. *Unknown option (BC-1):* values that are not options of the question at all are dropped (`REPAIR_ANSWER_UNKNOWN_OPTION`).
4. *Not offered (BC-1):* remaining values that the question does not offer under the already repaired upstream answers (`resolveOptionIds`) are dropped (`REPAIR_ANSWER_NOT_OFFERED`).
5. *Duplicates:* removed keeping first occurrence, silently.
6. *Exclusive conflict:* when an exclusive option appears together with other values it is removed (`REPAIR_EXCLUSIVE_CONFLICT`), consistent with legacy normalization.
7. *Over-limit (approved Decision 3):* when more than `maxSelections` values remain, the **first `maxSelections` values in stored array order are kept and the rest are discarded** (`REPAIR_ANSWER_OVER_LIMIT`). Stored order is the order of the (already de-duplicated, filtered) input array, which for legacy data is the user's click order; it is **not** re-sorted into option definition order. The whole answer is never cleared merely for exceeding the limit. Example: `source` limit 2 with stored `['duck','pork','chicken']` becomes `['duck','pork']`.
8. *Empty fallback:* an empty answer for a question with `emptyFallbackOptionId` receives that option silently (this is canonicalization, as in legacy).
9. *Changed marker:* the question is marked changed when steps 3 to 7 altered its values, which feeds rule 2 for its dependents.

**Step B, forced answers and first actionable question (BC-3, BC-4).** After Step A, walk the questions in order and write forced answers:

- a question that is satisfied (`canContinue`) is passed over;
- an unsatisfied question with exactly one offered option and `autoSelectSingleOption` is answered with that option (`REPAIR_FORCED_ANSWER_APPLIED`) and passed over;
- the first unsatisfied question that is not forced is the **first actionable question**; the walk stops there.

Forced answers beyond that question are not written (matching legacy, which writes them only on advance), and valid answers beyond it are kept. This runs for every restore regardless of the envelope phase, which is what makes `intro` restores settled (BC-4).

**Step C, completion.** `completeAnswers` decides completeness. If the walk passed every question and `completeAnswers` succeeds, `complete` is `true` and `completedAnswers` is returned. Repair must never return `complete: true` when `completeAnswers` fails (asserted by tests). Because repair removes over-limit, not-offered and unknown values, no restored state can leave the user at the final question unable to finish (BC-3).

**Step D, resume question (BC-2).** Let `r` be the requested question (`currentQuestionId` from the payload, or the question mapped from a legacy `stepIndex`) and `a` the first actionable question, or none when complete.

| Case | Resume |
| --- | --- |
| complete and `r` absent | the last question in order |
| complete and `r` present | the first interactive (non-forced) question at or after `r` |
| not complete and `r` absent | `a` |
| not complete and `r` is at or before `a` | the first interactive (non-forced) question at or after `r` (this equals `a` or an earlier interactive question) |
| not complete and `r` is after `a` | `a`, with `REPAIR_RESUME_MOVED` |
| `r` is not a question ID | `a` (or the last question when complete), with `REPAIR_RESUME_MOVED` |

The resume question therefore never lies beyond the earliest invalid or unanswered required question, is never a forced question, and always offers at least one option.

### 5.4 Model and data version mismatch (approved Decision 4)

A supported payload whose `modelVersion` or `dataVersion` differs from the compiled model is **not rejected**. Order of operations: parse and migrate the payload version first, then revalidate every answer against the current canonical model and repair deterministically (5.3), then emit `PERSIST_MODEL_VERSION_CHANGED` (a warning, path `/modelVersion` or `/dataVersion`, one diagnostic per differing field). An unsupported schema version is never treated as repairable (5.1).

### 5.5 Completion restoration and the future envelope contract (approved Decision 7)

`restoreQuestionnaire` returns `answers`, `complete`, `completedAnswers` and `resumeQuestionId`; that is all a future envelope adapter needs. The documented, unimplemented Batch 5A envelope rule is: **an incomplete `results` snapshot falls back to `intro` while preserving the recoverable (repaired) answers**, exactly as legacy falls back to `intro` with the restored answers and locale; a complete `results` snapshot shows results. Batch 2B implements no `phase` handling; the test-only envelope reader in `tools/parity` reproduces the rule only to prove parity.

### 5.6 Guarantees

- **Idempotence:** `repairAnswers(repairAnswers(x)) = repairAnswers(x)` with no diagnostics on the second pass, and `restoreQuestionnaire(serialize(restoreQuestionnaire(x))) ` returns identical answers, `complete` and `resumeQuestionId` and no repair diagnostics.
- **Determinism:** the output depends only on the compiled model and input values, never on key order, time or randomness.
- **Immutability:** every returned value is deeply frozen; input values, including frozen inputs, are never mutated.
- **No invention:** repair adds only forced answers and empty fallbacks, never a user choice.
- **Always actionable:** every successful restore is `complete` or has a `resumeQuestionId` for a question that offers at least one option.
- **Aggregated diagnostics:** independent problems are all reported; results are sorted with the existing diagnostic comparator.

## 6. Proposed files and modules

Core (public API exported from the package root; no DOM, React, storage, time or randomness):

```text
packages/classification-core/src/persistence/
  contracts.ts        payload types, CURRENT_SCHEMA_VERSION, result types
  payload-schema.ts   strict Zod schema for schemaVersion 1 (accepts unknown)
  legacy.ts           legacyUnversionedToV1 and legacy value sets derived from the compiled model
  migrate.ts          version detection, registry, migrateStoredClassification
  repair.ts           repairAnswers (steps A to D)
  restore.ts          restoreQuestionnaire and serializeClassificationPayload
  index.ts            public exports
  persistence.test.ts unit, contract and property tests (see section 8)
```

No Batch 2A source file changes (section 1.5). Tools and documentation:

```text
tools/parity/legacy-restore-engine.ts   frozen legacy restore path as an oracle
tools/parity/restore-scenarios.ts       scenario builder and category classifier
tools/parity/restore-generate.ts        writes and checks the committed fixtures
tools/parity/restore.test.ts            parity, divergence and invariant tests
tools/parity/fixtures/restore-parity.json       digests for legacy-parity scenarios
tools/parity/fixtures/restore-divergence.json   full BC-1..BC-4 fixtures (legacy result and expected new result)
docs/migration/baseline.md              legacy persistence section
```

Existing files touched: `contracts/diagnostic-codes.ts`, `src/index.ts`, `tools/documentation/relations.ts`, `package.json` scripts, the ledger, README and `AGENTS.md`. No `apps/web`, React or production browser file is created.

## 7. Public API

```ts
migrateStoredClassification(input: unknown, model: ClassificationModel): MigrationResult
validateStoredPayload(input: unknown, model: ClassificationModel): ValidationResult   // version 1 structure only
repairAnswers(model: ClassificationModel, answers: FlowAnswers, requestedQuestionId?: string): RepairResult
restoreQuestionnaire(input: unknown, model: ClassificationModel): RestoreResult      // parse, migrate, repair, resume, completion
serializeClassificationPayload(model: ClassificationModel, answers: FlowAnswers, currentQuestionId?: string): StoredClassificationPayload
```

`RepairResult` is `{ answers, resumeQuestionId, complete, completedAnswers?, diagnostics }` using the same fields as a successful `RestoreResult`. `serializeClassificationPayload` writes the current `modelVersion` and `dataVersion` and every question key in compiled order. None of these functions touch storage.

## 8. Parity strategy: legacy parity and approved divergence are separate categories

### 8.1 Oracle

The legacy restore code lives in `App.tsx` and depends on `window.localStorage`, so the oracle follows the Batch 2A technique: extract the top-level functions verbatim from the frozen `App.tsx` with the TypeScript compiler API (`readStoredState`, `getStoredStepIndex`, `isStoredState`, `isLocale`, `getStorage`, `createInitialAnswers`, `applyForcedAnswersFromStep` and its helpers), run them against a stub `window.localStorage` returning each scenario's raw string, and import `restoreUserAnswers` and `toCompletedAnswers` from the legacy `schema.ts`. A test-only legacy envelope reader in `tools/parity` composes `restoreQuestionnaire` with the legacy envelope rules (phase, locale, results re-check, `intro` step retention) so the whole legacy `readStoredState` is comparable without a production envelope. Source hashes of all extracted legacy files are recorded in the fixtures.

### 8.2 Scenario classification (decided from the legacy side, never from the new code)

Each scenario is classified by a predicate computed only from the legacy oracle output and the compiled model, so the new implementation can never move a scenario between categories:

- **Category P, legacy parity:** the legacy restored state is *healthy*: (i) every answered question is within its offered options, within its limits and free of exclusive conflicts; (ii) every question before the legacy resume step is satisfied or forced; (iii) settling forced answers from the legacy resume step changes nothing (no unsettled forced step). Raw-input scenarios that legacy resolves to the fallback state (invalid JSON, non-object, empty, missing storage) are also category P.
- **Category D, approved divergence:** at least one condition is true, and each true condition attaches its label:
  - **BC-1** condition (i) fails: stale, not-offered, unknown-option or over-limit answers exist;
  - **BC-2** condition (ii) fails: the legacy resume step is ahead of the first unsatisfied question;
  - **BC-3** the legacy answers are not completable (`toCompletedAnswers` is `null`) while the legacy resume step is the last question, or the snapshot is `results` with an incomplete state that would leave the user unable to finish;
  - **BC-4** condition (iii) fails: forced answers were not written by the legacy path (the `intro` and `results` restore paths).
- Every scenario belongs to exactly one category. A scenario cannot be P and D.

### 8.3 Test categories

| Category | Test | Pass condition |
| --- | --- | --- |
| **Legacy parity (P)** | `restore legacy parity` | new answers (canonical shape), resume question, phase, locale and completion equal the legacy oracle **exactly**; any difference is a regression |
| **Migration boundary (L1)** | `legacy sanitization parity` | `legacyUnversionedToV1` equals legacy `restoreUserAnswers` for **every** scenario, including unhealthy ones, because BC-1 to BC-4 begin only in repair |
| **Approved divergence (D)** | `restore approved divergence` | new output equals the expected result stored in `restore-divergence.json`, differs from legacy in exactly the labeled way, and the labeled BC set matches the predicate; a divergence scenario whose new output equals legacy fails as an unexpected convergence (stale approval) |
| **Invariants** | `restore invariants` | idempotence, determinism, immutability, no invention, always actionable, completeness consistent with `completeAnswers`, over the whole state space |
| **Version handling** | `migration contract` | future versions fail with `MIGRATION_UNHANDLED_VERSION`; invalid versions and inputs fail with `MIGRATION_INPUT_INVALID`; model or data metadata mismatch repairs and warns |

The parity test and the divergence test read different fixture files, so a divergence can never be counted as a parity regression, and an unapproved difference in category P can never be hidden in the divergence list.

### 8.4 Scenario state space (deterministic, bounded per question, fixed seed where sampled)

- Raw inputs: empty string, whitespace, invalid JSON, truncated JSON, `null`, `[]`, `"text"`, `1`, `true`, `1e400`, deeply nested objects.
- Field fuzz for `phase`, `locale`, `stepIndex` (negative, fractional, oversized, string, boolean, null, array) and `answers` (missing, non-object, array).
- Answer values: every valid value, unknown value, wrong type, duplicates, exclusive conflicts, `seafood`, over-limit sets, empty arrays.
- Cross-field: every form and archetype pair (valid and invalid) with every `tare`, `body`, `noodle`, `source`, `signature` value under each archetype; downstream answers with missing upstream answers.
- Resume: every `stepIndex` from 0 to 8 and out of range, crossed with representative answer states in all three phases.
- Versioned inputs: version 1 valid; versions 2 and 99; 0, negative, fractional and string versions; metadata mismatches.

Fixtures store `{ count, sha256 }` digests for category P (as in Batch 2A) and full, human-reviewable entries for category D. `npm run parity:legacy -- <legacy checkout>` regenerates both from the frozen legacy code and fails on any unapproved difference; `npm run parity` verifies the committed fixtures without the legacy checkout. Mutation checks (perturb one repair rule and confirm the right test fails) are recorded as ledger evidence.

### 8.5 Required BC-1 to BC-4 divergence fixtures (each stores legacy output and expected new output)

| Fixture | Input (legacy phase, step, answers) | Legacy result | Expected new result | Labels |
| --- | --- | --- | --- | --- |
| D1 branch-stale archetype | `questions`, 3, form `soup`, archetype `miso-rich`, tare `shoyu`, source `['pork']` | restored as is, shows `source` with an impossible archetype | archetype dropped, dependents cleared, resume `archetype` | BC-1 |
| D2 restricted tare | `questions`, 2, form `tsukemen`, archetype `konbusui-light`, tare `spicy-sesame` | restored as is | tare dropped, resume `tare` | BC-1 |
| D3 over-limit source | `questions`, 3, complete answers with source `['duck','pork','chicken']` | restored as is, completion later fails silently | source `['duck','pork']`, other answers kept | BC-1 (Decision 3 order fixture) |
| D4 missing prefix | `questions`, 5, form `soup`, no archetype | shows `noodle` with earlier answers missing | resume `archetype` | BC-2 |
| D5 stuck at last question | `questions`, 7, all answers except `source: []` | last question, continue does nothing | resume `source` | BC-2, BC-3 |
| D6 bypassed branch | `questions`, 7, form `tsukemen`, archetype `miso-rich`, tare `shoyu`, source `['pork']`, body `rich`, noodle `extra-thick`, signature `['corn-butter']` | stuck at last question | tare `shoyu` dropped, forced `miso` written, `complete: true` | BC-1, BC-3, BC-4 |
| D7 unsettled intro | `intro`, 2, form `dry`, archetype `soupless-tantan` | intro keeps the unsettled step | tare `spicy-sesame` written, resume `source` | BC-4 |
| D8 incomplete results | `results`, 7, answers with `source: []` | falls back to `intro`, restored answers kept | `complete: false`, repaired answers, resume `source` (the future envelope maps this to `intro`) | BC-3 |

Parity fixtures that must stay identical to legacy include: the fractional `stepIndex` restore, the incomplete-results fallback envelope rule, corrupt JSON, unknown phase and locale, negative and oversized `stepIndex`, the `seafood` expansion, duplicate and unknown values, exclusive conflicts and every healthy `questions`-phase state with the requested step at or before the first unsatisfied question.

## 9. Diagnostics

Reuse `Diagnostic` (stable code, severity, entity ID, source file, RFC 6901 path, message, optional expected and received values). Each code names one stable, machine-readable condition, is declared once in the registry, and none duplicates an existing code (existing codes cover compiler definitions, flow definitions, documentation and ledger only). Tests fail on an undeclared code.

| Code | Severity | Distinct condition | Emitted by |
| --- | --- | --- | --- |
| `MIGRATION_UNHANDLED_VERSION` | error | stored `schemaVersion` is a valid integer newer than this build supports | version detection |
| `MIGRATION_INPUT_INVALID` | error | input is not a plain object, or `schemaVersion` is not a positive integer | version detection |
| `PERSIST_PAYLOAD_INVALID` | error | a version 1 payload fails structural validation (path names the field) | payload schema |
| `MIGRATION_LEGACY_FIELD_IGNORED` | warning | a legacy field had an unusable type or shape and was ignored exactly as legacy ignores it | `legacyUnversionedToV1` |
| `MIGRATION_LEGACY_ALIAS_EXPANDED` | warning | the retired `seafood` exclusion was expanded into granular exclusions | `legacyUnversionedToV1` |
| `PERSIST_MODEL_VERSION_CHANGED` | warning | payload `modelVersion` or `dataVersion` differs from the compiled model | restore |
| `REPAIR_ANSWER_UNKNOWN_QUESTION` | warning | an answer key is not a question in the compiled model | repair |
| `REPAIR_ANSWER_UNKNOWN_OPTION` | warning | a value is not an option of its question | migration boundary and repair |
| `REPAIR_ANSWER_NOT_OFFERED` | warning | an option of the question is not offered under the current upstream answers | repair |
| `REPAIR_DEPENDENTS_CLEARED` | warning | a question's answers were cleared because an upstream answer is missing or was repaired | repair |
| `REPAIR_EXCLUSIVE_CONFLICT` | warning | an exclusive option was combined with other values | repair |
| `REPAIR_ANSWER_OVER_LIMIT` | warning | more selections than `maxSelections`; the first N in stored order were kept | repair |
| `REPAIR_FORCED_ANSWER_APPLIED` | warning | a single-option question was answered automatically | repair |
| `REPAIR_RESUME_MOVED` | warning | the requested resume question was later than the first actionable one, or unknown | repair |

Two additions to the earlier draft are justified by concrete contract cases: `REPAIR_ANSWER_UNKNOWN_QUESTION` (a version 1 payload written under a model that later removed a question) and `MIGRATION_LEGACY_FIELD_IGNORED` (legacy wrong-type fields that must be ignored, not rejected, to preserve parity). The earlier `REPAIR_LEGACY_ALIAS_MIGRATED` is renamed `MIGRATION_LEGACY_ALIAS_EXPANDED` because the alias is handled at the migration boundary, not by repair. Silent canonicalization (duplicates, single-to-array conversion, exclusive normalization at the legacy boundary, `exclusions` fallback, `stepIndex` clamp) has no diagnostic by design because legacy performs it silently.

### 9.1 Diagnostics produced per case

| Case | Result | Diagnostics |
| --- | --- | --- |
| invalid JSON is handled by the caller before core | not a core case | none |
| `null`, array, string, number, boolean | `ok: false` | `MIGRATION_INPUT_INVALID` |
| `schemaVersion: 2` or `99` | `ok: false` | `MIGRATION_UNHANDLED_VERSION` |
| `schemaVersion: 0`, `-1`, `1.5`, `'1'` | `ok: false` | `MIGRATION_INPUT_INVALID` |
| version 1 with a wrong-typed field | `ok: false` | `PERSIST_PAYLOAD_INVALID` at the field path |
| legacy state with `answers: 'x'` or `stepIndex: 1.5` | ok, defaults applied | `MIGRATION_LEGACY_FIELD_IGNORED` |
| legacy `exclusions: ['seafood']` | ok | `MIGRATION_LEGACY_ALIAS_EXPANDED` |
| legacy or v1 unknown option value | ok, value dropped | `REPAIR_ANSWER_UNKNOWN_OPTION` |
| v1 unknown question key | ok, key dropped | `REPAIR_ANSWER_UNKNOWN_QUESTION` |
| stale not-offered option | ok, value dropped | `REPAIR_ANSWER_NOT_OFFERED`, plus `REPAIR_DEPENDENTS_CLEARED` for each downstream question that had values |
| exclusive with others in v1 | ok | `REPAIR_EXCLUSIVE_CONFLICT` |
| over-limit selection | ok, first N kept | `REPAIR_ANSWER_OVER_LIMIT` |
| single-option question unanswered | ok, written | `REPAIR_FORCED_ANSWER_APPLIED` |
| requested resume after first actionable | ok, moved | `REPAIR_RESUME_MOVED` |
| model or data version differs | ok, revalidated | `PERSIST_MODEL_VERSION_CHANGED` |
| healthy current payload | ok | none |

## 10. Task breakdown

Task order is fixed; each task ends with its focused tests green and no other batch's files touched.

1. **Record the audit.** Copy the verified findings of section 1 and the approved divergences BC-1 to BC-4 into `docs/migration/baseline.md`.
2. **Contracts.** Payload types, `CURRENT_SCHEMA_VERSION`, strict payload schema, the diagnostic codes of section 9, and contract tests (structure, `unknown` input, undeclared-code guard).
3. **Migration.** Version detection, registry, `legacyUnversionedToV1`, and migration diagnostics, with tests for every row of section 9.1 that belongs to migration.
4. **Repair.** Steps A to D over the Batch 2A flow API: dependency invalidation, over-limit ordering, forced-answer materialization, first actionable question, resume rules and completion, with idempotence, determinism, immutability, no-invention and always-actionable property tests.
5. **Restore entry point.** `restoreQuestionnaire`, `validateStoredPayload`, `serializeClassificationPayload`, model and data version handling.
6. **Parity harness.** Legacy restore oracle, scenario builder and classifier, generator, category P and category D fixtures, the eight divergence fixtures, mutation checks, and `npm run parity` coverage.
7. **Documentation and index.** `tools/documentation/relations.ts`, regenerated classification index and manifest, `change-map.md` rows for payload schema, migrations, repair policy and resume, README and `AGENTS.md`.
8. **Gate.** `npm run verify` locally (valid `GITHUB_TOKEN`, `NODE_USE_ENV_PROXY=1` in this sandbox), push, confirm remote CI, and record evidence through the ledger state machine: `in-progress`, then `in-review` with `batch2b-legacy-parity` and `batch2b-local-verify`, then `migration:ledger:record-ci` to `complete` with `batch2b-remote-ci`. The ledger schema gains the completion gate policy for batch `2B` in Task 7.

## 11. Documentation and ledger updates

| Artifact | Update |
| --- | --- |
| `docs/migration/baseline.md` | "Verified legacy persistence behavior" (section 1) and the approved intentional differences BC-1 to BC-4 |
| Classification documentation | `docs/classification/index.md` and `manifest.json` regenerated; `change-map.md` rows for payload schema, migrations, repair policy and resume; persistence relations in `tools/documentation/relations.ts` |
| Migration ledger | batch `2B` entry: legacy sources (`src/App.tsx`, `src/domain/schema.ts`, `src/domain/questionRules.ts`, `src/domain/types.ts`), new owners, transformation, behavior `parity-preserved` for category P with the approved divergences BC-1 to BC-4 named, gates `batch2b-legacy-parity`, `batch2b-local-verify`, `batch2b-remote-ci`, and the schema completion policy for batch `2B` |
| `README.md` | status text after completion |
| `AGENTS.md` | phase text after completion; note that the core payload excludes `locale`, `phase` and `savedAt` and that the envelope and adapter belong to Batch 5A |

## 12. Acceptance criteria

- Category P: for every scenario the new answers, resume question, completion and envelope-level outcome equal the frozen legacy behavior exactly.
- L1: `legacyUnversionedToV1` equals legacy `restoreUserAnswers` for every scenario, healthy or not.
- Category D: every divergence is one of BC-1 to BC-4, is stored with legacy output and expected output, and matches the legacy-side predicate; no unapproved difference exists.
- Every restore result is complete or has an interactive resume question that offers at least one option; the user can never be left at the final question with an unfinishable earlier answer.
- Unsupported future schema versions fail with `MIGRATION_UNHANDLED_VERSION`; a supported payload with different `modelVersion` or `dataVersion` is repaired with a warning, never rejected.
- Over-limit selections keep the first N in stored order deterministically; the `seafood` migration remains covered.
- Repair is idempotent; all returns are deeply frozen; inputs are not mutated; validators accept `unknown`.
- The core imports no DOM, React, storage, time or randomness; no `apps/web`, React or production browser code exists; no Batch 2A source changed; no scoring, `legacyWeight`, style, exclusion evaluation, catalog, Finder, map or localization work was added.
- `npm run verify`, `npm run parity` and `npm run parity:legacy -- <legacy checkout>` pass locally, remote CI passes, and the ledger records the three Batch 2B gates.

## 13. Settled design decisions (approved by the user on 2026-09-30)

These decisions are settled and are encoded in the sections named. They are not implementation permission.

| # | Decision | Encoded in |
| --- | --- | --- |
| 1 | No `apps/web`; Batch 2B owns only core versioning, parsing, validation, migration, repair, restore and resume, diagnostics and parity tooling; production envelope, localStorage and React stay in Batch 5A; a test-only legacy envelope reader in `tools/parity` is allowed | sections 2, 3, 6, 8.1 |
| 2 | BC-1 to BC-4 are approved intentional differences and no others: BC-1 remove stale or invalid answers and invalidate dependents; BC-2 move the resume position back to the earliest invalid or unanswered required question; BC-3 repair states that would be stuck at the final question; BC-4 materialize forced answers during restore including the legacy `intro` path | sections 5.3, 8.2 to 8.5, 12 |
| 3 | Over-limit: keep the first N valid selections in stored order and discard the rest; never clear the whole answer | section 5.3 step 7, fixture D3 |
| 4 | Model or data metadata mismatch is not rejected: migrate, revalidate, repair, warn; unsupported future schema versions fail with `MIGRATION_UNHANDLED_VERSION` | sections 5.1, 5.4, 9 |
| 5 | Canonical answers are `QuestionId -> readonly OptionId[]`; legacy scalars exist only at the migration boundary | sections 4, 5.2 |
| 6 | Diagnostic codes approved after verification: each is one distinct condition, none duplicates an existing code, `MIGRATION_UNHANDLED_VERSION` is kept for future versions; two additions are justified by contract cases and one is renamed | section 9 |
| 7 | An incomplete legacy `results` snapshot falls back to `intro` preserving recoverable answers, as a documented future envelope rule; no `phase` handling in Batch 2B; the core exposes `complete`, `completedAnswers`, `resumeQuestionId` and repaired answers | section 5.5, fixture D8 |
| 8 | `locale`, `phase` and `savedAt` are outside the core payload | sections 4, 5.2, 11 |

### 13.1 Remaining implementation blockers

None identified. The Batch 2A flow API satisfies every Batch 2B requirement without change (section 1.5). The plan is ready for a separate final implementation approval.

## 14. Risks and edge cases

- Legacy `stepIndex` is app state, not domain state; converting it to a question ID must preserve the clamp and the settle behavior for every category P scenario.
- Legacy accepts values from the global value sets even when the question does not offer them under the current archetype; migration keeps them and repair decides (BC-1), so L1 stays exact.
- The category predicate must be computed from the legacy oracle only; a predicate that consults the new code would let a regression hide as a divergence. The harness asserts that the predicate module imports nothing from the persistence module.
- Extracting legacy functions from `App.tsx` is text based; every legacy source file is hashed and extraction fails loudly if a target function disappears.
- State-space size: scenarios are bounded per question and stored as digests to avoid the memory exhaustion seen during Batch 2A.
- Dependency invalidation depends on processing questions in compiled order; property tests assert idempotence and order independence of input keys.
- Forced answers beyond the first actionable question are intentionally not written (legacy parity); if a future model places a forced question after an interactive one, the resume rules still hold and the walk is unchanged.
- The future registry must stay open for later steps without changing version detection.
- The storage adapter contract (never overwrite or delete the legacy key, quarantine on failure, autosave only after a valid target envelope) cannot be proven in Batch 2B and is documented only; Batch 5A must add adapter tests for it.
- Sandbox verification of the ledger requires `NODE_USE_ENV_PROXY=1` and a valid `GITHUB_TOKEN`.

## 15. Approval

Design decisions (settled 2026-09-30, see section 13):

- [x] Scope and out-of-scope list
- [x] Decision 1: no `apps/web`; envelope and adapter deferred to Batch 5A
- [x] Decision 2: BC-1 to BC-4 approved as the only intentional differences
- [x] Decision 3: over-limit rule
- [x] Decision 4: model or data version mismatch policy and unsupported-version failure
- [x] Decision 5: canonical answers shape
- [x] Decision 6: diagnostic codes
- [x] Decision 7: results-restoration handling as a documented envelope rule
- [x] Decision 8: `locale`, `phase` and `savedAt` outside the core payload

Still required before any Batch 2B task starts:

- [ ] Separate final implementation approval of this written plan by the user

