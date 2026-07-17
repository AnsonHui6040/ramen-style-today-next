import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
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

import { styleDefinitions } from '@ramen-style/classification-core/compiler'
import { questionModel } from '@ramen-style/classification-core/generated/question-model'
import { styleModel } from '@ramen-style/classification-core/generated/style-model'
import {
  installGeneratedOutputs,
  repositoryFiles,
} from './generate-classification-index.js'
import * as generatorModule from './generate-classification-index.js'
import {
  batch2ASemanticPaths,
  batch2BAcceptanceMetadataPaths,
  batch2BImplementationPaths,
  batch2BVerificationPaths,
} from '../migration/ledger-schema.js'
import { scanCoreConsumers } from './scan-imports.js'
import { documentationDetectedConsumers } from './relations.js'

const sourceRoot = resolve(import.meta.dirname, '../..')
const implementationSha = 'a'.repeat(40)
const currentSemanticHash = 'b'.repeat(64)
const currentFixtureManifestHash = 'c'.repeat(64)
const currentStyleDataVersion = styleModel.metadata.dataVersion

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

function persistenceProjectionFunction() {
  const project = (generatorModule as unknown as {
    projectPersistenceContractVerification?: (
      ledger: unknown,
      identity: { fixtureManifestHash: string },
    ) => unknown
  }).projectPersistenceContractVerification
  expect(project).toBeTypeOf('function')
  if (!project) throw new Error('projectPersistenceContractVerification is unavailable')
  return project
}

function styleProjectionFunction() {
  const project = (generatorModule as unknown as {
    projectStyleParityVerification?: (
      ledger: unknown,
      identity: {
        fixtureManifestHash: string
        semanticHash: string
        dataVersion: string
      },
    ) => unknown
  }).projectStyleParityVerification
  expect(project).toBeTypeOf('function')
  if (!project) throw new Error('projectStyleParityVerification is unavailable')
  return project
}

function batch3AEntry(overrides: Record<string, unknown> = {}) {
  return {
    batch: '3A',
    status: 'complete',
    implementationSha,
    fixtureManifestHash: currentFixtureManifestHash,
    verification: [
      {
        gate: 'batch3a-local-verify',
        command: 'npm run verify',
        outcome: 'passed',
        evidence: 'full offline verification including style parity passed',
      },
      {
        gate: 'batch3a-remote-ci',
        command: 'GitHub Actions CI / verify',
        outcome: 'passed',
        evidence: 'authenticated exact-SHA remote verification passed',
        commitSha: implementationSha,
        runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
      },
    ],
    ...overrides,
  }
}

function validatedBatch3ALedger(entry: Record<string, unknown> = batch3AEntry()) {
  return futureLedgerSchema.parse({
    schemaVersion: 1,
    entries: [entry],
  })
}

function batch2BEntry(
  status: 'in-progress' | 'complete',
  overrides: Record<string, unknown> = {},
) {
  return {
    batch: '2B',
    status,
    ...(status === 'complete' ? { implementationSha } : {}),
    implementationPaths: [...batch2BImplementationPaths],
    verificationPaths: [...batch2BVerificationPaths],
    acceptanceMetadataPaths: [...batch2BAcceptanceMetadataPaths],
    fixtureManifestHash: currentFixtureManifestHash,
    legacySources: ['src/App.tsx'],
    ownedScopes: [],
    newOwners: ['packages/classification-core/src/persistence/contracts.ts'],
    transformation: 'Persistence documentation fixture.',
    behavior: 'no-production-runtime-change',
    verification: status === 'complete'
      ? [
          {
            gate: 'batch2b-local-verify',
            command: 'npm run verify',
            outcome: 'passed',
            evidence: 'offline verification passed',
          },
          {
            gate: 'batch2b-remote-ci',
            command: 'GitHub Actions CI / verify',
            outcome: 'passed',
            evidence: 'authenticated remote verification passed',
            commitSha: implementationSha,
            runUrl: 'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/123',
          },
        ]
      : [],
    ...overrides,
  }
}

function writeRegisteredConsumers(repoRoot: string) {
  for (const [file, importedPackage] of [
    ['tools/parity/questions/observable-trace.ts', '@ramen-style/classification-core/compiler'],
    ['tools/parity/questions/parity.ts', '@ramen-style/classification-core/compiler'],
    ['tools/parity/scoring/parity.ts', '@ramen-style/classification-core'],
    ['tools/parity/scoring/verify-fixtures.ts', '@ramen-style/classification-core'],
    ['tools/parity/styles/parity.ts', '@ramen-style/classification-core/compiler'],
    ['tools/questions/generate-question-model.ts', '@ramen-style/classification-core/compiler'],
    ['tools/scoring/generate-classification-model.ts', '@ramen-style/classification-core/compiler'],
    ['tools/styles/generate-style-model.ts', '@ramen-style/classification-core/compiler'],
    ['tools/validation/validate-classification.ts', '@ramen-style/classification-core/compiler'],
  ] as const) {
    const target = join(repoRoot, file)
    mkdirSync(resolve(target, '..'), { recursive: true })
    if (!existsSync(target)
      || !readFileSync(target, 'utf8').includes('@ramen-style/classification-core')) {
      writeFileSync(target, `import '${importedPackage}'\n`)
    }
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

  for (const file of [
    'tools/parity/shared/contracts.ts',
    'tools/parity/shared/authoring.ts',
    'tools/parity/styles/contracts.ts',
    'tools/parity/styles/verify-fixtures.ts',
    'tools/parity/styles/extractor.ts',
    'tools/parity/styles/extract.ts',
    'tools/parity/styles/legacy-instrumentation.patch',
    'tools/parity/styles/seeds.json',
    'tools/parity/fixtures/styles/legacy-v1/cases.json',
    'tools/parity/fixtures/styles/legacy-v1/manifest.json',
    'packages/classification-core/src/generated/style-model.ts',
    'tools/parity/scoring/contracts.ts',
    'tools/parity/scoring/verify-fixtures.ts',
    'tools/parity/scoring/extractor.ts',
    'tools/parity/scoring/extract.ts',
    'tools/parity/scoring/legacy-instrumentation.patch',
    'tools/parity/scoring/seeds.json',
    'tools/parity/fixtures/scoring/legacy-v1/cases.json',
    'tools/parity/fixtures/scoring/legacy-v1/manifest.json',
    'packages/classification-core/src/generated/classification-model.ts',
  ]) {
    const target = join(repoRoot, file)
    mkdirSync(resolve(target, '..'), { recursive: true })
    cpSync(join(sourceRoot, file), target)
  }
  const ledgerSchema = 'tools/migration/ledger-schema.ts'
  const ledgerSchemaTarget = join(repoRoot, ledgerSchema)
  mkdirSync(resolve(ledgerSchemaTarget, '..'), { recursive: true })
  cpSync(join(sourceRoot, ledgerSchema), ledgerSchemaTarget)

  for (const file of [
    'packages/classification-core/src/definitions/questions.ts',
    'packages/classification-core/src/definitions/questions.test.ts',
    'packages/classification-core/src/definitions/synthetic.ts',
    'packages/classification-core/src/definitions/policies.ts',
    'packages/classification-core/src/definitions/styles/definitions.test.ts',
    'packages/classification-core/src/compiler/questions/source-schema.ts',
    'packages/classification-core/src/compiler/questions/compile.ts',
    'packages/classification-core/src/compiler/questions/proof.ts',
    'packages/classification-core/src/compiler/questions/proof.test.ts',
    'packages/classification-core/src/compiler/source-schema.ts',
    'packages/classification-core/src/compiler/compile.ts',
    'packages/classification-core/src/compiler/compile.test.ts',
    'packages/classification-core/src/compiler/styles/source-schema.ts',
    'packages/classification-core/src/compiler/styles/compile.ts',
    'packages/classification-core/src/compiler/styles/proof.ts',
    'packages/classification-core/src/compiler/styles/source-schema.test.ts',
    'packages/classification-core/src/compiler/styles/compile.test.ts',
    'packages/classification-core/src/compiler/styles/proof.test.ts',
    'packages/classification-core/src/compiler/styles/serialize.test.ts',
    'packages/classification-core/src/compiler/scoring-policy/source-schema.ts',
    'packages/classification-core/src/compiler/scoring-policy/compile.ts',
    'packages/classification-core/src/compiler/scoring-policy/proof.ts',
    'packages/classification-core/src/compiler/scoring-policy/source-schema.test.ts',
    'packages/classification-core/src/compiler/scoring-policy/compile.test.ts',
    'packages/classification-core/src/compiler/scoring-policy/proof.test.ts',
    'packages/classification-core/src/flow/evaluate.ts',
    'packages/classification-core/src/classification-model.ts',
    'packages/classification-core/src/scoring/score.ts',
    'packages/classification-core/src/scoring/score.test.ts',
    'packages/classification-core/src/style-model.ts',
    'packages/classification-core/src/index.ts',
    'packages/classification-core/src/definitions/styles/taxonomy.ts',
    'tools/parity/questions/parity.test.ts',
    'tools/parity/styles/parity.ts',
    'tools/parity/styles/parity.test.ts',
    'tools/parity/scoring/parity.test.ts',
    'tools/scoring/generate-classification-model.test.ts',
    'tools/styles/generate-style-model.test.ts',
    ...styleDefinitions.map((style) => style.sourceFile),
  ]) {
    const target = join(repoRoot, file)
    mkdirSync(resolve(target, '..'), { recursive: true })
    if (!existsSync(target)) writeFileSync(target, '')
  }
  writeRegisteredConsumers(repoRoot)
}

function writePreAcceptanceLedger(repoRoot: string) {
  const ledgerPath = join(repoRoot, 'docs/migration/ledger.json')
  mkdirSync(resolve(ledgerPath, '..'), { recursive: true })
  writeFileSync(ledgerPath, `${JSON.stringify({
    schemaVersion: 1,
    baseline: {
      repository: 'AnsonHui6040/ramen-style-today-next',
      commit: '0'.repeat(40),
    },
    entries: [{
      batch: '2A',
      status: 'in-review',
      semanticPaths: [...batch2ASemanticPaths],
      incidents: [],
      legacySources: ['test-owned legacy questionnaire fixture'],
      ownedScopes: [],
      newOwners: ['packages/classification-core/src/definitions/questions.ts'],
      transformation: 'Compile the test-owned legacy questionnaire fixture.',
      behavior: 'Preserve the test-owned pre-acceptance questionnaire behavior.',
      verification: [],
    }],
  }, null, 2)}\n`)
}

function createPreAcceptanceManifestBytes() {
  const preAcceptance = JSON.parse(readFileSync(
    join(sourceRoot, 'docs/classification/manifest.json'),
    'utf8',
  ))
  delete preAcceptance.provenance.questions.verification

  return `${JSON.stringify(preAcceptance, null, 2)}\n`
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

  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-pre-acceptance-'))
  try {
    const fixtureManifest = 'tools/parity/fixtures/questions/legacy-v1/manifest.json'
    const fixtureManifestTarget = join(repoRoot, fixtureManifest)
    mkdirSync(resolve(fixtureManifestTarget, '..'), { recursive: true })
    cpSync(join(sourceRoot, fixtureManifest), fixtureManifestTarget)
    writePreAcceptanceLedger(repoRoot)

    expect(loadQuestionEvidence(repoRoot, questionModel.metadata).verification).toBeUndefined()
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
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

test('projects persistence contract verification only from completed exact evidence', () => {
  const project = persistenceProjectionFunction()

  expect(project(validatedFutureLedger(batch2BEntry('complete')), {
    fixtureManifestHash: currentFixtureManifestHash,
  })).toEqual({
    assurance: 'contract-verified',
    fixtureManifestHash: currentFixtureManifestHash,
    implementationSha,
  })

  expect(project(validatedFutureLedger(batch2BEntry('in-progress')), {
    fixtureManifestHash: currentFixtureManifestHash,
  })).toBeUndefined()
  expect(project(validatedFutureLedger(batch2BEntry('complete', {
    fixtureManifestHash: 'd'.repeat(64),
  })), {
    fixtureManifestHash: currentFixtureManifestHash,
  })).toBeUndefined()
})

test('projects style parity verification only from completed exact candidate evidence', () => {
  const project = styleProjectionFunction()
  expect(project(validatedBatch3ALedger(), {
    fixtureManifestHash: currentFixtureManifestHash,
    semanticHash: currentSemanticHash,
    dataVersion: currentStyleDataVersion,
  })).toEqual({
    assurance: 'parity-verified',
    parityScope: 'legacy-compiled-style-projection',
    fixtureManifestHash: currentFixtureManifestHash,
    verifiedSemanticHash: currentSemanticHash,
    verifiedDataVersion: currentStyleDataVersion,
    implementationSha,
  })
})

test.each([
  ['in progress', { status: 'in-progress', implementationSha: undefined, verification: [] }],
  ['missing implementation SHA', { implementationSha: undefined }],
  ['wrong fixture manifest hash', { fixtureManifestHash: 'd'.repeat(64) }],
  ['missing local evidence', { verification: batch3AEntry().verification.slice(1) }],
  ['missing remote evidence', { verification: batch3AEntry().verification.slice(0, 1) }],
  ['failed local evidence', {
    verification: batch3AEntry().verification.map((item) => (
      item.gate === 'batch3a-local-verify' ? { ...item, outcome: 'failed' } : item
    )),
  }],
  ['failed remote evidence', {
    verification: batch3AEntry().verification.map((item) => (
      item.gate === 'batch3a-remote-ci' ? { ...item, outcome: 'failed' } : item
    )),
  }],
  ['wrong remote SHA', {
    verification: batch3AEntry().verification.map((item) => (
      item.gate === 'batch3a-remote-ci'
        ? { ...item, commitSha: 'd'.repeat(40) }
        : item
    )),
  }],
] as const)('rejects style parity verification with %s', (_label, overrides) => {
  const project = styleProjectionFunction()
  expect(project(validatedBatch3ALedger(batch3AEntry(overrides)), {
    fixtureManifestHash: currentFixtureManifestHash,
    semanticHash: currentSemanticHash,
    dataVersion: currentStyleDataVersion,
  })).toBeUndefined()
})

test('loads the full committed style fixture and artifact identity without live extraction', () => {
  const loadStyleEvidence = (generatorModule as unknown as {
    loadStyleEvidence?: (
      repoRoot: string,
      metadata: typeof styleModel.metadata,
      validatedLedger: unknown,
    ) => Record<string, unknown>
  }).loadStyleEvidence
  expect(loadStyleEvidence).toBeTypeOf('function')
  if (!loadStyleEvidence) throw new Error('loadStyleEvidence is unavailable')

  const evidence = loadStyleEvidence(sourceRoot, styleModel.metadata, {
    schemaVersion: 1,
    entries: [],
  })
  expect(evidence).toMatchObject({
    fixtureManifestHash: 'fa1a4714a77ce70489b56c54b82a812b28cd18dbc31a668a62ae51cc12e9586b',
    fixtureCasesHash: 'cd48d42b596e1d7d71757a8cec109f7787d21596a8905a06c505fefbd0f93517',
    fixtureContentHash: 'd33119e4d36a8b37314805dc8e439f724a37bf62b91fd3288a780ad67c2c3028',
    instrumentationVersion: '1',
    artifactHash: '46a63367179ce8874b10f2c6fc828a5816460bf463abac9d087ec77d8acfad3e',
    sourceHash: styleModel.metadata.sourceHash,
    semanticHash: styleModel.metadata.semanticHash,
    dataVersion: styleModel.metadata.dataVersion,
    coverage: {
      styles: 18,
      cores: 54,
      subtypes: 270,
      rules: 378,
      bonusCopies: 54,
      conflictCopies: 21,
      exclusionTags: 6,
      copyRoles: 8,
    },
  })
  expect(evidence).not.toHaveProperty('verification')
  expect(loadStyleEvidence.toString()).not.toMatch(
    /execFile|spawn|fetch|writeFile|rename|legacyCheckout/u,
  )
})

test('registers every detected classification-core consumer', () => {
  const detected = scanCoreConsumers(
    sourceRoot,
    ['apps', 'packages', 'tools'],
    repositoryFiles(sourceRoot),
  )
  expect([...detected]).toEqual([...documentationDetectedConsumers])
})

test.each([
  ['manifest coverage drift', (repoRoot: string) => {
    const path = join(repoRoot, 'tools/parity/fixtures/styles/legacy-v1/manifest.json')
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    manifest.coverage.rules = 377
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  }],
  ['raw cases drift', (repoRoot: string) => {
    const path = join(repoRoot, 'tools/parity/fixtures/styles/legacy-v1/cases.json')
    writeFileSync(path, `${readFileSync(path, 'utf8')} `)
  }],
  ['missing fixture', (repoRoot: string) => {
    rmSync(join(repoRoot, 'tools/parity/fixtures/styles/legacy-v1/cases.json'))
  }],
] as const)('rejects style evidence with %s', (_label, mutate) => {
  const loadStyleEvidence = (generatorModule as unknown as {
    loadStyleEvidence: (
      repoRoot: string,
      metadata: typeof styleModel.metadata,
      validatedLedger: unknown,
    ) => Record<string, unknown>
  }).loadStyleEvidence
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-style-evidence-invalid-'))
  try {
    writeDocumentationFixture(repoRoot)
    mutate(repoRoot)
    expect(() => loadStyleEvidence(repoRoot, styleModel.metadata, {
      schemaVersion: 1,
      entries: [],
    })).toThrow()
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('pre-wires style artifact and parity gates without removing existing verify gates', () => {
  const scripts = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8')).scripts
  expect(scripts.verify).toBe([
    'npm run lint',
    'npm test',
    'npm run typecheck',
    'npm run build',
    'npm run classification:validate',
    'npm run questions:check',
    'npm run styles:check',
    'npm run classification-model:check',
    'npm run runtime:imports:check',
    'npm run parity:questions',
    'npm run parity:persistence',
    'npm run parity:styles',
    'npm run parity:scoring',
    'npm run classification:index:check',
    'npm run migration:ledger:check',
  ].join(' && '))
  expect(scripts['styles:check']).toBe('tsx tools/styles/generate-style-model.ts --check')
  expect(scripts['parity:styles']).toBe('tsx tools/parity/styles/parity.ts')
  expect(scripts.verify).not.toMatch(/extract|--replace|--write|curl|wget/u)
})

test('loads tracked persistence identity as structurally validated before acceptance', async () => {
  const loadPersistenceEvidence = (generatorModule as unknown as {
    loadPersistenceEvidence?: (repoRoot: string) => Promise<Record<string, unknown>>
  }).loadPersistenceEvidence
  expect(loadPersistenceEvidence).toBeTypeOf('function')
  if (!loadPersistenceEvidence) throw new Error('loadPersistenceEvidence is unavailable')

  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-persistence-evidence-'))
  try {
    const manifestPath = 'tools/parity/fixtures/persistence/legacy-unversioned/manifest.json'
    const manifestTarget = join(repoRoot, manifestPath)
    mkdirSync(resolve(manifestTarget, '..'), { recursive: true })
    cpSync(join(sourceRoot, manifestPath), manifestTarget)
    const fixtureManifestHash = createHash('sha256')
      .update(readFileSync(manifestTarget))
      .digest('hex')
    const ledgerPath = join(repoRoot, 'docs/migration/ledger.json')
    mkdirSync(resolve(ledgerPath, '..'), { recursive: true })
    writeFileSync(ledgerPath, `${JSON.stringify({
      schemaVersion: 1,
      baseline: {
        repository: 'AnsonHui6040/ramen-style-today',
        commit: '0'.repeat(40),
      },
      entries: [batch2BEntry('in-progress', { fixtureManifestHash })],
    }, null, 2)}\n`)

    await expect(loadPersistenceEvidence(repoRoot)).resolves.toEqual({
      origin: 'manually-authored',
      assurance: 'structurally-validated',
      schemaVersion: 1,
      fixtureManifestPath: manifestPath,
      fixtureManifestHash,
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
    })
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('rejects a persistence fixture that fails its full manifest schema', async () => {
  const loadPersistenceEvidence = (generatorModule as unknown as {
    loadPersistenceEvidence?: (repoRoot: string) => unknown
  }).loadPersistenceEvidence
  expect(loadPersistenceEvidence).toBeTypeOf('function')
  if (!loadPersistenceEvidence) throw new Error('loadPersistenceEvidence is unavailable')

  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-persistence-evidence-invalid-'))
  try {
    const manifestPath = 'tools/parity/fixtures/persistence/legacy-unversioned/manifest.json'
    const manifestTarget = join(repoRoot, manifestPath)
    mkdirSync(resolve(manifestTarget, '..'), { recursive: true })
    const malformedManifest = JSON.parse(readFileSync(join(sourceRoot, manifestPath), 'utf8'))
    malformedManifest.caseCount = 999
    writeFileSync(manifestTarget, `${JSON.stringify(malformedManifest, null, 2)}\n`)
    const fixtureManifestHash = createHash('sha256')
      .update(readFileSync(manifestTarget))
      .digest('hex')
    const ledgerPath = join(repoRoot, 'docs/migration/ledger.json')
    mkdirSync(resolve(ledgerPath, '..'), { recursive: true })
    writeFileSync(ledgerPath, `${JSON.stringify({
      schemaVersion: 1,
      baseline: {
        repository: 'AnsonHui6040/ramen-style-today',
        commit: '0'.repeat(40),
      },
      entries: [batch2BEntry('in-progress', { fixtureManifestHash })],
    }, null, 2)}\n`)

    await expect(Promise.resolve().then(() => loadPersistenceEvidence(repoRoot)))
      .rejects.toThrow()
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
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
    writePreAcceptanceLedger(repoRoot)
    const classificationRoot = join(repoRoot, 'docs/classification')
    mkdirSync(classificationRoot, { recursive: true })
    for (const file of ['change-map.md', 'index.md']) {
      cpSync(join(sourceRoot, 'docs/classification', file), join(classificationRoot, file))
    }
    writeFileSync(
      join(classificationRoot, 'manifest.json'),
      createPreAcceptanceManifestBytes(),
    )
    const generatedPreAcceptance = runGenerator(repoRoot)
    expect(generatedPreAcceptance.status, generatedPreAcceptance.stderr).toBe(0)
    const preAcceptanceManifestBytes = readFileSync(
      join(classificationRoot, 'manifest.json'),
      'utf8',
    )
    const preAcceptanceManifest = JSON.parse(preAcceptanceManifestBytes)
    const preAcceptanceIndex = readFileSync(join(classificationRoot, 'index.md'), 'utf8')
    expect(preAcceptanceManifest.provenance.questions).not.toHaveProperty('verification')

    writeFutureLedgerSchema(repoRoot)
    writeFileSync(
      join(repoRoot, 'docs/migration/ledger.json'),
      `${JSON.stringify(validatedFutureLedger(), null, 2)}\n`,
    )
    const accepted = runGenerator(repoRoot)
    expect(accepted.status, accepted.stderr).toBe(0)
    const acceptedManifestBytes = readFileSync(
      join(classificationRoot, 'manifest.json'),
      'utf8',
    )
    const acceptedManifest = JSON.parse(acceptedManifestBytes)
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
    expect(acceptedManifestBytes).not.toBe(preAcceptanceManifestBytes)
    expect(readFileSync(join(classificationRoot, 'index.md'), 'utf8'))
      .toBe(preAcceptanceIndex)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
}, 30_000)

test('write mode rejects an owned output symlink before changing any output', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-cli-'))
  const externalRoot = mkdtempSync(join(tmpdir(), 'ramen-index-outside-'))
  try {
    const classificationRoot = join(repoRoot, 'docs/classification')
    mkdirSync(classificationRoot, { recursive: true })
    const manifest = join(classificationRoot, 'manifest.json')
    writeFileSync(manifest, 'manifest remains unchanged\n')
    const externalTarget = join(externalRoot, 'outside.md')
    writeFileSync(externalTarget, 'outside remains unchanged\n')
    symlinkSync(externalTarget, join(classificationRoot, 'index.md'))

    expect(() => installGeneratedOutputs(repoRoot, new Map([
      ['docs/classification/manifest.json', 'new manifest\n'],
      ['docs/classification/index.md', 'new index\n'],
    ]))).toThrow(
      'DOC_INDEX_DRIFT generated output must be a regular file: docs/classification/index.md',
    )
    expect(readFileSync(externalTarget, 'utf8')).toBe('outside remains unchanged\n')
    expect(readFileSync(manifest, 'utf8')).toBe('manifest remains unchanged\n')
    expect(readdirSync(classificationRoot).sort()).toEqual(['index.md', 'manifest.json'])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(externalRoot, { recursive: true, force: true })
  }
})

test('write mode rejects a symlinked classification root without writing outside the repository', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ramen-index-cli-'))
  const externalRoot = mkdtempSync(join(tmpdir(), 'ramen-index-outside-'))
  try {
    mkdirSync(join(repoRoot, 'docs'), { recursive: true })
    symlinkSync(externalRoot, join(repoRoot, 'docs/classification'), 'dir')

    expect(() => installGeneratedOutputs(repoRoot, new Map([
      ['docs/classification/index.md', 'new index\n'],
    ]))).toThrow(
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
    const newlineConsumerPath = 'apps/web/line\nbreak.ts'
    const newlineConsumer = join(repoRoot, newlineConsumerPath)
    mkdirSync(resolve(newlineConsumer, '..'), { recursive: true })
    writeFileSync(newlineConsumer, "import '@ramen-style/classification-core'\n")

    execFileSync('git', ['init', '--quiet'], { cwd: repoRoot })
    const eligibleFiles = repositoryFiles(repoRoot)

    expect(eligibleFiles).toContain(newlineConsumerPath)
    expect([...scanCoreConsumers(repoRoot, ['apps'], eligibleFiles)])
      .toEqual([newlineConsumerPath])
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})
