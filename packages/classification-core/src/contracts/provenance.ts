export const assuranceValues = Object.freeze([
  'unverified',
  'structurally-validated',
  'compiler-validated',
  'contract-verified',
  'parity-verified',
  'production-observed',
] as const)

export type Assurance = (typeof assuranceValues)[number]

export type SourceOrigin = 'legacy-production' | 'synthetic'

export interface ClassificationSourceProvenance {
  readonly questions: { readonly origin: SourceOrigin }
  readonly styles: { readonly origin: SourceOrigin }
  readonly scoringPolicy: { readonly origin: SourceOrigin }
}

export const persistenceVerificationScope =
  'pure persistence restore and payload contracts' as const

export const persistenceReadinessBlockers = Object.freeze([
  'persistence-adapter-not-integrated',
  'persisted-data-cutover-incomplete',
  'styles-not-production-verified',
  'scoring-not-production-verified',
  'runtime-cutover-incomplete',
] as const)

export type PersistenceReadinessBlocker =
  (typeof persistenceReadinessBlockers)[number]

export interface PersistenceLegacyLineage {
  readonly origin: 'legacy-production'
  readonly sourceRepository: {
    readonly host: 'github.com'
    readonly owner: 'AnsonHui6040'
    readonly repository: 'ramen-style-today'
  }
  readonly sourceCommit: string
  readonly sourceTreeHash: string
}

interface PersistenceProvenanceBase {
  readonly origin: 'manually-authored'
  readonly schemaVersion: 1
  readonly fixtureManifestPath:
    'tools/parity/fixtures/persistence/legacy-unversioned/manifest.json'
  readonly fixtureManifestHash: string
  readonly verificationScope: typeof persistenceVerificationScope
  readonly legacyLineage: PersistenceLegacyLineage
}

export type PersistenceProvenance =
  | (PersistenceProvenanceBase & {
      readonly assurance: 'structurally-validated'
    })
  | (PersistenceProvenanceBase & {
      readonly assurance: 'contract-verified'
      readonly implementationSha: string
    })

export interface ClassificationReadiness {
  readonly status: 'development' | 'migration-only'
  readonly blockers: readonly string[]
}
