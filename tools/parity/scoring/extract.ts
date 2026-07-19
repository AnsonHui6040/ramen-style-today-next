import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createScoringExtractorEnvironment,
  runScoringExtractorCommand,
  scoringExtractorAuthoringSourcePaths,
  type ScoringExtractorCommandResult,
  type ScoringExtractorEnvironment,
} from './extractor.js'
import { sanitizeExternalError } from '../shared/authoring.js'
import type { RunFixtureAuthoringOptions } from '../shared/contracts.js'

const usage = 'extract.ts --legacy-checkout <absolute-path> [--replace|--verify-only]'

export function parseScoringExtractArguments(arguments_: readonly string[]) {
  let legacyCheckout: string | undefined
  let replace = false
  let verifyOnly = false
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--legacy-checkout' && legacyCheckout === undefined) {
      const value = arguments_[index + 1]
      if (!value || value.startsWith('--')) throw new Error(usage)
      legacyCheckout = value
      index += 1
    } else if (argument === '--replace' && !replace) {
      replace = true
    } else if (argument === '--verify-only' && !verifyOnly) {
      verifyOnly = true
    } else {
      throw new Error(usage)
    }
  }
  if (!legacyCheckout || !isAbsolute(legacyCheckout) || (replace && verifyOnly)) {
    throw new Error(usage)
  }
  return { legacyCheckout: resolve(legacyCheckout), replace, verifyOnly }
}

export interface ScoringExtractCommandDependencies {
  readonly run: (
    environment: ScoringExtractorEnvironment,
    options: RunFixtureAuthoringOptions,
  ) => Promise<ScoringExtractorCommandResult>
  readonly writeStdout: (value: string) => void
  readonly setExitCode: (code: number) => void
}

const defaultDependencies: ScoringExtractCommandDependencies = {
  run: runScoringExtractorCommand,
  writeStdout: (value) => process.stdout.write(value),
  setExitCode: (code) => { process.exitCode = code },
}

function projectResult(result: ScoringExtractorCommandResult, mode: string) {
  if (result.status === 'failed') {
    return { mode, status: result.status, published: result.published, error: result.error }
  }
  const projection = {
    mode,
    status: result.status,
    published: result.published,
    caseCount: result.cases.length,
    casesHash: result.manifest.casesHash,
    coverage: result.manifest.coverage,
  }
  return result.status === 'published-with-cleanup-warning'
    ? { ...projection, warning: result.warning }
    : projection
}

const toolRoot = fileURLToPath(new URL('../../../', import.meta.url))

export async function runScoringExtractCommand(
  arguments_: readonly string[],
  dependencies: ScoringExtractCommandDependencies = defaultDependencies,
) {
  const parsed = parseScoringExtractArguments(arguments_)
  const environment = createScoringExtractorEnvironment({
    inheritedEnvironment: process.env,
    legacyRoot: parsed.legacyCheckout,
    toolRoot,
    destination: resolve(toolRoot, 'tools/parity/fixtures/scoring/legacy-v1'),
    patchPath: resolve(toolRoot, 'tools/parity/scoring/legacy-instrumentation.patch'),
    seedsPath: resolve(toolRoot, 'tools/parity/scoring/seeds.json'),
    authoringSources: scoringExtractorAuthoringSourcePaths.map((relativePath) => ({
      relativePath,
      path: resolve(toolRoot, relativePath),
    })),
  })
  const result = await dependencies.run(environment, {
    replace: parsed.replace,
    verifyOnly: parsed.verifyOnly,
  })
  const mode = parsed.verifyOnly ? 'verify-only' : parsed.replace ? 'replace' : 'create'
  dependencies.writeStdout(`${JSON.stringify(projectResult(result, mode), null, 2)}\n`)
  if (result.status === 'failed') dependencies.setExitCode(1)
  return result
}

export async function main(arguments_: readonly string[]) {
  return runScoringExtractCommand(arguments_)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${sanitizeExternalError(error, 300)}\n`)
    process.exitCode = 1
  })
}
