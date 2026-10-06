# Batch 3A: Style Compilation Implementation Plan

**Status:** DRAFT — review required. This document is not implementation permission. Do not start any task below until the user has approved it in writing (AGENTS.md: "Do not start an implementation batch until its written design or plan has the required approval").

**Baseline:** `AnsonHui6040/ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37`

**Prerequisite:** Batches 1, 2A and 2B are complete (latest closeout commit `fb694d87b2ac2e6506ca3129bfb99dad8d520104`).

**Revision:** this revision answers the independent review of commit `33a7c4dcf920a8f3c93a658a2e9b7458c6484f68` (verdict FAIL, ten findings). Section 14 maps every finding to the corrected text. The design is unchanged in intent; the corrections are plan-only and nothing has been implemented.

**Goal:** Replace the synthetic style proof data with the legacy style definitions as compact, typed, hand-owned definitions; compile them deterministically into the canonical classification model (styles, core types, noodle variants, style rules); validate every cross-reference; and prove pure data parity against the frozen legacy sources. No scoring, ranking, eligibility evaluation, localization behavior or UI is introduced.

## 1. Legacy findings (read-only audit)

Sources inspected at the baseline commit: `src/data/styles.json` (221,558 bytes), `src/domain/types.ts` (`StyleDefinition`, `CoreTypeDefinition`, `MatchRule`, `BonusRule`, `ConflictRule`, `NoodleVariantDefinition`, `scoredQuestionIds`, `coreIntensityValues`), `src/domain/schema.ts` (`assertStyleCatalog`, `assertRuleValues`, `assertSignalConditions`, `assertCatalogDataset`), `src/config/styles.ts`, `src/lib/scoring/scorer.ts` and `explainer.ts` (read-only, for field usage), `src/data/catalog.json`, `src/features/map/RamenFinderMap.tsx`, `src/i18n.ts` (`styleTranslations`, `reasonTranslations`, `intensityLabels`, `noodleLabels`, `localizeStyleDefinition`), `src/features/results/ResultsPanel.tsx` and `src/__tests__/config/styles.test.ts`. Every number below was re-derived by scripts over the frozen files during the review.

### 1.1 Inventory

| Item | Fact |
| --- | --- |
| Display styles | **18**, in this array order: `shoyu-chintan`, `shio-chintan`, `miso`, `tonkotsu`, `chicken-chintan`, `chicken-paitan`, `duck-chintan`, `duck-paitan`, `gyokai`, `shellfish-dashi`, `iekei`, `jiro`, `hakata`, `sapporo`, `konbusui-tsukemen`, `gyokai-tsukemen`, `aburasoba`, `taiwan-mazesoba` |
| Family split | `soup` 14, `tsukemen` 2 (`konbusui-tsukemen`, `gyokai-tsukemen`), `dry` 2 (`aburasoba`, `taiwan-mazesoba`) |
| Core types | **54** = 18 styles × 3 intensities (`clean`, `standard`, `heavy`, always in that order) |
| Noodle variants | **270** = 54 core types × 5 noodles (`thin-straight`, `medium-thin-straight`, `medium-thick-straight`, `medium-thick-wavy`, `extra-thick`, always equal to the `noodle` question option order) |
| Bonus rules | 54 per-core entries, exactly one per core type, but only **18 distinct** (identical across the three core types of every style) |
| Conflict rules | 21 per-core entries, only **7 distinct** (6 styles; `jiro` has 2): `shio-chintan`, `duck-chintan`, `shellfish-dashi`, `iekei`, `jiro` (2), `taiwan-mazesoba`; identical across the three core types of every style |
| Style ID form | all 18 are lowercase kebab case; none is renamed |
| Duplicates | none (18 unique style IDs, 54 unique core type IDs, 270 unique variant IDs; 18 bonus IDs and 7 conflict IDs, no overlap) |

### 1.2 Exact fields, value domains and structural presence

`StyleDefinition`: `id`, `label`, `summary`, `family` (a `form` option), `accent` (`#rrggbb` on all 18, 18 distinct values), `ingredients` (always present as an array; **explicitly `[]` on 3 styles**, `shoyu-chintan`, `shio-chintan` and `miso`; exactly one tag on the other 15, from `chicken`, `dairy`, `duck`, `fish-seafood`, `pork`, `shellfish`; `none` never appears), `coreTypes`.

`CoreTypeDefinition`: `id` (`<styleId>:<intensity>`), `label` (3 fixed strings), `summary` (style summary plus one fixed suffix per intensity, verified for all 54), `intensity`, `rules`, `bonuses`, `conflicts`, `noodleVariants`. All 54 core types carry exactly the keys `bonuses`, `conflicts`, `id`, `intensity`, `label`, `noodleVariants`, `rules`, `summary`; **`conflicts` is present on all 54 and is explicitly `[]` on 36 of them**, and `bonuses` is present on all 54 with exactly one entry.

`rules` has exactly the seven keys `form`, `archetype`, `tare`, `source`, `body`, `noodle`, `signature`. Each rule is an object whose present keys are one of three tier combinations, with no empty arrays and no value in more than one tier of a rule:

| Tier keys present | Rules (of 54 × 7 = 378) |
| --- | --- |
| `exact` only | 39 |
| `exact` + `adjacent` | 279 |
| `exact` + `adjacent` + `partial` | 60 |

Across the three core types of a style **only the `body` rule differs (18 of 18 styles); the other six rules are identical**.

`bonuses[]`: `{ id, label, points (3, 4 or 5), minMatches (4 or 5), conditions[] }`, with 4 to 7 conditions per bonus. `conflicts[]`: `{ id, label, penalty (6, 8, 10, 12 or 15), whenAll: conditions[] }`. A condition is `{ question, anyOf }`; no rule repeats a question and no `anyOf` repeats a value. `noodleVariants[]`: `{ id: <styleId>:<intensity>:<noodle>, noodle, label, summary }`; the label is one fixed string per noodle and the summary is the fixed template "presented with `<label>` for this core type".

All rule values, condition values and ingredient tags are members of the corresponding question's option set (0 reference violations across 54 core types).

**Verified legacy data fact (recorded, not promoted to an invariant):** `rules.form.exact` equals `[style.family]` on all 54 core types. This is an observation about the frozen data. Batch 3A does **not** add a schema or compiler rule that couples `familyOptionId` and `match.form`; each is validated independently against the `form` question's options. The fact is asserted only by the independent legacy reader's fact test (section 7) so a future data change is noticed, never enforced as a model invariant.

### 1.3 Which fields the legacy code actually consumes

- `scorer.ts` reads `family` (primary versus alternative results), `rules` (tier lookup), `ingredients` (blocking), `noodleVariants` (subtype by noodle, falling back to the first variant) and the style, core type and variant IDs (collapsing by display style).
- **Bonuses and conflicts are read per core type.** `scoreCoreType` calls `computeBonuses({ ...style, coreTypes: [coreType] }, answers)` (`scorer.ts:203`), so the helper's `style.coreTypes[0]` is the *selected* core type. Each core type owns and uses its own bonus data and its own conflict data in legacy behavior. The frozen data happens to contain identical bonus data and identical conflict data across the three core types of every style (proven in section 7), which is the only reason the compaction in section 3 is lossless.
- Score ratios `1`, `0.6`, `0.4`, the caps `5` and `15` and the confidence constants live in scorer code, not in the style data; question weights live in `questions.json`.
- Result and Finder UI read `label`, `summary`, `accent` and IDs; catalog reads `styleId`, `coreTypeIds`, `subtypeIds`.

### 1.4 Localization audit (corrected)

The earlier statement that the legacy `label` and `summary` are the only style copy was wrong. The verified behavior is:

- `src/i18n.ts` declares `styles: {}` for all three locales, but at module load (`i18n.ts:834`) it replaces the `en` and `ja` dictionaries' `styles` with `styleTranslations`. `zh-TW` keeps `{}` and falls back to `styles.json` `label` and `summary`.
- `styleTranslations` has **18 English and 18 Japanese `[label, summary]` entries keyed by stable style ID**, covering exactly the 18 style IDs in the same order as `styles.json`.
- `reasonTranslations` has **25 English and 25 Japanese entries keyed by the zh-TW label text** of a bonus or conflict (18 bonus labels and 7 conflict labels; each locale covers exactly those 25 labels). The 25 labels map one-to-one to the 25 rule IDs (25 distinct labels, 25 distinct rule IDs), so a label-to-ID mapping can be recorded without ambiguity. Identity by display text is architecture risk 7.
- Core type labels and summaries, and noodle variant labels and summaries, exist only in zh-TW in `styles.json`. English and Japanese render the core descriptor from the option-keyed dictionaries `intensityLabels` (3 values) and `noodleLabels` (5 values), not from style-keyed copy.

Batch 3A **migrates no localization behavior**. It only preserves audit evidence so Batch 5B can prove its message catalog covers every legacy string (section 7.3).

### 1.5 Externally referenced IDs

| Referrer | References |
| --- | --- |
| `src/data/catalog.json` | 6 style IDs (`aburasoba`, `gyokai-tsukemen`, `hakata`, `iekei`, `taiwan-mazesoba`, `tonkotsu`), 9 core type IDs (for example `hakata:standard`) and 9 variant IDs (for example `hakata:standard:thin-straight`); all resolve in the legacy data |
| `RamenFinderMap.tsx` `CURRENT_STYLE_TO_FINDER_CODES` | all 18 style IDs as keys |
| `i18n.ts` `styleTranslations` | all 18 style IDs as keys (en and ja) |
| `enricher.ts`, results and map UI, legacy tests | style, core type and subtype IDs by string |

The composite IDs `<style>:<intensity>` and `<style>:<intensity>:<noodle>` are public contracts (catalog data references them) and contain `:`, so they are **not** valid under the current `stableIdSchema`. They must be reproduced exactly (section 5.2).

### 1.6 Ordering rules

There is no explicit priority field in the legacy data. Order is the array order of `styles.json`, then core types in intensity order, then variants in noodle order. It is behaviorally significant: `collapseByDisplayStyle` keeps the **first** core type on equal scores (strict `>`) and then sorts display styles with a stable sort, so equal scores keep style array order; `pickNoodleVariant` falls back to the first variant. The architecture spec requires both orders to be explicit data: display priority seeded from the legacy source order (spec section 11, line 245) and a compiled core priority that preserves the legacy intensity order (spec section 11, line 243).

### 1.7 Validation behavior (`assertStyleCatalog`)

Throws on the first problem, not aggregated: duplicate style, core type or variant ID; ingredient `none` or unsupported; core type count not 3; unsupported or repeated intensity; a missing scored rule, an empty rule or a value outside the question's option set; a bonus with `points <= 0`, non-integer or out-of-range `minMatches` (must be `1` to `conditions.length`), or an invalid condition; a conflict penalty `<= 0`; variant count not 5; unsupported or repeated noodle. It also embeds **score budgets**: total bonus points per core type `<= 5`, total conflict penalty `<= 30`, single penalty `<= 15`. It never validates that `family` is a form value, that variant order equals the noodle option order, or that IDs are kebab case.

### 1.8 Scoring-related and display-related fields: exactly one disposition each

Each scoring-related item has exactly one disposition: **A** = migrate as opaque legacy metadata in 3A (carried, validated only for structure, never interpreted) or **B** = defer to Batch 3B. Display items are deferred to Batch 5B and non-scoring taxonomy items are migrated as plain data.

| Field | Nature | Disposition |
| --- | --- | --- |
| `rules` tier sets (`exact`, `adjacent`, `partial`) | match data referencing option IDs | **A**, typed reference data; tier names are labels only |
| tier-to-ratio mapping (`1`, `0.6`, `0.4`) | scorer code, not in the data | **B** |
| `bonuses[].points`, `minMatches`, `conflicts[].penalty` | numeric scoring parameters | **A**, carried as `legacyPoints`, `legacyMinMatches`, `legacyPenalty`; structural sanity only |
| bonus and conflict `conditions` / `whenAll` | question and option references | **A**, validated references, no evaluation |
| score budgets (`<= 5`, `<= 30`, `<= 15`) | score policy inside the legacy validator | **B** (`POLICY_BUDGET_MISMATCH`), not enforced in 3A |
| caps `5` and `15`, confidence constants, tie-break formulas | scorer code | **B** |
| `legacyWeight` on questions | scoring weight carried since Batch 2A | **A**, untouched and uninterpreted |
| style `priority` and intensity `priority` | explicit ordering data seeded from legacy order | **A**, ordering data only; the tie policy that uses it is **B** |
| `ingredients` | exclusion tags used by blocking | migrated as `exclusionTags` data (**A**); evaluation is Batch 3C |
| `family`, `intensity` taxonomy, noodle expansion | non-scoring taxonomy and references | migrated as data |
| labels, summaries, rule labels, translations | localized copy | deferred to Batch 5B with evidence (section 7.3) |
| `accent` | UI color | deferred to Batch 5B with a recorded digest |

### 1.9 Cross-references from styles to question and option IDs

`family` to a `form` option; `exclusionTags` to `exclusions` options; every `rules` set and every condition to options of the named question; the variants expand over the `noodle` question's option list. Style `miso` shares its ID text with the `tare` option `miso`; this is not a collision because concept keys are namespaced by kind (`style/miso`, `option/tare:miso`).

### 1.10 Current synthetic assumptions that must disappear

- `proofStyles` (`proof-shoyu`) with `familyOptionId: 'chintan'`, which wrongly points at an `archetype` option instead of a `form` option.
- `intensities` and `noodles` as free string arrays not validated against the question options; `priority: 0` on every style; concept kinds `intensity` and `noodle` that name style × intensity and style × noodle expansions by their vocabulary rather than as core types and variants.
- The compiled model exposing the raw source styles with no expansion and no derived IDs.
- The compiler accepting any option ID of any question as a style family; the manifest and index header calling styles synthetic.
- `syntheticDefinition` exported from the **public** compiler entrypoint (`compiler/index.ts:8`); it may remain only as a clearly test-scoped fixture (section 5.5).

## 2. Scope

In scope:

- Canonical legacy style definitions as one compact typed definition per style, hand-owned in `definitions/` after the one-time import.
- Stable, unchanged style IDs; deterministic derivation of the legacy core type and variant IDs; explicit style and intensity priorities.
- Style contracts (Zod, `unknown` input) and compiler support: expansion into core types and variants, validation of every reference, deterministic explicit ordering.
- Diagnostics for invalid, duplicate and dangling style references.
- Removal of the synthetic style proof data from the production bundle and isolation of synthetic definitions from production entrypoints.
- Pure style-data parity tooling and localization **evidence** (digests) against the frozen legacy sources.
- Regenerated manifest, index and change map; ledger and documentation updates.

Out of scope: scoring formulas, tier ratios, caps, budgets, confidence, tie-break formulas and ranking; interpreting `legacyWeight`, `legacyPoints`, `legacyMinMatches` or `legacyPenalty`; exclusion evaluation; persistence changes; catalog and Finder runtime behavior; React and UI; localization runtime migration and message catalogs; accent color; browser code; any Batch 3B or later work.

## 3. Proposed compact definition and expansion

The legacy data repeats the same information three times per style. Verified redundancy: bonuses, conflicts and six of seven rules are identical across the three core types; core copy is the style copy plus one fixed suffix per intensity; variant copy is fixed per noodle. The compact definition stores each fact once and the compiler expands it, and **exact structural presence is preserved** (section 3.2). Compaction is allowed because equality is proven from the frozen data, not because the legacy scorer reads only one core type (it does not, section 1.3); Batch 3A does not change or interpret scoring semantics.

```ts
interface StyleSource {
  sourceFile: string
  id: string                          // legacy style ID, unchanged
  messageId: string                   // authored, equals style-<id>
  priority: number                    // explicit, unique; seeded from the legacy array index (0 to 17)
  familyOptionId: string              // option of the `form` question
  exclusionTags: string[]             // always present; [] allowed; options of `exclusions`, never `none`; data only
  match: {                            // the six rules identical across intensities
    form: MatchSet; archetype: MatchSet; tare: MatchSet
    source: MatchSet; noodle: MatchSet; signature: MatchSet
  }
  bodyByIntensity: Record<string, MatchSet>     // keyed by intensity taxonomy ID; the only per-intensity rule
  bonuses: BonusSource[]              // always present; { id, legacyPoints, legacyMinMatches, conditions }
  conflicts: ConflictSource[]         // always present; [] allowed; { id, legacyPenalty, whenAll }
}
type MatchSet = { exact?: string[]; adjacent?: string[]; partial?: string[] }   // present tiers non-empty, no repeats
interface IntensitySource { id: string; messageId: string; priority: number }   // clean 0, standard 1, heavy 2
```

Compiler output per style (deep-frozen, sorted by `priority` then ID):

- `coreTypes[]`, sorted by the intensity `priority`, each with ID `<styleId>:<intensityId>`, its explicit `priority` (copied from the taxonomy entry), its seven rules (six shared plus the intensity's `body`), the style's bonuses and conflicts (each core type receives its own identical copy), and a derived message ID.
- `variants[]` per core type, one per option of the `noodle` question in question option order, with ID `<styleId>:<intensityId>:<noodleOptionId>` and a derived message ID.

### 3.1 Explicit priorities (neither is a scoring formula)

- **Style priority** preserves the legacy style array ordering: the 18 styles receive `0` to `17` in the legacy order and the values must be unique.
- **Intensity priority** is declared on the taxonomy entries in `definitions/taxonomy.ts` (`clean` 0, `standard` 1, `heavy` 2), seeded from the frozen `coreIntensityValues` order and the core type order in `styles.json`, and must be unique. Compiled core types expose it, so core order is data rather than array position.
- Both priorities are ordering data only. 3A uses them to sort compiled output deterministically and does nothing else with them. The tie-break policy that consumes them (score descending, priority ascending, ID ascending, per the spec) is Batch 3B.

### 3.2 Exact structural presence

- The expansion emits only the tiers present in the source `MatchSet`; it never synthesizes an empty `adjacent` or `partial` array. A `MatchSet` with an empty array present is rejected as `STRUCTURE_INVALID`.
- `conflicts` and `exclusionTags` are required arrays in the source, so an explicit `[]` is preserved and expands to the legacy `conflicts: []` (36 core types) and `ingredients: []` (3 styles). `bonuses` is a required array and expands to the legacy `bonuses` array present on all 54 core types.
- No validator requires a tier to be present beyond the legacy rule that a rule has at least one value overall, and no rule treats an absent field and an empty field as equivalent (section 7.2).

### 3.3 Message ID derivation

Message IDs reference copy that is deferred to Batch 5B. Contract: **no localization ID is invented to satisfy a one-per-entity assumption**; sharing is allowed where the legacy copy is itself shared.

| Entity | Message ID | Source | Shared? |
| --- | --- | --- | --- |
| style | `style-<styleId>` | authored in the definition | no, unique by style ID |
| intensity taxonomy entry | `intensity-<intensityId>` | authored in the taxonomy | no |
| core type | `core-type-<styleId>-<intensityId>` | derived | no, unique by construction (54) |
| noodle variant | `noodle-variant-<noodleOptionId>` | derived | **intentionally shared by the 54 variants of the same noodle** (5 IDs), because the legacy variant label is one fixed string per noodle and the summary is one fixed template |
| bonus rule | `style-bonus-<styleId>-<ruleId>` | derived | no, unique by construction (18) |
| conflict rule | `style-conflict-<styleId>-<ruleId>` | derived | no, unique by construction (7) |

Uniqueness is validated only where the contract requires it: the styles, intensities, core types and style rules each have unique message IDs, which follows from unique atoms and is asserted by a test; the variant IDs are explicitly the declared shared set. No new message-ID diagnostic is added.

## 4. Proposed files and modules

```text
packages/classification-core/src/definitions/styles.ts        the 18 migrated style definitions (hand-owned after the import)
packages/classification-core/src/definitions/taxonomy.ts      intensity taxonomy with message IDs and explicit priorities
packages/classification-core/src/definitions/bundle.ts        production bundle: questions + styles; policy remains synthetic
packages/classification-core/src/definitions/synthetic.ts     syntheticDefinition as a test fixture only; proofStyles removed
packages/classification-core/src/testing.ts                   test and dev scoped export of syntheticDefinition (section 5.5)
packages/classification-core/src/contracts/style-references.ts  the one canonical set of questions that style conditions may reference
packages/classification-core/src/contracts/composite-id.ts    composite ID schema and derivation for core types and variants
packages/classification-core/src/contracts/message-id.ts      deterministic message ID derivation (section 3.3)
packages/classification-core/src/compiler/source-schema.ts    style, match set, bonus, conflict and taxonomy schemas
packages/classification-core/src/compiler/styles.ts           expansion, reference validation, derived IDs, ordering
packages/classification-core/src/compiler/compile.ts          calls the style compiler; new inventory kinds
packages/classification-core/src/contracts/model.ts           compiled style, core type and variant types; concept kinds
packages/classification-core/src/styles/lookup.ts             pure lookups over the compiled model
packages/classification-core/src/styles/styles.test.ts        contract, semantic, determinism and mutation tests
tools/migration/import-legacy-styles.ts                       one-time importer (migration aid only; parity never depends on it)
tools/parity/legacy-style-source.ts                           independent legacy reader (section 7.1)
tools/parity/styles-data.ts                                   projection of the compiled model to the legacy shape
tools/parity/styles-compare.ts                                structural comparator (key presence aware)
tools/parity/styles-generate.ts                               writes and checks the committed style fixtures
tools/parity/styles.test.ts                                   style-data parity tests (separate from any scoring parity)
tools/parity/fixtures/styles-data.json                        digests, structural facts and externally referenced IDs
tools/parity/fixtures/styles-copy-evidence.json               localization evidence for Batch 5B (digests only)
```

Existing files touched: `contracts/diagnostic-codes.ts`, `src/index.ts`, `src/compiler/index.ts` (remove the synthetic export), `package.json` (`exports` gains `./testing`), `eslint.config.js` (production guard), `tools/documentation/relations.ts`, `tools/documentation/build-index.ts` (header wording, `Derived IDs` column, manifest `derivedIds`), `tools/validation/validate-classification.ts`, `tools/migration/ledger-schema.ts`, `docs/classification/change-map.md`, `docs/migration/baseline.md`, README, `AGENTS.md`. No `apps/web`, React, scoring, catalog or persistence file changes.

## 5. Contract and compiler changes

### 5.1 Bundle, model and concept kinds

- `definitionBundleSchema` gains `intensities` (taxonomy) and a richer `styles` array; `policy` is unchanged and remains synthetic proof data. The bundle `mode` gains `styles-production` (questions and styles migrated, policy synthetic); `production` stays reserved for after Batch 3B.
- `ClassificationModel.styles` becomes the compiled, expanded, ordered style list of section 3.
- Concept kinds `intensity` (style × intensity) and `noodle` (style × noodle) are replaced by `core-type` and `noodle-variant`; `intensity` now names the **taxonomy entry**; `style-rule` is added for bonus and conflict rules.
- Concept rows: 18 `style`, 3 `intensity`, 54 `core-type`, 25 `style-rule` (18 bonus + 7 conflict) = 100 new rows. The 270 `noodle-variant` IDs are **derived IDs**, not rows.

### 5.2 Composite IDs

`contracts/composite-id.ts` is the only production place composite IDs are built: `coreTypeId(styleId, intensityId)` returns `<styleId>:<intensityId>` and `variantId(coreTypeId, noodleOptionId)` returns `<coreTypeId>:<noodleOptionId>`, both validated to consist of stable atoms joined by `:`. Definitions never store composite IDs. The general `stableIdSchema` is not loosened. The parity harness never uses this module (section 7.1).

### 5.3 The one canonical set of referencable questions (ownership of finding 4)

`contracts/style-references.ts` exports one explicit constant, `styleReferenceQuestionIds` = `form`, `archetype`, `tare`, `source`, `body`, `noodle`, `signature`: the questions that style match data and style conditions may reference. It is the single owner used by the Zod schema (the fixed keys of `match` and `bodyByIntensity` plus the `question` field of conditions), the compiler cross-check and the tests. Rules:

- `legacyWeight` is **not interpreted in Batch 3A**; the set is **not derived from `legacyWeight`**, and a weight of zero (as on `exclusions`) must never be used to infer whether a question is referencable.
- The constant is named for what it is (a reference set), carries no scoring meaning, and is checked once against the frozen legacy `scoredQuestionIds` by the independent reader's fact test. It is not a data flag on questions, so no Batch 2A definition changes.
- A condition `question` is accepted by the schema as a stable ID string; the compiler then validates it. An **unknown question ID, or a known question that is not in `styleReferenceQuestionIds` (for example `exclusions`), is reported with the existing generic `REFERENCE_UNKNOWN`**, with a message that names which case applies and a JSON Pointer to the `question` field. No new diagnostic is added for this.

### 5.4 Semantic validation (aggregated, JSON Pointer paths)

- style IDs unique (`STYLE_DUPLICATE_ID`); intensity IDs unique (`CONCEPT_DUPLICATE_KEY`); **style priorities unique and intensity priorities unique** (`PRIORITY_DUPLICATE`, section 6), non-negative integers; rule IDs unique within a style (bonus and conflict IDs share one namespace per style);
- `familyOptionId` is an option of the `form` question;
- each `exclusionTags` entry is an option of the `exclusions` question, is not `none`, and repeats nowhere;
- every `match` and `bodyByIntensity` value is an option of its own question; each present `MatchSet` tier is non-empty with no repeated value and each set has at least one value overall (as legacy does);
- `bodyByIntensity` keys equal the taxonomy intensity IDs exactly: an **extra key is `REFERENCE_UNKNOWN`** (unknown intensity) and a **missing key is `STYLE_BODY_RULE_INCOMPLETE`**; the keys are data-driven, not hard-coded in the schema;
- every condition names a question in `styleReferenceQuestionIds` (5.3), is non-empty, lists option IDs of that question with no repeats (`RULE_UNKNOWN_OPTION` for an unknown option); `legacyMinMatches` is an integer from 1 to the condition count and `legacyPoints` and `legacyPenalty` are finite numbers greater than 0. These are legacy data-sanity bounds only; they give the numbers no scoring meaning;
- the variant expansion covers every option of the `noodle` question exactly once and derived IDs are unique across the model (`CONCEPT_DUPLICATE_KEY`);
- the concept inventory has no duplicate keys.

Score budgets and any interpretation of the numeric fields are **not** validated (Batch 3B).

### 5.5 Production protection from synthetic data

- `syntheticDefinition` is removed from the public `@ramen-style/classification-core/compiler` entrypoint. If a test or dev tool still needs it, it is exposed only through a new, clearly named `@ramen-style/classification-core/testing` subpath. An ESLint rule forbids importing `/testing` or `definitions/synthetic` from any file that is not a `*.test.ts` file, and a repository test scans non-test sources for such imports.
- Production tooling (`validate-classification`, the index generator, the parity generators) imports only the canonical production definition.
- **Production bundle checks** (in `classification:validate` and in tests) fail if synthetic data enters the canonical compiled bundle: no style, core type, rule or intensity concept may have `sourceFile` `definitions/synthetic.ts`; no ID may start with `proof-` or `demo-`; bundle style IDs must be disjoint from `syntheticDefinition`; the bundle `mode` must be `styles-production`. The only permitted synthetic source is the `policy/default` concept until Batch 3B, as an explicit, commented allow-list entry.
- `proofStyles` is deleted; `proofPolicy` stays until Batch 3B.

### 5.6 Manifest and index (`derivedIds`)

The generated manifest gains `derivedIds` on each concept that derives IDs: each `core-type` concept lists its five noodle variant IDs, and each `style` concept lists its three core type IDs. The generated index Markdown gains a `Derived IDs` column. Drift and parity checks cover all **18 style IDs, 54 core type IDs and 270 noodle variant IDs**: the union of the manifest's concept IDs and `derivedIds` must equal the legacy ID sets exactly, and the drift check fails if any derived ID changes without regeneration. The 3 intensity taxonomy entries have their own canonical concept rows (`intensity/clean`, `intensity/standard`, `intensity/heavy`).

## 6. Diagnostics

Reuse existing codes: `STRUCTURE_INVALID` (schema, empty tiers, numeric sanity, thresholds), `STYLE_DUPLICATE_ID`, `REFERENCE_UNKNOWN` (unknown or non-referencable condition question; extra `bodyByIntensity` key), `CONCEPT_DUPLICATE_KEY` (duplicate intensity IDs, derived-ID collisions). New codes, each a distinct condition, none redundant with a schema failure, each with a mutation test:

| Code | Severity | Condition |
| --- | --- | --- |
| `STYLE_FAMILY_MISMATCH` | error | `familyOptionId` is not an option of the `form` question |
| `RULE_UNKNOWN_OPTION` | error | a match set or condition value is not an option of the referenced question |
| `STYLE_EXCLUSION_TAG_INVALID` | error | an exclusion tag is not an option of the `exclusions` question, is `none`, or repeats |
| `STYLE_RULE_DUPLICATE_ID` | error | a bonus or conflict ID repeats within a style |
| `PRIORITY_DUPLICATE` | error | two styles share a `priority`, or two intensity taxonomy entries share a `priority`; the entity kind is named in the message and the path points at the offending `priority` field (`/styles/<i>/priority` or `/intensities/<i>/priority`) |
| `STYLE_BODY_RULE_INCOMPLETE` | error | a style's `bodyByIntensity` lacks a taxonomy intensity |

`PRIORITY_DUPLICATE` replaces the earlier proposal `STYLE_PRIORITY_DUPLICATE` so one code covers both style and core/intensity priority. Diagnostics keep the stable code, severity, entity ID, source file, JSON Pointer path and actionable message; validation aggregates independent errors.

Runtime lookups (`styles/lookup.ts`, pure, exported from the runtime entrypoint): `orderedStyles(model)`, `findStyle(model, styleId)`, `findCoreType(model, coreTypeId)`, `findNoodleVariant(model, variantId)`. They return compiled data only and contain no ranking.

## 7. Parity strategy: independent evidence, pure data only

### 7.1 Independent extraction path (no circularity)

The expected values for every parity assertion come **directly from the frozen legacy files** through `tools/parity/legacy-style-source.ts`, which:

- reads `src/data/styles.json` and `src/data/catalog.json` with `JSON.parse`;
- extracts `styleTranslations`, `reasonTranslations`, `intensityLabels` and `noodleLabels` from `src/i18n.ts`, `CURRENT_STYLE_TO_FINDER_CODES` from `src/features/map/RamenFinderMap.tsx`, and `scoredQuestionIds`, `coreIntensityValues` and `noodleValues` from `src/domain/types.ts`, **using the TypeScript compiler API (AST) to read the object and array literals**, never the Batch 3A production model;
- takes style, core type and variant IDs as the **literal `id` strings** in the legacy JSON, never recomputed;
- imports nothing from `packages/classification-core` (any entrypoint), nothing from `tools/migration/import-legacy-styles.ts`, nothing from `contracts/composite-id` or `contracts/message-id`. A test asserts this by scanning the module's imports, as in Batch 2B.

The committed fixtures (`styles-data.json`, `styles-copy-evidence.json`) are written and verified only by this reader. The production expansion in `styles-data.ts` is compared **against** the reader's output, never used to produce it. The one-time importer is a migration aid only; no parity evidence depends on it. **Shared-bug resistance:** a required test mutates the production composite-ID derivation (for example a different separator or argument order) in both the importer path and the compiler path at once and must fail, because the expected IDs are the legacy literals. A second test perturbs one `legacyPoints` value and one tier array in the definitions and must fail. The legacy `assertStyleCatalog` is also run on the frozen data to confirm the baseline itself is valid.

### 7.2 Exact structural parity

- The compiled model is projected back to the legacy shape (`family`, `ingredients` from `exclusionTags`, `coreTypes` with `rules`, `bonuses`, `conflicts`, `noodleVariants` and all IDs, with `legacy*` fields mapped back to `points`, `minMatches` and `penalty`) and compared with the raw legacy JSON **after removing only the deferred copy and accent fields** (`label`, `summary`, `accent`, and the labels and summaries of core types, variants, bonuses and conflicts).
- The comparator `styles-compare.ts` compares **key presence as well as values**: it uses own-property tests, treats `[]` and an absent key as different, compares arrays in order, and never normalizes undefined, absent or empty values into equivalence.
- Explicit assertions: no `adjacent` or `partial` key exists unless legacy has it (counts 39 / 279 / 60 for the three tier combinations); `conflicts: []` is present on exactly the 36 legacy core types; `ingredients: []` is present on exactly the 3 legacy styles; `bonuses` is present on all 54 core types.

### 7.3 Localization evidence for Batch 5B (digests only, no behavior)

`styles-copy-evidence.json` is a Batch 5B hand-off. It records SHA-256 digests (of the exact string pair `[label, summary]` or the single label string, serialized as JSON) keyed by stable IDs, so later localization parity is auditable. It adds no loading or localization code.

| Evidence set | Records | Source and identity |
| --- | --- | --- |
| style copy, zh-TW | 18 | `styles.json`, key `style/<styleId>` |
| style copy, en | 18 | `i18n.ts` `styleTranslations.en`, key `style/<styleId>` |
| style copy, ja | 18 | `i18n.ts` `styleTranslations.ja`, key `style/<styleId>` |
| rule copy, zh-TW | 25 | `styles.json` bonus and conflict `label`, key `style-rule/<styleId>:<ruleId>` |
| rule copy, en and ja | 25 each | `i18n.ts` `reasonTranslations`, legacy key is the zh-TW label text; the fixture records the **explicit migration mapping** zh-TW label text to `style-rule/<styleId>:<ruleId>` (verified one-to-one, 25 labels to 25 rule IDs) |
| core type copy, zh-TW | 54 | `styles.json` core `label` and `summary`, key `core-type/<coreTypeId>` |
| variant copy, zh-TW | 270 | `styles.json` variant `label` and `summary`, key `noodle-variant/<variantId>` |
| taxonomy labels | 3 per locale (intensity) and 5 per locale (noodle) | `i18n.ts` `intensityLabels` and `noodleLabels`, keyed by taxonomy and option ID |
| accent | 18 | `styles.json` `accent`, key `style/<styleId>` (deferred, digest only) |

Tests assert the record counts above, that the style and rule keys equal the compiled style and rule IDs exactly, that the English and Japanese style records cover all 18 IDs, that the 25 en and 25 ja reason labels equal the 25 zh-TW labels, and that the mapping is a bijection. The evidence for each message ID is traceable: the model's derived message ID (section 3.3) plus the concept key identify the evidence record.

### 7.4 Checks

| Requirement | Test |
| --- | --- |
| every legacy style ID exists exactly once | compiled style IDs equal the 18 legacy IDs in legacy order, each once; likewise 54 core IDs and 270 variant IDs (manifest concept IDs plus `derivedIds` equal the legacy sets) |
| migrated fields equal the legacy source | structural comparison of section 7.2, including key presence and array order |
| deterministic ordering | compiled style order equals style priority order equals the legacy index; compiled core order equals intensity priority order; compiling with the source arrays shuffled or reversed yields the identical model and `dataVersion` |
| all references resolve | no diagnostics on the production bundle; one mutation test per diagnostic code at the expected JSON Pointer path; the fixture's externally referenced IDs (6 + 9 + 9 from the catalog, 18 Finder keys) all resolve |
| no synthetic data in production | section 5.5 checks |
| compiled output is deterministic | two compilations are byte-identical (stable JSON), `dataVersion` is stable, results are deeply frozen |
| scored-question set | the reader's fact test equals `styleReferenceQuestionIds` against the frozen `scoredQuestionIds`; no code path reads `legacyWeight` |
| recorded data facts | `rules.form.exact` equals `[family]` on all 54 core types (fact only, no compiler rule); bonuses and conflicts identical across each style's three core types; only `body` differs |

### 7.5 Categories and commands

Style-data parity and localization evidence live in their own fixtures and tests and report only inventory, ID, reference, structural and digest equality. **Scoring-behavior parity (rankings, points, confidence, blocking) is not part of Batch 3A and belongs to Batch 3B and 3C**, so a scoring difference can never be mistaken for a data difference. Commands: `npm run parity` (committed fixtures, no legacy checkout) and `npm run parity:legacy -- <legacy checkout>` (regenerates with the independent reader and compares); the Batch 2B runner is extended with the style generator. Mutation checks are performed and recorded as ledger evidence.

## 8. Task breakdown

Task order is fixed; each task ends with focused tests green and no other batch's files touched.

1. **Record the audit.** Copy sections 1 and 14 and the decisions into `docs/migration/baseline.md`.
2. **Contracts.** Composite ID, message ID and style-reference modules, style, match set, bonus, conflict and taxonomy schemas, bundle mode, compiled model types, new diagnostic codes, contract tests.
3. **Importer.** `tools/migration/import-legacy-styles.ts` reads the legacy checkout, proves every compaction assumption (bonuses, conflicts and non-body rules identical across cores; fixed order; full variants), and writes `definitions/styles.ts` and `definitions/taxonomy.ts` in repository code style. After this task the definitions are hand-owned and canonical; the importer is provenance tooling only.
4. **Compiler.** Expansion, reference validation, priorities, derived IDs and message IDs, new inventory kinds, semantic and mutation tests for every diagnostic, determinism tests including shuffled input.
5. **Bundle and isolation.** Switch the production bundle to the migrated styles, remove `proofStyles`, remove `syntheticDefinition` from the public compiler entrypoint, add the `./testing` subpath, the ESLint rule, the import-scan test and the production bundle checks.
6. **Lookups.** `styles/lookup.ts` and its tests; runtime exports.
7. **Independent parity harness.** `legacy-style-source.ts`, projection, comparator, generators, both fixtures, tests, shared-bug and mutation checks, `parity:legacy` extension.
8. **Documentation and index.** `relations.ts`, manifest `derivedIds` and index column, regenerated classification index and manifest, `change-map.md`, README and `AGENTS.md` phase text, ledger gate policy for `3A`.
9. **Gate.** `npm run verify` locally (valid `GITHUB_TOKEN`, `NODE_USE_ENV_PROXY=1` in this sandbox), `npm run parity:legacy -- <legacy checkout>`, push the acceptance candidate, confirm remote CI, then close out through the ledger state machine.

## 9. Acceptance criteria

- The 18 legacy style IDs appear exactly once in legacy order, with 54 core type and 270 variant IDs identical to the legacy literals; the manifest and `derivedIds` cover all three sets.
- Every migrated field equals the legacy source under the key-presence-aware comparator; absent and empty fields are never conflated.
- Style priority (0 to 17) and intensity priority (0 to 2) are explicit, unique, seeded from legacy order and exposed on compiled output; no scoring or tie formula exists in 3A.
- Every reference resolves; each new diagnostic code has a mutation test at the expected path; an unknown or non-referencable condition question is `REFERENCE_UNKNOWN`.
- The compiled model and `dataVersion` are deterministic and deeply frozen.
- No synthetic data in the production bundle; `syntheticDefinition` is unreachable from production entrypoints and from non-test sources.
- Parity expectations come from the independent reader; the shared-bug test fails when production derivation is wrong; the copy evidence fixture has the counts of section 7.3.
- No scoring, exclusion evaluation, catalog, Finder runtime, persistence, React, localization runtime or accent work is added; `legacyWeight`, `legacyPoints`, `legacyMinMatches` and `legacyPenalty` are never interpreted; Batch 2A and 2B parity gates still pass.
- `npm run verify` and `npm run parity:legacy -- <legacy checkout>` pass locally, remote CI passes for the acceptance candidate and the closeout commit, and the ledger records the three Batch 3A gates.

## 10. Risks and edge cases

- Compaction correctness: the compact form is valid only because the legacy data is redundant; the importer and the structural parity test are the proof and must fail if a future legacy fix breaks a redundancy. Batch 3B must not assume bonuses or conflicts are style-level in legacy: they are per core type there, and 3A merely expands one identical copy into each.
- Composite IDs contain `:` and are public contracts; the composite ID module is the single derivation point and the ID atoms must never contain `:`.
- Ordering: ties in legacy are resolved by first-wins within a style and stable array order across styles; both orders are now explicit priorities in the compiled output, and the tie policy itself is Batch 3B.
- `miso` is both a style ID and a `tare` option ID; concept keys are namespaced and the index must show both.
- Index and manifest growth: 100 new concept rows; the 270 variants are derived IDs, not rows, so the documentation stays reviewable.
- Deferred copy and accent must not be lost: the evidence fixture is the only record until Batch 5B; it covers zh-TW, English and Japanese style copy and the label-keyed reason translations with an explicit label-to-ID mapping.
- Legacy budgets in `assertStyleCatalog` are deliberately not enforced in 3A; a reviewer must not read the absence as accepting arbitrary numbers, and Batch 3B must add `POLICY_BUDGET_MISMATCH`.
- A `./testing` subpath is a new package export; it must stay unreachable from production code by lint and by the import-scan test.
- The style family is a `form` option; if a later batch adds a form, families need re-validation.
- Sandbox verification of the ledger requires `NODE_USE_ENV_PROXY=1` and a valid `GITHUB_TOKEN`.

## 11. Migration ledger plan

- A batch `3A` entry already exists (`in-review`, owning only this plan); it moves to `in-progress` on approval.
- Legacy sources: `src/data/styles.json`, `src/domain/types.ts`, `src/domain/schema.ts`, `src/config/styles.ts`, plus read-only reference sources `src/i18n.ts` (copy evidence), `src/data/catalog.json` and `src/features/map/RamenFinderMap.tsx` (externally referenced IDs only).
- New owners: the files listed in section 4 and both fixtures.
- Transformation: normalized and compacted style definitions with generated core type and variant expansions; copy, accent, score budgets and scoring semantics explicitly omitted or deferred; localization represented by evidence digests only.
- Behavior: `parity-preserved` for the style data; no runtime scoring behavior exists in the new architecture yet.
- Gates for completion, with the schema policy for batch `3A` added in Task 8: `batch3a-legacy-parity`, `batch3a-local-verify`, `batch3a-remote-ci`. Sequence: `in-progress`, then `in-review` after local evidence, then `migration:ledger:record-ci` to `complete`, then regenerate `docs/migration/ledger.md`.

## 12. Decisions requested (revised)

Each item states the recommendation; nothing is settled until approved.

1. **Decision 1, compact deterministic expansion.** Approve the compact style definition expanded by the compiler, **subject to exact structural parity** (section 3.2 and 7.2) and to the proof that equality across each style's three core types holds in the frozen data (section 1.3).
2. **Decision 2, numeric fields.** `legacyPoints`, `legacyMinMatches` and `legacyPenalty` remain **opaque metadata only**; the numeric bounds are legacy data-sanity checks with no scoring meaning; budgets deferred to 3B.
3. **Decision 3, match sets.** `exact`, `adjacent` and `partial` remain typed reference data with no ratios; only present tiers are emitted.
4. **Decision 4, localization.** Localization **remains deferred** to Batch 5B, but the **full zh-TW, English and Japanese evidence is preserved**: 18 + 18 + 18 style records, 25 zh-TW rule labels with 25 English and 25 Japanese reason translations via an explicit label-to-ID mapping, plus core, variant and taxonomy copy and accent digests (section 7.3). No localization behavior is migrated.
5. **Decision 5, accent.** `accent` remains deferred to Batch 5B with a recorded digest.
6. **Decision 6, ordering.** Both **style priority and intensity (core) priority are explicit, unique and seeded from legacy order** (section 3.1); neither is a scoring formula and the tie policy is Batch 3B.
7. **Decision 7, bundle mode.** `styles-production` remains the production bundle mode, with synthetic-data isolation (section 5.5).
8. **Decision 8, concept kinds.** `core-type`, `noodle-variant` (derived IDs), `style-rule`, the intensity taxonomy concepts and manifest `derivedIds` are specified in sections 5.1 and 5.6; message IDs follow section 3.3.
9. **Decision 9, composite IDs.** Remain governed by the dedicated contract in section 5.2.
10. **Decision 10, `exclusionTags`.** Remain data only; no evaluation in 3A.
11. **Decision 11, importer.** The one-time importer is allowed **only as a migration aid**; independent parity evidence never depends on it (section 7.1).
12. **Decision 12, diagnostics.** Approve the six codes of section 6 (five of the earlier proposal with `STYLE_PRIORITY_DUPLICATE` generalized to `PRIORITY_DUPLICATE`, plus `STYLE_BODY_RULE_INCOMPLETE`) and the reuse of `REFERENCE_UNKNOWN` for unknown and non-referencable condition questions and extra `bodyByIntensity` keys. None assigns scoring semantics.

No implementation blocker is currently identified; the plan needs no change to Batch 2A or 2B code.

## 13. Approval checklist

- [ ] Scope and out-of-scope list approved
- [ ] Decision 1: compact expansion with exact structural parity
- [ ] Decision 2: numeric fields as opaque `legacy*` metadata, budgets deferred
- [ ] Decision 3: match sets as typed data without ratios
- [ ] Decision 4: localization deferred with full zh-TW, en and ja evidence preserved
- [ ] Decision 5: accent deferred to Batch 5B
- [ ] Decision 6: explicit unique style priority and intensity priority
- [ ] Decision 7: bundle mode `styles-production` with synthetic isolation
- [ ] Decision 8: concept kinds, `derivedIds` and message ID derivation
- [ ] Decision 9: composite ID contract
- [ ] Decision 10: `exclusionTags` as data only
- [ ] Decision 11: importer as migration aid only, independent parity
- [ ] Decision 12: diagnostic codes
- [ ] Final implementation approval of this written plan by the user

## 14. Review disposition (independent review of `33a7c4d`)

| Finding | Correction | Where |
| --- | --- | --- |
| 1 Localization audit false, copy evidence incomplete | Re-audited; documented `styleTranslations` loading, 18 en + 18 ja style entries and 25 en + 25 ja label-keyed reason translations; evidence fixture covers all of them with an explicit label-to-ID mapping; Decision 4 revised | 1.4, 7.3, 12 |
| 2 No explicit core priority | Intensity taxonomy `priority` (clean 0, standard 1, heavy 2) exposed on compiled core types; style priority documented; neither is a scoring formula; `PRIORITY_DUPLICATE` covers both | 3, 3.1, 5.4, 6 |
| 3 Wrong `coreTypes[0]` statement | Removed; bonuses and conflicts are per core type in legacy (`scorer.ts:203`); compaction is lossless only because equality is proven; 3B hand-off corrected | 1.3, 3, 10 |
| 4 Scored-question ownership | One owner, `styleReferenceQuestionIds`; not derived from `legacyWeight`; zero weight never used; unknown or non-referencable question is `REFERENCE_UNKNOWN` | 5.3, 5.4 |
| 5 Absent versus empty | Exact presence rules and key-presence-aware comparator; explicit `[]` preserved for 36 `conflicts` and 3 `ingredients`; no synthesized tiers | 1.2, 3.2, 7.2 |
| 6 Circular parity | Independent AST-based legacy reader, no production importer, compiler or composite-ID imports, shared-bug test, import-scan test | 7.1, 7.4 |
| 7 `derivedIds` and message IDs | Manifest `derivedIds`, index column, taxonomy rows, derivation table with intentionally shared variant message IDs, uniqueness only where required | 3.3, 5.1, 5.6 |
| 8 Synthetic data at production entrypoints | Public export removed, `./testing` subpath, ESLint and scan guards, production bundle checks | 5.5 |
| 9 `match.form.exact == [family]` | Recorded as a verified data fact only, tested by the reader, not a model invariant | 1.2, 7.4 |
| 10 Body completeness diagnostics | Missing key `STYLE_BODY_RULE_INCOMPLETE`, extra key `REFERENCE_UNKNOWN`, keys driven by taxonomy data | 5.4, 6 |
