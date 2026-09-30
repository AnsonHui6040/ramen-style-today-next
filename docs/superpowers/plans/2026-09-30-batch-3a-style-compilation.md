# Batch 3A: Style Compilation Implementation Plan

**Status:** DRAFT — review required. This document is not implementation permission. Do not start any task below until the user has approved it in writing (AGENTS.md: "Do not start an implementation batch until its written design or plan has the required approval").

**Baseline:** `AnsonHui6040/ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37`

**Prerequisite:** Batches 1, 2A and 2B are complete (latest closeout commit `fb694d87b2ac2e6506ca3129bfb99dad8d520104`).

**Goal:** Replace the synthetic style proof data with the legacy style definitions as compact, typed, hand-owned definitions; compile them deterministically into the canonical classification model (styles, core types, noodle variants, style rules) with validated cross-references; and prove pure data parity against the frozen legacy `styles.json`. No scoring, ranking, eligibility evaluation, copy or UI is introduced.

## 1. Legacy findings (read-only audit)

Sources inspected at the baseline commit: `src/data/styles.json` (221,558 bytes), `src/domain/types.ts` (`StyleDefinition`, `CoreTypeDefinition`, `MatchRule`, `BonusRule`, `ConflictRule`, `NoodleVariantDefinition`), `src/domain/schema.ts` (`assertStyleCatalog`, `assertRuleValues`, `assertSignalConditions`, `assertCatalogDataset`), `src/config/styles.ts`, `src/lib/scoring/scorer.ts` and `explainer.ts` (read-only, to find which style fields are consumed), `src/data/catalog.json`, `src/features/map/RamenFinderMap.tsx` (style-to-Finder mapping), `src/i18n.ts` (`localizeStyleDefinition`, `reasonTranslations`), `src/features/results/ResultsPanel.tsx`, and `src/__tests__/config/styles.test.ts`. Everything below was verified by running analysis scripts over the frozen data.

### 1.1 Inventory

| Item | Fact |
| --- | --- |
| Display styles | **18**, in this array order: `shoyu-chintan`, `shio-chintan`, `miso`, `tonkotsu`, `chicken-chintan`, `chicken-paitan`, `duck-chintan`, `duck-paitan`, `gyokai`, `shellfish-dashi`, `iekei`, `jiro`, `hakata`, `sapporo`, `konbusui-tsukemen`, `gyokai-tsukemen`, `aburasoba`, `taiwan-mazesoba` |
| Family split | `soup` 14, `tsukemen` 2 (`konbusui-tsukemen`, `gyokai-tsukemen`), `dry` 2 (`aburasoba`, `taiwan-mazesoba`) |
| Core types | **54** = 18 styles × 3 intensities (`clean`, `standard`, `heavy`, always in that order) |
| Noodle variants | **270** = 54 core types × 5 noodles (`thin-straight`, `medium-thin-straight`, `medium-thick-straight`, `medium-thick-wavy`, `extra-thick`, always in the same order as the `noodle` question options) |
| Bonus rules | 54 (exactly 1 per core type), but only **18 distinct** (identical across the three core types of every style) |
| Conflict rules | 21 per-core entries, only **7 distinct** (6 styles; `jiro` has 2): `shio-chintan`, `duck-chintan`, `shellfish-dashi`, `iekei`, `jiro` (2), `taiwan-mazesoba`; identical across the three core types of every style |
| Style ID form | all 18 are lowercase kebab case; none is renamed |
| Duplicates | none (18 unique style IDs, 54 unique core type IDs, 270 unique variant IDs) |

### 1.2 Exact fields and value domains

`StyleDefinition`: `id`, `label`, `summary`, `family` (a `form` option: `soup`, `tsukemen`, `dry`), `accent` (a `#rrggbb` string on all 18), `ingredients` (0 or 1 values on each style from `chicken`, `dairy`, `duck`, `fish-seafood`, `pork`, `shellfish`; `none` is forbidden; 15 styles have one tag, `shoyu-chintan`, `shio-chintan` and `miso` have none), `coreTypes`.

`CoreTypeDefinition`: `id` (`<styleId>:<intensity>`), `label` (3 fixed strings), `summary` (style summary plus one fixed suffix per intensity, verified for all 54), `intensity`, `rules`, `bonuses`, `conflicts`, `noodleVariants`.

`rules` has exactly the seven scored questions `form`, `archetype`, `tare`, `source`, `body`, `noodle`, `signature`; each is `{ exact?, adjacent?, partial? }` arrays of option IDs of that question (378 exact, 339 adjacent and 60 partial sets over the 54 × 7 rules; no rule is empty and none repeats a value). Across the three core types of a style **only the `body` rule differs (18 of 18 styles); the other six rules are identical**.

`bonuses[]`: `{ id, label, points (3, 4 or 5), minMatches (4 or 5), conditions[] }`; every condition is `{ question: <scored question>, anyOf: option IDs }`, with 4 to 7 conditions per bonus. `conflicts[]`: `{ id, label, penalty (6, 8, 10, 12 or 15), whenAll: conditions[] }`. Bonus IDs (18) and conflict IDs (7) are unique and do not overlap.

`noodleVariants[]`: `{ id: <styleId>:<intensity>:<noodle>, noodle, label, summary }`; label is one fixed string per noodle and the summary is the fixed template "presented with `<label>` for this core type".

All rule values, condition values and ingredient tags are members of the corresponding question's option set (0 reference violations across 54 core types).

### 1.3 Which fields the legacy code actually consumes

- `scorer.ts` reads `family` (primary versus alternative results), `coreTypes`, `rules` (tier lookup), `bonuses` of the **first** core type only (`style.coreTypes[0]`), `conflicts` per core type, `ingredients` (blocking), `noodleVariants` (subtype by noodle, falling back to the first variant) and `id`s (collapsing by display style). Score ratios `1`, `0.6`, `0.4`, the caps `5` and `15` and the confidence constants live in scorer code, not in the style data; question weights live in `questions.json`.
- Result and Finder UI read `label`, `summary`, `accent` and ids; catalog reads `styleId`, `coreTypeIds`, `subtypeIds`.
- `i18n.ts` `styles` dictionaries are empty in all three locales, so the legacy `label` and `summary` are the only style copy; `reasonTranslations` is keyed by the **display label** of a bonus or conflict (architecture risk 7).

### 1.4 Externally referenced IDs

| Referrer | References |
| --- | --- |
| `src/data/catalog.json` | 6 style IDs (`aburasoba`, `gyokai-tsukemen`, `hakata`, `iekei`, `taiwan-mazesoba`, `tonkotsu`), 9 core type IDs (for example `hakata:standard`) and 9 variant IDs (for example `hakata:standard:thin-straight`) |
| `RamenFinderMap.tsx` `CURRENT_STYLE_TO_FINDER_CODES` | all 18 style IDs as keys |
| `i18n.ts`, `enricher.ts`, results and map UI | style, core type and subtype IDs by string |
| Legacy tests | style IDs and counts (18 styles, 54 core types, 5 variants per core in noodle order) |

The composite IDs `<style>:<intensity>` and `<style>:<intensity>:<noodle>` are public contracts (catalog data references them) and contain `:`, so they are **not** valid under the current `stableIdSchema` (lowercase kebab case). They must be reproduced exactly (section 5.2).

### 1.5 Ordering rules

There is no explicit priority field. Order is the array order of `styles.json`, then core types in intensity order, then variants in noodle order. It is behaviorally significant: `collapseByDisplayStyle` sorts by score with a stable sort, so equal scores keep source order, and `pickNoodleVariant` falls back to the first variant. The architecture spec requires this order to be seeded as explicit priority data (spec sections 11 and 16).

### 1.6 Validation behavior (`assertStyleCatalog`)

Throws on the first problem, not aggregated: duplicate style, core type or variant ID; ingredient `none` or unsupported; core type count not 3; unsupported or repeated intensity; a missing scored rule, an empty rule or a value outside the question's option set; a bonus with `points <= 0`, non-integer or out-of-range `minMatches` (must be `1` to `conditions.length`), or an invalid condition; a conflict penalty `<= 0`; variant count not 5; unsupported or repeated noodle. It also embeds **score budgets**: total bonus points per core type `<= 5`, total conflict penalty `<= 30`, single penalty `<= 15`. It never validates that `family` is a form value, that variant order equals the noodle option order, or that IDs are kebab case.

### 1.7 Scoring-related and display-related fields

| Field | Nature | Proposed 3A handling |
| --- | --- | --- |
| `rules` (`exact`, `adjacent`, `partial` value sets) | match data referencing option IDs; the tier-to-ratio mapping is scorer code | **Option 1: migrate as typed match sets** with validated references; tier names are labels only, no ratio, no interpretation (Decision 3) |
| `bonuses[].points`, `minMatches`, `conflicts[].penalty` | numeric scoring parameters | **Option 1: migrate as opaque legacy metadata**, carried as `legacyPoints`, `legacyMinMatches`, `legacyPenalty`; validated only as structurally sane numbers; never read by any 3A logic (Decision 2) |
| bonus and conflict `conditions` / `whenAll` | question and option references | migrate; references are validated (structure, not scoring) |
| score budgets (`<= 5`, `<= 30`, `<= 15`) | score policy embedded in the validator | **Option 2: defer to Batch 3B** as `POLICY_BUDGET_MISMATCH`; not enforced in 3A |
| `intensity` | taxonomy that expands a style into three core types | migrate as the ordered taxonomy `clean`, `standard`, `heavy` |
| `ingredients` | exclusion tags used by blocking | migrate as `exclusionTags` referencing `exclusions` options (never `none`); **no evaluation** (Batch 3C) |
| `family` | the form option a style belongs to | migrate as a validated reference to a `form` option |
| `label`, `summary`, core/variant labels and summaries, bonus/conflict `label` | localized display copy | **Option 2: defer to Batch 5B**; 3A defines stable message IDs only and records a digest of the legacy copy (Decision 4) |
| `accent` | UI color | **Option 2: defer to Batch 5B** with a recorded per-style digest (Decision 5) |
| `legacyWeight` on questions | scoring | untouched; still opaque |

### 1.8 Cross-references from styles to question and option IDs

`family` to a `form` option; `exclusionTags` to `exclusions` options; every `rules` set and every condition to options of the named scored question (`form`, `archetype`, `tare`, `source`, `body`, `noodle`, `signature`). The variants expand over the `noodle` question's option list. Style `miso` shares its ID text with the `tare` option `miso`; this is not a collision because concept keys are namespaced by kind (`style/miso`, `option/tare:miso`).

### 1.9 Current synthetic assumptions that must disappear

- `proofStyles` (`proof-shoyu`) and its `familyOptionId: 'chintan'`, which wrongly points at an `archetype` option instead of a `form` option.
- `intensities` and `noodles` as free string arrays not validated against the question options; `priority: 0` for every style; concept kinds `intensity` and `noodle` that name style x intensity and style x noodle expansions by their vocabulary rather than as core types and variants.
- The compiled model exposing the raw source styles with no expansion and no derived IDs.
- The compiler accepting any option ID in any question as a style family; the manifest and index header calling styles synthetic.
- The `demo-shoyu` style inside `syntheticDefinition` (kept only as a compiler test fixture, never in the production bundle).

## 2. Scope

In scope:

- Canonical legacy style definitions as one compact typed definition per style, hand-owned in `definitions/` after the one-time import.
- Stable, unchanged style IDs; deterministic derivation of the legacy core type and variant IDs.
- Style contracts (Zod, `unknown` input) and compiler support: expansion into core types and variants, validation of every reference, deterministic explicit ordering.
- New diagnostics for invalid, duplicate and dangling style references.
- Removal of the synthetic style proof data from the production bundle.
- Pure style-data parity tooling against the frozen legacy data.
- Regenerated manifest, index and change map; ledger and documentation updates.

Out of scope: scoring formulas, score ratios, caps, tie-breakers and confidence; `legacyWeight` semantics; interpreting `legacyPoints`, `legacyMinMatches` or `legacyPenalty`; score budgets; exclusion evaluation; persistence changes; catalog and Finder behavior; React and UI; localization and message catalogs; accent color; browser code; any Batch 3B or later work.

## 3. Proposed compact definition and expansion

The legacy data repeats the same information three times per style. Verified redundancy: bonuses, conflicts and six of seven rules are identical across the three core types; core copy is the style copy plus one fixed suffix per intensity; variant copy is fixed per noodle. The compact definition stores each fact once and the compiler expands it (Decision 1):

```ts
interface StyleSource {
  sourceFile: string
  id: string                          // legacy style ID, unchanged
  messageId: string                   // one message group for the style's copy (copy deferred to 5B)
  priority: number                    // explicit display order, unique, seeded from the legacy array index
  familyOptionId: string              // option of the `form` question
  exclusionTags: string[]             // options of the `exclusions` question, never `none`; no evaluation in 3A
  match: {                            // the six rules that are identical across intensities
    form: MatchSet; archetype: MatchSet; tare: MatchSet
    source: MatchSet; noodle: MatchSet; signature: MatchSet
  }
  bodyByIntensity: Record<'clean' | 'standard' | 'heavy', MatchSet>   // the only per-intensity rule
  bonuses: BonusSource[]              // { id, messageId, legacyPoints, legacyMinMatches, conditions }
  conflicts: ConflictSource[]         // { id, messageId, legacyPenalty, whenAll }
}
type MatchSet = { exact?: string[]; adjacent?: string[]; partial?: string[] }   // at least one value overall
```

Compiler output per style (deep-frozen, sorted by `priority` then ID):

- `coreTypes[]` in intensity order (`clean`, `standard`, `heavy`), each with ID `<styleId>:<intensity>`, its seven rules (six shared plus the intensity's `body`), the style's bonuses and conflicts, and derived message ID `core-<styleId>-<intensity>`.
- `variants[]` per core type, one per option of the `noodle` question in question option order, with ID `<styleId>:<intensity>:<noodleOptionId>` and derived message ID `noodle-variant-<noodleOptionId>`.
- The intensity taxonomy (`clean`, `standard`, `heavy`) is declared once in the bundle (`intensities: [{ id, messageId }]`) so it is data, not a scattered constant.

The one-time importer (Task 3) fails loudly if the legacy data violates any compaction assumption (a differing non-body rule, differing bonuses or conflicts across cores, non-standard order, a missing variant), so the compaction is proven lossless before any definition is written.

## 4. Proposed files and modules

```text
packages/classification-core/src/definitions/styles.ts        the 18 migrated style definitions (canonical after import)
packages/classification-core/src/definitions/taxonomy.ts      intensity taxonomy (clean, standard, heavy) with message IDs
packages/classification-core/src/definitions/bundle.ts        production bundle: questions + styles; policy remains synthetic
packages/classification-core/src/definitions/synthetic.ts     keeps syntheticDefinition as a test fixture only; proofStyles removed
packages/classification-core/src/compiler/source-schema.ts    style, match set, bonus, conflict and taxonomy schemas
packages/classification-core/src/compiler/styles.ts           expansion, reference validation, derived IDs, ordering
packages/classification-core/src/compiler/compile.ts          calls the style compiler; new inventory kinds
packages/classification-core/src/contracts/model.ts           compiled style, core type and variant types; concept kinds
packages/classification-core/src/contracts/composite-id.ts    composite ID schema and derivation for core types and variants
packages/classification-core/src/styles/lookup.ts             pure lookups over the compiled model (see section 6)
packages/classification-core/src/styles/styles.test.ts        contract, semantic, determinism and mutation tests
tools/migration/import-legacy-styles.ts                       one-time importer and losslessness proof (read-only on the legacy checkout)
tools/parity/styles-data.ts                                   expands the compiled model to the legacy shape and compares
tools/parity/styles-generate.ts                               writes and checks the committed style fixture
tools/parity/styles.test.ts                                   style-data parity tests (separate from any scoring parity)
tools/parity/fixtures/styles-data.json                        digests, per-entity legacy copy digests and externally referenced IDs
```

Existing files touched: `contracts/diagnostic-codes.ts`, `src/index.ts` and `src/compiler/index.ts` exports, `tools/documentation/relations.ts`, `tools/documentation/build-index.ts` (header wording), `tools/validation/validate-classification.ts` (unchanged behavior), `tools/migration/ledger-schema.ts` (gate policy), `docs/classification/change-map.md`, `docs/migration/baseline.md`, README, `AGENTS.md`, `package.json` scripts. No `apps/web`, React, scoring, catalog or persistence file changes.

## 5. Contract and compiler changes

### 5.1 Bundle and model

- `definitionBundleSchema` gains `intensities` and a richer `styles` array; `policy` is unchanged and remains synthetic proof data. The bundle `mode` gains `styles-production` (questions and styles migrated, policy synthetic); `production` stays reserved for after Batch 3B. The index header and manifest `synthetic` flag continue to report policy as synthetic.
- `ClassificationModel.styles` becomes the compiled, expanded, ordered style list described in section 3. Concept kinds `intensity` and `noodle` are replaced by `core-type` and `noodle-variant` in the type, and a new `style-rule` kind covers bonus and conflict rules (Decision 8). Legacy IDs are exposed as `coreTypeId` and `variantId` fields.
- Everything stays browser independent, deterministic, immutable and validated from `unknown`.

### 5.2 Composite IDs

`contracts/composite-id.ts` defines the only place composite IDs are built: `coreTypeId(styleId, intensityId)` returns `<styleId>:<intensityId>` and `variantId(coreTypeId, noodleOptionId)` returns `<coreTypeId>:<noodleOptionId>`, both validated to consist of stable atoms joined by `:`. Definitions never store composite IDs; the compiler derives them and the parity harness proves they equal the 54 and 270 legacy IDs.

### 5.3 Semantic validation (aggregated, JSON Pointer paths)

- style IDs unique; priorities unique non-negative integers; rule IDs unique within a style (bonus and conflict IDs share one namespace per style);
- `familyOptionId` is an option of the `form` question;
- each `exclusionTags` entry is an option of the `exclusions` question and is not `none`, with no duplicates;
- every `match` and `bodyByIntensity` value is an option of its own question; every rule question is a scored question (`form`, `archetype`, `tare`, `source`, `body`, `noodle`, `signature`); each match set has at least one value and repeats none; `bodyByIntensity` defines every taxonomy intensity;
- every bonus and conflict condition names a scored question, is non-empty, and lists option IDs of that question with no duplicates; `legacyMinMatches` is an integer from 1 to the condition count; `legacyPoints` and `legacyPenalty` are finite numbers greater than 0 (structural sanity only);
- the variant expansion covers every option of the `noodle` question exactly once; derived IDs are unique across the model;
- the concept inventory has no duplicate keys.

Score budgets and any interpretation of the numeric fields are **not** validated (Batch 3B).

## 6. Diagnostics

Reuse existing codes where the condition already exists: `STRUCTURE_INVALID` (schema, numeric sanity, thresholds), `STYLE_DUPLICATE_ID`, `REFERENCE_UNKNOWN` (unknown question or intensity reference), `CONCEPT_DUPLICATE_KEY`. Proposed new codes, each a distinct stable condition, declared once in the registry and covered by a mutation test:

| Code | Severity | Condition |
| --- | --- | --- |
| `STYLE_FAMILY_MISMATCH` | error | `familyOptionId` is not an option of the `form` question |
| `RULE_UNKNOWN_OPTION` | error | a match set or condition value is not an option of the referenced question |
| `STYLE_EXCLUSION_TAG_INVALID` | error | an exclusion tag is not an option of the `exclusions` question, is `none`, or repeats |
| `STYLE_RULE_DUPLICATE_ID` | error | a bonus or conflict ID repeats within a style |
| `STYLE_PRIORITY_DUPLICATE` | error | two styles share a `priority` |

Diagnostics keep the existing stable code, severity, entity ID, source file, JSON Pointer path and actionable message; validation aggregates independent errors.

Runtime lookups (`styles/lookup.ts`, pure, exported from the runtime entrypoint): `orderedStyles(model)`, `findStyle(model, styleId)`, `findCoreType(model, coreTypeId)`, `findNoodleVariant(model, variantId)`. They return the compiled data only and contain no ranking; they exist so Batch 3B and the Batch 4A catalog adapter consume references instead of reimplementing them.

## 7. Parity strategy: pure data parity, separate from scoring parity

### 7.1 Oracle and comparison

The oracle is the frozen legacy `src/data/styles.json` (read as data) plus the legacy `assertStyleCatalog` run on it (via `schema.ts`) to confirm the baseline data is itself valid. `tools/parity/styles-data.ts` expands the compiled model back into the legacy shape (`family`, `ingredients` from `exclusionTags`, `coreTypes` with `rules`, `bonuses`, `conflicts`, `noodleVariants`, all IDs) and compares it with the legacy JSON **after removing the deferred fields** (`label`, `summary`, `accent`, and the labels and summaries of core types, variants, bonuses and conflicts) and after mapping `points`, `minMatches` and `penalty` to their `legacy*` names. Values are compared exactly, including array order.

### 7.2 Checks

| Requirement | Test |
| --- | --- |
| every legacy style ID exists exactly once | the compiled style IDs equal the 18 legacy IDs, in legacy order, each once; likewise 54 core type IDs and 270 variant IDs |
| migrated fields equal the approved legacy source | deep equality of the expanded model and the legacy JSON (deferred fields removed); every rule set, bonus, conflict, tag, family and variant order matches |
| deterministic style ordering | compiled order equals priority order equals the legacy index; compiling with the source array shuffled or reversed yields the identical model and `dataVersion` |
| all references resolve | the compiler diagnoses none on the production bundle; mutation tests inject one bad reference per diagnostic code and each is reported at the expected path; the fixture's externally referenced IDs all resolve |
| no synthetic style in the production bundle | the bundle's style IDs are disjoint from `syntheticDefinition` and no ID starts with `proof-` or `demo-`; the bundle mode is `styles-production`; a test fails if `proofStyles` is exported again |
| compiled output is deterministic | two compilations are byte-identical (stable JSON), `dataVersion` is stable, and results are deeply frozen |
| deferred copy is not lost | the fixture stores a SHA-256 of every legacy `label`, `summary` and `accent` per entity (18 styles, 54 core types, 270 variants, 18 bonus rules, 7 conflict rules) so Batch 5B can prove its message catalog covers them |
| externally referenced IDs | the fixture records the 6 catalog style IDs, 9 core type IDs, 9 variant IDs and the 18 Finder mapping keys read from the legacy files, and asserts they resolve |

### 7.3 Categories and commands

Style-data parity lives in its own fixture and test files and reports only inventory, ID, reference and data equality. **Scoring-behavior parity (rankings, points, confidence, blocking) is not part of Batch 3A and is planned for Batch 3B and 3C**, so a scoring difference can never be mistaken for a data difference. Commands: `npm run parity` (committed fixtures, no legacy checkout) and `npm run parity:legacy -- <legacy checkout>` (regenerates and checks against the frozen data); the runner from Batch 2B is extended with the style generator. Mutation checks (change one rule value, drop a variant, swap two priorities, break a reference) are performed and recorded as ledger evidence.

## 8. Task breakdown

Task order is fixed; each task ends with focused tests green and no other batch's files touched.

1. **Record the audit.** Copy the verified findings of section 1 and the decisions into `docs/migration/baseline.md`.
2. **Contracts.** Composite ID module, style, match set, bonus, conflict and intensity schemas, new bundle `mode`, compiled model types, new diagnostic codes, contract tests.
3. **Importer.** `tools/migration/import-legacy-styles.ts` reads the legacy checkout, proves every compaction assumption, and writes `definitions/styles.ts` and `definitions/taxonomy.ts` in the repository's code style (single quotes, no semicolons). It also emits the legacy copy digests used by the fixture. After this task the generated definitions are hand-owned and canonical; the importer stays only as a parity and provenance tool.
4. **Compiler.** Style expansion, reference validation, ordering and derived IDs, new inventory kinds, semantic and mutation tests for every diagnostic, and determinism tests including shuffled input.
5. **Bundle.** Switch the production bundle to the migrated styles, remove `proofStyles`, keep `syntheticDefinition` as a compiler fixture, update the documentation relations and index header.
6. **Lookups.** `styles/lookup.ts` and its tests; runtime exports.
7. **Parity harness.** Expansion, comparison, generator, fixture, tests and mutation checks as in section 7; extend `parity:legacy`.
8. **Documentation and index.** `relations.ts`, regenerated classification index and manifest, `change-map.md` rows for style definitions, style compilation and style parity, README and `AGENTS.md` phase text.
9. **Gate.** `npm run verify` locally (valid `GITHUB_TOKEN`, `NODE_USE_ENV_PROXY=1` in this sandbox), `npm run parity:legacy -- <legacy checkout>`, push the acceptance candidate, confirm remote CI, then close out through the ledger state machine.

## 9. Acceptance criteria

- The 18 legacy style IDs appear exactly once in legacy order, with 54 core type and 270 variant IDs identical to legacy.
- Every migrated field equals the legacy source (deferred fields excluded) including order; the compact definitions expand to exactly the legacy structure.
- Every reference resolves; each new diagnostic code has a mutation test reporting the expected code and JSON Pointer path.
- Ordering is explicit (`priority`), unique, seeded from the legacy index, and independent of source array order; the compiled model and `dataVersion` are deterministic and deeply frozen.
- No synthetic style is in the production bundle; policy and `legacyWeight`, `legacyPoints`, `legacyMinMatches` and `legacyPenalty` are never interpreted anywhere in the code.
- Style-data parity is a separate fixture and test category; no scoring, exclusion evaluation, catalog, Finder, persistence, React, localization or accent work is added; no Batch 2A or 2B behavior changes (their parity gates still pass).
- `npm run verify` and `npm run parity:legacy -- <legacy checkout>` pass locally, remote CI passes for the acceptance candidate and the closeout commit, and the ledger records the three Batch 3A gates.

## 10. Risks and edge cases

- Compaction correctness: the compact form is valid only because the legacy data is redundant; the importer and the expansion parity test are the proof, and they must fail if a future legacy fix breaks a redundancy.
- The legacy scorer reads bonuses only from `coreTypes[0]`; compacting to style level removes that ambiguity in data, but Batch 3B must decide the meaning explicitly and must not depend on array position.
- Composite IDs contain `:` and are public contracts; the composite ID module is the single derivation point, and the ID atoms must never contain `:`.
- Ordering: ties in legacy are resolved by array position, so `priority` must be reproduced exactly; the spec's ranking rule (score descending, priority ascending, ID ascending) is 3B behavior, not 3A.
- `miso` is both a style ID and a `tare` option ID; concept keys are namespaced, and the index must show both.
- Index and manifest growth: 18 styles, 54 core types and 25 style rules add about 97 concept rows; the 270 variants are derived and recorded as derived IDs on their core type rather than as rows (Decision 8), keeping the documentation reviewable.
- Deferred copy and accent must not be lost: digests in the fixture are the only evidence until Batch 5B; the digest scope includes rule labels that legacy translations use as identity.
- Legacy budgets embedded in `assertStyleCatalog` are deliberately not enforced in 3A; a reviewer must not read the absence as accepting arbitrary numbers, and Batch 3B must add `POLICY_BUDGET_MISMATCH`.
- The style family is a `form` option; if a later batch adds a form, families and their ordering rules need re-validation.
- Sandbox verification of the ledger requires `NODE_USE_ENV_PROXY=1` and a valid `GITHUB_TOKEN`.

## 11. Migration ledger plan

- Add a batch `3A` entry now (`in-review`, owning only this plan), then move it to `in-progress` on approval.
- Legacy sources: `src/data/styles.json`, `src/domain/types.ts`, `src/domain/schema.ts`, `src/config/styles.ts`, plus read-only reference sources `src/data/catalog.json` and `src/features/map/RamenFinderMap.tsx` (for the externally referenced IDs only).
- New owners: the files listed in section 4 and the fixture.
- Transformation: normalized and compacted style definitions with generated core type and variant expansions; copy, accent, score budgets and scoring semantics explicitly omitted or deferred.
- Behavior: `parity-preserved` for the style data; no runtime scoring behavior exists in the new architecture yet.
- Gates for completion, with the schema policy for batch `3A` added in Task 8: `batch3a-legacy-parity`, `batch3a-local-verify`, `batch3a-remote-ci`. The sequence is `in-progress`, then `in-review` after local evidence, then `migration:ledger:record-ci` to `complete`, then regenerate `docs/migration/ledger.md`.

## 12. Unresolved questions and decisions requested

Each item states a recommendation; nothing is settled until approved.

1. **Decision 1, definition shape.** Recommended: the compact style definition with shared match sets, `bodyByIntensity`, and style-level bonuses and conflicts, expanded by the compiler and proven lossless. Alternative: store all 54 core types literally (about 8,500 lines, repeating three times what is one fact).
2. **Decision 2, numeric scoring fields.** Recommended: carry `legacyPoints`, `legacyMinMatches` and `legacyPenalty` as opaque metadata with structural sanity checks only; budgets deferred to 3B. Alternative: defer the numeric fields entirely to Batch 3B (then the 3A data would not equal the legacy data and could not prove full data parity).
3. **Decision 3, match sets.** Recommended: migrate `exact`, `adjacent` and `partial` sets as typed data with validated references and no ratios. Alternative: defer all rules to 3B (this would leave style data unusable for the reference validation the batch exists to prove).
4. **Decision 4, copy.** Recommended: defer labels and summaries (style, core type, variant, bonus, conflict) to Batch 5B, define one message group ID per entity now, and record a legacy copy digest in the fixture. Alternative: carry the zh-TW text as opaque fields (rejected by the repository rule that visible copy uses stable message IDs and by the localization scope guard).
5. **Decision 5, accent.** Recommended: defer `accent` to Batch 5B (UI rendering is outside the core) with a recorded digest. Alternative: carry `accentColor` as validated opaque data in the core.
6. **Decision 6, ordering.** Recommended: explicit unique `priority` seeded from the legacy array index; 3A only orders the compiled list by it and does not rank. Alternative: rely on array order (rejected: violates the explicit-data rule).
7. **Decision 7, bundle mode.** Recommended: add `styles-production` (questions and styles migrated, policy synthetic) and keep `production` for after Batch 3B.
8. **Decision 8, inventory granularity and kinds.** Recommended: replace `intensity` and `noodle` kinds with `core-type` and `noodle-variant`, add `style-rule`, give styles, core types and rules concept rows, and record variants as derived IDs on their core type rather than 270 separate rows. Alternative: one row per variant (367 rows in total).
9. **Decision 9, composite IDs.** Recommended: the dedicated composite ID contract in section 5.2, with definitions storing atoms only. Alternative: relax `stableIdSchema` to allow `:` everywhere (rejected: it weakens the ID contract for every other concept).
10. **Decision 10, exclusion tag naming.** Recommended: `exclusionTags` (as the architecture spec names it) referencing `exclusions` options, never `none`, no evaluation in 3A.
11. **Decision 11, importer.** Recommended: a one-time importer that fails on any redundancy violation and writes the definitions, after which the definitions are hand-owned; the importer remains as provenance tooling.
12. **Confirmation, new diagnostic codes.** Approve the five codes in section 6 and the reuse of the four existing ones.

No implementation blocker is currently identified; the plan needs no change to Batch 2A or 2B code.

## 13. Approval checklist

- [ ] Scope and out-of-scope list approved
- [ ] Decision 1: compact style definition and expansion
- [ ] Decision 2: numeric scoring fields as opaque `legacy*` metadata, budgets deferred
- [ ] Decision 3: match sets migrated as typed data without ratios
- [ ] Decision 4: copy deferred to Batch 5B with digests recorded
- [ ] Decision 5: accent deferred to Batch 5B (or carried as opaque data)
- [ ] Decision 6: explicit unique `priority` seeded from legacy order
- [ ] Decision 7: bundle mode `styles-production`
- [ ] Decision 8: concept kinds and derived variant IDs
- [ ] Decision 9: composite ID contract
- [ ] Decision 10: `exclusionTags` naming and no evaluation
- [ ] Decision 11: one-time importer approach
- [ ] Confirmation 12: diagnostic codes
- [ ] Final implementation approval of this written plan by the user
