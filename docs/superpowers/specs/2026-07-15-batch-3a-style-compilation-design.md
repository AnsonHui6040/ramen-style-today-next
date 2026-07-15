# Batch 3A Style Compilation Design

**Status:** Draft for independent review and written user approval

**Date:** 2026-07-15

**Repository:** `AnsonHui6040/ramen-style-today-next`

**Base:** `6fba4c0dc384d3cfa27b627db6ae373f56c8b6d4` (`Accept Batch 2B persistence contracts`)

## 1. Objective

Batch 3A replaces the synthetic style inventory with one compact, typed,
canonical definition per legacy display style. A deterministic compiler expands
those definitions into immutable style, intensity-core, noodle-subtype, matching
rule, adjustment, and inventory contracts.

The batch proves, against the fixed legacy baseline:

- all 18 display styles, 54 cores, and 270 subtypes are represented;
- style, core, and subtype IDs and parent relationships match legacy;
- compiled rule targets and tiers match legacy;
- adjustment operands and exclusion-tag inventory match legacy;
- all behavior-relevant legacy source ordering has an explicit priority;
- repeated compilation and generated artifacts are deterministic; and
- reordering source files or object keys does not change semantic output.

Batch 3A does not accept answers or produce recommendations. Its independently
useful deliverable is a frozen, public style model that Batch 3B and Batch 3C can
consume without importing definitions, compiler code, legacy JSON, or web code.

## 2. Non-goals

Batch 3A does not implement or claim parity for:

- the user-answer scoring loop;
- tier-to-ratio arithmetic, question weighting, rounding, or total points;
- bonus or penalty application and caps;
- core collapse, style ranking, result limits, or tie resolution at runtime;
- confidence, low-confidence thresholds, or explanation assembly;
- exclusion evaluation, blocking, blocked-lead selection, or allergy claims;
- React, browser state, local storage, autosave, quarantine, or persistence I/O;
- catalog or Finder adapters;
- localization dictionaries or rendering;
- production cutover.

Batch 2A question and flow semantics and Batch 2B persistence semantics are
protected. A failure in a protected contract stops Batch 3A instead of being
repaired inside this batch.

## 3. Legacy baseline and trust boundary

The only legacy truth source for this batch is:

```text
repository  AnsonHui6040/ramen-style-today
commit      eebf00b7ddfbbe6f01ff598e57f1e17197068a37
tree        3e527de876cfeccfd3154ddc492830d71c4cfd9a
```

The audit covered at least:

- `src/data/styles.json`
- `src/lib/scoring/scorer.ts`
- `src/lib/scoring/explainer.ts`
- `src/domain/schema.ts`
- `src/domain/types.ts`
- `src/data/questions.json`
- `src/config/styles.ts`
- catalog, results, map, localization, and style validation consumers

The SHA-256 of the fixed `src/data/styles.json` bytes is
`207293e50bae4c9459d5506b445f50a798a58439ba52c54e710b3d10ff7d09d3`.
The file alone is not a sufficient truth boundary: the scorer proves which
arrays affect behavior, which defaults execute, and which repeated fields are
actually consumed.

The proven inventory is:

| Entity | Count | Proven shape |
| --- | ---: | --- |
| Display style | 18 | Explicit legacy ID and source order |
| Intensity core | 54 | Three per style: `clean`, `standard`, `heavy` |
| Noodle subtype | 270 | Five per core in the fixed noodle taxonomy |
| Core matching rule | 378 | Seven per core |
| Unique bonus | 18 | Repeated identically over three cores |
| Unique conflict | 7 | Repeated identically over three cores |

All 18 styles have the full three-by-five matrix. There are no duplicate
style/core/subtype IDs, orphan parents, missing noodle mappings, generated-ID
pattern deviations, missing core rules, or tier overlaps.

The observed implicit semantics are part of the migration evidence:

- style array order breaks equal display-style scores;
- core array order chooses the first equal-scoring core;
- a missing noodle match falls back to the first subtype;
- the scorer reads the currently scored core's bonus copy after wrapping that
  core as `coreTypes[0]`; the three source copies are identical;
- adjustment source order is retained conservatively for deterministic future
  trace/application order, although the fixed data has one bonus per core and
  no pair of conflicts that can be active together, so current outcomes do not
  expose an adjustment-order difference;
- rule questions execute in fixed `scoredQuestionIds` order;
- tier target arrays are membership sets, not priority lists.

The compiler removes source-position dependence and runtime fallback by
requiring complete declared matrices and explicit priorities. Batch 3B will use
those priorities when it implements runtime ordering; Batch 3A only proves the
data needed to do so.

Frozen observations are evidence, not a new canonical source. Ordinary CI reads
committed observations. Only the shared authoring transaction may recreate them
from the exact commit and tree.

## 4. Canonical style definition

Each display style owns one file under
`packages/classification-core/src/definitions/styles/`, named by stable style
ID. The file exports one `StyleDefinition` and contains no complete core or
subtype copies.

The source contract is:

```ts
type StyleId = string
type StyleFamilyId = 'soup' | 'tsukemen' | 'dry'
type IntensityId = 'clean' | 'standard' | 'heavy'
type NoodleId =
  | 'thin-straight'
  | 'medium-thin-straight'
  | 'medium-thick-straight'
  | 'medium-thick-wavy'
  | 'extra-thick'
type ExclusionTagId =
  | 'pork'
  | 'chicken'
  | 'duck'
  | 'fish-seafood'
  | 'shellfish'
  | 'dairy'
type MatchTier = 'exact' | 'adjacent' | 'partial'
type CoreId = `${StyleId}:${IntensityId}`
type SubtypeId = `${CoreId}:${NoodleId}`
type RuleId = `${CoreId}:${string}`

interface StyleRuleTierDefinition {
  readonly tier: MatchTier
  readonly optionIds: readonly string[]
}

interface StyleRuleDefinition {
  readonly questionId: string
  readonly tiers: readonly StyleRuleTierDefinition[]
}

interface AdjustmentConditionDefinition {
  readonly priority: number
  readonly questionId: string
  readonly optionIds: readonly string[]
}

interface BonusDefinition {
  readonly id: string
  readonly priority: number
  readonly labelMessageId: string
  readonly points: number
  readonly minMatches: number
  readonly conditions: readonly AdjustmentConditionDefinition[]
}

interface ConflictDefinition {
  readonly id: string
  readonly priority: number
  readonly labelMessageId: string
  readonly penalty: number
  readonly whenAll: readonly AdjustmentConditionDefinition[]
}

interface IntensityOverrideDefinition {
  readonly rules: readonly StyleRuleDefinition[]
}

interface StyleTaxonomyDefinition {
  readonly sourceFile: string
  readonly families: readonly {
    readonly id: StyleFamilyId
    readonly priority: number
    readonly formOptionId: string
  }[]
  readonly intensities: readonly {
    readonly id: IntensityId
    readonly priority: number
    readonly labelMessageId: string
    readonly summaryMessageId: string
    readonly bodyRule: StyleRuleDefinition
  }[]
  readonly noodles: readonly {
    readonly id: NoodleId
    readonly priority: number
    readonly labelMessageId: string
    readonly summaryMessageId: string
  }[]
  readonly exclusionTags: readonly {
    readonly id: ExclusionTagId
    readonly priority: number
    readonly exclusionsOptionId: string
  }[]
  readonly ruleQuestions: readonly {
    readonly questionId: string
    readonly priority: number
    readonly source: 'style-base' | 'intensity-profile'
  }[]
}

interface StyleDefinition {
  readonly sourceFile: string
  readonly id: string
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly messageIds: {
    readonly label: string
    readonly summary: string
  }
  readonly accent: string
  readonly supportedIntensityIds: readonly IntensityId[]
  readonly supportedNoodleIds: readonly NoodleId[]
  readonly baseRules: readonly StyleRuleDefinition[]
  readonly intensityOverrides?: Readonly<
    Partial<Record<IntensityId, IntensityOverrideDefinition>>
  >
  readonly bonuses: readonly BonusDefinition[]
  readonly conflicts: readonly ConflictDefinition[]
  readonly exclusionTags: readonly ExclusionTagId[]
}
```

`sourceFile` is repository-relative POSIX provenance and is never an identity.
`accent` is preserved as canonical, non-localized display metadata because it is
consumed by the legacy result UI; Batch 3A does not render it. Labels, summaries,
and adjustment reasons are represented only by stable message IDs.

The shared style taxonomy is hand-authored once. It defines:

- family records with explicit priorities and required `form` option ownership;
- intensity records with explicit priorities, message templates, and the common
  body-rule profile;
- noodle records with explicit priorities and message templates;
- exclusion-tag records with explicit priorities and a same-token mapping to
  the accepted Batch 2A `exclusions` options, excluding `none`;
- the six required base-rule questions with explicit priorities; and
- the seventh compiled question, `body`, supplied by the intensity profile.

`ExclusionTagId` is a closed style-domain type even though its current tokens map
one-to-one to Batch 2A option IDs. The compiler proves every mapping against the
bound question model. This mapping supplies validation ownership only; it does
not evaluate eligibility.

The closed style-tag domain has exactly six legacy-owned tags: `pork`,
`chicken`, `duck`, `fish-seafood`, `shellfish`, and `dairy`. Batch 2A also lets
users select `beef` and `shrimp-crab`, but no fixed legacy style owns either tag.
Those answer-option IDs are therefore not fabricated as style tags. Batch 3C
will evaluate the six compiled style tags against the wider answer domain.

Every declared priority is a nonnegative safe integer. Display priorities are
unique globally. Taxonomy priorities are unique within their taxonomy.
Adjustment priorities are unique within one style and adjustment kind; bonus
and conflict are separate fixed phases. Condition priorities are unique within
one adjustment. `points` and `penalty` are positive finite numbers.
`minMatches` is a positive safe integer and must satisfy
`1 <= minMatches <= conditions.length`.

Every current style uses the common body profiles and therefore has no
style-specific override. The optional override contract remains necessary to
represent a proven future or legacy exception without copying whole cores.

Individual bonus points, penalty points, `minMatches`, and conditions stay with
the style because the approved architecture assigns explicit bonuses and
conflicts to style definitions. Global caps and evaluation arithmetic do not.

## 5. Generated core model

The complete public source-to-model graph is:

```ts
interface StyleDefinitionBundleSource {
  readonly sourceFile: string
  readonly modelVersion: string
  readonly taxonomy: StyleTaxonomyDefinition
  readonly definitions: readonly StyleDefinition[]
}

interface StyleSourceReference {
  readonly sourceFile: string
  readonly path: string
}

interface StyleRuleProvenance extends StyleSourceReference {
  readonly inheritedFrom:
    | 'style-base'
    | 'intensity-profile'
    | 'style-intensity-override'
}

interface CompiledAdjustmentCondition {
  readonly priority: number
  readonly questionId: string
  readonly optionIds: readonly string[]
  readonly provenance: StyleSourceReference
}

interface CompiledBonus {
  readonly kind: 'bonus'
  readonly id: string
  readonly priority: number
  readonly labelMessageId: string
  readonly points: number
  readonly minMatches: number
  readonly conditions: readonly CompiledAdjustmentCondition[]
  readonly appliesToCoreIds: readonly CoreId[]
  readonly provenance: StyleSourceReference
}

interface CompiledConflict {
  readonly kind: 'conflict'
  readonly id: string
  readonly priority: number
  readonly labelMessageId: string
  readonly penalty: number
  readonly whenAll: readonly CompiledAdjustmentCondition[]
  readonly appliesToCoreIds: readonly CoreId[]
  readonly provenance: StyleSourceReference
}

type CompiledAdjustment = CompiledBonus | CompiledConflict

interface CompiledStyle {
  readonly id: StyleId
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly messageIds: {
    readonly label: string
    readonly summary: string
  }
  readonly accent: string
  readonly supportedIntensityIds: readonly IntensityId[]
  readonly supportedNoodleIds: readonly NoodleId[]
  readonly cores: readonly CompiledCore[]
  readonly adjustments: readonly CompiledAdjustment[]
  readonly exclusionTags: readonly ExclusionTagId[]
  readonly provenance: StyleSourceReference
}

interface CompiledStyleModelMetadata {
  readonly schemaVersion: '1'
  readonly compilerVersion: '1'
  readonly modelVersion: string
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly sourceHash: string
  readonly semanticHash: string
  readonly dataVersion: string
}

interface CompiledExclusionTag {
  readonly id: ExclusionTagId
  readonly priority: number
  readonly questionId: 'exclusions'
  readonly optionId: string
  readonly provenance: StyleSourceReference
}

type CompiledStyleInventoryRecord =
  | {
      readonly key: `style/${StyleId}`
      readonly kind: 'style'
      readonly id: StyleId
      readonly sourceFile: string
      readonly messageIds: readonly string[]
    }
  | {
      readonly key: `intensity/${CoreId}`
      readonly kind: 'intensity'
      readonly id: CoreId
      readonly sourceFile: string
      readonly messageIds: readonly string[]
    }
  | {
      readonly key: `noodle/${SubtypeId}`
      readonly kind: 'noodle'
      readonly id: SubtypeId
      readonly sourceFile: string
      readonly messageIds: readonly string[]
    }

interface CompiledStyleModel {
  readonly metadata: CompiledStyleModelMetadata
  readonly exclusionTags: readonly CompiledExclusionTag[]
  readonly styles: readonly CompiledStyle[]
  readonly inventory: readonly CompiledStyleInventoryRecord[]
}

interface ResolvedStyleCoreRule {
  readonly questionId: string
  readonly tiers: readonly StyleRuleTierDefinition[]
  readonly provenance: StyleRuleProvenance
}

interface StyleCoreStageCore {
  readonly id: CoreId
  readonly parentStyleId: StyleId
  readonly intensityId: IntensityId
  readonly priority: number
  readonly messageIds: {
    readonly labelTemplate: string
    readonly summaryTemplate: string
  }
  readonly resolvedRules: readonly ResolvedStyleCoreRule[]
  readonly provenance: readonly StyleSourceReference[]
}

interface StyleCoreStageStyle {
  readonly id: StyleId
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly messageIds: {
    readonly label: string
    readonly summary: string
  }
  readonly accent: string
  readonly supportedIntensityIds: readonly IntensityId[]
  readonly supportedNoodleIds: readonly NoodleId[]
  readonly cores: readonly StyleCoreStageCore[]
  readonly exclusionTags: readonly ExclusionTagId[]
  readonly provenance: StyleSourceReference
}

interface StyleCoreStage {
  readonly kind: 'style-core-stage'
  readonly modelVersion: string
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly styles: readonly StyleCoreStageStyle[]
}

type CompileStyleCoresResult =
  | {
      readonly ok: true
      readonly coreStage: StyleCoreStage
      readonly diagnostics: readonly Diagnostic[]
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly Diagnostic[]
    }

interface StyleSubtypeStageCore {
  readonly id: CoreId
  readonly parentStyleId: StyleId
  readonly intensityId: IntensityId
  readonly priority: number
  readonly messageIds: {
    readonly labelTemplate: string
    readonly summaryTemplate: string
  }
  readonly resolvedRules: readonly ResolvedStyleCoreRule[]
  readonly subtypes: readonly CompiledSubtype[]
  readonly provenance: readonly StyleSourceReference[]
}

interface StyleSubtypeStageStyle {
  readonly id: StyleId
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly messageIds: {
    readonly label: string
    readonly summary: string
  }
  readonly accent: string
  readonly supportedIntensityIds: readonly IntensityId[]
  readonly supportedNoodleIds: readonly NoodleId[]
  readonly cores: readonly StyleSubtypeStageCore[]
  readonly exclusionTags: readonly ExclusionTagId[]
  readonly provenance: StyleSourceReference
}

interface StyleSubtypeStage {
  readonly kind: 'style-subtype-stage'
  readonly modelVersion: string
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly styles: readonly StyleSubtypeStageStyle[]
}

type CompileStyleSubtypesResult =
  | {
      readonly ok: true
      readonly subtypeStage: StyleSubtypeStage
      readonly diagnostics: readonly Diagnostic[]
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly Diagnostic[]
    }

interface StyleRulesStageCore {
  readonly id: CoreId
  readonly parentStyleId: StyleId
  readonly intensityId: IntensityId
  readonly priority: number
  readonly messageIds: {
    readonly labelTemplate: string
    readonly summaryTemplate: string
  }
  readonly rules: readonly CompiledStyleRule[]
  readonly subtypes: readonly CompiledSubtype[]
  readonly provenance: readonly StyleSourceReference[]
}

interface StyleRulesStageStyle {
  readonly id: StyleId
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly messageIds: {
    readonly label: string
    readonly summary: string
  }
  readonly accent: string
  readonly supportedIntensityIds: readonly IntensityId[]
  readonly supportedNoodleIds: readonly NoodleId[]
  readonly cores: readonly StyleRulesStageCore[]
  readonly adjustments: readonly CompiledAdjustment[]
  readonly exclusionTags: readonly ExclusionTagId[]
  readonly provenance: StyleSourceReference
}

interface StyleRulesStage {
  readonly kind: 'style-rules-stage'
  readonly modelVersion: string
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly exclusionTags: readonly CompiledExclusionTag[]
  readonly styles: readonly StyleRulesStageStyle[]
}

type CompileStyleRulesResult =
  | {
      readonly ok: true
      readonly rulesStage: StyleRulesStage
      readonly diagnostics: readonly Diagnostic[]
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly Diagnostic[]
    }

type CompileStylesResult =
  | {
      readonly ok: true
      readonly model: CompiledStyleModel
      readonly diagnostics: readonly Diagnostic[]
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly Diagnostic[]
    }

function compileStyles(
  input: unknown,
  questionModel: CompiledQuestionModel,
  sourceFile: string,
): CompileStyleCoresResult // Task 6 transaction boundary
```

`StyleCoreStage` is the explicit compiler-internal transaction boundary for
Task 6. Its successful payload is named `coreStage`, never `model`, and contains
only canonical style/core identity, resolved inert source rules, provenance, and
the trusted question-model binding identity. It has no subtype collection,
compiled rule targets, adjustments, exclusion-tag model, inventory, style
source/semantic/data hash, or placeholder for any of those final values.
`ResolvedStyleCoreRule` preserves the selected whole source rule plus provenance
so body-profile inheritance and whole-rule replacement are observable without
performing Task 8 target expansion.

The staged return type changes only at reviewed task boundaries:

```text
Task 6  CompileStyleCoresResult     -> coreStage
Task 7  CompileStyleSubtypesResult  -> subtypeStage
Task 8  CompileStyleRulesResult     -> rulesStage
Task 9  CompileStylesResult         -> model
```

`StyleSubtypeStage` adds generated subtypes while preserving resolved inert
rules. `StyleRulesStage` replaces those resolved rules with final compiled rules
and adds normalized adjustments and bound exclusion tags. Neither stage has
optional future fields, an inventory, style hashes, or final-model metadata.
Task 9 is the only task that converts the complete staged data to
`CompiledStyleModel`. All three staged result families and their supporting
types remain direct internal contract imports and are not re-exported from the
compiler entrypoint, runtime root, or generated subpath.

The style definition bundle owns `modelVersion: batch3a.1.0`. The second input
is a successfully compiled, trusted question model. Its model version and
semantic hash are copied into style metadata and both semantic/data identity
projections. Pairing a style artifact with a question model whose model version
or semantic hash differs from those two stored fields fails a
generated-artifact/integration test rather than silently reusing target
ownership or option priority. A question source-hash-only change is not a style
identity mismatch; it changes the enclosing classification data identity as
defined in section 9.

The required `sourceFile` argument is the repository-relative fallback for root
or malformed bundle diagnostics, parallel to `compileClassification(input,
sourceFile)`. A valid bundle and taxonomy also carry their own repository paths;
each focused style carries its style-file path. Taxonomy-derived provenance uses
the taxonomy file and a JSON Pointer into the canonically sorted taxonomy;
style-derived provenance uses the focused style file and a pointer into the
canonically sorted style definition. Structural errors that prevent reading an
embedded path use the required fallback. No malformed input can produce an
empty or absolute diagnostic source.

The existing compiler-only source API is deliberately migrated as follows:

- `DefinitionBundleSource.styles` changes from the synthetic style array to
  `StyleDefinitionBundleSource`;
- `classificationDefinition.styles` supplies the production style bundle while
  the top-level and style-bundle model versions must agree;
- `compileClassification` compiles questions first, passes that exact compiled
  question model to `compileStyles`, and returns failure if either compilation
  fails;
- `ClassificationModel` replaces its raw `styles` source field with
  `styleModel: CompiledStyleModel`, while its top-level inventory contains the
  style model's inventory plus question/option/policy records; and
- the old synthetic style source shape is retired rather than accepted as a
  second ambiguous production input.

This is an intentional compiler-entrypoint source-contract replacement. The
runtime root change remains additive and existing question, flow, and
persistence values/types do not change.

The source-to-compiled mapping is exact:

| Source | Compiled owner |
| --- | --- |
| `id`, `family`, `displayPriority`, `messageIds`, `accent` | same fields on `CompiledStyle` |
| supported intensity/noodle membership | canonical ID arrays plus generated `cores`/`subtypes` |
| base and override rules | one merged `CompiledStyleRule` per core/question |
| bonus | `CompiledBonus` with unchanged ID, priority, message ID, points, threshold, and conditions |
| conflict | `CompiledConflict` with unchanged ID, priority, message ID, penalty, and conditions |
| repeated legacy core adjustment copies | one compiled adjustment plus all ordered `appliesToCoreIds` |
| `exclusionTags` | same closed tag IDs on `CompiledStyle` |
| closed taxonomy exclusion tags | ordered `CompiledStyleModel.exclusionTags` with bound question/option IDs |
| `sourceFile` and JSON Pointer | provenance only; excluded from identity hashes |

For every declared supported intensity, the compiler creates one
`CompiledCore`:

```ts
interface CompiledCore {
  readonly id: CoreId
  readonly parentStyleId: StyleId
  readonly intensityId: IntensityId
  readonly priority: number
  readonly messageIds: {
    readonly labelTemplate: string
    readonly summaryTemplate: string
  }
  readonly rules: readonly CompiledStyleRule[]
  readonly subtypes: readonly CompiledSubtype[]
  readonly provenance: readonly StyleSourceReference[]
}
```

Core priority comes from the global intensity taxonomy: `clean = 0`,
`standard = 1`, `heavy = 2`. It is not inferred from the style file's array
position. There is no core weight field: legacy question weights belong to the
scoring policy boundary.

Rule merge order is explicit:

1. copy the six style base rules;
2. add the global intensity `body` rule;
3. replace a whole rule only when an explicit style/intensity override exists;
4. validate that the seven-rule set is exact, unique, and reference-valid.

The compiler does not attach three copies of bonuses or conflicts to cores.
`CompiledStyle` owns one normalized adjustment set and records the ordered core
IDs to which Batch 3B will apply it. This is lossless because the frozen legacy
baseline proves all three core copies are identical for every style.

## 6. Generated subtype model

For every declared core/noodle combination, the compiler creates one
`CompiledSubtype`:

```ts
interface CompiledSubtype {
  readonly id: SubtypeId
  readonly parentStyleId: StyleId
  readonly parentCoreId: CoreId
  readonly noodleId: NoodleId
  readonly priority: number
  readonly messageIds: {
    readonly labelTemplate: string
    readonly summaryTemplate: string
  }
  readonly provenance: readonly StyleSourceReference[]
}
```

Subtype priority comes from the global noodle taxonomy:

```text
0 thin-straight
1 medium-thin-straight
2 medium-thick-straight
3 medium-thick-wavy
4 extra-thick
```

Generated copy uses the parent style/core plus stable intensity/noodle message
templates. It does not copy legacy Chinese sentences into 270 records. A
declared supported noodle that is not generated, or a generated noodle not
declared by the style, is an inventory error. Runtime fallback is forbidden.

## 7. Stable ID derivation

ID derivation is fixed:

```text
StyleId   = explicit stable kebab-case legacy style ID
CoreId    = `${StyleId}:${IntensityId}`
SubtypeId = `${CoreId}:${NoodleId}`
RuleId    = `${CoreId}:${QuestionId}`
```

Adjustment IDs remain the explicit legacy IDs. They are globally unique across
both bonus and conflict namespaces.

Generated IDs depend only on stable domain IDs. They never depend on locale,
copy, source-file path, source array index, object insertion order, timestamp,
machine path, or hash iteration order.

Before model creation, semantic proof checks:

- global style, core, subtype, rule, and adjustment uniqueness;
- exact parent-child reconstruction from each ID;
- declared-versus-generated matrix equality;
- supported taxonomy membership;
- no missing or extra combination; and
- legacy ID parity through frozen fixtures.

No successful model is returned after an ID collision or parent mismatch.
Task 6 checks source-triggerable core collisions and exact per-style declared
versus generated intensity membership. Because core IDs and parents are both
derived internally from the same style ID, Task 6 does not add a test seam for
an impossible source-level parent mutation. Task 9 owns global parent
reconstruction, `STYLE_PARENT_MISMATCH`, and proof that the complete canonical
inventory contains exactly all 18 styles.

## 8. Rule compilation

The compiled rule contract is:

```ts
interface CompiledRuleTarget {
  readonly optionId: string
  readonly tier: 'exact' | 'adjacent' | 'partial'
  readonly priority: number
}

interface CompiledStyleRule {
  readonly id: RuleId
  readonly parentStyleId: StyleId
  readonly parentCoreId: CoreId
  readonly questionId: string
  readonly priority: number
  readonly targets: readonly CompiledRuleTarget[]
  readonly fallbackTier: 'miss'
  readonly provenance: StyleRuleProvenance
}
```

Rule priority comes from the canonical style-rule question order. Target
priority comes from the referenced question's compiled option order. Input tier
and option arrays are treated as unordered declarations and canonicalized.

The compiler validates every question and option against the accepted Batch 2A
question model. It rejects an unknown question, unknown option, wrong option
owner, duplicate target, target appearing in multiple tiers, empty rule, or
missing required question. It never changes or regenerates the question model.

`miss` is explicit compiled fallback metadata; it is not hand-authored and does
not carry a numeric ratio in Batch 3A. `exact`, `adjacent`, and `partial` are the
canonical values Batch 3B will map through the central scoring policy. The
legacy observation records the ratios `1`, `0.6`, `0.4`, and `0`, but Batch 3A
does not claim that policy as migrated or execute it.

Bonuses and conflicts are compiled into immutable adjustment operands with
stable IDs, explicit priorities, canonical ordered conditions, message IDs, and
source provenance. Batch 3A validates positive finite operands and condition
references plus the exact `minMatches` cardinality contract, but does not apply,
cap, round, or explain them. The compiled adjustment array has fixed phase order
`bonus` then `conflict`; explicit priority is unique only within the style and
kind. This preserves the two legacy loops without pretending cross-kind source
order has meaning.

## 9. Deterministic ordering

The successful output order is independent of input file order:

| Collection | Canonical order |
| --- | --- |
| Every taxonomy collection | explicit taxonomy priority, then stable ID |
| Compiled global exclusion tags | exclusion-tag taxonomy priority, then tag ID |
| Styles | `displayPriority`, then stable ID |
| `supportedIntensityIds` | intensity taxonomy priority, then intensity ID |
| `supportedNoodleIds` | noodle taxonomy priority, then noodle ID |
| Cores | intensity taxonomy priority, then core ID |
| Subtypes | noodle taxonomy priority, then subtype ID |
| Rules | question priority, then rule ID |
| Source tier declarations | fixed `exact`, `adjacent`, `partial` tier order |
| Adjustments | fixed kind phase (`bonus`, `conflict`), explicit priority, then adjustment ID |
| `appliesToCoreIds` | core priority, then core ID |
| Conditions | explicit priority, then canonical condition identity |
| Condition `optionIds` | bound question option priority, then option ID |
| Targets | compiled option priority, then option ID |
| Exclusion tags | exclusion-tag taxonomy priority, then tag ID |
| Provenance arrays | source file, JSON Pointer, then inheritance kind by Unicode code point |
| Inventory message IDs | Unicode code point |
| Inventory | concept key by Unicode code point |

Duplicate behavior-relevant priority is an error. The stable-ID secondary key
keeps diagnostics deterministic; it does not make an ambiguous definition
successful.

The canonical condition identity is the stable tuple of `questionId` and its
already-canonical `optionIds`. The provenance identity is the stable tuple of
`sourceFile`, `path`, and optional `inheritedFrom`. Taxonomy records carry
explicit numeric priorities; no taxonomy priority is derived from array index.

Object keys are serialized with the existing stable JSON convention. Every
array-valued source and output field is covered by the table before hashing. The
following must be proved by tests:

- repeated compilation is byte-identical;
- reversing or shuffling style source files is byte-identical;
- reversing declarative tier/target arrays is semantically identical;
- object key insertion order is irrelevant;
- source mutation after compilation cannot mutate the model;
- generated output contains no timestamp or absolute path; and
- diagnostic aggregation and sorting are deterministic.

Hash inputs are exact canonical projections, each encoded with `stableJson` and
SHA-256:

```text
style sourceHash = sha256({
  modelVersion,
  taxonomy: canonical taxonomy including priorities, rule profiles and message IDs,
  definitions: canonical StyleDefinition values,
  with every sourceFile recursively removed from the whole projection,
})

style semanticHash = sha256({
  modelVersion,
  questionModelVersion,
  questionSemanticHash,
  exclusionTags: compiled IDs, priorities and bound question/option IDs,
  styles: each compiled style projected to
    id, family, displayPriority, supported IDs,
    core/subtype IDs, parents and priorities,
    rule IDs/questions/priorities/targets/tiers/fallback,
    adjustment kinds/IDs/priorities/operands/conditions/appliesToCoreIds,
    exclusionTags,
})

style dataVersion = sha256({
  modelVersion,
  questionModelVersion,
  questionSemanticHash,
  exclusionTags: full compiled global tags with provenance removed,
  styles: the full compiled public style data with every provenance field removed,
  inventory: keys, kinds, IDs and message IDs with sourceFile removed,
})

classification dataVersion = sha256({
  modelVersion,
  questionModel: { modelVersion, sourceHash, semanticHash },
  styleModel: { modelVersion, semanticHash, dataVersion },
  scoringPolicy: canonical current policy values with sourceFile removed,
})
```

Message IDs, message-template IDs, and accent participate in `sourceHash` and
`dataVersion`, but not `semanticHash`. Family, priorities, rule tiers/targets,
adjustment operands, and exclusion tags participate in all applicable semantic
and data projections. Actual localized message text is outside Batch 3A and
participates in none of these hashes. Repository-relative provenance, including
`sourceFile` and JSON Pointer, participates in no identity hash.

Metadata hash fields and the top-level inventory are never inputs to themselves;
the projections above are built before metadata assembly. The source hash uses
canonical source values, the semantic hash uses compiled behavior-bearing
values, and the data version uses the full provenance-free compiled artifact.
Regression tests prove that a question message-ID-only change changes question
`sourceHash` and classification `dataVersion` while leaving question
`semanticHash` and style `semanticHash` unchanged.

## 10. Validation and diagnostics

Structural parsing remains Zod-based and returns `STRUCTURE_INVALID`. Expected
semantic definition failures return registered diagnostics; they do not use
generic throws.

Batch 3A retains the existing `STYLE_DUPLICATE_ID` and registers:

```text
STYLE_FAMILY_UNKNOWN
STYLE_FAMILY_MISMATCH
STYLE_MODEL_VERSION_MISMATCH
STYLE_DISPLAY_PRIORITY_DUPLICATE
STYLE_INTENSITY_EMPTY
STYLE_INTENSITY_UNKNOWN
STYLE_INTENSITY_DUPLICATE
STYLE_NOODLE_EMPTY
STYLE_NOODLE_UNKNOWN
STYLE_NOODLE_DUPLICATE
STYLE_RULE_DUPLICATE_ID
STYLE_RULE_MISSING
STYLE_RULE_EMPTY
STYLE_RULE_QUESTION_UNKNOWN
STYLE_RULE_OPTION_UNKNOWN
STYLE_RULE_OPTION_WRONG_OWNER
STYLE_RULE_OPTION_DUPLICATE
STYLE_RULE_TIER_OVERLAP
STYLE_ADJUSTMENT_DUPLICATE_ID
STYLE_ADJUSTMENT_PRIORITY_DUPLICATE
STYLE_ADJUSTMENT_CONDITION_EMPTY
STYLE_ADJUSTMENT_CONDITION_PRIORITY_DUPLICATE
STYLE_ADJUSTMENT_QUESTION_UNKNOWN
STYLE_ADJUSTMENT_OPTION_UNKNOWN
STYLE_ADJUSTMENT_OPTION_WRONG_OWNER
STYLE_ADJUSTMENT_OPTION_DUPLICATE
STYLE_ADJUSTMENT_VALUE_INVALID
STYLE_EXCLUSION_TAG_UNKNOWN
STYLE_EXCLUSION_TAG_DUPLICATE
STYLE_EXCLUSION_TAG_MISMATCH
STYLE_CORE_ID_COLLISION
STYLE_SUBTYPE_ID_COLLISION
STYLE_PARENT_MISMATCH
STYLE_PRIORITY_DUPLICATE
STYLE_INVENTORY_MISMATCH
```

An invalid tier enum is structural and therefore uses `STRUCTURE_INVALID` rather
than a redundant style code. Fixture schema/coverage failures and observed
projection differences continue to use the existing `PARITY_*` codes.

`STYLE_FAMILY_MISMATCH` requires the `family` to agree with the style's `form`
rule. `STYLE_PRIORITY_DUPLICATE` is reserved for shared taxonomy priorities;
style and adjustment priorities use their more specific codes.
`STYLE_EXCLUSION_TAG_MISMATCH` covers a known tag whose declared Batch 2A option
mapping is not the required same token; it has a focused mutation test.

Every diagnostic includes registered code, repository-relative source file,
RFC 6901 path, bounded entity ID/message, and expected/received details where
useful. Batch 3A extends the shared diagnostic comparator's current
`sourceFile`, `path`, `code` keys with `entityId` and `message`, all compared by
Unicode code point with missing `entityId` ordered first. The collector removes
only exact duplicate identities over those five fields. Validators put the
stable offending entity/option/tag ID in `entityId` or `message`, so distinct
findings cannot retain input insertion order under an equal comparator key.

Reverse-order invalid-input tests must compare complete diagnostic
serialization, including multiple unknown/duplicate options at one collection
path. Existing Batch 2A compiler and Batch 2B diagnostic-order regressions must
remain green after the additive comparator tie-breakers. An error-severity
diagnostic prevents model and artifact creation.

## 11. Immutability

Compilation creates new canonical objects and never retains writable references
to source definitions. The compiler and generated artifact use the shared
`contracts/deep-freeze.ts`; Batch 3A must remove or avoid local duplicate
deep-freeze implementations.

Tests freeze all levels relevant to public consumers: model metadata, styles,
cores, rules, targets, adjustments, conditions, subtypes, provenance, and
inventory. Mutation attempts cannot change serialization or semantic hashes.

The artifact contains only JSON-like inert data and the shared deep-freeze call.
It contains no `Map`, `Set`, function, class instance, Node-only dependency,
React, DOM, network, storage, or file I/O.

## 12. Runtime/compiler boundary

The compiler entrypoint adds these value exports:

```text
compileStyles
renderStyleArtifact
styleDefinitionBundleSchema
styleDefinitionSchema
styleDefinitionBundle
styleDefinitions
styleTaxonomy
```

It adds the source types `StyleDefinitionBundleSource`, `StyleDefinition`,
`StyleTaxonomyDefinition`, `StyleRuleDefinition`,
`StyleRuleTierDefinition`, `IntensityOverrideDefinition`, `BonusDefinition`,
`ConflictDefinition`, `AdjustmentConditionDefinition`, and
`CompileStylesResult`, and re-exports the compiled/provenance types listed
below. Existing `compileClassification` remains, with the explicit
compiler-only source composition described in section 5.

The artifact serializer contract is exact:

```ts
function renderStyleArtifact(model: CompiledStyleModel): string
```

It is a deterministic, side-effect-free compiler utility that returns the
complete TypeScript artifact source and performs no file I/O. Generated
artifact check/write commands own comparison and atomic publication outside the
package. Semantic proof helpers, including any internal `proveStyleModel`
function used during compilation, are implementation details and are not
exported from either the compiler entrypoint or the runtime root.
The Task 6-8 staged result families, stage values, and supporting stage types
are likewise compiler-internal transaction types and are never public compiler
or runtime exports.

The runtime root receives only additive exports:

```text
styleModel
StyleId
StyleFamilyId
IntensityId
NoodleId
ExclusionTagId
CoreId
SubtypeId
RuleId
MatchTier
CompiledStyleModelMetadata
CompiledStyleModel
CompiledExclusionTag
CompiledStyle
CompiledCore
CompiledSubtype
CompiledStyleRule
CompiledRuleTarget
CompiledAdjustment
CompiledBonus
CompiledConflict
CompiledAdjustmentCondition
CompiledStyleInventoryRecord
StyleSourceReference
StyleRuleProvenance
```

The runtime root exports only the `styleModel` value plus those inert types. The
package also exposes `./generated/style-model`, which exports the same
`styleModel` value and compiled types for direct artifact imports.
The root does not export definitions, schemas, compiler functions, Zod, Node
utilities, fixture tooling, or legacy data. Runtime import validation must prove
that adding `styleModel` does not introduce compiler, definitions, `styles/**`,
Node, Zod, persistence, scoring, eligibility, browser, or tool imports.

Existing root exports, including `questionModel`, `decodeAnswerDraft`,
`evaluateFlow`, and persistence functions, remain unchanged. The generated
question model and its public identity are byte-protected.

## 13. Legacy fixture extraction

Style fixture authoring reuses `tools/parity/shared/**` without modification.
The style adapter supplies only style-specific seeds, instrumentation patch,
schema, normalization, manifest builder, and verification.

The authoring transaction must:

1. verify the legacy remote, exact HEAD, exact tree, and clean tracked status;
2. bind hashes for every tracked source used by the observation;
3. create the shared isolated temporary worktree;
4. apply a hash-bound instrumentation patch;
5. run the legacy full suite before extraction;
6. run extraction with network denied;
7. validate and canonicalize the complete observation;
8. publish `cases.json` and `manifest.json` atomically through the shared lock;
9. verify ignored-path fingerprints before and after; and
10. remove the temporary worktree or report recovery-required state.

The fixture directory contains exactly:

```text
tools/parity/fixtures/styles/legacy-v1/cases.json
tools/parity/fixtures/styles/legacy-v1/manifest.json
```

Each observed style record includes its exact legacy accent and exact ordered
owned exclusion tags, not only the global tag vocabulary. Copy observations
record the source label/summary/reason roles needed to assign message IDs and
templates, but do not claim translated-content parity.

The manifest binds source repository, commit, tree, tracked source hashes,
lockfile hash, patch hash, seeds hash, extractor and instrumentation hashes,
authoring source hashes, Node/npm evidence required by the shared contract,
ordered entity IDs, fixture-content hash, and canonical corpus hash.

Ordinary CI never accesses a neighboring checkout, the network, an absolute
local path, or untracked evidence. Live extraction is an explicit authoring
operation and is not part of `npm run verify`.

## 14. Parity definition

Batch 3A parity compares a canonical projection of the compiled style model to
the committed legacy observation. It covers:

- ordered display style IDs and count;
- ordered core IDs and count;
- ordered subtype IDs and count;
- all parent relationships;
- family, exact accent, supported intensity, and supported noodle matrices;
- style/core/subtype priorities;
- all generated rule IDs, questions, targets, tiers, and implicit miss;
- all adjustment IDs, kinds, priorities, operands, and conditions;
- each style's exact exclusion-tag ownership plus the closed global inventory;
- legacy copy source mapped to stable message/template roles;
- the 54-to-18 bonus and 21-to-7 conflict normalization proof; and
- absence of missing, extra, duplicate, or unsupported entities.

The parity projection canonicalizes membership-only arrays. It preserves every
ordering value that can affect legacy behavior as explicit priority.

The batch does not claim numerical scoring, collapse, ranking, confidence,
blocked-result, recommendation, catalog, Finder, or rendered-copy parity. Those
claims require their later batches and cannot be inferred from inventory parity.

## 15. Documentation and provenance

The classification manifest and generated index expose the style model only
after production definitions compile successfully. Existing concept kinds are
preserved:

- `style/{styleId}` represents a display style;
- `intensity/{coreId}` represents a generated core;
- `noodle/{subtypeId}` represents a generated subtype.

This avoids a breaking change to `ConceptKind` while correcting the synthetic
noodle inventory to one record per actual subtype.

Each concept records its focused canonical source, style compiler validators,
generated owner, tests, message IDs, and future consumers. Rule and adjustment
IDs are part of the style artifact and parity corpus but are not added as new
top-level concept kinds in this batch.

The style provenance mirrors the existing question evidence shape where
applicable:

- `origin: legacy-production`;
- source repository, commit, and tree;
- fixture path and manifest/content hashes;
- extractor/instrumentation version and hashes;
- style source and semantic hashes;
- parity scope `legacy-compiled-style-projection`; and
- a verification block only after exact-SHA acceptance.

Before remote acceptance, live style assurance is no stronger than
`compiler-validated` and omits an implementation SHA. On metadata completion,
the nested verification may state `parity-verified` for the exact, narrow parity
scope. Persistence assurance remains `contract-verified`; scoring policy remains
synthetic and structurally validated.

Readiness has one exact transition. Before Batch 3A exact-SHA acceptance,
including while the ledger is in progress and style assurance is only
`compiler-validated`, the repository remains `migration-only` with exactly:

```text
persistence-adapter-not-integrated
persisted-data-cutover-incomplete
styles-not-production-verified
scoring-not-production-verified
runtime-cutover-incomplete
```

Only after the implementation candidate passes authenticated exact-SHA parity
CI and the metadata completion transaction is generated may Batch 3A remove
`styles-not-production-verified`. The status remains `migration-only` and the
remaining blockers are exactly:

```text
persistence-adapter-not-integrated
persisted-data-cutover-incomplete
scoring-not-production-verified
runtime-cutover-incomplete
```

No other readiness blocker, persistence assurance, scoring assurance, storage
claim, or runtime-cutover claim changes in Batch 3A.

## 16. Migration ledger ownership

### Batch 2B acceptance-boundary maintenance precondition

The current Batch 2B checker compares every future HEAD directly with the
historical implementation SHA. Its historical path groups include shared
contracts, exports, package scripts, documentation, migration tooling, and the
runtime-import checker, so a valid later batch would be rejected even after the
accepted Batch 2B metadata boundary. Before any Batch 3A production path is
changed, the approved implementation plan must therefore execute a separate,
formally reviewed Batch 2B acceptance-boundary maintenance transaction.

The maintenance records this already accepted boundary exactly:

```text
implementation SHA: 30b71e3305b0e48a7c77e4869e2411c17941ebb8
accepted metadata SHA: 6fba4c0dc384d3cfa27b627db6ae373f56c8b6d4
accepted metadata parent: 30b71e3305b0e48a7c77e4869e2411c17941ebb8
accepted metadata paths:
  docs/classification/index.md
  docs/classification/manifest.json
  docs/migration/ledger.json
  docs/migration/ledger.md
accepted metadata CI run:
  https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/29411764507
```

The ledger schema names this immutable object `acceptanceBoundary`. It binds the
implementation SHA, accepted metadata SHA, its exact four-path diff, and the
authenticated remote evidence whose commit SHA is the accepted metadata SHA.
Its verification array contains exactly one
`batch2b-acceptance-boundary-remote-ci` entry with commit SHA
`6fba4c0dc384d3cfa27b627db6ae373f56c8b6d4` and run URL
`https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/29411764507`.
The offline checker proves the implementation is the accepted metadata commit's
only parent, the accepted metadata commit is an ancestor of current HEAD, and
their diff is exactly those four metadata paths. The repository-state adapter
must supply the direct-parent query rather than approximating it with ancestry.

The same Batch 2B entry adds a separately staged `boundaryMaintenance` object.
It preserves Batch 2B `status: complete`, the historical implementation SHA,
the original implementation CI evidence, the frozen persistence fixture hash,
the manifest persistence projection, `contract-verified` persistence
assurance, and all Batch 2B scope/readiness claims.

The maintenance candidate wires the immutable `acceptanceBoundary` into
`docs/migration/ledger.json` and generated `docs/migration/ledger.md`. In that
same candidate, `boundaryMaintenance` has exactly:

```text
status: in-progress
paths: the exact maintenance implementation allowlist below
maintenanceSha: absent
verification: []
```

It therefore records no self-referential SHA or remote proof. After its local
full verify and exact-SHA CI succeed, the completion promotes only that object
to `status: complete`, records `maintenanceSha` equal to the candidate SHA, and
requires exactly `batch2b-boundary-maintenance-local-verify` plus
`batch2b-boundary-maintenance-remote-ci`; the remote evidence commit SHA must
equal `maintenanceSha`. The checker enforces that the candidate is an ancestor
of the completion HEAD and that the entire candidate-to-completion diff is a
non-empty subset of the four acceptance metadata paths. The completion's own
exact-SHA CI is authenticated and reported without another self-referential
commit.

The authenticated acceptance verifier must cover remote evidence nested in
`acceptanceBoundary.verification` and `boundaryMaintenance.verification` in
addition to the historical top-level entry verification. It must reject a
missing, duplicate, malformed, unauthenticated, wrong-repository, wrong-event,
wrong-workflow, failed, or SHA-mismatched nested proof under the same bounded
contract as existing acceptance evidence.

The maintenance implementation allowlist is limited to:

```text
tools/migration/ledger-schema.ts
tools/migration/check-ledger.ts
tools/migration/ledger-check.ts
tools/migration/ledger-check.test.ts
tools/migration/render-ledger.ts
tools/migration/render-ledger.test.ts
tools/migration/record-ci.ts
tools/migration/record-ci.test.ts
tools/acceptance/verify-acceptance.ts
tools/acceptance/verify-acceptance.test.ts
```

Its acceptance metadata allowlist is exactly the four paths recorded above.
The implementation plan must use task-level subsets of these lists and may not
touch persistence production code, persistence fixtures, the classification
runtime, scoring, eligibility, adapters, or I/O.

After the accepted boundary, Batch 2B permanently protects only these
legacy-exclusive semantic paths unless a separately approved Batch 2B
maintenance explicitly reopens them:

```text
packages/classification-core/src/persistence/**
tools/parity/persistence/**
tools/parity/fixtures/persistence/**
```

The historical broader `implementationPaths` and `verificationPaths` remain in
the ledger as an acceptance audit record but are not a permanent freeze on
shared contracts, exports, package scripts, documentation, migration tooling,
acceptance tooling, CI, or runtime-import validation. A later approved batch may
change a shared path only through its reviewed task allowlist and must bind that
path to the later batch's exact ownership before acceptance. This maintenance
does not grant Batch 3A ownership early and does not weaken any Batch 2A
semantic protection.

The boundary maintenance itself requires focused RED/GREEN tests, full local
`npm run verify`, independent review, an exact-SHA implementation CI run, a
metadata-only completion, and a successful exact-SHA metadata CI run. Batch 3A
implementation cannot begin until that transaction is complete and the clean
resulting SHA is recorded as its execution base.

### Batch 3A ownership

The implementation plan must freeze exact Batch 3A path groups:

- implementation paths for style definitions, contracts, compiler, generated
  artifact, exports, parity implementation, and frozen fixtures;
- verification paths for scripts and repository gates needed to prove the
  implementation; and
- acceptance metadata paths consisting only of:
  `docs/classification/index.md`, `docs/classification/manifest.json`,
  `docs/migration/ledger.json`, and `docs/migration/ledger.md`.

Ownership wiring occurs only after the implementation and parity surfaces are
stable. The first live Batch 3A ledger entry is `in-progress`, has no
implementation SHA or acceptance evidence, and binds the style fixture manifest
hash. Ledger schema and tests enforce the exact path groups and exact completion
gates.

A completed Batch 3A entry requires exactly:

```text
batch3a-local-verify
batch3a-remote-ci
```

The remote evidence SHA must equal `implementationSha`. After that SHA is
recorded, implementation and verification paths are immutable and only the four
acceptance metadata files may change.

Batch 2A historical implementation and maintenance identities and the completed
Batch 2B implementation/evidence remain unchanged. The newly explicit Batch 2B
accepted metadata boundary and its boundary-maintenance evidence are additional
governance records, not replacements for those identities.

## 17. Model and data version implications

Batch 3A separates the global compiled style identity from the persisted
question identity:

- `questionModel.metadata.modelVersion` remains `batch2a.1.0`;
- its semantic hash and generated artifact bytes remain unchanged;
- Batch 2B continues to persist `questionModelVersion` and
  `questionSemanticHash` from that question model;
- the style/global classification model becomes `batch3a.1.0`; and
- the classification/style `dataVersion`, source hash, and semantic hash change
  to identify the canonical production style content.

This does not require a persistence migration because stored answers are bound
to question-model semantics, not to the new style artifact. Batch 3B must bump
the global model version when numerical scoring/ranking semantics become active.
Batch 3C must do the same if eligibility changes behavior.

`dataVersion` is calculated from canonical compiled data, not input file order,
absolute paths, timestamps, or localized prose. A message-ID/message-role or
accent correction changes style data identity but not style semantic identity
or the question-model identity. Editing translated text behind an unchanged
message ID is outside Batch 3A and does not change this artifact.

## 18. Verification gates

Implementation is acceptable only when all applicable gates pass under the
repository Node 24 toolchain:

1. focused source-schema and diagnostic mutation tests;
2. focused core/subtype/rule/adjustment compiler tests;
3. determinism, reorder, immutability, and serializer drift tests;
4. fixture schema, coverage, instrumentation, and authoring tests;
5. compiled style parity against committed fixtures;
6. generated style artifact check;
7. full Vitest;
8. typecheck, lint, and build;
9. classification validation;
10. question artifact check and Batch 2A protected-hash check;
11. persistence suites and Batch 2B contract regression;
12. runtime import boundary check;
13. classification index drift check;
14. migration ledger drift/ownership check;
15. `git diff --check` and task allowlist checks;
16. independent review for every implementation task;
17. full local `npm run verify` after final ownership, provenance, readiness,
    manifest, index, and ledger wiring on the implementation candidate;
18. exact-SHA GitHub Actions success for that candidate; and
19. a second successful GitHub Actions run for the metadata-only completion
    commit.

Focused or parity gates are reported separately from full repository verify. No
partial set is described as complete verification.

## 19. Failure handling

- Structural or semantic style errors return a sorted diagnostic union and no
  compiled model.
- A failed compile never writes or partially replaces the generated artifact.
- Artifact check mode reports drift without writing.
- A fixture authoring failure publishes no partial corpus and follows the shared
  rollback/recovery contract.
- A parity mismatch reports bounded entity IDs and paths, not the entire corpus.
- An unexpected internal generation inconsistency is converted into the
  registered parent/inventory diagnostic before the public compile result.
- Runtime receives only a successfully generated, inert, deep-frozen artifact.
- No fallback repairs an unknown family/intensity/noodle/question/option/tag or
  a missing declared combination.
- Any Batch 2A hash, Batch 2B contract, legacy HEAD/tree, or exact allowlist drift
  stops the batch.

## 20. Acceptance transaction

The transaction is intentionally staged:

1. approve this design in writing;
2. create and independently review the implementation plan;
3. complete the Batch 2B acceptance-boundary maintenance transaction from
   section 16, including its independent review, full local verify, exact-SHA
   implementation CI, metadata-only completion, and exact-SHA metadata CI;
4. record the clean accepted maintenance SHA as the Batch 3A execution base and
   reconfirm the protected Batch 2B persistence paths and identities;
5. implement small RED/GREEN tasks with exact per-task allowlists and independent
   reviews;
6. build and freeze legacy observations through the shared authoring boundary;
7. prove local style parity and the pre-wiring focused repository gates;
8. wire the in-progress ledger, compiler-validated style provenance, readiness,
   and exact ownership paths;
9. run full local `npm run verify` again after that final wiring and resolve only
   in-scope failures before creating one clean implementation candidate commit;
10. push only when the approved plan reaches its remote-acceptance task;
11. authenticate successful CI whose head SHA exactly equals the implementation
   candidate;
12. record that proof and regenerate only the four acceptance metadata files;
13. prove the completion diff is metadata-only and create the metadata commit;
14. authenticate successful CI for the metadata commit; and
15. report both SHAs/run IDs, fixture identities, test counts, final assurances,
   readiness, and clean branch state.

The implementation candidate cannot record its own SHA. The metadata commit may
record the prior implementation SHA but cannot change implementation or
verification paths. No production code, artifact, fixture, export, live ledger,
commit, or push is authorized merely by this draft.

## 21. Explicit deferred work for Batch 3B and 3C

Batch 3B owns:

- `definitions/policies.ts` as the production source for question weights, tier
  ratios, adjustment caps, rounding, confidence, thresholds, and tie policy;
- score-rule evaluation over completed answers;
- bonus and conflict application;
- total points, score floors, collapse, deterministic ranking, and result limits;
- confidence and low-confidence behavior;
- structured score traces and reason assembly; and
- full numerical and ordering parity.

Until Batch 3B, `scoringPolicy.origin` remains `synthetic` and no runtime scorer
is exported.

Batch 3C owns:

- exclusion-tag evaluation;
- eligible versus blocked result separation;
- blocked-lead behavior;
- allergy/exclusion claims;
- eligibility/ranking interaction; and
- blocked-result parity.

Until Batch 3C, exclusion tags are inert compiled data.

Catalog, Finder, React, browser persistence adapters, localization, and
production cutover remain in their architecture-assigned later batches.

## Approval decisions

Written approval of this design approves these eight choices:

1. preserve legacy accent in canonical style metadata without rendering it;
2. compile tier tokens in 3A and defer numeric tier ratios to 3B;
3. normalize identical core adjustment copies into style-level ownership;
4. add the frozen `styleModel` to the runtime root and generated subpath without
   exposing definitions or compiler code; and
5. move the global style/classification model to `batch3a.1.0` while preserving
   the Batch 2A question model at `batch2a.1.0`; and
6. replace the compiler-only synthetic style source field with the production
   `StyleDefinitionBundleSource` and compose it into
   `ClassificationModel.styleModel`, while keeping existing runtime APIs
   additive and unchanged; and
7. complete the narrow Batch 2B acceptance-boundary maintenance in section 16
   before Batch 3A implementation, preserving persistence semantics and evidence
   while allowing later approved batches to own shared paths after the accepted
   metadata boundary; and
8. use explicit compiler-internal core, subtype, and rules stages for Tasks 6-8,
   without optional future fields, empty final-model fields, or placeholder
   hashes; Task 9 alone converts staged data to `CompiledStyleModel`, proves
   global parents and the complete 18-style inventory, and may emit
   `STYLE_PARENT_MISMATCH`.

If any choice is rejected, the design must be revised and independently
re-reviewed before an implementation plan is created.
