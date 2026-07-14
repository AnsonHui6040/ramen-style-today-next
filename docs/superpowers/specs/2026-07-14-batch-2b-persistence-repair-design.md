# Batch 2B Persistence and Repair Design

- **Status:** Review-ready — approved section decisions consolidated
- **Section decisions:** Approved by the user on 2026-07-14
- **Written specification approval:** Awaiting review of this consolidated document
- **Repository:** `AnsonHui6040/ramen-style-today-next`
- **Branch:** `codex/batch-2b-persistence-repair`
- **Batch 2A base commit:** `e8ec5c54e9b71844b883473f4eb8a730f5d89278`
- **Batch 2A implementation commit:** `ecf9f5b4791862471d0898da7283ba4a40d3fbf9`
- **Question model version:** `batch2a.1.0`
- **Question semantic hash:** `d1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d`
- **Legacy lineage:** `AnsonHui6040/ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37`
- **Legacy tree:** `3e527de876cfeccfd3154ddc492830d71c4cfd9a`
- **Parent design:** `docs/superpowers/specs/2026-07-11-classification-architecture-design.md`
- **Question and flow design:** `docs/superpowers/specs/2026-07-13-batch-2a-questions-flow-design.md`
- **Date:** 2026-07-14

## 1. Decision

Batch 2B will add a browser-neutral, pure persistence core around the accepted Batch 2A question and flow runtime. It will decode bounded untrusted inputs, identify an explicitly declared source lineage, migrate schema and question-model identities through separate registries, validate current submitted answers, project only deterministic stale-state repairs, re-evaluate the repaired state, resolve a stable resume target, and emit a normalized current V1 payload when write-back is required.

The selected pipeline is:

```text
explicit source discriminator
        ↓
bounded minimal envelope decoding
        ↓
schema-version identification
        ↓
version-specific structural decoding
        ↓
sequential schema migration
        ↓
question-model compatibility or explicit model migration
        ↓
current AnswerDraft runtime decoding
        ↓
Batch 2A flow evaluation
        ↓
deterministic submitted-state repair projection
        ↓
repaired-state re-evaluation and fixed-point check
        ↓
stable resume resolution
        ↓
RestoreResult and optional normalized current V1 payload
```

This batch does not copy the legacy `stepIndex`, infer versions from storage keys or object shape, persist canonical or forced answers, or perform storage I/O. Those approaches would couple the new domain core to a particular UI and would obscure whether a change came from schema migration, question-model migration, repair, or adapter behavior.

## 2. Scope and protected Batch 2A baseline

Batch 2B owns:

- the current V1 classification persistence envelope
- explicit legacy-unversioned and versioned source discriminators
- bounded plain-data decoding and public persistence diagnostics
- sequential schema migration contracts
- explicit question-model compatibility and migration contracts
- current-model `AnswerDraft` decoding
- deterministic projection from stale submitted state to repaired submitted state
- stable resume-question resolution by `QuestionId`
- a pure current V1 payload builder
- legacy persistence observation extraction and frozen fixture integrity
- contract tests, import-boundary tests, provenance, readiness, ledger, and exact-SHA acceptance evidence for this batch

Batch 2B does not own:

- React, DOM, browser navigation, or questionnaire UI
- localStorage keys, atomic writes, read-back verification, quarantine locations, autosave timing, or production cutover
- `phase`, `locale`, `savedAt`, clocks, device data, analytics, or transport metadata
- scoring, styles, eligibility, catalog data, translations, or map behavior
- changes to Batch 2A question definitions, compiler semantics, generated question artifact, flow behavior, frozen question traces, or their accepted provenance

The following Batch 2A identities are protected acceptance inputs:

```text
question model version: batch2a.1.0
question semantic hash: d1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d
implementation SHA: ecf9f5b4791862471d0898da7283ba4a40d3fbf9
legacy oracle: eebf00b7ddfbbe6f01ff598e57f1e17197068a37
legacy tree: 3e527de876cfeccfd3154ddc492830d71c4cfd9a
```

Any Batch 2B change to Batch 2A semantic paths, model version, or semantic hash reopens Batch 2A and requires renewed question-flow parity and provenance. Batch 2B cannot silently absorb such a change as a persistence migration.

## 3. Package and dependency boundaries

The planned responsibility layout is:

```text
packages/classification-core/src/persistence/
  contracts.ts
  limits.ts
  diagnostics.ts
  decode-envelope.ts
  decode-v1.ts
  decode-answers.ts
  legacy-lineage.ts
  schema-migrations.ts
  model-migrations.ts
  repair.ts
  resume.ts
  restore.ts
  create-payload.ts
  index.ts

tools/parity/persistence/
  contracts.ts
  extract.ts
  extractor.ts
  verify-fixtures.ts

tools/parity/fixtures/persistence/legacy-unversioned/
  cases.json
  manifest.json
```

These production module boundaries are fixed. Colocated test files may be added, but implementation must not merge the responsibilities in a way that exposes an internal stage or reverses an import boundary.

The classification runtime root may export:

- `restoreClassification`
- `createStoredClassificationPayloadV1`
- `ClassificationRestoreSource`
- `StoredClassificationPayloadV1`
- `RestoreResult`
- `RestoreChange`
- `AppliedMigration`
- `PersistenceRepair`
- `PersistenceDiagnostic`
- `PersistenceDiagnosticCode`
- `PersistencePipelineStage`
- `CreateStoredPayloadResult`

The runtime root must not export or import:

- envelope decoder internals
- migration registry internals
- repair projection internals
- canonical payload comparison internals
- cursor resolver internals
- compiler or source definitions
- fixture extractors or legacy code
- `node:*`, filesystem, network, React, DOM, or storage APIs
- styles, scoring, catalog, translations, clocks, locale, phase, or saved timestamps

Package exports, TypeScript project references, import-boundary tests, and the production dependency graph enforce these rules. The public persistence graph must remain browser-neutral and must not pull Node-only extractor or compiler dependencies into the runtime package.

## 4. Explicit source identity

Callers must declare the source kind and, for unversioned legacy data, the exact lineage:

```ts
type ClassificationRestoreSource =
  | {
      readonly kind: 'legacy-unversioned'
      readonly sourceId:
        'ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37'
      readonly answers: unknown
    }
  | {
      readonly kind: 'versioned'
      readonly payload: unknown
    }
```

The core must not infer source identity from:

- a storage key
- the presence or absence of `schemaVersion`
- the presence of `stepIndex`
- answer-object shape
- similar field names
- current model IDs that happen to match legacy values

The public source envelope is also closed. A legacy source has exactly `kind`, `sourceId`, and `answers`; a versioned source has exactly `kind` and `payload`. An unknown `kind`, illegal primitive, accessor, or extra field is invalid. A structurally valid but unregistered legacy `sourceId` is unsupported rather than shape-guessed.

The first registered legacy lineage is exact and immutable. A second unversioned legacy format requires a new `sourceId` and decoder rather than widening the existing one.

## 5. Current V1 persistence contract

The trusted current payload type is:

```ts
interface StoredClassificationPayloadV1 {
  readonly schemaVersion: 1
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly cursorQuestionId?: QuestionId
  readonly submittedAnswers: AnswerDraft
}
```

V1 stores only user-submitted answers. It never stores:

- forced answers
- canonical answers
- completed answers
- flow repairs or diagnostics
- pending UI selections or `initialUiOptionIds`
- allowed, reachable, or interactive question metadata
- completion status
- navigation history or `stepIndex`
- scores, styles, catalog results, locale, phase, or timestamps

Every derived value is recomputed from the accepted Batch 2A compiled model. The `cursorQuestionId` is only a resume hint; it cannot change evaluation, repairs, completion, or the meaning of submitted answers.

The V1 wire schema is closed. Its only own enumerable string fields are:

```text
schemaVersion
questionModelVersion
questionSemanticHash
cursorQuestionId, when present
submittedAnswers
```

Any additional own enumerable string field is invalid rather than an ignored extension. The builder emits the fields in one fixed order, but semantic comparison ignores object insertion order and transport whitespace.

## 6. Schema identity and question-model identity

Three identities serve different purposes:

| Identity | Meaning |
| --- | --- |
| `schemaVersion` | persistence envelope and wire-format version |
| `questionModelVersion` | human-managed domain model release used when the answers were written |
| `questionSemanticHash` | exact compiled flow-semantics identity of that model |

Restore first performs schema migration, then question-model compatibility or migration. These registries are independent and cannot silently substitute for each other.

The decision matrix is:

| Input identity | Result |
| --- | --- |
| current schema, current model version, current semantic hash | decode and evaluate directly |
| registered earlier schema | apply every sequential schema migration, with evidence |
| registered earlier model version and semantic hash | apply an explicit model migration, with evidence |
| unknown future or unregistered schema | `unsupported-schema-version` |
| unknown model version or semantic hash lineage | `unsupported-question-model` |
| current model version paired with a different hash | `question-model-integrity-error` |
| payload claims the current identity but contains illegal data | `invalid`; never reinterpret as stale legacy data |

The current implementation initially registers only current V1 and the exact verified legacy lineage to current V1. No migration is invented for an identity pair that has not been explicitly registered and tested.

## 7. Bounded plain-data decoding

Every external payload enters as `unknown`. Public TypeScript annotations do not substitute for runtime validation.

The core hard limits are:

```ts
const persistenceLimits = {
  maxDepth: 4,
  maxQuestionEntries: 64,
  maxSelectionsPerQuestion: 64,
  maxTotalSelections: 512,
  maxIdCodePoints: 128,
  maxModelVersionCodePoints: 128,
} as const
```

Counting rules are exact:

- the root unknown object has depth `0`
- entering an object property or array element increases depth by one
- question-entry, per-question selection, and total-selection counts occur before de-duplication, migration expansion, repair, or canonicalization
- question-entry count includes every own enumerable string key, including one later rejected as unknown
- string lengths use Unicode code points, not UTF-16 code units
- identifiers are not Unicode-normalized; identity is exact code-point equality
- both core hard limits and compiled-model limits apply; the effective limit is the smaller value
- the model question-entry limit is the number of compiled questions
- a model per-question selection limit cannot exceed the number of options belonging to that question
- the model total-selection limit is derived from the sum of per-question capacities
- `questionSemanticHash` must match `/^[0-9a-f]{64}$/`; uppercase, prefix, whitespace, and alternate digest formats are rejected

The bounded scanner accepts only acyclic plain data objects with prototype exactly `Object.prototype` or `null`, arrays, and the primitives `null`, `undefined`, string, number, and boolean for later stage-specific validation. Decoders inspect property descriptors before reading values and reject accessors, functions, symbols, BigInts, circular references, the keys `__proto__`, `prototype`, and `constructor` at any external object level, class instances, `Date`, `Map`, `Set`, and other behavioral objects. No getter may execute during decoding.

## 8. Decoder stages

Decoding is deliberately split so old-model data is not prematurely judged by current-model rules.

### 8.1 Minimal envelope decoder

For a versioned source, the minimal decoder safely reads only:

```ts
interface MinimalVersionedEnvelope {
  readonly schemaVersion: unknown
  readonly questionModelVersion?: unknown
  readonly questionSemanticHash?: unknown
}
```

It validates container safety and resource limits, chooses a schema decoder, and does not interpret answer semantics.

### 8.2 Version-specific structural decoder

The V1 structural decoder produces an internal shape such as:

```ts
interface StructurallyDecodedPayloadV1 {
  readonly schemaVersion: 1
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly cursorQuestionId?: string
  readonly submittedAnswers: unknown
}
```

It validates exact fields and primitive types, but it does not require answer IDs, ownership, exclusivity, or bounds to match the current model before registered model migration has run.

### 8.3 Model-aware answer decoder

After schema and model migration, `decodeAnswerDraft` against the current compiled model validates:

- known question and option IDs
- option ownership
- duplicate selections
- exclusive conflicts
- intrinsic selection bounds
- array and string primitive types
- model-derived question and selection limits

Unknown IDs, wrong-owner options, duplicates, exclusive conflicts, intrinsic under-min or over-max answers, and illegal primitives are invalid. They are not repaired by deleting inconvenient data.

## 9. Exact legacy-lineage decoding

The legacy decoder is based on the verified `UserAnswers` contract and frozen observations at the exact legacy commit. It does not infer single versus multiple selection from the received value shape.

The field contracts are:

| Legacy field | Required shape when present |
| --- | --- |
| `form` | string |
| `archetype` | string |
| `tare` | string |
| `source` | string array |
| `body` | string |
| `noodle` | string |
| `signature` | string array |
| `exclusions` | string array |

A single-selection field supplied as an array, a multi-selection field supplied as a string, a nested array, or any non-string selection is invalid. Missing optional legacy answers remain unsubmitted.

Verified legacy initialization gives `source: []` and `signature: []` the meaning “not submitted”; those two exact empty arrays migrate to missing keys. The verified initial exclusions value is `['none']`; a present `exclusions: []` is invalid rather than treated as a hidden default.

The historical `seafood` expansion is field-scoped:

```text
legacy exclusions: seafood
        ↓
current exclusions: fish-seafood, shellfish, shrimp-crab
```

No other question receives this replacement. Expanded values must belong to current `exclusions`, are emitted in compiled option order, and must not collide with another mapped value. Any duplicate, ownership conflict, or exclusive conflict after expansion is invalid; the migration does not silently de-duplicate.

The exact legacy lineage always emits a non-empty `legacy-lineage` migration record, returns `restored-with-changes`, requires write-back, and produces a current V1 normalized payload. Legacy `stepIndex` is never read or migrated.

## 10. Migration registry and evidence

Schema and model migration registries are directed, deterministic, and validated for:

- unique source identity
- one unambiguous next step
- no cycles
- no skipped mandatory version
- a finite path to a current supported identity
- stable evidence order

Migration evidence is discriminated:

```ts
type AppliedMigration =
  | {
      readonly kind: 'legacy-lineage'
      readonly fromSourceId:
        'ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37'
      readonly toSchemaVersion: 1
      readonly toQuestionModelVersion: string
      readonly toQuestionSemanticHash: string
    }
  | {
      readonly kind: 'schema'
      readonly fromSchemaVersion: number
      readonly toSchemaVersion: number
    }
  | {
      readonly kind: 'question-model'
      readonly fromQuestionModelVersion: string
      readonly fromQuestionSemanticHash: string
      readonly toQuestionModelVersion: string
      readonly toQuestionSemanticHash: string
    }
```

A current V1 payload does not receive fake V1-to-V1 schema evidence. A known migration that deliberately rejects a recognized data case returns an invalid result with `PERSISTENCE_MIGRATION_FAILED`. An unexpected exception or impossible output from registered migration code is an internal invariant failure.

## 11. Deterministic repair boundary

Repair is limited to known submitted data that was valid in a recognized lineage but became deterministically stale under current reachability, allowed-option, or forced-answer semantics.

Permitted repairs are:

- remove a known answer for a now-unreachable question
- remove a known option that became disallowed after an upstream semantic change
- remove the whole submitted answer when stale-option removal leaves fewer than the effective minimum
- remove a submitted entry for a question that the current flow now forces
- canonicalize valid selection ordering
- drop an unknown but structurally valid cursor string
- normalize a known but unusable cursor

The intrinsic-invalid boundary is:

- unknown question or option
- option owned by another question
- duplicate selection
- exclusive conflict
- a submission intrinsically below minimum or above maximum, when that condition cannot be explained solely by deterministic stale-option removal caused by an upstream semantic change
- illegal data primitive or shape
- unrecognized model lineage
- a migration without one deterministic output

These cases return `invalid` or `unsupported`; they are not converted into successful restores by deletion.

## 12. Repair order and submitted-state projection

Persistence repair executes in this fixed order:

1. remove unreachable submitted answers
2. remove disallowed submitted options
3. remove a stale under-min submitted answer after step 2
4. remove submitted entries for currently forced questions
5. canonicalize submitted option ordering
6. re-evaluate the projected submitted draft
7. drop or normalize the cursor using the final state
8. build the normalized current V1 payload

Answer and cursor repairs use distinct shapes:

```ts
type PersistenceRepair =
  | {
      readonly code:
        | 'remove-unreachable-answer'
        | 'remove-disallowed-option'
        | 'remove-stale-under-min-answer'
        | 'remove-submitted-forced-answer'
        | 'canonicalize-answer-order'
      readonly questionId: QuestionId
      readonly beforeOptionIds: readonly OptionId[]
      readonly afterOptionIds?: readonly OptionId[]
    }
  | {
      readonly code: 'drop-unknown-cursor' | 'normalize-cursor'
      readonly beforeCursorQuestionId: string
      readonly afterCursorQuestionId?: QuestionId
    }
```

All recorded before and after values remain within the same bounded limits as input data. A forced submitted entry is removed as a whole; it is never replaced with the forced value in persisted data.

The repair projector is package-internal and accepts only the model and original submitted draft. It internally evaluates the original, projects submitted-only repairs, re-evaluates, and verifies a fixed point. It does not expose an API that accepts an independently supplied `FlowState`, so a state from one draft cannot be applied to another draft.

The repaired submitted draft is:

```text
valid submitted answers
- unreachable submitted answers
- disallowed submitted options
- stale under-min question entries
- currently forced question entries
+ canonical option ordering
```

It is never `FlowState.canonicalAnswers`, because canonical answers include forced results that V1 is forbidden to persist.

If the second evaluation remains invalid, repeats the same repair, or changes under another projection, restore fails as an internal invariant rather than returning a successful state.

## 13. Cursor and resume resolution

Cursor resolution runs only after the final repaired-state evaluation. The cursor never changes semantic evaluation.

Rules are:

1. complete and invalid flow states have no resume question
2. a cursor with an invalid primitive type makes the payload invalid
3. a bounded string that is not a known question ID is dropped with `drop-unknown-cursor`
4. a known forced, unreachable, or otherwise non-interactive cursor is normalized
5. if an earlier interactive question remains actionable, that first actionable question wins
6. the supplied cursor is retained only when it is reachable, interactive, and no earlier actionable question exists
7. a successful incomplete state must have a resume question
8. an incomplete state with no actionable resume target is an internal model/runtime invariant failure

The success invariant is:

```text
FlowState.status === complete
→ resumeQuestionId === undefined

FlowState.status === incomplete
→ resumeQuestionId is defined
→ resumeQuestionId is reachable and interactive
→ no earlier actionable question exists
```

The builder accepts a cursor only when:

```ts
resolveResumeQuestion(
  evaluateFlow(model, submittedAnswers),
  cursorQuestionId,
) === cursorQuestionId
```

A complete state accepts only an undefined cursor.

## 14. Public result contracts

The public restore result is a discriminated union:

```ts
type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

type SuccessfulFlowState = Extract<
  FlowState,
  { readonly status: 'incomplete' | 'complete' }
>

type RestoreChange =
  | {
      readonly kind: 'migration'
      readonly migration: AppliedMigration
    }
  | {
      readonly kind: 'repair'
      readonly repair: PersistenceRepair
    }

type RestoreResult =
  | {
      readonly status: 'restored'
      readonly submittedAnswers: AnswerDraft
      readonly flowState: SuccessfulFlowState
      readonly resumeQuestionId?: QuestionId
      readonly migrations: readonly []
      readonly repairs: readonly []
      readonly changes: readonly []
      readonly writeBackRequired: false
    }
  | {
      readonly status: 'restored-with-changes'
      readonly submittedAnswers: AnswerDraft
      readonly flowState: SuccessfulFlowState
      readonly resumeQuestionId?: QuestionId
      readonly migrations: readonly AppliedMigration[]
      readonly repairs: readonly PersistenceRepair[]
      readonly changes: NonEmptyReadonlyArray<RestoreChange>
      readonly writeBackRequired: true
      readonly normalizedPayload: StoredClassificationPayloadV1
    }
  | {
      readonly status: 'unsupported'
      readonly reason:
        | 'unsupported-schema-version'
        | 'unsupported-question-model'
        | 'question-model-integrity-error'
      readonly diagnostics: readonly PersistenceDiagnostic[]
    }
  | {
      readonly status: 'invalid'
      readonly diagnostics: readonly PersistenceDiagnostic[]
      readonly diagnosticSubmittedSubset?: AnswerDraft
    }
```

`changes` lists migrations in execution order, then answer repairs in the fixed repair order, then cursor repairs. A `restored-with-changes` result must contain at least one change. Cursor normalization is a persistence repair and requires write-back.

`diagnosticSubmittedSubset` is best-effort diagnostic context only. It must not be treated as a successful restore, converted into completed answers, sent to scoring, written back automatically, or used to delete or quarantine source data without an explicit future adapter decision.

## 15. Write-back semantics and canonical comparison

`writeBackRequired` is based on the current V1 canonical persistence projection, not merely on whether a migration function ran.

Write-back is required for:

- every legacy-unversioned source
- every schema migration
- every question-model migration
- every submitted-state repair
- removing a submitted forced entry
- canonicalizing answer ordering
- dropping or normalizing a cursor
- updating model version or semantic hash

For current V1, comparison is between the structurally decoded original and the current builder projection. It compares:

- schema version
- question model version
- semantic hash
- cursor presence and value
- submitted question-key presence
- submitted option values and canonical order

It does not compare JSON whitespace, raw object insertion order, line endings, or transport metadata that is not part of the closed V1 schema.

Whenever restore returns `restored-with-changes`, restoring its `normalizedPayload` must reach a fixed point:

```ts
const first = restoreClassification(model, source)

if (first.status === 'restored-with-changes') {
  const second = restoreClassification(model, {
    kind: 'versioned',
    payload: first.normalizedPayload,
  })

  expect(second.status).toBe('restored')
  expect(second.writeBackRequired).toBe(false)
  expect(second.submittedAnswers).toEqual(first.submittedAnswers)
  expect(second.flowState).toEqual(first.flowState)
  expect(second.resumeQuestionId).toEqual(first.resumeQuestionId)
}
```

This single contract proves schema migration, model migration, repair projection, cursor normalization, builder, and restore identity fixed points.

## 16. Current V1 payload builder

Callers do not assemble persistence envelopes by hand:

```ts
function createStoredClassificationPayloadV1(
  model: CompiledQuestionModel,
  submittedAnswers: AnswerDraft,
  cursorQuestionId?: QuestionId,
): CreateStoredPayloadResult

type CreateStoredPayloadResult =
  | {
      readonly status: 'created'
      readonly payload: StoredClassificationPayloadV1
    }
  | {
      readonly status: 'invalid-submitted-state'
      readonly diagnostics: readonly PersistenceDiagnostic[]
    }
```

The builder:

- validates the submitted draft against the current model
- evaluates flow and rejects any diagnostic or repair
- rejects submitted entries for currently forced questions
- rejects a cursor that is not the valid resolved resume target
- accepts no cursor for complete state
- canonicalizes question and option ordering
- writes the current model version and semantic hash
- returns a deterministic deep-frozen current V1 payload

The builder must not silently remove a forced entry or stale answer. Such input indicates that a caller passed canonical answers or otherwise bypassed the submitted-state contract. Only the restore repair pipeline may transform recognized old persisted state.

## 17. Persistence diagnostics

Persistence APIs expose a single contextual diagnostic envelope while retaining exact Batch 2A answer diagnostic codes:

```ts
type PersistenceDiagnosticCode =
  | 'PERSISTENCE_SOURCE_INVALID'
  | 'PERSISTENCE_SOURCE_UNSUPPORTED'
  | 'PERSISTENCE_RESOURCE_LIMIT'
  | 'PERSISTENCE_DATA_NOT_PLAIN'
  | 'PERSISTENCE_ACCESSOR_FORBIDDEN'
  | 'PERSISTENCE_DANGEROUS_KEY'
  | 'PERSISTENCE_CIRCULAR_REFERENCE'
  | 'PERSISTENCE_REQUIRED_FIELD_MISSING'
  | 'PERSISTENCE_UNKNOWN_FIELD'
  | 'PERSISTENCE_FIELD_TYPE_INVALID'
  | 'PERSISTENCE_SCHEMA_VERSION_UNSUPPORTED'
  | 'PERSISTENCE_QUESTION_MODEL_UNSUPPORTED'
  | 'PERSISTENCE_QUESTION_MODEL_INTEGRITY'
  | 'PERSISTENCE_SEMANTIC_HASH_INVALID'
  | 'PERSISTENCE_LEGACY_FIELD_SHAPE_INVALID'
  | 'PERSISTENCE_LEGACY_EMPTY_SELECTION_INVALID'
  | 'PERSISTENCE_LEGACY_EXPANSION_CONFLICT'
  | 'PERSISTENCE_MIGRATION_FAILED'
  | 'PERSISTENCE_SUBMITTED_STATE_REQUIRES_REPAIR'
  | 'PERSISTENCE_SUBMITTED_ANSWER_FOR_FORCED_QUESTION'
  | 'PERSISTENCE_CURSOR_INVALID'

type AnswerDiagnosticCode = Extract<DiagnosticCode, `ANSWER_${string}`>

type PublicPersistenceDiagnosticCode =
  | PersistenceDiagnosticCode
  | AnswerDiagnosticCode

type PersistencePipelineStage =
  | 'source'
  | 'minimal-envelope'
  | 'schema-decode'
  | 'schema-migration'
  | 'model-compatibility'
  | 'model-migration'
  | 'answer-decode'
  | 'flow-evaluation'
  | 'repair-projection'
  | 'resume-resolution'
  | 'payload-build'

interface PersistenceDiagnostic {
  readonly stage: PersistencePipelineStage
  readonly code: PublicPersistenceDiagnosticCode
  readonly path: JsonPointer
  readonly questionId?: string
  readonly optionId?: string
  readonly received?: BoundedReceivedSummary
}
```

Stage order is exactly the union order above. Diagnostic order is:

```text
stage rank
→ canonical JSON Pointer
→ diagnostic code
→ compiled question order
→ compiled option order
```

Paths use RFC 6901:

- root is `""`
- `~` is escaped as `~0`
- `/` is escaped as `~1`
- array indexes are decimal path segments
- JavaScript property accessor syntax is forbidden

Examples are `/submittedAnswers/source/1`, `/cursorQuestionId`, and `/questionSemanticHash`.

Received values are bounded summaries only:

```ts
type BoundedReceivedSummary =
  | { readonly kind: 'null' }
  | { readonly kind: 'array'; readonly count: number }
  | { readonly kind: 'object'; readonly keyCount: number }
  | {
      readonly kind: 'string'
      readonly codePointCount: number
      readonly stableId?: string
    }
  | {
      readonly kind: 'number' | 'boolean' | 'symbol' | 'function' | 'bigint'
    }
```

Arbitrary raw strings, blobs, stack traces, environment values, and subprocess output are never included. `stableId` is permitted only after the value passed the ID length bound and is known to be non-sensitive identifier data.

## 18. Failure boundary and invariant exceptions

All malformed, unsupported, or semantically invalid external data returns a public result union and does not throw. This includes resource-limit violations, malformed envelopes, unknown versions, invalid answers, and a known migration's explicit data rejection.

Programmer, artifact, registry, or impossible-state failures are not disguised as user-data problems. They may throw a bounded internal `PersistenceInvariantError` with a stable code:

```ts
type PersistenceInvariantCode =
  | 'PERSISTENCE_MIGRATION_INVARIANT'
  | 'PERSISTENCE_REPAIR_NON_IDEMPOTENT'
  | 'PERSISTENCE_RESUME_INCONSISTENT'
  | 'PERSISTENCE_MODEL_ARTIFACT_INVALID'
```

The exception message is bounded and contains no raw payload. It never appears inside `RestoreResult`, is not passed to storage quarantine as though user data caused it, and does not expose an unbounded nested error.

## 19. Immutability and deterministic outputs

All successful and failure results returned by public persistence APIs are recursively frozen plain data. Public result graphs contain only:

- plain objects
- readonly arrays
- strings, finite numbers, booleans, and undefined

They contain no class instances, `Error`, `Date`, `Map`, `Set`, functions, accessors, symbols, BigInts, or circular references. Tests must prove the input model and source are not mutated, every public result is deeply frozen, repeated calls are structurally equal, and mutation attempts cannot change later restore results.

The internal `PersistenceInvariantError` may be a class instance because it is thrown rather than embedded in a public data result.

## 20. Frozen legacy persistence observations

Frozen fixtures contain only data directly observable from the exact legacy public behavior:

```ts
type LegacyPersistenceObservation =
  | {
      readonly kind: 'legacy-write-observation'
      readonly actions: readonly LegacyPublicAction[]
      readonly observedAnswers: unknown
    }
  | {
      readonly kind: 'legacy-restore-observation'
      readonly legacyInput: unknown
      readonly observedLegacyOutput: unknown
    }
```

They may record what the legacy app actually wrote as answers and what `restoreUserAnswers()` directly returned for an observed input. They must not store:

- a current V1 payload
- current migration evidence
- persistence repairs or diagnostics
- normalized current submitted answers
- `RestoreResult`
- current flow state or resume target
- new-runtime-only validation metadata

Batch 2B migration contract tests may consume a frozen legacy observation as input and assert the new current result, but that expected current result belongs in Batch 2B test code or a separately versioned contract vector. It is not part of frozen legacy truth.

## 21. Fixture manifest and corpus identity

The frozen persistence fixture manifest binds the full observation corpus and the exact extraction environment. `Sha256` below means a lowercase string matching `/^[0-9a-f]{64}$/`:

```ts
interface PersistenceFixtureManifest {
  readonly fixtureSchemaVersion: string
  readonly extractor: {
    readonly version: string
    readonly hash: Sha256
    readonly sources: readonly {
      readonly path: string
      readonly hash: Sha256
    }[]
  }
  readonly instrumentation: {
    readonly version: string
    readonly hash: Sha256
  }
  readonly source: {
    readonly repository: {
      readonly host: 'github.com'
      readonly owner: 'AnsonHui6040'
      readonly repository: 'ramen-style-today'
    }
    readonly commit:
      'eebf00b7ddfbbe6f01ff598e57f1e17197068a37'
    readonly treeHash:
      '3e527de876cfeccfd3154ddc492830d71c4cfd9a'
    readonly lockfilePath: 'package-lock.json'
    readonly lockfileHash: Sha256
    readonly trackedSourceHashes: Readonly<Record<string, Sha256>>
  }
  readonly runtime: {
    readonly nodeVersion: string
    readonly npmVersion: string
    readonly timezone: 'UTC'
    readonly locale: 'C.UTF-8'
    readonly dependencies: 'physical-isolated'
    readonly extractionNetwork: 'denied'
    readonly lifecycleScripts: 'disabled'
    readonly npmConfigPolicy: {
      readonly userConfig: 'isolated-empty-file'
      readonly globalConfig: 'isolated-empty-file'
      readonly distinctFiles: true
      readonly npmArgvModified: false
    }
  }
  readonly orderedCaseIds: readonly string[]
  readonly caseCount: number
  readonly casesHash: Sha256
}
```

`casesHash` is calculated from canonical serialization of the complete corpus. Canonicalization fixes object-key representation and ignores JSON formatting, line endings, and machine paths, but it preserves the order of observable legacy answer and selection arrays. The extractor must not sort away behavior that legacy exposed.

The trust chain is:

```text
classification provenance
→ fixtureManifestHash
→ frozen fixture manifest
→ casesHash
→ frozen legacy observation corpus
```

The frozen manifest never records the current implementation SHA, current question semantic hash, or current verification result. Those mutable verification identities belong to current provenance and the migration ledger.

## 22. Extractor isolation and publication

The persistence extractor reuses the Batch 2A Task 9 isolation and publication implementation. Shared generic facilities may be extracted from `tools/parity/questions/extractor.ts` into an internal parity utility, provided question fixture semantics and accepted Batch 2A identities remain unchanged. A near-copy with independently drifting safety behavior is forbidden.

The inherited guarantees include:

- normalized repository identity plus exact full commit, root tree, relevant source hashes, and lockfile hash
- a temporary worktree with isolated dependencies, home, npm cache, TypeScript cache, and two distinct isolated npm config files
- unchanged npm command and argv
- pre- and post-extraction verification of the original checkout's HEAD, tree, tracked status, and extractor-sensitive ignored-path fingerprints
- failure on any original-checkout identity or monitored cache change
- explicit authoring only; ordinary CI never clones or executes legacy code
- atomic target replacement under the publication lock
- successful lock release as the publication commit point
- rollback under lock for every pre-commit failure
- no rollback after the lock is released
- bounded `published-with-cleanup-warning` result when post-commit backup cleanup fails
- safe recovery backup paths within the approved recovery root

CI reads only committed frozen fixtures and their integrity manifest.

## 23. Verification matrix

Batch 2B verification includes independent gates for:

1. minimal-envelope safety, accessors, prototypes, cycles, exact fields, and every hard/resource limit
2. exact semantic-hash syntax and code-point counting
3. schema-version and question-model identity matrix
4. migration registry cycles, ambiguity, gaps, evidence, and bounded failures
5. legacy field-specific migration tests that consume frozen observations while keeping current expectations outside the legacy oracle
6. field-specific single/multiple shapes, empty-array rules, and scoped `seafood` expansion collision cases
7. every persistence repair code and the intrinsic-invalid boundary
8. fixed repair ordering, canonical answer ordering, deterministic diagnostics, RFC 6901 escaping, and bounded received summaries
9. repaired submitted-state idempotence and normalized-payload restore fixed point
10. success resume invariants for complete and incomplete flow states
11. builder acceptance, canonical output, forced-entry rejection, stale-state rejection, and cursor rejection
12. builder-to-restore and restore-to-builder identity
13. success results never containing an invalid `FlowState`
14. public-result deep freeze, input immutability, determinism, and plain-data shape
15. invariant exceptions remaining distinct from external-data result unions
16. fixture schema, case coverage, ordered IDs, `casesHash`, manifest hash, and legacy identity
17. fixture rejection when current V1 or new-runtime-only metadata appears in the legacy oracle
18. runtime import boundaries and absence of Node, compiler, extractor, storage, React, styles, scoring, and catalog dependencies
19. public export shape and no accidental internal helper exports
20. classification index, provenance, readiness, migration ledger, acceptance path ownership, and generated-document drift

The existing Batch 2A compiler proofs and question observable parity remain their own gates. Batch 2B tests do not relabel new persistence contracts as legacy parity.

## 24. Provenance and assurance

The canonical assurance vocabulary gains `contract-verified`:

```ts
type Assurance =
  | 'unverified'
  | 'structurally-validated'
  | 'compiler-validated'
  | 'contract-verified'
  | 'parity-verified'
  | 'production-observed'
```

These values describe distinct evidence and are not a single interchangeable maturity ranking:

| Assurance | Evidence |
| --- | --- |
| `unverified` | data exists without a completed formal gate |
| `structurally-validated` | schema and reference structure are valid |
| `compiler-validated` | the relevant domain compiler's semantic proofs passed |
| `contract-verified` | named API, migration, repair, and invariant tests passed |
| `parity-verified` | observable behavior matched a specified behavioral oracle |
| `production-observed` | the new system has production execution evidence |

Persistence provenance uses numeric `schemaVersion: 1` and has this required identity shape. `FullGitCommitSha` is validated by `/^[0-9a-f]{40}$/`; `Sha256` is validated by `/^[0-9a-f]{64}$/`:

```ts
persistence: {
  origin: 'manually-authored',
  assurance: 'contract-verified',
  schemaVersion: 1,
  implementationSha: FullGitCommitSha,
  fixtureManifestPath:
    'tools/parity/fixtures/persistence/legacy-unversioned/manifest.json',
  fixtureManifestHash: Sha256,
  verificationScope: 'pure persistence restore and payload contracts',
  legacyLineage: {
    origin: 'legacy-production',
    sourceRepository: {
      host: 'github.com',
      owner: 'AnsonHui6040',
      repository: 'ramen-style-today',
    },
    sourceCommit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
    sourceTreeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
  },
}
```

`contract-verified` does not claim persistence parity, migrated production data, an integrated storage adapter, cutover, or production observation. The exact implementation SHA and current fixture manifest hash bind the assurance to the evidence actually tested.

## 25. Readiness after Batch 2B

Batch 2B completes the persistence core, not production persistence migration. Overall readiness remains `migration-only`.

The blocker transition is from an unimplemented persistence core to an unintegrated adapter. It must not imply that user data has been read or rewritten. The resulting blockers include at least:

```ts
[
  'persistence-adapter-not-integrated',
  'persisted-data-cutover-incomplete',
  'styles-not-production-verified',
  'scoring-not-production-verified',
  'runtime-cutover-incomplete',
]
```

Only a later adapter and cutover batch may remove the first two blockers after it implements the storage key strategy, atomic next-key write, read-back validation, quarantine, autosave ordering, and real cutover evidence.

## 26. Machine-readable path ownership

Acceptance distinguishes three path categories.

### 26.1 Implementation paths

These contain the persistence semantics or frozen observation implementation:

```ts
implementationPaths: [
  'packages/classification-core/src/persistence/**',
  'tools/parity/persistence/**',
  'tools/parity/fixtures/persistence/**',
  'packages/classification-core/src/index.ts',
  'packages/classification-core/src/index.test.ts',
]
```

Every additional shared contract or diagnostic file changed during implementation is appended to this array as a literal repository-relative path before the implementation commit. The ledger records concrete shared files rather than a wildcard outside the persistence-owned directories. These paths cannot change after the implementation SHA without invalidating acceptance evidence.

### 26.2 Verification paths

These define gate behavior:

```ts
verificationPaths: [
  'package.json',
  'package-lock.json',
  '.github/workflows/**',
  'tools/acceptance/**',
]
```

Every additional import-boundary, fixture, index, ledger, or gate file changed during implementation is appended as a literal path before the implementation commit. Any changed verification file is part of implementation evidence and is frozen after the implementation SHA. It cannot be altered in a metadata-only completion commit.

### 26.3 Acceptance metadata paths

Only designated non-executable records may change in the final metadata commit:

```ts
acceptanceMetadataPaths: [
  'docs/migration/ledger.json',
  'docs/migration/ledger.md',
  'docs/classification/manifest.json',
  'docs/classification/index.md',
]
```

`README.md` or `AGENTS.md` can enter this array only through an explicit implementation-time ledger change that identifies the exact file before the implementation commit. The final set is recorded exactly in the migration ledger. Documentation is not automatically metadata-only: a file that changes verification semantics, fixture meaning, public contracts, or implementation instructions belongs to implementation or verification evidence.

## 27. Acceptance sequence and rejection conditions

Acceptance follows this order:

1. complete implementation and all tests in the isolated Batch 2B worktree
2. run the full offline `npm run verify` without overrides
3. confirm the worktree diff contains no protected Batch 2A semantic change
4. create the implementation commit and push its exact SHA
5. require GitHub Actions success for that exact implementation SHA
6. authenticate the accepted implementation SHA and bind `contract-verified` to its fixture manifest hash
7. update only registered acceptance metadata paths in a second commit
8. run local verification and GitHub Actions for the metadata commit
9. confirm the implementation SHA is an ancestor, implementation and verification paths are unchanged, and only acceptance metadata changed
10. confirm the legacy checkout's HEAD, tree, tracked status, and monitored caches remain unchanged

Batch 2B is rejected if:

- a frozen legacy fixture contains current V1 or new-runtime-only metadata
- a current migration expectation is stored as legacy oracle truth
- the fixture manifest does not bind the complete corpus hash
- `contract-verified` is not bound to the exact implementation SHA and fixture manifest hash
- implementation or verification paths change after the implementation SHA
- the metadata commit changes a non-metadata-owned path
- the Batch 2A question model version, semantic hash, definitions, compiler, artifact, flow, or question fixture semantics change
- a normalized payload produces another migration, repair, or cursor change when restored again
- a successful incomplete restore lacks a valid resume target
- a successful restore contains an invalid `FlowState`
- the runtime public graph imports compiler, extractor, Node, React, storage, styles, scoring, or catalog code
- local offline verification or either required GitHub Actions run is not fully green
- the legacy source identity or monitored original-checkout state changes

## 28. Future adapter handoff

Batch 2B returns enough plain data for a later storage adapter without making storage decisions:

| Core result | Future adapter responsibility |
| --- | --- |
| `restored` | use the current V1 payload state; do not rewrite solely for restore |
| `restored-with-changes` | atomically write `normalizedPayload` to the designated next key, read it back, then enable autosave |
| `unsupported` | preserve the original source and route it to a defined unsupported/quarantine flow |
| `invalid` | preserve the original source and route it to a defined invalid/quarantine flow |
| invariant exception | stop the adapter operation and surface a deployment/programmer failure; do not blame or rewrite user data |

The adapter remains responsible for keys, atomicity, read-back, quarantine, telemetry, UI messaging, and cutover sequencing. Nothing in Batch 2B writes, deletes, or quarantines external data.

## 29. Final implementation boundary

The completed Batch 2B contract is:

```text
bounded unknown input
→ explicit schema and model migration
→ current submitted-answer validation
→ accepted Batch 2A flow evaluation
→ deterministic submitted-state projection
→ stable resume resolution
→ normalized current V1 payload
→ frozen legacy observation checks
→ persistence contract verification
→ exact-SHA acceptance evidence
```

The batch may be marked `Final — Approved for implementation` only after this consolidated document receives written user approval. Implementation then requires a separate task-by-task plan produced under the repository planning workflow before runtime code is changed.
