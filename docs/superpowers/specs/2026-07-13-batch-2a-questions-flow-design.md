# Batch 2A Questions and Flow Design

- **Status:** Final — Approved for implementation
- **Direction approval:** Approved by the user on 2026-07-13
- **Written specification approval:** Approved by the user on 2026-07-13 after the required review corrections
- **Parity-contract correction:** Approved by the user on 2026-07-13 after the rejected Task 9 review
- **Repository:** `AnsonHui6040/ramen-style-today-next`
- **Legacy oracle:** `AnsonHui6040/ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37`
- **Legacy tree:** `3e527de876cfeccfd3154ddc492830d71c4cfd9a`
- **Parent design:** `docs/superpowers/specs/2026-07-11-classification-architecture-design.md`
- **Date:** 2026-07-13

## 1. Decision

Batch 2A will replace the synthetic question inventory with contract-first production question definitions, compile them into a deterministic tracked artifact, evaluate them through a pure questionnaire runtime, and prove parity for directly observable legacy question-flow transitions against frozen traces extracted from the verified legacy commit.

This batch preserves the complete legacy questionnaire behavior. It may expose legacy defects through diagnostics or observable traces, but it must not silently correct product behavior. Any intentional behavior change requires a separate approval path.

The selected architecture is:

```text
production question definitions
        ↓ compiler validation and proof
canonical compiled question artifact
        ↓ pure flow runtime
canonical FlowState and transitions
        ↓ observable-only trace projection
frozen legacy transition traces
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
- frozen legacy observable question-flow traces, their extractor, integrity checks, projection replay, and observable coverage gates
- question-specific provenance, migration-ledger evidence, classification-index ownership, and repository verification commands

Batch 2A does not own:

- persisted envelopes, localStorage migration, persistence repair write-back, or quarantine behavior; those remain Batch 2B
- scoring, ranking, confidence, style compilation, or eligibility
- React components, browser state, translations, catalog data, Finder data, or visual design
- production cutover or changes to the legacy repository

`weight` metadata may be preserved on the correct domain node for later migration, but no Batch 2A runtime function may read it or produce a score.

The reports “簡潔而細緻的拉麵分類問卷設計報告” and “台日拉麵精簡分類與短問卷設計報告” provide product and domain rationale for the eight-question adaptive inventory, observable source fields, dynamic branching, and separation of derived style labels from raw taxonomy fields. They are research inputs, not behavioral oracles. Where their proposed taxonomy differs from verified legacy behavior, the frozen legacy oracle and this approved specification govern Batch 2A parity.

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

tools/parity/questions/** ──→ isolated verified temporary legacy worktree
tests/parity or core parity tests ──→ runtime observable projection + frozen traces
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
| `OptionId` | answer identity within its owning `QuestionId`; conditions, fixtures, and future persistence always carry the question context |
| `MessageId` | localization lookup only |
| `order` | display and canonical ordering; never identity |

Array position is never an identity or an implicit branch rule. Question IDs are globally unique; option IDs are unique within their owning question because legacy values such as `pork` and `none` intentionally occur in more than one question. The canonical option identity is the pair `(QuestionId, OptionId)`, and documentation uses `option/<questionId>:<optionId>` as its unique concept key. A message-key change cannot rename an answer, and reordering source arrays cannot change identity.

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
  pendingSelection?: PendingSelectionPolicySource
  weight?: number
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
}

type EmptyPendingSelectionBehavior =
  | { type: 'allow-empty' }
  | { type: 'restore-initial-ui-options' }

interface PendingSelectionPolicySource {
  emptyBehavior: EmptyPendingSelectionBehavior
}
```

A generic unlabelled `conditions[]` field is forbidden because the compiler must not guess whether a predicate controls question reachability, option availability, answer validity, selection bounds, or forced eligibility.

The condition language is a closed, serializable abstract syntax tree. It may express only operators the compiler can analyze completely, including explicit answer membership and bounded `all`, `any`, and `not` composition. JavaScript closures and unknown operator extensions are rejected. If a future condition cannot be included in the sound finite abstraction, the compiler must reject it rather than silently downgrade proof coverage.

The archetype decision tables for `tare`, `source`, `body`, `noodle`, and `signature` must list every production archetype branch explicitly, including branches that allow every option. An explicit allow-all row still creates a semantic dependency on `archetype`.

Selection constraints must obey these local invariants:

- question IDs are unique globally, and option IDs are unique within their owning question
- question and option `order` values are unique within their level
- single selection has `maxSelections === 1`
- `minSelections` and `maxSelections` are non-negative, satisfiable, and consistent with selection type
- every exclusive option belongs to its question and is valid by itself
- the production model supports at most one exclusive option per question unless a later approved contract defines multi-exclusive behavior
- `initialUiOptionIds` belong to the question and form a legal displayable selection in every reachable interactive state where they may be shown, but they are never answers
- `restore-initial-ui-options` requires a non-empty, legal `initialUiOptionIds` selection
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

Compiler proof coverage and legacy observable-trace coverage are separate gates. The compiler must prove every formal reachable question and option appears in at least one reachable explored state. It must not depend on legacy traces or require every formal concept to appear in a parity path.

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
- when compiled `emptyBehavior` is `restore-initial-ui-options`, deselecting the last selection restores the compiled `initialUiOptionIds`

The `exclusions` source definition selects `restore-initial-ui-options` and configures `none` as its initial UI option. The generic helper does not branch on `QuestionId`. The returned pending selection is still unsubmitted. A future adapter must call `applyAnswer` when the user explicitly confirms the displayed selection.

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

An under-minimum result is repairable only when the compiler can prove that the submitted selection is legal in at least one reachable upstream semantic state and that the current invalidity is explained solely by dependency conditions making one or more known options stale. Because `AnswerDraft` contains no history, this proof establishes a deterministic stale-state explanation rather than asserting when the answer was actually submitted. After removing those stale options, if the remainder is below the effective minimum, the canonical view omits the whole question answer and returns `incomplete` with a repair. It does not preserve an under-minimum partial answer or invent replacement options.

Repairs affect only the canonical view and are always reported; they never modify the input draft. A state containing repairs may still be complete. Batch 2B will decide how and when a persisted draft is rewritten.

The following are invalid rather than repairable:

- unknown question or option IDs
- an option belonging to another question
- duplicate selections
- exclusive-option conflicts
- submitted selection counts that were intrinsically outside the effective bounds and cannot be explained solely by deterministic stale-option removal caused by an upstream semantic change
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

The first Task 9 implementation in commit `3b65eac` is rejected and is not an implementation baseline. It reused the original checkout's dependencies through a temporary `node_modules` symlink and may have refreshed these ignored cache files even though the tracked legacy HEAD and tree remained unchanged:

```text
node_modules/.tmp/tsconfig.app.tsbuildinfo
node_modules/.tmp/tsconfig.node.tsbuildinfo
```

Task 9 records that event and its remediation in `docs/migration/incidents/2026-07-13-legacy-cache-isolation.md`. Task 14 must reference the incident from the Batch 2A ledger evidence. No frozen trace may be generated until a replacement Task 9 implementation passes a fresh high-risk contract and security review.

The expected legacy identity is:

```ts
const legacySourceIdentity = {
  host: 'github.com',
  owner: 'AnsonHui6040',
  repository: 'ramen-style-today',
  commit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  treeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
} as const
```

Repository comparison uses this normalized host, owner, and repository identity rather than literal remote text. Equivalent HTTPS, SSH, and GitHub CLI checkouts are accepted after normalization. The full commit, root tree, relevant tracked source hashes, and lockfile hash remain mandatory content checks; the remote is supporting identity evidence, not the sole trust boundary.

Extraction must:

1. validate repository identity, full commit, root tree, lockfile, and every legacy source file on which the extractor depends
2. reject a dirty or mismatched checkout
3. acquire an atomic same-parent extraction lock before creating staging or backup paths
4. fingerprint every declared ignored extractor-sensitive path in the original checkout before any child process runs
5. create a detached temporary worktree at the verified commit with its own physical `node_modules`, npm cache, build cache, home, and temporary directory
6. apply only a tracked deterministic instrumentation patch or transform and verify the exact resulting diff
7. record `instrumentationVersion` and `instrumentationHash`
8. install with the frozen legacy lockfile under the declared environment without reusing or symlinking any original dependency or cache path
9. run the complete patched legacy suite successfully
10. run extraction separately with operating-system network access denied
11. bind raw output exactly to the ordered seeds before validating or publishing traces
12. publish only after complete schema, integrity, and coverage validation
13. remove or prune partial worktrees and staging artifacts on every exit path without touching the original checkout
14. re-fingerprint the declared original paths and fail if existence, file type, size, modification time, or SHA-256 changed

The ignored-path fingerprint contract is no-follow and versioned:

```ts
interface IgnoredPathFingerprint {
  readonly path:
    | 'node_modules/.tmp/tsconfig.app.tsbuildinfo'
    | 'node_modules/.tmp/tsconfig.node.tsbuildinfo'
  readonly exists: boolean
  readonly type: 'missing' | 'regular-file' | 'directory' | 'symbolic-link' | 'other'
  readonly size: number | null
  readonly mtimeMs: number | null
  readonly sha256: string | null
}
```

`sha256` is required for a regular file and `null` otherwise. A type change, appearance, disappearance, byte change, size change, or modification-time change is a checkout mutation and rejects extraction even if `git status` is clean. The before/after check runs after best-effort cleanup on both success and failure.

The extractor invokes Git, Node, and npm only through configured trusted absolute executable paths. npm is invoked as the trusted absolute Node executable plus npm's trusted absolute `npm-cli.js`, not through an inherited shell lookup. Child environments are constructed from an allowlist instead of spreading `process.env`: fixed `TZ`, locale, seed, and `CI`; a generated minimal `PATH`; isolated `HOME`, `TMPDIR`, npm cache, and build-cache paths; explicit `GIT_CONFIG_NOSYSTEM=1`; and explicit npm user/global config suppression. Any inherited `GIT_*`, `NODE_OPTIONS`, `NPM_CONFIG_*`, `npm_config_*`, or unrelated environment entry is absent. The full legacy suite completes before a distinct extraction-only command is launched under the supported macOS network-denial boundary.

Instrumentation is observational only. The temporary patched `App` may expose a test-only, read-only observer hook that receives already-computed component/render state after React actions settle. It may extract an existing pure calculation into a helper only when the component itself is changed to call that exact helper. The patch and extractor must not implement, duplicate, infer, or call test-only substitutes for branch rules, repairs, validation, answer application, navigation, forced resolution, or completion. It must not call exported legacy helpers to manufacture expected trace values. Every frozen frame comes from the actual rendered component and its actual state after an actual public action has settled; a single public action may produce multiple observed frames when the existing component performs a forced skip or completion transition.

For every raw case, the extractor compares the raw seed index, case ID, complete ordered action list, and complete ordered coverage-tag list byte-for-byte with the copied input seed. Raw case count and order must exactly equal seed count and order. Missing, duplicated, injected, reordered, or rewritten seed metadata rejects the run before trace normalization.

The first fixture lineage uses the repository's bundled Node 24 runtime and npm 11.12.1 unless the tracked extractor contract is deliberately versioned. The manifest records exact runtime and package-manager versions, `TZ=UTC`, locale, seed, lifecycle-script policy, and network policy.

Output replacement is explicit:

- an absent output directory may be created
- an existing output directory is rejected by default
- only `--replace` authorizes replacement
- an atomic same-parent lock excludes concurrent authors
- replacement is built and validated in a uniquely named sibling staging directory
- backup and staging names are unique per run and never reused
- rename performs the final atomic swap
- failure performs best-effort rollback and preserves the previous fixtures unchanged
- cleanup attempts partial `git worktree remove --force` followed by `git worktree prune --expire now` without masking the primary failure
- output roots, parent paths, and fixture paths may not escape through symlinks
- path traversal, illegal case IDs, duplicate case IDs, and unsafe filename mappings are rejected
- every external error is reduced to one control-character-free line of at most 300 characters before it reaches logs or diagnostics
- all security-sensitive reads are no-follow, and source, parent, lock, staging, backup, and destination identity is revalidated immediately before every read, rename, rollback, or publish seam

The supported threat boundary is a non-privileged local authoring run on the declared macOS host. The extractor rejects symlinks, path replacement it detects during immediate revalidation, inherited process configuration, concurrent cooperative extractor runs, and network access in extraction. It does not claim protection from a privileged process or a hostile same-user process that can win a race between the final no-follow/revalidation check and the operating-system filesystem call; fixture authoring must run without such an adversary.

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
- normalized repository identity, full commit, and tree hash
- relevant legacy source and lockfile hashes
- extractor and instrumentation identities
- runtime environment contract
- ordered case IDs and case count
- deterministic fixture content hash

The fixture content hash is calculated from the canonical `cases.json` payload; it does not recursively include the manifest that stores it. The frozen manifest never records the latest implementation's semantic hash, parity result, implementation SHA, or current parity-suite version. Those values are mutable verification evidence and belong to classification provenance and the migration ledger.

`cases.json` contains only a versioned observable trace contract. It does not contain whole-flow internal serialization or any attempted legacy equivalent of the new runtime API:

```ts
type LegacyNavigationDirection = 'next' | 'previous'

type LegacyObservableAction =
  | { readonly type: 'select'; readonly questionId: string; readonly optionId: string }
  | { readonly type: 'deselect'; readonly questionId: string; readonly optionId: string }
  | { readonly type: 'submit'; readonly questionId: string }
  | { readonly type: 'next'; readonly fromQuestionId: string }
  | { readonly type: 'previous'; readonly fromQuestionId: string }

type LegacyObservableTransition =
  | 'initial'
  | 'toggle'
  | 'submit'
  | 'forced-skip'
  | 'next'
  | 'previous'
  | 'complete'

type LegacyObservedAnswerValue = string | readonly string[]
type LegacyObservedAnswers = Readonly<
  Partial<Record<string, LegacyObservedAnswerValue>>
>

interface LegacyObservedChanges {
  readonly visibleOptionIds?: {
    readonly questionId: string
    readonly before: readonly string[]
    readonly after: readonly string[]
  }
  readonly answers?: readonly {
    readonly questionId: string
    readonly before?: LegacyObservedAnswerValue
    readonly after?: LegacyObservedAnswerValue
  }[]
}

interface LegacyObservableTraceFrame {
  readonly sequence: number
  readonly transition: LegacyObservableTransition
  readonly actionIndex?: number
  readonly displayedQuestionId?: string
  readonly visibleOptionIds?: readonly string[]
  readonly pendingOptionIds?: readonly string[]
  readonly legacyAnswers?: LegacyObservedAnswers
  readonly forcedAutoAnswer?: {
    readonly questionId: string
    readonly value: LegacyObservedAnswerValue
  }
  readonly navigation?: {
    readonly direction: LegacyNavigationDirection
    readonly reachedQuestionId?: string
    readonly reachedScreen?: 'results'
  }
  readonly completionMarker?: 'results'
  readonly observedChanges?: LegacyObservedChanges
}

interface LegacyObservableTraceCase {
  readonly id: string
  readonly actions: readonly LegacyObservableAction[]
  readonly coverageTags: readonly string[]
  readonly frames: readonly LegacyObservableTraceFrame[]
}
```

An action exists only when a distinct public legacy event occurred. A single click that both submits and advances remains one action and may yield multiple frames. `actionIndex` binds a frame to that action when the legacy can do so directly. Optional frame fields are omitted when they are not applicable or the legacy cannot observe them directly; absence must never be filled by inference. `observedChanges` is limited to a mechanical before/after diff of values captured from consecutive observed component frames.

Frames record the current displayed question and its visible option IDs, the component's actual pending selection, the actual legacy answer state used or saved by the component, actual forced auto-answer/skip transitions, the question or results screen actually reached, the results completion marker, and actual visible-option or answer changes after branch-driving actions. Arrays and object keys are normalized only for stable serialization when that normalization does not change legacy values.

Frozen legacy traces explicitly forbid canonical answers, whole-flow reachable or interactive ID lists, allowed-option maps for non-displayed questions, repairs, diagnostics, invalidated question IDs, dependency or closure metadata, accepted/rejected application result objects, canonical navigation query/results, fixed-point keys or iteration metadata, compiler equivalence classes, current semantic hashes, implementation SHAs, and current assurance. Those are new-runtime or current-verification concepts, not legacy observations.

## 18. Parity coverage and comparison

Coverage responsibilities are separated:

| Coverage | Owner |
| --- | --- |
| Every compiler semantic equivalence class | Compiler proof tests |
| Every legacy-representable displayed question, visible option, public action, observed forced skip, navigation target, completion marker, and branch-visible/answer change | Frozen observable traces |
| Repairs, diagnostics, invalidated IDs, dependency closures, fixed-point behavior, global reachability, canonical navigation metadata, accepted/rejected application objects, and malformed or invalid external data | Compiler/runtime unit tests in Tasks 3–8 |
| Invalid source definitions and proof failures | Compiler negative tests |
| Formal question and option reachability | Compiler exploration; trace coverage only where directly legacy-observable |

Trace coverage tags are limited to facts derivable from seed actions and observable frames: displayed question IDs, visible option IDs scoped to their question, action types, transition types, forced-skip, navigation targets, completion, pending-selection effects, and observed branch changes. Semantic-class, repair, diagnostic, invalid-input, dependency, reachability, and new-API tags are forbidden.

The parity gate derives tags from actions and frames, verifies exact equality with declared ordered tags, requires every legacy-representable question and option plus each declared observable behavior class, and rejects orphan, fabricated, duplicate, or reordered tags. Compiler/runtime tests remain the only coverage gate for excluded new-only fields.

New-runtime parity is a projection, not an internal-model comparison. A dedicated runtime adapter starts from a fresh state, performs the same ordered legacy-representable public actions, lets each transition settle, and emits only `LegacyObservableTraceFrame` fields that the legacy trace schema permits. It may use runtime APIs to execute the action, but it must not serialize `FlowState`, `ApplyAnswerResult`, compiler metadata, or any excluded field into received parity data. Stable projected frames are then compared to the frozen trace in order.

On mismatch the gate reports:

- case ID
- ordered action sequence
- first differing observable frame and JSON Pointer
- bounded expected and received values
- current semantic hash
- fixture manifest identity
- a single-case replay command

Large complete diffs are written to an untracked temporary artifact rather than flooding CI logs.

Frozen `legacy-v1` fixtures always remain the historical legacy truth. An approved intentional behavior change must not rewrite them or turn off mismatch checking. It requires an ADR, user approval, implementation evidence, a reviewed semantic diff, and an explicit per-case entry in `tools/parity/fixtures/questions/expected-divergences.json`.

Each divergence stores only the reviewed delta rather than duplicating a complete trace. Its pointer must resolve within an observable trace case, normally under `/frames/<index>/...`; pointers to forbidden internal fields are invalid:

```ts
interface ExpectedDivergence {
  caseId: ParityCaseId
  jsonPointer: string
  operation: 'add' | 'replace' | 'remove'
  legacyValueHash: string
  approvedValue?: JsonValue
  semanticHash: string
  adr: string
  approvalIdentity: string
  rationale: string
}
```

The parity gate verifies `legacyValueHash` against the frozen value, or against a stable missing-value sentinel for `add`, before applying the versioned JSON-Patch-style operation. `approvedValue` is required for `add` and `replace` and forbidden for `remove`. Multiple changed locations use multiple deterministically ordered entries. Broad ignore rules and unscoped whole-trace replacement are forbidden.

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

| Domain | Origin | Batch 2A assurance effect |
| --- | --- | --- |
| Questions and flow | `legacy-production` | Raised to `parity-verified` when all gates pass |
| Styles | `synthetic` | Not raised; remains independently established and capped at `structurally-validated` in this batch |
| Scoring policy | `synthetic` | Not raised; remains independently established and capped at `structurally-validated` in this batch |

Batch 2A does not create assurance evidence for styles or scoring. They are not `compiler-validated` merely because the question compiler succeeds; each domain receives that assurance only from its corresponding semantic compiler.

The semantic artifact and frozen fixture manifest do not directly claim current parity assurance. The classification provenance manifest records immutable origin identity separately from current verification evidence:

```ts
interface QuestionParityProvenance {
  origin: 'legacy-production'
  parityScope: 'legacy-observable-transition-projection'
  sourceRepository: {
    host: string
    owner: string
    repository: string
  }
  sourceCommit: string
  sourceTreeHash: string
  fixtureSchemaVersion: string
  extractorVersion: string
  instrumentationHash: string
}

interface QuestionParityVerification {
  assurance: 'parity-verified'
  parityScope: 'legacy-observable-transition-projection'
  fixtureManifestHash: string
  paritySuiteVersion: string
  verifiedSemanticHash: string
  implementationSha: string
}
```

`parity-verified` is valid only when `verifiedSemanticHash` equals the current compiled semantic hash, every frozen observable-trace integrity and coverage gate succeeds, and the runtime projection matches every non-diverged observable frame. The term means that directly observable legacy behavior matches the frozen trace corpus; it does not claim that legacy proved repairs, diagnostics, invalid APIs, dependency metadata, global reachability, fixed-point behavior, or other new-runtime contracts. Those contracts must pass their compiler/runtime tests independently.

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
- frozen observable-trace integrity, observable coverage, runtime projection replay, and approved-divergence checks
- classification manifest and generated-index drift checks
- provenance and migration-ledger consistency checks

It never writes tracked outputs, regenerates fixtures, contacts GitHub, or executes the extractor.

`npm run verify:acceptance` runs the offline verification and then authenticates fixed evidence through the official GitHub API. It verifies the owner repository, exact implementation SHA, workflow identity, conclusion, and required jobs. This preserves forged-proof resistance without making ordinary PR verification dependent on tokens, rate limits, or a workflow that has not finished.

CI uses the offline `verify` command for pull requests. Candidate-branch or acceptance workflows run `verify:acceptance` after the implementation SHA has completed CI.

The migration ledger records the verified implementation SHA, not the SHA of the later metadata commit that records its evidence. A subsequent acceptance commit is valid when the implementation SHA is an ancestor of its HEAD and no owned semantic path changed after that implementation SHA. This avoids self-referential commit evidence.

The classification manifest or migration ledger declares the checked path patterns as machine-readable data:

```ts
const semanticPaths = [
  'packages/classification-core/src/definitions/questions.ts',
  'packages/classification-core/src/compiler/questions/**',
  'packages/classification-core/src/generated/question-model.ts',
  'packages/classification-core/src/flow/**',
  'tools/parity/questions/**',
  'tools/parity/fixtures/questions/**',
] as const
```

Acceptance resolves these repository-relative POSIX glob patterns and compares their Git object changes between the implementation SHA and candidate HEAD. It does not infer semantic ownership from filenames, commit messages, or human review.

Test counts are recorded as run evidence, not permanent architecture thresholds. Acceptance requires all required test projects and categories to be discovered and pass; merging parameterized tests does not by itself fail a numeric gate.

Canonical implementation ownership is machine-readable and maps actual paths for definitions, compiler, generated artifact, runtime flow, parity tools, and parity tests. The classification manifest, parity manifest, and migration ledger are canonical metadata. README and `AGENTS.md` contain concise summaries and pointers rather than duplicate machine-maintained facts.

## 21. Acceptance failure conditions

Batch 2A is rejected if any of the following is true:

- source, compiler, or generated artifact drift exists
- a compiler proof obligation is incomplete or fails
- parity behavior, fixture integrity, or required coverage fails
- case counts, ordered case IDs, coverage tags, or manifest identities disagree
- a frozen case contains repairs, diagnostics, invalidated IDs, global reachability, application result objects, canonical navigation metadata, dependency closures, fixed-point metadata, or another non-observable new-runtime field
- raw extractor output does not bind exactly to seed count, order, IDs, actions, and coverage tags
- current semantic hash differs from verified provenance
- migration ledger baseline or implementation evidence is stale or inconsistent
- runtime root imports or exposes Node, compiler, extractor, React, legacy, persistence, scoring, or style implementation
- runtime APIs mutate the model or input draft
- extractor changes any tracked or declared ignored extractor-sensitive original-checkout path, reuses original dependencies/caches, inherits unapproved process configuration, performs extraction with network access, or writes outside its safe output root
- the rejected Task 9 implementation from `3b65eac` is used to generate fixtures or Task 10 starts before the replacement passes fresh high-risk review
- the cache-isolation incident is absent from `docs/migration/incidents/2026-07-13-legacy-cache-isolation.md` or is not referenced by Task 14 ledger evidence
- fixture regeneration or replacement occurs implicitly
- an intentional divergence is hidden by rewriting legacy fixtures or ignoring mismatches
- production UI, persistence, scoring, styles, catalog, Finder, or tracked legacy source files are modified by this batch
- documentation or readiness claims exceed `migration-only`

## 22. Required deliverables

An implementation plan for this design must produce reviewable tasks for:

1. production question IDs, source schema, and exact legacy definitions
2. canonical compiler pipeline, dependency derivation, semantic exploration, and proof diagnostics
3. deterministic tracked artifact and no-drift command
4. browser-neutral answer decoder and flow-state contracts
5. `evaluateFlow`, `applyAnswer`, pending-selection, and navigation behavior using test-first development
6. isolated observable-only legacy extractor, versioned traces, observable coverage tags, and runtime trace-projection harness
7. package export/import boundaries and split runtime/tool builds
8. question provenance, readiness derivation, classification indexes, migration ledger, and two-tier verification

The batch is complete only after all offline gates pass, exact-SHA acceptance evidence is recorded, generated documentation has no drift, and the repository is clean. No implementation task changes tracked legacy source, and every replacement-extractor run must leave the declared ignored-path fingerprints unchanged from its recorded pre-run state; the earlier ignored-cache incident remains documented rather than erased.
