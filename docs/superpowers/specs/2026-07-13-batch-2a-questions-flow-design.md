# Batch 2A Questions and Flow Design

- **Status:** Direction approved; written specification review required
- **Direction approval:** Approved by the user on 2026-07-13
- **Repository:** `AnsonHui6040/ramen-style-today-next`
- **Legacy oracle:** `AnsonHui6040/ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37`
- **Legacy tree:** `3e527de876cfeccfd3154ddc492830d71c4cfd9a`
- **Parent design:** `docs/superpowers/specs/2026-07-11-classification-architecture-design.md`
- **Date:** 2026-07-13

## 1. Decision

Batch 2A will replace the synthetic question inventory with contract-first production question definitions, compile them into a deterministic tracked artifact, evaluate them through a pure questionnaire runtime, and prove semantic parity against frozen fixtures extracted from the verified legacy commit.

This batch preserves the complete legacy questionnaire behavior. It may expose legacy defects through diagnostics or fixtures, but it must not silently correct product behavior. Any intentional behavior change requires a separate approval path.

The selected architecture is:

```text
production question definitions
        ↓ compiler validation and proof
canonical compiled question artifact
        ↓ pure flow runtime
canonical FlowState and transitions
        ↓ frozen semantic parity fixtures
legacy behavior verification
```

Direct runtime interpretation of JSON and a copied `stepIndex` state machine were rejected. Both would preserve hidden ordering assumptions and make future changes harder to validate.

## 2. Scope

Batch 2A owns:

- the eight production questions: `form`, `archetype`, `tare`, `source`, `body`, `noodle`, `signature`, and `exclusions`
- stable `QuestionId`, `OptionId`, and `MessageId` contracts
- selection rules, exclusive options, UI initial selections, serializable conditions, allowed-option decision tables, and single-option auto-answer policy
- compiler validation, canonicalization, semantic dependency derivation, finite semantic exploration, and proof obligations
- a deterministic tracked compiled question artifact
- pure answer submission, evaluation, pending-selection, and navigation APIs
- frozen legacy question-flow fixtures, their extractor, integrity checks, semantic parity replay, and coverage gates
- question-specific provenance, migration-ledger evidence, classification-index ownership, and repository verification commands

Batch 2A does not own:

- persisted envelopes, localStorage migration, persistence repair write-back, or quarantine behavior; those remain Batch 2B
- scoring, ranking, confidence, style compilation, or eligibility
- React components, browser state, translations, catalog data, Finder data, or visual design
- production cutover or changes to the legacy repository

`weight` metadata may be preserved on the correct domain node for later migration, but no Batch 2A runtime function may read it or produce a score.

## 3. Package and dependency boundaries

The question pipeline is split by responsibility:

```text
packages/classification-core/src/definitions/questions.ts
        ↓
packages/classification-core/src/compiler/questions/**
        ↓
packages/classification-core/src/generated/question-model.ts
        ↓
packages/classification-core/src/flow/**

tools/parity/questions/** ──→ verified temporary legacy worktree
tests/parity or core parity tests ──→ runtime + frozen fixtures
```

The runtime root may export only:

- the deep-readonly compiled question artifact
- public question, answer, flow, repair, diagnostic, and navigation types
- `decodeAnswerDraft`
- pure runtime functions such as `applyAnswer`, `evaluateFlow`, `updatePendingSelection`, and navigation helpers

The runtime root must not export or import:

- compiler implementations or Zod compiler schemas
- source definitions or generators
- fixture extractors or legacy adapters
- `node:*`, filesystem APIs, React, DOM APIs, localStorage, catalog data, styles, scoring, or legacy code

Package exports and import-boundary tests must enforce this separation. Zod may be used for Node-side structural compilation, but the public browser-neutral runtime decoder must use primitives that do not pull the compiler or Zod into the root runtime graph.

## 4. Source definition contract

Domain identity, localization identity, and authoring order are independent:

| Field | Meaning |
| --- | --- |
| `QuestionId` | flow, dependency, fixture, and future persistence identity |
| `OptionId` | answer, condition, fixture, and future persistence identity |
| `MessageId` | localization lookup only |
| `order` | display and canonical ordering; never identity |

Array position is never an identity or an implicit branch rule. Question and option IDs are globally stable contracts. A message-key change cannot rename an answer, and reordering source arrays cannot change identity.

The source schema separates the semantic purpose of each condition:

```ts
interface QuestionDefinitionSource {
  id: QuestionId
  order: number
  messageIds: {
    title: MessageId
    description: MessageId
  }
  selection: SelectionRuleSource
  availableWhen?: SerializableCondition
  options: readonly OptionDefinitionSource[]
  allowedOptions?: AllowedOptionDecisionTable
  autoAnswer?: AutoAnswerRuleSource
  initialUiOptionIds?: readonly OptionId[]
}

interface OptionDefinitionSource {
  id: OptionId
  order: number
  messageIds: {
    label: MessageId
    description?: MessageId
  }
  availableWhen?: SerializableCondition
  exclusive?: boolean
  weight?: number
}
```

A generic unlabelled `conditions[]` field is forbidden because the compiler must not guess whether a predicate controls question reachability, option availability, answer validity, selection bounds, or forced eligibility.

The condition language is a closed, serializable abstract syntax tree. It may express only operators the compiler can analyze completely, including explicit answer membership and bounded `all`, `any`, and `not` composition. JavaScript closures and unknown operator extensions are rejected. If a future condition cannot be included in the sound finite abstraction, the compiler must reject it rather than silently downgrade proof coverage.

The archetype decision tables for `tare`, `source`, `body`, `noodle`, and `signature` must list every production archetype branch explicitly, including branches that allow every option. An explicit allow-all row still creates a semantic dependency on `archetype`.

Selection constraints must obey these local invariants:

- question and option `order` values are unique within their level
- single selection has `maxSelections === 1`
- `minSelections` and `maxSelections` are non-negative, satisfiable, and consistent with selection type
- every exclusive option belongs to its question and is valid by itself
- the production model supports at most one exclusive option per question unless a later approved contract defines multi-exclusive behavior
- `initialUiOptionIds` belong to the question and form a legal displayable selection in every reachable interactive state where they may be shown, but they are never answers
- every referenced question and option exists and belongs to the expected owner

## 5. Compiler pipeline and deterministic canonicalization

Compilation follows this exact order:

1. structurally decode source input
2. validate IDs, references, and local selection rules
3. normalize a canonical intermediate representation
4. extract condition references and derive semantic dependencies
5. validate graph cycles, closures, and topological properties
6. perform finite semantic exploration over sound equivalence classes
7. prove completion, forced resolution, normalization, and reachability obligations
8. serialize the final compiled artifact canonically
9. emit the tracked artifact and associated manifests

Canonicalization occurs before graph derivation and semantic exploration so diagnostics, exploration order, hashes, and generated output do not depend on source insertion order.

The canonical intermediate representation fixes:

- questions by `order`, with ID as a defensive tie-break even though duplicate order is rejected
- options by option `order`, with ID as a defensive tie-break
- submitted selections by compiled option order
- commutative `all` and `any` condition nodes by stable canonical key
- dependency, closure, reachability, coverage, and diagnostic lists by deterministic order
- object field emission order
- the representation of omitted values, defaults, and empty arrays

## 6. Semantic dependency graph

Source definitions do not hand-author `dependsOn`. The compiler derives dependencies from every serializable rule that can alter:

- whether a question is reachable
- whether an option is available
- the allowed-option decision-table output
- effective minimum or maximum selections
- forced-answer eligibility
- whether an existing answer remains valid

The compiled model exposes semantic dependencies, transitive dependent closures, and a topological evaluation order. Display `question.order` remains a separate concept used for UI sequence, navigation, and diagnostic ordering.

When an accepted submitted answer changes, `applyAnswer` removes only submitted answers in the compiler-derived transitive dependent closure. Therefore changing `form` invalidates `archetype`, which invalidates the preference questions. `exclusions` is preserved because it has no semantic dependency on those answers. If a future exclusions rule gains such a dependency, the graph will make it invalidatable without a question-ID special case.

No runtime code may encode question ranges such as “tare through signature” or branch on `stepIndex`.

## 7. Sound finite semantic exploration

The compiler does not run an unbounded Cartesian product. It may merge answer states only when they are indistinguishable to every flow semantic operation.

Conceptually, two states are equivalent only when their semantic signatures are equal across:

```ts
interface SemanticSignature {
  conditionTruthVector: readonly boolean[]
  reachableQuestionIds: readonly QuestionId[]
  allowedOptionIdsByQuestion: Readonly<
    Partial<Record<QuestionId, readonly OptionId[]>>
  >
  effectiveSelectionBounds: Readonly<
    Partial<Record<QuestionId, EffectiveSelectionBounds>>
  >
  forcedEligibility: Readonly<
    Partial<Record<QuestionId, ForcedEligibility>>
  >
  answerValidity: Readonly<
    Partial<Record<QuestionId, AnswerValidityClass>>
  >
}
```

The implementation need not emit this interface, but its abstraction must be equivalent in coverage. Looking only at condition truth values is insufficient because two branches may make the same question reachable while producing different allowed options, bounds, forced behavior, or validity.

For each question and applicable semantic environment, exploration includes representative local selection states for:

- unanswered
- exactly the minimum legal selection count
- exactly the maximum legal selection count
- below minimum and above maximum when representable
- each exclusive option by itself
- exclusive plus ordinary conflict
- a single allowed option eligible for forced resolution
- an empty allowed-option branch
- a previously legal option that became disallowed
- an explicit decision-table branch allowing all options
- any specific multi-option combination referenced by the condition AST

Compiler proof coverage and legacy fixture coverage are separate gates. The compiler must prove every formal reachable question and option appears in at least one reachable explored state. It must not depend on legacy fixtures or require every formal concept to appear in a parity path.

## 8. Compiler proof obligations

Compilation fails unless the finite exploration proves:

- every reachable incomplete state has a legal next action
- every reachable selection constraint is satisfiable
- no reachable branch has an empty allowed-option set unless the state is already complete by an explicit rule
- every completion path can reach a complete state
- complete answers contain every required reachable answer and no unreachable answer
- exclusive and ordinary selections cannot coexist in canonical answers
- every forced answer satisfies the effective selection constraints
- forced resolution reaches a fixed point
- forced resolution and normalization are idempotent
- the semantic dependency graph is acyclic
- every formal question and every formal reachable option is reachable in at least one explored state

Forced resolution is designed to be monotonic: it adds an answer only for an unanswered forced question or replaces a stale forced value with the unique currently legal value. It cannot mutate upstream submitted answers or repeatedly withdraw and restore the same forced value.

The compiler and runtime also generate a canonical state key after each forced iteration. Repeating a key before fixed point produces `forced-resolution-cycle`. Runtime evaluation has a deterministic iteration upper bound derived from the number of questions and compiled forced-answer states, so a damaged artifact cannot loop forever.

## 9. Submitted, pending, forced, canonical, and navigation state

Five state concepts remain distinct:

| State | Owner and meaning |
| --- | --- |
| Submitted answers | Accepted user confirmations stored in `AnswerDraft` |
| Pending UI selection | Unconfirmed local selection used by an adapter or future React UI |
| Forced answers | Current fixed-point derivations owned by the flow engine |
| Canonical answers | Valid submitted answers plus current forced answers after safe repairs |
| Navigation position | A caller-provided stable question ID; never stored as a numeric step |

The answer draft is:

```ts
type AnswerDraft = Readonly<
  Partial<Record<QuestionId, readonly OptionId[]>>
>
```

A missing key means unanswered. An empty array is not interchangeable with a missing key unless a question explicitly allows a submitted zero-selection answer. `AnswerDraft` contains no UI initial selections, pending toggles, forced answers, repairs, or other derived results.

External data enters through:

```ts
decodeAnswerDraft(input: unknown): DecodeAnswerDraftResult
```

TypeScript types alone are not a runtime trust boundary.

## 10. Answer submission

The transition API accepts a complete intended answer for one question:

```ts
applyAnswer(
  model,
  draft,
  submission: {
    questionId: QuestionId
    optionIds: readonly OptionId[]
  },
): ApplyAnswerResult
```

`applyAnswer` is the only API that writes a new submitted draft. It:

1. evaluates the existing draft
2. confirms that the target is a known, reachable, currently interactive question
3. validates ownership, availability, duplicates, exclusivity, and selection bounds
4. canonicalizes selection ordering
5. compares the canonical selection with the previous submitted answer
6. returns the unchanged draft when rejected
7. when accepted and changed, stores the answer and removes its compiler-derived dependent closure
8. evaluates and returns the resulting state

A full submission containing an exclusive option together with any other option is rejected with a stable conflict diagnostic. `applyAnswer` never guesses the user's last toggle. A semantically identical resubmission does not clear downstream answers.

Rejected submissions include unknown question or option IDs, an option owned by another question, duplicate selections, disallowed options, unreachable or forced questions, exclusive conflicts, and selection counts outside effective bounds. Rejection is atomic and preserves the original draft.

## 11. Pending-selection helper

Interactive toggle behavior is a separate pure helper:

```ts
updatePendingSelection(
  questionState,
  pendingOptionIds,
  operation,
): PendingSelectionResult
```

It reads the compiled option order, current allowed options, effective bounds, and exclusive policy. It never reads or writes `AnswerDraft`.

The helper preserves legacy interaction semantics:

- selecting the exclusive option clears ordinary options
- selecting an ordinary option clears the exclusive option
- selecting a new ordinary option at `maxSelections` is a no-op
- deselecting an ordinary option preserves the remaining canonical order
- for `exclusions`, deselecting the last selection restores the configured initial UI option `none`

The returned pending selection is still unsubmitted. A future adapter must call `applyAnswer` when the user explicitly confirms the displayed selection.

## 12. Flow evaluation, repairs, and invalid data

Evaluation is pure and cursor-independent:

```ts
evaluateFlow(model, draft): FlowState
```

For the same immutable model and structurally equal draft, it returns a structurally equal state. It does not mutate the model or draft, persist data, consult a clock, or depend on call count.

Evaluation repeatedly derives reachability, allowed options, effective bounds, forced eligibility, safe repairs, and canonical answers until fixed point. `FlowState.canonicalAnswers` is the only standard view of answers under the current model:

```text
valid submitted answers
+ currently applicable forced answers
- safely repaired stale submitted answers
= canonical answers
```

Safe repairs are limited to deterministic stale-state handling:

- remove a submitted answer for a now-unreachable known question
- remove known options that became disallowed under current upstream answers
- replace an answer on a now-forced question with its unique legal forced value

If removing stale disallowed options leaves fewer than the effective minimum, the canonical view omits that question's answer entirely and returns it as incomplete with a repair. It does not preserve an under-minimum partial answer or invent replacement options.

Repairs affect only the canonical view and are always reported; they never modify the input draft. A state containing repairs may still be complete. Batch 2B will decide how and when a persisted draft is rewritten.

The following are invalid rather than repairable:

- unknown question or option IDs
- an option belonging to another question
- duplicate selections
- exclusive-option conflicts
- submitted selection counts that remain outside the effective bounds after all applicable stale-option repairs
- illegal input shape or primitive type
- an ambiguous or internally inconsistent model state

Invalid evaluation returns stable diagnostics and a safe canonical subset for diagnosis, but never `completedAnswers`, persistence output, or scoring input. Diagnostics are sorted by question order, diagnostic priority, option order, and stable code. Human-readable message text is not part of the semantic identity.

## 13. FlowState and completion

`FlowState` is a discriminated union:

```ts
interface FlowStateBase {
  canonicalAnswers: CanonicalAnswers
  reachableQuestionIds: readonly QuestionId[]
  interactiveQuestionIds: readonly QuestionId[]
  allowedOptionIdsByQuestion: Readonly<
    Partial<Record<QuestionId, readonly OptionId[]>>
  >
  forcedAnswers: readonly ForcedAnswer[]
  repairs: readonly FlowRepair[]
  diagnostics: readonly Diagnostic[]
}

type FlowState =
  | (FlowStateBase & {
      status: 'incomplete'
      completedAnswers?: never
    })
  | (FlowStateBase & {
      status: 'invalid'
      completedAnswers?: never
    })
  | (FlowStateBase & {
      status: 'complete'
      completedAnswers: CompletedAnswers
    })
```

`reachableQuestionIds` contains every question in the current logical branch, including forced questions. `interactiveQuestionIds` contains the reachable questions the user may edit and excludes currently forced questions. Allowed options are recorded per reachable question rather than only for a current screen.

`CompletedAnswers` is created only from canonical answers when `status === 'complete'`. It performs no scoring and carries no UI or persistence state.

`initialUiOptionIds` only suggests what a future UI displays when entering an unanswered interactive question. It never changes draft, forced answers, canonical answers, reachability, or completion. In particular, displaying `none` for exclusions does not answer exclusions until the user confirms it through `applyAnswer`.

## 14. Navigation

Navigation is expressed through stable question IDs:

```ts
getFirstActionableQuestion(state): QuestionId | undefined
getNextInteractiveQuestion(
  state,
  fromQuestionId,
): QuestionId | undefined
getPreviousInteractiveQuestion(
  state,
  fromQuestionId,
): QuestionId | undefined
```

Navigation helpers do not mutate answers. They use compiled display order, skip unreachable and forced questions, and return `undefined` when no matching question exists or when the flow is complete or invalid.

For a known `fromQuestionId` that is currently forced, unreachable, or otherwise non-interactive, next and previous still scan from that question's compiled position. An unknown ID is a programmer error for the typed internal API and is rejected at any untrusted boundary. Returning to an earlier question does not clear downstream answers; only an accepted, semantically changed submission does so.

## 15. Compiled artifact and hash contracts

The generated model is tracked at:

```text
packages/classification-core/src/generated/question-model.ts
```

It is deterministic, serializable, browser-neutral, free of function closures, and free of machine-specific metadata. It contains no timestamp, absolute path, username, OS value, non-deterministic UUID, or source commit. Repository and commit provenance belong to manifests, not semantic model bytes.

Metadata has distinct meanings:

```ts
interface CompiledQuestionModelMetadata {
  schemaVersion: string
  compilerVersion: string
  modelVersion: string
  sourceHash: string
  semanticHash: string
}
```

| Field | Contract |
| --- | --- |
| `schemaVersion` | Compiled artifact data-structure version |
| `compilerVersion` | Compiler implementation and semantic-proof version |
| `modelVersion` | Manually managed domain question-model release |
| `sourceHash` | Hash of decoded and normalized canonical source definitions |
| `semanticHash` | Hash of the compiled flow and interaction semantic projection |

`sourceHash` never hashes raw TypeScript bytes, paths, line endings, insertion order, comments, or build time. `semanticHash` excludes localization descriptions and non-semantic metadata so it distinguishes “source changed, flow unchanged” from a real semantic change.

An `artifactHash`, if needed, is calculated externally from final generated file bytes and stored in a build report or manifest. It is not embedded in the artifact it hashes.

The exported model uses deep-readonly types and is recursively frozen once at module initialization. Tests must prove runtime APIs do not mutate it and JavaScript consumers cannot mutate exposed nested objects.

Generation commands follow:

```text
npm run questions:generate   # explicit local write
npm run questions:check      # compile in memory and compare, no writes
```

CI runs only the check command. A drift failure prints the regeneration instruction and never overwrites tracked files.

## 16. Legacy extractor trust boundary

The extractor is a fixture-authoring tool, not a test dependency. It runs only by explicit local command against the verified legacy source and never in ordinary CI.

The expected legacy identity is:

```ts
const legacySourceIdentity = {
  repository: 'https://github.com/AnsonHui6040/ramen-style-today.git',
  commit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  treeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
} as const
```

Extraction must:

1. validate repository identity, full commit, root tree, lockfile, and every legacy source file on which the extractor depends
2. reject a dirty or mismatched checkout
3. create a detached temporary worktree at the verified commit
4. apply only a tracked deterministic instrumentation patch or transform
5. verify the resulting instrumentation diff exactly
6. record `instrumentationVersion` and `instrumentationHash`
7. install with the frozen legacy lockfile under the declared environment
8. run without interactive input and with fixed timezone, locale, and random seed
9. remove the temporary worktree without touching the original checkout

The first fixture lineage uses the repository's bundled Node 24 runtime and npm 11.12.1 unless the tracked extractor contract is deliberately versioned. The manifest records exact runtime and package-manager versions, `TZ=UTC`, locale, seed, lifecycle-script policy, and network policy.

Output replacement is explicit:

- an absent output directory may be created
- an existing output directory is rejected by default
- only `--replace` authorizes replacement
- replacement is built and validated in a sibling temporary directory
- rename performs the final atomic swap
- failure preserves the previous fixtures unchanged
- output roots, parent paths, and fixture paths may not escape through symlinks
- path traversal, illegal case IDs, duplicate case IDs, and unsafe filename mappings are rejected

## 17. Frozen fixture schema

Frozen fixtures live under:

```text
tools/parity/fixtures/questions/legacy-v1/
├── manifest.json
└── cases.json

tools/parity/fixtures/questions/expected-divergences.json
```

`expected-divergences.json` is a separate, versioned, tracked manifest. It starts with no entries and is not part of the immutable legacy truth.

The manifest records:

- fixture and case schema versions
- canonical repository URL, full commit, and tree hash
- relevant legacy source and lockfile hashes
- extractor and instrumentation identities
- runtime environment contract
- ordered case IDs and case count
- parity suite version
- the compiled `semanticHash` verified by the last successful parity run

`cases.json` is a versioned discriminated union rather than one object with many inapplicable fields:

```ts
type ParityCase =
  | FlowEvaluationCase
  | AnswerApplicationCase
  | PendingSelectionCase
  | NavigationCase
```

Every case contains a stable ID, category, normalized input, category-specific canonical expected result, and machine-readable coverage tags.

A flow snapshot includes:

- canonical answers
- reachable and interactive question IDs
- allowed option IDs for every reachable question
- forced answers and their stable reasons
- repair codes and stable structured fields
- diagnostic codes, IDs, JSON Pointer path, and stable metadata
- status and completed answers when complete

Human-readable diagnostic or repair messages are never compared. Ordering is canonical and part of the contract.

Navigation cases store both the query and expected result:

```ts
interface NavigationQuery {
  direction: 'next' | 'previous'
  fromQuestionId: QuestionId
  expectedQuestionId?: QuestionId
}
```

They cover first and last positions, forced questions, unreachable questions, known non-interactive questions, complete flow, and invalid flow. Unknown external IDs are tested through decoder or boundary tests rather than branded internal navigation fixtures.

## 18. Parity coverage and comparison

Coverage responsibilities are separated:

| Coverage | Owner |
| --- | --- |
| Every compiler semantic equivalence class | Compiler proof tests |
| Every legacy-representable parity-relevant behavioral class | Frozen parity fixtures |
| Malformed and invalid external data | New runtime unit tests |
| Invalid source definitions and proof failures | Compiler negative tests |
| Formal question and option reachability | Compiler exploration plus parity coverage manifest where legacy-representable |

Fixture coverage tags include question IDs, option IDs, semantic-class IDs, and behaviors such as unanswered, minimum bound, maximum bound, exclusive, exclusive conflict, forced, stale, allow-all, complete, and invalid where the legacy public behavior can represent them.

The parity gate verifies that declared tags match case contents, required questions and options are covered, case IDs are ordered and unique, and no orphan or fabricated coverage tag exists.

Parity compares semantics rather than legacy and new internal serialization. On mismatch it reports:

- case ID and category
- normalized case input
- first differing snapshot section and JSON Pointer
- bounded expected and received values
- current semantic hash
- fixture manifest identity
- a single-case replay command

Large complete diffs are written to an untracked temporary artifact rather than flooding CI logs.

Frozen `legacy-v1` fixtures always remain the historical legacy truth. An approved intentional behavior change must not rewrite them or turn off mismatch checking. It requires an ADR, user approval, implementation evidence, a reviewed semantic diff, and an explicit per-case entry in `tools/parity/fixtures/questions/expected-divergences.json`. Each entry records the legacy expected snapshot, approved new expectation, affected semantic hash, ADR, approval identity, and rationale. Divergences are explicit data consumed by the parity gate; broad ignore rules are forbidden.

## 19. Provenance and readiness

Origin and assurance are independent:

```ts
type Assurance =
  | 'unverified'
  | 'structurally-validated'
  | 'compiler-validated'
  | 'parity-verified'
  | 'production-observed'
```

Batch 2A provenance is:

| Domain | Origin | Maximum Batch 2A assurance |
| --- | --- | --- |
| Questions and flow | `legacy-production` | `parity-verified` when all gates pass |
| Styles | `synthetic` | `structurally-validated` |
| Scoring policy | `synthetic` | `structurally-validated` |

Styles and scoring are not `compiler-validated` merely because the question compiler succeeds. Each domain receives that assurance only from its corresponding semantic compiler.

The semantic artifact does not directly claim parity assurance. The parity fixture manifest and classification provenance manifest record:

```ts
interface QuestionParityProvenance {
  origin: 'legacy-production'
  assurance: 'parity-verified'
  sourceRepository: string
  sourceCommit: string
  sourceTreeHash: string
  fixtureSchemaVersion: string
  extractorVersion: string
  instrumentationHash: string
  paritySuiteVersion: string
  verifiedSemanticHash: string
}
```

`parity-verified` is valid only when `verifiedSemanticHash` equals the current compiled semantic hash and every fixture, coverage, and behavior gate succeeds.

Overall classification readiness is derived from domain provenance and migration gates rather than manually asserted:

```ts
interface ClassificationReadiness {
  status:
    | 'development'
    | 'migration-only'
    | 'candidate'
    | 'production-ready'
  blockers: readonly ReadinessBlocker[]
}
```

At the end of Batch 2A, overall readiness remains `migration-only` because styles, scoring, persistence, runtime cutover, and production observation are incomplete. Parity verification does not mean production-ready.

## 20. Repository verification and acceptance evidence

Verification has two tiers.

`npm run verify` is offline and reproducible. It runs:

- lint, tests, typecheck, and builds
- source structural validation and compiler proof tests
- generated question artifact drift checking
- runtime browser-neutral and forbidden-import checks
- frozen fixture integrity, coverage, semantic replay, and approved-divergence checks
- classification manifest and generated-index drift checks
- provenance and migration-ledger consistency checks

It never writes tracked outputs, regenerates fixtures, contacts GitHub, or executes the extractor.

`npm run verify:acceptance` runs the offline verification and then authenticates fixed evidence through the official GitHub API. It verifies the owner repository, exact implementation SHA, workflow identity, conclusion, and required jobs. This preserves forged-proof resistance without making ordinary PR verification dependent on tokens, rate limits, or a workflow that has not finished.

CI uses the offline `verify` command for pull requests. Candidate-branch or acceptance workflows run `verify:acceptance` after the implementation SHA has completed CI.

The migration ledger records the verified implementation SHA, not the SHA of the later metadata commit that records its evidence. A subsequent acceptance commit is valid when the implementation SHA is an ancestor of its HEAD and no semantic files changed after that implementation SHA. This avoids self-referential commit evidence.

Test counts are recorded as run evidence, not permanent architecture thresholds. Acceptance requires all required test projects and categories to be discovered and pass; merging parameterized tests does not by itself fail a numeric gate.

Canonical implementation ownership is machine-readable and maps actual paths for definitions, compiler, generated artifact, runtime flow, parity tools, and parity tests. The classification manifest, parity manifest, and migration ledger are canonical metadata. README and `AGENTS.md` contain concise summaries and pointers rather than duplicate machine-maintained facts.

## 21. Acceptance failure conditions

Batch 2A is rejected if any of the following is true:

- source, compiler, or generated artifact drift exists
- a compiler proof obligation is incomplete or fails
- parity behavior, fixture integrity, or required coverage fails
- case counts, ordered case IDs, coverage tags, or manifest identities disagree
- current semantic hash differs from verified provenance
- migration ledger baseline or implementation evidence is stale or inconsistent
- runtime root imports or exposes Node, compiler, extractor, React, legacy, persistence, scoring, or style implementation
- runtime APIs mutate the model or input draft
- extractor can change the original legacy checkout or write outside its safe output root
- fixture regeneration or replacement occurs implicitly
- an intentional divergence is hidden by rewriting legacy fixtures or ignoring mismatches
- production UI, persistence, scoring, styles, catalog, Finder, or legacy files are modified by this batch
- documentation or readiness claims exceed `migration-only`

## 22. Required deliverables

An implementation plan for this design must produce reviewable tasks for:

1. production question IDs, source schema, and exact legacy definitions
2. canonical compiler pipeline, dependency derivation, semantic exploration, and proof diagnostics
3. deterministic tracked artifact and no-drift command
4. browser-neutral answer decoder and flow-state contracts
5. `evaluateFlow`, `applyAnswer`, pending-selection, and navigation behavior using test-first development
6. controlled legacy extractor, versioned fixtures, coverage tags, and semantic parity harness
7. package export/import boundaries and split runtime/tool builds
8. question provenance, readiness derivation, classification indexes, migration ledger, and two-tier verification

The batch is complete only after all offline gates pass, exact-SHA acceptance evidence is recorded, generated documentation has no drift, and the repository is clean. The legacy production repository remains unchanged.
