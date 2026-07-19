# Classification Change Map

Use this page before changing classification behavior. The generated
[`index.md`](index.md) identifies each concept's current source, validators,
consumers, messages, migrations, and tests; never edit that index or
`manifest.json` by hand.

| Change | Canonical owner | Required checks |
| --- | --- | --- |
| Atomic ID or source shape | `packages/classification-core/src/compiler/source-schema.ts` | parser tests, compiler tests, index regeneration |
| Diagnostic identity | `packages/classification-core/src/contracts/diagnostic-codes.ts` | mutation test asserting code and JSON Pointer |
| Semantic reference or policy invariant | `packages/classification-core/src/compiler/compile.ts` | compiler mutation test and `classification:validate` |
| Production question, option, branch, or selection rule | approved [Batch 2A specification](../superpowers/specs/2026-07-13-batch-2a-questions-flow-design.md) and `packages/classification-core/src/definitions/questions.ts` | question compiler proof, `questions:generate`, `questions:check`, and observable-transition parity replay |
| Approved observable legacy divergence | `tools/parity/fixtures/questions/expected-divergences.json` plus the approving ADR | bounded divergence validation and `parity:questions` |
| Persisted answer meaning or shape | Batch 2B persistence boundary; not owned by Batch 2A | versioned migration before runtime cutover |
| Concept-to-file relationship | `tools/documentation/relations.ts` | documentation tests and `classification:index:check` |
| Migration provenance | `docs/migration/ledger.json` | ledger tests and `migration:ledger:check` |

Batch 2A owns the production question definitions and pure flow compiler/runtime.
Styles and scoring remain synthetic, persistence begins in Batch 2B, and
production runtime cutover is still blocked. The frozen observable traces prove
only their documented transition projection; compiler and runtime tests own
new-only diagnostics, repair, reachability, dependency, and fixed-point semantics.

For every classification change:

1. locate the concept in `index.md`
2. edit only its canonical hand-authored owner
3. add or update a focused mutation test
4. register any new validator, consumer, migration, message, or test path
5. regenerate the classification index
6. run `npm run verify`
