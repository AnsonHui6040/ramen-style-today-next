import { execFileSync } from 'node:child_process'

import { compareCodePoints } from '@ramen-style/classification-core/compiler'

import type { MigrationLedger } from './ledger-schema.js'
import {
  acceptedBatch3AMetadataSha,
  batch2BAcceptanceMetadataPaths,
  batch2BProtectedPersistencePaths,
  batch3AAcceptanceMetadataPaths,
  batch3AProtectedStylePaths,
  batch3BAcceptanceMetadataPaths,
  batch3BApprovedDependencyTestPaths,
  migrationLedgerSchema,
  protectedQuestionBaseline,
} from './ledger-schema.js'
import { renderLedger } from './render-ledger.js'

export interface LedgerCheckInput {
  input: unknown
  repoFiles: ReadonlySet<string>
  existingFiles: ReadonlySet<string>
  repoDirectories: ReadonlySet<string>
  repositoryFileHashes?: ReadonlyMap<string, string>
  currentMarkdown: string | undefined
}

export interface LedgerCheckResult {
  ok: boolean
  errors: readonly string[]
  ledger: MigrationLedger | undefined
  markdown: string | undefined
}

const fullShaPattern = /^[0-9a-f]{40}$/

type CommitAncestryCheck = (
  ancestorSha: string,
  currentHeadSha: string,
) => boolean | Promise<boolean>

export interface LedgerRepositoryState extends Omit<LedgerCheckInput, 'input'> {
  currentHeadSha: string
  isCommitAncestor: CommitAncestryCheck
  directParentsOf: (
    commitSha: string,
  ) => readonly string[] | Promise<readonly string[]>
  changedPathsBetween: (
    ancestorSha: string,
    currentHeadSha: string,
  ) => readonly string[] | Promise<readonly string[]>
  questionSemanticHash: string
  classificationSemanticHash: string
  fixtureManifestHash: string
  classificationFixtureManifestHash: string
  persistenceFixtureManifestHash?: string
  classificationPersistenceFixtureManifestHash?: string
  persistenceFixtureCasesHash?: string
  persistenceFixtureExtractorHash?: string
  styleFixtureManifestHash?: string
  classificationStyleFixtureManifestHash?: string
  scoringFixtureManifestHash?: string
  classificationScoringFixtureManifestHash?: string
  questionBaseline?: {
    readonly [Key in keyof typeof protectedQuestionBaseline]: string
  }
}

export interface SemanticAncestryInput {
  implementationSha: string
  candidateSha: string
  semanticPaths: readonly string[]
  changedPaths: readonly string[]
}

function nulSeparatedGitPaths(repoRoot: string, args: readonly string[]) {
  const output = execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return output.split('\0').filter(Boolean)
}

export function collectGitChangedPaths(
  repoRoot: string,
  implementationSha: string,
  currentHeadSha: string,
) {
  const changedPaths = new Set<string>()
  const commands: Array<readonly string[]> = [
    [
      'log',
      '--format=',
      '--name-only',
      '--no-renames',
      '-z',
      `${implementationSha}..${currentHeadSha}`,
      '--',
    ],
  ]
  const repositoryHead = execFileSync(
    'git',
    ['rev-parse', 'HEAD'],
    { cwd: repoRoot, encoding: 'utf8' },
  ).trim()
  if (repositoryHead === currentHeadSha) commands.push(
    [
      'diff',
      '--cached',
      '--name-only',
      '--no-renames',
      '-z',
      currentHeadSha,
      '--',
    ],
    [
      'diff',
      '--name-only',
      '--no-renames',
      '-z',
      '--',
    ],
  )
  for (const command of commands) {
    for (const file of nulSeparatedGitPaths(repoRoot, command)) changedPaths.add(file)
  }
  return [...changedPaths].sort(compareCodePoints)
}

function matchesSemanticPath(file: string, semanticPath: string) {
  if (semanticPath.endsWith('/**')) {
    const directory = semanticPath.slice(0, -3)
    return file.startsWith(`${directory}/`)
  }
  return file === semanticPath
}

function changedProtectedMaintenancePath(
  changedPaths: readonly string[],
  semanticPaths: readonly string[],
  maintenancePaths: readonly string[],
) {
  return changedPaths.find((file) => (
    semanticPaths.some((semanticPath) => matchesSemanticPath(file, semanticPath))
    && !maintenancePaths.some((maintenancePath) => matchesSemanticPath(file, maintenancePath))
  ))
}

export async function verifySemanticAncestry(
  input: SemanticAncestryInput,
): Promise<void> {
  if (!fullShaPattern.test(input.implementationSha)
    || !fullShaPattern.test(input.candidateSha)) {
    throw new Error('semantic ancestry requires full lowercase Git SHAs')
  }
  const changedSemanticPath = input.changedPaths.find((file) => (
    input.semanticPaths.some((semanticPath) => matchesSemanticPath(file, semanticPath))
  ))
  if (changedSemanticPath) {
    throw new Error(
      `semantic path changed after implementation SHA: ${changedSemanticPath}`,
    )
  }
}

export async function verifyExactMetadataBoundary(input: {
  implementationSha: string
  metadataSha: string
  expectedPaths: readonly string[]
  directParentsOf: LedgerRepositoryState['directParentsOf']
  changedPathsBetween: LedgerRepositoryState['changedPathsBetween']
  label: string
}): Promise<void> {
  const parents = await input.directParentsOf(input.metadataSha)
  if (parents.length !== 1 || parents[0] !== input.implementationSha) {
    throw new Error(
      `${input.label} metadata SHA ${input.metadataSha} must have exactly one parent ${input.implementationSha}`,
    )
  }
  const changedPaths = [
    ...await input.changedPathsBetween(input.implementationSha, input.metadataSha),
  ].sort(compareCodePoints)
  const expectedPaths = [...input.expectedPaths].sort(compareCodePoints)
  if (JSON.stringify(changedPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(`${input.label} requires the exact acceptance metadata path set`)
  }
}

export async function checkLedgerOffline(
  input: unknown,
  state: LedgerRepositoryState,
): Promise<LedgerCheckResult> {
  const base = checkLedger({ input, ...state })
  if (!base.ledger) return base
  const errors = [...base.errors]
  const hasBatch3B = base.ledger.entries.some(({ batch }) => batch === '3B')

  if (!fullShaPattern.test(state.currentHeadSha)) {
    errors.push('Current repository HEAD must be a full lowercase SHA')
  }
  if (base.ledger.entries.some(({ batch }) => batch === '2A')) {
    if (state.questionSemanticHash !== state.classificationSemanticHash) {
      errors.push('classification manifest question semantic hash is inconsistent')
    }
    if (state.fixtureManifestHash !== state.classificationFixtureManifestHash) {
      errors.push('classification manifest observable-trace fixture manifest hash is inconsistent')
    }
  }

  const batch2B = base.ledger.entries.find(({ batch }) => batch === '2B')
  if (batch2B) {
    if (batch2B.fixtureManifestHash !== state.persistenceFixtureManifestHash) {
      errors.push('Batch 2B fixture manifest hash is inconsistent with tracked bytes')
    }
    if (state.classificationPersistenceFixtureManifestHash
      !== state.persistenceFixtureManifestHash) {
      errors.push('classification manifest persistence fixture manifest hash is inconsistent')
    }
    if (batch2B.status === 'complete' && batch2B.acceptanceBoundary) {
      const boundary = batch2B.acceptanceBoundary
      const parents = await state.directParentsOf(boundary.metadataSha)
      if (parents.length !== 1 || parents[0] !== boundary.implementationSha) {
        errors.push(
          `Batch 2B accepted metadata SHA ${boundary.metadataSha} must have exactly one parent ${boundary.implementationSha}`,
        )
      }
      const boundaryChangedPaths = [
        ...await state.changedPathsBetween(
          boundary.implementationSha,
          boundary.metadataSha,
        ),
      ].sort(compareCodePoints)
      const expectedBoundaryPaths = [...batch2BAcceptanceMetadataPaths]
        .sort(compareCodePoints)
      if (JSON.stringify(boundaryChangedPaths) !== JSON.stringify(expectedBoundaryPaths)) {
        errors.push('Batch 2B accepted boundary requires the exact acceptance metadata path set')
      }
      if (!await state.isCommitAncestor(boundary.metadataSha, state.currentHeadSha)) {
        errors.push(
          `Batch 2B accepted metadata SHA ${boundary.metadataSha} is not an ancestor of current HEAD ${state.currentHeadSha}`,
        )
      } else {
        const changedPaths = await state.changedPathsBetween(
          boundary.metadataSha,
          state.currentHeadSha,
        )
        const identityMaintenance = batch2B.persistenceIdentityMaintenance
        for (const file of changedPaths) {
          if (batch2BProtectedPersistencePaths.some(
            (path) => matchesSemanticPath(file, path),
          ) && !(hasBatch3B && batch3BApprovedDependencyTestPaths.includes(
            file as typeof batch3BApprovedDependencyTestPaths[number],
          )) && !identityMaintenance?.paths.includes(
            file as typeof identityMaintenance.paths[number],
          )) {
            errors.push(
              `Batch 2B protected persistence path changed after accepted metadata SHA: ${file}`,
            )
          }
        }

        if (identityMaintenance) {
          const parents = await state.directParentsOf(identityMaintenance.changeSha)
          if (parents.length !== 1 || parents[0] !== identityMaintenance.changeParentSha) {
            errors.push(
              `Batch 2B persistence identity change SHA ${identityMaintenance.changeSha} must have exactly one parent ${identityMaintenance.changeParentSha}`,
            )
          }
          const payloadPaths = [
            ...await state.changedPathsBetween(
              identityMaintenance.changeParentSha,
              identityMaintenance.changeSha,
            ),
          ].sort(compareCodePoints)
          const expectedPayloadPaths = [...identityMaintenance.paths].sort(compareCodePoints)
          if (JSON.stringify(payloadPaths) !== JSON.stringify(expectedPayloadPaths)) {
            errors.push('Batch 2B persistence identity payload requires its exact one-file diff')
          }
          if (!await state.isCommitAncestor(
            identityMaintenance.changeSha,
            state.currentHeadSha,
          )) {
            errors.push(
              `Batch 2B persistence identity change SHA ${identityMaintenance.changeSha} is not an ancestor of current HEAD ${state.currentHeadSha}`,
            )
          } else {
            const changedAfterPayload = await state.changedPathsBetween(
              identityMaintenance.changeSha,
              state.currentHeadSha,
            )
            for (const file of changedAfterPayload) {
              if (batch2BProtectedPersistencePaths.some(
                (path) => matchesSemanticPath(file, path),
              ) && !(hasBatch3B && batch3BApprovedDependencyTestPaths.includes(
                file as typeof batch3BApprovedDependencyTestPaths[number],
              ))) errors.push(
                `Batch 2B protected persistence path changed after identity payload SHA: ${file}`,
              )
            }
          }
          if (state.persistenceFixtureCasesHash !== identityMaintenance.casesHash) {
            errors.push(
              'Batch 2B persistence identity cases hash is inconsistent with tracked manifest',
            )
          }
          if (state.persistenceFixtureExtractorHash
            !== identityMaintenance.maintainedExtractorHash) {
            errors.push(
              'Batch 2B persistence identity extractor hash is inconsistent with tracked manifest',
            )
          }
        }
      }

      const maintenance = batch2B.boundaryMaintenance
      if (maintenance?.status === 'complete') {
        if (!await state.isCommitAncestor(maintenance.maintenanceSha, state.currentHeadSha)) {
          errors.push(
            `Batch 2B boundary maintenance SHA ${maintenance.maintenanceSha} is not an ancestor of current HEAD ${state.currentHeadSha}`,
          )
        } else if (!base.ledger.entries.some(({ batch }) => batch === '3A')) {
          const completionPaths = await state.changedPathsBetween(
            maintenance.maintenanceSha,
            state.currentHeadSha,
          )
          if (completionPaths.length === 0
            || completionPaths.some((file) => !batch2BAcceptanceMetadataPaths.includes(
              file as typeof batch2BAcceptanceMetadataPaths[number],
            ))) {
            errors.push(
              'Batch 2B boundary maintenance completion requires a non-empty acceptance-metadata-only diff',
            )
          }
        }
      }
    }
  }

  const batch3A = base.ledger.entries.find(({ batch }) => batch === '3A')
  if (batch3A) {
    if (batch3A.fixtureManifestHash !== state.styleFixtureManifestHash) {
      errors.push('Batch 3A fixture manifest hash is inconsistent with tracked bytes')
    }
    if (state.classificationStyleFixtureManifestHash !== state.styleFixtureManifestHash) {
      errors.push('classification manifest style fixture manifest hash is inconsistent')
    }
    if (batch3A.status === 'complete' && batch3A.implementationSha) {
      if (hasBatch3B) {
        const parents = await state.directParentsOf(acceptedBatch3AMetadataSha)
        if (parents.length !== 1 || parents[0] !== batch3A.implementationSha) {
          errors.push(
            `Batch 3A accepted metadata SHA ${acceptedBatch3AMetadataSha} must have exactly one parent ${batch3A.implementationSha}`,
          )
        }
        const acceptedPaths = [
          ...await state.changedPathsBetween(
            batch3A.implementationSha,
            acceptedBatch3AMetadataSha,
          ),
        ].sort(compareCodePoints)
        const expectedPaths = [...batch3AAcceptanceMetadataPaths].sort(compareCodePoints)
        if (JSON.stringify(acceptedPaths) !== JSON.stringify(expectedPaths)) {
          errors.push('Batch 3A accepted boundary requires the exact acceptance metadata path set')
        }
        if (!await state.isCommitAncestor(acceptedBatch3AMetadataSha, state.currentHeadSha)) {
          errors.push(
            `Batch 3A accepted metadata SHA ${acceptedBatch3AMetadataSha} is not an ancestor of current HEAD ${state.currentHeadSha}`,
          )
        } else {
          const changedAfterAcceptance = await state.changedPathsBetween(
            acceptedBatch3AMetadataSha,
            state.currentHeadSha,
          )
          for (const file of changedAfterAcceptance) {
            if (batch3AProtectedStylePaths.some(
              (path) => matchesSemanticPath(file, path),
            ) && !batch3BApprovedDependencyTestPaths.includes(
              file as typeof batch3BApprovedDependencyTestPaths[number],
            )) errors.push(
              `Batch 3A protected style path changed after accepted metadata SHA: ${file}`,
            )
          }
        }
      } else if (!await state.isCommitAncestor(batch3A.implementationSha, state.currentHeadSha)) {
        errors.push(
          `Batch 3A implementation SHA ${batch3A.implementationSha} is not an ancestor of current HEAD ${state.currentHeadSha}`,
        )
      } else {
        const completionPaths = [
          ...await state.changedPathsBetween(
            batch3A.implementationSha,
            state.currentHeadSha,
          ),
        ].sort(compareCodePoints)
        const frozenPath = completionPaths.find((file) => (
          [
            ...(batch3A.implementationPaths ?? []),
            ...(batch3A.verificationPaths ?? []),
          ].some(
            (path) => matchesSemanticPath(file, path),
          )
        ))
        if (frozenPath) errors.push(
          `Batch 3A candidate completion changed a frozen path: ${frozenPath}`,
        )
        const expectedPaths = [...batch3AAcceptanceMetadataPaths].sort(compareCodePoints)
        if (JSON.stringify(completionPaths) !== JSON.stringify(expectedPaths)) {
          errors.push('Batch 3A completion requires the exact acceptance metadata path set')
        }
      }
    }
  }

  const batch3B = base.ledger.entries.find(({ batch }) => batch === '3B')
  if (batch3B) {
    if (!batch3A || batch3A.status !== 'complete') {
      errors.push('Batch 3B requires completed Batch 3A')
    }
    if (batch3B.scoringFixtureManifestHash !== state.scoringFixtureManifestHash) {
      errors.push('Batch 3B scoring fixture manifest hash is inconsistent with tracked bytes')
    }
    if (state.classificationScoringFixtureManifestHash
      !== state.scoringFixtureManifestHash) {
      errors.push('classification manifest scoring fixture manifest hash is inconsistent')
    }
    if (batch3B.status === 'complete' && batch3B.implementationSha) {
      if (!await state.isCommitAncestor(batch3B.implementationSha, state.currentHeadSha)) {
        errors.push(
          `Batch 3B implementation SHA ${batch3B.implementationSha} is not an ancestor of current HEAD ${state.currentHeadSha}`,
        )
      } else {
        const completionPaths = [
          ...await state.changedPathsBetween(
            batch3B.implementationSha,
            state.currentHeadSha,
          ),
        ].sort(compareCodePoints)
        const frozenPath = completionPaths.find((file) => (
          [
            ...(batch3B.implementationPaths ?? []),
            ...(batch3B.verificationPaths ?? []),
          ].some((path) => matchesSemanticPath(file, path))
        ))
        if (frozenPath) errors.push(
          `Batch 3B candidate completion changed a frozen path: ${frozenPath}`,
        )
        const expectedPaths = [...batch3BAcceptanceMetadataPaths].sort(compareCodePoints)
        if (JSON.stringify(completionPaths) !== JSON.stringify(expectedPaths)) {
          errors.push('Batch 3B completion requires the exact acceptance metadata path set')
        }
        if (state.currentHeadSha !== batch3B.implementationSha) {
          try {
            await verifyExactMetadataBoundary({
              implementationSha: batch3B.implementationSha,
              metadataSha: state.currentHeadSha,
              expectedPaths: batch3BAcceptanceMetadataPaths,
              directParentsOf: state.directParentsOf,
              changedPathsBetween: state.changedPathsBetween,
              label: 'Batch 3B completion',
            })
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error))
          }
        }
      }
    }
  }

  for (const entry of base.ledger.entries) {
    for (const incident of entry.incidents ?? []) {
      if (!state.repoFiles.has(incident) || !state.existingFiles.has(incident)) {
        errors.push(
          `Batch ${entry.batch} incident is not an existing regular repository file: ${incident}`,
        )
      }
    }
    const verificationEvidence = [
      ...entry.verification,
      ...(entry.maintenance?.verification ?? []),
    ]
    for (const evidence of verificationEvidence) {
      if (!evidence.gate.endsWith('-remote-ci') || !evidence.commitSha) continue
      if (!await state.isCommitAncestor(evidence.commitSha, state.currentHeadSha)) {
        errors.push(
          `Recorded remote CI commit ${evidence.commitSha} is not an ancestor of current HEAD ${state.currentHeadSha}`,
        )
      }
    }
    if (entry.maintenance) {
      if (!state.questionBaseline) {
        errors.push('Batch 2A maintenance protected baseline is unavailable')
      } else {
        for (const key of Object.keys(protectedQuestionBaseline) as Array<
          keyof typeof protectedQuestionBaseline
        >) {
          if (state.questionBaseline[key] !== entry.maintenance.baseline[key]) {
            errors.push(`Batch 2A maintenance protected baseline mismatch: ${key}`)
          }
        }
      }
    }
    if (entry.batch !== '2A' || entry.status !== 'complete' || !entry.implementationSha) {
      continue
    }
    if (!await state.isCommitAncestor(entry.implementationSha, state.currentHeadSha)) {
      errors.push(
        `Batch 2A implementation SHA ${entry.implementationSha} is not an ancestor of current HEAD ${state.currentHeadSha}`,
      )
      continue
    }
    const changedPaths = await state.changedPathsBetween(
      entry.implementationSha,
      state.currentHeadSha,
    )
    if (entry.maintenance) {
      if (changedProtectedMaintenancePath(
        changedPaths,
        entry.semanticPaths ?? [],
        entry.maintenance.paths,
      )) {
        errors.push('Batch 2A maintenance changed a protected question path')
      }
      continue
    }
    try {
      await verifySemanticAncestry({
        implementationSha: entry.implementationSha,
        candidateSha: state.currentHeadSha,
        semanticPaths: entry.semanticPaths ?? [],
        changedPaths,
      })
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    ...base,
    ok: errors.length === 0,
    errors: errors.sort(compareCodePoints),
  }
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
  const maintenanceOwners = parsed.data.entries.flatMap((entry) => {
    const maintenancePaths = entry.maintenance?.paths
    if (!maintenancePaths) return []
    return [...input.repoFiles]
      .filter((file) => maintenancePaths.some(
        (path) => matchesSemanticPath(file, path),
      ))
      .map((file) => ({ batch: entry.batch, file }))
  })
  const allOwners = new Set([
    ...parsed.data.entries.flatMap((entry) => entry.newOwners),
    ...maintenanceOwners.map(({ file }) => file),
  ])
  const retiredOwners = new Set(parsed.data.entries.flatMap(
    (entry) => entry.retiredOwners ?? [],
  ))
  for (const owner of maintenanceOwners) {
    if (!input.existingFiles.has(owner.file)) {
      errors.push(
        `Batch ${owner.batch} maintenance owner is not an existing repository file: ${owner.file}`,
      )
    }
  }
  for (const entry of parsed.data.entries) {
    for (const owner of entry.newOwners) {
      if (retiredOwners.has(owner)) {
        if (input.repoFiles.has(owner) || input.existingFiles.has(owner)) {
          errors.push(`Retired migration-ledger owner still exists: ${owner}`)
        }
      } else if (!input.repoFiles.has(owner) || !input.existingFiles.has(owner)) {
        errors.push(`Batch ${entry.batch} owner is not an existing repository file: ${owner}`)
      }
    }
    for (const scope of entry.ownedScopes) {
      if (!input.repoDirectories.has(scope)) {
        errors.push(`Batch ${entry.batch} owned scope is not a repository directory: ${scope}`)
        continue
      }
      const scopedFiles = [...input.repoFiles].filter(
        (file) => file.startsWith(`${scope}/`),
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
    errors: errors.sort(compareCodePoints),
    ledger: parsed.data,
    markdown,
  }
}
