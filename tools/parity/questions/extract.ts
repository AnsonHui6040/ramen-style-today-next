import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createExtractorEnvironment,
  legacySourceIdentity,
  runLegacyExtractor,
  sanitizeExternalError,
} from './extractor.js'

interface ExtractArguments {
  readonly legacy: string
  readonly replace: boolean
  readonly verifyOnly: boolean
}

const usage = 'Usage: extract.ts --legacy <absolute-path> [--replace|--verify-only]'

export function parseExtractArguments(arguments_: readonly string[]): ExtractArguments {
  let legacy: string | undefined
  let replace = false
  let verifyOnly = false
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--legacy') {
      const value = arguments_[index + 1]
      if (!value || value.startsWith('--')) throw new Error(usage)
      legacy = value
      index += 1
    } else if (argument === '--replace') {
      replace = true
    } else if (argument === '--verify-only') {
      verifyOnly = true
    } else {
      throw new Error(usage)
    }
  }
  if (!legacy || !isAbsolute(legacy) || (replace && verifyOnly)) throw new Error(usage)
  return { legacy: resolve(legacy), replace, verifyOnly }
}

const toolRoot = fileURLToPath(new URL('../../../', import.meta.url))
const patchPath = fileURLToPath(new URL('./legacy-instrumentation.patch', import.meta.url))
const seedsPath = fileURLToPath(new URL('./seeds.json', import.meta.url))

const trackedSourceHashes = {
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

export async function main(arguments_: readonly string[]) {
  const parsed = parseExtractArguments(arguments_)
  const environment = createExtractorEnvironment({
    inheritedEnvironment: process.env,
    legacyRoot: parsed.legacy,
    toolRoot,
    destination: resolve(toolRoot, 'tools/parity/fixtures/questions/legacy-v1'),
    patchPath,
    seedsPath,
    expected: {
      identity: {
        host: legacySourceIdentity.host,
        owner: legacySourceIdentity.owner,
        repository: legacySourceIdentity.repository,
      },
      commit: legacySourceIdentity.commit,
      treeHash: legacySourceIdentity.treeHash,
      trackedSourceHashes,
      lockfilePath: 'package-lock.json',
      lockfileHash: 'be7ff42d1012d310916d38c082f63f8b5263981c6bd2ded2ff0f6dabe7fc29d2',
      patchHash: 'b6419668948ea3f4f3398ab4d08ffbae81865b94e444c033391316263c78ba84',
      seedsHash: 'f7a37a15c9b9fbdbd3b10311d3f11f1efdea548d6ba835605d1a987ca694173b',
      nodeVersion: '24.14.0',
      npmVersion: '11.12.1',
    },
  })
  const result = await runLegacyExtractor(environment, {
    replace: parsed.replace,
    verifyOnly: parsed.verifyOnly,
  })
  process.stdout.write(`${JSON.stringify({
    mode: parsed.verifyOnly ? 'verify-only' : parsed.replace ? 'replace' : 'create',
    caseCount: result.cases.length,
    published: result.published,
    ignoredFingerprintsBefore: result.ignoredFingerprintsBefore,
    ignoredFingerprintsAfter: result.ignoredFingerprintsAfter,
  }, null, 2)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${sanitizeExternalError(error, 300)}\n`)
    process.exitCode = 1
  })
}
