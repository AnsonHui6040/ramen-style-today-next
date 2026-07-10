# Legacy Migration Baseline

## Authoritative source

- Repository: [`AnsonHui6040/ramen-style-today`](https://github.com/AnsonHui6040/ramen-style-today)
- Baseline commit: `eebf00b7ddfbbe6f01ff598e57f1e17197068a37` (`V3-UP`)
- Local baseline: `/Users/ansonhui/Documents/GitHub/ramen-style-today`
- Baseline date: 2026-07-11
- Production status: remains authoritative until an explicitly approved cutover
- Node.js: `v26.0.0`
- npm: `11.12.1`
- `package-lock.json` SHA-256: `be7ff42d1012d310916d38c082f63f8b5263981c6bd2ded2ff0f6dabe7fc29d2`

## Verified baseline

The baseline worktree was clean at `eebf00b`. The following checks passed on 2026-07-11:

| Check | Result |
| --- | --- |
| `npm test` | 10 test files, 63 tests passed |
| `npm run lint` | passed |
| `npm run build` | TypeScript and Vite production build passed |

## Behavioral inventory

| Area | Baseline inventory |
| --- | --- |
| Questionnaire | 8 adaptive questions |
| Display taxonomy | 18 display styles |
| Scoring taxonomy | 54 core types |
| Noodle taxonomy | 270 compiled-looking noodle variants stored manually |
| Scoring | fixed exact / adjacent / partial / miss ratios, bonus and penalty adjustments |
| Results | Top 3 primary-family results, alternatives, confidence and blocked lead |
| Persistence | unversioned `ramen-style-today.state.v1` payload with inline legacy migration |
| Catalog | 5 stores and 9 menu items |
| Finder | separate Finder profile taxonomy bridged inside the React map component |
| Locales | zh-TW, English and Japanese |

## Known architecture risks to remove

1. Classification contracts are split across TypeScript unions, three JSON datasets, question restrictions, scoring constants, translations, persistence repair, catalog and Finder mappings.
2. `src/data/styles.json` contains 8,489 lines. For all 18 styles, the three core definitions repeat rules, bonuses, conflicts and five noodle variants; only the body rule meaningfully varies by intensity.
3. `src/App.tsx` uses question array positions to infer the first two branch questions and the final submit question.
4. `src/domain/schema.ts` combines unrelated question, style, catalog, persistence and completion validation responsibilities.
5. JSON is cast to domain types before incomplete handwritten runtime validation.
6. Score policy constants and validation budgets are distributed across files and are not derived from one policy.
7. Score explanations identify bonuses and penalties through display strings rather than stable rule IDs.
8. localStorage has no payload schema version or explicit migration chain and can restore an unfinishable question state.
9. Scoring and catalog tie order can depend on source JSON order.
10. Documentation has no tested concept-to-source-to-consumer-to-test index, while tracked historical outputs create search noise.

## Parity contract

Structural improvements may add metadata and diagnostics, but a parity-preserving migration must keep these legacy outputs unchanged for the same completed answers:

- primary and alternative display-style order
- chosen core type and noodle subtype
- base question points, bonus points and penalty points
- final score and confidence
- low-confidence flag
- exclusion blocking and blocked lead
- catalog recommendations and their visible ordering until a later approved catalog redesign
- localized user-visible questionnaire and result meaning

The new engine may replace display-string identity with stable IDs, provided the web adapter renders equivalent user-facing text.

## Migration provenance rule

Every implementation batch must record:

| Field | Required evidence |
| --- | --- |
| Legacy source | exact old repository path and `eebf00b` |
| New owner | exact new package or app path |
| Transformation | copied, normalized, compacted, generated, or intentionally omitted |
| Behavior | parity-preserved or separately approved change |
| Verification | exact commands, fixtures, manifest diff and parity result |

Historical `outputs`, `dist`, screenshots, presentation artifacts and unused starter assets are intentionally outside migration scope.

## Frozen parity fixture contract

Batch 1 will establish the versioned fixture layout below before production behavior is migrated:

```text
tools/parity/fixtures/legacy-v1/
├── manifest.json
├── inputs.json
└── outputs.json
```

`manifest.json` records fixture schema version, generator version, full legacy commit, Node/npm versions, legacy lockfile checksum, generation time and the ordered case IDs. Inputs and outputs are generated artifacts and must not be edited by hand.

The implementation must provide this extraction command:

```bash
npm run parity:extract -- \
  --legacy-root /Users/ansonhui/Documents/GitHub/ramen-style-today \
  --commit eebf00b7ddfbbe6f01ff598e57f1e17197068a37
```

The extractor must refuse a dirty legacy worktree, a mismatched commit or a mismatched lockfile checksum. CI consumes the committed fixtures and never depends on the neighboring legacy checkout.
