# Classification Change Map

Use this page before changing classification behavior. The generated
[`index.md`](index.md) identifies each concept's current source, validators,
consumers, messages, migrations, and tests; never edit that index or
`manifest.json` by hand.

| Change | Canonical owner in Batch 1 | Required checks |
| --- | --- | --- |
| Atomic ID or source shape | `packages/classification-core/src/compiler/source-schema.ts` | parser tests, compiler tests, index regeneration |
| Diagnostic identity | `packages/classification-core/src/contracts/diagnostic-codes.ts` | mutation test asserting code and JSON Pointer |
| Semantic reference or policy invariant | `packages/classification-core/src/compiler/compile.ts` | compiler mutation test and `classification:validate` |
| Concept-to-file relationship | `tools/documentation/relations.ts` | documentation tests and `classification:index:check` |
| Migration provenance | `docs/migration/ledger.json` | ledger tests and `migration:ledger:check` |

Batch 1 contains synthetic definitions only. Production question changes begin
in Batch 2A; persistence begins in Batch 2B; style and scoring changes begin in
Batch 3. When those owners exist, add their exact paths to the generated index
relations in the same commit as the change.

For every classification change:

1. locate the concept in `index.md`
2. edit only its canonical hand-authored owner
3. add or update a focused mutation test
4. register any new validator, consumer, migration, message, or test path
5. regenerate the classification index
6. run `npm run verify`
