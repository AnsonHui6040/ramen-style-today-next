# Repository Guidelines

## Purpose

This monorepo replaces the low-level architecture of `ramen-style-today` through staged, parity-verified migration. The legacy repository at commit `eebf00b` remains the behavioral baseline until cutover.

## Current phase

Batch 0 is approved and contains design and migration-baseline documents only. Batch 1 has a reviewed plan at `docs/superpowers/plans/2026-07-11-batch-1-compiler-foundation.md` but has not created repository tooling or a synthetic classification index yet; until it does, use the approved design and `docs/migration/baseline.md` for navigation. Batch 2A replaces that synthetic inventory with migrated question concepts. Do not invent commands, packages, generated artifacts, or source paths that have not been created yet.

## Source-of-truth hierarchy

For architecture and process conflicts, a later accepted Architecture Decision Record overrides the approved architecture specification, which overrides an approved batch implementation plan. For classification content, hand-authored definitions under `packages/classification-core/src/definitions/` are canonical within those approved boundaries. Compiled models, manifests, indexes, and reports are derived artifacts and must not be edited by hand. UI code, catalog data, map data, and tests are consumers; they must not redefine classification IDs or policies.

A document marked draft or review-required is not authoritative implementation permission. Do not start an implementation batch until its written design or plan has the required approval.

## Boundary rules

- `packages/classification-core` must remain independent of React, DOM APIs, browser storage, catalog data, maps, and localized UI rendering.
- `apps/web` may import only the public API from `@ramen-style/classification-core`.
- Browser persistence adapters and the app-level envelope live in `apps/web`; the versioned classification payload, migrations, repair logic, and validation live in the core package.
- Catalog and Finder mappings are adapters. They may reference stable classification IDs but cannot affect classification scoring.
- Question order, branching, score ratios, caps, confidence rules, and tie-breakers must be explicit data or policy—not array-position assumptions or scattered constants.

## Classification change workflow

Before changing a question, option, style, rule, exclusion, score policy, or stable ID:

1. Find the concept in the generated classification index and change map once those artifacts exist; during Batch 0, use the design and legacy baseline.
2. Edit the canonical definition or policy only.
3. Add a versioned migration when persisted answer meaning or shape changes.
4. Update contract, semantic, parity, and user-visible tests as applicable.
5. Regenerate the manifest and documentation index.
6. Run the complete repository verification gate before handoff.

Stable IDs are public contracts. Never rename or reuse an ID without an explicit migration and an Architecture Decision Record. Visible copy must use stable message IDs; do not use full translated sentences as identity keys and do not expose internal IDs in the UI.

## Diagnostics and documentation

- Validators must accept untrusted input as `unknown`; do not cast JSON directly into domain types before validation.
- Diagnostics must include a stable code, severity, entity ID when available, source path, data path, and actionable message.
- Validation should aggregate independent errors rather than stop at the first failure.
- Every conceptual change must update or regenerate its documentation index entry in the same commit.
- `AGENTS.md` is a tracked repository contract and must never be added to `.gitignore`.

## Migration discipline

- Do not bulk-copy the old repository.
- Do not copy legacy `outputs`, generated reports, build output, or obsolete assets.
- Each migrated file or dataset must be recorded in the migration ledger with its legacy path, baseline commit, new owner, transformation, and parity evidence.
- A migration batch may change structure but must preserve approved user-visible behavior unless its design explicitly authorizes a behavior change.
- The old production repository remains untouched until a separately approved cutover.

## Code and tests

Use TypeScript ES modules, 2-space indentation, single quotes, and no semicolons. Keep files focused around one responsibility. Prefer pure functions and immutable return values in the core package.

The implementation must provide root commands for formatting or linting, tests, build, classification validation, documentation drift checking, and legacy parity. Do not claim a batch complete unless every command required by that batch passes and the evidence is recorded.
