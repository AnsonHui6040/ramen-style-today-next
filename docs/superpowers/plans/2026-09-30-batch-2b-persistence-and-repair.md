# Batch 2B: Persistence and Repair Implementation Plan

**Status:** DRAFT — review required. This document is not implementation permission. Do not start any task below until the user has approved it in writing (AGENTS.md: "Do not start an implementation batch until its written design or plan has the required approval").

**Baseline:** `AnsonHui6040/ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37`

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

`createInitialAnswers`, `settleFrom`, `nextPosition`, `previousQuestionId`, `resolveOptionIds`, `selectedOptionIds`, `forcedOptionId`, `canContinue`, `completeAnswers`, `orderedQuestions`, and the flow's exclusive-option and empty-fallback semantics. Two small internal changes to Batch 2A files are expected (section 6, Task 2): export the exclusive-option lookup and extract the value normalization now embedded in `completeAnswers` as a shared `normalizeAnswers`, both behavior-preserving and covered by the existing Batch 2A parity gate.

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

Web persistence: this plan proposes **no `apps/web` workspace in Batch 2B** (see Decision 1). The browser envelope (`phase`, `locale`, `savedAt`), the storage adapter, the read-only legacy source and quarantine mode are specified as contracts and documented, but implemented in Batch 5A where the React consumer is built.

## 3. Ownership boundaries

| Concern | Owner | Batch 2B deliverable |
| --- | --- | --- |
| Versioned classification payload, schema version | `classification-core` | schema, types, constants |
| Structural validation of `unknown` input | `classification-core` | Zod schema plus diagnostics |
| Migrations (legacy-unversioned to v1, future steps) | `classification-core` | registry and steps |
| Repair and sanitization, resume question | `classification-core` | repair policy and API, built on the flow |
| Semantic validation (answers within offered options, limits) | `classification-core` | reuse of `completeAnswers` |
| App envelope (`savedAt`, `phase`, `locale`) | `apps/web` (Batch 5A) | contract documented only |
| localStorage adapter, legacy-key read-only policy, quarantine and autosave gating | `apps/web` (Batch 5A) | contract documented only |
| React integration | `apps/web` (Batch 5A) | none |
| Legacy envelope reader used to prove parity | `tools/parity` (test tooling, never shipped) | oracle adapter that composes the core API with legacy envelope rules |

The core payload never contains `phase`, `locale`, `savedAt` or `stepIndex`; a legacy `stepIndex` is converted to `currentQuestionId` at the boundary.

## 4. Contracts (proposal)

```ts
// Reserved runtime source for diagnostics
// 'runtime://local-storage/legacy-state'  (legacy input)
// 'runtime://local-storage/classification-state'  (versioned input)

export const CURRENT_SCHEMA_VERSION = 1

export interface StoredClassificationPayload {
  readonly schemaVersion: 1
  readonly modelVersion: string
  readonly dataVersion: string
  readonly currentQuestionId?: string
  readonly answers: Readonly<Record<string, readonly string[]>> // question ID -> option IDs
}

export type SourceVersion = 'legacy-unversioned' | number

export interface RepairEvent {          // reported as a Diagnostic with severity 'warning'
  readonly code: RepairCode
  readonly questionId?: string
  readonly optionId?: string
}

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
    readonly answers: FlowAnswers
    readonly resumeQuestionId: string     // always a question the user can act on
    readonly complete: boolean
    readonly completedAnswers?: FlowAnswers
    readonly diagnostics: readonly Diagnostic[]   // warnings for every repair performed
  }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] } // caller quarantines
```

Payload notes:

- `answers` uses stable question and option IDs as arrays for every question, matching Batch 2A `FlowAnswers`. The legacy scalar/array mix is normalized during migration only.
- `modelVersion` and `dataVersion` are recorded for traceability. A mismatch with the current compiled model is informational (a warning diagnostic) and never an error; repair re-validates everything against the current model regardless.
- `currentQuestionId` is optional and advisory: it can only move the resume point **earlier** than the first actionable question, never later.
- All results are deeply frozen. Validators accept `unknown` and never cast JSON into domain types before parsing.

## 5. Migration and repair policy

### 5.1 Migration

- The registry is an ordered list of `{ from, to, migrate }` steps. `migrateStoredClassification(input, model)` detects the source version, applies steps until `CURRENT_SCHEMA_VERSION`, and returns a `MigrationResult`.
- Version detection: an object with an integer `schemaVersion` is a versioned payload; an object without `schemaVersion` is `legacy-unversioned`; anything else is invalid input.
- `schemaVersion` greater than the current version → `ok: false` with `MIGRATION_UNHANDLED_VERSION`; nothing is repaired or guessed. A non-integer, zero or negative `schemaVersion` → `MIGRATION_INPUT_INVALID`.
- `legacyUnversionedToV1`: takes the classification-relevant legacy fragment `{ answers?: unknown, stepIndex?: unknown }` (the web adapter extracts it; the harness does the same), applies the exact `restoreUserAnswers` rules of section 1.3 (global value sets, dedupe, unknown-value drop, exclusive normalization, `seafood` expansion, `exclusions` fallback), converts single fields to one-element arrays, and converts `stepIndex` to `currentQuestionId` by the legacy clamp rule. It does **not** enforce selection limits or cross-question consistency; that is repair.
- Steps are pure, deterministic, return new frozen objects, and emit a warning diagnostic for each transformed value (for example `REPAIR_LEGACY_ALIAS_MIGRATED` for `seafood`).

### 5.2 Repair

`repairAnswers(model, answers, requestedQuestionId?)` walks questions in `orderedQuestions` order using only Batch 2A flow functions, so the rules stay in one place:

1. Drop values that are not options of that question at all (`REPAIR_ANSWER_UNKNOWN_OPTION`).
2. Apply exclusive-option normalization (`REPAIR_EXCLUSIVE_CONFLICT`).
3. Drop values that are options of the question but are **not offered** given the already repaired upstream answers, then clear dependent questions that depended on a changed answer (`REPAIR_ANSWER_NOT_OFFERED`, `REPAIR_DEPENDENTS_CLEARED`).
4. If the count exceeds `maxSelections`, keep the first `maxSelections` values in stored order (`REPAIR_ANSWER_OVER_LIMIT`). Proposed rule; see Decision 3.
5. Restore the empty fallback where configured.
6. Write forced answers with `settleFrom`, so single-option questions never remain as unanswered gaps (`REPAIR_FORCED_ANSWER_APPLIED`).
7. Compute completion with `completeAnswers`. If complete, `resumeQuestionId` is the last question in order. Otherwise it is the first question in order that the user must answer (fails `canContinue` and is not forced).
8. If a `requestedQuestionId` (legacy step or `currentQuestionId`) is earlier than that question it is honored; if later or unknown it is replaced by the first actionable question (`REPAIR_RESUME_MOVED`).

Properties the plan requires and tests must assert: **idempotence** (`repair(repair(x)) = repair(x)` with no events the second time), **determinism** (input order of object keys does not matter), **immutability**, **no invention** (repair never adds an answer the user did not give, except forced answers and empty fallbacks), and **always actionable** (the resume question is offered at least one option, or is forced-skipped never being the resume target).

## 6. Proposed files and modules

Core (public API exported from the package root, no DOM, React or storage imports):

```text
packages/classification-core/src/persistence/
  contracts.ts        payload types, schema version constant, result types
  payload-schema.ts   Zod schema for schema version 1 (accepts unknown)
  legacy.ts           legacyUnversionedToV1 and its value sets derived from the compiled model
  migrate.ts          registry, version detection, migrateStoredClassification
  repair.ts           repairAnswers and resume selection
  restore.ts          restoreQuestionnaire (parse, migrate, validate, repair)
  index.ts            public exports
  persistence.test.ts unit and property tests
packages/classification-core/src/flow/normalize.ts   shared normalizeAnswers (extracted from complete.ts)
```

Tools and documentation:

```text
tools/parity/legacy-restore-engine.ts   loads the frozen legacy restore path as an oracle
tools/parity/restore-scenarios.ts       state-space builder for restore
tools/parity/restore-generate.ts        writes and checks the committed fixture
tools/parity/restore.test.ts            asserts the new API against the fixture
tools/parity/fixtures/restore.json      digests plus approved-difference list
docs/migration/baseline.md              legacy persistence section (Task 1)
```

Existing files touched: `flow/complete.ts` and `flow/options.ts` (behavior-preserving extraction and export), `contracts/diagnostic-codes.ts`, `src/index.ts`, `tools/documentation/relations.ts`, the ledger, README, `AGENTS.md`, `package.json` scripts, and `.github/workflows/ci.yml` only if a new command needs the legacy checkout step already present.

## 7. Public API proposal

```ts
migrateStoredClassification(input: unknown, model: ClassificationModel): MigrationResult
validateStoredPayload(input: unknown, model: ClassificationModel): ValidationResult  // structure + semantics
repairAnswers(model: ClassificationModel, answers: FlowAnswers, requestedQuestionId?: string): RepairResult
restoreQuestionnaire(input: unknown, model: ClassificationModel): RestoreResult
serializeClassificationPayload(model: ClassificationModel, answers: FlowAnswers, currentQuestionId?: string): StoredClassificationPayload
```

`restoreQuestionnaire` is the one entry point a consumer needs: parse, migrate, validate, repair, resume. `serializeClassificationPayload` builds the version-1 payload for saving. None of these touch storage, time or randomness.

## 8. Parity strategy

The legacy restore code lives in `App.tsx` and depends on `window.localStorage`, so the oracle follows the Batch 2A technique: extract the top-level functions verbatim from the frozen `App.tsx` with the TypeScript compiler API (`readStoredState`, `getStoredStepIndex`, `isStoredState`, `isLocale`, `getStorage`, `createInitialAnswers`, `applyForcedAnswersFromStep` and its helpers), run them against a stub `window.localStorage` that returns each scenario's raw string, and import `restoreUserAnswers` and `toCompletedAnswers` from the legacy `schema.ts`. A `tools/parity` legacy envelope reader composes `restoreQuestionnaire` with the legacy envelope rules (phase, locale, results re-check) so the **whole** legacy `readStoredState` behavior can be compared, even though the shipped envelope belongs to Batch 5A. Source hashes of every extracted legacy file are recorded in the fixture.

Comparison layers:

| Layer | What is compared | Expected result |
| --- | --- | --- |
| L1 Sanitization | `legacyUnversionedToV1` output versus `restoreUserAnswers` for every scenario | identical after shape conversion |
| L2 Envelope | phase, locale and clamped step versus `readStoredState` for every scenario | identical |
| L3 Healthy states | scenarios that the legacy code can finish (prefix-valid, within limits, branch-consistent) | repair is a no-op except forced answers; resulting answers and step identical to legacy |
| L4 Unhealthy states | stale, over-limit, prefix-missing or unfinishable legacy states | **intentional difference**, listed one by one in the fixture and approved through this plan (BC-1 to BC-4 below) |
| L5 Invariants | idempotence, determinism, immutability, always-actionable resume, completeness or actionable question | asserted over the whole state space |

Scenario state space (all generated deterministically, no randomness without a fixed seed):

- Raw-input malformed set: empty string, whitespace, invalid JSON, truncated JSON, `null`, `[]`, `"text"`, `1`, `true`, deeply nested, huge numbers, `1e400`.
- Field-level fuzz for `phase`, `locale`, `stepIndex` (negative, fractional, `NaN`-like, oversized, string, boolean, null, array) and `answers` (missing, non-object, array).
- Answer fields: every valid value, unknown value, wrong type, duplicated values, exclusive conflicts, the retired `seafood`, over-limit sets, and empty arrays.
- Cross-field stale states: every form × archetype pair (valid and invalid), with every `tare`, `body`, `noodle`, `source`, `signature` value under each archetype; missing upstream answers with populated downstream answers.
- Resume: every `stepIndex` (0 through 8 and out-of-range) crossed with representative answer states, in all three phases.
- Versioned inputs: `schemaVersion` 1 valid, future versions (2, 99), zero, negative, fractional, string; mismatched `modelVersion` and `dataVersion`.

Sections of the fixture are stored as `{ count, sha256 }` digests as in Batch 2A, with the approved-difference list stored in full so each intentional change is reviewable. `npm run parity:legacy` regenerates the tables from the legacy checkout and fails on any unapproved difference; `npm run parity` verifies the committed digests without the legacy checkout. Mutation checks (perturb a rule in the new code and confirm the harness fails) are performed and recorded in the ledger evidence, as in Batch 2A.

## 9. Diagnostics

Reuse `Diagnostic` (stable code, severity, entity ID, source file, JSON Pointer path, message). Proposed new codes, declared once in the registry:

| Code | Severity | Meaning |
| --- | --- | --- |
| `MIGRATION_UNHANDLED_VERSION` | error | stored `schemaVersion` is newer than this build supports |
| `MIGRATION_INPUT_INVALID` | error | input is not a plain object or has an invalid `schemaVersion` |
| `PERSIST_PAYLOAD_INVALID` | error | version 1 payload fails structural validation (path points to the field) |
| `REPAIR_LEGACY_ALIAS_MIGRATED` | warning | retired `seafood` expanded into granular exclusions |
| `REPAIR_ANSWER_UNKNOWN_OPTION` | warning | value is not an option of the question |
| `REPAIR_ANSWER_NOT_OFFERED` | warning | option not offered under current upstream answers |
| `REPAIR_DEPENDENTS_CLEARED` | warning | dependent answers cleared after an upstream repair |
| `REPAIR_ANSWER_OVER_LIMIT` | warning | selection count exceeded the question limit |
| `REPAIR_EXCLUSIVE_CONFLICT` | warning | exclusive option combined with others |
| `REPAIR_FORCED_ANSWER_APPLIED` | warning | single-option question answered automatically |
| `REPAIR_RESUME_MOVED` | warning | requested resume point replaced by the first actionable question |
| `PERSIST_MODEL_VERSION_CHANGED` | warning | payload `modelVersion` or `dataVersion` differs from the compiled model |

Tests fail if any validator emits an undeclared code (existing registry rule). Errors aggregate; a failing migration never partially applies.

## 10. Task breakdown

1. **Complete the legacy audit record.** Copy the verified findings of section 1 into `docs/migration/baseline.md`, and resolve the open questions below with the user's decisions.
2. **Prepare flow reuse.** Extract `normalizeAnswers` from `flow/complete.ts`, export the exclusive-option lookup, and re-run the Batch 2A parity gate to prove no behavior change.
3. **Contracts.** Payload types, schema constant, Zod payload schema, new diagnostic codes, and contract tests (structure, unknown input, future version).
4. **Legacy migration step.** `legacyUnversionedToV1` and version detection plus the registry, with deterministic, immutable outputs and per-value warnings.
5. **Repair.** `repairAnswers` and resume selection over the flow API, with property tests for idempotence, determinism and always-actionable resume.
6. **Restore entry point.** `restoreQuestionnaire` and `serializeClassificationPayload`; failure returns diagnostics for the caller to quarantine.
7. **Parity harness.** Legacy restore oracle, scenario builder, generator, fixture and tests; approved-difference list; mutation checks.
8. **Documentation, index and relations.** Update `tools/documentation/relations.ts` and regenerate the classification index and manifest, the change map (persistence owners), `baseline.md`, README, `AGENTS.md` and the ledger.
9. **Gate.** `npm run verify` locally (with a valid `GITHUB_TOKEN` and `NODE_USE_ENV_PROXY=1` in this sandbox), push, confirm remote CI, and record the evidence through the existing ledger state machine (`in-progress` → `in-review` → `record-ci` → `complete`).

## 11. Documentation and ledger updates

| Artifact | Update |
| --- | --- |
| `docs/migration/baseline.md` | new "Verified legacy persistence behavior" section (section 1) and the approved intentional differences |
| Classification documentation | `docs/classification/index.md` and `manifest.json` regenerated; `change-map.md` gains rows for payload schema, migrations, repair policy and resume; persistence relations registered in `relations.ts` |
| Migration ledger | `2B` entry: legacy sources (`src/App.tsx`, `src/domain/schema.ts`, `src/domain/questionRules.ts`, `src/domain/types.ts`), new owners, transformation, behavior `parity-preserved` with the approved differences named, gates `batch2b-legacy-parity`, `batch2b-local-verify`, `batch2b-remote-ci`, and the schema completion policy for batch `2B` |
| `README.md` | status text after completion |
| `AGENTS.md` | phase text after completion; add the persistence boundary notes (core payload versus web envelope) already implied by the boundary rules |

## 12. Acceptance criteria

- For every scenario, the L1 sanitization and L2 envelope layers match the frozen legacy behavior exactly.
- For every healthy scenario, restore produces the legacy answers and legacy resume question.
- Every difference in unhealthy scenarios appears in the approved-difference list and only there.
- Every fixture is either complete or returns a valid, actionable resume question; no restored state can leave the user at the final question with an unfinishable earlier answer.
- Unsupported future versions are rejected without guessing; the legacy `seafood` migration remains covered.
- Core has no DOM, React, storage or time dependency; all results are immutable; validators accept `unknown`.
- `npm run verify`, `npm run parity` and `npm run parity:legacy -- <legacy checkout>` pass locally, remote CI passes, and the ledger records the three Batch 2B gates.
- No scoring, `legacyWeight`, style, exclusion evaluation, catalog, Finder, map, React or localization work is added.

## 13. Unresolved questions and decisions requested

1. **Decision 1, where the web envelope and adapter live.** Recommended: no `apps/web` in Batch 2B; document the envelope and the read-only legacy key policy, prove parity with a test-only legacy envelope reader in `tools/parity`, and build the real adapter in Batch 5A. Alternative: create a minimal `apps/web/src/persistence` module now (this adds a workspace, TypeScript project and lint scope).
2. **Decision 2, repair versus strict legacy parity.** The architecture spec requires repaired, finishable progress, but the legacy code restores stale and unfinishable states unchanged. Recommended: treat the four behaviors below as approved intentional changes, each with an explicit fixture diff and no hidden differences.
   - **BC-1:** stale or not-offered answers are dropped with dependents cleared, instead of persisting invisibly until completion fails.
   - **BC-2:** a resume point ahead of the first unanswered or invalid question moves back to that question, instead of showing a later question with missing prefix answers.
   - **BC-3:** a snapshot that would fail silently on the last question is repaired to an actionable question.
   - **BC-4:** an `intro` snapshot is settled (forced answers written) so continuing never lands on an unsettled forced step.
3. **Decision 3, over-limit selections.** Recommended: keep the first `maxSelections` values in stored order and warn. Alternative: drop the whole answer so the user re-chooses. The legacy behavior is to leave it and fail completion.
4. **Decision 4, model or data version mismatch.** Recommended: warn and re-validate against the current model (never reject). Alternative: reject unknown `modelVersion` values.
5. **Decision 5, payload `answers` shape.** Recommended: arrays of option IDs keyed by question ID for every question, as in `FlowAnswers`. Alternative: keep the legacy scalar/array mix inside the payload.
6. **Decision 6, diagnostics naming.** Approve the proposed code list in section 9, including using the architecture spec's `MIGRATION_UNHANDLED_VERSION`.
7. **Decision 7, results restoration.** Legacy returns to intro (keeping answers) when a results snapshot is incomplete. Recommended: preserve this in the app envelope contract and resume at the actionable question through `restoreQuestionnaire`.
8. **Confirmation, out-of-core legacy fields.** `locale`, `phase` and `savedAt` never enter the core payload.

## 14. Risks and edge cases

- Legacy `stepIndex` is app state, not domain state; converting it to a question ID must keep the clamp and settle behavior exactly for healthy states.
- Legacy accepts values from the global value sets even when the question does not offer them under the current archetype; migration must keep them and let repair decide.
- Extracting legacy functions from `App.tsx` is text-based; the plan hashes every legacy source file and fails loudly if the extraction target changes.
- Large state-space enumeration can exhaust memory (as happened during Batch 2A); scenarios are bounded per question and use digests.
- Idempotence under repair depends on clearing dependents in a stable order; property tests cover this.
- Future schema versions: the registry must stay open for later steps without changing the version detection contract.
- The storage adapter contract (never overwrite or delete the legacy key, quarantine on failure) cannot be proven in Batch 2B and is therefore only documented; Batch 5A must add adapter tests for it.
- Sandbox verification of the ledger requires `NODE_USE_ENV_PROXY=1` and a valid `GITHUB_TOKEN`.

## 15. Approval

Requested from the user before Task 1 begins:

- [ ] Scope and out-of-scope list approved
- [ ] Decision 1: web envelope and adapter deferred to Batch 5A (or alternative chosen)
- [ ] Decision 2: BC-1 to BC-4 approved as intentional, fixture-listed behavior changes (or a stricter parity-only scope chosen)
- [ ] Decision 3: over-limit repair rule chosen
- [ ] Decision 4: model or data version mismatch policy chosen
- [ ] Decision 5: payload `answers` shape chosen
- [ ] Decision 6: diagnostic codes approved
- [ ] Decision 7: results-restoration handling approved
- [ ] Confirmation 8: `locale`, `phase` and `savedAt` stay out of the core payload
