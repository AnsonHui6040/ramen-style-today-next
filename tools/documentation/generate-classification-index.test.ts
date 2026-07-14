import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { expect, test } from 'vitest'
import { z } from 'zod'

import { compileQuestions } from '@ramen-style/classification-core/compiler'
import { installGeneratedOutputs } from './generate-classification-index.js'
import * as generatorModule from './generate-classification-index.js'
import { documentationDefinition } from './relations.js'

const sourceRoot = resolve(import.meta.dirname, '../..')
const implementationSha = 'a'.repeat(40)
const currentSemanticHash = 'b'.repeat(64)
const currentFixtureManifestHash = 'c'.repeat(64)

const futureVerificationSchema = z.object({
  gate: z.string(),
  command: z.string(),
  outcome: z.string(),
  evidence: z.string(),
  commitSha: z.string().optional(),
  runUrl: z.string().optional(),
}).passthrough()
const futureLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(z.object({
    batch: z.string(),
    status: z.string(),
    implementationSha: z.string().optional(),
    verification: z.array(futureVerificationSchema),
  }).passthrough()),
}).passthrough()

function acceptedBatch2AEntry(overrides: Record<string, unknown> = {}) {
  return {
    batch: '2A',
    status: 'complete',
    implementationSha,
    verification: [
      {
        gate: 'batch2a-local-verify',
        command: 'npm run verify',
        outcome: 'passed',
        evidence: 'offline verification passed',
      },
      {
        gate: 'batch2a-remote-ci',
        command: 'GitHub Actions CI / verify',
        outcome: 'passed',
        evidence: 'authenticated remote verification passed',
        commitSha: implementationSha,
        runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      },
    ],
    ...overrides,
  }
}

function validatedFutureLedger(entry: Record<string, unknown> = acceptedBatch2AEntry()) {
  return futureLedgerSchema.parse({
    schemaVersion: 1,
    entries: [entry],
  })
}

function projectionFunction() {
  const project = (generatorModule as unknown as {
    projectQuestionParityVerification?: (
      ledger: unknown,
      identity: { fixtureManifestHash: string; semanticHash: string },
    ) => unknown
  }).projectQuestionParityVerification
  expect(project).toBeTypeOf('function')
  if (!project) throw new Error('projectQuestionParityVerification is unavailable')
  return project
}

function writeRegisteredConsumers(repoRoot: string) {
  for (const [file, importedPackage] of [
    ['tools/parity/questions/observable-trace.ts', '@ramen-style/classification-core/compiler'],
    ['tools/parity/questions/parity.ts', '@ramen-style/classification-core/compiler'],
    ['tools/questions/generate-question-model.ts', '@ramen-style/classification-core/compiler'],
    ['tools/validation/validate-classification.ts', '@ramen-style/classification-core/compiler'],
  ] as const) {
    const target = join(repoRoot, file)
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, `import '${importedPackage}'\n`)
  }
}

function writeDocumentationFixture(repoRoot: string) {
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

  const contractsTarget = join(repoRoot, 'tools/parity/questions/contracts.ts')
  mkdirSync(resolve(contractsTarget, '..'), { recursive: true })
  cpSync(join(sourceRoot, 'tools/parity/questions/contracts.ts'), contractsTarget)
  const fixtureManifest = 'tools/parity/fixtures/questions/legacy-v1/manifest.json'
  const fixtureManifestTarget = join(repoRoot, fixtureManifest)
  mkdirSync(resolve(fixtureManifestTarget, '..'), { recursive: true })
  cpSync(join(sourceRoot, fixtureManifest), fixtureManifestTarget)
  const ledgerSchema = 'tools/migration/ledger-schema.ts'
  const ledgerSchemaTarget = join(repoRoot, ledgerSchema)
  mkdirSync(resolve(ledgerSchemaTarget, '..'), { recursive: true })
  cpSync(join(sourceRoot, ledgerSchema), ledgerSchemaTarget)
  const ledgerSource = 'docs/migration/ledger.json'
  const ledgerSourceTarget = join(repoRoot, ledgerSource)
  mkdirSync(resolve(ledgerSourceTarget, '..'), { recursive: true })
  cpSync(join(sourceRoot, ledgerSource), ledgerSourceTarget)

  for (const file of [
    'packages/classification-core/src/definitions/questions.ts',
    'packages/classification-core/src/definitions/questions.test.ts',
    'packages/classification-core/src/definitions/synthetic.ts',
    'packages/classification-core/src/compiler/questions/source-schema.ts',
    'packages/classification-core/src/compiler/questions/compile.ts',
    'packages/classification-core/src/compiler/questions/proof.ts',
    'packages/classification-core/src/compiler/questions/proof.test.ts',
    'packages/classification-core/src/compiler/source-schema.ts',
    'packages/classification-core/src/compiler/compile.ts',
    'packages/classification-core/src/compiler/compile.test.ts',
    'packages/classification-core/src/flow/evaluate.ts',
    'tools/parity/questions/parity.test.ts',
  ]) {
    const target = join(repoRoot, file)
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, '')
  }
  writeRegisteredConsumers(repoRoot)
}

function writeFutureLedgerSchema(repoRoot: string) {
  writeFileSync(
    join(repoRoot, 'tools/migration/ledger-schema.ts'),
    String.raw`import { z } from 'zod'

const verificationSchema = z.object({
  gate: z.string(),
  command: z.string(),
  outcome: z.string(),
  evidence: z.string(),
  commitSha: z.string().optional(),
  runUrl: z.string().optional(),
}).passthrough()

export const migrationLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(z.object({
    batch: z.string(),
    status: z.string(),
    implementationSha: z.string().optional(),
    verification: z.array(verificationSchema),
  }).passthrough()),
}).passthrough()
`,
  )
}

function runGenerator(repoRoot: string) {
  return spawnSync(
    process.execPath,
    [
      join(sourceRoot, 'node_modules/tsx/dist/cli.mjs'),
      join(repoRoot, 'tools/documentation/generate-classification-index.ts'),
      '--write',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
}

test('current in-progress Batch 2A ledger yields no question verification', () => {
  const loadQuestionEvidence = (generatorModule as unknown as {
    loadQuestionEvidence?: (
      repoRoot: string,
      metadata: {
        compilerVersion: string
        modelVersion: string
        schemaVersion: string
        semanticHash: string
        sourceHash: string
      },
    ) => { verification?: unknown }
  }).loadQuestionEvidence
  expect(loadQuestionEvidence).toBeTypeOf('function')
  if (!loadQuestionEvidence) throw new Error('loadQuestionEvidence is unavailable')
  const compiled = compileQuestions(documentationDefinition.questions)
  if (!compiled.ok) throw new Error('production questions did not compile')

  expect(loadQuestionEvidence(sourceRoot, compiled.model.metadata).verification).toBeUndefined()
})

test('projects one verification from a validated accepted Batch 2A ledger', () => {
  const project = projectionFunction()

  expect(project(validatedFutureLedger(), {
    semanticHash: currentSemanticHash,
    fixtureManifestHash: currentFixtureManifestHash,
  })).toEqual({
    assurance: 'parity-verified',
    parityScope: 'legacy-observable-transition-projection',
    fixtureManifestHash: currentFixtureManifestHash,
    paritySuiteVersion: '1',
    verifiedSemanticHash: currentSemanticHash,
    implementationSha,
  })
})

test.each([
  ['not complete', () => acceptedBatch2AEntry({ status: 'in-review' })],
  ['missing implementation SHA', () => acceptedBatch2AEntry({
    implementationSha: undefined,
  })],
  ['malformed implementation SHA', () => acceptedBatch2AEntry({
    implementationSha: 'a'.repeat(39),
  })],
  ['missing local gate', () => acceptedBatch2AEntry({
    verification: acceptedBatch2AEntry().verification.filter(
      ({ gate }) => gate !== 'batch2a-local-verify',
    ),
  })],
  ['missing remote gate', () => acceptedBatch2AEntry({
    verification: acceptedBatch2AEntry().verification.filter(
      ({ gate }) => gate !== 'batch2a-remote-ci',
    ),
  })],
  ['non-passed local gate', () => acceptedBatch2AEntry({
    verification: acceptedBatch2AEntry().verification.map((item) => (
      item.gate === 'batch2a-local-verify' ? { ...item, outcome: 'failed' } : item
    )),
  })],
  ['non-passed remote gate', () => acceptedBatch2AEntry({
    verification: acceptedBatch2AEntry().verification.map((item) => (
      item.gate === 'batch2a-remote-ci' ? { ...item, outcome: 'failed' } : item
    )),
  })],
  ['mismatched remote commit', () => acceptedBatch2AEntry({
    verification: acceptedBatch2AEntry().verification.map((item) => (
      item.gate === 'batch2a-remote-ci'
        ? { ...item, commitSha: 'd'.repeat(40) }
        : item
    )),
  })],
] as const)('omits verification for a validated acceptance state with %s', (
  _label,
  entry,
) => {
  const project = projectionFunction()

  expect(project(validatedFutureLedger(entry()), {
    semanticHash: currentSemanticHash,
    fixtureManifestHash: currentFixtureManifestHash,
  })).toBeUndefined()
})

test('Task 14-shaped ledger roundtrip renders manifest-only bound verification', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-acceptance-'))
  try {
    writeDocumentationFixture(repoRoot)
    writeFileSync(join(repoRoot, '.gitignore'), 'node_modules/\n')
    symlinkSync(join(sourceRoot, 'node_modules'), join(repoRoot, 'node_modules'), 'dir')
    execFileSync('git', ['init', '--quiet'], { cwd: repoRoot })
    const classificationRoot = join(repoRoot, 'docs/classification')
    mkdirSync(classificationRoot, { recursive: true })
    writeFileSync(join(classificationRoot, 'change-map.md'), '# Change map\n')
    writeFileSync(join(classificationRoot, 'manifest.json'), 'old manifest\n')
    writeFileSync(join(classificationRoot, 'index.md'), 'old index\n')

    const preAcceptance = runGenerator(repoRoot)
    expect(preAcceptance.status, preAcceptance.stderr).toBe(0)
    const preAcceptanceManifest = JSON.parse(readFileSync(
      join(classificationRoot, 'manifest.json'),
      'utf8',
    ))
    const preAcceptanceIndex = readFileSync(join(classificationRoot, 'index.md'), 'utf8')
    expect(preAcceptanceManifest.provenance.questions).not.toHaveProperty('verification')

    writeFutureLedgerSchema(repoRoot)
    writeFileSync(
      join(repoRoot, 'docs/migration/ledger.json'),
      `${JSON.stringify(validatedFutureLedger(), null, 2)}\n`,
    )
    const accepted = runGenerator(repoRoot)
    expect(accepted.status, accepted.stderr).toBe(0)
    const acceptedManifest = JSON.parse(readFileSync(
      join(classificationRoot, 'manifest.json'),
      'utf8',
    ))
    const fixtureManifestHash = createHash('sha256').update(readFileSync(
      join(repoRoot, 'tools/parity/fixtures/questions/legacy-v1/manifest.json'),
    )).digest('hex')

    expect(acceptedManifest.provenance.questions.verification).toEqual({
      assurance: 'parity-verified',
      parityScope: 'legacy-observable-transition-projection',
      fixtureManifestHash,
      paritySuiteVersion: '1',
      verifiedSemanticHash: acceptedManifest.provenance.questions.semanticHash,
      implementationSha,
    })
    expect(readFileSync(join(classificationRoot, 'index.md'), 'utf8'))
      .toBe(preAcceptanceIndex)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}, 20_000)

test('write mode rejects an owned output symlink before changing any output', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-cli-'))
  const externalRoot = mkdtempSync(join(tmpdir(), 'ramen-index-outside-'))
  try {
    writeDocumentationFixture(repoRoot)

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
        join(repoRoot, 'tools/documentation/generate-classification-index.ts'),
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

test('write mode rejects a symlinked classification root without writing outside the repository', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-cli-'))
  const externalRoot = mkdtempSync(join(tmpdir(), 'ramen-index-outside-'))
  try {
    writeDocumentationFixture(repoRoot)

    writeFileSync(join(repoRoot, '.gitignore'), 'node_modules/\n')
    symlinkSync(join(sourceRoot, 'node_modules'), join(repoRoot, 'node_modules'), 'dir')
    execFileSync('git', ['init', '--quiet'], { cwd: repoRoot })
    mkdirSync(join(repoRoot, 'docs'), { recursive: true })
    symlinkSync(externalRoot, join(repoRoot, 'docs/classification'), 'dir')

    const result = spawnSync(
      process.execPath,
      [
        join(sourceRoot, 'node_modules/tsx/dist/cli.mjs'),
        join(repoRoot, 'tools/documentation/generate-classification-index.ts'),
        '--write',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'DOC_INDEX_DRIFT owned output parent must be a regular repository directory',
    )
    expect(readdirSync(externalRoot)).toEqual([])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(externalRoot, { recursive: true, force: true })
  }
})

test('a second output install failure restores both originals and removes transaction artifacts', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-transaction-'))
  try {
    const classificationRoot = join(repoRoot, 'docs/classification')
    mkdirSync(classificationRoot, { recursive: true })
    const manifest = join(classificationRoot, 'manifest.json')
    const index = join(classificationRoot, 'index.md')
    writeFileSync(manifest, 'original manifest\n')
    writeFileSync(index, 'original index\n')

    let temporaryInstallCount = 0
    expect(() => installGeneratedOutputs(
      repoRoot,
      new Map([
        ['docs/classification/manifest.json', 'new manifest\n'],
        ['docs/classification/index.md', 'new index\n'],
      ]),
      {
        rename: (from, to) => {
          if (lstatSync(from).isFile() && from.includes('.tmp-')) {
            temporaryInstallCount += 1
            if (temporaryInstallCount === 2) throw new Error('simulated second install failure')
          }
          renameSync(from, to)
        },
      },
    )).toThrow('simulated second install failure')

    expect(readFileSync(manifest, 'utf8')).toBe('original manifest\n')
    expect(readFileSync(index, 'utf8')).toBe('original index\n')
    expect(readdirSync(classificationRoot).sort()).toEqual(['index.md', 'manifest.json'])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('Git inventory preserves a newline-containing eligible consumer path', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-cli-'))
  try {
    writeDocumentationFixture(repoRoot)
    const newlineConsumer = join(repoRoot, 'apps/web/line\nbreak.ts')
    mkdirSync(resolve(newlineConsumer, '..'), { recursive: true })
    writeFileSync(newlineConsumer, "import '@ramen-style/classification-core'\n")

    writeFileSync(join(repoRoot, '.gitignore'), 'node_modules/\n')
    symlinkSync(join(sourceRoot, 'node_modules'), join(repoRoot, 'node_modules'), 'dir')
    execFileSync('git', ['init', '--quiet'], { cwd: repoRoot })
    const classificationRoot = join(repoRoot, 'docs/classification')
    mkdirSync(classificationRoot, { recursive: true })
    writeFileSync(join(classificationRoot, 'change-map.md'), '# Change map\n')
    writeFileSync(join(classificationRoot, 'manifest.json'), 'old manifest\n')
    writeFileSync(join(classificationRoot, 'index.md'), 'old index\n')

    const result = spawnSync(
      process.execPath,
      [
        join(sourceRoot, 'node_modules/tsx/dist/cli.mjs'),
        join(repoRoot, 'tools/documentation/generate-classification-index.ts'),
        '--write',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      'Detected core consumer is not registered: apps/web/line\\nbreak.ts',
    )
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})
