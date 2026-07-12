# Batch 1 Compiler Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independently testable monorepo foundation with stable classification contracts, structured diagnostics, a synthetic compiler shell, generated Codex indexes, migration-ledger checks, and CI—without migrating production questionnaire or scoring data.

**Architecture:** The root npm workspace contains one browser-independent `@ramen-style/classification-core` package plus repository tools. Runtime consumers use the package root entrypoint, while validation and documentation tools use the explicit `./compiler` entrypoint. Batch 1 compiles a clearly marked synthetic model so infrastructure can be proven before legacy production definitions enter in Batch 2A.

**Tech Stack:** Node.js 24 LTS in CI, npm workspaces, TypeScript 6.0.3, Zod 4.4.3, Vitest 4.1.10, ESLint 10.6.0, typescript-eslint 8.63.0, tsx 4.23.0, GitHub Actions.

**Status:** Ready for execution after architecture approval and independent plan review.

## Global Constraints

- Do not migrate production questions, styles, score rules, catalog data, Finder data, localized product copy, React code, or legacy output artifacts in Batch 1.
- `packages/classification-core` must not depend on React, DOM APIs, browser storage, catalog data, maps, or localized rendering.
- `apps/web` does not exist in this batch.
- Root tooling may import `@ramen-style/classification-core/compiler`; future web code may import only `@ramen-style/classification-core`.
- Atomic stable IDs use lowercase kebab case and are identities; generated composite concept IDs use `${parentId}:${childId}`. Display sentences are not identity keys.
- Validators accept unknown input and emit aggregated diagnostics with registered codes, repository-relative POSIX source paths or `runtime://` sources, and RFC 6901 JSON Pointers.
- Generated classification files are tracked and must never be edited by hand.
- The legacy repository remains untouched at `eebf00b7ddfbbe6f01ff598e57f1e17197068a37`.
- Use TypeScript ES modules, 2-space indentation, single quotes, and no semicolons.
- Tasks 1–6 follow red-green TDD and end with focused commits. Task 7 is an acceptance task: it first proves the aggregate command is absent, then verifies the already-tested behavior locally and in GitHub Actions.

---

## Planned file map

```text
.github/workflows/ci.yml                         repository verification on Node 24
.nvmrc                                          local Node LTS hint
package.json / package-lock.json                root workspace and exact dependencies
tsconfig.base.json / tsconfig.json              shared strict TypeScript settings
eslint.config.js / vitest.config.ts             repository lint and test configuration
README.md / AGENTS.md                           phase boundary and repository workflow
packages/classification-core/
  package.json / tsconfig.json                  private source-exported workspace package
  src/contracts/diagnostic-codes.ts             registered diagnostic identities
  src/contracts/diagnostic.ts                   diagnostic types and path validation
  src/contracts/source-path.ts                  shared stable source-path predicate
  src/contracts/ids.ts                          stable ID schema
  src/contracts/model.ts                        immutable compiled-model contracts
  src/compiler/collector.ts                     aggregated sorted diagnostics
  src/compiler/source-schema.ts                 Zod source contracts
  src/compiler/parse.ts                         Zod issue conversion
  src/compiler/stable-json.ts                    deterministic hashing input
  src/compiler/compile.ts                        semantic checks and model compilation
  src/compiler/index.ts                          tools-only public entrypoint
  src/definitions/synthetic.ts                   non-production proof definition
  src/index.ts / src/index.test.ts               runtime public entrypoint and smoke test
  src/compiler/*.test.ts                         diagnostic, parser, and compiler mutation tests
tools/
  tsconfig.json                                  tool typecheck scope
  index.ts                                       empty Batch 1 tool-project marker
  validation/validate-classification.ts          compiler CLI
  documentation/relations.ts                     typed semantic relation registry
  documentation/scan-imports.ts                  core consumer discovery
  documentation/scan-imports.test.ts             scanner boundary test
  documentation/build-index.ts                   manifest and Markdown renderer
  documentation/build-index.test.ts              bidirectional relation and determinism tests
  documentation/generate-classification-index.ts write/check CLI
  migration/ledger-schema.ts                     ledger Zod contract
  migration/render-ledger.ts                     deterministic ledger Markdown
  migration/render-ledger.test.ts                schema and rendering tests
  migration/ledger-check.ts                      pure repository ownership checks
  migration/ledger-check.test.ts                 missing-owner, scope, and drift tests
  migration/check-ledger.ts                      validation/check CLI
docs/classification/change-map.md                hand-authored change workflow
docs/classification/index.md                     generated synthetic navigation
docs/classification/manifest.json                generated machine inventory
docs/migration/ledger.json                       canonical structured migration evidence
docs/migration/ledger.md                         generated migration summary
```

---

## Execution prerequisite

Run implementation from a clean, current `main`, then create the dedicated
branch. If execution uses an isolated worktree, use
`superpowers:using-git-worktrees` to create the same branch instead of running
`git switch -c` in the primary checkout.

```bash
git switch main
git pull --ff-only origin main
git status --porcelain
git switch -c codex/batch-1-compiler-foundation
test "$(git branch --show-current)" = "codex/batch-1-compiler-foundation"
```

Expected: the pull is fast-forward-only, status is empty before branch creation,
and the branch assertion exits 0. Never execute Tasks 1–7 directly on `main`.

---

### Task 1: Establish the strict npm workspace

**Files:**
- Create: `.nvmrc`
- Create: `package.json`
- Create: `package-lock.json` via `npm install`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `vitest.config.ts`
- Create: `tools/tsconfig.json`
- Create: `tools/index.ts`
- Create: `packages/classification-core/package.json`
- Create: `packages/classification-core/tsconfig.json`
- Create: `packages/classification-core/src/index.test.ts`
- Create: `packages/classification-core/src/index.ts`

**Interfaces:**
- Consumes: Node.js `>=24`, npm workspace resolution.
- Produces: workspace package `@ramen-style/classification-core`; root commands `lint`, `test`, `typecheck`, and `build`.

- [ ] **Step 1: Add exact workspace configuration**

Create `.nvmrc`:

```text
24.18.0
```

Create `package.json`:

```json
{
  "name": "ramen-style-today-next",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "lint": "eslint . --max-warnings=0",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p packages/classification-core/tsconfig.json && tsc --noEmit -p tools/tsconfig.json",
    "build": "tsc -b packages/classification-core"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "24.13.3",
    "eslint": "10.6.0",
    "tsx": "4.23.0",
    "typescript": "6.0.3",
    "typescript-eslint": "8.63.0",
    "vitest": "4.1.10",
    "zod": "4.4.3"
  }
}
```

Create `packages/classification-core/package.json`:

```json
{
  "name": "@ramen-style/classification-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./compiler": "./src/compiler/index.ts"
  },
  "dependencies": {
    "zod": "4.4.3"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./packages/classification-core" }
  ]
}
```

Create `packages/classification-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

Create `tools/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["**/*.ts"]
}
```

Create `tools/index.ts` so the strict tools project has an input before later
tasks add CLIs:

```ts
export {}
```

Create `eslint.config.js`:

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@ramen-style/classification-core/compiler',
          message: 'apps may use only the classification-core runtime entrypoint',
        }],
        patterns: [{
          group: ['**/packages/classification-core/src/**'],
          message: 'cross-package source imports are forbidden',
        }],
      }],
    },
  },
  {
    files: ['tools/**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/packages/classification-core/src/**'],
          message: 'tools must use the classification-core compiler entrypoint',
        }],
      }],
    },
  },
)
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Install exact dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created, workspace package is linked, and npm exits 0.

- [ ] **Step 3: Write the failing workspace smoke test**

Create `packages/classification-core/src/index.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

import { CLASSIFICATION_CORE_PACKAGE } from './index.js'

describe('classification-core package', () => {
  test('exposes the stable runtime package identity', () => {
    expect(CLASSIFICATION_CORE_PACKAGE).toBe('@ramen-style/classification-core')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run:

```bash
npx vitest run packages/classification-core/src/index.test.ts
```

Expected: FAIL because `src/index.ts` does not exist.

- [ ] **Step 5: Add the minimal runtime entrypoint**

Create `packages/classification-core/src/index.ts`:

```ts
export const CLASSIFICATION_CORE_PACKAGE = '@ramen-style/classification-core'
```

- [ ] **Step 6: Verify the workspace**

Run:

```bash
npx vitest run packages/classification-core/src/index.test.ts
npm run lint
npm run typecheck
npm run build
```

Expected: one test passes and all commands exit 0.

- [ ] **Step 7: Commit the workspace foundation**

```bash
git add .nvmrc package.json package-lock.json tsconfig.base.json tsconfig.json eslint.config.js vitest.config.ts tools/tsconfig.json tools/index.ts packages/classification-core
git commit -m "Create Batch 1 workspace"
```

---

### Task 2: Add registered structured diagnostics

**Files:**
- Create: `packages/classification-core/src/contracts/diagnostic-codes.ts`
- Create: `packages/classification-core/src/contracts/diagnostic.ts`
- Create: `packages/classification-core/src/contracts/source-path.ts`
- Create: `packages/classification-core/src/compiler/collector.ts`
- Create: `packages/classification-core/src/compiler/collector.test.ts`
- Modify: `packages/classification-core/src/index.ts`

**Interfaces:**
- Produces: `DiagnosticCode`, `Diagnostic`, `makeDiagnostic(input)`, `compareDiagnostics(left, right)`, and `DiagnosticCollector`.
- Invariant: file sources are repository-relative POSIX paths or `runtime://` URIs; paths are RFC 6901 JSON Pointers.

- [ ] **Step 1: Write failing diagnostic tests**

Create `packages/classification-core/src/compiler/collector.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

import { makeDiagnostic } from '../contracts/diagnostic.js'
import { DiagnosticCollector } from './collector.js'

describe('structured diagnostics', () => {
  test('aggregates and deterministically sorts independent findings', () => {
    const collector = new DiagnosticCollector()
    collector.error({
      code: 'REFERENCE_UNKNOWN',
      sourceFile: 'packages/core/b.ts',
      path: '/questions/1/dependsOn/0',
      message: 'Unknown question',
      entityId: 'demo-second',
    })
    collector.warning({
      code: 'STRUCTURE_INVALID',
      sourceFile: 'packages/core/a.ts',
      path: '/questions/0/id',
      message: 'Invalid ID',
    })

    expect(collector.toArray().map((item) => item.code)).toEqual([
      'STRUCTURE_INVALID',
      'REFERENCE_UNKNOWN',
    ])
    expect(collector.hasErrors()).toBe(true)
  })

  test('rejects unstable machine paths and dot paths', () => {
    expect(() => makeDiagnostic({
      severity: 'error',
      code: 'STRUCTURE_INVALID',
      sourceFile: '/Users/name/source.ts',
      path: 'questions.0.id',
      message: 'Bad location',
    })).toThrow('diagnostic sourceFile')
    expect(() => makeDiagnostic({
      severity: 'error',
      code: 'STRUCTURE_INVALID',
      sourceFile: 'packages/core/source.ts',
      path: 'questions.0.id',
      message: 'Bad data path',
    })).toThrow('diagnostic path')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run packages/classification-core/src/compiler/collector.test.ts
```

Expected: FAIL because diagnostic modules do not exist.

- [ ] **Step 3: Implement the registered contracts**

Create `packages/classification-core/src/contracts/diagnostic-codes.ts`:

```ts
export const diagnosticCodes = [
  'STRUCTURE_INVALID',
  'QUESTION_DUPLICATE_ID',
  'OPTION_DUPLICATE_ID',
  'STYLE_DUPLICATE_ID',
  'REFERENCE_UNKNOWN',
  'FLOW_CYCLE',
  'POLICY_WEIGHT_TOTAL',
  'CONCEPT_DUPLICATE_KEY',
  'DOC_RELATION_INVALID',
  'DOC_INDEX_DRIFT',
  'LEDGER_INVALID',
] as const

export type DiagnosticCode = (typeof diagnosticCodes)[number]
```

Create `packages/classification-core/src/contracts/source-path.ts`:

```ts
export function isRepositorySource(value: string) {
  if (!value || value.startsWith('/') || value.includes('\\') || /^[A-Za-z]:/.test(value)) {
    return false
  }
  return value.split('/').every((segment) => segment !== '.' && segment !== '..' && segment !== '')
}

export function isStableSource(value: string) {
  if (value.startsWith('runtime://')) {
    const identifier = value.slice('runtime://'.length)
    return identifier.length > 0 && !identifier.includes('\\')
  }
  return isRepositorySource(value)
}
```

Create `packages/classification-core/src/contracts/diagnostic.ts`:

```ts
import type { DiagnosticCode } from './diagnostic-codes.js'
import { isStableSource } from './source-path.js'

export type DiagnosticSeverity = 'error' | 'warning'

export interface DiagnosticReference {
  sourceFile: string
  path: string
  entityId?: string
}

export interface Diagnostic {
  severity: DiagnosticSeverity
  code: DiagnosticCode
  sourceFile: string
  path: string
  entityId?: string
  message: string
  expected?: unknown
  received?: unknown
  related?: readonly DiagnosticReference[]
}

function isJsonPointer(value: string) {
  return /^(?:\/(?:[^~/]|~0|~1)*)*$/.test(value)
}

export function makeDiagnostic(input: Diagnostic): Diagnostic {
  if (!isStableSource(input.sourceFile)) {
    throw new Error('diagnostic sourceFile must be repository-relative POSIX or runtime://')
  }
  if (!isJsonPointer(input.path)) {
    throw new Error('diagnostic path must be an RFC 6901 JSON Pointer')
  }
  for (const related of input.related ?? []) {
    if (!isStableSource(related.sourceFile) || !isJsonPointer(related.path)) {
      throw new Error('diagnostic related references must use stable sources and JSON Pointers')
    }
  }
  return Object.freeze({ ...input })
}

export function compareDiagnostics(left: Diagnostic, right: Diagnostic) {
  return left.sourceFile.localeCompare(right.sourceFile)
    || left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
}
```

Create `packages/classification-core/src/compiler/collector.ts`:

```ts
import {
  compareDiagnostics,
  makeDiagnostic,
  type Diagnostic,
} from '../contracts/diagnostic.js'

type DiagnosticBody = Omit<Diagnostic, 'severity'>

export class DiagnosticCollector {
  readonly #items: Diagnostic[] = []

  error(input: DiagnosticBody) {
    this.#items.push(makeDiagnostic({ ...input, severity: 'error' }))
  }

  warning(input: DiagnosticBody) {
    this.#items.push(makeDiagnostic({ ...input, severity: 'warning' }))
  }

  hasErrors() {
    return this.#items.some((item) => item.severity === 'error')
  }

  toArray(): readonly Diagnostic[] {
    return Object.freeze([...this.#items].sort(compareDiagnostics))
  }
}
```

Update `packages/classification-core/src/index.ts`:

```ts
export const CLASSIFICATION_CORE_PACKAGE = '@ramen-style/classification-core'

export type {
  Diagnostic,
  DiagnosticReference,
  DiagnosticSeverity,
} from './contracts/diagnostic.js'
export type { DiagnosticCode } from './contracts/diagnostic-codes.js'
```

- [ ] **Step 4: Verify diagnostics**

Run:

```bash
npx vitest run packages/classification-core/src/compiler/collector.test.ts
npm run lint
npm run typecheck
```

Expected: two diagnostic tests pass and checks exit 0.

- [ ] **Step 5: Commit diagnostics**

```bash
git add packages/classification-core/src
git commit -m "Add structured compiler diagnostics"
```

---

### Task 3: Parse typed definition bundles from unknown input

**Files:**
- Create: `packages/classification-core/src/contracts/ids.ts`
- Create: `packages/classification-core/src/compiler/source-schema.ts`
- Create: `packages/classification-core/src/compiler/parse.ts`
- Create: `packages/classification-core/src/compiler/parse.test.ts`

**Interfaces:**
- Produces: `DefinitionBundleSource`, `definitionBundleSchema`, and `parseDefinitionBundle(input, sourceFile)`.
- Consumes: `DiagnosticCollector` and code `STRUCTURE_INVALID`.

- [ ] **Step 1: Write failing structural parsing tests**

Create `packages/classification-core/src/compiler/parse.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

import { parseDefinitionBundle } from './parse.js'

describe('definition bundle parsing', () => {
  test('returns parsed data for a structurally valid bundle', () => {
    const result = parseDefinitionBundle({
      mode: 'synthetic',
      modelVersion: 'batch1.0.0',
      questions: [],
      styles: [],
      policy: {
        sourceFile: 'packages/classification-core/src/definitions/synthetic.ts',
        exactRatio: 1,
        adjacentRatio: 0.6,
        partialRatio: 0.4,
        bonusCap: 5,
        penaltyCap: 15,
        confidenceThreshold: 72,
        tieGap: 5,
      },
    }, 'packages/classification-core/src/definitions/synthetic.ts')

    expect(result.definition?.modelVersion).toBe('batch1.0.0')
    expect(result.diagnostics).toEqual([])
  })

  test('aggregates Zod issues as JSON Pointer diagnostics', () => {
    const result = parseDefinitionBundle({
      mode: 'synthetic',
      modelVersion: 'Bad Version',
      questions: [{ id: 'Bad ID' }],
      styles: [],
      policy: {},
    }, 'packages/classification-core/src/definitions/synthetic.ts')

    expect(result.definition).toBeUndefined()
    expect(result.diagnostics.length).toBeGreaterThan(1)
    expect(result.diagnostics.every((item) => item.code === 'STRUCTURE_INVALID')).toBe(true)
    expect(result.diagnostics.some((item) => item.path === '/modelVersion')).toBe(true)
  })

  test('reports unstable definition and caller source paths without throwing', () => {
    const invalidDefinition = {
      mode: 'synthetic',
      modelVersion: 'batch1.0.0',
      questions: [],
      styles: [],
      policy: {
        sourceFile: 'C:source.ts',
        exactRatio: 1,
        adjacentRatio: 0.6,
        partialRatio: 0.4,
        bonusCap: 5,
        penaltyCap: 15,
        confidenceThreshold: 72,
        tieGap: 5,
      },
    }
    expect(parseDefinitionBundle(invalidDefinition, 'packages/source.ts').diagnostics).not.toEqual([])
    expect(parseDefinitionBundle(invalidDefinition, '/absolute/bundle.ts').diagnostics[0]).toMatchObject({
      code: 'STRUCTURE_INVALID',
      sourceFile: 'runtime://parse-definition-bundle',
      path: '',
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run packages/classification-core/src/compiler/parse.test.ts
```

Expected: FAIL because the parsing modules do not exist.

- [ ] **Step 3: Implement exact source schemas**

Create `packages/classification-core/src/contracts/ids.ts`:

```ts
import { z } from 'zod'

export const stableIdSchema = z.string().regex(
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  'stable IDs must use lowercase kebab case',
)

export const versionSchema = z.string().regex(
  /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
  'versions must be stable lowercase tokens',
)
```

Create `packages/classification-core/src/compiler/source-schema.ts`:

```ts
import { z } from 'zod'

import { stableIdSchema, versionSchema } from '../contracts/ids.js'
import { isRepositorySource } from '../contracts/source-path.js'

const sourceFileSchema = z.string().min(1).refine(
  isRepositorySource,
  'definition sourceFile must be a repository-relative POSIX path',
)

export const optionSourceSchema = z.strictObject({
  id: stableIdSchema,
  messageId: stableIdSchema,
})

export const questionSourceSchema = z.strictObject({
  sourceFile: sourceFileSchema,
  id: stableIdSchema,
  messageId: stableIdSchema,
  order: z.number().int().nonnegative(),
  selectionType: z.enum(['single', 'multiple']),
  minSelections: z.number().int().nonnegative(),
  maxSelections: z.number().int().positive(),
  weight: z.number().finite().nonnegative(),
  dependsOn: z.array(stableIdSchema),
  options: z.array(optionSourceSchema).min(1),
})

export const styleSourceSchema = z.strictObject({
  sourceFile: sourceFileSchema,
  id: stableIdSchema,
  messageId: stableIdSchema,
  familyOptionId: stableIdSchema,
  priority: z.number().int().nonnegative(),
  intensities: z.array(stableIdSchema).min(1),
  noodles: z.array(stableIdSchema).min(1),
})

export const policySourceSchema = z.strictObject({
  sourceFile: sourceFileSchema,
  exactRatio: z.number().finite().min(0).max(1),
  adjacentRatio: z.number().finite().min(0).max(1),
  partialRatio: z.number().finite().min(0).max(1),
  bonusCap: z.number().finite().nonnegative(),
  penaltyCap: z.number().finite().nonnegative(),
  confidenceThreshold: z.number().finite().min(0).max(100),
  tieGap: z.number().finite().nonnegative(),
})

export const definitionBundleSchema = z.strictObject({
  mode: z.enum(['synthetic', 'production']),
  modelVersion: versionSchema,
  questions: z.array(questionSourceSchema),
  styles: z.array(styleSourceSchema),
  policy: policySourceSchema,
})

export type DefinitionBundleSource = z.infer<typeof definitionBundleSchema>
```

Create `packages/classification-core/src/compiler/parse.ts`:

```ts
import { DiagnosticCollector } from './collector.js'
import { isStableSource } from '../contracts/source-path.js'
import {
  definitionBundleSchema,
  type DefinitionBundleSource,
} from './source-schema.js'

function escapePointerToken(value: PropertyKey) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1')
}

function toJsonPointer(path: readonly PropertyKey[]) {
  return path.length ? `/${path.map(escapePointerToken).join('/')}` : ''
}

export function parseDefinitionBundle(input: unknown, sourceFile: string): {
  definition?: DefinitionBundleSource
  diagnostics: ReturnType<DiagnosticCollector['toArray']>
} {
  if (!isStableSource(sourceFile)) {
    const collector = new DiagnosticCollector()
    collector.error({
      code: 'STRUCTURE_INVALID',
      sourceFile: 'runtime://parse-definition-bundle',
      path: '',
      message: 'Invalid parser sourceFile; expected repository-relative POSIX or runtime://',
    })
    return { diagnostics: collector.toArray() }
  }
  const parsed = definitionBundleSchema.safeParse(input)
  if (parsed.success) return { definition: parsed.data, diagnostics: [] }

  const collector = new DiagnosticCollector()
  for (const issue of parsed.error.issues) {
    collector.error({
      code: 'STRUCTURE_INVALID',
      sourceFile,
      path: toJsonPointer(issue.path),
      message: issue.message,
    })
  }
  return { diagnostics: collector.toArray() }
}
```

- [ ] **Step 4: Verify structural parsing**

Run:

```bash
npx vitest run packages/classification-core/src/compiler/parse.test.ts
npm run lint
npm run typecheck
```

Expected: three parsing tests pass and checks exit 0.

- [ ] **Step 5: Commit source contracts**

```bash
git add packages/classification-core/src/contracts packages/classification-core/src/compiler
git commit -m "Define compiler source contracts"
```

---

### Task 4: Compile a deterministic immutable synthetic model

**Files:**
- Create: `packages/classification-core/src/contracts/model.ts`
- Create: `packages/classification-core/src/compiler/stable-json.ts`
- Create: `packages/classification-core/src/compiler/compile.ts`
- Create: `packages/classification-core/src/compiler/compile.test.ts`
- Create: `packages/classification-core/src/compiler/index.ts`
- Create: `packages/classification-core/src/definitions/synthetic.ts`
- Create: `tools/validation/validate-classification.ts`
- Modify: `packages/classification-core/tsconfig.json`
- Modify: `packages/classification-core/src/index.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `compileClassification(input, sourceFile): CompileResult`, immutable `ClassificationModel`, and CLI `npm run classification:validate`.
- `CompileResult` is a discriminated union with `ok`, `model`, and sorted diagnostics.

- [ ] **Step 1: Write failing compiler tests**

Create `packages/classification-core/src/compiler/compile.test.ts`:

```ts
import { describe, expect, expectTypeOf, test } from 'vitest'

import type { ClassificationModel } from '../contracts/model.js'
import { syntheticDefinition } from '../definitions/synthetic.js'
import { compileClassification } from './compile.js'

const sourceFile = 'packages/classification-core/src/definitions/synthetic.ts'

describe('classification compiler shell', () => {
  test('compiles deterministic frozen inventory', () => {
    const first = compileClassification(syntheticDefinition, sourceFile)
    const second = compileClassification(syntheticDefinition, sourceFile)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.model.dataVersion).toBe(second.model.dataVersion)
    expect(first.model.inventory.map((item) => item.key)).toContain('style/demo-shoyu')
    expect(Object.isFrozen(first.model)).toBe(true)
    expect(Object.isFrozen(first.model.inventory)).toBe(true)
    expect(Object.isFrozen(first.model.questions[0]!.options)).toBe(true)
    expect(Object.isFrozen(first.model.policy)).toBe(true)
    expectTypeOf<ClassificationModel['questions']>().not.toMatchTypeOf<unknown[]>()
  })

  test('rejects unknown dependencies and a flow cycle together', () => {
    const invalid = structuredClone(syntheticDefinition)
    invalid.questions[0]?.dependsOn.push('missing-question')
    invalid.questions[1]?.dependsOn.push('demo-form')
    invalid.questions[0]?.dependsOn.push('demo-archetype')

    const result = compileClassification(invalid, sourceFile)

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['REFERENCE_UNKNOWN', 'FLOW_CYCLE']),
    )
  })

  test('rejects duplicate concept keys across the complete inventory', () => {
    const invalid = structuredClone(syntheticDefinition)
    invalid.questions[1]!.options[0]!.id = 'demo-soup'
    invalid.styles[0]!.intensities.push('standard')

    const result = compileClassification(invalid, sourceFile)

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((item) => item.code)).toContain('CONCEPT_DUPLICATE_KEY')
  })

  test('reports duplicate identities and invalid policy weight totals at stable paths', () => {
    const duplicateQuestion = structuredClone(syntheticDefinition)
    duplicateQuestion.questions.push({ ...duplicateQuestion.questions[0]!, order: 2 })
    expect(compileClassification(duplicateQuestion, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'QUESTION_DUPLICATE_ID', path: '/questions' }),
    )

    const duplicateOption = structuredClone(syntheticDefinition)
    duplicateOption.questions[1]!.options[0]!.id = 'demo-soup'
    expect(compileClassification(duplicateOption, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'OPTION_DUPLICATE_ID', path: '/questions' }),
    )

    const duplicateStyle = structuredClone(syntheticDefinition)
    duplicateStyle.styles.push(structuredClone(duplicateStyle.styles[0]!))
    expect(compileClassification(duplicateStyle, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'STYLE_DUPLICATE_ID', path: '/styles' }),
    )

    const invalidWeight = structuredClone(syntheticDefinition)
    invalidWeight.questions[0]!.weight = 40
    expect(compileClassification(invalidWeight, sourceFile).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'POLICY_WEIGHT_TOTAL', path: '/questions' }),
    )
  })
})
```

- [ ] **Step 2: Run compiler tests to verify they fail**

Run:

```bash
npx vitest run packages/classification-core/src/compiler/compile.test.ts
```

Expected: FAIL because compiler and synthetic definitions do not exist.

- [ ] **Step 3: Add compiled model contracts and stable JSON**

Update `packages/classification-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/classification-core/src/contracts/model.ts`:

```ts
import type { DefinitionBundleSource } from '../compiler/source-schema.js'

export type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T

export type ConceptKind = 'question' | 'option' | 'style' | 'intensity' | 'noodle' | 'policy'
export type ConceptKey = `${ConceptKind}/${string}`

export interface ConceptRecord {
  readonly key: ConceptKey
  readonly kind: ConceptKind
  readonly id: string
  readonly sourceFile: string
  readonly messageIds: readonly string[]
}

export interface ClassificationModel {
  readonly mode: DefinitionBundleSource['mode']
  readonly modelVersion: string
  readonly dataVersion: string
  readonly questions: DeepReadonly<DefinitionBundleSource['questions']>
  readonly styles: DeepReadonly<DefinitionBundleSource['styles']>
  readonly policy: DeepReadonly<DefinitionBundleSource['policy']>
  readonly inventory: readonly ConceptRecord[]
}
```

Create `packages/classification-core/src/compiler/stable-json.ts`:

```ts
export function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

export function stableJson(value: unknown) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`
}
```

- [ ] **Step 4: Implement semantic compilation**

Create `packages/classification-core/src/compiler/compile.ts` with these exact exported behaviors:

```ts
import { createHash } from 'node:crypto'

import type { Diagnostic } from '../contracts/diagnostic.js'
import type {
  ClassificationModel,
  ConceptKey,
  ConceptRecord,
} from '../contracts/model.js'
import { DiagnosticCollector } from './collector.js'
import { parseDefinitionBundle } from './parse.js'
import { stableJson } from './stable-json.js'

export type CompileResult =
  | { ok: true; model: ClassificationModel; diagnostics: readonly Diagnostic[] }
  | { ok: false; diagnostics: readonly Diagnostic[] }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function duplicateValues(values: readonly string[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].sort()
}

function flowHasCycle(questions: readonly { id: string; dependsOn: readonly string[] }[]) {
  const graph = new Map(questions.map((question) => [question.id, question.dependsOn]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const dependency of graph.get(id) ?? []) {
      if (graph.has(dependency) && visit(dependency)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return [...graph.keys()].some(visit)
}

function inventoryKey(kind: ConceptRecord['kind'], id: string): ConceptKey {
  return `${kind}/${id}`
}

function buildInventory(definition: NonNullable<ReturnType<typeof parseDefinitionBundle>['definition']>) {
  const records: ConceptRecord[] = []
  for (const question of definition.questions) {
    records.push({
      key: inventoryKey('question', question.id),
      kind: 'question',
      id: question.id,
      sourceFile: question.sourceFile,
      messageIds: [question.messageId],
    })
    for (const option of question.options) {
      records.push({
        key: inventoryKey('option', option.id),
        kind: 'option',
        id: option.id,
        sourceFile: question.sourceFile,
        messageIds: [option.messageId],
      })
    }
  }
  for (const style of definition.styles) {
    records.push({
      key: inventoryKey('style', style.id),
      kind: 'style',
      id: style.id,
      sourceFile: style.sourceFile,
      messageIds: [style.messageId],
    })
    for (const intensity of style.intensities) records.push({
      key: inventoryKey('intensity', `${style.id}:${intensity}`),
      kind: 'intensity',
      id: `${style.id}:${intensity}`,
      sourceFile: style.sourceFile,
      messageIds: [],
    })
    for (const noodle of style.noodles) records.push({
      key: inventoryKey('noodle', `${style.id}:${noodle}`),
      kind: 'noodle',
      id: `${style.id}:${noodle}`,
      sourceFile: style.sourceFile,
      messageIds: [],
    })
  }
  records.push({
    key: 'policy/default',
    kind: 'policy',
    id: 'default',
    sourceFile: definition.policy.sourceFile,
    messageIds: [],
  })
  return records.sort((left, right) => left.key.localeCompare(right.key))
}

export function compileClassification(input: unknown, sourceFile: string): CompileResult {
  const parsed = parseDefinitionBundle(input, sourceFile)
  if (!parsed.definition) return { ok: false, diagnostics: parsed.diagnostics }

  const definition = parsed.definition
  const collector = new DiagnosticCollector()
  for (const id of duplicateValues(definition.questions.map((item) => item.id))) {
    collector.error({ code: 'QUESTION_DUPLICATE_ID', sourceFile, path: '/questions', entityId: id, message: `Duplicate question ${id}` })
  }
  const optionIds = definition.questions.flatMap((question) => question.options.map((item) => item.id))
  for (const id of duplicateValues(optionIds)) {
    collector.error({ code: 'OPTION_DUPLICATE_ID', sourceFile, path: '/questions', entityId: id, message: `Duplicate option ${id}` })
  }
  for (const id of duplicateValues(definition.styles.map((item) => item.id))) {
    collector.error({ code: 'STYLE_DUPLICATE_ID', sourceFile, path: '/styles', entityId: id, message: `Duplicate style ${id}` })
  }

  const questionIds = new Set(definition.questions.map((item) => item.id))
  const optionIdSet = new Set(optionIds)
  for (const [index, question] of definition.questions.entries()) {
    for (const [dependencyIndex, dependency] of question.dependsOn.entries()) {
      if (!questionIds.has(dependency)) collector.error({
        code: 'REFERENCE_UNKNOWN',
        sourceFile: question.sourceFile,
        path: `/questions/${index}/dependsOn/${dependencyIndex}`,
        entityId: question.id,
        message: `Unknown question dependency ${dependency}`,
      })
    }
  }
  for (const [index, style] of definition.styles.entries()) {
    if (!optionIdSet.has(style.familyOptionId)) collector.error({
      code: 'REFERENCE_UNKNOWN',
      sourceFile: style.sourceFile,
      path: `/styles/${index}/familyOptionId`,
      entityId: style.id,
      message: `Unknown family option ${style.familyOptionId}`,
    })
  }
  if (flowHasCycle(definition.questions)) collector.error({
    code: 'FLOW_CYCLE',
    sourceFile,
    path: '/questions',
    message: 'Question dependency graph contains a cycle',
  })
  const totalWeight = definition.questions.reduce((sum, question) => sum + question.weight, 0)
  if (totalWeight !== 100) collector.error({
    code: 'POLICY_WEIGHT_TOTAL',
    sourceFile: definition.policy.sourceFile,
    path: '/questions',
    message: `Question weights total ${totalWeight}, expected 100`,
    expected: 100,
    received: totalWeight,
  })

  const inventory = buildInventory(definition)
  for (const key of duplicateValues(inventory.map((item) => item.key))) {
    collector.error({
      code: 'CONCEPT_DUPLICATE_KEY',
      sourceFile,
      path: '/inventory',
      entityId: key,
      message: `Duplicate concept key ${key}`,
    })
  }

  const diagnostics = collector.toArray()
  if (collector.hasErrors()) return { ok: false, diagnostics }
  const dataVersion = createHash('sha256').update(stableJson(definition)).digest('hex')
  const model = deepFreeze({
    mode: definition.mode,
    modelVersion: definition.modelVersion,
    dataVersion,
    questions: definition.questions,
    styles: definition.styles,
    policy: definition.policy,
    inventory,
  } satisfies ClassificationModel)
  return { ok: true, model, diagnostics }
}
```

- [ ] **Step 5: Add the synthetic proof definition**

Create `packages/classification-core/src/definitions/synthetic.ts`:

```ts
import type { DefinitionBundleSource } from '../compiler/source-schema.js'

const sourceFile = 'packages/classification-core/src/definitions/synthetic.ts'

export const syntheticDefinition: DefinitionBundleSource = {
  mode: 'synthetic',
  modelVersion: 'batch1.0.0',
  questions: [
    {
      sourceFile,
      id: 'demo-form',
      messageId: 'question-demo-form',
      order: 0,
      selectionType: 'single',
      minSelections: 1,
      maxSelections: 1,
      weight: 50,
      dependsOn: [],
      options: [
        { id: 'demo-soup', messageId: 'option-demo-soup' },
        { id: 'demo-dry', messageId: 'option-demo-dry' },
      ],
    },
    {
      sourceFile,
      id: 'demo-archetype',
      messageId: 'question-demo-archetype',
      order: 1,
      selectionType: 'single',
      minSelections: 1,
      maxSelections: 1,
      weight: 50,
      dependsOn: ['demo-form'],
      options: [
        { id: 'demo-chintan', messageId: 'option-demo-chintan' },
        { id: 'demo-aburasoba', messageId: 'option-demo-aburasoba' },
      ],
    },
  ],
  styles: [
    {
      sourceFile,
      id: 'demo-shoyu',
      messageId: 'style-demo-shoyu',
      familyOptionId: 'demo-soup',
      priority: 0,
      intensities: ['standard'],
      noodles: ['medium-thin-straight'],
    },
  ],
  policy: {
    sourceFile,
    exactRatio: 1,
    adjacentRatio: 0.6,
    partialRatio: 0.4,
    bonusCap: 5,
    penaltyCap: 15,
    confidenceThreshold: 72,
    tieGap: 5,
  },
}
```

Create `packages/classification-core/src/compiler/index.ts`:

```ts
export { compileClassification, type CompileResult } from './compile.js'
export { DiagnosticCollector } from './collector.js'
export { parseDefinitionBundle } from './parse.js'
export { definitionBundleSchema, type DefinitionBundleSource } from './source-schema.js'
export { stableJson } from './stable-json.js'
export { syntheticDefinition } from '../definitions/synthetic.js'
export type {
  ClassificationModel,
  ConceptKey,
  ConceptKind,
  ConceptRecord,
} from '../contracts/model.js'
export type { Diagnostic } from '../contracts/diagnostic.js'
```

Update `packages/classification-core/src/index.ts` to export model contracts:

```ts
export const CLASSIFICATION_CORE_PACKAGE = '@ramen-style/classification-core'

export type {
  Diagnostic,
  DiagnosticReference,
  DiagnosticSeverity,
} from './contracts/diagnostic.js'
export type { DiagnosticCode } from './contracts/diagnostic-codes.js'
export type {
  ClassificationModel,
  ConceptKey,
  ConceptKind,
  ConceptRecord,
} from './contracts/model.js'
```

- [ ] **Step 6: Add the validation CLI and script**

Create `tools/validation/validate-classification.ts`:

```ts
import {
  compileClassification,
  syntheticDefinition,
} from '@ramen-style/classification-core/compiler'

const sourceFile = 'packages/classification-core/src/definitions/synthetic.ts'
const result = compileClassification(syntheticDefinition, sourceFile)

if (!result.ok) {
  console.error(JSON.stringify(result.diagnostics, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({
    mode: result.model.mode,
    modelVersion: result.model.modelVersion,
    dataVersion: result.model.dataVersion,
    conceptCount: result.model.inventory.length,
  }))
}
```

Add this script to root `package.json`:

```json
"classification:validate": "tsx tools/validation/validate-classification.ts"
```

- [ ] **Step 7: Verify compiler behavior**

Run:

```bash
npx vitest run packages/classification-core/src/compiler/compile.test.ts
npm run classification:validate
npm run lint
npm run typecheck
npm run build
```

Expected: four compiler tests pass; CLI prints `"mode":"synthetic"`; all checks exit 0.

- [ ] **Step 8: Commit the compiler shell**

```bash
git add docs/superpowers/plans/2026-07-11-batch-1-compiler-foundation.md package.json packages/classification-core/tsconfig.json packages/classification-core/src tools/validation
git commit -m "Compile synthetic classification model"
```

---

### Task 5: Generate a bidirectionally checked Codex index

**Files:**
- Create: `tools/documentation/relations.ts`
- Create: `tools/documentation/scan-imports.ts`
- Create: `tools/documentation/scan-imports.test.ts`
- Create: `tools/documentation/build-index.ts`
- Create: `tools/documentation/build-index.test.ts`
- Create: `tools/documentation/generate-classification-index.ts`
- Create: `tools/documentation/generate-classification-index.test.ts`
- Create: `docs/classification/change-map.md`
- Create: `docs/classification/index.md` via generator
- Create: `docs/classification/manifest.json` via generator
- Modify: `package.json`

**Interfaces:**
- Produces: typed `DocumentationRelation[]`, `buildDocumentation(model, relations, detectedConsumers, existingPaths)`, `scanCoreConsumers(repoRoot, roots, eligibleFiles)`, and a write/check CLI that validates every owned-directory entry before writing.
- Manifest schema: `{ schemaVersion: 1, synthetic, modelVersion, dataVersion, concepts }`.

- [ ] **Step 1: Write failing index completeness tests**

Create `tools/documentation/build-index.test.ts`:

```ts
import { describe, expect, test } from 'vitest'

import { compileClassification, syntheticDefinition } from '@ramen-style/classification-core/compiler'
import { buildDocumentation } from './build-index.js'
import { documentationRelations } from './relations.js'

const compiled = compileClassification(
  syntheticDefinition,
  'packages/classification-core/src/definitions/synthetic.ts',
)
if (!compiled.ok) throw new Error('synthetic model did not compile')

describe('classification documentation index', () => {
  test('renders deterministic JSON and Markdown for every concept', () => {
    const paths = new Set(documentationRelations.flatMap((item) => [
      item.canonicalSource,
      ...item.validators,
      ...item.consumers,
      ...item.tests,
      ...item.migrations,
    ]))
    const result = buildDocumentation(
      compiled.model,
      documentationRelations,
      new Set(['tools/validation/validate-classification.ts']),
      paths,
    )

    expect(result.diagnostics).toEqual([])
    expect(result.markdown).toContain('Synthetic inventory')
    const manifest = JSON.parse(result.manifest) as { concepts: unknown[] }
    expect(manifest.concepts).toHaveLength(compiled.model.inventory.length)

    const reversed = buildDocumentation(
      { ...compiled.model, inventory: [...compiled.model.inventory].reverse() },
      [...documentationRelations].reverse(),
      new Set(['tools/validation/validate-classification.ts']),
      paths,
    )
    expect(reversed.manifest).toBe(result.manifest)
    expect(reversed.markdown).toBe(result.markdown)
  })

  test('rejects missing relations and an unregistered detected consumer', () => {
    const result = buildDocumentation(
      compiled.model,
      documentationRelations.slice(1),
      new Set(['tools/unregistered.ts']),
      new Set(),
    )
    expect(result.diagnostics.map((item) => item.code)).toContain('DOC_RELATION_INVALID')
    expect(result.diagnostics.some((item) => item.entityId === 'question/demo-form')).toBe(true)
  })

  test('rejects duplicate and unknown relation keys', () => {
    const first = documentationRelations[0]!
    const paths = new Set(documentationRelations.flatMap((item) => [
      item.canonicalSource,
      ...item.validators,
      ...item.consumers,
      ...item.tests,
      ...item.migrations,
    ]))
    const result = buildDocumentation(
      compiled.model,
      [
        ...documentationRelations,
        { ...first },
        { ...first, conceptKey: 'question/unknown' },
      ],
      new Set(['tools/validation/validate-classification.ts']),
      paths,
    )
    expect(result.diagnostics.filter((item) => item.entityId === first.conceptKey)).not.toEqual([])
    expect(result.diagnostics.some((item) => item.entityId === 'question/unknown')).toBe(true)
  })

  test('rejects a relation path outside the repository even if marked as existing', () => {
    const first = documentationRelations[0]!
    const result = buildDocumentation(
      compiled.model,
      [
        { ...first, validators: ['../outside.ts'] },
        ...documentationRelations.slice(1),
      ],
      new Set(['tools/validation/validate-classification.ts']),
      new Set([
        '../outside.ts',
        ...documentationRelations.flatMap((item) => [
          item.canonicalSource,
          ...item.validators,
          ...item.consumers,
          ...item.tests,
          ...item.migrations,
        ]),
      ]),
    )
    expect(result.diagnostics.some((item) => (
      item.message.includes('not repository-relative POSIX')
    ))).toBe(true)
  })
})
```

Create `tools/documentation/scan-imports.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { scanCoreConsumers } from './scan-imports.js'

describe('core consumer scanner', () => {
  test('finds consumers while excluding core, tests, and index infrastructure', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-'))
    try {
      mkdirSync(join(repoRoot, 'apps/web'), { recursive: true })
      mkdirSync(join(repoRoot, 'packages/classification-core/src'), { recursive: true })
      mkdirSync(join(repoRoot, 'tools/documentation'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'apps/web/consumer.ts'),
        "import type { ClassificationModel } from '@ramen-style/classification-core'\n",
      )
      writeFileSync(
        join(repoRoot, 'apps/web/consumer.test.ts'),
        "import '@ramen-style/classification-core'\n",
      )
      writeFileSync(
        join(repoRoot, 'packages/classification-core/src/internal.ts'),
        "import '@ramen-style/classification-core/compiler'\n",
      )
      writeFileSync(
        join(repoRoot, 'tools/documentation/generator.ts'),
        "import '@ramen-style/classification-core/compiler'\n",
      )

      expect([...scanCoreConsumers(
        repoRoot,
        ['apps', 'packages', 'tools'],
        new Set([
          'apps/web/consumer.ts',
          'apps/web/consumer.test.ts',
          'packages/classification-core/src/internal.ts',
          'tools/documentation/generator.ts',
        ]),
      )]).toEqual([
        'apps/web/consumer.ts',
      ])
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  test('finds CommonJS package imports in cts consumers', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-'))
    try {
      mkdirSync(join(repoRoot, 'apps/web'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'apps/web/commonjs.cts'),
        "const core = require('@ramen-style/classification-core/compiler')\n",
      )

      expect([...scanCoreConsumers(
        repoRoot,
        ['apps'],
        new Set(['apps/web/commonjs.cts']),
      )]).toEqual(['apps/web/commonjs.cts'])
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  test('excludes consumers outside the eligible repository inventory', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-'))
    try {
      mkdirSync(join(repoRoot, 'apps/web'), { recursive: true })
      writeFileSync(
        join(repoRoot, 'apps/web/eligible.ts'),
        "import '@ramen-style/classification-core'\n",
      )
      writeFileSync(
        join(repoRoot, 'apps/web/ignored-local.ts'),
        "import '@ramen-style/classification-core'\n",
      )

      expect([...scanCoreConsumers(
        repoRoot,
        ['apps'],
        new Set(['apps/web/eligible.ts']),
      )]).toEqual(['apps/web/eligible.ts'])
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})
```

Create `tools/documentation/generate-classification-index.test.ts`:

```ts
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { expect, test } from 'vitest'

const sourceRoot = resolve(import.meta.dirname, '../..')

test('write mode rejects an owned output symlink before changing any output', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-cli-'))
  const externalRoot = mkdtempSync(join(tmpdir(), 'ramen-index-outside-'))
  try {
    const documentationRoot = join(repoRoot, 'tools/documentation')
    mkdirSync(documentationRoot, { recursive: true })
    for (const file of [
      'build-index.ts',
      'generate-classification-index.ts',
      'relations.ts',
      'scan-imports.ts',
    ]) {
      cpSync(join(sourceRoot, 'tools/documentation', file), join(documentationRoot, file))
    }

    for (const file of [
      'packages/classification-core/src/definitions/synthetic.ts',
      'packages/classification-core/src/compiler/source-schema.ts',
      'packages/classification-core/src/compiler/compile.ts',
      'packages/classification-core/src/compiler/compile.test.ts',
    ]) {
      const target = join(repoRoot, file)
      mkdirSync(resolve(target, '..'), { recursive: true })
      writeFileSync(target, '')
    }
    const validation = join(repoRoot, 'tools/validation/validate-classification.ts')
    mkdirSync(resolve(validation, '..'), { recursive: true })
    writeFileSync(validation, "import '@ramen-style/classification-core/compiler'\n")

    writeFileSync(join(repoRoot, '.gitignore'), 'node_modules/\n')
    symlinkSync(join(sourceRoot, 'node_modules'), join(repoRoot, 'node_modules'), 'dir')
    execFileSync('git', ['init', '--quiet'], { cwd: repoRoot })

    const classificationRoot = join(repoRoot, 'docs/classification')
    mkdirSync(classificationRoot, { recursive: true })
    writeFileSync(join(classificationRoot, 'change-map.md'), '# Change map\n')
    const manifest = join(classificationRoot, 'manifest.json')
    writeFileSync(manifest, 'manifest remains unchanged\n')
    const externalTarget = join(externalRoot, 'outside.md')
    writeFileSync(externalTarget, 'outside remains unchanged\n')
    symlinkSync(externalTarget, join(classificationRoot, 'index.md'))

    const result = spawnSync(
      process.execPath,
      [
        join(sourceRoot, 'node_modules/tsx/dist/cli.mjs'),
        join(documentationRoot, 'generate-classification-index.ts'),
        '--write',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'DOC_INDEX_DRIFT unexpected owned-path entry docs/classification/index.md',
    )
    expect(readFileSync(externalTarget, 'utf8')).toBe('outside remains unchanged\n')
    expect(readFileSync(manifest, 'utf8')).toBe('manifest remains unchanged\n')
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(externalRoot, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run tools/documentation/build-index.test.ts tools/documentation/scan-imports.test.ts tools/documentation/generate-classification-index.test.ts
```

Expected: FAIL because documentation tooling does not exist.

- [ ] **Step 3: Define explicit synthetic relations**

Create `tools/documentation/relations.ts`:

```ts
import type { ConceptKey } from '@ramen-style/classification-core/compiler'

export interface DocumentationRelation {
  conceptKey: ConceptKey
  canonicalSource: string
  validators: readonly string[]
  consumers: readonly string[]
  tests: readonly string[]
  migrations: readonly string[]
}

const conceptKeys = [
  'question/demo-form',
  'question/demo-archetype',
  'option/demo-soup',
  'option/demo-dry',
  'option/demo-chintan',
  'option/demo-aburasoba',
  'style/demo-shoyu',
  'intensity/demo-shoyu:standard',
  'noodle/demo-shoyu:medium-thin-straight',
  'policy/default',
] as const satisfies readonly ConceptKey[]

export const documentationRelations: readonly DocumentationRelation[] = conceptKeys.map(
  (conceptKey) => ({
    conceptKey,
    canonicalSource: 'packages/classification-core/src/definitions/synthetic.ts',
    validators: [
      'packages/classification-core/src/compiler/source-schema.ts',
      'packages/classification-core/src/compiler/compile.ts',
    ],
    consumers: ['tools/validation/validate-classification.ts'],
    tests: ['packages/classification-core/src/compiler/compile.test.ts'],
    migrations: [],
  }),
)
```

Create `docs/classification/change-map.md`:

```markdown
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
```

- [ ] **Step 4: Implement import discovery and deterministic rendering**

Create `tools/documentation/scan-imports.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import * as ts from 'typescript'

const corePackage = '@ramen-style/classification-core'
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules'])

function toPosix(value: string) {
  return value.split(sep).join('/')
}

function isInfrastructureOrTest(relativePath: string) {
  return relativePath.startsWith('packages/classification-core/')
    || relativePath.startsWith('tools/documentation/')
    || relativePath.endsWith('.test.ts')
    || relativePath.endsWith('.test.tsx')
    || relativePath.endsWith('.test.mts')
    || relativePath.endsWith('.test.cts')
}

export function scanCoreConsumers(
  repoRoot: string,
  roots: readonly string[],
  eligibleFiles: ReadonlySet<string>,
): Set<string> {
  const consumers = new Set<string>()

  const visit = (absolutePath: string) => {
    for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
      const child = join(absolutePath, entry.name)
      const relativePath = toPosix(relative(repoRoot, child))
      if (isInfrastructureOrTest(relativePath)) continue
      if (entry.isDirectory()) {
        visit(child)
        continue
      }
      if (!entry.isFile() || !['.ts', '.tsx', '.mts', '.cts'].some((suffix) => entry.name.endsWith(suffix))) {
        continue
      }
      if (!eligibleFiles.has(relativePath)) continue
      const imports = ts.preProcessFile(readFileSync(child, 'utf8'), true, true).importedFiles
      if (imports.some(({ fileName }) => fileName === corePackage || fileName.startsWith(`${corePackage}/`))) {
        consumers.add(relativePath)
      }
    }
  }

  for (const root of roots) {
    const absoluteRoot = join(repoRoot, root)
    if (existsSync(absoluteRoot)) visit(absoluteRoot)
  }
  return new Set([...consumers].sort())
}
```

The exclusions are intentional: the package cannot be its own consumer, tests are
declared in `DocumentationRelation.tests`, and documentation infrastructure would
otherwise create a self-reference. Create `tools/documentation/build-index.ts`:

```ts
import {
  DiagnosticCollector,
  stableJson,
  type ClassificationModel,
  type Diagnostic,
} from '@ramen-style/classification-core/compiler'
import type { DocumentationRelation } from './relations.js'

export interface DocumentationBuild {
  manifest: string
  markdown: string
  diagnostics: readonly Diagnostic[]
}

function isRepositoryPath(value: string) {
  return !value.startsWith('/')
    && !value.includes('\\')
    && !/^[A-Za-z]:/.test(value)
    && value.split('/').every((segment) => segment !== '.' && segment !== '..' && segment !== '')
}

export function buildDocumentation(
  model: ClassificationModel,
  relations: readonly DocumentationRelation[],
  detectedConsumers: ReadonlySet<string>,
  existingPaths: ReadonlySet<string>,
): DocumentationBuild {
  const collector = new DiagnosticCollector()
  const relationByKey = new Map<string, DocumentationRelation>()
  const inventoryByKey = new Map(model.inventory.map((item) => [item.key, item]))

  relations.forEach((relation, index) => {
    if (relationByKey.has(relation.conceptKey)) {
      collector.error({
        code: 'DOC_RELATION_INVALID',
        sourceFile: 'tools/documentation/relations.ts',
        path: `/relations/${index}/conceptKey`,
        entityId: relation.conceptKey,
        message: `Duplicate documentation relation ${relation.conceptKey}`,
      })
    } else {
      relationByKey.set(relation.conceptKey, relation)
    }
  })

  for (const concept of model.inventory) {
    if (!relationByKey.has(concept.key)) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: '/relations',
      entityId: concept.key,
      message: `Missing documentation relation for ${concept.key}`,
    })
  }

  relations.forEach((relation, relationIndex) => {
    const concept = inventoryByKey.get(relation.conceptKey)
    if (!concept) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: `/relations/${relationIndex}/conceptKey`,
      entityId: relation.conceptKey,
      message: `Unknown concept ${relation.conceptKey}`,
    })
    if (concept && relation.canonicalSource !== concept.sourceFile) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: `/relations/${relationIndex}/canonicalSource`,
      entityId: relation.conceptKey,
      message: `Canonical source does not match compiled inventory for ${relation.conceptKey}`,
    })
    if (relation.validators.length === 0) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: `/relations/${relationIndex}/validators`,
      entityId: relation.conceptKey,
      message: `No validator registered for ${relation.conceptKey}`,
    })
    if (relation.tests.length === 0) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: `/relations/${relationIndex}/tests`,
      entityId: relation.conceptKey,
      message: `No test registered for ${relation.conceptKey}`,
    })

    const declaredPaths = [
      ['canonicalSource', relation.canonicalSource] as const,
      ...relation.validators.map((path) => ['validators', path] as const),
      ...relation.consumers.map((path) => ['consumers', path] as const),
      ...relation.tests.map((path) => ['tests', path] as const),
      ...relation.migrations.map((path) => ['migrations', path] as const),
    ]
    for (const [field, path] of declaredPaths) {
      if (!isRepositoryPath(path)) collector.error({
        code: 'DOC_RELATION_INVALID',
        sourceFile: 'tools/documentation/relations.ts',
        path: `/relations/${relationIndex}/${field}`,
        entityId: relation.conceptKey,
        message: `Registered path is not repository-relative POSIX: ${path}`,
      })
      if (!existingPaths.has(path)) collector.error({
        code: 'DOC_RELATION_INVALID',
        sourceFile: 'tools/documentation/relations.ts',
        path: `/relations/${relationIndex}/${field}`,
        entityId: relation.conceptKey,
        message: `Registered path does not exist: ${path}`,
      })
    }
  })

  const registeredConsumers = new Set(relations.flatMap((item) => item.consumers))
  for (const consumer of detectedConsumers) {
    if (!registeredConsumers.has(consumer)) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: '/consumers',
      message: `Detected core consumer is not registered: ${consumer}`,
    })
  }
  for (const consumer of registeredConsumers) {
    if (!detectedConsumers.has(consumer)) collector.error({
      code: 'DOC_RELATION_INVALID',
      sourceFile: 'tools/documentation/relations.ts',
      path: '/consumers',
      message: `Registered core consumer no longer imports the package: ${consumer}`,
    })
  }

  const sorted = (values: readonly string[]) => [...new Set(values)].sort()
  const concepts = model.inventory
    .map((concept) => {
      const relation = relationByKey.get(concept.key)
      return {
        key: concept.key,
        kind: concept.kind,
        id: concept.id,
        canonicalSource: relation?.canonicalSource ?? concept.sourceFile,
        validators: sorted(relation?.validators ?? []),
        consumers: sorted(relation?.consumers ?? []),
        migrations: sorted(relation?.migrations ?? []),
        generatedOwners: [
          'docs/classification/index.md',
          'docs/classification/manifest.json',
        ],
        messageIds: sorted(concept.messageIds),
        tests: sorted(relation?.tests ?? []),
      }
    })
    .sort((left, right) => left.key.localeCompare(right.key))

  const cell = (values: readonly string[]) => values.length
    ? values.map((value) => `\`${value.replaceAll('|', '\\|')}\``).join('<br>')
    : '—'
  const rows = concepts.map((concept) => [
    `| \`${concept.key}\``,
    `\`${concept.canonicalSource}\``,
    cell(concept.validators),
    cell(concept.consumers),
    cell(concept.migrations),
    cell(concept.generatedOwners),
    cell(concept.messageIds),
    `${cell(concept.tests)} |`,
  ].join(' | '))
  const markdown = [
    '# Classification Index',
    '',
    '> Synthetic inventory — not production classification data.',
    '',
    `Model version: \`${model.modelVersion}\`<br>`,
    `Data version: \`${model.dataVersion}\``,
    '',
    '| Concept | Canonical source | Validators | Consumers | Migrations | Generated owners | Messages | Tests |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')

  return {
    manifest: stableJson({
      schemaVersion: 1,
      synthetic: model.mode === 'synthetic',
      modelVersion: model.modelVersion,
      dataVersion: model.dataVersion,
      concepts,
    }),
    markdown,
    diagnostics: collector.toArray(),
  }
}
```

- [ ] **Step 5: Implement write/check CLI**

Create `tools/documentation/generate-classification-index.ts`:

```ts
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'

import { compileClassification, syntheticDefinition } from '@ramen-style/classification-core/compiler'
import { buildDocumentation } from './build-index.js'
import { documentationRelations } from './relations.js'
import { scanCoreConsumers } from './scan-imports.js'

const repoRoot = resolve(import.meta.dirname, '../..')
const mode = process.argv[2]
if (mode !== '--write' && mode !== '--check') throw new Error('Use --write or --check')

const compiled = compileClassification(
  syntheticDefinition,
  'packages/classification-core/src/definitions/synthetic.ts',
)
if (!compiled.ok) {
  console.error(JSON.stringify(compiled.diagnostics, null, 2))
  process.exit(1)
}

const repoFiles = new Set(execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { cwd: repoRoot, encoding: 'utf8' },
).split('\n').filter(Boolean))
const existingPaths = new Set(documentationRelations.flatMap((item) => [
  item.canonicalSource,
  ...item.validators,
  ...item.consumers,
  ...item.tests,
  ...item.migrations,
]).filter((file) => {
  const absolute = resolve(repoRoot, file)
  return repoFiles.has(file) && existsSync(absolute) && statSync(absolute).isFile()
}))
const detected = scanCoreConsumers(repoRoot, ['apps', 'packages', 'tools'], repoFiles)
const built = buildDocumentation(compiled.model, documentationRelations, detected, existingPaths)
if (built.diagnostics.length) {
  console.error(JSON.stringify(built.diagnostics, null, 2))
  process.exit(1)
}

const outputs = new Map([
  ['docs/classification/manifest.json', built.manifest],
  ['docs/classification/index.md', built.markdown],
])
const allowedClassificationFiles = new Set([
  ...outputs.keys(),
  'docs/classification/change-map.md',
])
let hasInvalidOwnedEntry = false
for (const entry of readdirSync(resolve(repoRoot, 'docs/classification'), { withFileTypes: true })) {
  const relative = `docs/classification/${entry.name}`
  if (!entry.isFile() || !allowedClassificationFiles.has(relative)) {
    console.error(`DOC_INDEX_DRIFT unexpected owned-path entry ${relative}`)
    hasInvalidOwnedEntry = true
  }
}
if (hasInvalidOwnedEntry) process.exit(1)
for (const [relative, content] of outputs) {
  const file = resolve(repoRoot, relative)
  if (mode === '--write') {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  } else if (!existsSync(file) || readFileSync(file, 'utf8') !== content) {
    console.error(`DOC_INDEX_DRIFT ${relative}`)
    process.exitCode = 1
  }
}
```

Add these root scripts:

```json
"classification:index": "tsx tools/documentation/generate-classification-index.ts --write",
"classification:index:check": "tsx tools/documentation/generate-classification-index.ts --check"
```

- [ ] **Step 6: Generate and verify the index**

Run:

```bash
npx vitest run tools/documentation/build-index.test.ts tools/documentation/scan-imports.test.ts tools/documentation/generate-classification-index.test.ts
npm run classification:index
npm run classification:index:check
npm run lint
npm run typecheck
```

Expected: eight documentation tests pass; generated files state synthetic status; check mode exits 0 without modifying files, and write mode rejects owned-output symlinks before changing any output.

- [ ] **Step 7: Commit index tooling**

```bash
git add package.json tools/documentation docs/classification
git commit -m "Generate checked classification index"
```

---

### Task 6: Validate and render the migration ledger

**Files:**
- Create: `tools/migration/ledger-schema.ts`
- Create: `tools/migration/render-ledger.ts`
- Create: `tools/migration/render-ledger.test.ts`
- Create: `tools/migration/ledger-check.ts`
- Create: `tools/migration/ledger-check.test.ts`
- Create: `tools/migration/check-ledger.ts`
- Create: `docs/migration/ledger.md` via generator
- Modify: `docs/migration/ledger.json`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `migrationLedgerSchema`, `renderLedger(ledger)`, `checkLedger(input)`, and CLI modes `--write` / `--check`.
- Consumes: canonical `docs/migration/ledger.json`, exact repository leaf files, and scoped ownership declarations.
- `ownedScopes` marks directories whose current and future files must appear exactly once in some ledger entry; it does not reserve that directory permanently for the batch that first declared the scope.

- [ ] **Step 1: Write failing ledger tests**

Create `tools/migration/render-ledger.test.ts`:

```ts
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { migrationLedgerSchema } from './ledger-schema.js'
import { renderLedger } from './render-ledger.js'

const ledger = migrationLedgerSchema.parse(JSON.parse(readFileSync(
  new URL('../../docs/migration/ledger.json', import.meta.url),
  'utf8',
)) as unknown)

describe('migration ledger', () => {
  test('parses the canonical ledger and renders stable Markdown', () => {
    const rendered = renderLedger(ledger)
    expect(rendered).toContain('## Batch 0 — complete')
    expect(rendered).toContain('`docs/migration/ledger.json`')
    expect(rendered.endsWith('\n')).toBe(true)
  })

  test('rejects duplicate batches, duplicate owners, and empty completion evidence', () => {
    const duplicate = structuredClone(ledger)
    duplicate.entries.push(structuredClone(duplicate.entries[0]!))
    expect(() => migrationLedgerSchema.parse(duplicate)).toThrow()

    const emptyEvidence = structuredClone(ledger)
    emptyEvidence.entries[0]!.verification = []
    expect(() => migrationLedgerSchema.parse(emptyEvidence)).toThrow()
  })
})
```

Create `tools/migration/ledger-check.test.ts`:

```ts
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { checkLedger, recordSuccessfulCi } from './ledger-check.js'
import { migrationLedgerSchema } from './ledger-schema.js'
import { renderLedger } from './render-ledger.js'

const ledger = migrationLedgerSchema.parse(JSON.parse(readFileSync(
  new URL('../../docs/migration/ledger.json', import.meta.url),
  'utf8',
)) as unknown)
const declaredFiles = new Set(ledger.entries.flatMap((entry) => entry.newOwners))

describe('migration ledger repository checks', () => {
  test('accepts exact owners and current generated Markdown', () => {
    const result = checkLedger({
      input: ledger,
      repoFiles: declaredFiles,
      existingFiles: declaredFiles,
      currentMarkdown: renderLedger(ledger),
    })
    expect(result).toMatchObject({ ok: true, errors: [] })
  })

  test('rejects a missing owner and an unregistered file inside an owned scope', () => {
    const existingFiles = new Set(declaredFiles)
    existingFiles.delete('docs/superpowers/plans/2026-07-11-batch-1-compiler-foundation.md')
    const repoFiles = new Set([
      ...declaredFiles,
      'UNREGISTERED.md',
      'docs/superpowers/plans/unregistered.md',
    ])
    const result = checkLedger({
      input: ledger,
      repoFiles,
      existingFiles,
      currentMarkdown: undefined,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('not an existing repository file'))).toBe(true)
    expect(result.errors).toContain('Repository file has no migration-ledger owner: UNREGISTERED.md')
    expect(result.errors.some((error) => error.includes('not registered in owned scope'))).toBe(true)
  })

  test('rejects stale generated Markdown', () => {
    const result = checkLedger({
      input: ledger,
      repoFiles: declaredFiles,
      existingFiles: declaredFiles,
      currentMarkdown: 'stale\n',
    })
    expect(result.errors).toContain('generated ledger Markdown is stale')
  })

  test('binds remote CI evidence to the accepted commit and workflow run', () => {
    const reviewLedger = structuredClone(ledger)
    reviewLedger.entries[0]!.status = 'in-review'
    const updated = recordSuccessfulCi(
      reviewLedger,
      '0',
      'a'.repeat(40),
      'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
    )
    const entry = updated.entries[0]!
    expect(entry.status).toBe('complete')
    expect(entry.verification.at(-1)).toMatchObject({
      gate: 'batch0-remote-ci',
      commitSha: 'a'.repeat(40),
      runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tools/migration/render-ledger.test.ts tools/migration/ledger-check.test.ts
```

Expected: FAIL because ledger tooling does not exist.

- [ ] **Step 3: Implement ledger schema and renderer**

Create `tools/migration/ledger-schema.ts`:

```ts
import { z } from 'zod'

const repoPathSchema = z.string().min(1).refine(
  (value) => !value.startsWith('/')
    && !value.includes('\\')
    && value.split('/').every((segment) => segment !== '.' && segment !== '..' && segment !== ''),
  'must be a repository-relative POSIX path',
)

const verificationSchema = z.strictObject({
  gate: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  command: z.string().min(1),
  outcome: z.literal('passed'),
  evidence: z.string().min(1),
  commitSha: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  runUrl: z.string().url().optional(),
}).superRefine((verification, context) => {
  if (verification.gate.endsWith('-remote-ci')
    && (!verification.commitSha || !verification.runUrl)) {
    context.addIssue({
      code: 'custom',
      message: 'remote CI evidence requires commitSha and runUrl',
    })
  }
})

const entrySchema = z.strictObject({
  batch: z.string().min(1),
  status: z.enum(['in-review', 'in-progress', 'complete']),
  foundationCommit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  legacySources: z.array(z.string().min(1)),
  ownedScopes: z.array(repoPathSchema).default([]),
  newOwners: z.array(repoPathSchema).min(1),
  transformation: z.string().min(1),
  behavior: z.string().min(1),
  verification: z.array(verificationSchema),
}).superRefine((entry, context) => {
  if (entry.status === 'complete' && entry.verification.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['verification'],
      message: 'complete entries require verification evidence',
    })
  }
  const gates = new Set<string>()
  entry.verification.forEach((verification, index) => {
    if (gates.has(verification.gate)) context.addIssue({
      code: 'custom',
      path: ['verification', index, 'gate'],
      message: `duplicate verification gate ${verification.gate}`,
    })
    gates.add(verification.gate)
  })
})

export const migrationLedgerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  baseline: z.strictObject({
    repository: z.string().min(1),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
  }),
  entries: z.array(entrySchema).min(1),
}).superRefine((ledger, context) => {
  const batches = new Map<string, number>()
  const owners = new Map<string, number>()
  ledger.entries.forEach((entry, entryIndex) => {
    const previousBatch = batches.get(entry.batch)
    if (previousBatch !== undefined) context.addIssue({
      code: 'custom',
      path: ['entries', entryIndex, 'batch'],
      message: `duplicate batch ${entry.batch}; first declared at entries/${previousBatch}`,
    })
    batches.set(entry.batch, entryIndex)

    entry.newOwners.forEach((owner, ownerIndex) => {
      const previousOwner = owners.get(owner)
      if (previousOwner !== undefined) context.addIssue({
        code: 'custom',
        path: ['entries', entryIndex, 'newOwners', ownerIndex],
        message: `duplicate owner ${owner}; first declared at entries/${previousOwner}`,
      })
      owners.set(owner, entryIndex)
    })
  })
})

export type MigrationLedger = z.infer<typeof migrationLedgerSchema>
```

Create `tools/migration/render-ledger.ts`:

```ts
import type { MigrationLedger } from './ledger-schema.js'

export function renderLedger(ledger: MigrationLedger) {
  const sections = [...ledger.entries]
    .sort((left, right) => left.batch.localeCompare(right.batch, undefined, { numeric: true }))
    .flatMap((entry) => [
      `## Batch ${entry.batch} — ${entry.status}`,
      '',
      `- Behavior: \`${entry.behavior}\``,
      `- Transformation: ${entry.transformation}`,
      ...(entry.foundationCommit ? [`- Foundation commit: \`${entry.foundationCommit}\``] : []),
      '',
      '### Legacy sources',
      '',
      ...(entry.legacySources.length
        ? [...entry.legacySources].sort().map((source) => `- \`${source}\``)
        : ['- None; this batch introduces new infrastructure.']),
      '',
      '### New owners',
      '',
      ...[...entry.newOwners].sort().map((owner) => `- \`${owner}\``),
      '',
      '### Verification',
      '',
      ...(entry.verification.length
        ? [...entry.verification]
            .sort((left, right) => left.gate.localeCompare(right.gate))
            .flatMap((item) => [
              `- \`${item.gate}\`: \`${item.command}\` — ${item.outcome}; ${item.evidence}`,
              ...(item.commitSha ? [`  - Commit: \`${item.commitSha}\``] : []),
              ...(item.runUrl ? [`  - Run: ${item.runUrl}`] : []),
            ])
        : ['- Pending.']),
      '',
    ])
  return [
    '# Migration Ledger',
    '',
    '> Generated from `docs/migration/ledger.json`. Do not edit this file directly.',
    '',
    `Baseline: \`${ledger.baseline.repository}@${ledger.baseline.commit}\``,
    '',
    ...sections,
  ].join('\n')
}
```

- [ ] **Step 4: Implement ledger write/check CLI**

Create `tools/migration/ledger-check.ts`:

```ts
import type { MigrationLedger } from './ledger-schema.js'
import { migrationLedgerSchema } from './ledger-schema.js'
import { renderLedger } from './render-ledger.js'

export interface LedgerCheckInput {
  input: unknown
  repoFiles: ReadonlySet<string>
  existingFiles: ReadonlySet<string>
  currentMarkdown: string | undefined
}

export interface LedgerCheckResult {
  ok: boolean
  errors: readonly string[]
  ledger: MigrationLedger | undefined
  markdown: string | undefined
}

export function recordSuccessfulCi(
  input: unknown,
  batch: string,
  commitSha: string,
  runUrl: string,
): MigrationLedger {
  const ledger = migrationLedgerSchema.parse(input)
  if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('CI commit must be a full SHA')
  const parsedUrl = new URL(runUrl)
  if (parsedUrl.origin !== 'https://github.com'
    || !/^\/AnsonHui6040\/ramen-style-today-next\/actions\/runs\/\d+\/?$/.test(parsedUrl.pathname)) {
    throw new Error('CI run URL must identify this repository workflow run')
  }
  const target = ledger.entries.find((entry) => entry.batch === batch)
  if (!target) throw new Error(`Unknown ledger batch ${batch}`)
  if (target.status !== 'in-review') throw new Error(`Batch ${batch} is not in review`)
  const gate = `batch${batch.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-remote-ci`
  if (target.verification.some((item) => item.gate === gate)) {
    throw new Error(`Batch ${batch} already records remote CI`)
  }

  return migrationLedgerSchema.parse({
    ...ledger,
    entries: ledger.entries.map((entry) => entry.batch === batch ? {
      ...entry,
      status: 'complete',
      verification: [
        ...entry.verification,
        {
          gate,
          command: 'GitHub Actions CI / verify',
          outcome: 'passed',
          evidence: 'the pushed acceptance candidate completed the Node 24 verify job successfully',
          commitSha,
          runUrl,
        },
      ],
    } : entry),
  })
}

export function checkLedger(input: LedgerCheckInput): LedgerCheckResult {
  const parsed = migrationLedgerSchema.safeParse(input.input)
  if (!parsed.success) return {
    ok: false,
    errors: parsed.error.issues.map((issue) => (
      `schema /${issue.path.map(String).join('/')}: ${issue.message}`
    )),
    ledger: undefined,
    markdown: undefined,
  }

  const errors: string[] = []
  const allOwners = new Set(parsed.data.entries.flatMap((entry) => entry.newOwners))
  for (const entry of parsed.data.entries) {
    for (const owner of entry.newOwners) {
      if (!input.repoFiles.has(owner) || !input.existingFiles.has(owner)) {
        errors.push(`Batch ${entry.batch} owner is not an existing repository file: ${owner}`)
      }
    }
    for (const scope of entry.ownedScopes) {
      const scopedFiles = [...input.repoFiles].filter(
        (file) => file === scope || file.startsWith(`${scope}/`),
      )
      if (scopedFiles.length === 0) {
        errors.push(`Batch ${entry.batch} owned scope contains no repository files: ${scope}`)
      }
      for (const file of scopedFiles) {
        if (!allOwners.has(file)) {
          errors.push(`Repository file is not registered in owned scope ${scope}: ${file}`)
        }
      }
    }
  }
  for (const file of input.repoFiles) {
    if (!allOwners.has(file)) {
      errors.push(`Repository file has no migration-ledger owner: ${file}`)
    }
  }

  const markdown = renderLedger(parsed.data)
  if (input.currentMarkdown !== undefined && input.currentMarkdown !== markdown) {
    errors.push('generated ledger Markdown is stale')
  }
  return {
    ok: errors.length === 0,
    errors: errors.sort(),
    ledger: parsed.data,
    markdown,
  }
}
```

Create `tools/migration/check-ledger.ts`:

```ts
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'

import { checkLedger, recordSuccessfulCi } from './ledger-check.js'

const repoRoot = resolve(import.meta.dirname, '../..')
const sourceFile = resolve(repoRoot, 'docs/migration/ledger.json')
const outputFile = resolve(repoRoot, 'docs/migration/ledger.md')

function repositoryFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  return new Set(output.split('\n').filter(Boolean))
}

function run() {
  const mode = process.argv[2]
  if (mode === '--record-ci') {
    const [batch, commitSha, runUrl] = process.argv.slice(3)
    if (!batch || !commitSha || !runUrl) {
      throw new Error('Use --record-ci <batch> <full-commit-sha> <workflow-run-url>')
    }
    const input = JSON.parse(readFileSync(sourceFile, 'utf8')) as unknown
    const updated = recordSuccessfulCi(input, batch, commitSha, runUrl)
    writeFileSync(sourceFile, `${JSON.stringify(updated, null, 2)}\n`)
    return
  }
  if (mode !== '--write' && mode !== '--check') throw new Error('Use --write or --check')

  const input = JSON.parse(readFileSync(sourceFile, 'utf8')) as unknown
  const repoFiles = repositoryFiles()
  const existingFiles = new Set([...repoFiles].filter((file) => {
    const absolute = resolve(repoRoot, file)
    return existsSync(absolute) && statSync(absolute).isFile()
  }))
  if (mode === '--write') {
    repoFiles.add('docs/migration/ledger.md')
    existingFiles.add('docs/migration/ledger.md')
  }
  const currentMarkdown = mode === '--check'
    ? existsSync(outputFile) ? readFileSync(outputFile, 'utf8') : ''
    : undefined
  const result = checkLedger({ input, repoFiles, existingFiles, currentMarkdown })
  if (!result.ok || result.markdown === undefined) {
    for (const error of result.errors) console.error(`LEDGER_INVALID ${error}`)
    process.exitCode = 1
    return
  }

  if (mode === '--write') {
    mkdirSync(dirname(outputFile), { recursive: true })
    writeFileSync(outputFile, result.markdown)
  }
}

try {
  run()
} catch (error) {
  console.error(`LEDGER_INVALID ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
```

Add scripts:

```json
"migration:ledger": "tsx tools/migration/check-ledger.ts --write",
"migration:ledger:check": "tsx tools/migration/check-ledger.ts --check",
"migration:ledger:record-ci": "tsx tools/migration/check-ledger.ts --record-ci"
```

- [ ] **Step 5: Register every Batch 1 file created through this task**

Append this in-progress entry to `docs/migration/ledger.json` before enabling the
repository-wide ownership check:

```json
{
  "batch": "1",
  "status": "in-progress",
  "legacySources": [],
  "ownedScopes": [
    "docs/classification",
    "packages/classification-core",
    "tools"
  ],
  "newOwners": [
    ".nvmrc",
    "docs/classification/change-map.md",
    "docs/classification/index.md",
    "docs/classification/manifest.json",
    "docs/migration/ledger.md",
    "eslint.config.js",
    "package-lock.json",
    "package.json",
    "packages/classification-core/package.json",
    "packages/classification-core/src/compiler/collector.test.ts",
    "packages/classification-core/src/compiler/collector.ts",
    "packages/classification-core/src/compiler/compile.test.ts",
    "packages/classification-core/src/compiler/compile.ts",
    "packages/classification-core/src/compiler/index.ts",
    "packages/classification-core/src/compiler/parse.test.ts",
    "packages/classification-core/src/compiler/parse.ts",
    "packages/classification-core/src/compiler/source-schema.ts",
    "packages/classification-core/src/compiler/stable-json.ts",
    "packages/classification-core/src/contracts/diagnostic-codes.ts",
    "packages/classification-core/src/contracts/diagnostic.ts",
    "packages/classification-core/src/contracts/ids.ts",
    "packages/classification-core/src/contracts/model.ts",
    "packages/classification-core/src/contracts/source-path.ts",
    "packages/classification-core/src/definitions/synthetic.ts",
    "packages/classification-core/src/index.test.ts",
    "packages/classification-core/src/index.ts",
    "packages/classification-core/tsconfig.json",
    "tools/documentation/build-index.test.ts",
    "tools/documentation/build-index.ts",
    "tools/documentation/generate-classification-index.test.ts",
    "tools/documentation/generate-classification-index.ts",
    "tools/documentation/relations.ts",
    "tools/documentation/scan-imports.test.ts",
    "tools/documentation/scan-imports.ts",
    "tools/index.ts",
    "tools/migration/check-ledger.ts",
    "tools/migration/ledger-check.test.ts",
    "tools/migration/ledger-check.ts",
    "tools/migration/ledger-schema.ts",
    "tools/migration/render-ledger.test.ts",
    "tools/migration/render-ledger.ts",
    "tools/tsconfig.json",
    "tools/validation/validate-classification.ts",
    "tsconfig.base.json",
    "tsconfig.json",
    "vitest.config.ts"
  ],
  "transformation": "Created new monorepo contracts, diagnostics, compiler, synthetic inventory, checked documentation index, and ledger tooling without migrating legacy production behavior.",
  "behavior": "no-production-runtime-change",
  "verification": []
}
```

- [ ] **Step 6: Generate and verify ledger documentation**

Run:

```bash
npx vitest run tools/migration/render-ledger.test.ts tools/migration/ledger-check.test.ts
npm run migration:ledger
npm run migration:ledger:check
npm run lint
npm run typecheck
```

Expected: six tests pass; generated Markdown lists Batch 0 as complete and Batch 1 as in progress; every unignored repository file has exactly one ledger owner; checks exit 0.

- [ ] **Step 7: Link human-readable ledger and commit**

Replace the README ledger link with:

```markdown
- [Migration ledger](docs/migration/ledger.md) ([machine source](docs/migration/ledger.json))
```

Then run:

```bash
npm run migration:ledger:check
git add package.json README.md tools/migration docs/migration/ledger.json docs/migration/ledger.md
git commit -m "Validate migration ledger"
```

---

### Task 7: Add the repository-wide gate and Batch 1 evidence

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/migration/ledger.json`
- Regenerate: `docs/migration/ledger.md`

**Interfaces:**
- Produces: root `npm run verify` and identical GitHub Actions execution on Node 24.18.0.
- Acceptance: Batch 1 contains infrastructure and synthetic inventory only.

**Task 6 review integration correction:** remote promotion accepts only
`--record-ci <batch> <verified-ci-proof-json-file>`. The proof is a strict JSON
object containing schema version 1, the candidate SHA, numeric run ID, and
repository run URL. Task 7 creates this ignored temporary proof only after its
workflow-list precheck. At record time, the ledger CLI independently fetches the
hard-coded GitHub API run resource for
`AnsonHui6040/ramen-style-today-next`, rejects redirects, and authenticates the
repository, `ci.yml` workflow, `push` event, current candidate/head SHA, run ID,
run URL, completed status, and successful conclusion before any ledger write.
The shell precheck is defense-in-depth, not the mutation trust boundary; callers
cannot promote a batch with a fabricated internally consistent proof.

- [ ] **Step 1: Prove the aggregate gate is absent, then add it**

Run:

```bash
npm run verify
```

Expected: FAIL with `Missing script: "verify"`; the individual commands already
pass in their owning tasks.

Add to root `package.json`:

```json
"verify": "npm run lint && npm test && npm run typecheck && npm run build && npm run classification:validate && npm run classification:index:check && npm run migration:ledger:check"
```

- [ ] **Step 2: Add GitHub Actions**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24.18.0
          cache: npm
      - run: npm ci
      - run: npm run verify
```

- [ ] **Step 3: Record an in-progress Batch 1 inventory without claiming evidence**

Replace the existing Batch 1 entry in `docs/migration/ledger.json` with this
expanded inventory after creating the workflow file:

```json
{
  "batch": "1",
  "status": "in-progress",
  "legacySources": [],
  "ownedScopes": [
    ".github/workflows",
    "docs/classification",
    "packages/classification-core",
    "tools"
  ],
  "newOwners": [
    ".github/workflows/ci.yml",
    ".nvmrc",
    "eslint.config.js",
    "package-lock.json",
    "package.json",
    "packages/classification-core/package.json",
    "packages/classification-core/src/compiler/collector.test.ts",
    "packages/classification-core/src/compiler/collector.ts",
    "packages/classification-core/src/compiler/compile.test.ts",
    "packages/classification-core/src/compiler/compile.ts",
    "packages/classification-core/src/compiler/index.ts",
    "packages/classification-core/src/compiler/parse.test.ts",
    "packages/classification-core/src/compiler/parse.ts",
    "packages/classification-core/src/compiler/source-schema.ts",
    "packages/classification-core/src/compiler/stable-json.ts",
    "packages/classification-core/src/contracts/diagnostic-codes.ts",
    "packages/classification-core/src/contracts/diagnostic.ts",
    "packages/classification-core/src/contracts/ids.ts",
    "packages/classification-core/src/contracts/model.ts",
    "packages/classification-core/src/contracts/source-path.ts",
    "packages/classification-core/src/definitions/synthetic.ts",
    "packages/classification-core/src/index.test.ts",
    "packages/classification-core/src/index.ts",
    "packages/classification-core/tsconfig.json",
    "tools/documentation/build-index.test.ts",
    "tools/documentation/build-index.ts",
    "tools/documentation/generate-classification-index.test.ts",
    "tools/documentation/generate-classification-index.ts",
    "tools/documentation/relations.ts",
    "tools/documentation/scan-imports.test.ts",
    "tools/documentation/scan-imports.ts",
    "tools/index.ts",
    "tools/migration/check-ledger.ts",
    "tools/migration/ledger-check.test.ts",
    "tools/migration/ledger-check.ts",
    "tools/migration/ledger-schema.ts",
    "tools/migration/render-ledger.test.ts",
    "tools/migration/render-ledger.ts",
    "tools/tsconfig.json",
    "tools/validation/validate-classification.ts",
    "tsconfig.base.json",
    "tsconfig.json",
    "vitest.config.ts",
    "docs/classification/change-map.md",
    "docs/classification/index.md",
    "docs/classification/manifest.json",
    "docs/migration/ledger.md"
  ],
  "transformation": "Created new monorepo contracts, diagnostics, compiler, synthetic inventory, checked documentation index, ledger tooling, and CI without migrating legacy production behavior.",
  "behavior": "no-production-runtime-change",
  "verification": []
}
```

Replace the paragraph under `README.md` `## Current status` with:

```markdown
Batch 1 compiler foundation 已完成實作，正在執行本地與 GitHub Actions acceptance gate。現階段所有分類內容仍是 synthetic proof inventory，不是正式問卷或評分資料；production migration 只會在 Batch 2A 開始。
```

Replace the paragraph under `AGENTS.md` `## Current phase` with:

```markdown
Batch 1 is an acceptance candidate. Its contracts, diagnostics, compiler, validation CLI, generated index, ledger checks, and CI contain synthetic proof data only. Run `npm run verify` for the complete local gate. Do not begin Batch 2A or treat the synthetic inventory as production until Batch 1 has passed both local and remote CI and its ledger status is `complete`.
```

- [ ] **Step 4: Regenerate derived documentation**

Run:

```bash
npm run migration:ledger
npm run classification:index
```

Expected: generated ledger includes Batch 1 and classification files remain explicitly synthetic.

- [ ] **Step 5: Run the complete fresh gate**

Run:

```bash
npm run verify
git diff --check
git status --short
```

Expected: every verification command exits 0; `git diff --check` is empty; status contains only the intended Task 7 files before commit.

- [ ] **Step 6: Record the successful local gate as in review**

Only after Step 5 exits 0, replace the Batch 1 status and verification fields in
`docs/migration/ledger.json` with:

```json
"status": "in-review",
"verification": [
  {
    "gate": "batch1-local-verify",
    "command": "npm run verify",
    "outcome": "passed",
    "evidence": "lint, tests, typecheck, build, synthetic validation, index drift, and ledger drift checks passed on the acceptance candidate"
  }
]
```

- [ ] **Step 7: Regenerate, recheck, commit, and push the acceptance candidate**

Run:

```bash
npm run migration:ledger
npm run verify
git diff --check
git add .github package.json README.md AGENTS.md docs/migration/ledger.json docs/migration/ledger.md
git commit -m "Prepare Batch 1 acceptance"
git push -u origin codex/batch-1-compiler-foundation
git status --short --branch
```

Expected: the local gate passes after the evidence change, the candidate commit
is pushed, and the worktree is clean and tracks the remote branch.

- [ ] **Step 8: Require GitHub Actions success for the candidate SHA**

Run this command after the push. If the run is still queued or in progress, wait
20–30 seconds and run the same command again; do not promote the ledger while it
exits non-zero.

```bash
set -e
CANDIDATE_SHA="$(git rev-parse HEAD)"
CI_PROOF_FILE=".superpowers/sdd/batch1-verified-ci-proof.json"
rm -f "$CI_PROOF_FILE"
trap 'rm -f "$CI_PROOF_FILE"' EXIT
node --input-type=module -e '
import { writeFile } from "node:fs/promises"
const [sha, proofFile] = process.argv.slice(1)
const response = await fetch("https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/workflows/ci.yml/runs?branch=codex%2Fbatch-1-compiler-foundation&event=push&per_page=20", {
  headers: { Accept: "application/vnd.github+json", "User-Agent": "ramen-style-today-next" },
})
if (!response.ok) throw new Error(`GitHub API ${response.status}`)
const payload = await response.json()
const run = payload.workflow_runs.find((item) => item.head_sha === sha && item.event === "push")
if (!run) throw new Error(`No GitHub Actions run found for ${sha}`)
if (run.status !== "completed" || run.conclusion !== "success") process.exit(1)
const proof = {
  schemaVersion: 1,
  sha,
  runId: run.id,
  runUrl: run.html_url,
}
await writeFile(proofFile, `${JSON.stringify(proof, null, 2)}\n`, { flag: "wx" })
' "$CANDIDATE_SHA" "$CI_PROOF_FILE"
npm run migration:ledger:record-ci -- 1 "$CI_PROOF_FILE"
```

Expected: the workflow-specific endpoint confirms a successful `push` run for
the exact candidate SHA and writes a structured proof. The ledger tool then
independently fetches the fixed repository run resource, requires it to match
the current Git HEAD and every proof/workflow success field, atomically records
its SHA and run URL, and promotes Batch 1 to `complete`. A nonexistent run, API
failure, malformed or redirected response, mismatch, or non-success fails closed
without writing. Direct SHA and URL arguments are rejected.

- [ ] **Step 9: Replace candidate-facing copy after evidence is recorded**

Confirm that `docs/migration/ledger.json` now contains a `batch1-remote-ci`
verification object with the exact candidate `commitSha` and `runUrl`; do not
hand-edit those dynamic fields.

```bash
node --input-type=module -e '
import { readFile } from "node:fs/promises"
const ledger = JSON.parse(await readFile("docs/migration/ledger.json", "utf8"))
const entry = ledger.entries.find((item) => item.batch === "1")
const evidence = entry?.verification.find((item) => item.gate === "batch1-remote-ci")
if (entry?.status !== "complete" || !/^[0-9a-f]{40}$/.test(evidence?.commitSha ?? "") || !evidence?.runUrl) process.exit(1)
console.log(`${evidence.commitSha} ${evidence.runUrl}`)
'
```

Expected: the command prints the bound candidate SHA and GitHub Actions run URL
and exits 0.

Replace the paragraph under `README.md` `## Current status` with:

```markdown
Batch 1 已完成：repository 現在具備 strict TypeScript contracts、structured diagnostics、deterministic compiler shell、雙向檢查的分類索引、migration ledger validator 和 CI。所有分類內容仍是 synthetic proof inventory；正式 questions 與 flow 只會由 Batch 2A 開始遷移。
```

Replace the paragraph under `AGENTS.md` `## Current phase` with:

```markdown
Batch 1 is complete. The repository has strict contracts, structured diagnostics, a deterministic compiler shell, checked classification indexes, migration-ledger validation, and CI; all current classification definitions remain synthetic proof data. Run `npm run verify` before every handoff. Batch 2A may replace the synthetic question inventory only under its separately approved plan; no production scoring, persistence, catalog, Finder, or React behavior is owned here yet.
```

- [ ] **Step 10: Regenerate, verify, commit, and push completion**

The candidate SHA recorded by Step 8 is the accepted implementation artifact.
This completion commit promotes metadata and phase copy only; Step 11 is a
mandatory post-check, and a failed completion-SHA run blocks handoff even though
the candidate evidence remains valid.

Run:

```bash
npm run migration:ledger
npm run verify
git diff --check
git add README.md AGENTS.md docs/migration/ledger.json docs/migration/ledger.md
git commit -m "Complete Batch 1 compiler foundation"
git push
git status --short --branch
```

Expected: the final evidence and copy are committed and pushed from a clean
worktree; pushing triggers CI for the completion SHA.

- [ ] **Step 11: Require final CI success and verify the branch**

Run this command after the final push. If necessary, repeat it after 20–30
seconds until it identifies the final SHA; any non-success conclusion blocks
handoff.

```bash
node --input-type=module -e '
const sha = process.argv[1]
const response = await fetch("https://api.github.com/repos/AnsonHui6040/ramen-style-today-next/actions/workflows/ci.yml/runs?branch=codex%2Fbatch-1-compiler-foundation&event=push&per_page=20", {
  headers: { Accept: "application/vnd.github+json", "User-Agent": "ramen-style-today-next" },
})
if (!response.ok) throw new Error(`GitHub API ${response.status}`)
const payload = await response.json()
const run = payload.workflow_runs.find((item) => item.head_sha === sha && item.event === "push")
if (!run) throw new Error(`No GitHub Actions run found for ${sha}`)
console.log(`${run.html_url} ${run.status} ${run.conclusion ?? "pending"}`)
if (run.status !== "completed" || run.conclusion !== "success") process.exit(1)
' "$(git rev-parse HEAD)"
npm run verify
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse @{upstream})"
git status --short --branch
git log --oneline --decorate -8
```

Expected: final GitHub Actions and local verification both pass, the branch is
clean and synchronized, and eight focused Batch 1 commits are visible. The
branch is then ready for review and merge; do not merge it as part of this plan
without the repository owner's explicit integration decision.

---

## Plan self-review result

- Spec coverage: Batch 1 covers workspace boundaries, registered diagnostics, unknown-input parsing, deterministic compilation, immutable synthetic model, typed relation registry, bidirectional index checks, canonical migration ledger, CI, and complete verification.
- Scope boundary: no production questions, styles, scoring, eligibility, adapters, localized product copy, React, catalog, Finder data, or legacy outputs enter this plan.
- Interface consistency: `ConceptKey` uses `kind/id`; `CompileResult` is the sole compiler outcome; tools use only the compiler subpath; runtime consumers use the root subpath.
- Completeness gates: relation paths must be tracked leaf files, consumer registration is checked both ways, generated output directories reject orphans, and every unignored repository file must have one migration-ledger owner.
- Evidence order: local verification produces an in-review candidate; workflow-specific remote CI binds its exact SHA and run URL before atomic promotion; the metadata completion SHA must then pass the same remote and local gates before handoff.
- Execution isolation: implementation should begin from `main` on branch `codex/batch-1-compiler-foundation`; use an isolated worktree if the selected execution skill requires it.
