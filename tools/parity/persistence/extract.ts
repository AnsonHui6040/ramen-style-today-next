import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createPersistenceExtractorEnvironment,
  legacyPersistenceSourceIdentity,
  persistenceExtractorAuthoringSourcePaths,
  runLegacyPersistenceExtractorCommand,
  type PersistenceExtractorCommandResult,
  type PersistenceExtractorEnvironment,
} from './extractor.js'
import { sanitizeExternalError } from '../shared/authoring.js'
import type { RunFixtureAuthoringOptions } from '../shared/contracts.js'

interface ExtractArguments {
  readonly legacyCheckout: string
  readonly replace: boolean
  readonly verifyOnly: boolean
}

export type PersistenceExtractMode = 'create' | 'replace' | 'verify-only'

const usage = [
  'Usage: extract.ts --legacy-checkout <absolute-path>',
  '[--replace|--verify-only]',
].join(' ')

export function parseExtractArguments(arguments_: readonly string[]): ExtractArguments {
  let legacyCheckout: string | undefined
  let replace = false
  let verifyOnly = false
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--legacy-checkout') {
      const value = arguments_[index + 1]
      if (!value || value.startsWith('--')) throw new Error(usage)
      legacyCheckout = value
      index += 1
    } else if (argument === '--replace') {
      replace = true
    } else if (argument === '--verify-only') {
      verifyOnly = true
    } else {
      throw new Error(usage)
    }
  }
  if (
    !legacyCheckout
    || !isAbsolute(legacyCheckout)
    || (replace && verifyOnly)
  ) throw new Error(usage)
  return {
    legacyCheckout: resolve(legacyCheckout),
    replace,
    verifyOnly,
  }
}

export function projectPersistenceExtractorResultForCli(
  result: PersistenceExtractorCommandResult,
  mode: PersistenceExtractMode,
) {
  if (result.status === 'failed') {
    return {
      mode,
      status: result.status,
      published: result.published,
      error: result.error,
    }
  }
  const projection = {
    mode,
    status: result.status,
    published: result.published,
    caseCount: result.cases.length,
    casesHash: result.manifest.casesHash,
    ignoredFingerprintsBefore: result.ignoredFingerprintsBefore,
    ignoredFingerprintsAfter: result.ignoredFingerprintsAfter,
  }
  return result.status === 'published-with-cleanup-warning'
    ? { ...projection, warning: result.warning }
    : projection
}

const toolRoot = fileURLToPath(new URL('../../../', import.meta.url))
const patchPath = fileURLToPath(new URL('./legacy-instrumentation.patch', import.meta.url))
const seedsPath = fileURLToPath(new URL('./seeds.json', import.meta.url))

export const persistenceTrackedSourceHashes = {
  'src/App.tsx': 'fcc56466e6f1cdf970295857efe1aafa0be9a980cc70fb043c7e36b6bdddc244',
  'src/config/questions.ts': '4ee41855fa849d650e0d970cc3e39114ff5f73c648833613e700846bff764906',
  'src/data/questions.json': '0136f6f71fdc0f09da8da045aa97303069631882ef2a240dd1a9fbc48a8992f2',
  'src/domain/questionRules.ts': '465a0575ef45ee93cf1843acc1e102802ff28d3203a32bc33f8ab49411742385',
  'src/domain/schema.ts': '7c0abe9767fd57d7bbde3209cd4241eafbe0f5c63415947e1efea6ac718cc0a9',
  'src/domain/types.ts': 'b91a35b5db4f8e27204616236f050897d4e9e205f583644084f439a3cb3d343e',
  'src/features/questionnaire/QuestionStep.tsx': '7ce2b1e4a49a965a67ae2303c0bd25005365330189ac95f1ec4561ca7f4f0e9b',
  'src/test/setup.ts': '24bfe9f743e71f5992b8b0b85e757e6a0937c6f3cbd5966691c03b450b2b5c39',
  'vite.config.ts': '0ebe1b813bdeb70dcfea7673d502bb30fb2928936d3bca5d2dcae9c2b8a23065',
} as const

export const persistenceLegacyLockfileHash =
  'be7ff42d1012d310916d38c082f63f8b5263981c6bd2ded2ff0f6dabe7fc29d2' as const
export const persistenceInstrumentationHash =
  'e8312b51aa2be9a5c7f40c38c7c7b0ea6e1a166d12c410591e956ea0ae0ac607' as const
export const persistenceSeedsHash =
  'd83cb697852ddbe2f024fbbc09844a83305cceb7812841a76a926966147ea19b' as const
export const persistenceExtractionNodeVersion = '24.14.0' as const
export const persistenceExtractionNpmVersion = '11.12.1' as const

export interface ExtractCommandDependencies {
  readonly run: (
    environment: PersistenceExtractorEnvironment,
    options: RunFixtureAuthoringOptions,
  ) => Promise<PersistenceExtractorCommandResult>
  readonly writeStdout: (value: string) => void
  readonly setExitCode: (code: number) => void
}

const defaultDependencies: ExtractCommandDependencies = {
  run: runLegacyPersistenceExtractorCommand,
  writeStdout: (value) => process.stdout.write(value),
  setExitCode: (code) => {
    process.exitCode = code
  },
}

export async function runExtractCommand(
  arguments_: readonly string[],
  dependencies: ExtractCommandDependencies = defaultDependencies,
) {
  const parsed = parseExtractArguments(arguments_)
  const environment = createPersistenceExtractorEnvironment({
    inheritedEnvironment: process.env,
    legacyRoot: parsed.legacyCheckout,
    toolRoot,
    destination: resolve(
      toolRoot,
      'tools/parity/fixtures/persistence/legacy-unversioned',
    ),
    patchPath,
    seedsPath,
    authoringSources: persistenceExtractorAuthoringSourcePaths.map((relativePath) => ({
      relativePath,
      path: resolve(toolRoot, relativePath),
    })),
    expected: {
      identity: legacyPersistenceSourceIdentity.repository,
      commit: legacyPersistenceSourceIdentity.commit,
      treeHash: legacyPersistenceSourceIdentity.treeHash,
      trackedSourceHashes: persistenceTrackedSourceHashes,
      lockfilePath: 'package-lock.json',
      lockfileHash: persistenceLegacyLockfileHash,
      patchHash: persistenceInstrumentationHash,
      seedsHash: persistenceSeedsHash,
      nodeVersion: persistenceExtractionNodeVersion,
      npmVersion: persistenceExtractionNpmVersion,
    },
  })
  const result = await dependencies.run(environment, {
    replace: parsed.replace,
    verifyOnly: parsed.verifyOnly,
  })
  const mode: PersistenceExtractMode = parsed.verifyOnly
    ? 'verify-only'
    : parsed.replace
      ? 'replace'
      : 'create'
  dependencies.writeStdout(`${JSON.stringify(
    projectPersistenceExtractorResultForCli(result, mode),
    null,
    2,
  )}\n`)
  if (result.status === 'failed') dependencies.setExitCode(1)
  return result
}

export async function main(arguments_: readonly string[]) {
  return runExtractCommand(arguments_)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${sanitizeExternalError(error, 300)}\n`)
    process.exitCode = 1
  })
}
