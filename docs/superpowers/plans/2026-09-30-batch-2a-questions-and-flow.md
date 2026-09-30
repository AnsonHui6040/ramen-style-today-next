# Batch 2A: Questions and Flow Implementation Plan

**Status:** DRAFT — review required. This document is not implementation permission. Do not start any task below until the user has approved it in writing (AGENTS.md: "Do not start an implementation batch until its written design or plan has the required approval").

**Baseline:** `AnsonHui6040/ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37`

**Goal:** Replace the synthetic question inventory with the legacy question and option definitions, compile question dependencies, implement a pure questionnaire flow in `@ramen-style/classification-core`, and prove branch, option and completion parity against the legacy behavior. No scoring, persistence, catalog, Finder or React work.

## 1. Legacy findings (read-only audit)

Sources inspected at the baseline commit:

- `src/data/questions.json` (8 questions): `form`, `archetype`, `tare`, `source`, `body`, `noodle`, `signature`, `exclusions`. Each has `selectionType`, `minSelections`, `maxSelections`, `weight`, and either flat `options` or `branchOptions` (only `archetype`, keyed by `form`: `soup`, `tsukemen`, `dry`).
- `src/domain/questionRules.ts`: `maxSelectionsByQuestion` (`source: 2`, `signature: 2`, `exclusions: 8`) and `optionValuesByArchetype`, a per-archetype allow-list of option values for `tare`, `source`, `body`, `noodle`, `signature` for six tsukemen/dry archetypes (`konbusui-light`, `gyokai-rich`, `miso-rich`, `aburasoba`, `taiwan-mazesoba`, `soupless-tantan`). Other archetypes are unfiltered.
- `src/config/questions.ts`: `resolveQuestionOptions(question, form, archetype)` selects flat or form-branch options, then applies the archetype allow-list.
- `src/domain/types.ts`: closed value unions and `QuestionDefinition` with `copyByForm` / `descriptionByForm` display overrides.
- `src/i18n.ts`: zh-TW, English and Japanese translated copy, including `copyByForm` / `descriptionByForm`.

Open items to resolve during Task 1 (not yet verified):

- Whether the legacy UI ever skips a question (for example when the allow-list leaves one option) or auto-advances; this must be read from `src/App.tsx` and `src/features/questionnaire/`.
- Whether `weight` is question-level scoring data (belongs to Batch 3B, so it is carried only as opaque migrated data or deferred).

## 2. Scope

In scope:

- Canonical definitions under `packages/classification-core/src/definitions/` for questions, options and stable IDs, with visible copy as stable message IDs (no translated sentences as identity keys, no internal IDs shown in UI).
- Explicit data for branching (form → archetype options) and option restriction (archetype allow-list), replacing array-position and scattered-constant assumptions.
- Explicit selection policy per question (min/max, single/multi) as data.
- Compiler support for question dependencies and its diagnostics (unknown option refs, unreachable options, dependency cycles).
- A pure flow API in the core public entrypoint: next question, resolved options, validation of an answer set, completion check. Immutable returns.
- Parity fixtures generated from the legacy logic and tests comparing new flow output against them.
- Regenerated manifest, classification index and change map; migration ledger entry.

Out of scope (owned by later batches): styles, scoring, `weight` semantics, exclusion evaluation, persistence and repair (2B), catalog, Finder, React, localized message catalogs (5B; only message IDs and zh-TW source text needed for parity are recorded here).

## 3. Tasks

1. **Complete the legacy audit.** Read the questionnaire flow code in `src/App.tsx` and `src/features/questionnaire/`; record the exact ordering, skip and completion rules in `docs/migration/baseline.md`. Resolve the open items in section 1.
2. **Extend contracts.** Add question, option, branch and selection-policy schemas in `contracts/` (Zod, validators accept `unknown`, aggregate diagnostics with stable codes). Update contract tests.
3. **Author definitions.** Replace `definitions/synthetic.ts` with the migrated question inventory. Keep stable IDs equal to legacy values unless an ADR and migration say otherwise.
4. **Compiler.** Compile dependencies (which question depends on which answer), reject dangling references and cycles, emit a deterministic compiled model. Add semantic tests.
5. **Pure flow API.** Implement and export from the core root entrypoint; no DOM, React or storage imports.
6. **Parity harness.** A tool that imports the legacy `resolveQuestionOptions` logic snapshot (recorded as fixtures, never copied wholesale into the repo) and enumerates every form × archetype path: option sets per question, question order, min/max, and completion. Add `npm run parity` coverage (or extend the existing parity command) so it runs in `verify`.
7. **Docs and ledger.** Regenerate `docs/classification/*`, add the Batch 2A ledger entry (legacy paths, baseline commit, new owner, transformation, parity evidence), update `AGENTS.md` current-phase text and the README.
8. **Gate.** Run `npm run verify` locally and confirm remote CI passes; record evidence in the ledger before marking the batch complete.

## 4. Acceptance criteria

- Every legacy question and option ID exists in the new model exactly once with identical selection limits.
- For every form/archetype combination, the resolved option list per question equals the legacy result, in the same order.
- Flow completion and next-question behavior equals legacy for all enumerated paths.
- No scoring, persistence, catalog, Finder or React code added; core has no forbidden imports.
- `npm run verify` and remote CI green; generated artifacts not hand-edited.

## 5. Approval

Requested from the user before Task 1 begins:

- [ ] Scope and out-of-scope list approved
- [ ] Decision on `weight`: carry as opaque migrated data now, or defer to Batch 3B
- [ ] Any intentional behavior change (none proposed)
