import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as ts from 'typescript'
import { scanModuleLoads } from '../documentation/scan-imports.js'

const corePackage = '@ramen-style/classification-core'
const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const
const forbiddenNames = new Set(['legacy', 'persistence', 'scoring', 'styles', 'catalog'])
const nodeNextOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2024,
  resolveJsonModule: true,
} satisfies ts.CompilerOptions

export type RuntimeImportReason =
  | 'forbidden-module:node'
  | 'forbidden-module:react'
  | 'forbidden-module:zod'
  | 'forbidden-module:legacy'
  | 'forbidden-module:persistence'
  | 'forbidden-module:scoring'
  | 'forbidden-module:styles'
  | 'forbidden-module:catalog'
  | 'forbidden-path:compiler'
  | 'forbidden-path:tools'
  | 'forbidden-path:definitions'
  | 'forbidden-path:legacy'
  | 'forbidden-path:persistence'
  | 'forbidden-path:scoring'
  | 'forbidden-path:styles'
  | 'forbidden-path:catalog'
  | 'forbidden-path:outside-repository'
  | 'nonliteral-dynamic-module-load'
  | 'unresolved-local-import'

export interface ForbiddenRuntimeImport {
  readonly from: string
  readonly specifier: string
  readonly reason: RuntimeImportReason
}

export interface RuntimeImportCheckResult {
  readonly visited: readonly string[]
  readonly forbidden: readonly ForbiddenRuntimeImport[]
}

function compareCodePoints(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!)
  const sharedLength = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function toPosix(value: string) {
  return value.split(sep).join('/')
}

function repositoryPath(repoRoot: string, absolutePath: string) {
  return toPosix(relative(repoRoot, absolutePath))
}

function isInside(root: string, target: string) {
  const relativePath = relative(root, target)
  return !isAbsolute(relativePath)
    && relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
}

function isInsideRepository(
  lexicalRoot: string,
  physicalRoot: string,
  target: string,
) {
  return isInside(lexicalRoot, resolve(target))
    && isInside(physicalRoot, realpathSync(target))
}

function isRegularFile(file: string) {
  return existsSync(file) && statSync(file).isFile()
}

function resolveSourceFile(basePath: string) {
  const candidates = new Set<string>([basePath])
  const extension = sourceExtensions.find((suffix) => basePath.endsWith(suffix))
  if (extension) {
    const stem = basePath.slice(0, -extension.length)
    for (const suffix of sourceExtensions) candidates.add(`${stem}${suffix}`)
  } else {
    for (const suffix of sourceExtensions) candidates.add(`${basePath}${suffix}`)
    for (const suffix of sourceExtensions) candidates.add(resolve(basePath, `index${suffix}`))
  }
  return [...candidates].find(isRegularFile)
}

function exactModuleSegments(specifier: string) {
  return specifier
    .split('/')
    .filter(Boolean)
    .flatMap((segment) => segment.startsWith('@') ? [segment.slice(1)] : [segment])
}

function forbiddenModuleReason(specifier: string): RuntimeImportReason | undefined {
  if (specifier.startsWith('node:')) return 'forbidden-module:node'
  const segments = exactModuleSegments(specifier)
  if (segments[0] === 'react') return 'forbidden-module:react'
  if (segments[0] === 'zod') return 'forbidden-module:zod'
  const forbidden = segments.find((segment) => forbiddenNames.has(segment))
  return forbidden ? `forbidden-module:${forbidden}` as RuntimeImportReason : undefined
}

function forbiddenPathReason(relativePath: string): RuntimeImportReason | undefined {
  const segments = relativePath.split('/').filter(Boolean)
  const sourceIndex = segments.findIndex((segment, index) => (
    segment === 'src' && segments[index - 1] === 'classification-core'
  ))
  const coreSegment = sourceIndex >= 0 ? segments[sourceIndex + 1] : undefined
  if (coreSegment === 'compiler') return 'forbidden-path:compiler'
  if (coreSegment === 'definitions') return 'forbidden-path:definitions'
  if (segments[0] === 'tools') return 'forbidden-path:tools'
  const forbidden = segments.find((segment) => forbiddenNames.has(segment))
  return forbidden ? `forbidden-path:${forbidden}` as RuntimeImportReason : undefined
}

function resolveLocalImport(repoRoot: string, fromFile: string, specifier: string) {
  if (specifier.startsWith('.')) {
    return ts.resolveModuleName(
      specifier,
      fromFile,
      nodeNextOptions,
      ts.sys,
    ).resolvedModule?.resolvedFileName
  }
  if (specifier === corePackage) {
    return resolveSourceFile(resolve(repoRoot, 'packages/classification-core/src/index.ts'))
  }
  if (specifier === `${corePackage}/generated/question-model`) {
    return resolveSourceFile(resolve(
      repoRoot,
      'packages/classification-core/src/generated/question-model.ts',
    ))
  }
  if (specifier === `${corePackage}/compiler`) {
    return resolveSourceFile(resolve(repoRoot, 'packages/classification-core/src/compiler/index.ts'))
  }
  return undefined
}

function isCoreSpecifier(specifier: string) {
  return specifier === corePackage || specifier.startsWith(`${corePackage}/`)
}

export function checkRuntimeImports(
  repoRoot: string,
  entrypoint = 'packages/classification-core/src/index.ts',
): RuntimeImportCheckResult {
  const absoluteRoot = resolve(repoRoot)
  const physicalRoot = realpathSync(absoluteRoot)
  const entry = resolveSourceFile(resolve(absoluteRoot, entrypoint))
  if (!entry) throw new Error(`Runtime entrypoint does not exist: ${entrypoint}`)
  if (!isInsideRepository(absoluteRoot, physicalRoot, entry)) {
    throw new Error(`Runtime entrypoint must stay inside repository root: ${entrypoint}`)
  }

  const visited = new Set<string>()
  const forbidden: ForbiddenRuntimeImport[] = []
  const pending = [entry]
  while (pending.length > 0) {
    const current = pending.pop()!
    const currentRelative = repositoryPath(absoluteRoot, current)
    if (visited.has(currentRelative)) continue
    visited.add(currentRelative)

    const moduleLoads = scanModuleLoads(readFileSync(current, 'utf8'), currentRelative)
    for (const kind of moduleLoads.nonliteralDynamicLoads) forbidden.push({
      from: currentRelative,
      specifier: `${kind}(<nonliteral>)`,
      reason: 'nonliteral-dynamic-module-load',
    })

    for (const specifier of moduleLoads.specifiers) {
      const moduleReason = forbiddenModuleReason(specifier)
      if (moduleReason) forbidden.push({
        from: currentRelative,
        specifier,
        reason: moduleReason,
      })

      const isLocal = specifier.startsWith('.') || isCoreSpecifier(specifier)
      if (!isLocal) continue
      const resolved = resolveLocalImport(absoluteRoot, current, specifier)
      if (!resolved) {
        forbidden.push({
          from: currentRelative,
          specifier,
          reason: 'unresolved-local-import',
        })
        continue
      }
      if (!isInsideRepository(absoluteRoot, physicalRoot, resolved)) {
        forbidden.push({
          from: currentRelative,
          specifier,
          reason: 'forbidden-path:outside-repository',
        })
        continue
      }
      const resolvedRelative = repositoryPath(absoluteRoot, resolved)
      const pathReason = forbiddenPathReason(resolvedRelative)
      if (pathReason) forbidden.push({
        from: currentRelative,
        specifier,
        reason: pathReason,
      })
      if (!visited.has(resolvedRelative)) pending.push(resolved)
    }
  }

  return Object.freeze({
    visited: Object.freeze([...visited].sort(compareCodePoints)),
    forbidden: Object.freeze(forbidden.sort((left, right) => (
      compareCodePoints(left.reason, right.reason)
      || compareCodePoints(left.from, right.from)
      || compareCodePoints(left.specifier, right.specifier)
    ))),
  })
}

function run() {
  const repoRoot = resolve(import.meta.dirname, '../..')
  const result = checkRuntimeImports(repoRoot)
  if (result.forbidden.length > 0) {
    for (const violation of result.forbidden) {
      process.stderr.write(
        `RUNTIME_IMPORT_FORBIDDEN ${violation.reason} ${violation.from} -> ${violation.specifier}\n`,
      )
    }
    process.exitCode = 1
    return
  }
  process.stdout.write(`${JSON.stringify({
    status: 'pass',
    entrypoint: 'packages/classification-core/src/index.ts',
    visitedCount: result.visited.length,
  })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run()
