import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createStyleExtractorEnvironment,
  runStyleExtractorCommand,
  styleExtractorAuthoringSourcePaths,
  type StyleExtractorCommandResult,
  type StyleExtractorEnvironment,
} from './extractor.js'
import { sanitizeExternalError } from '../shared/authoring.js'
import type { RunFixtureAuthoringOptions } from '../shared/contracts.js'

const usage = 'extract.ts --legacy-checkout <absolute-path> [--replace|--verify-only]'

export type StyleExtractMode = 'create' | 'replace' | 'verify-only'

export interface ParsedExtractArguments {
  readonly legacyCheckout: string
  readonly replace: boolean
  readonly verifyOnly: boolean
}

export function parseExtractArguments(arguments_: readonly string[]): ParsedExtractArguments {
  let legacyCheckout: string | undefined
  let replace = false
  let verifyOnly = false
  let replaceSeen = false
  let verifyOnlySeen = false
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--legacy-checkout') {
      if (legacyCheckout !== undefined) throw new Error(usage)
      const value = arguments_[index + 1]
      if (!value || value.startsWith('--')) throw new Error(usage)
      legacyCheckout = value
      index += 1
      continue
    }
    if (argument === '--replace') {
      if (replaceSeen) throw new Error(usage)
      replaceSeen = true
      replace = true
      continue
    }
    if (argument === '--verify-only') {
      if (verifyOnlySeen) throw new Error(usage)
      verifyOnlySeen = true
      verifyOnly = true
      continue
    }
    throw new Error(usage)
  }
  if (!legacyCheckout || !isAbsolute(legacyCheckout) || (replace && verifyOnly)) {
    throw new Error(usage)
  }
  return {
    legacyCheckout: resolve(legacyCheckout),
    replace,
    verifyOnly,
  }
}

export interface ExtractCommandDependencies {
  readonly run: (
    environment: StyleExtractorEnvironment,
    options: RunFixtureAuthoringOptions,
  ) => Promise<StyleExtractorCommandResult>
  readonly writeStdout: (value: string) => void
  readonly setExitCode: (code: number) => void
}

const defaultDependencies: ExtractCommandDependencies = {
  run: runStyleExtractorCommand,
  writeStdout: (value) => process.stdout.write(value),
  setExitCode: (code) => {
    process.exitCode = code
  },
}

function projectCommandResult(
  result: StyleExtractorCommandResult,
  mode: StyleExtractMode,
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
    coverage: result.manifest.coverage,
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

export async function runExtractCommand(
  arguments_: readonly string[],
  dependencies: ExtractCommandDependencies = defaultDependencies,
) {
  const parsed = parseExtractArguments(arguments_)
  const environment = createStyleExtractorEnvironment({
    inheritedEnvironment: process.env,
    legacyRoot: parsed.legacyCheckout,
    toolRoot,
    destination: resolve(toolRoot, 'tools/parity/fixtures/styles/legacy-v1'),
    patchPath,
    seedsPath,
    authoringSources: styleExtractorAuthoringSourcePaths.map((relativePath) => ({
      relativePath,
      path: resolve(toolRoot, relativePath),
    })),
  })
  const result = await dependencies.run(environment, {
    replace: parsed.replace,
    verifyOnly: parsed.verifyOnly,
  })
  const mode: StyleExtractMode = parsed.verifyOnly
    ? 'verify-only'
    : parsed.replace
      ? 'replace'
      : 'create'
  dependencies.writeStdout(`${JSON.stringify(projectCommandResult(result, mode), null, 2)}\n`)
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
