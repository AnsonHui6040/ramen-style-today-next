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
])

const entrySchema = z.strictObject({
  batch: z.string().min(1),
  status: z.enum(['in-review', 'in-progress', 'complete']),
  foundationCommit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  implementationSha: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  semanticPaths: z.array(z.string().min(1)).optional(),
  incidents: z.array(repoPathSchema).optional(),
  maintenance: batch2AMaintenanceSchema.optional(),
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
    if (entry.implementationSha !== undefined) context.addIssue({
      code: 'custom',
      path: ['implementationSha'],
      message: 'implementationSha is currently reserved for Batch 2A',
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
})

export type MigrationLedger = z.infer<typeof migrationLedgerSchema>
