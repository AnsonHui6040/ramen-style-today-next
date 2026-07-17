# Batch 3C Eligibility Design

**Status:** independently reviewed; implementation authorized

**Date:** 2026-07-17

**Accepted baseline:** `13f9b7fd4939f182362ff15a5c9862f6198abe94` (`Accept Batch 3B scoring and trace`)

**Frozen legacy source:** commit `eebf00b7ddfbbe6f01ff598e57f1e17197068a37`, tree `3e527de876cfeccfd3154ddc492830d71c4cfd9a`

## Purpose and boundaries

Batch 3C adds one deterministic eligibility layer after scoring:

```text
ClassificationModel + CompletedAnswers + complete ScoringOutcome
  -> EvaluateEligibilityResult
```

Eligibility consumes scores and complete rankings but never changes core/style
scores, confidence, ranking comparators, or scoring trace. Blocked candidates
remain in the original scoring outcome and ranking. The core stays pure,
browser-neutral, localized-copy-free, deeply immutable, and independent of
catalog, Finder, React, storage, network, files, locale, time, and randomness.

The accepted question model, style model, scoring-policy semantic hash/data
version, scoring parity projection, and persistence contracts remain unchanged.
Only the global classification model advances to `batch3c.1.0`. The scoring
policy component keeps model version `batch3b.1.0`, semantic hash
`76c768181a4a402abb33e7c4b30f7a8b4aa159db14ea827898e79b380cd132f6`,
and data version
`36ad616a2f709fe2bb6ddcfd5e0cb0eb16ecdea15f42e41640588cf61e068ed7`.
Eligibility has its own schema/compiler version `1`, semantic hash, and data
version.

The compiler, runtime identity check, and validator must remove only the old
root-version-equals-scoring-component-version coupling. Scoring policy source
projection and metadata use the component's `batch3b.1.0`; identical Batch 3B
policy/question/style inputs must continue to produce the exact accepted
policy modelVersion, semantic hash, and data version. This integration change
must not change policy behavior, scoring arithmetic, ranking, confidence, or
their projections. `ScoringOutcome.modelVersion` and `dataVersion` identify
the global classification model; `trace.policyIdentity` identifies the
unchanged scoring component. They are not interchangeable identities.

## Legacy audit

The audit followed the complete behavior chain:

```text
src/data/questions.json + src/domain/types.ts + src/domain/schema.ts
  -> src/data/styles.json
  -> src/lib/scoring/scorer.ts
  -> src/lib/scoring/explainer.ts
  -> src/lib/catalog/enricher.ts
  -> src/App.tsx orchestration
  -> src/features/results/ResultsPanel.tsx + src/i18n.ts
  -> src/features/map/RamenFinderMap.tsx
  -> scorer, App, result-panel, map, config, schema, and catalog tests/fixtures
```

Legacy `blockedByExclusions` returns no blocks when `none` is present;
otherwise it intersects selected exclusions with the style's `ingredients`.
Eligibility is style-wide: every core and subtype of that style inherits the
same restriction. No legacy core-specific or subtype-specific restriction
exists. `App.tsx` runs `scoreQuestionnaire` and then catalog enrichment before
storing the UI outcome. Catalog enrichment consumes already selected results;
Finder receives the selected lead and only derives its initial style filter.
Neither catalog nor Finder decides eligibility or supplies rule data.
Explanations do not add eligibility arithmetic. Catalog, Finder, App/web shape,
and their localized copy are therefore consumer evidence only and are not
eligibility inputs, rule sources, or parity content.

Legacy visible and blocked groups are independently collapsed/ranked, then
split by the answered `form`. Up to three eligible primary and three eligible
alternative candidates are selected. The warning lead is the highest blocked
primary only when there is no eligible primary or its score is greater than or
equal to the eligible lead. Blocked alternatives never become the warning lead.
When no primary is eligible, alternatives remain available. Localized legacy
copy is consumer behavior and is outside parity and the runtime contract.

## Closed exclusion policy

The exclusions question has nine options. `none` is exclusive and cannot be
combined with another option in valid `CompletedAnswers`.

| Exclusion option | Restriction tag | Legacy blocked styles |
| --- | --- | --- |
| `pork` | `pork` | `tonkotsu`, `iekei`, `jiro`, `hakata`, `aburasoba`, `taiwan-mazesoba` |
| `chicken` | `chicken` | `chicken-chintan`, `chicken-paitan` |
| `duck` | `duck` | `duck-chintan`, `duck-paitan` |
| `beef` | none | none |
| `fish-seafood` | `fish-seafood` | `gyokai`, `konbusui-tsukemen`, `gyokai-tsukemen` |
| `shellfish` | `shellfish` | `shellfish-dashi` |
| `shrimp-crab` | none | none |
| `dairy` | `dairy` | `sapporo` |
| `none` | none; exclusive | none |

The compiled policy contains all nine option rows in question order. Blocking
rows derive their exact style inventory from accepted compiled style tags.
Multiple exclusions are evaluated in policy priority order and their matched
reasons are merged without duplicates. Definition order and input answer order
cannot change output.

## Decisions and output

The only public function is:

```ts
evaluateEligibility(model, completedAnswers, scoringOutcome)
```

A successful outcome contains:

- the unchanged original scoring outcome by value;
- the eligibility-policy identity and selected exclusions;
- every original primary and alternative ranking entry with original rank,
  score, core/subtype identity, original display position, and scoring trace;
- an `eligible` or `blocked` decision for every candidate;
- the full eligible primary/alternative rankings as stable subsequences;
- up to the scoring policy's accepted limits for primary results and
  alternatives, plus the selected primary lead;
- all blocked candidates and the legacy-compatible blocked primary lead;
- `noPrimaryEligible` and `noEligibleCandidate` facts;
- bounded reason objects and a reconstructable eligibility trace; and
- an empty diagnostics array.

Confidence is copied only when it already exists in the scoring candidate.
Eligibility never computes or reassigns confidence; a replacement outside the
original displayed slice therefore carries `confidence: null` while retaining
its score and full scoring trace.

Successful candidate decisions are only `eligible` or `blocked`. `unavailable`
means the supplied scoring result is not the required complete ranking;
`unresolved` means a selected exclusion cannot be resolved by the closed
policy. Both are whole-call bounded failures, never silently eligible results.

The single stable blocking reason code is:

```text
ELIGIBILITY_EXCLUSION_CONFLICT
```

Each reason identifies the policy rule, exclusion option, restriction tag,
style, core, and subtype. It is an unlocalized warning fact: the selected
exclusion conflicts with candidate tags. It never claims that an eligible
candidate is safe, allergen-free, medically suitable, or verified by a shop.

## Trace and failures

The trace contains exactly the global model identity, question/style/scoring
and eligibility-policy identities, canonical selected exclusions, immutable
original primary/alternative rankings, per-candidate evaluated tags, active
and inactive policy rows, matched rows, decisions/reasons, eligible stable
subsequences, selected primary/results/alternatives, blocked lead, and both
no-eligible facts. It references scoring identities/rank/score/trace without
copying scoring arithmetic lines into a new eligibility arithmetic model.

The failure union has one bounded diagnostic and no partial outcome:

```text
ELIGIBILITY_COMPLETED_ANSWERS_INVALID   // invalid/unknown/exclusive conflict
ELIGIBILITY_SCORING_RESULT_INVALID      // unavailable/incomplete or mutated ranking
ELIGIBILITY_MODEL_IDENTITY_MISMATCH     // global/policy/scoring identity mismatch
ELIGIBILITY_DECISION_UNRESOLVED         // closed policy cannot decide a candidate
ELIGIBILITY_INVARIANT_FAILED            // trace or policy invariant failure
```

Diagnostics use fixed source/path/message values, contain no arbitrary input,
exception text, stack, absolute path, or localized sentence. Unknown options,
unknown tags, missing candidates, identity drift, and policy coverage gaps fail
closed.

## Determinism and parity

Original ranking order is authoritative. Eligible rankings are stable
subsequences; ties are never re-sorted. Candidate and rule inventories are
validated as closed, unique, and complete. The function does not mutate input,
deep-freezes output, and produces byte-stable JSON for equal valid inputs.

The committed offline corpus is bounded to at most 128 cases and 32 MiB. Its
scope is:

```text
legacy-eligibility-result-projection
```

It covers every exclusion option, active/inactive blocking rows, no exclusion,
multi-exclusion, primary and alternative blocking, top-N replacement,
all-primary/no-primary, ordering boundaries, reason projection, blocked lead,
and result-count boundaries. The accepted legacy inventory cannot block all 18
styles because three styles have no tags, so the all-candidates-blocked runtime
invariant is tested with an internal closed synthetic policy and is not claimed
as observed legacy parity. Valid observed legacy cases require zero waivers.

Parity compares candidate decisions, reason facts, selected lead/results,
alternatives, stable ordering, no-primary/no-eligible facts, and legacy warning
lead. It excludes confidence recomputation, localized sentences, catalog,
Finder, web shapes, and medical wording.

## Acceptance boundary

The implementation candidate must preserve the accepted scoring policy
semantic hash `76c768181a4a402abb33e7c4b30f7a8b4aa159db14ea827898e79b380cd132f6`
and data version `36ad616a2f709fe2bb6ddcfd5e0cb0eb16ecdea15f42e41640588cf61e068ed7`,
the question/style/persistence identities, and scoring parity 26/0/0.

After exact-SHA candidate CI succeeds, only the four accepted metadata files
may mark Batch 3C complete and eligibility
`legacy-production / parity-verified` with the scope above. Readiness remains
`migration-only`; the three persistence/runtime-cutover blockers remain. Batch
4A, Batch 4B, web, catalog/Finder adapters, localized eligibility copy,
persistence integration, and production cutover are not part of Batch 3C.
