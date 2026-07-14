# Batch 2B Persistence and Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure, bounded, versioned classification persistence core with explicit legacy migration, deterministic submitted-state repair, stable resume resolution, frozen legacy persistence observations, and exact-SHA contract evidence without integrating storage or changing Batch 2A question/flow semantics.

**Architecture:** Untrusted data passes through a closed source discriminator, bounded structural decoding, separate schema/model migrations, current `AnswerDraft` validation, Batch 2A flow evaluation, submitted-only repair projection, fixed-point re-evaluation, resume resolution, and normalized V1 construction. A controlled Batch 2A maintenance step first extracts the proven isolation/publication transaction into one shared authoring library, after which question and persistence adapters supply domain-specific schemas.

**Tech Stack:** Node.js 24, npm 11, npm workspaces, TypeScript 6.0.3, Zod 4.4.3 for Node-only tooling, Vitest 4.1.10, ESLint 10.6.0, tsx 4.23.0, Git, GitHub Actions, and the accepted Batch 2A flow runtime.

**Approved specification:** `docs/superpowers/specs/2026-07-14-batch-2b-persistence-repair-design.md`

**Status:** Ready for execution after plan review.

## Global Constraints

- Execute only in `/Users/ansonhui/Documents/GitHub/ramen-style-today-next/.worktrees/batch-2b-persistence-repair` on `codex/batch-2b-persistence-repair`.
- Preserve Batch 2A model version `batch2a.1.0`, semantic hash `d1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d`, generated artifact bytes, question case corpus bytes, case IDs/count/content hash, seeds, instrumentation, and legacy identity.
- Preserve historical Batch 2A implementation SHA `ecf9f5b4791862471d0898da7283ba4a40d3fbf9`; shared-extractor work receives separate maintenance evidence.
- The question manifest may update only extractor authoring identity; it must keep case/content, instrumentation, seeds, source, model, and semantic identities unchanged.
- Legacy identity is `AnsonHui6040/ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37`, tree `3e527de876cfeccfd3154ddc492830d71c4cfd9a`.
- Runtime persistence code is pure and browser-neutral; no Node, Zod, compiler, extractor, React, DOM, storage, styles, scoring, catalog, locale, phase, clocks, or timestamps.
- Persist submitted answers only; never persist forced, canonical, completed, repair, pending-selection, allowed/reachable, or navigation metadata.
- Keep schema migration and question-model migration independent and explicit. Never infer lineage from keys, shape, IDs, or `stepIndex`.
- External data failures return deep-frozen unions. Impossible programmer/artifact/registry states throw bounded `PersistenceInvariantError` without raw payload data.
- Root depth is `0`; each property/element adds one; resource counts occur before de-duplication, expansion, repair, or canonicalization; IDs use exact Unicode code points without normalization.
- Current V1 is a closed exact-field schema with numeric `schemaVersion: 1` and lowercase 64-character `questionSemanticHash`.
- Repair only recognized deterministic staleness. Unknown/wrong-owner IDs, duplicates, exclusive conflicts, intrinsic bounds errors, illegal primitives, and unknown lineages remain invalid/unsupported.
- Repair projection evaluates internally, persists submitted-only state, re-evaluates, and proves idempotence. Never save `FlowState.canonicalAnswers`.
- Successful incomplete restore requires a reachable interactive resume target with no earlier actionable question; complete restore has no resume target.
- Frozen legacy fixtures contain only directly observed legacy writes and `restoreUserAnswers()` outputs; current migration expectations remain in Batch 2B tests.
- `npm run verify` remains offline and read-only; extraction is an explicit authoring command.
- Use TypeScript ES modules, 2-space indentation, single quotes, no semicolons, deterministic code-point ordering, RFC 6901 paths, and deep-frozen plain-data outputs.
- Every task follows red-green TDD, runs focused and affected gates, receives review, and ends with a focused commit.

---

## Planned file map

```text
packages/classification-core/src/persistence/
  contracts.ts limits.ts diagnostics.ts plain-data.ts invariant-error.ts
  decode-envelope.ts decode-v1.ts decode-answers.ts
  schema-migrations.ts model-migrations.ts legacy-lineage.ts
  repair.ts resume.ts restore.ts create-payload.ts index.ts test-fixtures.ts
  *.test.ts

tools/parity/shared/
  contracts.ts authoring.ts authoring.test.ts

tools/parity/questions/
  contracts.ts extractor.ts and affected tests

tools/parity/persistence/
  contracts.ts extractor.ts extract.ts verify-fixtures.ts
  legacy-instrumentation.patch seeds.json *.test.ts

tools/parity/fixtures/persistence/legacy-unversioned/
  cases.json manifest.json

packages/classification-core/src/contracts/provenance.ts
packages/classification-core/src/index.ts and index.test.ts
tools/documentation/** tools/migration/** tools/acceptance/**
docs/classification/index.md docs/classification/manifest.json
docs/migration/ledger.json docs/migration/ledger.md
package.json package-lock.json .github/workflows/ci.yml
```

## Specification coverage

| Specification | Tasks |
| --- | --- |
| Decision, scope, package boundary | 1–4, 10, 14 |
| Source, V1, identity, bounded staged decoding | 4–6 |
| Repair, resume, result, builder, diagnostics | 7–10, 13 |
| Frozen observations, corpus manifest, shared extractor | 2–3, 11–13 |
| Assurance, readiness, path ownership, acceptance | 1, 3, 14–15 |

## Execution prerequisite

```bash
cd /Users/ansonhui/Documents/GitHub/ramen-style-today-next/.worktrees/batch-2b-persistence-repair
test "$(git branch --show-current)" = "codex/batch-2b-persistence-repair"
test "$(git status --porcelain)" = ""
git merge-base --is-ancestor e8ec5c54e9b71844b883473f4eb8a730f5d89278 HEAD
npm run verify
mkdir -p .superpowers/batch-2b-baseline
shasum -a 256 packages/classification-core/src/generated/question-model.ts \
  tools/parity/fixtures/questions/legacy-v1/cases.json \
  tools/parity/questions/seeds.json \
  tools/parity/questions/legacy-instrumentation.patch \
  > .superpowers/batch-2b-baseline/protected.sha256
node -e "const m=require('./tools/parity/fixtures/questions/legacy-v1/manifest.json'); console.log(JSON.stringify({caseIds:m.caseIds,caseCount:m.caseCount,fixtureContentHash:m.fixtureContentHash,instrumentation:m.instrumentation,source:m.source},null,2))" \
  > .superpowers/batch-2b-baseline/question-manifest-invariants.json
```

Expected: unchanged baseline has 32 test files and 470 passing tests; both `.superpowers` evidence files remain ignored and uncommitted.

---

### Task 1: Add the controlled Batch 2A maintenance gate

**Files:**
- Modify: `tools/migration/ledger-schema.ts`
- Modify: `tools/migration/ledger-check.ts`
- Modify: `tools/migration/ledger-check.test.ts`
- Modify: `tools/migration/render-ledger.ts`
- Modify: `tools/migration/render-ledger.test.ts`
- Modify: `tools/migration/record-ci.ts`
- Modify: `tools/migration/record-ci.test.ts`
- Modify: `tools/migration/check-ledger.ts`
- Modify: `docs/migration/ledger.json`
- Generate: `docs/migration/ledger.md`

**Interfaces:**
- Consumes: historical Batch 2A implementation/evidence and current semantic-path checker.
- Produces: exact `batch2AMaintenancePaths`, protected invariant hashes, `in-progress | complete` maintenance state, and `2A-maintenance` authenticated CI recording.

- [ ] **Step 1: Write failing maintenance schema and ancestry tests**

```ts
test('allows only approved in-progress maintenance paths', async () => {
  const ledger = withMaintenance(completeBatch2ALedger(), {
    status: 'in-progress',
    paths: [...batch2AMaintenancePaths],
    baseline: protectedQuestionBaseline,
    verification: [],
  })
  const result = await checkLedgerOffline(ledger, repositoryState({
    changedPaths: [
      'tools/parity/shared/authoring.ts',
      'tools/parity/questions/extractor.ts',
    ],
  }))
  expect(result.diagnostics).toEqual([])
  expect(ledger.entries[2]!.implementationSha).toBe(
    'ecf9f5b4791862471d0898da7283ba4a40d3fbf9',
  )
})

test('rejects corpus and artifact changes', async () => {
  const result = await checkLedgerOffline(inProgressMaintenanceLedger(), repositoryState({
    changedPaths: ['tools/parity/fixtures/questions/legacy-v1/cases.json'],
  }))
  expect(result.diagnostics[0]?.message).toBe(
    'Batch 2A maintenance changed a protected question path',
  )
})
```

- [ ] **Step 2: Run focused tests and confirm red**

```bash
npx vitest run tools/migration/ledger-check.test.ts \
  tools/migration/render-ledger.test.ts tools/migration/record-ci.test.ts
```

Expected: FAIL because maintenance evidence is not in the schema or ancestry gate.

- [ ] **Step 3: Implement exact maintenance contracts**

```ts
export const batch2AMaintenancePaths = [
  'tools/parity/shared/**',
  'tools/parity/questions/contracts.ts',
  'tools/parity/questions/contracts.test.ts',
  'tools/parity/questions/extractor.ts',
  'tools/parity/questions/extractor.test.ts',
  'tools/parity/fixtures/questions/legacy-v1/manifest.json',
] as const

export const protectedQuestionBaseline = {
  modelVersion: 'batch2a.1.0',
  semanticHash: 'd1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d',
  generatedArtifactHash: '48386ff2d6b3e9de7944169a2c3edb9992187257dd8573a107e2b15f7d80bd43',
  casesHash: '89d7f7588c27f6c243eb28bb606c711d881d1223c34c62216d1df39a098419f3',
  fixtureContentHash: '89d7f7588c27f6c243eb28bb606c711d881d1223c34c62216d1df39a098419f3',
  seedsHash: 'f7a37a15c9b9fbdbd3b10311d3f11f1efdea548d6ba835605d1a987ca694173b',
  instrumentationHash: 'cbf5018a0d890fcb3d5915cd2c8e9abde3d93178ebcaa4082823d0f5a21809ba',
  sourceCommit: 'eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
  sourceTreeHash: '3e527de876cfeccfd3154ddc492830d71c4cfd9a',
} as const
```

`in-progress` has no SHA/evidence and permits only the allowlist while proving baseline hashes. `complete` requires `maintenanceSha` plus exactly `batch2a-maintenance-local-verify` and `batch2a-maintenance-remote-ci`, with remote commit matching the maintenance SHA. Extend `record-ci` target `2A-maintenance` accordingly.

- [ ] **Step 4: Register in-progress maintenance and verify**

Add `maintenance` with the exact paths/baseline above, `status: 'in-progress'`, and empty verification to the Batch 2A ledger entry, then run:

```bash
npm run migration:ledger
npx vitest run tools/migration
npm run migration:ledger:check
git diff --check
```

Expected: rendered ledger says maintenance is in progress and does not claim semantic completion.

- [ ] **Step 5: Commit**

```bash
git add tools/migration docs/migration/ledger.json docs/migration/ledger.md
git commit -m "Define shared extractor maintenance gate"
```

---

### Task 2: Extract the shared isolation/publication transaction

**Files:**
- Create: `tools/parity/shared/contracts.ts`
- Create: `tools/parity/shared/authoring.ts`
- Create: `tools/parity/shared/authoring.test.ts`
- Modify: `tools/parity/questions/contracts.ts`
- Modify: `tools/parity/questions/contracts.test.ts`
- Modify: `tools/parity/questions/extractor.ts`
- Modify only if imports require it: `tools/parity/questions/extractor.test.ts`
- Regenerate extractor identity only: `tools/parity/fixtures/questions/legacy-v1/manifest.json`

**Interfaces:**
- Consumes: proven Task 9 transaction and question schemas/hooks.
- Produces: `FixtureAuthoringAdapter<Seed, Case, Manifest>`, `runFixtureAuthoring`, shared publication results, and a question adapter preserving existing extractor exports.

- [ ] **Step 1: Write failing generic adapter tests and move high-risk transaction tests**

```ts
test('uses domain parsers without changing transaction order', async () => {
  const events: string[] = []
  const result = await runFixtureAuthoring(
    fakeEnvironment({ events }),
    fakeAdapter([{ id: 'case-a', observed: true }]),
    { verifyOnly: false },
  )
  expect(result.published).toBe(true)
  expect(events.indexOf('target-verified')).toBeLessThan(events.indexOf('lock-released'))
  expect(events.indexOf('lock-released')).toBeLessThan(events.indexOf('backup-cleanup'))
})
```

Retain concurrent-author, rollback, indeterminate lock, symlink, isolated npm config, cache fingerprint, network denial, cleanup warning, and recovery archive tests.

- [ ] **Step 2: Run the shared test and confirm red**

```bash
npx vitest run tools/parity/shared/authoring.test.ts
```

Expected: FAIL because shared authoring modules do not exist.

- [ ] **Step 3: Define and implement the generic boundary**

```ts
export interface FixtureAuthoringAdapter<Seed, Case, Manifest> {
  readonly parseSeeds: (input: unknown) => readonly Seed[]
  readonly parseRawCases: (input: unknown) => readonly Case[]
  readonly validateCases: (cases: readonly Case[], seeds: readonly Seed[]) => readonly Case[]
  readonly buildManifest: (input: ManifestBuildInput<Case>) => Manifest
  readonly serializeCases: (cases: readonly Case[]) => Buffer
  readonly serializeManifest: (manifest: Manifest) => Buffer
}

export function runFixtureAuthoring<Seed, Case, Manifest>(
  environment: AuthoringEnvironment,
  adapter: FixtureAuthoringAdapter<Seed, Case, Manifest>,
  options: RunFixtureAuthoringOptions,
): Promise<FixtureAuthoringResult<Case, Manifest>>
```

Move the transaction/no-follow/isolated execution/publication logic without changing it. Replace only question parsing, validation, manifest projection, and serialization with adapter calls. Lock release remains the publication commit point.

- [ ] **Step 4: Bind the question adapter and authoring identity**

```ts
const questionAdapter: FixtureAuthoringAdapter<
  LegacyObservableSeedCase,
  LegacyObservableTraceCase,
  FixtureManifest
> = {
  parseSeeds: parseQuestionSeeds,
  parseRawCases: parseQuestionCases,
  validateCases: validateQuestionTraceCases,
  buildManifest: buildQuestionFixtureManifest,
  serializeCases: serializeQuestionCases,
  serializeManifest: serializeQuestionManifest,
}

export const extractorAuthoringSourcePaths = [
  'tools/parity/shared/contracts.ts',
  'tools/parity/shared/authoring.ts',
  'tools/parity/questions/contracts.ts',
  'tools/parity/questions/extractor.ts',
  'tools/parity/questions/extract.ts',
] as const
```

Keep `runLegacyExtractor()` as a thin call to `runFixtureAuthoring(environment, questionAdapter, options)` and re-export shared types required by existing callers.

- [ ] **Step 5: Re-author the manifest and prove protected invariants**

```bash
npx tsx tools/parity/questions/extract.ts \
  --legacy /Users/ansonhui/Documents/GitHub/ramen-style-today --replace
shasum -a 256 -c .superpowers/batch-2b-baseline/protected.sha256
npx vitest run tools/parity/shared tools/parity/questions
npm run parity:questions
npm run lint
npm test
npm run typecheck
npm run build
npm run classification:validate
npm run questions:check
npm run runtime:imports:check
```

Compare current manifest `caseIds`, `caseCount`, `fixtureContentHash`, `instrumentation`, and `source` to `.superpowers/batch-2b-baseline/question-manifest-invariants.json`; require exact equality. Only extractor authoring fields may differ.

Run `npm run classification:index:check` once and record the expected sole failure `DOC_INDEX_DRIFT docs/classification/manifest.json`. Run `npm run migration:ledger:check` once and record the expected sole failure `classification manifest observable-trace fixture manifest hash is inconsistent`. Both checks consume the same stale classification metadata binding; neither drift is accepted as a remaining verification failure. Task 3 must regenerate and commit the classification metadata before defining or pushing the maintenance candidate. Any other failure stops Task 2.

- [ ] **Step 6: Commit the maintenance implementation**

```bash
git add tools/parity/shared tools/parity/questions/contracts.ts \
  tools/parity/questions/contracts.test.ts tools/parity/questions/extractor.ts \
  tools/parity/fixtures/questions/legacy-v1/manifest.json
git diff --cached --check
git commit -m "Share fixture authoring transaction"
```

Add `extractor.test.ts` only if it actually changed. This allowlist-only commit is the Task 2 implementation handoff; it is not yet `maintenanceSha`. Task 3 adds the required classification metadata rebind, proves the combined commit with full `npm run verify`, and only that green combined commit becomes `maintenanceSha`.

---

### Task 3: Authenticate Batch 2A maintenance evidence

**Files:**
- Modify: `docs/migration/ledger.json`
- Generate: `docs/migration/ledger.md`
- Generate: `docs/classification/manifest.json`
- Generate: `docs/classification/index.md`

**Interfaces:**
- Consumes: the Task 2 allowlist-only implementation commit and the in-progress maintenance ledger.
- Produces: a full-green maintenance candidate containing the classification metadata rebind, then complete exact-SHA maintenance evidence while retaining historical semantic implementation identity.

- [ ] **Step 1: Rebind classification metadata and create the green maintenance candidate**

```bash
npm run classification:index
git diff --name-only
```

Expected additional changes are limited to `docs/classification/manifest.json` and, only if generator output requires it, `docs/classification/index.md`. The generated metadata must retain historical question `implementationSha`, model version, semantic hash, observable case/content identities, and `parity-verified` scope while rebinding only the current question fixture manifest hash implied by the approved authoring refactor.

```bash
git add docs/classification/manifest.json docs/classification/index.md
git diff --cached --check
git commit -m "Rebind shared extractor maintenance metadata"
npm run verify
test -z "$(git status --porcelain)"
```

This combined HEAD is the maintenance candidate. The exact full verify must be green before it is pushed; no implementation or verification failure is deferred past this point.

- [ ] **Step 2: Push and wait for exact maintenance CI**

```bash
MAINTENANCE_SHA=$(git rev-parse HEAD)
test "$(git status --porcelain)" = ""
git push -u origin codex/batch-2b-persistence-repair
RUN_ID=''
for attempt in {1..30}; do
  RUN_ID=$(gh run list --workflow ci.yml --commit "$MAINTENANCE_SHA" --event push \
    --limit 1 --json databaseId --jq '.[0].databaseId')
  test -n "$RUN_ID" && break
  sleep 2
done
test -n "$RUN_ID"
gh run watch "$RUN_ID" --exit-status
```

Expected: exact maintenance run for the combined Task 2 implementation plus classification metadata rebind is `completed/success`.

- [ ] **Step 3: Record authenticated proof**

```bash
MAINTENANCE_SHA=$(git rev-parse HEAD)
RUN_JSON=$(gh run view "$RUN_ID" --json databaseId,headSha,status,conclusion,url)
RUN_JSON="$RUN_JSON" MAINTENANCE_SHA="$MAINTENANCE_SHA" node - <<'NODE'
const fs = require('fs')
const run = JSON.parse(process.env.RUN_JSON)
if (run.headSha !== process.env.MAINTENANCE_SHA || run.status !== 'completed'
  || run.conclusion !== 'success') throw new Error('maintenance CI identity mismatch')
fs.writeFileSync('.superpowers/batch-2b-maintenance-proof.json', JSON.stringify({
  schemaVersion: 1, sha: run.headSha, runId: run.databaseId, runUrl: run.url,
}, null, 2) + '\n')
NODE
npm run migration:ledger:record-ci -- 2A-maintenance \
  .superpowers/batch-2b-maintenance-proof.json
npm run classification:index
npm run migration:ledger
npm run verify
```

Expected: maintenance is complete with two gates, old `implementationSha` unchanged, question semantic/corpus identities unchanged, current manifest hash rebound.

- [ ] **Step 4: Commit and push maintenance evidence metadata**

```bash
git add docs/migration/ledger.json docs/migration/ledger.md \
  docs/classification/manifest.json docs/classification/index.md
git commit -m "Record shared extractor maintenance evidence"
git push
```

- [ ] **Step 5: Authenticate the maintenance evidence metadata commit**

```bash
MAINTENANCE_METADATA_SHA=$(git rev-parse HEAD)
MAINTENANCE_METADATA_RUN=''
for attempt in {1..30}; do
  MAINTENANCE_METADATA_RUN=$(gh run list --workflow ci.yml \
    --commit "$MAINTENANCE_METADATA_SHA" --event push --limit 1 \
    --json databaseId --jq '.[0].databaseId')
  test -n "$MAINTENANCE_METADATA_RUN" && break
  sleep 2
done
test -n "$MAINTENANCE_METADATA_RUN"
gh run watch "$MAINTENANCE_METADATA_RUN" --exit-status
```

Do not begin Task 4 until this exact metadata commit's GitHub run is `completed/success`.

---

### Task 4: Add persistence contracts and safe decoding primitives

**Files:**
- Create: `packages/classification-core/src/persistence/contracts.ts`
- Create: `packages/classification-core/src/persistence/limits.ts`
- Create: `packages/classification-core/src/persistence/diagnostics.ts`
- Create: `packages/classification-core/src/persistence/plain-data.ts`
- Create: `packages/classification-core/src/persistence/invariant-error.ts`
- Create: `packages/classification-core/src/persistence/contracts.test.ts`
- Create: `packages/classification-core/src/persistence/plain-data.test.ts`
- Modify: `packages/classification-core/src/contracts/diagnostic-codes.ts`

**Interfaces:**
- Consumes: flow types, compiled model, `deepFreeze`, existing diagnostic codes.
- Produces: all public persistence unions, exact limits/stages/codes, RFC 6901 helpers, bounded summaries, descriptor-safe `scanPlainData`, and internal invariant error.

- [ ] **Step 1: Write failing hostile-input tests**

```ts
test('rejects an accessor without invoking it', () => {
  let invoked = false
  const input = Object.defineProperty({}, 'payload', {
    enumerable: true,
    get() { invoked = true; return {} },
  })
  const result = scanPlainData(input)
  expect(invoked).toBe(false)
  expect(result).toMatchObject({
    ok: false,
    diagnostics: [{ code: 'PERSISTENCE_ACCESSOR_FORBIDDEN', path: '/payload' }],
  })
})

test('counts root depth as zero and rejects cycles and behavioral objects', () => {
  expect(scanPlainData({ a: { b: { c: { d: 'ok' } } } }).ok).toBe(true)
  expect(scanPlainData({ a: { b: { c: { d: { e: 'deep' } } } } }).ok).toBe(false)
  const cycle: Record<string, unknown> = {}; cycle.self = cycle
  expect(scanPlainData(cycle).ok).toBe(false)
  expect(scanPlainData(new Date()).ok).toBe(false)
})
```

Also reject own `__proto__`, `prototype`, `constructor`, symbols, functions, BigInts, `Map`, `Set`, and non-plain prototypes.

- [ ] **Step 2: Run tests and confirm red**

```bash
npx vitest run packages/classification-core/src/persistence/contracts.test.ts \
  packages/classification-core/src/persistence/plain-data.test.ts
```

Expected: FAIL because persistence primitives do not exist.

- [ ] **Step 3: Implement exact contracts and limits**

```ts
export const persistenceLimits = {
  maxDepth: 4,
  maxQuestionEntries: 64,
  maxSelectionsPerQuestion: 64,
  maxTotalSelections: 512,
  maxIdCodePoints: 128,
  maxModelVersionCodePoints: 128,
} as const

export type ClassificationRestoreSource =
  | { readonly kind: 'legacy-unversioned'; readonly sourceId:
      'ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37'; readonly answers: unknown }
  | { readonly kind: 'versioned'; readonly payload: unknown }

export interface StoredClassificationPayloadV1 {
  readonly schemaVersion: 1
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly cursorQuestionId?: QuestionId
  readonly submittedAnswers: AnswerDraft
}
```

Define every approved `RestoreResult`, `RestoreChange`, `AppliedMigration`, `PersistenceRepair`, `CreateStoredPayloadResult`, diagnostic and stage union exactly from the spec. Append all specified `PERSISTENCE_*` codes without renaming `ANSWER_*` codes.

- [ ] **Step 4: Implement scanner, pointer, sorting, and invariant error**

Visit data descriptors only, maintain an ancestor set, and sort diagnostics by stage rank → pointer → code → question order → option order. Escape pointer tokens with `~0`/`~1`. Freeze every public result. Implement:

```ts
export class PersistenceInvariantError extends Error {
  constructor(readonly invariantCode: PersistenceInvariantCode, message: string) {
    super(Array.from(message).slice(0, 300).join(''))
    this.name = 'PersistenceInvariantError'
  }
}
```

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run packages/classification-core/src/persistence
npm run typecheck && npm run lint && git diff --check
git add packages/classification-core/src/persistence \
  packages/classification-core/src/contracts/diagnostic-codes.ts
git commit -m "Add persistence contracts and bounded primitives"
```

---

### Task 5: Decode closed sources and V1 envelopes

**Files:**
- Create: `packages/classification-core/src/persistence/decode-envelope.ts`
- Create: `packages/classification-core/src/persistence/decode-v1.ts`
- Create: `packages/classification-core/src/persistence/decode-answers.ts`
- Create: `packages/classification-core/src/persistence/test-fixtures.ts`
- Create: corresponding `*.test.ts` files

**Interfaces:**
- Consumes: Task 4 primitives and Batch 2A answer decoder/evaluator.
- Produces: internal `decodeRestoreSource`, `decodeMinimalEnvelope`, `decodeStoredPayloadV1Structure`, and `decodeCurrentAnswerDraft`.

- [ ] **Step 1: Write failing staged-decoder tests**

```ts
test('does not infer legacy source from shape and rejects extra fields', () => {
  expect(decodeRestoreSource({ answers: { form: 'soup' } }).ok).toBe(false)
  expect(decodeRestoreSource({ kind: 'versioned', payload: currentV1(), stepIndex: 2 }).ok)
    .toBe(false)
})

test('keeps old-model answer IDs structural before model migration', () => {
  expect(decodeStoredPayloadV1Structure({
    schemaVersion: 1,
    questionModelVersion: 'registered-old.1',
    questionSemanticHash: 'a'.repeat(64),
    submittedAnswers: { retiredQuestion: ['retiredOption'] },
  }).ok).toBe(true)
})

test.each(['A'.repeat(64), `0x${'a'.repeat(64)}`, ` ${'a'.repeat(64)}`])(
  'rejects semantic hash %s',
  (hash) => expect(decodeStoredPayloadV1Structure({
    ...currentV1(), questionSemanticHash: hash,
  }).ok).toBe(false),
)
```

Cover code-point limits, pre-dedupe counts, model-derived limits, wrong primitives, symbol keys, and exact V1 fields.

- [ ] **Step 2: Run and confirm red**

```bash
npx vitest run packages/classification-core/src/persistence/decode-envelope.test.ts \
  packages/classification-core/src/persistence/decode-v1.test.ts \
  packages/classification-core/src/persistence/decode-answers.test.ts
```

- [ ] **Step 3: Implement closed staged decoding**

Source keys are exactly `answers/kind/sourceId` or `kind/payload`. V1 keys are exactly `schemaVersion`, `questionModelVersion`, `questionSemanticHash`, optional `cursorQuestionId`, and `submittedAnswers`.

```ts
interface StructurallyDecodedPayloadV1 {
  readonly schemaVersion: 1
  readonly questionModelVersion: string
  readonly questionSemanticHash: string
  readonly cursorQuestionId?: string
  readonly submittedAnswers: unknown
}
```

Minimal/structural stages do not interpret answer ownership. After migration, `decodeCurrentAnswerDraft` applies hard/model limits, preserves exact `ANSWER_*` codes, and prefixes paths with `/submittedAnswers`.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run packages/classification-core/src/persistence
npm run typecheck && npm run lint && git diff --check
git add packages/classification-core/src/persistence
git commit -m "Decode persistence sources and V1 envelopes"
```

---

### Task 6: Implement explicit migrations and verified legacy decoding

**Files:**
- Create: `packages/classification-core/src/persistence/schema-migrations.ts`
- Create: `packages/classification-core/src/persistence/model-migrations.ts`
- Create: `packages/classification-core/src/persistence/legacy-lineage.ts`
- Create: corresponding `*.test.ts` files

**Interfaces:**
- Consumes: Task 5 structural output and current model metadata/order.
- Produces: deterministic schema/model registries and `migrateVerifiedLegacyAnswers` with ordered evidence.

- [ ] **Step 1: Write failing registry and legacy tests**

```ts
test('separates schema and model evidence', () => {
  expect(migrateSchemaToCurrent(testSchemaRegistry, oldSchema()).migrations[0]).toMatchObject({
    kind: 'schema', fromSchemaVersion: 0, toSchemaVersion: 1,
  })
  expect(migrateQuestionModelToCurrent(testModelRegistry, oldModel()).migrations[0])
    .toMatchObject({ kind: 'question-model', fromQuestionModelVersion: 'old.1' })
})

test('uses field-specific legacy shapes and scoped seafood expansion', () => {
  expect(migrateVerifiedLegacyAnswers(questionModel, { form: ['soup'] }).ok).toBe(false)
  expect(migrateVerifiedLegacyAnswers(questionModel, { source: 'pork' }).ok).toBe(false)
  expect(migrateVerifiedLegacyAnswers(questionModel, {
    source: [], signature: [], exclusions: ['seafood'],
  })).toMatchObject({
    ok: true,
    draft: { exclusions: ['fish-seafood', 'shellfish', 'shrimp-crab'] },
  })
})

test('rejects collision and unverified empty exclusions', () => {
  expect(migrateVerifiedLegacyAnswers(questionModel, {
    source: [], signature: [], exclusions: ['seafood', 'shellfish'],
  }).ok).toBe(false)
  expect(migrateVerifiedLegacyAnswers(questionModel, {
    source: [], signature: [], exclusions: [],
  }).ok).toBe(false)
})
```

Also test registry ambiguity/cycles/gaps, unknown schema/model, same model version with wrong hash, duplicates, exclusivity, and compiled ordering.

- [ ] **Step 2: Run and confirm red**

```bash
npx vitest run packages/classification-core/src/persistence/schema-migrations.test.ts \
  packages/classification-core/src/persistence/model-migrations.test.ts \
  packages/classification-core/src/persistence/legacy-lineage.test.ts
```

- [ ] **Step 3: Implement registries and field mapping**

```ts
const legacyFieldShapes = {
  form: 'single', archetype: 'single', tare: 'single', source: 'multiple',
  body: 'single', noodle: 'single', signature: 'multiple', exclusions: 'multiple',
} as const
```

Only `source: []` and `signature: []` become missing. `seafood` expands only in exclusions, then ownership/duplicates/exclusivity are validated. The legacy migration record targets schema 1 and current model/hash. Known data rejection returns `PERSISTENCE_MIGRATION_FAILED`; unexpected migration/registry failure throws `PERSISTENCE_MIGRATION_INVARIANT`.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run packages/classification-core/src/persistence
npm run typecheck && npm run lint && git diff --check
git add packages/classification-core/src/persistence
git commit -m "Add explicit persistence migrations"
```

---

### Task 7: Project deterministic submitted-state repairs

**Files:**
- Create: `packages/classification-core/src/persistence/repair.ts`
- Create: `packages/classification-core/src/persistence/repair.test.ts`

**Interfaces:**
- Consumes: a compiled model and a current-model `AnswerDraft` that has already passed structural and ownership decoding.
- Produces: a deterministic submitted-only projection, ordered `PersistenceRepair` records, and a successful second `FlowState` or a bounded invariant failure.

- [ ] **Step 1: Write failing repair-order and invalid-boundary tests**

```ts
test('projects stale submitted state in the fixed order', () => {
  const result = projectRepairedSubmittedAnswers(questionModel, staleDraft())
  expect(result.repairs.map(({ code }) => code)).toEqual([
    'remove-unreachable-answer',
    'remove-disallowed-option',
    'remove-stale-under-min-answer',
    'remove-submitted-forced-answer',
    'canonicalize-answer-order',
  ])
  expect(result.submittedAnswers).not.toEqual(result.flowState.canonicalAnswers)
})

test('does not repair intrinsically invalid answers', () => {
  expect(projectRepairedSubmittedAnswers(questionModel, duplicateDraft())).toMatchObject({
    status: 'invalid',
    diagnostics: [{ code: 'ANSWER_DUPLICATE_OPTION' }],
  })
})
```

Also cover every answer-repair union member, a stale option that falls below `minSelections`, removal of an entire forced-question entry, canonical option ordering, and input/model immutability.

- [ ] **Step 2: Run and confirm red**

```bash
npx vitest run packages/classification-core/src/persistence/repair.test.ts
```

- [ ] **Step 3: Implement internal evaluation and fixed-point proof**

Implement this package-internal entry point:

```ts
function projectRepairedSubmittedAnswers(
  model: CompiledQuestionModel,
  originalDraft: AnswerDraft,
): RepairProjectionResult
```

It must evaluate internally and apply repairs in exactly this order:

1. `remove-unreachable-answer`
2. `remove-disallowed-option`
3. `remove-stale-under-min-answer`
4. `remove-submitted-forced-answer`
5. `canonicalize-answer-order`
6. re-evaluate the projected draft

The second evaluation must be `incomplete` or `complete`, produce no repeated repair, exclude forced entries from the submitted draft, and remain unchanged under another projection. Throw `PersistenceInvariantError('PERSISTENCE_REPAIR_NON_IDEMPOTENT')` for an impossible failed proof; do not return it as malformed-user-data diagnostics.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run packages/classification-core/src/persistence/repair.test.ts \
  packages/classification-core/src/flow
npm run typecheck && npm run lint && git diff --check
git add packages/classification-core/src/persistence/repair.ts \
  packages/classification-core/src/persistence/repair.test.ts
git commit -m "Project persistence repairs"
```

---

### Task 8: Orchestrate restore and stable resume resolution

**Files:**
- Create: `packages/classification-core/src/persistence/resume.ts`
- Create: `packages/classification-core/src/persistence/resume.test.ts`
- Create: `packages/classification-core/src/persistence/restore.ts`
- Create: `packages/classification-core/src/persistence/restore.test.ts`

**Interfaces:**
- Consumes: the explicit restore source union plus Tasks 4–7 decoding, migration, and repair internals.
- Produces: the exact deep-frozen `RestoreResult` union with a successful non-invalid flow and a stable resume target.

- [ ] **Step 1: Write failing resume tests**

```ts
test('uses no cursor for complete state', () => {
  expect(resolveResumeQuestion(questionModel, completeState(), undefined)).toEqual({
    resumeQuestionId: undefined,
    repairs: [],
  })
})

test('normalizes unusable cursors after final evaluation', () => {
  expect(resolveResumeQuestion(questionModel, incompleteState(), 'tare')).toMatchObject({
    resumeQuestionId: 'form',
    repairs: [{ code: 'normalize-cursor', beforeCursorQuestionId: 'tare' }],
  })
})
```

Cover an unknown bounded cursor (`drop-unknown-cursor`), known forced/unreachable cursor (`normalize-cursor`), usable interactive cursor, earlier missing actionable question, complete state, and an impossible incomplete state with no actionable question.

- [ ] **Step 2: Write failing restore-union tests**

```ts
test('restores current V1 without changes', () => {
  expect(restoreClassification(questionModel, currentV1Source())).toMatchObject({
    status: 'restored',
    migrations: [],
    repairs: [],
    changes: [],
    writeBackRequired: false,
  })
})

test('returns non-empty evidence for migrated legacy state', () => {
  const result = restoreClassification(questionModel, verifiedLegacySource())
  expect(result.status).toBe('restored-with-changes')
  if (result.status === 'restored-with-changes') {
    expect(result.changes.length).toBeGreaterThan(0)
    expect(result.writeBackRequired).toBe(true)
  }
})
```

Also cover every unsupported reason, intrinsic invalid data, diagnostic-only submitted subset, schema/model migration order, cursor repair ordering after answer repairs, and exception separation for impossible internal states.

- [ ] **Step 3: Run and confirm red**

```bash
npx vitest run packages/classification-core/src/persistence/resume.test.ts \
  packages/classification-core/src/persistence/restore.test.ts
```

- [ ] **Step 4: Implement the closed restore pipeline**

```text
explicit source kind
→ minimal source/envelope decode
→ version-specific structural decode
→ schema migration
→ model compatibility or migration
→ current AnswerDraft decode
→ flow evaluation
→ deterministic submitted repair projection
→ final re-evaluation
→ cursor resolution
→ RestoreResult
```

`resolveResumeQuestion(model, state, cursorQuestionId?)` accepts only a successful final flow state. `restoreClassification(model, source)` returns `unsupported` for unknown lineage/model identity, `invalid` for known bad external data, and never returns `restored` or `restored-with-changes` with `flowState.status === 'invalid'`. A successful incomplete result always has a reachable interactive `resumeQuestionId` with no earlier actionable question.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run packages/classification-core/src/persistence
npm run typecheck && npm run lint && git diff --check
git add packages/classification-core/src/persistence/resume.ts \
  packages/classification-core/src/persistence/resume.test.ts \
  packages/classification-core/src/persistence/restore.ts \
  packages/classification-core/src/persistence/restore.test.ts
git commit -m "Restore persisted classifications"
```

---

### Task 9: Build deterministic V1 payloads and prove the restore fixed point

**Files:**
- Create: `packages/classification-core/src/persistence/create-payload.ts`
- Create: `packages/classification-core/src/persistence/create-payload.test.ts`
- Create: `packages/classification-core/src/persistence/fixed-point.test.ts`

**Interfaces:**
- Consumes: current-model submitted answers and an optional stable cursor.
- Produces: a closed, canonical, deep-frozen `StoredClassificationPayloadV1`, or `invalid-submitted-state` diagnostics.

- [ ] **Step 1: Write failing builder rejection tests**

```ts
test('rejects a forced answer instead of silently dropping it', () => {
  expect(createStoredClassificationPayloadV1(
    questionModel,
    draftWithSubmittedForcedQuestion(),
  )).toMatchObject({
    status: 'invalid-submitted-state',
    diagnostics: [{ code: 'PERSISTENCE_SUBMITTED_ANSWER_FOR_FORCED_QUESTION' }],
  })
})

test('rejects a cursor that is not the resolved target', () => {
  expect(createStoredClassificationPayloadV1(
    questionModel,
    incompleteDraft(),
    'signature',
  ).status).toBe('invalid-submitted-state')
})
```

Also reject stale state requiring a repair, intrinsic answer errors, a cursor on complete state, and any caller attempt to persist canonical answers.

- [ ] **Step 2: Write failing deterministic payload and fixed-point tests**

```ts
test('builds exact current V1 fields in canonical order', () => {
  const result = createStoredClassificationPayloadV1(questionModel, unorderedDraft())
  expect(result).toMatchObject({
    status: 'created',
    payload: {
      schemaVersion: 1,
      questionModelVersion: 'batch2a.1.0',
      questionSemanticHash:
        'd1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d',
    },
  })
  if (result.status === 'created') {
    expect(Object.keys(result.payload)).toEqual([
      'schemaVersion',
      'questionModelVersion',
      'questionSemanticHash',
      'submittedAnswers',
    ])
  }
})

test('restoring normalized output reaches a fixed point', () => {
  const first = restoreClassification(questionModel, staleLegacySource())
  expect(first.status).toBe('restored-with-changes')
  if (first.status !== 'restored-with-changes') return
  const second = restoreClassification(questionModel, {
    kind: 'versioned',
    payload: first.normalizedPayload,
  })
  expect(second).toMatchObject({ status: 'restored', writeBackRequired: false })
  if (second.status === 'restored') {
    expect(second.submittedAnswers).toEqual(first.submittedAnswers)
    expect(second.flowState).toEqual(first.flowState)
    expect(second.resumeQuestionId).toEqual(first.resumeQuestionId)
  }
})
```

- [ ] **Step 3: Run and confirm red**

```bash
npx vitest run packages/classification-core/src/persistence/create-payload.test.ts \
  packages/classification-core/src/persistence/fixed-point.test.ts
```

- [ ] **Step 4: Implement builder and canonical persistence comparison**

The builder must prove:

```ts
resolveResumeQuestion(
  model,
  evaluateFlow(model, submittedAnswers),
  cursorQuestionId,
).resumeQuestionId === cursorQuestionId
```

It may canonicalize key and option ordering because that is wire normalization, but it must reject all semantic repair needs. Restore uses the same builder for `normalizedPayload` and determines `writeBackRequired` by comparing the decoded current V1 persistence projection, not source JSON formatting or object insertion order.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run packages/classification-core/src/persistence
npm run typecheck && npm run lint && git diff --check
git add packages/classification-core/src/persistence/create-payload.ts \
  packages/classification-core/src/persistence/create-payload.test.ts \
  packages/classification-core/src/persistence/fixed-point.test.ts \
  packages/classification-core/src/persistence/restore.ts
git commit -m "Build current persistence payloads"
```

---

### Task 10: Expose the persistence contract without widening runtime dependencies

**Files:**
- Create: `packages/classification-core/src/persistence/index.ts`
- Modify: `packages/classification-core/src/index.ts`
- Modify: `packages/classification-core/src/index.test.ts`
- Modify: `tools/validation/check-runtime-imports.ts`
- Modify: `tools/validation/check-runtime-imports.test.ts`

**Interfaces:**
- Consumes: the completed pure persistence public surface.
- Produces: exact root exports and import-graph enforcement that keeps internal decoders, registries, repair, resume, Node, and tool code private.

- [ ] **Step 1: Write failing public-export tests**

```ts
expect(Object.keys(runtimeRoot).sort()).toEqual([
  'applyAnswer',
  'createStoredClassificationPayloadV1',
  'decodeAnswerDraft',
  'evaluateFlow',
  'getFirstActionableQuestion',
  'getNextInteractiveQuestion',
  'getPreviousInteractiveQuestion',
  'questionModel',
  'restoreClassification',
  'updatePendingSelection',
].sort())
```

Add type-only assertions for `ClassificationRestoreSource`, `StoredClassificationPayloadV1`, `RestoreResult`, `RestoreChange`, `AppliedMigration`, `PersistenceRepair`, `PersistenceDiagnostic`, `PersistenceDiagnosticCode`, `PersistencePipelineStage`, and `CreateStoredPayloadResult`. Assert that decoder, registry, projector, and cursor resolver names are absent from the root.

- [ ] **Step 2: Write failing import-boundary tests**

Extend the runtime traversal to include `packages/classification-core/src/persistence/**` and reject imports from Node built-ins, Zod, compiler, definitions, generated authoring tools, `tools/**`, React/DOM/storage, styles, scoring, and catalog modules.

```bash
npx vitest run packages/classification-core/src/index.test.ts \
  tools/validation/check-runtime-imports.test.ts
```

- [ ] **Step 3: Implement public exports and graph rules**

Export only the two persistence functions as values. Export the approved result and diagnostic contracts as types. Reuse Batch 2A deep-freeze/flow/model types without creating a runtime dependency on the compiler or source definitions.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run packages/classification-core/src packages/classification-core/src/index.test.ts \
  tools/validation/check-runtime-imports.test.ts
npm run runtime:imports:check
npm run typecheck && npm run lint && npm run build && git diff --check
git add packages/classification-core/src/persistence/index.ts \
  packages/classification-core/src/index.ts \
  packages/classification-core/src/index.test.ts \
  tools/validation/check-runtime-imports.ts \
  tools/validation/check-runtime-imports.test.ts
git commit -m "Export persistence runtime contracts"
```

---

### Task 11: Define legacy persistence observations and instrumentation

**Files:**
- Create: `tools/parity/persistence/contracts.ts`
- Create: `tools/parity/persistence/contracts.test.ts`
- Create: `tools/parity/persistence/seeds.json`
- Create: `tools/parity/persistence/legacy-instrumentation.patch`
- Create: `tools/parity/persistence/instrumentation.test.ts`

**Interfaces:**
- Consumes: the exact legacy public questionnaire/storage behavior and the shared extractor authoring contracts.
- Produces: a strict observation-only fixture schema, six deterministic authoring seeds, and instrumentation that records only values the legacy app executes or returns.

- [ ] **Step 1: Write failing observation-schema tests**

```ts
test.each([
  'normalizedPayload',
  'migrations',
  'repairs',
  'diagnostics',
  'flowState',
  'resumeQuestionId',
  'writeBackRequired',
])('rejects new runtime field %s from legacy observations', (field) => {
  expect(() => parseLegacyPersistenceObservation({
    ...validWriteObservation(),
    [field]: {},
  })).toThrow()
})
```

The only variants are `legacy-write-observation` with actual public actions and observed saved answers, and `legacy-restore-observation` with exact input and direct `restoreUserAnswers()` output. Arrays retain observable legacy order.

- [ ] **Step 2: Add and validate six explicit seeds**

Use these ordered IDs:

```json
[
  "write-initial-shapes",
  "write-single-multiple-shapes",
  "write-forced-answer",
  "restore-seafood",
  "restore-empty-initial-arrays",
  "restore-exclusive-normalization"
]
```

Test unique IDs, deterministic seed ordering, coverage of both observation kinds, and absence of any expected current V1 result.

- [ ] **Step 3: Add instrumentation boundary tests and confirm red**

The patch must drive real public questionnaire actions to observe writes, read the actual saved answer value, and call the existing legacy `restoreUserAnswers()` for restore observations. It must not add branch, repair, validation, migration, navigation, or current-model logic.

```bash
npx vitest run tools/parity/persistence/contracts.test.ts \
  tools/parity/persistence/instrumentation.test.ts
git -C /Users/ansonhui/Documents/GitHub/ramen-style-today \
  apply --check \
  /Users/ansonhui/Documents/GitHub/ramen-style-today-next/.worktrees/batch-2b-persistence-repair/tools/parity/persistence/legacy-instrumentation.patch
```

- [ ] **Step 4: Implement parser, seeds, and minimal instrumentation**

Hash the corpus with canonical object-key serialization while preserving every legacy answer/action array order. Instrumentation output must satisfy the strict observation schema before publication and include no current V1 or new-runtime-only metadata.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tools/parity/persistence
npm run typecheck && npm run lint && git diff --check
git add tools/parity/persistence/contracts.ts \
  tools/parity/persistence/contracts.test.ts \
  tools/parity/persistence/seeds.json \
  tools/parity/persistence/legacy-instrumentation.patch \
  tools/parity/persistence/instrumentation.test.ts
git commit -m "Define legacy persistence observations"
```

---

### Task 12: Extract, freeze, and verify the legacy persistence corpus

**Files:**
- Create: `tools/parity/persistence/extractor.ts`
- Create: `tools/parity/persistence/extractor.test.ts`
- Create: `tools/parity/persistence/extract.ts`
- Create: `tools/parity/persistence/verify-fixtures.ts`
- Create: `tools/parity/persistence/verify-fixtures.test.ts`
- Create: `tools/parity/fixtures/persistence/legacy-unversioned/cases.json`
- Create: `tools/parity/fixtures/persistence/legacy-unversioned/manifest.json`
- Modify: `package.json`
- Modify only when dependency resolution changes: `package-lock.json`

**Interfaces:**
- Consumes: Task 2 shared authoring transaction and Task 11 persistence-specific schema, seeds, and instrumentation.
- Produces: an atomically published six-case frozen observation corpus, manifest-bound `casesHash`, and an offline read-only fixture gate.

- [ ] **Step 1: Write failing adapter and manifest tests**

Cover the persistence adapter's domain output validation, exact ordered case IDs, case count, `casesHash`, authoring-source hashes, instrumentation identity, normalized legacy repository identity, commit/tree/lock/source hashes, isolated environment policy, original-checkout fingerprints, and cleanup-warning propagation from the shared transaction.

```ts
expect(manifest.orderedCaseIds).toEqual([
  'write-initial-shapes',
  'write-single-multiple-shapes',
  'write-forced-answer',
  'restore-seafood',
  'restore-empty-initial-arrays',
  'restore-exclusive-normalization',
])
expect(manifest.caseCount).toBe(6)
expect(manifest.casesHash).toMatch(/^[0-9a-f]{64}$/)
```

- [ ] **Step 2: Write failing offline gate tests**

Test corpus byte/content drift, manifest drift, ordered-ID drift, a case containing current V1 or new-runtime metadata, source identity drift, instrumentation/seed changes, and ordinary CI verification without a legacy checkout.

```bash
npx vitest run tools/parity/persistence/extractor.test.ts \
  tools/parity/persistence/verify-fixtures.test.ts
```

- [ ] **Step 3: Implement the thin persistence authoring adapter**

`extractor.ts` supplies only persistence schemas, seeds, instrumentation, case validation, and manifest projection to `tools/parity/shared/authoring.ts`. It must not copy the lock, backup, rollback, cleanup, no-follow, isolation, or original-checkout fingerprint transaction.

Add scripts:

```json
{
  "parity:persistence": "tsx tools/parity/persistence/verify-fixtures.ts",
  "parity:persistence:extract": "tsx tools/parity/persistence/extract.ts"
}
```

Add `npm run parity:persistence` to `npm run verify`. Keep `parity:persistence:extract` outside ordinary verification and CI.

- [ ] **Step 4: Record the original legacy identity and run explicit extraction**

```bash
test "$(git -C /Users/ansonhui/Documents/GitHub/ramen-style-today rev-parse HEAD)" = \
  "eebf00b7ddfbbe6f01ff598e57f1e17197068a37"
test "$(git -C /Users/ansonhui/Documents/GitHub/ramen-style-today rev-parse HEAD^{tree})" = \
  "3e527de876cfeccfd3154ddc492830d71c4cfd9a"
test -z "$(git -C /Users/ansonhui/Documents/GitHub/ramen-style-today status --porcelain --untracked-files=no)"
npm run parity:persistence:extract -- \
  --legacy-checkout /Users/ansonhui/Documents/GitHub/ramen-style-today
npm run parity:persistence
```

The extractor itself records and compares HEAD, full commit, root tree, tracked status, the two named TypeScript cache fingerprints, and all configured extractor-sensitive ignored paths before and after execution. Any difference fails the live run even when fixture generation succeeded.

- [ ] **Step 5: Independently inspect the frozen boundary**

```bash
node -e "const c=require('./tools/parity/fixtures/persistence/legacy-unversioned/cases.json'); const m=require('./tools/parity/fixtures/persistence/legacy-unversioned/manifest.json'); if(c.length!==6||m.caseCount!==6) process.exit(1); console.log(c.map(x=>x.id).join('\n'))"
if rg -n 'normalizedPayload|migrations|repairs|diagnostics|flowState|resumeQuestionId|writeBackRequired|questionSemanticHash' \
  tools/parity/fixtures/persistence/legacy-unversioned/cases.json; then
  exit 1
fi
```

Expected: the first command prints the six ordered IDs; the second command finds nothing.

- [ ] **Step 6: Re-prove the original checkout is unchanged and commit**

```bash
test "$(git -C /Users/ansonhui/Documents/GitHub/ramen-style-today rev-parse HEAD)" = \
  "eebf00b7ddfbbe6f01ff598e57f1e17197068a37"
test "$(git -C /Users/ansonhui/Documents/GitHub/ramen-style-today rev-parse HEAD^{tree})" = \
  "3e527de876cfeccfd3154ddc492830d71c4cfd9a"
test -z "$(git -C /Users/ansonhui/Documents/GitHub/ramen-style-today status --porcelain --untracked-files=no)"
npm run verify
git diff --check
git add tools/parity/persistence tools/parity/fixtures/persistence package.json package-lock.json
git commit -m "Freeze legacy persistence observations"
```

---

### Task 13: Complete the migration contract verification matrix

**Files:**
- Create: `tools/parity/persistence/migration-contract.test.ts`
- Create: `packages/classification-core/src/persistence/contract-matrix.test.ts`
- Create: `packages/classification-core/src/persistence/determinism.test.ts`

**Interfaces:**
- Consumes: frozen legacy observations as inputs and the public Batch 2B core.
- Produces: current migration expectations in test code, exhaustive result/diagnostic coverage, deep-freeze proofs, and restore/builder fixed-point evidence without adding new truth to the legacy corpus.

- [ ] **Step 1: Write legacy-observation migration tests**

```ts
test('migrates observed legacy seafood through the current contract', () => {
  const observation = getLegacyRestoreObservation('restore-seafood')
  const result = restoreClassification(questionModel, {
    kind: 'legacy-unversioned',
    sourceId: 'ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37',
    answers: observation.legacyInput,
  })
  expect(result).toMatchObject({
    status: 'restored-with-changes',
    submittedAnswers: {
      exclusions: ['fish-seafood', 'shellfish', 'shrimp-crab'],
    },
    writeBackRequired: true,
  })
})
```

Use `legacyInput` as the data presented to the new migration core. Use `observedLegacyOutput` only as evidence of what the old public function returned; never feed that already-normalized oracle output back as the persisted source. Explicitly prove that the observed legacy empty-exclusions input is invalid under the strict current migration contract rather than relabeling the legacy fallback output as current truth, and that an observed legacy forced entry is repaired with evidence.

- [ ] **Step 2: Cover the entire public contract matrix**

Include every `RestoreResult` status/reason, every persistence diagnostic code, retained `ANSWER_*` code, every pipeline stage, every repair code, RFC 6901 escaping for `~` and `/`, bounded received summaries, exact diagnostic ordering, schema/model identity matrix, migration ambiguity/cycles/gaps, resource boundaries, and successful resume invariants.

- [ ] **Step 3: Prove determinism and plain-data immutability**

```ts
test('returns equal deeply frozen plain data without mutating inputs', () => {
  const source = mutableLegacySource()
  const before = structuredClone(source)
  const first = restoreClassification(questionModel, source)
  const second = restoreClassification(questionModel, source)
  expect(first).toEqual(second)
  expect(source).toEqual(before)
  expect(isDeepFrozenPlainData(first)).toBe(true)
})
```

Test both public functions, successful and failure unions, repeated mutation attempts, no class/Error/Date/Map/Set/function/accessor/symbol/BigInt/cycle in result graphs, builder-to-restore identity, and the normalized-payload restore fixed point.

- [ ] **Step 4: Run the full focused matrix and commit**

```bash
npx vitest run packages/classification-core/src/persistence \
  tools/parity/persistence
npm run parity:persistence
npm run typecheck && npm run lint && npm run build && git diff --check
git add packages/classification-core/src/persistence/contract-matrix.test.ts \
  packages/classification-core/src/persistence/determinism.test.ts \
  tools/parity/persistence/migration-contract.test.ts
git commit -m "Verify persistence migration contracts"
```

---

### Task 14: Wire provenance, readiness, ownership, and acceptance gates

**Files:**
- Create: `packages/classification-core/src/contracts/provenance.ts`
- Modify: `packages/classification-core/src/contracts/model.ts`
- Modify: `packages/classification-core/src/contracts/diagnostic-codes.ts`
- Modify: `tools/documentation/build-index.ts`
- Modify: `tools/documentation/build-index.test.ts`
- Modify: `tools/documentation/generate-classification-index.ts`
- Modify: `tools/documentation/generate-classification-index.test.ts`
- Modify: `tools/migration/ledger-schema.ts`
- Modify: `tools/migration/ledger-check.ts`
- Modify: `tools/migration/ledger-check.test.ts`
- Modify: `tools/migration/render-ledger.ts`
- Modify: `tools/migration/render-ledger.test.ts`
- Modify: `tools/migration/record-ci.ts`
- Modify: `tools/migration/record-ci.test.ts`
- Modify: `tools/migration/check-ledger.ts`
- Modify: `tools/acceptance/verify-acceptance.ts`
- Modify: `tools/acceptance/verify-acceptance.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/migration/ledger.json`
- Generate: `docs/migration/ledger.md`
- Generate: `docs/classification/manifest.json`
- Generate: `docs/classification/index.md`

**Interfaces:**
- Consumes: the completed core, frozen persistence fixture manifest, and authenticated Batch 2A maintenance record.
- Produces: canonical `contract-verified` vocabulary, truthful migration-only readiness, exact path ownership, Batch 2B evidence slots, and metadata-only acceptance enforcement.

- [ ] **Step 1: Write failing assurance and readiness tests**

```ts
const completedManifest = buildClassificationManifest(completedBatch2BLedger())
expect(completedManifest.persistence).toMatchObject({
  origin: 'manually-authored',
  assurance: 'contract-verified',
  schemaVersion: 1,
  fixtureManifestPath:
    'tools/parity/fixtures/persistence/legacy-unversioned/manifest.json',
})
expect(completedManifest.readiness).toEqual({
  status: 'migration-only',
  blockers: [
    'persistence-adapter-not-integrated',
    'persisted-data-cutover-incomplete',
    'styles-not-production-verified',
    'scoring-not-production-verified',
    'runtime-cutover-incomplete',
  ],
})

const inProgressManifest = buildClassificationManifest(inProgressBatch2BLedger())
expect(inProgressManifest.persistence).toMatchObject({
  origin: 'manually-authored',
  assurance: 'structurally-validated',
  schemaVersion: 1,
})
expect(inProgressManifest.persistence).not.toHaveProperty('implementationSha')
```

Only a completed-ledger fixture bound to the exact implementation SHA and fixture manifest hash may produce `contract-verified`. Until that evidence is complete, live generation must remain `structurally-validated`, omit `implementationSha`, and retain the in-progress readiness state prescribed by the ledger.

- [ ] **Step 2: Write failing ownership and acceptance tests**

Register these exact groups before the implementation commit:

```ts
implementationPaths: [
  'packages/classification-core/src/persistence/**',
  'packages/classification-core/src/contracts/diagnostic-codes.ts',
  'packages/classification-core/src/contracts/model.ts',
  'packages/classification-core/src/contracts/provenance.ts',
  'packages/classification-core/src/index.ts',
  'packages/classification-core/src/index.test.ts',
  'tools/parity/persistence/**',
  'tools/parity/fixtures/persistence/**',
]

verificationPaths: [
  '.github/workflows/ci.yml',
  'package.json',
  'package-lock.json',
  'tools/acceptance/**',
  'tools/documentation/**',
  'tools/migration/**',
  'tools/validation/check-runtime-imports.ts',
  'tools/validation/check-runtime-imports.test.ts',
]

acceptanceMetadataPaths: [
  'docs/classification/index.md',
  'docs/classification/manifest.json',
  'docs/migration/ledger.json',
  'docs/migration/ledger.md',
]
```

Test that implementation/verification changes after `implementationSha` invalidate evidence, metadata completion can touch only the four exact metadata files, fixture manifest hash binds provenance, and Batch 2A protected semantic identities remain unchanged.

- [ ] **Step 3: Implement canonical provenance and ledger gates**

Add `contract-verified` to the shared assurance vocabulary without treating assurance labels as a total order. Add a Batch 2B ledger entry that is `in-progress`, owns the exact path groups, requires local full verification plus authenticated exact-SHA GitHub Actions evidence, and binds the completed entry to the persistence fixture manifest hash.

The workflow must run only committed offline gates and must never invoke `parity:persistence:extract` or require a legacy checkout.

- [ ] **Step 4: Generate in-progress documents and verify**

```bash
npm run migration:ledger
npm run classification:index
npx vitest run tools/documentation tools/migration tools/acceptance \
  packages/classification-core/src/contracts
npm run migration:ledger:check
npm run classification:index:check
npm run verify
git diff --check
```

- [ ] **Step 5: Commit the final implementation candidate**

Before committing, compare `.superpowers/batch-2b-baseline/protected.sha256` and `question-manifest-invariants.json` against current files and fail on any unapproved difference. Confirm that the question manifest differs only in the already authenticated extractor authoring identity from Tasks 2–3.

```bash
git add packages/classification-core/src/contracts \
  tools/documentation tools/migration tools/acceptance \
  tools/validation/check-runtime-imports.ts \
  tools/validation/check-runtime-imports.test.ts \
  .github/workflows/ci.yml package.json package-lock.json \
  docs/migration/ledger.json docs/migration/ledger.md \
  docs/classification/manifest.json docs/classification/index.md
git commit -m "Verify Batch 2B persistence contracts"
```

Record this new commit as the Batch 2B implementation candidate; no implementation or verification path may change afterward.

---

### Task 15: Authenticate the exact implementation and close Batch 2B

**Files:**
- Modify only: `docs/migration/ledger.json`
- Generate only: `docs/migration/ledger.md`
- Generate only: `docs/classification/manifest.json`
- Generate only: `docs/classification/index.md`

**Interfaces:**
- Consumes: the exact Task 14 implementation SHA, its successful GitHub Actions run, persistence fixture manifest hash, and unchanged implementation/verification paths.
- Produces: a metadata-only completion commit whose own GitHub Actions run is also successful.

- [ ] **Step 1: Verify, record, and push the exact implementation candidate**

```bash
npm run verify
git diff --check
test -z "$(git status --porcelain)"
implementation_sha="$(git rev-parse HEAD)"
git push -u origin codex/batch-2b-persistence-repair
implementation_run_id=''
for attempt in {1..30}; do
  implementation_run_id=$(gh run list --workflow ci.yml \
    --branch codex/batch-2b-persistence-repair --commit "$implementation_sha" \
    --event push --limit 1 --json databaseId --jq '.[0].databaseId')
  test -n "$implementation_run_id" && break
  sleep 2
done
test -n "$implementation_run_id"
gh run watch "$implementation_run_id" --exit-status
```

The selected run must have `headSha === implementation_sha`, `status === completed`, and `conclusion === success` before evidence is recorded.

- [ ] **Step 2: Record authenticated Batch 2B evidence**

```bash
IMPLEMENTATION_RUN_JSON=$(gh run view "$implementation_run_id" \
  --json databaseId,headSha,status,conclusion,url)
IMPLEMENTATION_RUN_JSON="$IMPLEMENTATION_RUN_JSON" \
  IMPLEMENTATION_SHA="$implementation_sha" node - <<'NODE'
const fs = require('fs')
const run = JSON.parse(process.env.IMPLEMENTATION_RUN_JSON)
if (run.headSha !== process.env.IMPLEMENTATION_SHA || run.status !== 'completed'
  || run.conclusion !== 'success') throw new Error('Batch 2B CI identity mismatch')
fs.writeFileSync('.superpowers/batch-2b-implementation-proof.json', JSON.stringify({
  schemaVersion: 1, sha: run.headSha, runId: run.databaseId, runUrl: run.url,
}, null, 2) + '\n')
NODE
npm run migration:ledger:record-ci -- 2B \
  .superpowers/batch-2b-implementation-proof.json
npm run migration:ledger
npm run classification:index
```

Set Batch 2B to `complete`, bind `implementationSha`, the exact persistence `fixtureManifestHash`, `batch2b-local-verify`, and authenticated `batch2b-remote-ci`. Do not change the Batch 2A historical implementation SHA or its completed maintenance evidence.

- [ ] **Step 3: Prove the completion diff is metadata-only**

```bash
git diff --name-only "$implementation_sha" -- | sort
```

Expected exact output:

```text
docs/classification/index.md
docs/classification/manifest.json
docs/migration/ledger.json
docs/migration/ledger.md
```

Then run:

```bash
npm run verify
GITHUB_TOKEN="$(gh auth token)" npm run verify:acceptance
git diff --check
git add docs/classification/index.md docs/classification/manifest.json \
  docs/migration/ledger.json docs/migration/ledger.md
git commit -m "Accept Batch 2B persistence contracts"
```

- [ ] **Step 4: Authenticate the metadata commit and final repository state**

```bash
metadata_sha="$(git rev-parse HEAD)"
git push
metadata_run_id=''
for attempt in {1..30}; do
  metadata_run_id=$(gh run list --workflow ci.yml \
    --branch codex/batch-2b-persistence-repair --commit "$metadata_sha" \
    --event push --limit 1 --json databaseId --jq '.[0].databaseId')
  test -n "$metadata_run_id" && break
  sleep 2
done
test -n "$metadata_run_id"
gh run watch "$metadata_run_id" --exit-status
npm run verify
GITHUB_TOKEN="$(gh auth token)" npm run verify:acceptance
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/codex/batch-2b-persistence-repair)"
```

Reconfirm the legacy HEAD/tree/tracked status and monitored ignored-path fingerprints. Final handoff records implementation SHA, metadata SHA, both successful GitHub run IDs, test count, fixture case count/hash/manifest hash, Batch 2A model/hash, legacy commit/tree, clean worktree, `persistence.assurance: contract-verified`, and overall `readiness: migration-only`.

---

## Execution handoff

The plan is complete when all fifteen tasks remain in this order, the approved specification and migration ledger own this plan, and `npm run verify` is green before execution begins. During implementation, check off each step in this file, keep each task independently reviewable, and stop on any protected Batch 2A semantic drift, legacy checkout mutation, fixture-boundary violation, or new verification failure.
