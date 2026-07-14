import { execFileSync } from 'node:child_process'

import { compareCodePoints } from '@ramen-style/classification-core/compiler'

import type { MigrationLedger } from './ledger-schema.js'
import { migrationLedgerSchema } from './ledger-schema.js'
import { renderLedger } from './render-ledger.js'

export interface LedgerCheckInput {
  input: unknown
  repoFiles: ReadonlySet<string>
  existingFiles: ReadonlySet<string>
  repoDirectories: ReadonlySet<string>
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
  changedPathsBetween: (
    ancestorSha: string,
    currentHeadSha: string,
  ) => readonly string[] | Promise<readonly string[]>
  questionSemanticHash: string
  classificationSemanticHash: string
  fixtureManifestHash: string
  classificationFixtureManifestHash: string
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
  const commands = [
    [
      'diff',
      '--name-only',
      '--no-renames',
      '-z',
      implementationSha,
      currentHeadSha,
      '--',
    ],
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
  ] as const
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

export async function checkLedgerOffline(
  input: unknown,
  state: LedgerRepositoryState,
): Promise<LedgerCheckResult> {
  const base = checkLedger({ input, ...state })
  if (!base.ledger) return base
  const errors = [...base.errors]

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

  for (const entry of base.ledger.entries) {
    for (const incident of entry.incidents ?? []) {
      if (!state.repoFiles.has(incident) || !state.existingFiles.has(incident)) {
        errors.push(
          `Batch ${entry.batch} incident is not an existing regular repository file: ${incident}`,
        )
      }
    }
    for (const evidence of entry.verification) {
      if (!evidence.gate.endsWith('-remote-ci') || !evidence.commitSha) continue
      if (!await state.isCommitAncestor(evidence.commitSha, state.currentHeadSha)) {
        errors.push(
          `Recorded remote CI commit ${evidence.commitSha} is not an ancestor of current HEAD ${state.currentHeadSha}`,
        )
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
  const allOwners = new Set(parsed.data.entries.flatMap((entry) => entry.newOwners))
  for (const entry of parsed.data.entries) {
    for (const owner of entry.newOwners) {
      if (!input.repoFiles.has(owner) || !input.existingFiles.has(owner)) {
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
