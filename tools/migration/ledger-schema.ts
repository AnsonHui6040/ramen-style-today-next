import { z } from 'zod'
import { compareCodePoints } from '@ramen-style/classification-core/compiler'

export const batch2ASemanticPaths = [
  'packages/classification-core/src/definitions/questions.ts',
  'packages/classification-core/src/compiler/questions/**',
  'packages/classification-core/src/generated/question-model.ts',
  'packages/classification-core/src/flow/**',
  'tools/parity/questions/**',
  'tools/parity/fixtures/questions/**',
] as const

export const batch2AIncidentPath =
  'docs/migration/incidents/2026-07-13-legacy-cache-isolation.md' as const

export const batch2AMaintenancePaths = [
  'tools/parity/shared/**',
  'tools/parity/questions/contracts.ts',
  'tools/parity/questions/contracts.test.ts',
  'tools/parity/questions/extractor.ts',
  'tools/parity/questions/extractor.test.ts',
  'tools/parity/fixtures/questions/legacy-v1/manifest.json',
] as const

export const batch2BImplementationPaths = [
  'packages/classification-core/src/persistence/**',
  'packages/classification-core/src/contracts/diagnostic-codes.ts',
  'packages/classification-core/src/contracts/model.ts',
  'packages/classification-core/src/contracts/provenance.ts',
  'packages/classification-core/src/index.ts',
  'packages/classification-core/src/index.test.ts',
  'tools/parity/persistence/**',
  'tools/parity/fixtures/persistence/**',
] as const

export const batch2BVerificationPaths = [
  '.github/workflows/ci.yml',
  'package.json',
  'package-lock.json',
  'tools/acceptance/**',
  'tools/documentation/**',
  'tools/migration/**',
  'tools/validation/check-runtime-imports.ts',
  'tools/validation/check-runtime-imports.test.ts',
] as const

export const batch2BAcceptanceMetadataPaths = [
  'docs/classification/index.md',
  'docs/classification/manifest.json',
  'docs/migration/ledger.json',
  'docs/migration/ledger.md',
] as const

export const acceptedBatch2BImplementationSha =
  '30b71e3305b0e48a7c77e4869e2411c17941ebb8' as const

export const acceptedBatch2BMetadataSha =
  '6fba4c0dc384d3cfa27b627db6ae373f56c8b6d4' as const

export const acceptedBatch2BMetadataRunUrl =
  'https://github.com/AnsonHui6040/ramen-style-today-next/actions/runs/29411764507' as const

export const batch2BProtectedPersistencePaths = [
  'packages/classification-core/src/persistence/**',
  'tools/parity/persistence/**',
  'tools/parity/fixtures/persistence/**',
] as const

export const batch2BBoundaryMaintenancePaths = [
  'tools/migration/ledger-schema.ts',
  'tools/migration/check-ledger.ts',
  'tools/migration/ledger-check.ts',
  'tools/migration/ledger-check.test.ts',
  'tools/migration/render-ledger.ts',
  'tools/migration/render-ledger.test.ts',
  'tools/migration/record-ci.ts',
  'tools/migration/record-ci.test.ts',
  'tools/acceptance/verify-acceptance.ts',
  'tools/acceptance/verify-acceptance.test.ts',
] as const

export const batch3AImplementationPaths = [
  'docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md',
  'docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md',
  'packages/classification-core/package.json',
  'packages/classification-core/src/compiler/compile.ts',
  'packages/classification-core/src/compiler/compile.test.ts',
  'packages/classification-core/src/compiler/collector.ts',
  'packages/classification-core/src/compiler/collector.test.ts',
  'packages/classification-core/src/compiler/index.ts',
  'packages/classification-core/src/compiler/parse.ts',
  'packages/classification-core/src/compiler/parse.test.ts',
  'packages/classification-core/src/compiler/source-schema.ts',
  'packages/classification-core/src/compiler/styles/**',
  'packages/classification-core/src/contracts/diagnostic-codes.ts',
  'packages/classification-core/src/contracts/diagnostic.ts',
  'packages/classification-core/src/contracts/diagnostic.test.ts',
  'packages/classification-core/src/contracts/model.ts',
  'packages/classification-core/src/contracts/provenance.ts',
  'packages/classification-core/src/contracts/style-model.ts',
  'packages/classification-core/src/definitions/classification.ts',
  'packages/classification-core/src/definitions/styles/**',
  'packages/classification-core/src/definitions/synthetic.ts',
  'packages/classification-core/src/generated/style-model.ts',
  'packages/classification-core/src/index.ts',
  'packages/classification-core/src/index.test.ts',
  'packages/classification-core/src/style-model.ts',
  'tools/parity/styles/**',
  'tools/parity/fixtures/styles/**',
  'tools/styles/**',
] as const

export const batch3AVerificationPaths = [
  'package.json',
  'tools/acceptance/**',
  'tools/documentation/**',
  'tools/migration/**',
  'tools/validation/check-runtime-imports.ts',
  'tools/validation/check-runtime-imports.test.ts',
  'tools/validation/validate-classification.ts',
] as const

export const batch3AAcceptanceMetadataPaths = [
  'docs/classification/index.md',
  'docs/classification/manifest.json',
  'docs/migration/ledger.json',
  'docs/migration/ledger.md',
] as const

export const batch3APlanningOwners = [
  'docs/superpowers/specs/2026-07-15-batch-3a-style-compilation-design.md',
  'docs/superpowers/plans/2026-07-15-batch-3a-style-compilation.md',
] as const

export const styleFixtureManifestPath =
  'tools/parity/fixtures/styles/legacy-v1/manifest.json' as const
export const acceptedStyleFixtureManifestHash =
  'fa1a4714a77ce70489b56c54b82a812b28cd18dbc31a668a62ae51cc12e9586b' as const

export const persistenceIdentityMaintenanceChangeSha =
  '2f445f99de924f5ba428967ff68869d4d46b593f' as const
export const persistenceIdentityMaintenanceParentSha =
  '1adc6b54decc08e11bdc03f9665a8f82033fb126' as const
export const persistenceIdentityMaintenancePaths = [
  'tools/parity/fixtures/persistence/legacy-unversioned/manifest.json',
] as const
export const acceptedPersistenceFixtureManifestHash =
  '6c697167052690a8b01830fbceada056e1cbb39879fc879c34394e84e2237226' as const
export const maintainedPersistenceFixtureManifestHash =
  '71eac8596e3e79b04b26c8dde64e7c2a0df247383de851eb8ed33dd4928dd7fd' as const
export const persistenceIdentityMaintenanceCasesHash =
  'c97bb63d57773c3dec0db9eaa43b94fb4a08c40b4bfa17139746048e7370bf89' as const
export const acceptedPersistenceExtractorHash =
  '4efdee45410516ead5e39dcb3db6950453312221a89682e173772a36e05df12d' as const
export const maintainedPersistenceExtractorHash =
  '650552a696aa5f7a769fde01707427bf1d2f6ca1f10a1dcd4a919d1ad0799706' as const

export const persistenceFixtureManifestPath =
  'tools/parity/fixtures/persistence/legacy-unversioned/manifest.json' as const

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

const historicalBatch2AImplementationSha =
  'ecf9f5b4791862471d0898da7283ba4a40d3fbf9'

const fullShaSchema = z.string().regex(/^[0-9a-f]{40}$/)
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)

export const repoPathSchema = z.string().min(1).refine(
  (value) => !value.startsWith('/')
    && !value.includes('\\')
    && value.split('/').every((segment) => segment !== '.' && segment !== '..' && segment !== ''),
  'must be a repository-relative POSIX path',
).refine(
  (value) => Array.from(value).every((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint > 31 && codePoint !== 127
  }),
  'repository paths must not contain control characters',
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

function exactPathsSchema(
  expected: readonly string[],
  label: string,
) {
  return z.array(repoPathSchema).superRefine((paths, context) => {
    if (JSON.stringify(paths) !== JSON.stringify(expected)) context.addIssue({
      code: 'custom',
      message: `${label} requires exact paths: ${expected.join(', ')}`,
    })
  })
}

const batch2BAcceptanceBoundarySchema = z.strictObject({
  implementationSha: z.literal(acceptedBatch2BImplementationSha),
  metadataSha: z.literal(acceptedBatch2BMetadataSha),
  paths: exactPathsSchema(
    batch2BAcceptanceMetadataPaths,
    'Batch 2B acceptance boundary',
  ),
  verification: z.array(verificationSchema),
}).superRefine((boundary, context) => {
  const evidence = boundary.verification[0]
  if (boundary.verification.length !== 1
    || evidence?.gate !== 'batch2b-acceptance-boundary-remote-ci'
    || evidence.commitSha !== acceptedBatch2BMetadataSha
    || evidence.runUrl !== acceptedBatch2BMetadataRunUrl) {
    context.addIssue({
      code: 'custom',
      path: ['verification'],
      message: 'Batch 2B acceptance boundary requires its exact accepted metadata remote CI evidence',
    })
  }
})

const batch2BBoundaryMaintenancePathsSchema = exactPathsSchema(
  batch2BBoundaryMaintenancePaths,
  'Batch 2B boundary maintenance',
)

const inProgressBatch2BBoundaryMaintenanceSchema = z.strictObject({
  status: z.literal('in-progress'),
  paths: batch2BBoundaryMaintenancePathsSchema,
  verification: z.array(verificationSchema).length(0),
})

const completeBatch2BBoundaryMaintenanceSchema = z.strictObject({
  status: z.literal('complete'),
  maintenanceSha: fullShaSchema,
  paths: batch2BBoundaryMaintenancePathsSchema,
  verification: z.array(verificationSchema),
}).superRefine((maintenance, context) => {
  const requiredGates = new Set([
    'batch2b-boundary-maintenance-local-verify',
    'batch2b-boundary-maintenance-remote-ci',
  ])
  const gates = new Set(maintenance.verification.map(({ gate }) => gate))
  const exact = gates.size === requiredGates.size
    && maintenance.verification.length === requiredGates.size
    && [...requiredGates].every((gate) => gates.has(gate))
  if (!exact) context.addIssue({
    code: 'custom',
    path: ['verification'],
    message: 'complete Batch 2B boundary maintenance requires exact local and remote verification gates',
  })
  const remoteGate = maintenance.verification.find(
    ({ gate }) => gate === 'batch2b-boundary-maintenance-remote-ci',
  )
  if (remoteGate?.commitSha !== maintenance.maintenanceSha) context.addIssue({
    code: 'custom',
    path: ['verification'],
    message: 'complete Batch 2B boundary maintenance remote CI commit must match maintenanceSha',
  })
})

const batch2BBoundaryMaintenanceSchema = z.union([
  inProgressBatch2BBoundaryMaintenanceSchema,
  completeBatch2BBoundaryMaintenanceSchema,
])

const persistenceIdentityMaintenanceBase = {
  changeSha: z.literal(persistenceIdentityMaintenanceChangeSha),
  changeParentSha: z.literal(persistenceIdentityMaintenanceParentSha),
  paths: exactPathsSchema(
    persistenceIdentityMaintenancePaths,
    'Batch 2B persistence identity maintenance',
  ),
  acceptedFixtureManifestHash: z.literal(acceptedPersistenceFixtureManifestHash),
  maintainedFixtureManifestHash: z.literal(maintainedPersistenceFixtureManifestHash),
  casesHash: z.literal(persistenceIdentityMaintenanceCasesHash),
  acceptedExtractorHash: z.literal(acceptedPersistenceExtractorHash),
  maintainedExtractorHash: z.literal(maintainedPersistenceExtractorHash),
}

const inProgressPersistenceIdentityMaintenanceSchema = z.strictObject({
  status: z.literal('in-progress'),
  ...persistenceIdentityMaintenanceBase,
  verification: z.array(verificationSchema).length(0),
})

const completePersistenceIdentityMaintenanceSchema = z.strictObject({
  status: z.literal('complete'),
  ...persistenceIdentityMaintenanceBase,
  candidateSha: fullShaSchema,
  remoteEvidenceGate: z.literal('batch3a-remote-ci'),
  verification: z.array(verificationSchema),
}).superRefine((maintenance, context) => {
  const evidence = maintenance.verification[0]
  if (maintenance.verification.length !== 1
    || evidence?.gate !== 'batch2b-persistence-identity-maintenance-local-verify'
    || evidence.command !== 'npm run verify'
    || evidence.commitSha !== undefined
    || evidence.runUrl !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['verification'],
      message: 'complete Batch 2B persistence identity maintenance requires its exact local gate and remote reference',
    })
  }
})

const persistenceIdentityMaintenanceSchema = z.union([
  inProgressPersistenceIdentityMaintenanceSchema,
  completePersistenceIdentityMaintenanceSchema,
])

const maintenancePathsSchema = z.array(repoPathSchema).superRefine((paths, context) => {
  if (JSON.stringify(paths) !== JSON.stringify(batch2AMaintenancePaths)) {
    context.addIssue({
      code: 'custom',
      message: `Batch 2A maintenance requires exact paths: ${batch2AMaintenancePaths.join(', ')}`,
    })
  }
})

const protectedQuestionBaselineSchema = z.strictObject({
  modelVersion: z.literal(protectedQuestionBaseline.modelVersion),
  semanticHash: z.literal(protectedQuestionBaseline.semanticHash),
  generatedArtifactHash: z.literal(protectedQuestionBaseline.generatedArtifactHash),
  casesHash: z.literal(protectedQuestionBaseline.casesHash),
  fixtureContentHash: z.literal(protectedQuestionBaseline.fixtureContentHash),
  seedsHash: z.literal(protectedQuestionBaseline.seedsHash),
  instrumentationHash: z.literal(protectedQuestionBaseline.instrumentationHash),
  sourceCommit: z.literal(protectedQuestionBaseline.sourceCommit),
  sourceTreeHash: z.literal(protectedQuestionBaseline.sourceTreeHash),
})

const inProgressMaintenanceSchema = z.strictObject({
  status: z.literal('in-progress'),
  paths: maintenancePathsSchema,
  baseline: protectedQuestionBaselineSchema,
  verification: z.array(verificationSchema).length(0),
})

const completeMaintenanceSchema = z.strictObject({
  status: z.literal('complete'),
  maintenanceSha: z.string().regex(/^[0-9a-f]{40}$/),
  paths: maintenancePathsSchema,
  baseline: protectedQuestionBaselineSchema,
  verification: z.array(verificationSchema),
}).superRefine((maintenance, context) => {
  const requiredGates = new Set([
    'batch2a-maintenance-local-verify',
    'batch2a-maintenance-remote-ci',
  ])
  const gates = new Set(maintenance.verification.map(({ gate }) => gate))
  const exact = gates.size === requiredGates.size
    && maintenance.verification.length === requiredGates.size
    && [...requiredGates].every((gate) => gates.has(gate))
  if (!exact) context.addIssue({
    code: 'custom',
    path: ['verification'],
    message: 'complete Batch 2A maintenance requires exact verification gates: batch2a-maintenance-local-verify, batch2a-maintenance-remote-ci',
  })
  const remoteGate = maintenance.verification.find(
    ({ gate }) => gate === 'batch2a-maintenance-remote-ci',
  )
  if (remoteGate?.commitSha !== maintenance.maintenanceSha) context.addIssue({
    code: 'custom',
    path: ['verification'],
    message: 'complete Batch 2A maintenance remote CI commit must match maintenanceSha',
  })
})

const batch2AMaintenanceSchema = z.union([
  inProgressMaintenanceSchema,
  completeMaintenanceSchema,
])

const completionGatePolicies = new Map<string, ReadonlySet<string>>([
  ['0', new Set([
    'architecture-review',
    'batch0-document-checks',
    'batch1-plan-review',
    'legacy-build',
    'legacy-lint',
    'legacy-tests',
    'written-approval',
  ])],
  ['1', new Set([
    'batch1-local-verify',
    'batch1-remote-ci',
  ])],
  ['2A', new Set([
    'batch2a-local-verify',
    'batch2a-remote-ci',
  ])],
  ['2B', new Set([
    'batch2b-local-verify',
    'batch2b-remote-ci',
  ])],
  ['3A', new Set([
    'batch3a-local-verify',
    'batch3a-remote-ci',
  ])],
])

const entrySchema = z.strictObject({
  batch: z.enum(['0', '1', '2A', '2B', '3A']),
  status: z.enum(['in-review', 'in-progress', 'complete']),
  foundationCommit: fullShaSchema.optional(),
  implementationSha: fullShaSchema.optional(),
  semanticPaths: z.array(z.string().min(1)).optional(),
  incidents: z.array(repoPathSchema).optional(),
  maintenance: batch2AMaintenanceSchema.optional(),
  implementationPaths: z.array(repoPathSchema).optional(),
  verificationPaths: z.array(repoPathSchema).optional(),
  acceptanceMetadataPaths: z.array(repoPathSchema).optional(),
  acceptanceBoundary: batch2BAcceptanceBoundarySchema.optional(),
  boundaryMaintenance: batch2BBoundaryMaintenanceSchema.optional(),
  persistenceIdentityMaintenance: persistenceIdentityMaintenanceSchema.optional(),
  fixtureManifestHash: sha256Schema.optional(),
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
  if (entry.batch === '2A') {
    if (entry.incidents === undefined) context.addIssue({
      code: 'custom',
      path: ['incidents'],
      message: 'Batch 2A requires an incidents array',
    })
    if (JSON.stringify(entry.semanticPaths) !== JSON.stringify(batch2ASemanticPaths)) {
      context.addIssue({
        code: 'custom',
        path: ['semanticPaths'],
        message: `Batch 2A requires exact semantic paths: ${batch2ASemanticPaths.join(', ')}`,
      })
    }
    if (entry.maintenance) {
      if (entry.status !== 'complete') context.addIssue({
        code: 'custom',
        path: ['maintenance'],
        message: 'Batch 2A maintenance requires the historical batch to remain complete',
      })
      if (entry.implementationSha !== historicalBatch2AImplementationSha) context.addIssue({
        code: 'custom',
        path: ['implementationSha'],
        message: `Batch 2A maintenance preserves historical implementationSha ${historicalBatch2AImplementationSha}`,
      })
    }
    if (entry.status !== 'complete') {
      if (entry.implementationSha !== undefined) context.addIssue({
        code: 'custom',
        path: ['implementationSha'],
        message: 'Batch 2A implementationSha is recorded only when acceptance completes',
      })
      if ((entry.incidents?.length ?? 0) !== 0) context.addIssue({
        code: 'custom',
        path: ['incidents'],
        message: 'Batch 2A incidents remain empty before acceptance completes',
      })
      const invalidGate = entry.verification.find(
        ({ gate }) => gate !== 'batch2a-local-verify',
      )
      if (invalidGate) context.addIssue({
        code: 'custom',
        path: ['verification'],
        message: 'Batch 2A may record only the local verification gate before acceptance completes',
      })
    } else {
      if (!entry.implementationSha) context.addIssue({
        code: 'custom',
        path: ['implementationSha'],
        message: 'complete Batch 2A requires implementationSha',
      })
      if (entry.incidents?.length !== 1 || entry.incidents[0] !== batch2AIncidentPath) {
        context.addIssue({
          code: 'custom',
          path: ['incidents'],
          message: `complete Batch 2A requires exact incident: ${batch2AIncidentPath}`,
        })
      }
      const remoteGate = entry.verification.find(
        ({ gate }) => gate === 'batch2a-remote-ci',
      )
      if (entry.implementationSha && remoteGate?.commitSha !== entry.implementationSha) {
        context.addIssue({
          code: 'custom',
          path: ['verification'],
          message: 'complete Batch 2A remote CI commit must match implementationSha',
        })
      }
    }
  } else {
    if (entry.batch !== '2B'
      && entry.batch !== '3A'
      && entry.implementationSha !== undefined) context.addIssue({
      code: 'custom',
      path: ['implementationSha'],
      message: 'implementationSha is reserved for approved acceptance batches',
    })
    if (entry.semanticPaths !== undefined) context.addIssue({
      code: 'custom',
      path: ['semanticPaths'],
      message: 'semanticPaths are currently reserved for Batch 2A',
    })
    if (entry.incidents !== undefined) context.addIssue({
      code: 'custom',
      path: ['incidents'],
      message: 'incidents are currently reserved for Batch 2A',
    })
    if (entry.maintenance !== undefined) context.addIssue({
      code: 'custom',
      path: ['maintenance'],
      message: 'maintenance is currently reserved for Batch 2A',
    })
  }
  if (entry.batch === '2B') {
    const exactPathGroups = [
      ['implementationPaths', entry.implementationPaths, batch2BImplementationPaths],
      ['verificationPaths', entry.verificationPaths, batch2BVerificationPaths],
      [
        'acceptanceMetadataPaths',
        entry.acceptanceMetadataPaths,
        batch2BAcceptanceMetadataPaths,
      ],
    ] as const
    for (const [field, actual, expected] of exactPathGroups) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) context.addIssue({
        code: 'custom',
        path: [field],
        message: `Batch 2B requires exact ${field}: ${expected.join(', ')}`,
      })
    }
    if (!entry.fixtureManifestHash) context.addIssue({
      code: 'custom',
      path: ['fixtureManifestHash'],
      message: 'Batch 2B requires the persistence fixture manifest hash',
    })
    if (entry.persistenceIdentityMaintenance
      && entry.fixtureManifestHash !== maintainedPersistenceFixtureManifestHash) {
      context.addIssue({
        code: 'custom',
        path: ['fixtureManifestHash'],
        message: 'Batch 2B persistence identity maintenance requires the maintained fixture manifest hash',
      })
    }
    if (entry.status === 'in-review') context.addIssue({
      code: 'custom',
      path: ['status'],
      message: 'Task 14 requires Batch 2B to be in-progress or complete',
    })
    if (entry.status === 'in-progress') {
      if (entry.implementationSha !== undefined) context.addIssue({
        code: 'custom',
        path: ['implementationSha'],
        message: 'in-progress Batch 2B must not record implementationSha',
      })
      if (entry.verification.length !== 0) context.addIssue({
        code: 'custom',
        path: ['verification'],
        message: 'in-progress Batch 2B must not record acceptance evidence',
      })
      if (entry.acceptanceBoundary !== undefined
        || entry.boundaryMaintenance !== undefined
        || entry.persistenceIdentityMaintenance !== undefined) context.addIssue({
        code: 'custom',
        path: ['acceptanceBoundary'],
        message: 'Batch 2B acceptance boundary is recorded only after Batch 2B completion',
      })
    }
    if (entry.status === 'complete') {
      if (entry.implementationSha !== acceptedBatch2BImplementationSha) context.addIssue({
        code: 'custom',
        path: ['implementationSha'],
        message: `complete Batch 2B preserves implementationSha ${acceptedBatch2BImplementationSha}`,
      })
      if (!entry.acceptanceBoundary) context.addIssue({
        code: 'custom',
        path: ['acceptanceBoundary'],
        message: 'complete Batch 2B requires the accepted metadata boundary',
      })
      if (!entry.boundaryMaintenance) context.addIssue({
        code: 'custom',
        path: ['boundaryMaintenance'],
        message: 'complete Batch 2B requires boundary maintenance state',
      })
      const remoteGate = entry.verification.find(
        ({ gate }) => gate === 'batch2b-remote-ci',
      )
      if (entry.implementationSha && remoteGate?.commitSha !== entry.implementationSha) {
        context.addIssue({
          code: 'custom',
          path: ['verification'],
          message: 'complete Batch 2B remote CI commit must match implementationSha',
        })
      }
    }
  } else if (entry.batch === '3A') {
    const exactPathGroups = [
      ['implementationPaths', entry.implementationPaths, batch3AImplementationPaths],
      ['verificationPaths', entry.verificationPaths, batch3AVerificationPaths],
      [
        'acceptanceMetadataPaths',
        entry.acceptanceMetadataPaths,
        batch3AAcceptanceMetadataPaths,
      ],
    ] as const
    for (const [field, actual, expected] of exactPathGroups) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) context.addIssue({
        code: 'custom',
        path: [field],
        message: `Batch 3A requires exact ${field}: ${expected.join(', ')}`,
      })
    }
    if (entry.fixtureManifestHash !== acceptedStyleFixtureManifestHash) context.addIssue({
      code: 'custom',
      path: ['fixtureManifestHash'],
      message: `Batch 3A requires style fixture manifest hash ${acceptedStyleFixtureManifestHash}`,
    })
    for (const owner of batch3APlanningOwners) {
      if (!entry.newOwners.includes(owner)) context.addIssue({
        code: 'custom',
        path: ['newOwners'],
        message: `Batch 3A requires exact planning owner ${owner}`,
      })
    }
    if (entry.status === 'in-review') context.addIssue({
      code: 'custom',
      path: ['status'],
      message: 'Task 17 requires Batch 3A to be in-progress or complete',
    })
    if (entry.status === 'in-progress') {
      if (entry.implementationSha !== undefined) context.addIssue({
        code: 'custom',
        path: ['implementationSha'],
        message: 'in-progress Batch 3A must not record implementationSha',
      })
      if (entry.verification.length !== 0) context.addIssue({
        code: 'custom',
        path: ['verification'],
        message: 'in-progress Batch 3A must not record acceptance evidence',
      })
    }
    if (entry.status === 'complete') {
      if (!entry.implementationSha) context.addIssue({
        code: 'custom',
        path: ['implementationSha'],
        message: 'complete Batch 3A requires implementationSha',
      })
      const remoteGate = entry.verification.find(
        ({ gate }) => gate === 'batch3a-remote-ci',
      )
      if (entry.implementationSha && remoteGate?.commitSha !== entry.implementationSha) {
        context.addIssue({
          code: 'custom',
          path: ['verification'],
          message: 'complete Batch 3A remote CI commit must match implementationSha',
        })
      }
    }
  } else {
    for (const field of [
      'implementationPaths',
      'verificationPaths',
      'acceptanceMetadataPaths',
      'fixtureManifestHash',
    ] as const) {
      if (entry[field] !== undefined) context.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} is reserved for Batch 2B or Batch 3A`,
      })
    }
  }
  if (entry.batch !== '2B') {
    for (const field of [
      'acceptanceBoundary',
      'boundaryMaintenance',
      'persistenceIdentityMaintenance',
    ] as const) {
      if (entry[field] !== undefined) context.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} is reserved for Batch 2B`,
      })
    }
  }
  if (entry.status === 'complete') {
    const requiredGates = completionGatePolicies.get(entry.batch)
    if (!requiredGates) {
      context.addIssue({
        code: 'custom',
        path: ['verification'],
        message: `complete Batch ${entry.batch} has no approved completion gate policy`,
      })
    } else {
      const exact = gates.size === requiredGates.size
        && [...requiredGates].every((gate) => gates.has(gate))
      if (!exact) context.addIssue({
        code: 'custom',
        path: ['verification'],
        message: `complete Batch ${entry.batch} requires exact verification gates: ${[
          ...requiredGates,
        ].sort(compareCodePoints).join(', ')}`,
      })
    }
  }
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

  const batch2BIndex = ledger.entries.findIndex(({ batch }) => batch === '2B')
  const batch3AIndex = ledger.entries.findIndex(({ batch }) => batch === '3A')
  const batch2B = ledger.entries[batch2BIndex]
  const batch3A = ledger.entries[batch3AIndex]
  const identityMaintenance = batch2B?.persistenceIdentityMaintenance
  if (batch3A) {
    if (!batch2B || !identityMaintenance) context.addIssue({
      code: 'custom',
      path: ['entries', batch2BIndex >= 0 ? batch2BIndex : batch3AIndex],
      message: 'Batch 3A requires the exact Batch 2B persistence identity maintenance binding',
    })
    if (batch3A.status === 'in-progress'
      && identityMaintenance?.status !== 'in-progress') context.addIssue({
      code: 'custom',
      path: ['entries', batch2BIndex, 'persistenceIdentityMaintenance'],
      message: 'in-progress Batch 3A requires in-progress persistence identity maintenance',
    })
    if (batch3A.status === 'complete') {
      if (identityMaintenance?.status !== 'complete') context.addIssue({
        code: 'custom',
        path: ['entries', batch2BIndex, 'persistenceIdentityMaintenance'],
        message: 'complete Batch 3A requires complete persistence identity maintenance',
      })
      if (identityMaintenance?.status === 'complete') {
        if (identityMaintenance.candidateSha !== batch3A.implementationSha) {
          context.addIssue({
            code: 'custom',
            path: ['entries', batch2BIndex, 'persistenceIdentityMaintenance', 'candidateSha'],
            message: 'persistence identity maintenance candidateSha must match Batch 3A implementationSha',
          })
        }
        const referencedRemote = batch3A.verification.filter(
          ({ gate }) => gate === identityMaintenance.remoteEvidenceGate,
        )
        if (referencedRemote.length !== 1
          || referencedRemote[0]?.commitSha !== identityMaintenance.candidateSha) context.addIssue({
          code: 'custom',
          path: ['entries', batch2BIndex, 'persistenceIdentityMaintenance'],
          message: 'persistence identity maintenance must reference the single exact Batch 3A remote evidence',
        })
      }
    }
  } else if (identityMaintenance !== undefined) context.addIssue({
    code: 'custom',
    path: ['entries', batch2BIndex, 'persistenceIdentityMaintenance'],
    message: 'persistence identity maintenance is recorded only with Batch 3A ownership',
  })
})

export type MigrationLedger = z.infer<typeof migrationLedgerSchema>
