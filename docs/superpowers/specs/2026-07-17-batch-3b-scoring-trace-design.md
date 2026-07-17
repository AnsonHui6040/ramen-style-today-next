# Batch 3B Scoring and Trace Design

**Status:** reviewed planning checkpoint; implementation not started

**Date:** 2026-07-17

**Accepted baseline:** `93f10161f1b2a24bb90fbb233d0fee41705c9f3a` (`Accept Batch 3A style compilation`)

**Frozen legacy source:** commit `eebf00b7ddfbbe6f01ff598e57f1e17197068a37`, tree `3e527de876cfeccfd3154ddc492830d71c4cfd9a`

## 1. Purpose

Batch 3B replaces the synthetic scoring-policy placeholder with the frozen legacy numerical scoring semantics, adds deterministic core/style ranking, exposes one pure scoring API, and emits a complete structured trace. It does not integrate the web application or decide eligibility.

The accepted architectural equation is:

```text
ClassificationModel + CompletedAnswers -> ScoreCompletedAnswersResult
```

The successful result must be deterministic, browser-neutral, deeply immutable, and reconstructable without localized prose. The failure result must be bounded and deterministic. Neither path performs I/O.

## 2. Authority and fixed boundaries

This design is subordinate to:

- `docs/superpowers/specs/2026-07-11-classification-architecture-design.md`;
- `docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md`;
- `docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md`;
- accepted ledger and classification metadata at the baseline above; and
- the frozen legacy commit and tree above.

The following accepted identities remain unchanged throughout Batch 3B:

| Boundary | Accepted identity |
| --- | --- |
| Question model version | `batch2a.1.0` |
| Question semantic hash | `d1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d` |
| Generated question artifact | byte-identical to the accepted baseline |
| Style model version | `batch3a.1.0` |
| Style semantic hash | `9fb9832c434b22fcd8397809b14117a47c358a266694df24ba68fd290fc5f585` |
| Style data version | `c5b3b3353b42618875f1c20d64449ec513601b60215351f757dbd1e48d1fee28` |
| Generated style artifact | byte-identical to the accepted baseline |
| Style parity scope | `legacy-compiled-style-projection` |
| Persistence assurance | `contract-verified` |

Batch 3B must not edit the Batch 2A question definition/compiler/generated/flow paths, the Batch 2B persistence paths, or the Batch 3A style definition/compiler/generated/parity paths. Shared classification composition, diagnostics, documentation, validation, and package surfaces may change only where this design names them explicitly.

## 3. Legacy truth audit

### 3.1 Audited source closure

The frozen checkout was verified clean at the exact commit/tree. The audit covered:

- `src/lib/scoring/scorer.ts`;
- `src/lib/scoring/explainer.ts`;
- `src/config/questions.ts` and `src/data/questions.json`;
- `src/config/styles.ts` and `src/data/styles.json`;
- `src/domain/schema.ts`, `src/domain/types.ts`, and question rules;
- `src/__tests__/lib/scoring/fixtures.ts` and all scorer tests;
- `src/lib/catalog/enricher.ts` and its tests;
- `src/App.tsx`, result components, and all direct scoring/result consumers.

The authoring harness will bind the complete tracked legacy source closure, lockfile, installed dependency tree, instrumentation patch, seed file, Node runtime, and full-suite result. The narrower list above explains scoring behavior; the complete hash map prevents an unrecorded transitive change from entering an observation.

### 3.2 Exact policy values

The scored question order and weights are:

| Priority | Question | Weight |
| ---: | --- | ---: |
| 0 | `form` | 16 |
| 1 | `archetype` | 16 |
| 2 | `tare` | 15 |
| 3 | `source` | 18 |
| 4 | `body` | 14 |
| 5 | `noodle` | 11 |
| 6 | `signature` | 10 |

The base-weight total is 100. `exclusions` has accepted question weight 0 and is not scored.

The tier ratios are:

```text
exact    1.0
adjacent 0.6
partial  0.4
miss     0.0
```

The remaining legacy policy values are:

```text
score decimal places                 1
score rounding                       ECMAScript Math.round(value * 10) / 10
bonus phase                          before conflict phase
bonus applied budget                 5
penalty applied budget               15
final score floor                    0
derived maximum score                100 + 5 = 105
primary result limit                 3
alternative result limit             3
last displayed result synthetic gap  4 points
confidence gap multiplier            1.4
confidence gap boost cap             10
source=unsure deduction              6
signature=no-preference deduction    4
applied-conflict deduction            4 each, capped at 8
confidence integer rounding           Math.round
confidence minimum / maximum          24 / 99
low-confidence threshold              confidence < 72
low-confidence score gap              top minus second < 5
```

### 3.3 Behavior inventory and disposition

| # | Legacy evidence | Observed behavior | Batch 3B disposition | Required proof |
| ---: | --- | --- | --- | --- |
| 1 | `src/domain/types.ts:81-89`; `scorer.ts:191` | Seven questions execute in the fixed order above. | Preserve as explicit policy priorities. | Policy contract and line-order parity. |
| 2 | `questions.json`; `scorer.ts:18-20,192` | Weights are 16,16,15,18,14,11,10. Missing map entries silently become 0. | Preserve exact values; reject a missing compiled weight rather than defaulting. | Compiler mutation tests and all-rule trace coverage. |
| 3 | `scorer.ts:48-65` | First tier with any intersecting answer wins: exact, adjacent, partial, then miss. | Preserve; compiled target overlap remains forbidden. | Per-rule reachable-tier coverage. |
| 4 | `scorer.ts:30-32,91,199,208` | Each question line and requested bonus are rounded to one decimal; final floored total is rounded again. Penalties are not separately rounded. | Preserve observable numbers with safe fixed-point score units and the same non-negative half-up result. | Numerical parity and fixed-point properties. |
| 5 | `scorer.ts:187-201` | Base score is the sum of already-rounded question points. | Preserve. | Trace sum invariant. |
| 6 | `scorer.ts:67-74,76-84` | A bonus condition matches when any answer intersects `anyOf`. | Preserve. | Active/inactive condition fixtures. |
| 7 | `scorer.ts:86-98` | Bonus is inactive below `minMatches`; otherwise requested points are `round(points * matched / conditionCount)`, not `matched / minMatches`. | Preserve exactly. | Threshold and partial-match tests. |
| 8 | `scorer.ts:107-129` | A conflict is active only when every `whenAll` condition matches. | Preserve. | All seven unique conflicts active/inactive. |
| 9 | `scorer.ts:203-208` | Bonus runs first, conflict second, then floor and final rounding. | Preserve as explicit phases. | Phase/order mutation tests. |
| 10 | `scorer.ts:22-28,91,121,208` | Applied bonus is capped at 5, applied penalty at 15, final score at 0; no explicit upper clamp exists. | Preserve; compiler proves the derived 105 maximum. | Exact-cap and floor tests. |
| 11 | `scorer.ts:226-238,257-259` | All cores are scored; only the strictly higher score replaces the current style winner. | Normalize to explicit comparator: score descending, core priority ascending, core ID ascending. | Equal-core parity and reorder invariants. |
| 12 | `scorer.ts:229-235`; frozen style order | Equal cores retain the first source core (`clean`, `standard`, `heavy`). | Preserve output through accepted priorities 0,1,2; no source-order fallback. | Equal-core fixture and reversed-core test. |
| 13 | `scorer.ts:137-143,206` | Exact noodle match is selected. | Preserve for valid completed answers. | Every noodle and exact subtype tests. |
| 14 | `scorer.ts:141-143` | Missing noodle match falls back to the first subtype. | Normalize outside the valid domain: compiled coverage must be exact; runtime failure is bounded, never a fallback. | Compiler proof and runtime mutation failure. |
| 15 | `scorer.ts:182-223` | Style final score is the selected core's floored/rounded adjusted total. | Preserve. | Per-style trace reconstruction. |
| 16 | `scorer.ts:237`; stable Array sort and style catalog order | Equal display-style scores retain legacy style source order. | Preserve output through `displayPriority`, then style ID; no array-order dependence. | Equal-style fixture and reversed-style test. |
| 17 | `scorer.ts:267-278` | Results split by answer `form`; each primary/alternative group is sliced to three before confidence. | Preserve as scoring result grouping, not eligibility. | Result-limit and third-result confidence fixtures. |
| 18 | `scorer.ts:158-180` | Confidence base is `score / 105 * 100`; gap boost is capped at 10; deductions follow the policy values above. | Preserve with maximum derived from compiled policy. | Formula parity and maximum tests. |
| 19 | `scorer.ts:280-283` | Low confidence is true for no primary, top confidence below 72, or top-primary gap below 5. | Preserve. | Both sides of both boundaries. |
| 20 | `scorer.ts:179`; result UI consumers | Confidence is an integer in [24,99] and UI renders it as a percent. | Preserve the integer; rendering remains deferred. | Range/property tests. |
| 21 | `explainer.ts:8-59`; `scorer.ts:216-220` | Explanations combine stable values with localized question/answer/tier/adjustment prose. | Preserve stable values and message IDs only; defer rendered copy. | Trace-to-explanation reconstruction test. |
| 22 | `scorer.ts:145-156,205,260-286` | Blocking is computed during core scoring, filtered before collapse/ranking/confidence, and may produce a blocked lead. | Defer all blocking and blocked-lead behavior to Batch 3C. | Batch 3B seeds require `exclusions:['none']`. |
| 23 | Same as #22 | Eligibility is mixed with ranking in the legacy public outcome. | Separate observations by selecting the no-exclusion domain; do not imitate the mixed loop. | Seed schema and extractor reject other exclusions. |
| 24 | `src/lib/catalog/enricher.ts`; `App.tsx` | Catalog recommendations are added after scoring. | Defer; no catalog field in the core result. | Import-boundary tests. |
| 25 | `scorer.ts:34-45,48-64,137-143,191-208` | The legacy scorer trusts its TypeScript caller. Some missing fields throw, some unexpected values miss, and invalid noodles fall back; non-finite definitions can propagate. | Normalize all invalid runtime inputs/models to bounded failures. These invalid states are not legacy product observations. | Failure-union tests with no raw value leakage. |
| 26 | `scorer.ts:76-129,226-238,257-259` | Bonus/conflict, core, and style source order can affect equal/capped outcomes. | Preserve output with accepted explicit priorities; reject duplicate priorities. | Source reorder and duplicate-priority tests. |
| 27 | scorer consumers and tests | Valid completed-answer numerical/order output is observable. Internal map construction, copied objects, localized reason strings, fallback on impossible invalid inputs, and catalog enrichment shape are not the Batch 3B contract. | Preserve only the defined parity projection; normalize invalid-state handling; defer eligibility/catalog/localization. | Fixture schema forbids out-of-scope fields. |

### 3.4 Legacy collapse and confidence order

The exact legacy order is important:

```text
score all 54 core candidates
-> eligibility filter (neutral when exclusions=['none'])
-> collapse to one core per 18 styles
-> split primary family versus alternatives
-> take 3 from each group
-> compute confidence independently within each truncated group
-> compute lowConfidence from primary results only
```

For the last item in each truncated group, `nextScore = currentScore - 4`, even when an undisplayed fourth style exists. Batch 3B preserves that behavior.

## 4. Current compiled-contract audit

### 4.1 Completed answers

`CompletedAnswers` is `Readonly<Record<QuestionId, readonly OptionId[]>>`. `evaluateFlow` emits it only for `status:'complete'`, after reachability, allowed-option, forced-answer, selection-bound, ownership, duplicate, and exclusive-option checks. Single-select answers are still one-element arrays. Multiple-select values are in compiled option priority order. Forced answers are included in `completedAnswers`; they are not a separate scoring input.

Current cardinalities are:

| Question | Type | Bounds | Option count | Weight mirror |
| --- | --- | --- | ---: | ---: |
| `form` | single | 1..1 | 3 | 16 |
| `archetype` | single | 1..1 | 10 | 16 |
| `tare` | single | 1..1 | 5 | 15 |
| `source` | multiple | 1..2 | 10 | 18 |
| `body` | single | 1..1 | 5 | 14 |
| `noodle` | single | 1..1 | 5 | 11 |
| `signature` | multiple | 1..2 | 6 | 10 |
| `exclusions` | multiple | 1..8 | 9 | 0 |

The exact compiled option order is:

```text
form:       soup, tsukemen, dry
archetype:  chintan, paitan, konbusui-light, gyokai-rich, miso-rich,
            tsukemen-other, aburasoba, taiwan-mazesoba,
            soupless-tantan, dry-other
tare:       shoyu, shio, miso, spicy-sesame, none
source:     pork, chicken, duck, beef, fish-seafood, shellfish,
            shrimp-crab, vegetable, mixed, unsure
body:       light, balanced, rich, backfat-heavy, ultra-heavy
noodle:     thin-straight, medium-thin-straight,
            medium-thick-straight, medium-thick-wavy, extra-thick
signature:  nori-spinach, corn-butter, bean-sprout-garlic-backfat,
            fish-kombu, yuzu-citrus, no-preference
exclusions: pork, chicken, duck, beef, fish-seafood, shellfish,
            shrimp-crab, dairy, none
```

`unsure`, `no-preference`, and exclusion `none` are exclusive compiled options.
Branch rules restrict `archetype` by `form`; the order above remains the global
compiled priority used for canonicalization.

The accepted `CompiledQuestion.weight` values remain in the protected question artifact. Beginning in Batch 3B, they are compatibility mirrors only: the scoring compiler requires exact equality with the canonical policy, and runtime scoring never reads them. The policy is therefore the sole behavioral owner without reopening Batch 2A.

### 4.2 Style model

The accepted compiled style model contains 18 styles, 54 cores, 270 exact core/noodle subtypes, 378 rules, and 25 normalized adjustments (18 bonuses and 7 conflicts). Every core has seven rules. Each rule has explicit question priority, canonical target priority, `exact|adjacent|partial` targets, and `fallbackTier:'miss'`. Every core and style has an explicit tie priority. Every adjustment has a stable ID, kind-local priority, ordered conditions, a message ID, an operand, and ordered `appliesToCoreIds`.

These are inert operands in Batch 3A. Batch 3B consumes them but does not edit their source, compiler, artifact bytes, or hashes.

### 4.3 Existing policy and model gap

`definitions/synthetic.ts` currently carries only tier ratios, caps, confidence threshold, and tie gap. It lacks scored-question ownership, rounding, score floor, maximum derivation, grouping/limits, confidence gap/deductions/range, tie comparator declarations, identity binding, and a compiled policy hash.

`ClassificationModel.policy` currently points directly to the source-schema shape, and the root runtime exports separate `questionModel` and `styleModel` values but no complete `ClassificationModel`. This is insufficient for the approved pure scoring signature. Batch 3B therefore makes an additive shared-composition change:

1. add a compiled policy contract;
2. add the already-compiled `questionModel` to `ClassificationModel` while retaining `questions` as the exact same compatibility reference;
3. keep `styleModel` unchanged;
4. generate one immutable `classificationModel` that composes the accepted question/style artifacts with the compiled policy and inventory; and
5. export that value and the scorer from the root runtime.

No question/style compiler stage is modified.

## 5. Canonical scoring policy

### 5.1 Sole hand-authored source

`packages/classification-core/src/definitions/policies.ts` owns one `legacyScoringPolicy`. `definitions/synthetic.ts` is retired when classification composition switches to the production policy.

Conceptually the source is:

```ts
interface ScoringPolicyDefinition {
  readonly sourceFile: string
  readonly modelVersion: 'batch3b.1.0'
  readonly scoredQuestions: readonly {
    readonly questionId: string
    readonly priority: number
    readonly weight: number
  }[]
  readonly tiers: readonly {
    readonly tier: 'exact' | 'adjacent' | 'partial' | 'miss'
    readonly priority: number
    readonly ratio: number
  }[]
  readonly arithmetic: {
    readonly scoreDecimalPlaces: 1
    readonly scoreRounding: 'nearest-score-unit-ties-up'
    readonly scoreFloor: 0
  }
  readonly adjustments: {
    readonly phases: readonly ['bonus', 'conflict']
    readonly bonusCap: 5
    readonly penaltyCap: 15
  }
  readonly ranking: {
    readonly coreKeys: readonly ['score-desc', 'core-priority-asc', 'core-id-asc']
    readonly styleKeys: readonly ['score-desc', 'display-priority-asc', 'style-id-asc']
    readonly primaryFamilyQuestionId: 'form'
    readonly primaryLimit: 3
    readonly alternativeLimit: 3
  }
  readonly confidence: {
    readonly maximumDerivation: 'base-weight-total-plus-bonus-cap'
    readonly rounding: 'nearest-integer-ties-toward-positive-infinity'
    readonly lastResultGap: 4
    readonly gapMultiplier: 1.4
    readonly gapBoostCap: 10
    readonly minimum: 24
    readonly maximum: 99
    readonly lowConfidenceThreshold: 72
    readonly lowConfidenceTieGap: 5
    readonly uncertainty: readonly [
      { readonly kind: 'answer-includes'; readonly questionId: 'source'; readonly optionId: 'unsure'; readonly deduction: 6; readonly priority: 0 },
      { readonly kind: 'answer-includes'; readonly questionId: 'signature'; readonly optionId: 'no-preference'; readonly deduction: 4; readonly priority: 1 },
      { readonly kind: 'applied-conflict-count'; readonly deductionEach: 4; readonly deductionCap: 8; readonly priority: 2 },
    ]
  }
}
```

The policy does not repeat any per-style rule target, adjustment condition, operand, label message ID, core priority, style display priority, or subtype mapping.

### 5.2 Structural and semantic validation

The source schema is strict and bounded. All numbers must be finite safe numbers. Priorities are non-negative safe integers. IDs are bounded stable IDs. Ratios are in [0,1]. Caps, weights, limits, gaps, and deductions are non-negative and bounded by explicit compiler constants.

The policy compiler then proves:

- exactly seven unique scored questions with priorities 0..6;
- every policy question exists and its compatibility weight mirror is equal;
- `exclusions` is not scored;
- weights total exactly 100;
- exactly one tier at each priority 0..3 in the fixed tier order;
- exact ratio 1 and miss ratio 0, with non-increasing ratios;
- `scoreScale` is exactly 10 and every question-weight/tier-ratio product is
  finite, safe, and integral in score units;
- every bonus operand, conflict operand, phase cap, score floor, last-result
  gap, and low-confidence score gap is finite, safe, and exactly representable
  in score units;
- every worst-case base, bonus, penalty, pre-floor, final-score, gap, and
  intermediate score-unit sum remains within `Number.MAX_SAFE_INTEGER`;
- bonus requests are evaluated as the bounded rational
  `(operandUnits * matchedCount) / conditionCount` and then use the declared
  score-rounding token; the quotient itself need not be integral;
- conflict operands need no runtime float conversion because their score-unit
  representation is proved integral at compile time;
- phase and comparator tokens equal the closed supported sequences;
- score and confidence rounding tokens equal the exact closed supported
  tokens; no compiler or runtime default is permitted;
- confidence references exist and own the referenced options;
- primary family question is the `form` question bound by the compiled style taxonomy;
- maximum score is positive and safely derived from weights plus bonus cap;
- model version equals the global classification model version; and
- the compiled policy binds the exact compiled question and style model identities.

Expected definition errors use registered policy diagnostics. The planned stable codes are:

```text
POLICY_MODEL_VERSION_MISMATCH
POLICY_SCORED_QUESTION_DUPLICATE
POLICY_SCORED_QUESTION_PRIORITY_DUPLICATE
POLICY_SCORED_QUESTION_UNKNOWN
POLICY_QUESTION_WEIGHT_MISMATCH
POLICY_WEIGHT_TOTAL
POLICY_TIER_DUPLICATE
POLICY_TIER_PRIORITY_DUPLICATE
POLICY_TIER_SET_INVALID
POLICY_RATIO_ORDER_INVALID
POLICY_SCORE_SCALE_INVALID
POLICY_ORDERING_INVALID
POLICY_REFERENCE_UNKNOWN
POLICY_OPTION_UNKNOWN
POLICY_OPTION_WRONG_OWNER
POLICY_BUDGET_INVALID
POLICY_CONFIDENCE_INVALID
POLICY_IDENTITY_BINDING_INVALID
```

Zod structural failures remain `STRUCTURE_INVALID`. The existing
`STYLE_MODEL_VERSION_MISMATCH` stops enforcing equality between the global and
style model versions: global `batch3b.1.0` intentionally composes accepted
style model `batch3a.1.0`. The old top-level emission is retired rather than
repurposed; the registered code remains as accepted historical contract until
a separately reviewed diagnostic cleanup can prove that removing it is safe.

### 5.3 Compiled policy and identity

```ts
interface CompiledScoringPolicyMetadata {
  readonly schemaVersion: '1'
  readonly compilerVersion: '1'
  readonly modelVersion: string
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly styleModelVersion: string
  readonly styleSemanticHash: string
  readonly sourceHash: string
  readonly semanticHash: string
  readonly dataVersion: string
}

interface CompiledScoringPolicy {
  readonly metadata: CompiledScoringPolicyMetadata
  readonly scoredQuestions: readonly CompiledScoredQuestionPolicy[]
  readonly tiers: readonly CompiledTierPolicy[]
  readonly arithmetic: CompiledScoreArithmeticPolicy
  readonly adjustments: CompiledAdjustmentPolicy
  readonly ranking: CompiledRankingPolicy
  readonly confidence: CompiledConfidencePolicy
  readonly derived: {
    readonly baseWeightTotal: 100
    readonly maximumScore: 105
    readonly scoreScale: 10
  }
}
```

Canonical arrays are ordered only by explicit priority then stable ID/token. Duplicate behavior-relevant priority is an error.

Hashes use `stableJson` and SHA-256 with metadata/provenance excluded from their own inputs:

```text
policy sourceHash = sha256(canonical source with sourceFile removed)

policy semanticHash = sha256({
  modelVersion,
  questionModel: { modelVersion, semanticHash },
  styleModel: { modelVersion, semanticHash },
  compiled behavior-bearing policy fields and derived values,
})

policy dataVersion = sha256({
  modelVersion,
  questionModel: { modelVersion, sourceHash, semanticHash },
  styleModel: { modelVersion, semanticHash, dataVersion },
  full provenance-free compiled policy,
})

classification dataVersion = sha256({
  modelVersion,
  questionModel: { modelVersion, sourceHash, semanticHash },
  styleModel: { modelVersion, semanticHash, dataVersion },
  scoringPolicy: { semanticHash, dataVersion },
})
```

The generated classification artifact contains the compiled policy and imports the accepted generated question/style values. It contains no definitions, compiler, Node API, timestamp, absolute path, locale, random value, or I/O edge.

## 6. Public runtime contract

### 6.1 Exact exports

The package root adds only these public runtime values:

```ts
classificationModel
scoreCompletedAnswers
```

It adds these public types:

```ts
ClassificationModel
CompiledScoringPolicy
CompiledScoringPolicyMetadata
ScoreCompletedAnswersResult
ScoringOutcome
ScoredStyleResult
ScoreTrace
ScoringMatchTier
AdjustmentTraceStatus
ConditionScoreTrace
StyleScoreTrace
CoreScoreTrace
QuestionScoreTraceLine
AdjustmentScoreTraceLine
CoreRankingKeys
StyleRankingKeys
RankingTraceEntry
ConfidenceDeductionTrace
ConfidenceTrace
LowConfidenceTrace
SubtypeResolutionTrace
ScoringDiagnostic
ScoringDiagnosticCode
```

No definition, compiler function, invariant verifier, fixture type, legacy type, policy singleton, or eligibility override is exported from the root. Compiler-only policy types/functions remain available only from `@ramen-style/classification-core/compiler`.

### 6.2 Function and union

```ts
function scoreCompletedAnswers(
  model: ClassificationModel,
  answers: CompletedAnswers,
): ScoreCompletedAnswersResult

type ScoreCompletedAnswersResult =
  | { readonly ok: true; readonly outcome: ScoringOutcome }
  | { readonly ok: false; readonly diagnostics: readonly [ScoringDiagnostic] }

type ScoringDiagnosticCode =
  | 'SCORING_COMPLETED_ANSWERS_INVALID'
  | 'SCORING_MODEL_IDENTITY_MISMATCH'
  | 'SCORING_INVARIANT_FAILED'
```

`ScoringOutcome` is:

```ts
interface ScoringOutcome {
  readonly modelVersion: string
  readonly dataVersion: string
  readonly results: readonly ScoredStyleResult[]
  readonly alternativeResults: readonly ScoredStyleResult[]
  readonly lowConfidence: boolean
  readonly trace: ScoreTrace
}

interface ScoredStyleResult {
  readonly styleId: StyleId
  readonly coreId: CoreId
  readonly subtypeId: SubtypeId
  readonly score: number
  readonly confidence: number
  readonly trace: StyleScoreTrace
}
```

There is no `blockedLead`, `blockedBy`, eligibility status, translated identity string, copied style definition, catalog recommendation, or app state.

### 6.3 Failure boundary

The public scorer supports the generated inert `ClassificationModel` and JSON-like `CompletedAnswers` emitted by `evaluateFlow`. It does not claim protection against non-terminating or actively resource-consuming hostile proxies.

The runtime registers exactly three bounded scoring codes:

```text
SCORING_COMPLETED_ANSWERS_INVALID
SCORING_MODEL_IDENTITY_MISMATCH
SCORING_INVARIANT_FAILED
```

Their complete discriminated union is fixed:

```ts
type ScoringDiagnostic =
  | {
      readonly severity: 'error'
      readonly code: 'SCORING_COMPLETED_ANSWERS_INVALID'
      readonly sourceFile: 'runtime://scoring'
      readonly path: '/answers'
      readonly message: 'Completed answers are invalid for this classification model'
    }
  | {
      readonly severity: 'error'
      readonly code: 'SCORING_MODEL_IDENTITY_MISMATCH'
      readonly sourceFile: 'runtime://scoring'
      readonly path: '/model'
      readonly message: 'Classification model identity is invalid for scoring'
    }
  | {
      readonly severity: 'error'
      readonly code: 'SCORING_INVARIANT_FAILED'
      readonly sourceFile: 'runtime://scoring'
      readonly path: '/trace'
      readonly message: 'Scoring invariant verification failed'
    }
```

No scoring diagnostic has `entity`, `expected`, `received`, `related`, or an
open-ended details field. A failure always contains exactly one diagnostic.

- Unknown/missing questions, unknown/wrong-owner/duplicate options, invalid cardinality, exclusive conflicts, unreachable/disallowed answers, incomplete answers, and any repair-requiring or semantically different completed state collapse to `SCORING_COMPLETED_ANSWERS_INVALID`.
- A global/question/style/policy version or hash binding mismatch becomes `SCORING_MODEL_IDENTITY_MISMATCH`.
- A missing compiled rule, duplicate runtime tier, non-finite arithmetic result, trace reconstruction failure, subtype resolution failure, comparator contradiction, or other impossible post-compile state becomes `SCORING_INVARIANT_FAILED`.

The public boundary catches synchronous reflection failures and internal
invariant exceptions. A synchronous reflection failure while inspecting
answers becomes `SCORING_COMPLETED_ANSWERS_INVALID`; a synchronous reflection
failure while inspecting model identity becomes
`SCORING_MODEL_IDENTITY_MISMATCH`. Failures after the trusted compiled boundary
become `SCORING_INVARIANT_FAILED`. Diagnostics use `runtime://scoring`, stable
JSON pointers, fixed messages, and bounded IDs only. They never include raw
input, external trap text, stack, absolute path, localized text, or serialized
model data. The contract does not claim to contain a non-terminating or
actively resource-consuming hostile proxy. The complete union and every nested
output object/array are deeply frozen.

## 7. Scoring algorithm

### 7.1 Answer validation and canonical view

The scorer first validates model identity, then validates the answer through
the accepted flow model embedded in `ClassificationModel`. A valid answer must
evaluate to `status:'complete'` without diagnostics or repairs and must
represent the same option sets. Object-key order and the order of options
inside a valid multi-select answer are semantically irrelevant: permutations
of the same option set are accepted. Unknown or missing membership, changed
presence, or any state that requires flow repair is rejected. The scorer uses
the flow-emitted canonical question/option order for the trace and never
mutates caller input.

`exclusions` is validated as part of `CompletedAnswers` but ignored by all Batch 3B scoring calculations.

### 7.2 Rule lines

For every core, rules are paired to policy questions by ID, not array index. For each question:

1. obtain the canonical answer option IDs;
2. inspect tiers in policy priority order;
3. select the first tier whose targets intersect the answer;
4. select `miss` when none intersects;
5. compute raw `weight * ratio`;
6. round to one decimal score unit with the compiled
   `nearest-score-unit-ties-up` token; and
7. emit one question line.

Every line records:

```text
questionId, questionPriority, answerOptionIds,
ruleId, rulePriority, tier, tierPriority,
matchedOptionIds, ratio, weight, rawPoints, points
```

The base total is the sum of rounded line points. Line order is policy priority then question ID.

Score arithmetic uses integer tenths internally. Policy compilation proves all
direct score operands and weight/tier products are safe integers at that scale.
Bonus ratios are evaluated as bounded rational values and rounded to tenths by
the compiled `nearest-score-unit-ties-up` token, with the same non-negative
result as legacy `Math.round(value*10)/10`. Public values are numbers converted
from score units. Comparators use score units, not floating equality.

### 7.3 Adjustments

Only adjustments whose `appliesToCoreIds` contain the candidate core are evaluated. All applicable adjustment lines, including inactive lines, are recorded. This is required to prove completeness and to reconstruct why an adjustment did not apply.

Bonuses execute first in `(priority, id)` order. A condition matches when any answer intersects its option IDs. A bonus is active when `matchedCount >= minMatches`. Its requested points are:

```text
roundToTenths(points * matchedCount / conditionCount)
```

Its applied points are limited by remaining bonus budget. Conflicts then execute in `(priority, id)` order. A conflict is active when every condition matches. Its applied penalty is limited by remaining penalty budget. Zero applied values remain in the trace but do not count toward the confidence conflict deduction, matching legacy reason-count behavior.

Each adjustment line records:

```text
kind, id, priority, labelMessageId, status,
condition traces and matched option IDs,
matchedCount, requiredMatchCount, ratio,
operand, requestedPoints, budgetBefore,
appliedPoints, budgetAfter
```

`status` is one of `inactive`, `applied`, or `capped`. Phase totals and every line must be finite and non-negative.

The core total is:

```text
preFloor = baseTotal + appliedBonusTotal - appliedPenaltyTotal
finalTotal = roundToTenths(max(0, preFloor))
```

The trace verifier asserts this equality in score units.

### 7.4 Core selection, subtype, and style ranking

Within a style, all core candidates are ordered by:

```text
final score descending
compiled core priority ascending
core ID by Unicode code point ascending
```

The first is selected. No array insertion order participates.

The selected core must contain exactly one subtype whose `noodleId` equals the completed `noodle` answer. Zero or multiple matches are an invariant failure. There is no runtime fallback.

Selected styles are ordered globally by:

```text
final score descending
display priority ascending
style ID by Unicode code point ascending
```

They are then split by `style.family === answers.form[0]`. Primary and alternative groups are independently limited to three before confidence is computed. Eligibility does not filter either group.

### 7.5 Confidence

For each already-truncated group:

```text
nextScore = next displayed score, or current score - 4 for the final item
base = score / compiledMaximumScore * 100
gapBoost = min(10, max(0, score - nextScore) * 1.4)
uncertainty =
  6 if source includes unsure
  + 4 if signature includes no-preference
  + min(8, applied positive conflict count * 4)
rawConfidence = base + gapBoost - uncertainty
roundedConfidence = round(rawConfidence, 'nearest-integer-ties-toward-positive-infinity')
confidence = clamp(roundedConfidence, 24, 99)
```

The calculation order is frozen to the legacy ECMAScript-number order. The
declared confidence rounding token is exactly ECMAScript `Math.round`, including
ties for negative values moving toward positive infinity; it is not inferred
from the host or supplied as a default. All inputs are bounded finite
score-unit conversions. The trace records the maximum derivation, score, next
score, gap, base, boost, each deduction, raw value, rounding token, rounded
value, and clamped output.

`lowConfidence` is:

```text
results.length === 0
|| results[0].confidence < 72
|| results[0].score - (results[1]?.score ?? 0) < 5
```

## 8. Structured trace

The public trace types are closed and exact. An implementation may not add an
open details bag or substitute compiled definition objects for these fields.

```ts
type ScoringMatchTier = 'exact' | 'adjacent' | 'partial' | 'miss'
type AdjustmentTraceStatus = 'inactive' | 'applied' | 'capped'

interface QuestionScoreTraceLine {
  readonly questionId: QuestionId
  readonly questionPriority: number
  readonly answerOptionIds: readonly OptionId[]
  readonly ruleId: RuleId
  readonly rulePriority: number
  readonly tier: ScoringMatchTier
  readonly tierPriority: number
  readonly matchedOptionIds: readonly OptionId[]
  readonly ratio: number
  readonly weight: number
  readonly rawPoints: number
  readonly points: number
}

interface ConditionScoreTrace {
  readonly priority: number
  readonly questionId: QuestionId
  readonly answerOptionIds: readonly OptionId[]
  readonly targetOptionIds: readonly OptionId[]
  readonly matchedOptionIds: readonly OptionId[]
  readonly matched: boolean
}

interface AdjustmentScoreTraceLine {
  readonly kind: 'bonus' | 'conflict'
  readonly id: string
  readonly priority: number
  readonly labelMessageId: string
  readonly status: AdjustmentTraceStatus
  readonly conditions: readonly ConditionScoreTrace[]
  readonly matchedCount: number
  readonly requiredMatchCount: number
  readonly matchRatio: number
  readonly operand: number
  readonly requestedPoints: number
  readonly budgetBefore: number
  readonly appliedPoints: number
  readonly budgetAfter: number
}

interface CoreRankingKeys {
  readonly score: number
  readonly corePriority: number
  readonly coreId: CoreId
}

interface CoreScoreTrace {
  readonly styleId: StyleId
  readonly coreId: CoreId
  readonly corePriority: number
  readonly questionLines: readonly QuestionScoreTraceLine[]
  readonly adjustmentLines: readonly AdjustmentScoreTraceLine[]
  readonly baseTotal: number
  readonly bonusTotal: number
  readonly penaltyTotal: number
  readonly preFloorTotal: number
  readonly finalTotal: number
  readonly rankingKeys: CoreRankingKeys
  readonly selected: boolean
}

interface SubtypeResolutionTrace {
  readonly noodleOptionId: OptionId
  readonly matchingSubtypeIds: readonly [SubtypeId]
  readonly selectedSubtypeId: SubtypeId
}

interface StyleRankingKeys {
  readonly score: number
  readonly displayPriority: number
  readonly styleId: StyleId
}

type ConfidenceDeductionTrace =
  | {
      readonly priority: number
      readonly kind: 'answer-includes'
      readonly questionId: QuestionId
      readonly optionId: OptionId
      readonly matched: boolean
      readonly deduction: number
    }
  | {
      readonly priority: number
      readonly kind: 'applied-conflict-count'
      readonly count: number
      readonly deductionEach: number
      readonly deductionCap: number
      readonly deduction: number
    }

interface ConfidenceTrace {
  readonly maximumDerivation: 'base-weight-total-plus-bonus-cap'
  readonly maximumScore: number
  readonly score: number
  readonly nextScore: number
  readonly scoreGap: number
  readonly base: number
  readonly gapMultiplier: number
  readonly gapBoostBeforeCap: number
  readonly gapBoostCap: number
  readonly gapBoost: number
  readonly deductions: readonly ConfidenceDeductionTrace[]
  readonly uncertaintyTotal: number
  readonly rawConfidence: number
  readonly rounding: 'nearest-integer-ties-toward-positive-infinity'
  readonly roundedConfidence: number
  readonly minimum: number
  readonly maximum: number
  readonly confidence: number
}

interface StyleScoreTrace {
  readonly styleId: StyleId
  readonly family: StyleFamilyId
  readonly displayPriority: number
  readonly coreCandidates: readonly CoreScoreTrace[]
  readonly selectedCoreId: CoreId
  readonly subtypeResolution: SubtypeResolutionTrace
  readonly rankingKeys: StyleRankingKeys
  readonly group: 'primary' | 'alternative'
  readonly groupRank: number
  readonly displayPosition: number | null
  readonly confidence: ConfidenceTrace | null
}

interface RankingTraceEntry {
  readonly styleId: StyleId
  readonly score: number
  readonly displayPriority: number
  readonly rankingKeys: StyleRankingKeys
  readonly groupRank: number
  readonly selected: boolean
}

interface LowConfidenceTrace {
  readonly hasPrimaryResult: boolean
  readonly topConfidence: number | null
  readonly confidenceThreshold: number
  readonly confidenceBelowThreshold: boolean
  readonly topScore: number | null
  readonly secondScore: number | null
  readonly scoreGap: number | null
  readonly scoreGapThreshold: number
  readonly scoreGapBelowThreshold: boolean
  readonly lowConfidence: boolean
}

interface ScoreTrace {
  readonly modelVersion: string
  readonly dataVersion: string
  readonly questionModelIdentity: {
    readonly modelVersion: string
    readonly semanticHash: string
  }
  readonly styleModelIdentity: {
    readonly modelVersion: string
    readonly semanticHash: string
    readonly dataVersion: string
  }
  readonly policyIdentity: {
    readonly semanticHash: string
    readonly dataVersion: string
  }
  readonly styleCandidates: readonly StyleScoreTrace[]
  readonly primaryRanking: readonly RankingTraceEntry[]
  readonly alternativeRanking: readonly RankingTraceEntry[]
  readonly selectedPrimaryStyleIds: readonly StyleId[]
  readonly selectedAlternativeStyleIds: readonly StyleId[]
  readonly lowConfidence: LowConfidenceTrace
}
```

Question lines use policy question order. Answer, target, and matched option IDs
use compiled option order. Adjustment lines use bonus phase then conflict phase,
then `(priority, id)` within each phase; condition lines use `(priority,
questionId)`. An inactive adjustment has requested/applied points zero and
equal before/after budgets. A `capped` active adjustment has requested points
greater than its remaining budget, including a zero remaining budget.

`CoreScoreTrace.questionLines` always contains seven lines.
`CoreScoreTrace.adjustmentLines` contains every applicable active or inactive
adjustment. Core candidates are in the declared core comparator order and
exactly one is selected. `SubtypeResolutionTrace.matchingSubtypeIds` is an
exactly-one tuple; zero or multiple matches are an invariant failure.

`styleCandidates` contains all 18 styles in the global style comparator order.
`primaryRanking` and `alternativeRanking` contain the complete unsliced group
rankings. Every `groupRank` is zero-based within its full group.
`selectedPrimaryStyleIds` and `selectedAlternativeStyleIds` are their first
configured limits. Displayed candidates have zero-based `displayPosition`
within their returned group and a confidence trace; undisplayed candidates
have both fields `null`. Every `ScoredStyleResult.trace` is the exact same
object reference as its matching `styleCandidates` entry, not a copy.

Confidence deductions are ordered by policy priority and include unmatched
answer predicates with deduction zero. The conflict-count line records only
positive applied conflicts. `LowConfidenceTrace` uses null numeric inputs when
there is no primary result; in that state `confidenceBelowThreshold` and
`scoreGapBelowThreshold` are both `false`, and `lowConfidence` is `true` solely
because `hasPrimaryResult` is `false`. With one primary result, `secondScore`
is the legacy fallback zero and `scoreGap` is the top score. These values make
the final decision reconstructable without nullable arithmetic.

No eligibility decision is present. Batch 3C may add a separately versioned
composition trace around Batch 3B output; Batch 3B does not reserve a boolean
that could be mistaken for a decision. Stable message IDs are retained on
adjustment and compiled style entities. Rendering code can combine trace values
with question/option/style/core/subtype/tier message IDs later. The trace never
embeds legacy Chinese notes or any translated answer label.

## 9. Parity and fixture design

### 9.1 Scope

The scoring parity scope is named:

```text
legacy-scoring-result-projection
```

It includes valid completed-answer numerical scoring, selected core/subtype, primary/alternative ranking, displayed limits, confidence, low confidence, and sufficient structured observation to reconstruct all core/style ranking decisions. It excludes eligibility, blocked lead, catalog recommendations, localized text, copied definitions, and invalid-input behavior.

All scoring seeds must have `exclusions:['none']`. The extractor and offline schema reject any other exclusion selection. With that value the frozen legacy eligibility filter is neutral, making the observed result a pure scoring projection. Batch 3C will own excluded-answer observations.

### 9.2 Authoring trust boundary

The authoring transaction reuses the accepted hardened shared authoring framework:

1. verify exact GitHub repository, commit, tree, clean status, tracked-source hashes, and lockfile hash;
2. create an isolated temporary worktree;
3. copy the already validated dependency tree and bind its installed-lock/dependency-tree hashes;
4. apply an exact instrumentation-only patch;
5. run the complete legacy suite after instrumentation;
6. run only the extraction test under `sandbox-exec` with network denied, UTC timezone, and `C.UTF-8` locale;
7. pass seeds/output only through a random same-directory capability file;
8. validate bounded strict raw output;
9. publish `cases.json` and `manifest.json` atomically with rollback/recovery protection; and
10. remove the temporary worktree without altering the neighboring legacy checkout.

The frozen dependency/runtime inputs are the accepted full-source Batch 3A
authoring inputs, independently rebound under scoring-named constants:

```text
tracked source count                 66
tracked-source-map aggregate hash   620205eb20d687bc750973d97b6877018d1ea9fb62e591f7bac1eadd22e1084a
legacy package-lock hash            be7ff42d1012d310916d38c082f63f8b5263981c6bd2ded2ff0f6dabe7fc29d2
installed lockfile hash             b2cfca89d746d1605cc9d14de89b896866b73581ce83f212669b28e1c447cd6e
installed dependency-tree hash      edbb010c241e278706dc2c0ee44b4f25f03c7423303f19eb23bbeb0f26203826
extraction Node version             24.14.0
timezone / locale / network         UTC / C.UTF-8 / denied
```

This authoring runtime is distinct from the repository task shell, which uses
Node `v24.16.0`. Changing any frozen authoring input requires a reviewed truth-
boundary maintenance task; it is not silently refreshed during extraction.
The new scoring instrumentation, seeds, and extractor-source hashes are derived
only after their reviewed bytes exist and are then fixed in the manifest and
contracts.

The patch adds an observer test and minimally instruments the legacy scorer at the actual rule, adjustment, collapse, and confidence calculation sites. Observer callbacks are passive and absent from the normal API. The full legacy suite must pass with the patch. Reimplementing the scorer inside the extractor is forbidden.

Ordinary CI uses committed fixtures only and never requires a neighboring checkout or network.

### 9.3 Bounded seed corpus

The committed seed file is strict, canonical, and coverage-driven. It stores the
new array-valued `CompletedAnswers` shape. The observer performs only a checked
shape conversion to the legacy scalar fields for single-select questions; it
does not alter option values, selection order, or scoring behavior. The seed
file contains:

- array-shape projections of the five source-native legacy canonical fixtures
  (`iekei`, `jiro`, `duckShellfish`, `konbusui`, and `taiwanMazesoba`);
- deterministic reviewed style-targeted candidates sufficient for each of all
  18 display styles to become the top primary result, with the extractor
  proving the observed winner rather than the seed claiming an expected score;
- deterministic single-question tier probes produced from valid flow completions;
- deterministic multi-answer probes for every adjustment condition and threshold;
- active and inactive cases for all 18 unique bonuses and 7 unique conflicts;
- exact 5-point bonus and 15-point penalty cap boundaries;
- a reachable score-floor case where available, plus an explicit compiled-contract floor case;
- equal-core and equal-style observations;
- all five noodle resolutions across selected cores;
- both sides of confidence and low-confidence boundaries;
- maximum confidence and maximum score observations;
- primary and alternative result-limit boundaries; and
- explicit arithmetic and ranking reconstruction cases.

Candidate inputs come only from the accepted compiled question model and seed declarations. `evaluateFlow` must prove every seed complete before authoring. A deterministic greedy set-cover pass selects the lexicographically first smallest known case for uncovered obligations. It may enumerate only bounded per-question and adjustment-targeted candidate families; it must not materialize the unbounded Cartesian product.

The closed resource bounds are 256 seed/fixture cases, 120 code points per case
ID, the accepted eight questions and their compiled selection maxima, exactly
54 core traces and 18 selected-style traces per observation, at most six
displayed results, and 64 MiB for each raw or canonical cases file. The exact
legacy observer refuses to write an oversized raw payload, and the authoring
adapter/schema rechecks the bound before publication. Manifest and schema tests
fix these constants; raising one is a reviewed contract change.

Coverage obligations use stable keys such as:

```text
style-top/<styleId>
rule-tier/<ruleId>/<tier>
bonus/<id>/active|inactive
conflict/<id>/active|inactive
boundary/bonus-cap|penalty-cap|score-floor|equal-core|equal-style
boundary/confidence/<case>
subtype/<noodleId>
ranking/primary-limit|alternative-limit
```

Empty undeclared tier target sets are marked `not-declared`; impossible product states cannot be claimed as observed. A policy mechanism that production data cannot truncate is tested by a compiled-contract fixture, while production observations still prove reaching the exact current cap. The manifest distinguishes `legacyObserved` obligations from `compiledContract` obligations so no synthetic result is represented as a legacy observation.

### 9.4 Observed output

Each case records:

- canonical completed answers;
- all 54 core question lines and adjusted totals captured by instrumentation;
- all applicable active/inactive adjustment lines;
- the selected core and exact subtype for all 18 styles;
- explicit core/style ranking keys;
- complete primary and alternative ranked style IDs;
- displayed result slices;
- confidence inputs/outputs for displayed results; and
- low-confidence inputs/output.

The fixture schema is bounded by case count, string length, array length, entity inventory, output bytes, safe numbers, and exact own keys. Cases and obligations have canonical stable order. Fixture and manifest hashes cover all bytes and authoring evidence.

### 9.5 Expected divergence policy

There are no Batch 3B parity waivers. Valid no-exclusion fixture output must match exactly.

Explicit priority replaces hidden source order without changing output because Batch 3A seeded priorities from that frozen order. Exact subtype failure and invalid-answer failure normalize states outside the valid legacy product domain and therefore are not fixture divergences. Any valid-case numerical or ordering difference stops implementation and requires a separately approved ADR, exact fixture diff, and model-version decision. It cannot be hidden as normalization.

## 10. Properties and invariants

Tests must prove:

- each core base equals the sum of seven line points in score units;
- base plus applied bonus minus applied penalty, after floor, equals final;
- all public numeric values are finite;
- policy compilation rejects every direct score operand that is not exactly
  representable in score units and every possible unsafe score-unit
  intermediate;
- derived maximum is positive and equals base-weight total plus bonus cap;
- confidence is an integer in [24,99];
- all trace IDs resolve to the exact compiled model;
- each displayed result references the same frozen `StyleScoreTrace` held by the top-level trace;
- core and style comparators are antisymmetric and transitive and yield a total order;
- reversing source style/core/rule/target/condition/adjustment arrays cannot change successful bytes when explicit priorities remain;
- object-key insertion order, answer object key order, and valid multi-select
  option permutations cannot change output;
- duplicate priorities fail compilation;
- every valid noodle resolves exactly once;
- repeated runs serialize byte-identically;
- input model/answers are not mutated;
- every success and failure result is deeply frozen;
- runtime imports contain no Node, Zod, React, DOM, storage, network, compiler, definition, legacy, eligibility, catalog, locale, Date, random, or file I/O edge; and
- no trace or diagnostic contains an absolute path or localized rendered copy.

## 11. Versioning and persistence

Batch 3B makes numerical ranking behavior active, so:

- global `ClassificationModel.modelVersion` becomes `batch3b.1.0`;
- the classification `dataVersion` changes;
- the compiled policy receives source, semantic, and data hashes;
- the generated classification artifact and manifest gain policy identity;
- `scoringPolicy.origin` becomes `legacy-production`; and
- after exact-SHA acceptance only, scoring assurance becomes `parity-verified` for `legacy-scoring-result-projection`.

The question model remains `batch2a.1.0`; the style model remains `batch3a.1.0`. Their artifacts and hashes do not change. This deliberate version decoupling replaces the temporary Batch 3A top-level/style version-equality check with explicit component identity binding.

No persistence schema or model migration is required. Batch 2B payloads bind `questionModelVersion` and `questionSemanticHash`, both unchanged. Persistence does not store global classification, style, or policy identity, and Batch 3B must not add those fields.

At the local candidate, scoring is exactly
`legacy-production / compiler-validated`, carries local policy/fixture
identities but no Batch 3B verification object, and readiness remains
`migration-only` with all four accepted blockers. After the exact candidate
passes canonical CI and acceptance metadata is committed, scoring alone becomes
`legacy-production / parity-verified` and only
`scoring-not-production-verified` is removed. These remain:

```text
persistence-adapter-not-integrated
persisted-data-cutover-incomplete
runtime-cutover-incomplete
```

Persistence assurance stays `contract-verified`. Style assurance and its narrowly named parity scope remain unchanged.

## 12. Ownership and acceptance transaction

The Batch 3B ledger entry will distinguish:

- implementation paths: policy/scoring contracts, definition/compiler/composition, generated classification model, runtime scorer, scoring parity authoring/fixtures, design and plan;
- verification paths: package scripts, acceptance, documentation, migration, runtime import validation, and classification validation;
- acceptance metadata paths: exactly `docs/classification/index.md`, `docs/classification/manifest.json`, `docs/migration/ledger.json`, and `docs/migration/ledger.md`.

The local implementation candidate includes complete code, fixtures, offline
verification, ownership wiring, and candidate-state generated metadata. It
records no remote success and does not remove the scoring blocker. After user
authorization, that exact SHA is pushed and canonical CI is observed. Only a
successful exact candidate run may be recorded. The subsequent acceptance
commit has the implementation candidate as its direct parent, changes exactly
the four metadata files, marks Batch 3B complete, records the candidate SHA/run
URL/policy and fixture identities, upgrades scoring assurance, and removes only
the scoring blocker. The metadata SHA must also pass canonical CI. That later
metadata-SHA success is retained in ignored evidence and the completion report;
recording it inside the same metadata commit would create a forbidden self-
evidence cycle.

Failed or superseded candidates/runs never enter acceptance metadata. A later maintenance candidate must repeat the exact-SHA transaction rather than overwriting history.

## 13. Batch 3C handoff

Batch 3C consumes the complete unfiltered style-candidate trace and ranked scoring output. It may classify styles as eligible/blocked and reproduce blocked-lead interaction without changing any score, selected core, subtype, scoring trace, or confidence formula. Whether confidence must be recomputed after eligibility filtering is a Batch 3C contract decision that must be derived from the frozen mixed legacy behavior; Batch 3B does not precompute or claim it.

Batch 3B does not interpret exclusion answers, map `beef` or `shrimp-crab`, emit safety claims, or reserve an eligibility result field.

## 14. Explicit non-goals

- Batch 3C eligibility and blocked lead
- item-level allergy safety
- catalog recommendation or Finder mapping
- React, web routing, UI, or user-visible result changes
- localization rendering
- browser/localStorage adapter or autosave/quarantine behavior
- production runtime cutover
- persistence schema/model migration
- policy tuning or redesign
- ML, personalization, or telemetry
- a new score scale
- editing accepted question/style semantics or parity fixtures

## 15. Stop conditions

Implementation stops for user adjudication if:

- any valid no-exclusion legacy observation cannot be reproduced exactly;
- a rounding/confidence value admits multiple source-supported interpretations;
- eligibility cannot remain absent from the observation projection;
- policy ownership would require editing a protected question/style semantic path;
- question/style accepted artifact bytes or hashes change;
- the bounded seed corpus cannot meet declared coverage;
- a parity waiver or expected valid-case divergence is required;
- the generated model requires a runtime compiler/definition/Node dependency;
- the public API needs definitions, localized text, catalog data, or eligibility overrides;
- persistence identity would need to change;
- ownership paths overlap an accepted ledger owner without an explicit Batch 3B transfer;
- exact-SHA candidate/metadata acceptance forms a CI dependency cycle; or
- an independent review requires an unapproved experimental production change.

The report format is:

```text
Problem
-> governing architecture / legacy source / accepted contract
-> evidence
-> option A
-> option B
-> recommendation
```

## 16. Approval decisions

Approval of this design approves these decisions:

1. use `definitions/policies.ts` as the sole behavioral scoring-policy owner while retaining protected question weights only as validated compatibility mirrors;
2. bump only the global model to `batch3b.1.0` and preserve exact question/style artifact identities;
3. add a generated public `classificationModel` and pure `scoreCompletedAnswers(model, answers)` union API;
4. record all 54 core candidates and inactive applicable adjustments in the structured trace;
5. use integer tenths for score arithmetic while preserving legacy confidence calculation order;
6. replace hidden source-order ties with accepted explicit priorities and stable IDs without output change;
7. normalize invalid answers/models and missing subtype to bounded failures rather than legacy fallback/throws;
8. bind parity to valid `exclusions:['none']` observations and defer every eligibility effect to Batch 3C;
9. permit no valid-case parity waiver; and
10. use a candidate/exact-SHA/metadata exact-SHA acceptance transaction that removes only the scoring readiness blocker.
