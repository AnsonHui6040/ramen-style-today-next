# Batch 3B Scoring and Trace Implementation Plan

> **Planning checkpoint only:** this file describes future implementation. Creating and reviewing this plan must not modify runtime code, fixtures, public exports, ledger/manifest metadata, or Batch 3C.

**Design authority:** `docs/superpowers/specs/2026-07-17-batch-3b-scoring-trace-design.md`

**Accepted Batch 3A baseline:** `93f10161f1b2a24bb90fbb233d0fee41705c9f3a`

**Frozen legacy source:** commit `eebf00b7ddfbbe6f01ff598e57f1e17197068a37`, tree `3e527de876cfeccfd3154ddc492830d71c4cfd9a`

**Implementation branch:** `codex/batch-3b-scoring-trace`

**Toolchain:** Node `v24.16.0`, npm `11.13.0`

## 1. Execution contract

### 1.1 Shell and pre-flight

Every shell begins with:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
```

Before every task:

```bash
git status --branch --short
git rev-parse HEAD
git log -1 --format='%H%n%s'
node --version
npm --version
```

Expected: the task's reviewed predecessor commit, a clean tree, Node `v24.16.0`, and npm `11.13.0`. An unexpected SHA, branch, version, dirty path, merge/rebase state, or unknown untracked file is a stop condition. Do not reset, stash, clean, or overwrite it.

### 1.2 TDD transaction used by Tasks 1-19

Each implementation task follows this exact sequence:

```text
read task contract and current sources
-> write only the listed RED tests
-> run the exact focused RED command
-> record that failure is the intended missing behavior
-> implement the smallest GREEN within the allowlist
-> run focused tests
-> run affected regression tests
-> run full Vitest
-> run typecheck
-> run lint with zero warnings
-> run git diff --check
-> run protected identity checks
-> inspect exact diff allowlist
-> obtain independent review
-> address CHANGES_REQUIRED and re-review
-> update ignored evidence only after PASS
-> create the single task commit
-> verify clean post-commit state
```

Common verification commands are:

```bash
npm test
npm run typecheck
npm run lint
git diff --check
git status --short
git diff --name-status HEAD
```

The exact protected identity gate is:

```bash
git diff --exit-code 93f10161f1b2a24bb90fbb233d0fee41705c9f3a -- \
  packages/classification-core/src/definitions/questions.ts \
  packages/classification-core/src/compiler/questions \
  packages/classification-core/src/generated/question-model.ts \
  packages/classification-core/src/flow \
  packages/classification-core/src/persistence \
  packages/classification-core/src/definitions/styles \
  packages/classification-core/src/compiler/styles \
  packages/classification-core/src/generated/style-model.ts \
  tools/parity/questions \
  tools/parity/fixtures/questions \
  tools/parity/persistence \
  tools/parity/fixtures/persistence \
  tools/parity/styles \
  tools/parity/fixtures/styles
```

Every task also compares generated question/style artifact hashes with the accepted baseline. A protected diff is never updated as an expected file.

Before live metadata is intentionally regenerated, the full command has two
known transaction gates, in script order:

- Tasks 1-3 may reach `migration:ledger:check` and stop on only the new unowned
  Batch 3B paths because the compiled classification identity is still the
  accepted Batch 3A value.
- Tasks 4-18 must stop first at `classification:index:check` because the global
  model/policy identity has intentionally changed while the four live metadata
  files remain frozen at the accepted baseline. Run
  `npm run migration:ledger:check` separately to confirm its only diagnostics
  are the expected Batch 3B ownership paths.

Focused tests, full Vitest, typecheck, lint, build, classification validation,
generation checks, runtime imports, and every enabled parity command must pass
before either known gate. No other `npm run verify` failure is expected. Do not
pre-wire ownership or regenerate live metadata to make an earlier task
superficially green, and never describe these partial gates as a full verify
pass. Task 19 closes both gates atomically.

### 1.3 Review, evidence, commit, and push rules

Independent review must be performed by a reviewer that did not implement the task. Review input includes the task contract, exact diff, RED/GREEN output, regressions, protected hash output, and any known ownership-only gate. Self-review is additional but not independent review.

Ignored evidence may be written only under:

```text
.superpowers/sdd/batch-3b/**
```

It is never staged. Each task has one implementation commit with the subject specified below. Before commit:

```bash
git status --short
git diff --check
git diff --name-status HEAD
```

After commit:

```bash
git status --branch --short
git log -1 --format='%H%n%s'
```

Tasks 1-19 never push. Task 20 may push only after explicit user authorization and only for the exact candidate/metadata acceptance transaction.

### 1.4 Global stop conditions

Stop and report instead of redesigning when:

- a valid no-exclusion legacy case differs numerically or in ordering;
- an observed rounding/confidence result conflicts with the approved design;
- scoring observation requires an eligibility decision;
- a protected Batch 2A/2B/3A semantic path or artifact must change;
- the policy cannot remain the sole runtime source of numerical values;
- global `batch3b.1.0` cannot compose unchanged question/style component versions;
- a public consumer would need definitions, compilers, localized strings, catalog data, or eligibility overrides;
- a persistence identity/schema/migration change appears necessary;
- the seed corpus cannot be bounded or cannot prove a required reachable obligation;
- an expected valid-case divergence or waiver is needed;
- a runtime import needs Node, Zod, React, DOM, storage, network, file I/O, Date, random, locale, or legacy code;
- an allowlist is insufficient;
- ownership overlaps an accepted ledger entry without an explicit transfer;
- a reviewer requires unapproved production experimentation; or
- candidate/metadata exact-SHA acceptance becomes cyclic.

Use:

```text
Problem
-> governing plan/design/source clause
-> current code evidence
-> option A
-> option B
-> recommendation
```

## 2. Task sequence

## Task 1: Lock the scoring parity contract and seed obligations

**Goal:** encode the frozen legacy identity, no-eligibility parity projection, bounded seed schema, and coverage obligation vocabulary before building an extractor or scorer.

**Tracked-file allowlist:**

```text
tools/parity/scoring/contracts.ts
tools/parity/scoring/contracts.test.ts
tools/parity/scoring/seeds.json
```

**RED tests:**

- reject any source identity other than the frozen commit/tree;
- reject seed exclusions other than exactly `['none']`;
- reject incomplete/duplicate/non-canonical case IDs and unknown answer IDs;
- require obligations for 18 style tops, declared rule tiers, 18 bonuses, 7 conflicts, subtype/ranking/confidence/arithmetic boundaries;
- distinguish `legacyObserved` and `compiledContract` obligations;
- bound case count, arrays, strings, safe numbers, and serialized bytes;
- produce canonical stable seed bytes and a fixed seed hash.

**RED command:**

```bash
npm test -- tools/parity/scoring/contracts.test.ts
```

Expected RED: module/schema/constants are absent, not a Zod or environment failure.

**Minimal GREEN:** add strict Zod contracts and a reviewed seed declaration derived from the audited legacy canonical fixtures and targeted coverage cases. Do not create observed outputs or expected scores.

**Affected regressions:**

```bash
npm test -- tools/parity/scoring/contracts.test.ts tools/parity/styles/contracts.test.ts tools/parity/questions/contracts.test.ts
```

Run the common full checks and protected identity gate.

**Independent review:** legacy truth-boundary reviewer confirms no fabricated outputs, no eligibility field, exact frozen identity, and bounded coverage keys.

**Task-specific stop:** any seed cannot be proven complete with the accepted question model, or a requested coverage state is unreachable but labeled observed.

**Commit:** `Define Batch 3B scoring parity contract`

**No push:** mandatory.

**Completion report:** commit SHA, three changed files, seed count/hash, obligation counts, RED/GREEN, full tests, review verdict, clean tree.

## Task 2: Define source and compiled scoring-policy contracts

**Goal:** add inert source/compiled policy types and a strict source schema without changing the active classification definition.

**Tracked-file allowlist:**

```text
packages/classification-core/src/contracts/scoring-policy.ts
packages/classification-core/src/compiler/scoring-policy/source-schema.ts
packages/classification-core/src/compiler/scoring-policy/source-schema.test.ts
packages/classification-core/src/contracts/diagnostic-codes.ts
packages/classification-core/src/contracts/diagnostic.test.ts
packages/classification-core/src/compiler/index.ts
```

**RED tests:** exact own keys; safe finite values; bounded stable IDs; non-negative safe-integer priorities; ratio/cap/limit bounds; exact closed score/confidence rounding tokens; exact source versus compiled separation; metadata binding fields; deep readonly typing; every planned policy diagnostic registered.

**RED command:**

```bash
npm test -- packages/classification-core/src/compiler/scoring-policy/source-schema.test.ts packages/classification-core/src/contracts/diagnostic.test.ts
```

Expected RED: scoring-policy module/schema/codes are missing.

**Minimal GREEN:** implement only contracts, schema, compiler-only exports, and diagnostic registration. Do not define production values or compile a policy.

**Affected regressions:** compiler parse/source-schema and diagnostic suites.

**Independent review:** contract reviewer checks that the compiled shape contains identities/derived values, no style operands, and no runtime dependency on Zod.

**Task-specific stop:** any required field duplicates style rules/adjustments or relies on question source mutation.

**Commit:** `Define scoring policy contracts`

**No push:** mandatory.

**Completion report:** added types/codes, schema bounds, test counts, review, protected hashes.

## Task 3: Author the canonical legacy scoring policy

**Goal:** create the sole production numerical policy source with all approved legacy values, while leaving active classification composition unchanged until Task 4.

**Tracked-file allowlist:**

```text
packages/classification-core/src/definitions/policies.ts
packages/classification-core/src/definitions/policies.test.ts
packages/classification-core/src/compiler/index.ts
```

**RED tests:** exact seven question order/weights, four tier ratios/order, one-decimal arithmetic/floor, exact score/confidence rounding tokens, phase/caps, comparator tokens, family grouping/limits, all confidence values/deductions, `batch3b.1.0`, and absence of per-style operands.

**RED command:**

```bash
npm test -- packages/classification-core/src/definitions/policies.test.ts
```

Expected RED: `legacyScoringPolicy` is absent.

**Minimal GREEN:** author the literal policy satisfying Task 2 contracts. Do not import generated artifacts or modify `questions.ts`/styles.

**Affected regressions:** source-schema and compiler index typecheck.

**Independent review:** numerical truth reviewer compares every literal to frozen scorer/questions evidence and checks no tuning.

**Task-specific stop:** a literal lacks a unique frozen-source interpretation.

**Commit:** `Author canonical legacy scoring policy`

**No push:** mandatory.

**Completion report:** exact values, legacy line evidence, RED/GREEN, review, no active runtime change.

## Task 4: Compile and bind the policy into ClassificationModel

**Goal:** compile/validate the canonical policy, switch classification composition to it, bump only the global model version, and bind unchanged question/style identities.

**Tracked-file allowlist:**

```text
packages/classification-core/src/compiler/scoring-policy/compile.ts
packages/classification-core/src/compiler/scoring-policy/compile.test.ts
packages/classification-core/src/compiler/scoring-policy/proof.ts
packages/classification-core/src/compiler/scoring-policy/proof.test.ts
packages/classification-core/src/compiler/compile.ts
packages/classification-core/src/compiler/compile.test.ts
packages/classification-core/src/compiler/source-schema.ts
packages/classification-core/src/compiler/parse.test.ts
packages/classification-core/src/compiler/index.ts
packages/classification-core/src/contracts/model.ts
packages/classification-core/src/contracts/provenance.ts
packages/classification-core/src/contracts/diagnostic-codes.ts
packages/classification-core/src/contracts/diagnostic.test.ts
packages/classification-core/src/definitions/classification.ts
packages/classification-core/src/definitions/policies.ts
packages/classification-core/src/definitions/synthetic.ts
tools/validation/validate-classification.ts
tools/validation/validate-classification.test.ts
```

`definitions/synthetic.ts` is deleted only after no production/compiler import remains.

**RED tests:** reference/owner checks; exact weight mirror equality; total 100; tier completeness/order/ratio monotonicity; exact closed rounding tokens; score scale exactly 10; integral safe weight/tier products; safe representable bonus/conflict operands, caps, floors, and score gaps; bounded rational bonus rounding; rejection of unrepresentable fractional operands and unsafe intermediate overflow; phase/comparator closure; budgets/confidence/maximum safety; model/question/style identity binding; deterministic hashes; input reorder independence; deep freeze; global `batch3b.1.0` with unchanged style `batch3a.1.0`; `ClassificationModel.questionModel.questions === ClassificationModel.questions`; provenance origin `legacy-production`; classification validation accepts global/policy version equality with unchanged question/style component versions and rejects every mismatched component identity.

**RED command:**

```bash
npm test -- packages/classification-core/src/compiler/scoring-policy/compile.test.ts packages/classification-core/src/compiler/scoring-policy/proof.test.ts packages/classification-core/src/compiler/compile.test.ts tools/validation/validate-classification.test.ts
```

Expected RED: compiler/composition lacks compiled policy and both composition
and the live classification validator reject the approved decoupled component
versions.

**Minimal GREEN:** compile questions, compile styles unchanged, then compile policy against those exact successful models. Replace the temporary global/style equality check in both composition and classification validation with global/policy equality plus exact accepted question/style component identity binding. Prove all runtime score-unit conversions and intermediate bounds before compilation succeeds; runtime scoring must consume the compiled rounding tokens rather than a hidden default. Compute policy and classification hashes from approved projections. Add the full question model reference while retaining the existing `questions` alias.

**Affected regressions:** all compiler/collector/parse/style compile tests, then
the live validation gate:

```bash
npm run classification:validate
```

**Independent review:** compiler/identity reviewer verifies stage order, diagnostics, hashes, no partial success, no protected edits, and no style hash drift.

**Task-specific stop:** accepted question/style artifacts or hashes change; policy requires a question compiler edit; style/global version decoupling cannot be represented safely.

**Commit:** `Compile and bind scoring policy`

**No push:** mandatory.

**Completion report:** global/component versions, policy hashes, new classification dataVersion, diagnostics, test results, review.

## Task 5: Generate the immutable runtime classification model

**Goal:** deterministically render a browser-neutral generated `classificationModel` that composes accepted question/style artifacts with the compiled policy.

**Tracked-file allowlist:**

```text
packages/classification-core/src/compiler/classification/serialize.ts
packages/classification-core/src/compiler/classification/serialize.test.ts
packages/classification-core/src/generated/classification-model.ts
packages/classification-core/src/classification-model.ts
packages/classification-core/src/compiler/index.ts
tools/scoring/generate-classification-model.ts
tools/scoring/generate-classification-model.test.ts
package.json
```

**RED tests:** stable generated header/imports; no inline duplicate question/style data; exact reference identity; full inventory; compiled policy identity; deep freeze; repeat byte identity; `--check` drift failure; no timestamp/absolute path; no definition/compiler/Node runtime import.

**RED command:**

```bash
npm test -- packages/classification-core/src/compiler/classification/serialize.test.ts tools/scoring/generate-classification-model.test.ts
```

Expected RED: renderer/generator/artifact do not exist.

**Minimal GREEN:** render imports of generated question/style models plus canonical policy/inventory literals, expose only an internal facade, and add `classification-model:generate`/`:check` scripts. Do not add root public exports yet.

**Affected regressions:** generated question/style checks, compile tests, package build.

**Independent review:** artifact/runtime-boundary reviewer verifies identity sharing, deterministic bytes, deep freeze, and protected artifact hash equality.

**Task-specific stop:** generation requires duplicating or editing protected artifacts, or runtime imports compiler/definitions/Node.

**Commit:** `Generate immutable classification model`

**No push:** mandatory.

**Completion report:** artifact hash/size/import graph, classification identity, checks, review.

## Task 6: Define scoring, trace, and failure contracts

**Goal:** freeze the public type-level result union and complete trace shapes before numerical implementation.

**Tracked-file allowlist:**

```text
packages/classification-core/src/contracts/scoring.ts
packages/classification-core/src/scoring/contracts.test.ts
packages/classification-core/src/contracts/diagnostic-codes.ts
packages/classification-core/src/contracts/diagnostic.test.ts
```

**RED tests:** exact success/failure union and one-diagnostic failure tuple; exact public auxiliary type list; no blocked/catalog/localized/open-details fields; all identity/question/condition/adjustment/core/subtype/style/ranking/confidence/low-confidence fields; three exact discriminated runtime diagnostics only; readonly arrays; inactive/capped adjustment representation; full unsliced rankings; all 18 style traces and core candidates representable; shared result/style-trace reference representable.

**RED command:**

```bash
npm test -- packages/classification-core/src/scoring/contracts.test.ts packages/classification-core/src/contracts/diagnostic.test.ts
```

Expected RED: scoring contracts/codes are absent.

**Minimal GREEN:** add inert TypeScript contracts and registered codes only. No scorer.

**Affected regressions:** core typecheck and diagnostic suites.

**Independent review:** public-contract reviewer confirms the exact API can be implemented without definitions, eligibility, catalog, or copy.

**Task-specific stop:** trace cannot reconstruct arithmetic/ranking, or a field implies eligibility.

**Commit:** `Define scoring and trace contracts`

**No push:** mandatory.

**Completion report:** exact public shapes/codes, RED/GREEN, review.

## Task 7: Validate completed answers and evaluate rule lines

**Goal:** implement bounded answer validation and deterministic per-question tier/point evaluation.

**Tracked-file allowlist:**

```text
packages/classification-core/src/scoring/answers.ts
packages/classification-core/src/scoring/answers.test.ts
packages/classification-core/src/scoring/rules.ts
packages/classification-core/src/scoring/rules.test.ts
packages/classification-core/src/scoring/test-fixtures.ts
```

**RED tests:** complete flow-emitted answer accepted; unknown/missing/wrong-owner/duplicate/disallowed/exclusive/repair-requiring answer collapsed to bounded code; object-key reorder independence; valid multi-select option-order permutations accepted as the same semantic set and traced in canonical flow order; no input mutation; answer-inspection reflection failure mapped to the bounded answer code; exact/adjacent/partial/miss precedence; multi-answer intersection; matched IDs; seven-line policy order; score rounding follows the compiled token; missing/duplicate rule invariant; no raw value/trap/stack/path leakage.

**RED command:**

```bash
npm test -- packages/classification-core/src/scoring/answers.test.ts packages/classification-core/src/scoring/rules.test.ts
```

Expected RED: answer/rule evaluator is absent.

**Minimal GREEN:** reuse `evaluateFlow` through `model.questionModel`, compare semantic option sets rather than caller array order, and evaluate compiled targets by ID/priority. Use the flow-emitted canonical option order and compiled score-rounding token with score units internally. Helpers stay internal.

**Affected regressions:** flow evaluate/decode suites and compiled style rule tests.

**Independent review:** scoring-boundary reviewer checks validation is fail-closed, bounded, and does not reimplement or mutate flow semantics.

**Task-specific stop:** answer validation requires changing flow or accepting repaired/incomplete drafts as completed answers.

**Commit:** `Evaluate scoring rule lines`

**No push:** mandatory.

**Completion report:** answer failure matrix, tier cases, line arithmetic, test/review output.

## Task 8: Score complete core candidates

**Goal:** score all seven lines for one core and emit base/core trace scaffolding.

**Tracked-file allowlist:**

```text
packages/classification-core/src/scoring/core.ts
packages/classification-core/src/scoring/core.test.ts
packages/classification-core/src/scoring/test-fixtures.ts
```

**RED tests:** exactly seven unique rule lines, base sum in score units, finite points, all 54 accepted core candidates constructible, missing/duplicate rule failure, repeat determinism, input immutability.

**RED command:**

```bash
npm test -- packages/classification-core/src/scoring/core.test.ts
```

Expected RED: core scorer absent.

**Minimal GREEN:** compose Task 7 rule lines, verify exact rule coverage, and return internal candidate data with base totals only. Do not apply adjustments or select winners.

**Affected regressions:** rule tests and style compiled-rule proof.

**Independent review:** arithmetic reviewer reconstructs representative cores independently.

**Task-specific stop:** any accepted core lacks one policy rule.

**Commit:** `Score classification core candidates`

**No push:** mandatory.

**Completion report:** core/rule counts, base invariants, tests/review.

## Task 9: Apply bonus and conflict phases

**Goal:** apply normalized style adjustments to each scoped core in explicit phase/priority order with complete active/inactive trace.

**Tracked-file allowlist:**

```text
packages/classification-core/src/scoring/adjustments.ts
packages/classification-core/src/scoring/adjustments.test.ts
packages/classification-core/src/scoring/core.ts
packages/classification-core/src/scoring/core.test.ts
packages/classification-core/src/scoring/test-fixtures.ts
```

**RED tests:** any-of condition matching; bonus `minMatches`; matched/condition ratio; bonus rounding; bonus before conflict; `whenAll`; scope; explicit priority; inactive lines; capped lines; zero-applied behavior; 5/15 budgets; floor; final rounding; all 18 bonuses and 7 conflicts active/inactive; no source-order dependence.

**RED command:**

```bash
npm test -- packages/classification-core/src/scoring/adjustments.test.ts packages/classification-core/src/scoring/core.test.ts
```

Expected RED: base totals do not include adjustment semantics.

**Minimal GREEN:** add fixed-point adjustment evaluation and final core totals exactly as designed. Preserve all inactive applicable lines.

**Affected regressions:** compiled style adjustment tests/proofs and rule/core suites.

**Independent review:** legacy numerical reviewer checks thresholds, caps, reason-count semantics, phase order, and floor.

**Task-specific stop:** an accepted adjustment's scope/priority is ambiguous or a valid case diverges from frozen arithmetic.

**Commit:** `Apply scoring adjustments`

**No push:** mandatory.

**Completion report:** adjustment coverage, cap/floor evidence, RED/GREEN, review.

## Task 10: Collapse core candidates deterministically

**Goal:** select exactly one core per style with the approved total comparator.

**Tracked-file allowlist:**

```text
packages/classification-core/src/scoring/selection.ts
packages/classification-core/src/scoring/selection.test.ts
packages/classification-core/src/scoring/test-fixtures.ts
```

**RED tests:** score descending, priority ascending, ID ascending; equal-score legacy winner; comparator antisymmetry/transitivity; duplicate ID/priority invariant; reversed core array identical; 18 styles each yield one selected core.

**RED command:**

```bash
npm test -- packages/classification-core/src/scoring/selection.test.ts
```

Expected RED: explicit core selector absent.

**Minimal GREEN:** pure comparator/selector over completed core traces. No `Map` insertion order fallback.

**Affected regressions:** core tests and accepted style priority tests.

**Independent review:** determinism reviewer verifies a total order and equal-core parity.

**Task-specific stop:** explicit priority does not reproduce a frozen equal-core observation.

**Commit:** `Select deterministic style cores`

**No push:** mandatory.

**Completion report:** comparator properties, tie fixture, review.

## Task 11: Resolve exact noodle subtypes

**Goal:** bind each selected core to exactly one subtype from the completed noodle answer.

**Tracked-file allowlist:**

```text
packages/classification-core/src/scoring/subtype.ts
packages/classification-core/src/scoring/subtype.test.ts
packages/classification-core/src/scoring/test-fixtures.ts
```

**RED tests:** all five noodle IDs; every accepted core/noodle pair; zero match and duplicate match invariant; no first-element fallback; result carries only stable subtype ID/evidence.

**RED command:**

```bash
npm test -- packages/classification-core/src/scoring/subtype.test.ts
```

Expected RED: resolver absent.

**Minimal GREEN:** exact ID match with bounded invariant signal.

**Affected regressions:** generated style subtype/inventory proof.

**Independent review:** style-contract reviewer verifies all 270 mappings and no protected artifact change.

**Task-specific stop:** accepted style model does not provide exactly one mapping.

**Commit:** `Resolve exact scoring subtypes`

**No push:** mandatory.

**Completion report:** 270 mapping proof, failure behavior, review.

## Task 12: Rank and limit primary and alternative styles

**Goal:** produce complete style rankings and the two three-result slices without eligibility.

**Tracked-file allowlist:**

```text
packages/classification-core/src/scoring/ranking.ts
packages/classification-core/src/scoring/ranking.test.ts
packages/classification-core/src/scoring/test-fixtures.ts
```

**RED tests:** score/displayPriority/styleID order; equal-style legacy output; total-order properties; style/core array reversal; family split from `form[0]`; limit after ranking; three primary/three alternatives; all 18 candidates retained in trace; no exclusion read.

**RED command:**

```bash
npm test -- packages/classification-core/src/scoring/ranking.test.ts
```

Expected RED: style ranking/grouping absent.

**Minimal GREEN:** explicit comparator, split, and slice. Do not compute confidence yet.

**Affected regressions:** core selection and style display-priority tests.

**Independent review:** ordering/eligibility-boundary reviewer confirms no source order and no exclusion behavior.

**Task-specific stop:** equal style output differs from accepted display priority or exclusions influence any list.

**Commit:** `Rank scoring results deterministically`

**No push:** mandatory.

**Completion report:** tie/order/limit proofs, no-eligibility evidence, review.

## Task 13: Compute confidence and low-confidence state

**Goal:** implement the exact legacy confidence calculation over already-truncated groups.

**Tracked-file allowlist:**

```text
packages/classification-core/src/scoring/confidence.ts
packages/classification-core/src/scoring/confidence.test.ts
packages/classification-core/src/scoring/test-fixtures.ts
```

**RED tests:** maximum derived 105; base/gap order; gap cap 10; last result gap 4; source/signature deductions; positive applied-conflict count/cap; exact compiled `nearest-integer-ties-toward-positive-infinity` behavior including negative half inputs before clamping; [24,99]; primary and alternative computed independently; limits precede confidence; threshold 72 and gap 5 on both sides; no primary; maximum confidence; full confidence trace.

**RED command:**

```bash
npm test -- packages/classification-core/src/scoring/confidence.test.ts
```

Expected RED: confidence module absent.

**Minimal GREEN:** implement the exact formula/order, compiled confidence-rounding token, and low-confidence predicate from compiled policy. No hard-coded 105/72/5 or implicit rounding mode in runtime logic.

**Affected regressions:** ranking and adjustment suites.

**Independent review:** legacy confidence reviewer independently calculates all boundary fixtures.

**Task-specific stop:** a fixture exposes a JS rounding difference from the approved calculation order.

**Commit:** `Compute scoring confidence`

**No push:** mandatory.

**Completion report:** formula inputs, boundary results, range property, review.

## Task 14: Verify traces and expose the immutable public scorer

**Goal:** compose all stages, verify every invariant, catch bounded failures, deeply freeze output, and add the exact public exports.

**Tracked-file allowlist:**

```text
packages/classification-core/src/scoring/trace.ts
packages/classification-core/src/scoring/trace.test.ts
packages/classification-core/src/scoring/score.ts
packages/classification-core/src/scoring/score.test.ts
packages/classification-core/src/scoring/index.ts
packages/classification-core/src/index.ts
packages/classification-core/src/index.test.ts
packages/classification-core/src/classification-model.ts
tools/validation/check-runtime-imports.ts
tools/validation/check-runtime-imports.test.ts
```

**RED tests:** exact public value/type surface; success union; all 18 style traces; shared result trace references; arithmetic reconstruction; ranking reconstruction; confidence reconstruction; bounded three-code failures; answer-reflection failure uses the answer diagnostic; model-identity reflection failure uses the model diagnostic; trusted post-compile contradiction uses the invariant diagnostic; sync invariant catch; no raw input/trap/message/stack/path; deep freeze success/failure; repeat bytes; input immutability; browser-neutral import graph; forbidden definitions/compiler/Zod/Node/React/DOM/storage/network/eligibility/catalog/legacy/Date/random/locale.

**RED command:**

```bash
npm test -- packages/classification-core/src/scoring/trace.test.ts packages/classification-core/src/scoring/score.test.ts packages/classification-core/src/index.test.ts tools/validation/check-runtime-imports.test.ts
```

Expected RED: orchestrator/root exports/import-boundary allowance absent.

**Minimal GREEN:** implement `scoreCompletedAnswers`, internal `ScoringInvariantError`, invariant verification, bounded conversion, and deep freeze. Update runtime-import validation to treat only the exact scoring/classification generated graph as approved while keeping eligibility/catalog/etc forbidden.

**Affected regressions:** every scoring module, root public contracts, flow, generated model, persistence public surface, style facade, runtime import checker.

**Independent review:** public API/security/runtime-boundary reviewer checks exact exports, failure containment, import closure, immutability, and absence of eligibility.

**Task-specific stop:** a public failure can leak trap/raw/stack/path data, or the runtime graph needs a forbidden dependency.

**Commit:** `Expose immutable scoring results`

**No push:** mandatory.

**Completion report:** public exports, success/failure examples, trace counts, runtime graph, review.

## Task 15: Build the hardened legacy scoring observation authoring path

**Goal:** add an explicit offline authoring command that observes the frozen legacy scorer under an instrumentation-only patch.

**Tracked-file allowlist:**

```text
tools/parity/scoring/contracts.ts
tools/parity/scoring/contracts.test.ts
tools/parity/scoring/seeds.json
tools/parity/scoring/extractor.ts
tools/parity/scoring/extractor.test.ts
tools/parity/scoring/extract.ts
tools/parity/scoring/extract.test.ts
tools/parity/scoring/legacy-instrumentation.patch
package.json
```

**RED tests:** exact checkout/commit/tree/remote/status; full tracked-source hash closure; lockfile and copy-validated dependency hashes; exact patch targets (`src/lib/scoring/scorer.ts` modified and one observer test added); patch hash; seed hash; Node/runtime/locale/timezone identity; network denied; full suite before extraction; capability containment; strict output bounds; cleanup/rollback; create/replace/verify-only semantics; no neighboring checkout mutation.

**RED command:**

```bash
npm test -- tools/parity/scoring/contracts.test.ts tools/parity/scoring/extractor.test.ts tools/parity/scoring/extract.test.ts
```

Expected RED: authoring modules/patch and lineage constants absent.

**Minimal GREEN:** adapt the accepted shared authoring framework. Instrument actual legacy calculation sites with passive observation only; do not recreate the algorithm in the tool. Add `parity:scoring:extract` but do not run publication until review passes.

**Affected regressions:** shared authoring, style authoring, question authoring, package scripts.

**Independent review:** truth/security reviewer inspects every patch hunk, source hash, subprocess role, sandbox profile, capability path, and cleanup branch.

**Task-specific stop:** instrumentation changes normal result bytes/tests, needs a network edge, or cannot capture an adjustment/ranking input at the actual calculation site.

**Commit:** `Observe frozen legacy scoring`

**No push:** mandatory.

**Completion report:** lineage/dependency/patch/seed hashes, full legacy suite, security tests, review. No fixtures claimed yet.

## Task 16: Publish and verify frozen scoring fixtures offline

**Goal:** after authoring review PASS, publish exact legacy cases atomically and make ordinary verification independent of the legacy checkout.

**Tracked-file allowlist:**

```text
tools/parity/fixtures/scoring/legacy-v1/cases.json
tools/parity/fixtures/scoring/legacy-v1/manifest.json
tools/parity/scoring/contracts.ts
tools/parity/scoring/contracts.test.ts
tools/parity/scoring/verify-fixtures.ts
tools/parity/scoring/verify-fixtures.test.ts
package.json
```

**RED tests:** missing committed files; canonical bytes; exact cases/manifest hashes; case/obligation closure; all IDs resolve; no exclusions other than none; observed/contract obligation separation; no eligibility/catalog/copy; offline verification with neighboring checkout absent; tamper/hash/count/order rejection.

**RED command:**

```bash
npm test -- tools/parity/scoring/verify-fixtures.test.ts
```

Expected RED: committed fixtures absent.

**Minimal GREEN:** run the reviewed authoring command once with explicit frozen checkout and publish mode, inspect exact output, record derived constants, and implement offline verification. Do not hand-edit observed values.

**Authoring command:**

```bash
npm run parity:scoring:extract -- --legacy-checkout /Users/ansonhui/Documents/GitHub/ramen-style-today --replace
```

Then prove verify-only regeneration and ordinary offline verification.

**Affected regressions:** authoring contracts, existing parity suites, full Vitest.

**Independent review:** fixture identity/truth reviewer validates manifest lineage, raw-to-canonical publication, coverage, hashes, and no fabricated observation.

**Task-specific stop:** extraction differs on repeat, any obligation is falsely claimed, or publication leaves recovery state unresolved.

**Commit:** `Freeze legacy scoring fixtures`

**No push:** mandatory.

**Completion report:** case count, hashes, obligation counts, full legacy suite, repeat verify, offline proof, review.

## Task 17: Prove numerical/order parity and global invariants

**Goal:** compare every frozen observation to the new scorer and add broad deterministic/property proofs.

**Tracked-file allowlist:**

```text
tools/parity/scoring/parity.ts
tools/parity/scoring/parity.test.ts
packages/classification-core/src/scoring/invariants.test.ts
packages/classification-core/src/scoring/answers.ts
packages/classification-core/src/scoring/rules.ts
packages/classification-core/src/scoring/core.ts
packages/classification-core/src/scoring/adjustments.ts
packages/classification-core/src/scoring/selection.ts
packages/classification-core/src/scoring/subtype.ts
packages/classification-core/src/scoring/ranking.ts
packages/classification-core/src/scoring/confidence.ts
packages/classification-core/src/scoring/trace.ts
packages/classification-core/src/scoring/score.ts
package.json
```

Fixture files are explicitly not in this allowlist.

**RED tests:** exact case-by-case question lines/base/adjustments/final totals; selected core/subtype; primary/alternative full and displayed order; confidence/low confidence; zero divergence registry; arithmetic fixed point; finite values; comparator properties; style/core/rule/target/condition/object-key reorder independence; byte-identical repeats; deep freeze; input immutability; no Date/random/locale dependence.

**RED command:**

```bash
npm test -- tools/parity/scoring/parity.test.ts packages/classification-core/src/scoring/invariants.test.ts
```

Expected RED: parity comparator/property suite absent; any mismatch remains RED and may not be normalized in fixtures.

**Minimal GREEN:** add canonical projection comparison. Change a listed scorer module only when frozen source proves the existing implementation wrong. Never edit fixture output or add a waiver.

**Affected regressions:** all scoring, flow, style model, fixture verifier, existing parity suites.

**Independent review:** numerical/order parity reviewer checks every mismatch path, zero-waiver contract, coverage closure, and property generators.

**Task-specific stop:** any valid-case mismatch remains, a fixture edit appears necessary, or a behavior change requires an ADR.

**Commit:** `Prove legacy scoring parity`

**No push:** mandatory.

**Completion report:** case/line/adjustment counts, zero mismatches, property counts, full tests, review.

## Task 18: Pre-wire documentation, validation, ledger schema, and acceptance checks

**Goal:** teach generators/validators about scoring evidence and Batch 3B transactions without yet changing live metadata or claiming ownership/completion.

**Tracked-file allowlist:**

```text
tools/documentation/relations.ts
tools/documentation/build-index.ts
tools/documentation/build-index.test.ts
tools/documentation/generate-classification-index.ts
tools/documentation/generate-classification-index.test.ts
tools/validation/validate-classification.ts
tools/validation/check-runtime-imports.ts
tools/validation/check-runtime-imports.test.ts
tools/migration/ledger-schema.ts
tools/migration/ledger-check.ts
tools/migration/ledger-check.test.ts
tools/migration/check-ledger.ts
tools/migration/record-ci.ts
tools/migration/record-ci.test.ts
tools/acceptance/verify-acceptance.ts
tools/acceptance/verify-acceptance.test.ts
package.json
.github/workflows/ci.yml
```

Only files proven necessary by RED tests are changed; unchanged allowlisted files stay untouched.

**RED tests:** scoring policy concept relations; artifact/consumer/test/evidence completeness; exact candidate `legacy-production / compiler-validated` assurance with no Batch 3B verification object versus final parity-verified assurance; exact fixture/policy/model/hash binding; readiness removes no blocker without exact verification; Batch 3B ledger ownership closed and non-overlapping; in-progress entry contains no Batch 3B remote proof and remains non-accepted while allowing previously accepted evidence to verify; completed entry requires exact candidate SHA/run; only four acceptance metadata paths; candidate is the metadata commit's direct parent with an exact four-file diff; candidate remote proof is recorded; metadata exact-SHA success is externally observed after commit and is not embedded in that same commit; failed/superseded run rejection; runtime classification-model check and scoring parity included in root verify/CI.

**RED command:**

```bash
npm test -- tools/documentation/build-index.test.ts tools/documentation/generate-classification-index.test.ts tools/migration/ledger-check.test.ts tools/migration/record-ci.test.ts tools/acceptance/verify-acceptance.test.ts tools/validation/check-runtime-imports.test.ts
```

Expected RED: tools cannot represent scoring evidence/Batch 3B transaction.

**Minimal GREEN:** add typed scoring evidence plumbing and validation. Keep generated/live metadata unchanged. Add `classification-model:check` and `parity:scoring` to `verify` in an order that does not depend on acceptance metadata. CI calls the same root commands.

**Affected regressions:** documentation, validation, migration, acceptance, full root verify up to the expected Task 19 ownership gate.

**Independent review:** documentation/readiness/transaction/security reviewers confirm truth-bound assurance, exact path groups, no CI cycle, no premature blocker removal, and unchanged style/persistence claims.

**Task-specific stop:** live metadata must change to make tool tests pass, or candidate verification depends on metadata that can exist only after candidate success.

**Commit:** `Prepare Batch 3B verification wiring`

**No push:** mandatory.

**Completion report:** new gates/evidence schema, expected ownership gate, tests/reviews, live metadata unchanged.

## Task 19: Wire ownership and create the local implementation candidate

**Goal:** add the Batch 3B in-progress ledger boundary, regenerate candidate-state metadata, pass every local gate, and freeze one local candidate SHA without remote evidence.

**Tracked-file allowlist:** exactly:

```text
docs/classification/index.md
docs/classification/manifest.json
docs/migration/ledger.json
docs/migration/ledger.md
```

**RED tests before editing:**

```bash
npm run migration:ledger:check
npm run classification:index:check
```

Expected RED: Batch 3B implementation/verification files are not yet owned and generated candidate metadata lacks scoring evidence. No earlier gate may fail.

**Minimal GREEN:** add one `status:'in-progress'` Batch 3B entry with exact implementation/verification/acceptance path groups, legacy sources, transformation, behavior, fixture manifest hash, and no `implementationSha`/remote success. Regenerate index/manifest/ledger markdown. Candidate-state scoring provenance is exactly `legacy-production / compiler-validated`, includes local policy/fixture identities, has no Batch 3B verification object, and retains `scoring-not-production-verified`.

**Full candidate verification:**

```bash
npm run verify
git diff --check
git status --short
git diff --name-status HEAD
```

All must pass. Also run authenticated acceptance locally as a validator of every
already recorded completed boundary:

```bash
GITHUB_TOKEN="$(gh auth token)" npm run verify:acceptance
```

Expected result is PASS for all previously accepted evidence while the
`in-progress` Batch 3B entry remains explicitly non-accepted and contains no
remote proof. This pass does not promote Batch 3B. Any authentication,
ownership, content, hash, or prior-batch acceptance failure blocks the
candidate.

**Independent review:** ownership/candidate/readiness reviewers verify the complete branch diff from the planning baseline, exact four-file Task 19 diff, zero unowned paths, fixture identities, no premature assurance, and all local gates.

**Task-specific stop:** full verify fails outside an explicitly designed remote-evidence requirement, metadata removes a blocker, or Task 19 needs a fifth file.

**Commit:** `Wire Batch 3B scoring ownership`

This commit becomes the **implementation candidate SHA**. Do not amend it after recording the SHA.

**No push:** mandatory until Task 20 receives explicit user authorization.

**Completion report:** candidate SHA, full branch file inventory, exact Task 19 four-file diff, all gate outputs, fixture/policy/model hashes, readiness blockers, reviews, clean tree, ahead/behind, no push.

## Task 20: Close exact-SHA CI and acceptance metadata

**Goal:** prove the exact implementation candidate remotely, then create a four-file metadata commit and prove that exact metadata SHA.

**Pre-flight:** verify Task 19 candidate SHA is immutable, tree clean, `gh auth status` succeeds, upstream position is understood, and user has explicitly authorized push/remote observation.

**Phase A — candidate:**

1. push the exact Task 19 candidate branch;
2. identify the canonical GitHub Actions `CI / verify` run whose `head_sha` equals the candidate;
3. wait for `completed/success`;
4. reject failed, cancelled, skipped, superseded, wrong-workflow, wrong-repository, wrong-event, or wrong-SHA runs;
5. do not modify tracked files while waiting.

No polling interval may block communication for more than 60 seconds.

**Metadata tracked-file allowlist:** exactly:

```text
docs/classification/index.md
docs/classification/manifest.json
docs/migration/ledger.json
docs/migration/ledger.md
```

**RED acceptance-state assertions:** with candidate success known but not yet
recorded, the live metadata must still fail both completion assertions:

```bash
jq -e '.entries[-1] | .batch == "3B" and .status == "complete"' docs/migration/ledger.json
jq -e '.provenance.scoringPolicy.assurance == "parity-verified"' docs/classification/manifest.json
```

Expected RED: Batch 3B remains in progress and scoring remains non-accepted.
`GITHUB_TOKEN="$(gh auth token)" npm run verify:acceptance` must still PASS for
the previously recorded accepted boundaries; it must not infer Batch 3B
completion from an unrecorded remote run.

**Minimal GREEN metadata:** create an ignored proof file from the exact
authenticated run, then make the authenticated recorder perform the only
ledger promotion:

```bash
mkdir -p .superpowers/sdd/batch-3b
IMPLEMENTATION_RUN_JSON="$(gh run view "$implementation_run_id" \
  --json databaseId,headSha,status,conclusion,url)"
IMPLEMENTATION_RUN_JSON="$IMPLEMENTATION_RUN_JSON" \
  IMPLEMENTATION_SHA="$implementation_sha" node - <<'NODE'
const fs = require('fs')
const run = JSON.parse(process.env.IMPLEMENTATION_RUN_JSON)
if (run.headSha !== process.env.IMPLEMENTATION_SHA
  || run.status !== 'completed'
  || run.conclusion !== 'success') {
  throw new Error('Batch 3B implementation CI identity mismatch')
}
fs.writeFileSync(
  '.superpowers/sdd/batch-3b/implementation-proof.json',
  `${JSON.stringify({
    schemaVersion: 1,
    sha: run.headSha,
    runId: run.databaseId,
    runUrl: run.url,
  }, null, 2)}\n`,
)
NODE
GITHUB_TOKEN="$(gh auth token)" \
  npm run migration:ledger:record-ci -- 3B \
  .superpowers/sdd/batch-3b/implementation-proof.json
npm run migration:ledger
npm run classification:index
```

`record-ci 3B` must authenticate repository/workflow/event/SHA/status/
conclusion/URL and atomically set Batch 3B `status:'complete'`, the exact
candidate `implementationSha`, and exactly the local/remote verification
records. The generators then upgrade scoring to
`legacy-production / parity-verified` with scope
`legacy-scoring-result-projection`, bind verified policy semantic/data hashes,
classification dataVersion, fixture manifest/content hashes and parity suite
version, remove only `scoring-not-production-verified`, and retain style/
persistence claims exactly. Direct hand-editing of recorded CI evidence is
forbidden.

Then prove the candidate is still `HEAD` while the four metadata files are
dirty, followed by all local gates:

```bash
test "$(git rev-parse HEAD)" = "$implementation_sha"
npm run verify
GITHUB_TOKEN="$(gh auth token)" npm run verify:acceptance
git diff --check
git diff --name-status "$implementation_sha"
```

The diff must be exactly the four metadata files.

**Independent review:** three reviews before metadata commit: exact-SHA evidence/truth, readiness/assurance transition, and transaction/path boundary.

**Metadata commit:** `Accept Batch 3B scoring and trace`

Immediately after commit, require:

```bash
test "$(git rev-parse HEAD^)" = "$implementation_sha"
test "$(git diff --name-only "$implementation_sha" | sort)" = \
  $'docs/classification/index.md\ndocs/classification/manifest.json\ndocs/migration/ledger.json\ndocs/migration/ledger.md'
```

Push that exact metadata commit, identify its canonical CI run by exact
`head_sha`, and require `completed/success`. Retain that post-commit proof only
in ignored evidence and the completion report; it cannot be embedded in the
same commit. If metadata CI fails, Batch 3B is not complete; do not rewrite
recorded candidate proof or claim closure. Follow-up maintenance requires a new
reviewed transaction.

**Task-specific stop:** no authenticated token, candidate run not exact/successful, a failed/superseded run is the only evidence, metadata needs a fifth file, a non-scoring blocker changes, or metadata CI fails.

**Completion report:**

- implementation candidate SHA/subject/run URL/status;
- acceptance metadata SHA/subject/run URL/status;
- exact four metadata files;
- policy/classification/fixture hashes;
- total focused/persistence/existing parity/scoring parity/full Vitest results;
- typecheck/lint/build/generation/runtime-import/classification/ledger/acceptance results;
- three review verdicts;
- final readiness blockers;
- style and persistence assurances unchanged;
- branch ahead/behind and clean state;
- push status; and
- explicit statement that Batch 3C has not started.

## 3. Planned ownership map

The Batch 3B ledger entry must use these closed groups. Exact individual files supersede globs where the migration validator requires them.

### Implementation paths

```text
docs/superpowers/specs/2026-07-17-batch-3b-scoring-trace-design.md
docs/superpowers/plans/2026-07-17-batch-3b-scoring-trace.md
packages/classification-core/src/contracts/scoring-policy.ts
packages/classification-core/src/contracts/scoring.ts
packages/classification-core/src/compiler/scoring-policy/**
packages/classification-core/src/compiler/classification/**
packages/classification-core/src/definitions/policies.ts
packages/classification-core/src/generated/classification-model.ts
packages/classification-core/src/classification-model.ts
packages/classification-core/src/scoring/**
tools/scoring/**
tools/parity/scoring/**
tools/parity/fixtures/scoring/**
```

Shared implementation files explicitly transferred/extended by Batch 3B:

```text
packages/classification-core/src/compiler/compile.ts
packages/classification-core/src/compiler/compile.test.ts
packages/classification-core/src/compiler/source-schema.ts
packages/classification-core/src/compiler/parse.test.ts
packages/classification-core/src/compiler/index.ts
packages/classification-core/src/contracts/diagnostic-codes.ts
packages/classification-core/src/contracts/diagnostic.test.ts
packages/classification-core/src/contracts/model.ts
packages/classification-core/src/contracts/provenance.ts
packages/classification-core/src/definitions/classification.ts
packages/classification-core/src/definitions/synthetic.ts
packages/classification-core/src/index.ts
packages/classification-core/src/index.test.ts
```

### Verification paths

```text
package.json
.github/workflows/ci.yml
tools/acceptance/**
tools/documentation/**
tools/migration/**
tools/validation/check-runtime-imports.ts
tools/validation/check-runtime-imports.test.ts
tools/validation/validate-classification.ts
tools/validation/validate-classification.test.ts
```

### Acceptance metadata paths

```text
docs/classification/index.md
docs/classification/manifest.json
docs/migration/ledger.json
docs/migration/ledger.md
```

Existing question, persistence, and style paths are dependencies, not transferred owners.

## 4. Verification matrix

| Gate | Tasks first required | Expected |
| --- | --- | --- |
| Policy schema/compiler focused tests | 2-4 | PASS |
| Generated classification artifact check | 5 onward | PASS |
| Scoring focused suites | 7-14 | PASS |
| Authoring security tests | 15 onward | PASS |
| Frozen fixture offline verifier | 16 onward | PASS |
| Numerical/order parity | 17 onward | zero mismatch |
| Existing question/style/persistence parity | every affected task | unchanged PASS |
| Full Vitest | every task | PASS |
| Typecheck | every task | PASS |
| Lint zero warnings | every task | PASS |
| Build | every composition/runtime task | PASS |
| Runtime imports | 5 and 14 onward | PASS |
| Question/style generated checks | every compiler/composition task | byte-identical PASS |
| Classification validation | 4 onward | PASS except no ownership issue |
| Classification docs drift | 1-3 | accepted bytes still PASS |
| Classification docs drift | 4-18 | expected first full-verify stop; PASS after Task 19 |
| Migration ledger ownership | 1-18 | separate check may stop only on known new paths; PASS after Task 19 |
| Full `npm run verify` | 19 onward | PASS |
| Local authenticated acceptance | 19 | exact designed in-progress result only; no false success |
| Candidate exact-SHA CI | 20 | completed/success |
| Metadata exact-SHA CI | 20 | completed/success |

## 5. Final Batch 3B acceptance state

Batch 3B is complete only when all of these are simultaneously true:

- public scoring API and generated classification model match the approved design;
- valid no-exclusion legacy numerical/order parity has zero divergences;
- trace arithmetic and ranking are reconstructable and invariant tests pass;
- question/style/persistence accepted identities are unchanged;
- eligibility/catalog/localization/web/storage remain absent;
- exact implementation candidate and exact metadata commit both have canonical successful CI;
- ledger status is complete with truthful evidence;
- scoring is `legacy-production / parity-verified` only for `legacy-scoring-result-projection`;
- only `scoring-not-production-verified` has been removed;
- readiness remains `migration-only` with exactly the three approved remaining blockers;
- branch is clean and synchronized after approved pushes; and
- Batch 3C has not started.
