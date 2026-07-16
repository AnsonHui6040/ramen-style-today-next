# Batch 3A Style Compilation Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Every production task
> uses RED/GREEN TDD, an exact tracked-file allowlist, independent review, and a
> focused commit. Self-review is not independent review.

**Goal:** Replace the synthetic style inventory with compact typed legacy style
definitions and a deterministic, immutable compiled style model that preserves
the frozen style/core/subtype/rule representation without implementing scoring,
ranking, confidence, collapse, or eligibility.

**Architecture:** A formally accepted Batch 2B metadata boundary first replaces
the defective permanent shared-path freeze with a narrow persistence-exclusive
freeze. Batch 3A then compiles one focused definition per display style through
closed source schemas, question-model-bound validation, deterministic
core/subtype/rule generation, semantic proof, and a generated inert artifact.
Frozen legacy observations prove only inventory and compiled-rule parity.
Ownership, live provenance, readiness, and exact-SHA evidence are wired only
after the implementation and verification surfaces are stable.

**Tech stack:** Node.js 24.16.0, npm 11.13.0, TypeScript 6.0.3, Zod 4.4.3,
Vitest 4.1.10, ESLint 10.6.0, tsx 4.23.0, npm workspaces, Git, and GitHub
Actions.

**Originally approved specification identity:**
`docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md`
(SHA-256
`a09a1abdaf706ddc3af7d0974aba2cd30024ae3cea2e3f2b33a02ecccbfcdc0e`)

**Task 6 adjudicated specification identity:** same path, amended only for the
reviewed staged-result and Task 9 proof ownership rulings (SHA-256
`65712bece6cdf46921b1098451079e03b6859b36faf4162576ef1e4d3c2ca8c6`).

**Initial base:** `6fba4c0dc384d3cfa27b627db6ae373f56c8b6d4`
(`Accept Batch 2B persistence contracts`)

**Status:** Reviewed plan awaiting user approval; execution is not authorized.

## Global constraints

- Work only in
  `/Users/ansonhui/Documents/GitHub/ramen-style-today-next/.worktrees/batch-3a-style-compilation`
  on `codex/batch-3a-style-compilation`.
- Every shell begins with
  `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`; require exact Node
  `v24.16.0` and npm `11.13.0` because a fresh login shell resolves Node 26.
- Preserve the accepted Batch 2A question model at `batch2a.1.0`, semantic hash
  `d1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d`,
  source hash
  `fbf0b82dc9515e43286a3c08b0bd0a0f5da3cf8a39d5baa8857b2d7603fc4d97`,
  and generated artifact hash
  `48386ff2d6b3e9de7944169a2c3edb9992187257dd8573a107e2b15f7d80bd43`.
- Never modify the protected Batch 2A paths:
  `packages/classification-core/src/definitions/questions.ts`,
  `packages/classification-core/src/compiler/questions/**`,
  `packages/classification-core/src/generated/question-model.ts`,
  `packages/classification-core/src/flow/**`, `tools/parity/questions/**`, or
  `tools/parity/fixtures/questions/**`.
- Never modify the permanently protected Batch 2B paths:
  `packages/classification-core/src/persistence/**`,
  `tools/parity/persistence/**`, or
  `tools/parity/fixtures/persistence/**`.
- Preserve Batch 2B implementation SHA
  `30b71e3305b0e48a7c77e4869e2411c17941ebb8`, accepted metadata SHA
  `6fba4c0dc384d3cfa27b627db6ae373f56c8b6d4`, persistence fixture manifest
  hash `6c697167052690a8b01830fbceada056e1cbb39879fc879c34394e84e2237226`,
  original evidence, and `contract-verified` persistence assurance.
- Frozen legacy identity is
  `AnsonHui6040/ramen-style-today@eebf00b7ddfbbe6f01ff598e57f1e17197068a37`,
  tree `3e527de876cfeccfd3154ddc492830d71c4cfd9a`.
- Do not modify `tools/parity/shared/**`; reuse its accepted authoring
  transaction unchanged.
- Do not create `packages/classification-core/src/definitions/policies.ts`.
  Numeric scoring policy belongs to Batch 3B; current scoring policy remains
  synthetic and structurally validated.
- Do not create or modify scoring, eligibility, React, DOM, browser, storage,
  localStorage, autosave, quarantine, catalog, Finder, network, or production
  cutover code.
- Runtime output is deep-frozen JSON-like inert data. Runtime imports may not
  pull compiler, definitions, Zod, Node, persistence, scoring, eligibility,
  tools, browser, storage, or legacy modules.
- IDs and hashes never depend on source order, object insertion order, locale,
  timestamps, source paths, absolute paths, or machine state.
- Batch 3A compiles tier tokens and adjustment operands but does not apply
  ratios, points, penalties, caps, ranking, confidence, collapse, explanations,
  or exclusion blocking.
- Before exact-SHA completion, style assurance is at most
  `compiler-validated`; readiness remains `migration-only` with all five
  blockers. Completion removes only `styles-not-production-verified`.
- Batch 3A ownership and live style classification metadata are not modified
  before Task 17. Tasks 1–3 may modify only the separately approved Batch 2B
  `acceptanceBoundary`/`boundaryMaintenance` ledger fields and generated
  `ledger.md`. Task 1 may additionally install the exact hash-bound temporary
  planning-file exception defined below; it grants no owner and Task 17 removes
  it atomically when formal Batch 3A ownership is wired. Ordinary CI remains
  offline and never performs legacy extraction.
- Each task captures RED/GREEN output under ignored `.superpowers/sdd/**`, runs
  focused and affected gates, runs `git diff --check`, proves
  `git diff --name-status HEAD` is within the exact task allowlist, receives
  independent `PASS`, updates ignored progress evidence, and creates one
  focused commit unless it is an exact-SHA metadata transaction.
- Stop rather than expanding an allowlist. Never start the next task while the
  current review is `CHANGES_REQUIRED`.
- Do not push until Task 3 or Task 18 explicitly authorizes exact-SHA remote
  acceptance.

## Planned file map

```text
packages/classification-core/src/contracts/
  diagnostic-codes.ts diagnostic.ts diagnostic.test.ts model.ts provenance.ts
  style-model.ts

packages/classification-core/src/definitions/styles/
  taxonomy.ts index.ts definitions.test.ts
  shoyu-chintan.ts shio-chintan.ts miso.ts tonkotsu.ts
  chicken-chintan.ts chicken-paitan.ts duck-chintan.ts duck-paitan.ts
  gyokai.ts shellfish-dashi.ts iekei.ts jiro.ts hakata.ts sapporo.ts
  konbusui-tsukemen.ts gyokai-tsukemen.ts aburasoba.ts taiwan-mazesoba.ts

packages/classification-core/src/compiler/styles/
  source-schema.ts source-schema.test.ts test-fixtures.ts
  compile.ts compile.test.ts proof.ts proof.test.ts
  serialize.ts serialize.test.ts

packages/classification-core/src/generated/style-model.ts
tools/styles/generate-style-model.ts tools/styles/generate-style-model.test.ts

tools/parity/styles/
  contracts.ts contracts.test.ts extractor.ts extractor.test.ts extract.ts
  legacy-instrumentation.patch seeds.json verify-fixtures.ts
  verify-fixtures.test.ts parity.ts parity.test.ts

tools/parity/fixtures/styles/legacy-v1/cases.json
tools/parity/fixtures/styles/legacy-v1/manifest.json

Shared composition/export paths:
  packages/classification-core/src/compiler/collector.ts and collector.test.ts
  packages/classification-core/src/compiler/source-schema.ts
  packages/classification-core/src/compiler/parse.ts and parse.test.ts
  packages/classification-core/src/compiler/compile.ts and compile.test.ts
  packages/classification-core/src/compiler/index.ts
  packages/classification-core/src/definitions/classification.ts
  packages/classification-core/src/definitions/synthetic.ts
  packages/classification-core/src/index.ts and index.test.ts
  packages/classification-core/package.json

Verification/acceptance paths:
  package.json
  tools/validation/validate-classification.ts
  tools/validation/check-runtime-imports.ts and test
  tools/documentation/build-index.ts and test
  tools/documentation/generate-classification-index.ts and test
  tools/documentation/relations.ts
  tools/migration/**
  tools/acceptance/verify-acceptance.ts and test

Acceptance metadata only:
  docs/classification/index.md docs/classification/manifest.json
  docs/migration/ledger.json docs/migration/ledger.md
```

## Specification coverage

| Specification area | Tasks |
| --- | --- |
| Batch 2B accepted boundary repair | 1–3 |
| Source contracts, diagnostics, canonical definitions | 4–5 |
| Core, subtype, rule, adjustment compilation | 6–8 |
| Semantic proof, hashes, determinism, immutability | 9 |
| Generated artifact | 10 |
| Classification composition and public boundary | 11–12 |
| Legacy observation and frozen fixtures | 13–14 |
| Compiled projection parity | 15 |
| Documentation builders and validation | 16 |
| Late ownership and local candidate | 17 |
| Exact-SHA acceptance and metadata completion | 18 |

## Execution prerequisite and approved-document checkpoint

No command below is authorized until the user separately approves this reviewed
implementation plan.

```bash
cd /Users/ansonhui/Documents/GitHub/ramen-style-today-next/.worktrees/batch-3a-style-compilation
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
test "$(git branch --show-current)" = "codex/batch-3a-style-compilation"
test "$(git rev-parse HEAD)" = "6fba4c0dc384d3cfa27b627db6ae373f56c8b6d4"
test "$(node --version)" = "v24.16.0"
test "$(npm --version)" = "11.13.0"
git status --branch --short
git diff --no-index --check /dev/null \
  docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md || test $? -eq 1
git diff --no-index --check /dev/null \
  docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md || test $? -eq 1
```

After reconfirming the approved design hash and reviewed plan verdict, create a
planning-only checkpoint containing exactly the approved spec and plan. This is
not a production task and does not reopen either accepted batch.

```bash
git add docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md \
  docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md
git diff --cached --name-only
git commit -m "Plan Batch 3A style compilation"
mkdir -p .superpowers/sdd/batch-3a
approved_plan_sha="$(shasum -a 256 \
  docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md | awk '{print $1}')"
printf '%s\n' "$approved_plan_sha" \
  > .superpowers/sdd/batch-3a/approved-plan.sha256
```

Then write the exact ignored protected baseline before Task 1:

```bash
mkdir -p .superpowers/sdd/batch-3a
shasum -a 256 \
  packages/classification-core/src/generated/question-model.ts \
  tools/parity/fixtures/questions/legacy-v1/cases.json \
  tools/parity/fixtures/questions/legacy-v1/manifest.json \
  tools/parity/fixtures/persistence/legacy-unversioned/cases.json \
  tools/parity/fixtures/persistence/legacy-unversioned/manifest.json \
  > .superpowers/sdd/batch-3a/protected-baseline.sha256
```

---

### Task 1: Define and open the Batch 2B acceptance-boundary maintenance

**Files:**
- Modify: `tools/migration/ledger-schema.ts`
- Modify: `tools/migration/ledger-check.ts`
- Modify: `tools/migration/ledger-check.test.ts`
- Modify: `tools/migration/check-ledger.ts`
- Modify: `tools/migration/render-ledger.ts`
- Modify: `tools/migration/render-ledger.test.ts`
- Modify: `docs/migration/ledger.json`
- Generate: `docs/migration/ledger.md`

**Interfaces:** Consumes immutable Batch 2B implementation/metadata facts;
produces `acceptanceBoundary`, exact in-progress `boundaryMaintenance`, a
direct-parent repository query, and a post-boundary freeze limited to
persistence-exclusive paths. It also adds a temporary, content-addressed
planning exception solely so the already approved spec/plan can exist before
their deliberately late Batch 3A ownership.

- [ ] **Step 1: Write RED schema/checker/render tests**

Cover all of these cases:

```text
accepted metadata SHA has exactly one parent and it is implementationSha
implementation-to-metadata diff is exactly the four acceptance files
ancestor-but-not-direct-parent is rejected
accepted metadata SHA must be an ancestor of current HEAD
in-progress maintenance has exact paths, no maintenanceSha, empty verification
shared contract/export/tool paths may change after the accepted boundary
persistence and persistence-parity paths remain frozen
historical implementationPaths/verificationPaths remain audit data
fixture hash, implementation evidence, assurance, and readiness stay unchanged
reverse-ordered changed paths produce byte-identical diagnostics
only the exact approved design and reviewed plan paths may use pending planning
the design hash must equal its approved literal
the plan hash must equal the final reviewed bytes captured at the checkpoint
content drift, a third planning file, wildcard, directory, or symlink is rejected
pending planning grants no owner and is invalid once a Batch 3A entry exists
```

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run tools/migration/ledger-check.test.ts \
  tools/migration/render-ledger.test.ts \
  > .superpowers/sdd/batch-3a/task-01-red.txt 2>&1
```

Expected: FAIL because boundary fields, direct-parent support, and the narrow
post-boundary policy do not exist.

- [ ] **Step 3: Implement and wire the minimum in-progress contract**

The immutable boundary is exact:

```text
implementationSha = 30b71e3305b0e48a7c77e4869e2411c17941ebb8
metadataSha = 6fba4c0dc384d3cfa27b627db6ae373f56c8b6d4
metadata parent = implementationSha
metadata paths = exact four accepted metadata paths
remote gate = batch2b-acceptance-boundary-remote-ci
remote run = https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/29411764507
```

`boundaryMaintenance` is `in-progress` with the exact ten-file implementation
allowlist from the design, absent `maintenanceSha`, and `verification: []`.
Preserve Batch 2B `status: complete`, its original top-level verification,
fixture identity, assurance, and readiness.

Add `pendingBatch3APlanningBaseline` only in migration checker/schema code. It
contains exactly:

```text
docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md
  sha256 = a09a1abdaf706ddc3af7d0974aba2cd30024ae3cea2e3f2b33a02ecccbfcdc0e
docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md
  sha256 = literal final reviewed plan hash from approved-plan.sha256
```

The exception applies only while no Batch 3A entry exists, requires regular
repository files with exact bytes, and suppresses only the missing-owner and
scope-registration diagnostics for those two paths. It does not create an
owner, path group, assurance, readiness, or acceptance claim. The literal plan
hash is pinned during Task 1 and cannot be recalculated from later edits.

- [ ] **Step 4: Prove GREEN and exact allowlist**

```bash
npm run migration:ledger
npx vitest run tools/migration/ledger-check.test.ts \
  tools/migration/render-ledger.test.ts \
  > .superpowers/sdd/batch-3a/task-01-green.txt 2>&1
npm run migration:ledger:check
git diff --check
git diff --name-status HEAD
```

- [ ] **Step 5: Independent review and commit**

Review must confirm the accepted facts, direct-parent semantics, narrow
protected set, unchanged persistence claims, and exact allowlist. After `PASS`:

```bash
git add tools/migration/ledger-schema.ts tools/migration/ledger-check.ts \
  tools/migration/ledger-check.test.ts tools/migration/check-ledger.ts \
  tools/migration/render-ledger.ts tools/migration/render-ledger.test.ts \
  docs/migration/ledger.json docs/migration/ledger.md
git commit -m "Define Batch 2B accepted boundary"
```

**Stop conditions:** Any need to change persistence code/fixtures, original
Batch 2B evidence, live persistence assurance/readiness, Batch 2A maintenance,
unhashed/wildcard planning paths, a planning byte mismatch, or a file outside
this allowlist.

---

### Task 2: Authenticate Batch 2B boundary-maintenance evidence

**Files:**
- Modify: `tools/migration/record-ci.ts`
- Modify: `tools/migration/record-ci.test.ts`
- Modify: `tools/acceptance/verify-acceptance.ts`
- Modify: `tools/acceptance/verify-acceptance.test.ts`

**Interfaces:** Produces the closed `2B-boundary-maintenance` recording target
and authenticated traversal of `acceptanceBoundary.verification` and
`boundaryMaintenance.verification`.

- [ ] **Step 1: Write RED evidence tests**

Test missing/duplicate proof, malformed URL, wrong repository/event/workflow/
SHA/status/conclusion, accepted metadata binding to `6fba4c0…`, completed
maintenance binding to `maintenanceSha`, rejection while in progress, and
continued authentication of historical top-level evidence.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run tools/migration/record-ci.test.ts \
  tools/acceptance/verify-acceptance.test.ts \
  > .superpowers/sdd/batch-3a/task-02-red.txt 2>&1
```

- [ ] **Step 3: Implement closed dispatch and bounded failures**

Do not accept a caller-selected JSON path. Traverse only registered evidence
arrays. Never include tokens or arbitrary remote response bodies in errors.

- [ ] **Step 4: GREEN and full local candidate verification**

```bash
npx vitest run tools/migration/record-ci.test.ts \
  tools/acceptance/verify-acceptance.test.ts \
  > .superpowers/sdd/batch-3a/task-02-green.txt 2>&1
npm run verify
GITHUB_TOKEN="$(gh auth token)" npm run verify:acceptance
git diff --check
git diff --name-status HEAD
```

- [ ] **Step 5: Independent review and candidate commit**

The reviewer independently checks run `29411764507`, nested authentication,
non-self-reference, and the cumulative approved allowlist. After `PASS`:

```bash
git add tools/migration/record-ci.ts tools/migration/record-ci.test.ts \
  tools/acceptance/verify-acceptance.ts \
  tools/acceptance/verify-acceptance.test.ts
git commit -m "Authenticate Batch 2B boundary maintenance"
```

This is the maintenance candidate. No maintenance implementation file changes
after this commit.

**Stop conditions:** Unauthenticated or ambiguous proof, failed full verify,
changed accepted evidence, or a required file outside the approved ten-file
maintenance implementation allowlist.

---

### Task 3: Complete the Batch 2B boundary-maintenance transaction

**Files:**
- Modify only: `docs/migration/ledger.json`
- Generate only: `docs/migration/ledger.md`

**Interfaces:** Consumes exact Task 2 candidate CI; produces a metadata-only
completed maintenance record and clean accepted Batch 3A execution base.

- [ ] **Step 1: Demonstrate RED without candidate proof**

Use `apply_patch` for a temporary promotion and prove the schema/acceptance gate
rejects `complete` without exact evidence. Restore only that temporary edit with
`apply_patch`; never reset or checkout.

- [ ] **Step 2: Push and authenticate the exact candidate**

```bash
test -z "$(git status --porcelain)"
maintenance_sha="$(git rev-parse HEAD)"
git push -u origin codex/batch-3a-style-compilation
maintenance_run_id=''
for attempt in {1..30}; do
  maintenance_run_id="$(gh run list --workflow ci.yml \
    --branch codex/batch-3a-style-compilation --commit "$maintenance_sha" \
    --event push --limit 1 --json databaseId --jq '.[0].databaseId')"
  test -n "$maintenance_run_id" && break
  sleep 2
done
test -n "$maintenance_run_id"
gh run watch "$maintenance_run_id" --exit-status
```

Reject a run with any mismatched SHA, repository, event, workflow, status,
conclusion, or canonical URL.

- [ ] **Step 3: Record evidence and promote only maintenance metadata**

Generate and locally bind the ignored proof before authenticated recording:

```bash
MAINTENANCE_RUN_JSON="$(gh run view "$maintenance_run_id" \
  --json databaseId,headSha,status,conclusion,url)"
MAINTENANCE_RUN_JSON="$MAINTENANCE_RUN_JSON" \
  MAINTENANCE_SHA="$maintenance_sha" node - <<'NODE'
const fs = require('fs')
const run = JSON.parse(process.env.MAINTENANCE_RUN_JSON)
if (run.headSha !== process.env.MAINTENANCE_SHA
  || run.status !== 'completed'
  || run.conclusion !== 'success') {
  throw new Error('Batch 2B boundary-maintenance CI identity mismatch')
}
fs.writeFileSync(
  '.superpowers/sdd/batch-3a/batch2b-boundary-proof.json',
  `${JSON.stringify({
    schemaVersion: 1,
    sha: run.headSha,
    runId: run.databaseId,
    runUrl: run.url,
  }, null, 2)}\n`,
)
NODE
GITHUB_TOKEN="$(gh auth token)" \
  npm run migration:ledger:record-ci -- 2B-boundary-maintenance \
  .superpowers/sdd/batch-3a/batch2b-boundary-proof.json
npm run migration:ledger
```

Require `status: complete`, `maintenanceSha === maintenance_sha`, and exactly
`batch2b-boundary-maintenance-local-verify` plus
`batch2b-boundary-maintenance-remote-ci`. The candidate-to-completion diff is
exactly `ledger.json` and generated `ledger.md`, a non-empty subset of the four
accepted metadata paths.

- [ ] **Step 4: Verify, review, commit, and authenticate metadata SHA**

```bash
npm run verify
GITHUB_TOKEN="$(gh auth token)" npm run verify:acceptance
git diff --check
test "$(git diff --name-only "$maintenance_sha" | sort)" = \
  $'docs/migration/ledger.json\ndocs/migration/ledger.md'
```

After independent `PASS`:

```bash
git add docs/migration/ledger.json docs/migration/ledger.md
git commit -m "Accept Batch 2B boundary maintenance"
boundary_metadata_sha="$(git rev-parse HEAD)"
git push
metadata_run_id=''
for attempt in {1..30}; do
  metadata_run_id="$(gh run list --workflow ci.yml \
    --branch codex/batch-3a-style-compilation --commit "$boundary_metadata_sha" \
    --event push --limit 1 --json databaseId --jq '.[0].databaseId')"
  test -n "$metadata_run_id" && break
  sleep 2
done
test -n "$metadata_run_id"
gh run watch "$metadata_run_id" --exit-status
npm run verify
GITHUB_TOKEN="$(gh auth token)" npm run verify:acceptance
test -z "$(git status --porcelain)"
```

Record the metadata SHA/run ID in ignored progress evidence. This immutable SHA
is the Batch 3A execution base.

**Stop conditions:** Failed/mismatched exact-SHA CI, non-metadata completion,
changed persistence identities/assurance/readiness, dirty completion state, or
an unreviewed maintenance change.

---

### Task 4: Add style contracts, source schemas, and deterministic diagnostics

**Files:**
- Create: `packages/classification-core/src/contracts/style-model.ts`
- Modify: `packages/classification-core/src/contracts/diagnostic-codes.ts`
- Modify: `packages/classification-core/src/contracts/diagnostic.ts`
- Create: `packages/classification-core/src/contracts/diagnostic.test.ts`
- Modify: `packages/classification-core/src/compiler/collector.ts`
- Modify: `packages/classification-core/src/compiler/collector.test.ts`
- Create: `packages/classification-core/src/compiler/styles/source-schema.ts`
- Create: `packages/classification-core/src/compiler/styles/source-schema.test.ts`
- Create: `packages/classification-core/src/compiler/styles/test-fixtures.ts`

**Interfaces:** Produces approved source/compiled types, a closed Zod source
schema, registered style diagnostics, and deterministic five-field diagnostic
ordering/deduplication.

- [ ] **Step 1: Write RED contract/mutation tests**

Cover strict fields, safe integer priorities, positive finite operands,
`minMatches`, repository-relative sources, closed family/intensity/noodle/tag/
tier values, malformed-root fallback source, every approved diagnostic code,
and sorting by `sourceFile`, `path`, `code`, `entityId`, then `message`. Reverse
invalid inputs and require byte-identical diagnostics.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run packages/classification-core/src/compiler/styles/source-schema.test.ts \
  packages/classification-core/src/contracts/diagnostic.test.ts \
  packages/classification-core/src/compiler/collector.test.ts \
  > .superpowers/sdd/batch-3a/task-04-red.txt 2>&1
```

- [ ] **Step 3: Implement minimum schemas and inert types**

Zod stays compiler-only. `style-model.ts` has no runtime dependency. Do not
compile, generate, export, score, or evaluate anything yet.

- [ ] **Step 4: GREEN and affected regressions**

```bash
npx vitest run packages/classification-core/src/compiler/styles/source-schema.test.ts \
  packages/classification-core/src/contracts/diagnostic.test.ts \
  packages/classification-core/src/compiler/collector.test.ts \
  packages/classification-core/src/persistence/determinism.test.ts
npm run typecheck
npm run lint
git diff --check
git diff --name-status HEAD
```

- [ ] **Step 5: Independent API/diagnostic review and commit**

```bash
git add packages/classification-core/src/contracts/style-model.ts \
  packages/classification-core/src/contracts/diagnostic-codes.ts \
  packages/classification-core/src/contracts/diagnostic.ts \
  packages/classification-core/src/contracts/diagnostic.test.ts \
  packages/classification-core/src/compiler/collector.ts \
  packages/classification-core/src/compiler/collector.test.ts \
  packages/classification-core/src/compiler/styles
git commit -m "Define style compilation contracts"
```

**Stop conditions:** Runtime dependency from inert contracts, generic throws for
expected definition errors, comparator regression, missing approved field, or
any protected Batch 2A/2B path change.

---

### Task 5: Author the compact canonical style bundle

**Files:**
- Create: `packages/classification-core/src/definitions/styles/taxonomy.ts`
- Create: `packages/classification-core/src/definitions/styles/index.ts`
- Create: `packages/classification-core/src/definitions/styles/definitions.test.ts`
- Create: `packages/classification-core/src/definitions/styles/shoyu-chintan.ts`
- Create: `packages/classification-core/src/definitions/styles/shio-chintan.ts`
- Create: `packages/classification-core/src/definitions/styles/miso.ts`
- Create: `packages/classification-core/src/definitions/styles/tonkotsu.ts`
- Create: `packages/classification-core/src/definitions/styles/chicken-chintan.ts`
- Create: `packages/classification-core/src/definitions/styles/chicken-paitan.ts`
- Create: `packages/classification-core/src/definitions/styles/duck-chintan.ts`
- Create: `packages/classification-core/src/definitions/styles/duck-paitan.ts`
- Create: `packages/classification-core/src/definitions/styles/gyokai.ts`
- Create: `packages/classification-core/src/definitions/styles/shellfish-dashi.ts`
- Create: `packages/classification-core/src/definitions/styles/iekei.ts`
- Create: `packages/classification-core/src/definitions/styles/jiro.ts`
- Create: `packages/classification-core/src/definitions/styles/hakata.ts`
- Create: `packages/classification-core/src/definitions/styles/sapporo.ts`
- Create: `packages/classification-core/src/definitions/styles/konbusui-tsukemen.ts`
- Create: `packages/classification-core/src/definitions/styles/gyokai-tsukemen.ts`
- Create: `packages/classification-core/src/definitions/styles/aburasoba.ts`
- Create: `packages/classification-core/src/definitions/styles/taiwan-mazesoba.ts`

**Interfaces:** Produces one focused definition per legacy style, one shared
taxonomy, and `styleDefinitionBundle` at `batch3a.1.0`.

- [ ] **Step 1: Write RED inventory/compactness tests**

Assert exact ordered 18 style IDs, one file per ID, three intensities and five
noodles per style, six base questions plus body, the six-tag closed global
domain, exact per-style accent/tag ownership, unique priorities/adjustments, 18
unique bonuses and seven unique conflicts, focused source paths, and no
hand-authored full core/subtype IDs.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run packages/classification-core/src/definitions/styles/definitions.test.ts \
  > .superpowers/sdd/batch-3a/task-05-red.txt 2>&1
```

- [ ] **Step 3: Transcribe only proven canonical legacy data**

Exclude localized sentences, ratios, caps, ranking thresholds, runtime
fallbacks, and eligibility execution. Current styles use shared body profiles;
do not invent overrides.

- [ ] **Step 4: GREEN, truth review, and commit**

```bash
npx vitest run packages/classification-core/src/definitions/styles/definitions.test.ts \
  packages/classification-core/src/compiler/styles/source-schema.test.ts
npm run typecheck
npm run lint
git diff --check
git diff --name-status HEAD
```

The independent reviewer compares every value with the frozen legacy commit,
not chat notes. After `PASS`:

```bash
git add packages/classification-core/src/definitions/styles
git commit -m "Author canonical style definitions"
```

**Stop conditions:** Unknown legacy value, inferred compatibility, fabricated
tag/copy, policy/eligibility leakage, or a need to change the approved contract.

---

### Task 6: Generate deterministic intensity cores

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md`
- Modify: `docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md`
- Modify: `packages/classification-core/src/contracts/style-model.ts`
- Create: `packages/classification-core/src/compiler/styles/compile.ts`
- Create: `packages/classification-core/src/compiler/styles/compile.test.ts`
- Modify: `packages/classification-core/src/compiler/styles/test-fixtures.ts`

**Interfaces:** Adds compiler-internal `StyleCoreStage` and
`CompileStyleCoresResult`, then implements `compileStyles` through core
generation with `CoreId = ${StyleId}:${IntensityId}` and taxonomy-owned
priority. A successful Task 6 result contains `coreStage`, not `model`; it has no
placeholder final-model collections or hashes and is not a public runtime or
compiler-entrypoint export. The same internal contract revision defines the
non-optional subtype and rules stage shapes used by Tasks 7 and 8, but Task 6
does not populate or return either later stage.

- [ ] **Step 1: Write RED core tests**

Assert 54 exact IDs/parents/priorities, three cores per style, body-profile
inheritance through resolved inert rules, whole-rule override semantics, no
stage on any error, and exact diagnostics for intensity, display priority,
model version, family mismatch, source-triggerable core collision, or a
per-style declared/generated intensity inventory mismatch. Task 6 does not add
a parent-mutation seam and does not claim proof that the full canonical input
contains all 18 styles. Require exactly the six taxonomy-owned `style-base`
questions plus `body` owned by `intensity-profile`; an extra known base rule or
wrong `ruleQuestions.source` is an inventory error, never silently omitted.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run packages/classification-core/src/compiler/styles/compile.test.ts \
  -t "core|intensity|family|model version" \
  > .superpowers/sdd/batch-3a/task-06-red.txt 2>&1
```

- [ ] **Step 3: Implement question-bound canonical core generation**

Bind family/form and all question/option references to the trusted question
model. Emit only the explicit `StyleCoreStage`; never use source index for ID or
priority. Do not create `CompiledStyleModel`, empty final collections, or
placeholder hashes.

- [ ] **Step 4: GREEN, review, and commit**

```bash
npx vitest run packages/classification-core/src/compiler/styles/compile.test.ts \
  -t "core|intensity|family|model version"
npm run typecheck
npm run lint
git diff --check
git diff --name-status HEAD
```

After independent compiler review `PASS`:

```bash
git add packages/classification-core/src/compiler/styles/compile.ts \
  packages/classification-core/src/compiler/styles/compile.test.ts \
  packages/classification-core/src/compiler/styles/test-fixtures.ts \
  packages/classification-core/src/contracts/style-model.ts \
  docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md \
  docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md
git commit -m "Generate deterministic style cores"
```

**Stop conditions:** Fallback core, inferred taxonomy membership, adjustments
copied onto cores, unstable ordering, scoring arithmetic, artifact creation,
public export of a stage type, or a staged value represented as a partial
`CompiledStyleModel`.

---

### Task 7: Generate deterministic noodle subtypes

**Files:**
- Modify: `packages/classification-core/src/compiler/styles/compile.ts`
- Modify: `packages/classification-core/src/compiler/styles/compile.test.ts`
- Modify: `packages/classification-core/src/compiler/styles/test-fixtures.ts`

**Interfaces:** Consumes `StyleCoreStage` and changes `compileStyles` to return
`CompileStyleSubtypesResult` with `subtypeStage`. Adds the 54-by-five matrix with
`SubtypeId = ${CoreId}:${NoodleId}` and taxonomy-owned priority, without final
compiled rules, adjustments, inventory, or hashes.

- [ ] **Step 1: Write RED subtype tests**

Assert 270 exact IDs/parents/priorities/message-template roles, declared versus
generated equality, no fallback, and deterministic diagnostics for noodle
membership, source-triggerable collision, and per-style missing/extra
combinations. Global generated-parent reconstruction and
`STYLE_PARENT_MISMATCH` remain Task 9 proof responsibilities; Task 7 adds no
parent-mutation seam.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run packages/classification-core/src/compiler/styles/compile.test.ts \
  -t "subtype|noodle|combination" \
  > .superpowers/sdd/batch-3a/task-07-red.txt 2>&1
```

- [ ] **Step 3: Implement, prove GREEN, review, and commit**

```bash
npx vitest run packages/classification-core/src/compiler/styles/compile.test.ts \
  -t "subtype|noodle|combination"
npm run typecheck
npm run lint
git diff --check
git diff --name-status HEAD
```

After independent `PASS`:

```bash
git add packages/classification-core/src/compiler/styles/compile.ts \
  packages/classification-core/src/compiler/styles/compile.test.ts \
  packages/classification-core/src/compiler/styles/test-fixtures.ts
git commit -m "Generate deterministic style subtypes"
```

**Stop conditions:** Runtime fallback, locale identity, silently repaired
combination, or duplicated legacy copy in 270 records.

---

### Task 8: Compile rules and normalized adjustments

**Files:**
- Modify: `packages/classification-core/src/compiler/styles/compile.ts`
- Modify: `packages/classification-core/src/compiler/styles/compile.test.ts`
- Modify: `packages/classification-core/src/compiler/styles/test-fixtures.ts`
- Modify: `packages/classification-core/src/contracts/diagnostic-codes.ts`
- Modify: `packages/classification-core/src/contracts/diagnostic.test.ts`
- Modify: `docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md`
- Modify: `docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md`

**Interfaces:** Consumes `StyleSubtypeStage` and changes `compileStyles` to
return `CompileStyleRulesResult` with `rulesStage`. Produces seven ordered rules
per core, one normalized style-level adjustment set with ordered
`appliesToCoreIds`, and bound exclusion tags, but no final-model inventory or
hash metadata.

The approved Task 8 diagnostic amendment requires canonical adjustment
condition identities (`questionId` plus canonical `optionIds`) to be unique
within one adjustment independently of priority. Repeated identity emits
`STYLE_ADJUSTMENT_CONDITION_DUPLICATE`; repeated priority remains the distinct
`STYLE_ADJUSTMENT_CONDITION_PRIORITY_DUPLICATE` failure.

- [ ] **Step 1: Write RED rule/adjustment mutation tests**

Cover unknown/wrong-owner/duplicate/tier-overlap targets, direct empty/missing/
duplicate-target/tier-overlap rule diagnostics, duplicate adjustment IDs/
priorities, duplicate condition identity independently of priority, invalid
conditions/operands/minMatches,
bonus-before-conflict phase, canonical targets/conditions, provenance, exclusion
mapping, and 54-to-18 bonus plus 21-to-seven conflict normalization.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run packages/classification-core/src/compiler/styles/compile.test.ts \
  -t "rule|tier|bonus|conflict|adjustment|exclusion" \
  > .superpowers/sdd/batch-3a/task-08-red.txt 2>&1
```

- [ ] **Step 3: Implement representation only**

Do not apply ratios, points, penalties, caps, answers, ranking, confidence,
explanations, or eligibility. `miss` is metadata, not a numeric policy value.

- [ ] **Step 4: GREEN, review, and commit**

```bash
npx vitest run packages/classification-core/src/compiler/styles
npm run typecheck
npm run lint
git diff --check
git diff --name-status HEAD
```

After independent rule/truth-boundary review `PASS`:

```bash
git add packages/classification-core/src/compiler/styles/compile.ts \
  packages/classification-core/src/compiler/styles/compile.test.ts \
  packages/classification-core/src/compiler/styles/test-fixtures.ts \
  packages/classification-core/src/contracts/diagnostic-codes.ts \
  packages/classification-core/src/contracts/diagnostic.test.ts \
  docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md \
  docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md
git commit -m "Compile style rules and adjustments"
```

**Stop conditions:** Numerical scoring, exclusion execution, inferred
cross-style reference, lost legacy operand/condition, or silent repair.

---

### Task 9: Prove semantic integrity, hashes, determinism, and immutability

**Files:**
- Create: `packages/classification-core/src/compiler/styles/proof.ts`
- Create: `packages/classification-core/src/compiler/styles/proof.test.ts`
- Modify: `packages/classification-core/src/compiler/styles/compile.ts`
- Modify: `packages/classification-core/src/compiler/styles/compile.test.ts`

**Interfaces:** Consumes `StyleRulesStage`, converts it to the successful
`CompiledStyleModel`, changes `compileStyles` to return `CompileStylesResult`,
and completes internal semantic proof, exact source/semantic/data projections,
deep freeze, and deterministic diagnostics. `proveStyleModel` stays internal.

- [ ] **Step 1: Write RED proof/determinism tests**

Require:

```text
repeat compilation byte-identical
reversed/shuffled style files byte-identical
reversed tier/target/condition arrays canonicalize identically
object key insertion order irrelevant
all array orders match the approved ordering table
source mutation cannot mutate compiled output
all nested output/provenance/inventory values frozen
no timestamp or absolute path
global IDs and parents exact and unique
complete canonical inventory contains exactly all 18 styles
source-inaccessible parent inconsistency emits STYLE_PARENT_MISMATCH during proof
sourceHash/semanticHash/dataVersion use the exact approved projections
question modelVersion or semanticHash mismatch fails integration
question sourceHash-only change leaves style semanticHash unchanged
message/accent changes affect only approved identities
reverse invalid input yields identical complete diagnostics
```

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run packages/classification-core/src/compiler/styles/proof.test.ts \
  packages/classification-core/src/compiler/styles/compile.test.ts \
  -t "determin|hash|freeze|identity|proof|reorder" \
  > .superpowers/sdd/batch-3a/task-09-red.txt 2>&1
```

- [ ] **Step 3: Implement exact projections and internal proof**

Use shared `stableJson`, SHA-256 in compiler code, and shared
`contracts/deep-freeze.ts`. Provenance and metadata hash fields do not hash
themselves. Do not export the proof helper.

- [ ] **Step 4: GREEN, full compiler regressions, review, and commit**

```bash
npx vitest run packages/classification-core/src/compiler/styles \
  packages/classification-core/src/contracts/deep-freeze.test.ts \
  packages/classification-core/src/compiler/questions
npm run typecheck
npm run lint
git diff --check
git diff --name-status HEAD
```

After independent determinism/hash review `PASS`:

```bash
git add packages/classification-core/src/compiler/styles/proof.ts \
  packages/classification-core/src/compiler/styles/proof.test.ts \
  packages/classification-core/src/compiler/styles/compile.ts \
  packages/classification-core/src/compiler/styles/compile.test.ts
git commit -m "Prove deterministic style compilation"
```

**Stop conditions:** Hash ambiguity, provenance in identity, non-frozen output,
input-order drift, public proof export, changed question artifact, or unstable
diagnostics.

---

### Task 10: Render and check the immutable generated style artifact

**Files:**
- Create: `packages/classification-core/src/compiler/styles/serialize.ts`
- Create: `packages/classification-core/src/compiler/styles/serialize.test.ts`
- Modify: `packages/classification-core/src/compiler/index.ts`
- Create: `packages/classification-core/src/generated/style-model.ts`
- Create: `tools/styles/generate-style-model.ts`
- Create: `tools/styles/generate-style-model.test.ts`
- Modify: `package.json`

**Interfaces:** Adds exact pure
`renderStyleArtifact(model: CompiledStyleModel): string`, atomic external
write/check tooling, the approved compiler-only style exports needed by that
tool, `styles:generate`, and `styles:check`.

- [ ] **Step 1: Write RED serializer/generator tests**

Test deterministic complete source, stable object keys/arrays, shared
deep-freeze import, no compiler/definition/Node/Zod import in the artifact, no
timestamp/absolute path, check-mode drift without writes, atomic write,
unchanged write, unsafe target rejection, cleanup after rename failure, and the
exact compiler-entrypoint value/type list. Explicitly prove `proveStyleModel`
is not exported.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run packages/classification-core/src/compiler/styles/serialize.test.ts \
  tools/styles/generate-style-model.test.ts \
  > .superpowers/sdd/batch-3a/task-10-red.txt 2>&1
```

- [ ] **Step 3: Implement pure rendering and external atomic publication**

The package serializer performs no file I/O. Only the tool reads/writes the
generated path. Compile the canonical bundle against the accepted
`questionModel`, generate once, and never hand-edit the artifact.

- [ ] **Step 4: GREEN, drift check, review, and commit**

```bash
npm run styles:generate
npm run styles:check
npx vitest run packages/classification-core/src/compiler/styles/serialize.test.ts \
  tools/styles/generate-style-model.test.ts
npm run typecheck
npm run lint
git diff --check
git diff --name-status HEAD
```

After independent artifact/runtime-boundary review `PASS`:

```bash
git add packages/classification-core/src/compiler/styles/serialize.ts \
  packages/classification-core/src/compiler/styles/serialize.test.ts \
  packages/classification-core/src/compiler/index.ts \
  packages/classification-core/src/generated/style-model.ts \
  tools/styles package.json
git commit -m "Generate immutable style model"
```

**Stop conditions:** File I/O inside package serializer, manual artifact edit,
compiler/definition import in artifact, non-atomic write, nondeterministic bytes,
or question artifact drift.

---

### Task 11: Compose the style model into classification compilation

**Files:**
- Modify: `docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md`
  (approved Task 11 allowlist amendment only)
- Modify: `packages/classification-core/src/definitions/classification.ts`
- Modify: `packages/classification-core/src/definitions/synthetic.ts`
- Modify: `packages/classification-core/src/compiler/source-schema.ts`
- Modify: `packages/classification-core/src/compiler/parse.ts`
- Modify: `packages/classification-core/src/compiler/parse.test.ts`
- Modify: `packages/classification-core/src/compiler/compile.ts`
- Modify: `packages/classification-core/src/compiler/compile.test.ts`
- Modify: `packages/classification-core/src/contracts/model.ts`
- Modify: `packages/classification-core/src/contracts/provenance.ts`
- Modify: `tools/documentation/build-index.ts` (minimum type-compatibility
  adapter only; Task 16 retains documentation/provenance/readiness ownership)
- Modify: `tools/documentation/build-index.test.ts` (replace only the retired
  synthetic compiler fixture and lock the pre-Task-16 readiness behavior)
- Modify: `tools/documentation/generate-classification-index.test.ts` (add
  compiled style source paths only to the isolated repository fixture)
- Modify: `tools/validation/validate-classification.ts`

**Interfaces:** Retires the compiler-only synthetic style source shape,
compiles questions first and styles against that exact model, returns
`ClassificationModel.styleModel`, and calculates the approved classification
data version.

- [ ] **Step 1: Write RED composition tests**

Assert `DefinitionBundleSource.styles` is `StyleDefinitionBundleSource`,
top-level/style model versions agree, question failure prevents style compile,
style failure prevents classification model, inventory is the exact combined
question/option/style/core/subtype/policy set, the synthetic style shape is
rejected, and classification data identity includes exact question and style
metadata projections. A question message-ID-only mutation changes question
source hash and classification data version but not style semantic hash.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run packages/classification-core/src/compiler/parse.test.ts \
  packages/classification-core/src/compiler/compile.test.ts \
  > .superpowers/sdd/batch-3a/task-11-red.txt 2>&1
```

- [ ] **Step 3: Implement minimum source-contract replacement**

Remove only the synthetic style value; preserve the synthetic policy. Replace
the local deep-freeze helper with the shared contract. Do not change question,
flow, persistence, or scoring behavior. Because the style provenance type is
now correctly narrowed to `legacy-production`, route the pre-Task-16
documentation builder's legacy synthetic-origin check through a typed
compatibility predicate. Do not change its rendered output, readiness rules,
assurance, evidence shape, or ownership; Task 16 retains those changes.

- [ ] **Step 4: GREEN, classification validation, review, and commit**

```bash
npx vitest run packages/classification-core/src/compiler/parse.test.ts \
  packages/classification-core/src/compiler/compile.test.ts \
  packages/classification-core/src/compiler/questions
npx vitest run tools/documentation/build-index.test.ts \
  tools/documentation/generate-classification-index.test.ts
npm run classification:validate
npm run questions:check
npm run typecheck
npm run lint
git diff --check
git diff --name-status HEAD
```

After independent composition/API review `PASS`:

```bash
git add docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md \
  packages/classification-core/src/definitions/classification.ts \
  packages/classification-core/src/definitions/synthetic.ts \
  packages/classification-core/src/compiler/source-schema.ts \
  packages/classification-core/src/compiler/parse.ts \
  packages/classification-core/src/compiler/parse.test.ts \
  packages/classification-core/src/compiler/compile.ts \
  packages/classification-core/src/compiler/compile.test.ts \
  packages/classification-core/src/contracts/model.ts \
  packages/classification-core/src/contracts/provenance.ts \
  tools/documentation/build-index.ts \
  tools/documentation/build-index.test.ts \
  tools/documentation/generate-classification-index.test.ts \
  tools/validation/validate-classification.ts
git commit -m "Compose compiled styles into classification"
```

**Stop conditions:** Changed question model/flow/persistence, retained ambiguous
synthetic style input, created numeric policy, style/question migration axes
mixed with persisted data, or the compatibility adapter changes Task 16-owned
documentation output, assurance, provenance evidence, or readiness behavior.

---

### Task 12: Expose compiler and inert runtime style contracts

**Files:**
- Modify: `docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md`
  (approved Task 12 allowlist amendment only)
- Create: `packages/classification-core/src/style-model.ts` (exact hand-written
  runtime facade; re-exports the generated value and approved inert types only)
- Modify: `packages/classification-core/src/index.ts`
- Modify: `packages/classification-core/src/index.test.ts`
- Modify: `packages/classification-core/src/compiler/compile.test.ts` (replace
  only the completed Task 11 "Task 12 not started" boundary assertion)
- Modify: `packages/classification-core/src/compiler/styles/proof.test.ts`
  (replace only the completed Task 9 proof/runtime boundary assertion)
- Modify: `packages/classification-core/src/compiler/styles/serialize.test.ts`
  (replace only the completed Task 10 artifact/runtime boundary assertion)
- Modify: `packages/classification-core/package.json`
- Modify: `tools/validation/check-runtime-imports.ts`
- Modify: `tools/validation/check-runtime-imports.test.ts`

**Interfaces:** Preserves Task 10 compiler exports. A hand-written
`src/style-model.ts` facade projects only the generated `styleModel` value and
the exact approved inert compiled types. Both the runtime root and
`./generated/style-model` use that facade, so the generated artifact bytes stay
unchanged and the subpath does not leak unrelated runtime-root types.

- [ ] **Step 1: Write RED export and import-boundary tests**

Reconfirm the exact compiler value/type list and assert the exact runtime value/
type list, generated subpath, unchanged question/flow/persistence exports, no runtime
definition/schema/compiler/Zod/Node/tool import, and no persistence/scoring/
eligibility/browser/storage import from the style artifact. Explicitly prove
`proveStyleModel` is not public.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run packages/classification-core/src/index.test.ts \
  tools/validation/check-runtime-imports.test.ts \
  > .superpowers/sdd/batch-3a/task-12-red.txt 2>&1
```

- [ ] **Step 3: Implement additive public boundaries**

Do not rename or remove `questionModel`, `decodeAnswerDraft`, `evaluateFlow`, or
persistence exports. Do not export source definitions from the runtime root.
The facade may have one runtime edge to `./generated/style-model.js` and one
type-only edge to `./contracts/style-model.js`; it must not add any other edge
or export.
The three protected compiler test files may change only their stale
pre-Task-12 runtime assertions. They must continue to lock compiler exports,
artifact identity, `proveStyleModel` privacy, and all Task 9-11 semantics.

- [ ] **Step 4: GREEN, build, review, and commit**

```bash
npx vitest run packages/classification-core/src/index.test.ts \
  tools/validation/check-runtime-imports.test.ts
npm run runtime:imports:check
npm run styles:check
npm run questions:check
npm run typecheck
npm run build
npm run lint
git diff --check
git diff --name-status HEAD
```

After independent public-surface/runtime-boundary review `PASS`:

```bash
git add docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md \
  packages/classification-core/src/style-model.ts \
  packages/classification-core/src/index.ts \
  packages/classification-core/src/index.test.ts \
  packages/classification-core/src/compiler/compile.test.ts \
  packages/classification-core/src/compiler/styles/proof.test.ts \
  packages/classification-core/src/compiler/styles/serialize.test.ts \
  packages/classification-core/package.json \
  tools/validation/check-runtime-imports.ts \
  tools/validation/check-runtime-imports.test.ts
git commit -m "Expose compiled style model"
```

**Stop conditions:** Breaking existing public API, compiler dependency in root,
runtime Zod/Node/tools import, generated artifact modification, facade export
beyond `styleModel` plus the approved inert types, changed question artifact,
compiler implementation change, protected compiler test change beyond the
three stale pre-Task-12 assertions, or new scorer/eligibility/storage export.

---

### Task 12A: Generalize shared fixture authoring for style extraction

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md`
- Modify: `docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md`
- Modify: `tools/parity/shared/contracts.ts`
- Modify: `tools/parity/shared/authoring.ts`
- Modify: `tools/parity/shared/authoring.test.ts`

**Interfaces:** This is a separately reviewed pre-Task-13 maintenance
transaction. It adds an explicit domain-neutral instrumentation descriptor and
a `copy-validated` dependency policy while preserving the accepted question and
persistence adapters and fixtures without modification.

- [ ] **Step 1: Amend and independently review the maintenance contract**

The descriptor declares exact safe repository-relative patch targets with
expected ` M`/`??` statuses plus one exact added Vitest extraction entrypoint.
Shared authoring validates patch blob identities, exact post-apply files, and
the entrypoint. New adapters must provide the descriptor; the existing
question/persistence behavior remains available only as a compatibility
default.

Dependency evidence is discriminated: the compatibility `npm-ci` arm retains
exact Node/npm runtime versions, while `copy-validated` records exact Node,
legacy lockfile, installed-lock, and canonical dependency-tree-manifest hashes,
with no npm version. It rejects the `npm-version` and `npm-ci` roles.

For `copy-validated`, build a code-point-sorted recursive source manifest of
safe relative path, entry type, regular-file SHA-256, or literal symlink target.
Reject special entries, broken/cyclic/absolute links, and links resolving
outside the source root. Copy without dereferencing links; require a physical
destination root, links resolving within that root, and an exactly equal
destination manifest. Revalidate the source manifest and installed lock after
copy, after both sandbox commands, and in success-or-failure cleanup.

Both commands use exact shared-owned argv: `/usr/bin/sandbox-exec -p
'(version 1)(allow default)(deny network*)' <node> <vitest> run`, with only the
exact descriptor extraction entrypoint appended to the extraction command.
Adapters supply no arguments. Their environment keys are exactly `CI`,
`GIT_CONFIG_NOSYSTEM`, `HOME`, `LANG`, `LC_ALL`, `PATH`,
`RAMEN_PARITY_SEED`, `TMPDIR`, and `TZ`: flags are `1`, locales are `C.UTF-8`,
`TZ` is `UTC`, `HOME`/`TMPDIR` are shared-owned below the extraction root, and
no `NPM_CONFIG_*` key is present. `PATH` is exactly the trusted Node directory
plus `/usr/bin:/bin` and must expose no executable npm/npx. Each command has a
fixed 120,000 ms deadline, `SIGTERM` plus a fixed 2,000 ms `SIGKILL` escalation,
bounded failure, source revalidation, and cleanup.

- [ ] **Step 2: Write and confirm focused RED shared tests**

Test generic patch targets and extraction entrypoint, unsafe/duplicate/missing
targets, patch/status drift, installed-lock and manifest-hash drift, safe
physical dependency copy, escaping/broken/absolute links, special files,
destination-manifest mismatch, post-copy/post-command/failure-path source drift,
and preservation of the compatibility default. For both legacy roles assert the
exact sandbox profile, fixed argv, exact environment-key set and `PATH`, no
`npm-version`/`npm-ci` role, 120,000 ms deadline, timeout termination/escalation,
bounded failure, full-suite-before-extraction, and cleanup.

```bash
npx vitest run tools/parity/shared/authoring.test.ts \
  > .superpowers/sdd/batch-3a/task-12a-red.txt 2>&1
```

- [ ] **Step 3: Implement the minimal shared generalization**

Do not modify question or persistence adapters, fixtures, manifests, package
scripts, locks, production packages, or Task 13 files. Do not duplicate the
shared transaction. The copied dependency tree is local authoring input, never
committed observation data or manifest path metadata.

- [ ] **Step 4: GREEN, regression review, and focused commit**

```bash
npx vitest run \
  tools/parity/shared/authoring.test.ts \
  tools/parity/questions/extractor.test.ts \
  tools/parity/persistence/extractor.test.ts
npm run typecheck
npm run lint
git diff --check
git diff --name-status HEAD
```

After independent shared-transaction/security review `PASS`:

```bash
git add \
  docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md \
  docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md \
  tools/parity/shared/contracts.ts \
  tools/parity/shared/authoring.ts \
  tools/parity/shared/authoring.test.ts
git commit -m "Generalize shared fixture authoring"
```

**Stop conditions:** Any question/persistence adapter or fixture change,
neighboring-checkout mutation, network-enabled style execution, unbound copied
dependency identity, arbitrary command/target injection, unsafe symlink copy,
publication semantic change, allowlist expansion, or independent review
`CHANGES_REQUIRED`.

---

### Task 13: Define legacy style observations and extraction instrumentation

**Files:**
- Create: `tools/parity/styles/contracts.ts`
- Create: `tools/parity/styles/contracts.test.ts`
- Create: `tools/parity/styles/extractor.ts`
- Create: `tools/parity/styles/extractor.test.ts`
- Create: `tools/parity/styles/extract.ts`
- Create: `tools/parity/styles/legacy-instrumentation.patch`
- Create: `tools/parity/styles/seeds.json`

**Interfaces:** Adds a style-specific adapter over unchanged
`tools/parity/shared/**` for exact legacy identity, observation schema,
instrumentation, canonicalization, coverage, and manifest construction.
Task 13 supplies the reviewed explicit style instrumentation descriptor and
`copy-validated` dependency identity; it may not use the compatibility default
or `npm-ci` policy. Its patch adds only the declared style observation test and
does not modify `src/App.tsx` or any legacy behavior source.
Its CLI is exact:

```text
extract.ts --legacy-checkout <absolute-path> [--replace|--verify-only]
```

- [ ] **Step 1: Write RED contracts/extractor tests**

The observation must cover ordered style/core/subtype IDs and parents; family,
accent, intensity/noodle matrices and priorities; every rule target/tier;
adjustment IDs/kinds/priorities/operands/conditions; per-style tags; copy source
roles; and the observed repeated-adjustment copies. Test exact legacy HEAD/tree,
tracked source hashes, lockfile/patch/seeds/authoring hashes, the exact Node
runtime plus installed-lock and dependency-tree-manifest hashes without npm
runtime evidence, network denial, full legacy suite, shared
lock/fingerprints/atomic publication, bounded errors, and cleanup/recovery.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run tools/parity/styles/contracts.test.ts \
  tools/parity/styles/extractor.test.ts \
  > .superpowers/sdd/batch-3a/task-13-red.txt 2>&1
```

- [ ] **Step 3: Implement only the style adapter**

Reuse shared authoring without edits or wrappers that duplicate its lock,
temporary worktree, fingerprint, sandbox, publication, rollback, or recovery
logic. `observedLegacyOutput` is evidence only, never canonical input.

- [ ] **Step 4: GREEN, review, and commit**

```bash
npx vitest run tools/parity/styles \
  tools/parity/shared/authoring.test.ts
npm run typecheck
npm run lint
git diff --check
git diff --name-status HEAD
```

Independent authoring/truth-boundary review must inspect the patch and prove it
observes rather than replaces legacy behavior. After `PASS`:

```bash
git add tools/parity/styles
git commit -m "Define legacy style observations"
```

**Stop conditions:** Shared authoring modification, neighboring checkout
mutation, networked extraction, absolute path in committed data, observation
used as compiler input, or scoring/recommendation claims.

---

### Task 14: Extract and freeze the legacy style corpus

**Files:**
- Create: `tools/parity/styles/verify-fixtures.ts`
- Create: `tools/parity/styles/verify-fixtures.test.ts`
- Create: `tools/parity/fixtures/styles/legacy-v1/cases.json`
- Create: `tools/parity/fixtures/styles/legacy-v1/manifest.json`

**Interfaces:** Adds an offline fixture identity/coverage gate, then publishes
the complete canonical observation and hash-bound manifest through the shared
atomic authoring transaction.

- [ ] **Step 1: Write and confirm RED offline fixture-gate tests**

Test absent/malformed cases, manifest/corpus byte drift, count/ordered-ID drift,
source/lock/patch/seeds/authoring/runtime identity drift, missing entity/rule/
adjustment/tag/copy-role coverage, forbidden current-runtime fields, absolute
paths, and operation without a neighboring legacy checkout or network.

```bash
npx vitest run tools/parity/styles/verify-fixtures.test.ts \
  > .superpowers/sdd/batch-3a/task-14-red.txt 2>&1
```

Expected: FAIL because the offline verifier and frozen corpus do not exist.

- [ ] **Step 2: Implement the offline read-only verifier**

The verifier reads only committed fixture bytes and tracked authoring sources.
It never imports or invokes the live extractor and never accepts an external
checkout path.

- [ ] **Step 3: Reconfirm frozen source and author once**

```bash
git -C /Users/ansonhui/Documents/GitHub/ramen-style-today \
  rev-parse HEAD^{commit} HEAD^{tree}
git -C /Users/ansonhui/Documents/GitHub/ramen-style-today \
  status --short --untracked-files=no
npx tsx tools/parity/styles/extract.ts \
  --legacy-checkout /Users/ansonhui/Documents/GitHub/ramen-style-today \
  --replace
```

The shared transaction must run the legacy full suite before network-denied
extraction and publish exactly two fixture files.

- [ ] **Step 4: Prove GREEN, identity, and completeness**

```bash
npx tsx tools/parity/styles/extract.ts \
  --legacy-checkout /Users/ansonhui/Documents/GitHub/ramen-style-today \
  --verify-only \
  > .superpowers/sdd/batch-3a/task-14-green.txt 2>&1
npx vitest run tools/parity/styles/verify-fixtures.test.ts
npx tsx tools/parity/styles/verify-fixtures.ts
shasum -a 256 tools/parity/fixtures/styles/legacy-v1/cases.json \
  tools/parity/fixtures/styles/legacy-v1/manifest.json
git diff --check
git diff --name-status HEAD
```

Require 18 styles, 54 cores, 270 subtypes, 378 rules, 54 observed bonus copies,
21 observed conflict copies, exact ordered IDs, all required hashes, and no
temporary worktree/lock/backup/recovery residue.

- [ ] **Step 5: Independent fixture review and commit**

The reviewer independently binds manifest hashes to tracked bytes and checks
that cases contain only observed legacy data. After `PASS`:

```bash
git add tools/parity/styles/verify-fixtures.ts \
  tools/parity/styles/verify-fixtures.test.ts \
  tools/parity/fixtures/styles/legacy-v1/cases.json \
  tools/parity/fixtures/styles/legacy-v1/manifest.json
git commit -m "Freeze legacy style observations"
```

**Stop conditions:** Legacy identity drift, full-suite failure, network access,
partial publication, missing coverage, cleanup warning/recovery-required state,
or any manually edited fixture byte.

---

### Task 15: Prove compiled style inventory parity

Before Task 15 implementation, one focused directory-inventory maintenance
transaction modifies only this plan and
`tools/parity/styles/extractor.test.ts`. The existing Task 13 guard must accept
exactly either the reviewed pre-Task-15 file set or that same set plus the
complete `parity.ts` and `parity.test.ts` pair. It rejects either file appearing
alone and every other extra or missing entry. This maintenance does not reopen
the extractor, fixture, contracts, verifier, or authoring semantics, requires
an independent test-contract review, and is committed separately. Once Task 15
is present, its focused gate exercises the complete pair.

**Files:**
- Create: `tools/parity/styles/parity.ts`
- Create: `tools/parity/styles/parity.test.ts`
- Modify: `package.json`

**Interfaces:** Adds offline `parity:styles` comparing a canonical compiled
projection to frozen observations, without executing recommendations.

The approved Task 15 projection contract is exact:

- compare legacy `kind` as the fixed adjustment phase (`bonus` before
  `conflict`);
- compare legacy `sourceOrdinal` to compiled adjustment `priority`;
- compare `points` and `penalty` only as inert representation operands, without
  applying, aggregating, capping, rounding, or claiming numerical scoring;
- do not compare a rule source/provenance role because the frozen rule
  observation contains no such evidence;
- use legacy adjustment `sourceRole` only for copy identity and group
  consistency; and
- derive current copy roles from stable message/template slots and do not
  compare localized copy values or current provenance paths.

- [ ] **Step 1: Write RED fixture/parity tests**

Test fixture schema/manifest identity, exact counts/ordered IDs/parents,
families/accents/priorities, supported matrices, rules/targets/tiers,
adjustments/conditions, per-style/global tags, copy roles, 54-to-18 and 21-to-7
normalization, missing/extra/duplicate entities, bounded mismatch diagnostics,
and independence from neighboring checkout/network/absolute path.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run tools/parity/styles/parity.test.ts \
  > .superpowers/sdd/batch-3a/task-15-red.txt 2>&1
```

- [ ] **Step 3: Implement exact narrow projection**

Do not calculate, apply, or claim numeric score, collapse, ranking, confidence,
blocked results, recommendation, catalog, Finder, or rendered copy. Exact
`points` and `penalty` equality is representation-only operand evidence under
the contract above, not a scoring claim.

- [ ] **Step 4: GREEN, review, and commit**

```bash
npx vitest run tools/parity/styles
npm run parity:styles
npm run styles:check
npm run typecheck
npm run lint
git diff --check
git diff --name-status HEAD
```

After independent parity/truth-boundary review `PASS`:

```bash
git add tools/parity/styles/parity.ts tools/parity/styles/parity.test.ts \
  package.json
git commit -m "Prove compiled style parity"
```

**Stop conditions:** Live extraction in ordinary parity, fabricated divergence,
recommendation claim, unbounded corpus dump, or any mismatch hidden/repaired.

---

### Task 16: Extend checked documentation and repository verification

**Files:**
- Modify: `tools/documentation/build-index.ts`
- Modify: `tools/documentation/build-index.test.ts`
- Modify: `tools/documentation/generate-classification-index.ts`
- Modify: `tools/documentation/generate-classification-index.test.ts`
- Modify: `tools/documentation/relations.ts`
- Modify: `tools/validation/validate-classification.ts`
- Modify: `package.json`

**Interfaces:** Teaches builders/validators about style/core/subtype concepts,
compiled style provenance, fixture identity, exact readiness transitions, and
adds `styles:check` plus `parity:styles` to full offline verify. It does not yet
generate live docs.

- [ ] **Step 1: Write RED builder/validation tests**

Use in-memory in-progress and completed ledger fixtures. Assert exact concept
source/compiler/generated/test/message/future-consumer relations; style
`compiler-validated` without implementation SHA before completion;
`parity-verified` only with exact candidate evidence; persistence unchanged;
scoring synthetic; five blockers before completion and exact four after;
fixture/hash consistency; and no 3B/3C claims.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run tools/documentation \
  > .superpowers/sdd/batch-3a/task-16-red.txt 2>&1
```

- [ ] **Step 3: Implement builders without live metadata writes**

Keep existing concept kinds. `style/{id}`, `intensity/{coreId}`, and
`noodle/{subtypeId}` map to actual compiled records. Rule/adjustment IDs remain
artifact/parity data, not new concept kinds.

- [ ] **Step 4: GREEN, pre-wiring affected gates, review, and commit**

```bash
npx vitest run tools/documentation tools/validation
npm run classification:validate
npm run styles:check
npm run parity:styles
npm run questions:check
npm run runtime:imports:check
npm run parity:questions
npm run parity:persistence
npm run typecheck
npm run build
npm run lint
git diff --check
git diff --name-status HEAD
```

Do not run `classification:index`, `classification:index:check`, full
`npm run verify`, or `migration:ledger` in this pre-wiring task. The compiled
model intentionally makes tracked live metadata stale until Task 17; only Task
17 may generate it and run the post-wiring full repository gate. After
independent documentation/readiness review `PASS`:

```bash
git add tools/documentation tools/validation/validate-classification.ts \
  package.json
git commit -m "Validate compiled style documentation"
```

**Stop conditions:** Early live assurance/ownership write, changed persistence
claim, removed non-style blocker, new concept kind, incomplete relation, or any
focused/affected gate failure.

---

### Task 17: Wire Batch 3A ownership and create the local candidate

**Files:**
- Modify: `tools/migration/ledger-schema.ts`
- Modify: `tools/migration/ledger-check.ts`
- Modify: `tools/migration/ledger-check.test.ts`
- Modify: `tools/migration/check-ledger.ts`
- Modify: `tools/migration/render-ledger.ts`
- Modify: `tools/migration/render-ledger.test.ts`
- Modify: `tools/migration/record-ci.ts`
- Modify: `tools/migration/record-ci.test.ts`
- Modify: `docs/migration/ledger.json`
- Generate: `docs/migration/ledger.md`
- Generate: `docs/classification/manifest.json`
- Generate: `docs/classification/index.md`

**Interfaces:** Adds the in-progress Batch 3A ledger, exact path groups,
style fixture binding, closed completion gates, `3A` CI recording target,
compiler-validated live style provenance, and unchanged five-blocker readiness.

The ledger path groups are exact.

```text
implementationPaths:
  docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md
  docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md
  packages/classification-core/package.json
  packages/classification-core/src/compiler/compile.ts
  packages/classification-core/src/compiler/compile.test.ts
  packages/classification-core/src/compiler/collector.ts
  packages/classification-core/src/compiler/collector.test.ts
  packages/classification-core/src/compiler/index.ts
  packages/classification-core/src/compiler/parse.ts
  packages/classification-core/src/compiler/parse.test.ts
  packages/classification-core/src/compiler/source-schema.ts
  packages/classification-core/src/compiler/styles/**
  packages/classification-core/src/contracts/diagnostic-codes.ts
  packages/classification-core/src/contracts/diagnostic.ts
  packages/classification-core/src/contracts/diagnostic.test.ts
  packages/classification-core/src/contracts/model.ts
  packages/classification-core/src/contracts/provenance.ts
  packages/classification-core/src/contracts/style-model.ts
  packages/classification-core/src/definitions/classification.ts
  packages/classification-core/src/definitions/styles/**
  packages/classification-core/src/definitions/synthetic.ts
  packages/classification-core/src/generated/style-model.ts
  packages/classification-core/src/index.ts
  packages/classification-core/src/index.test.ts
  tools/parity/styles/**
  tools/parity/fixtures/styles/**
  tools/styles/**

verificationPaths:
  package.json
  tools/acceptance/**
  tools/documentation/**
  tools/migration/**
  tools/validation/check-runtime-imports.ts
  tools/validation/check-runtime-imports.test.ts
  tools/validation/validate-classification.ts

acceptanceMetadataPaths:
  docs/classification/index.md
  docs/classification/manifest.json
  docs/migration/ledger.json
  docs/migration/ledger.md
```

- [ ] **Step 1: Write RED ownership/completion/readiness tests**

Assert exact path arrays and no overlaps; style fixture manifest hash equals
tracked bytes and manifest projection; in-progress has no `implementationSha`
or acceptance evidence; complete requires exactly `batch3a-local-verify` and
`batch3a-remote-ci`; remote SHA equals implementation SHA; implementation and
verification paths freeze only after that SHA; completion diff is exactly four
metadata files; Batch 2A and narrow Batch 2B protections remain active; style
assurance/readiness follow the exact pre/post states; and formal ownership of
the two planning files replaces the temporary exception. Test that keeping the
exception after adding Batch 3A or removing it before owner registration fails.

- [ ] **Step 2: Confirm RED**

```bash
npx vitest run tools/migration tools/documentation \
  > .superpowers/sdd/batch-3a/task-17-red.txt 2>&1
```

- [ ] **Step 3: Implement in-progress ownership and generate live metadata**

Add the Batch 3A entry as `in-progress`, bind the style fixture manifest hash,
exact paths, no implementation SHA, and no verification. Generate in order:

```bash
npm run migration:ledger
npm run classification:index
```

In the same task, delete `pendingBatch3APlanningBaseline` and its special-case
checker branch only after the new Batch 3A `newOwners` registers the exact
design and plan paths. The ordinary owner/scope checks must then pass for both
files; no temporary exception survives the candidate.

Live style provenance is `legacy-production` plus `compiler-validated`, without
implementation SHA. Readiness remains `migration-only` with exact blockers:

```text
persistence-adapter-not-integrated
persisted-data-cutover-incomplete
styles-not-production-verified
scoring-not-production-verified
runtime-cutover-incomplete
```

Persistence remains `contract-verified`; scoring stays synthetic and
structurally validated.

- [ ] **Step 4: Run final post-wiring local candidate verification**

```bash
npx vitest run tools/migration tools/documentation
npm run migration:ledger:check
npm run classification:index:check
npm run verify
GITHUB_TOKEN="$(gh auth token)" npm run verify:acceptance
shasum -a 256 -c .superpowers/sdd/batch-3a/protected-baseline.sha256
git diff --check
git diff --name-status HEAD
```

Record exact Vitest count, style counts/hashes, typecheck/lint/build, parity,
protected baseline, and full verify output in ignored evidence.

- [ ] **Step 5: Independent final implementation review and candidate commit**

Review covers all Task 4–17 changes, approved public API, deterministic
compiler/artifact, fixture truth boundary, parity scope, runtime import graph,
path ownership, assurances/readiness, and protected Batch 2A/2B identities.
After `PASS`:

```bash
git add tools/migration \
  docs/migration/ledger.json docs/migration/ledger.md \
  docs/classification/manifest.json docs/classification/index.md
git commit -m "Verify Batch 3A style compilation"
```

This is the Batch 3A implementation candidate. No implementation or
verification path may change afterward.

**Stop conditions:** Full verify failure, unowned changed path, early assurance,
missing fixture identity, modified protected baseline, scoring/eligibility
leakage, or independent `CHANGES_REQUIRED`.

---

### Task 18: Authenticate the exact candidate and close Batch 3A

**Files:**
- Modify only: `docs/migration/ledger.json`
- Generate only: `docs/migration/ledger.md`
- Generate only: `docs/classification/manifest.json`
- Generate only: `docs/classification/index.md`

**Interfaces:** Consumes exact Task 17 candidate CI; produces a four-file
metadata completion commit, authenticated metadata CI, parity-verified narrow
style provenance, and the exact four remaining readiness blockers.

- [ ] **Step 1: Push and authenticate the exact implementation candidate**

```bash
npm run verify
git diff --check
test -z "$(git status --porcelain)"
implementation_sha="$(git rev-parse HEAD)"
git push
implementation_run_id=''
for attempt in {1..30}; do
  implementation_run_id="$(gh run list --workflow ci.yml \
    --branch codex/batch-3a-style-compilation --commit "$implementation_sha" \
    --event push --limit 1 --json databaseId --jq '.[0].databaseId')"
  test -n "$implementation_run_id" && break
  sleep 2
done
test -n "$implementation_run_id"
gh run watch "$implementation_run_id" --exit-status
```

Authenticate repository, workflow, event, `headSha === implementation_sha`,
completed status, success conclusion, and canonical URL.

- [ ] **Step 2: Record exact evidence and generate completion metadata**

Generate and locally bind the ignored proof before authenticated recording:

```bash
IMPLEMENTATION_RUN_JSON="$(gh run view "$implementation_run_id" \
  --json databaseId,headSha,status,conclusion,url)"
IMPLEMENTATION_RUN_JSON="$IMPLEMENTATION_RUN_JSON" \
  IMPLEMENTATION_SHA="$implementation_sha" node - <<'NODE'
const fs = require('fs')
const run = JSON.parse(process.env.IMPLEMENTATION_RUN_JSON)
if (run.headSha !== process.env.IMPLEMENTATION_SHA
  || run.status !== 'completed'
  || run.conclusion !== 'success') {
  throw new Error('Batch 3A implementation CI identity mismatch')
}
fs.writeFileSync(
  '.superpowers/sdd/batch-3a/batch3a-implementation-proof.json',
  `${JSON.stringify({
    schemaVersion: 1,
    sha: run.headSha,
    runId: run.databaseId,
    runUrl: run.url,
  }, null, 2)}\n`,
)
NODE
GITHUB_TOKEN="$(gh auth token)" \
  npm run migration:ledger:record-ci -- 3A \
  .superpowers/sdd/batch-3a/batch3a-implementation-proof.json
npm run migration:ledger
npm run classification:index
```

Set Batch 3A `complete`, bind `implementationSha`, exact fixture manifest hash,
and exactly `batch3a-local-verify` plus `batch3a-remote-ci`. Style provenance
may now be `parity-verified` only for
`legacy-compiled-style-projection`. Remove only
`styles-not-production-verified`, leaving exactly:

```text
persistence-adapter-not-integrated
persisted-data-cutover-incomplete
scoring-not-production-verified
runtime-cutover-incomplete
```

- [ ] **Step 3: Prove exact metadata-only diff and review**

```bash
test "$(git diff --name-only "$implementation_sha" | sort)" = \
  $'docs/classification/index.md\ndocs/classification/manifest.json\ndocs/migration/ledger.json\ndocs/migration/ledger.md'
npm run verify
GITHUB_TOKEN="$(gh auth token)" npm run verify:acceptance
shasum -a 256 -c .superpowers/sdd/batch-3a/protected-baseline.sha256
git diff --check
```

Independent metadata review confirms the exact implementation/run identity,
four-file diff, unchanged implementation/verification paths, narrow parity
scope, persistence/scoring assurances, and exact readiness transition. After
`PASS`:

```bash
git add docs/classification/index.md docs/classification/manifest.json \
  docs/migration/ledger.json docs/migration/ledger.md
git commit -m "Accept Batch 3A style compilation"
```

- [ ] **Step 4: Push/authenticate metadata SHA and final state**

```bash
metadata_sha="$(git rev-parse HEAD)"
git push
metadata_run_id=''
for attempt in {1..30}; do
  metadata_run_id="$(gh run list --workflow ci.yml \
    --branch codex/batch-3a-style-compilation --commit "$metadata_sha" \
    --event push --limit 1 --json databaseId --jq '.[0].databaseId')"
  test -n "$metadata_run_id" && break
  sleep 2
done
test -n "$metadata_run_id"
gh run watch "$metadata_run_id" --exit-status
npm run verify
GITHUB_TOKEN="$(gh auth token)" npm run verify:acceptance
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = \
  "$(git rev-parse origin/codex/batch-3a-style-compilation)"
```

Final report includes planning SHA, Batch 2B maintenance candidate/metadata
SHAs and run IDs, Batch 3A implementation/metadata SHAs and run IDs, style
fixture identities, 18/54/270/378 counts, test counts, full verify, public
exports, final assurances/readiness, clean state, and confirmation that Batch 3B
and 3C did not start.

**Stop conditions:** Mismatched or failed CI, non-metadata completion change,
protected baseline drift, assurance/readiness overclaim, implementation path
change after candidate, dirty/upstream-divergent final state, or unreviewed
metadata.

---

## Execution handoff

This plan is complete only when all eighteen tasks remain in this order and all
independent plan reviews are `PASS`. The checkboxes are an immutable execution
specification, not tracked progress; record task state under ignored
`.superpowers/sdd/**` so the plan file does not drift after its approved
checkpoint.

Plan approval authorizes only the ordered actions and pushes explicitly named
above. It does not authorize allowlist expansion, protected-path maintenance,
Batch 3B scoring, Batch 3C eligibility, adapters, or product cutover. Stop at
the first conflict and report the plan clause, code evidence, options, and
recommended resolution before editing outside scope.
