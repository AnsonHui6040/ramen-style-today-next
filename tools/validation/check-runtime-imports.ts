import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as ts from 'typescript'

const corePackage = '@ramen-style/classification-core'
const corePersistenceRoot = 'packages/classification-core/src/persistence'
const coreScoringRoot = 'packages/classification-core/src/scoring'
const coreEligibilityRoot = 'packages/classification-core/src/eligibility'
const coreRuntimeEntrypoint = 'packages/classification-core/src/index.ts'
const coreClassificationRuntimeEntrypoint = 'packages/classification-core/src/classification-model.ts'
const coreStyleRuntimeEntrypoint = 'packages/classification-core/src/style-model.ts'
const coreGeneratedClassificationModel = 'packages/classification-core/src/generated/classification-model.ts'
const coreGeneratedStyleModel = 'packages/classification-core/src/generated/style-model.ts'
const coreScoringEntrypoint = 'packages/classification-core/src/scoring/score.ts'
const coreEligibilityEvaluator = 'packages/classification-core/src/eligibility/evaluate.ts'
const approvedStyleRuntimeSpecifiers = new Map<string, ReadonlySet<string>>([
  [coreStyleRuntimeEntrypoint, new Set(['./generated/style-model.js'])],
  [coreGeneratedStyleModel, new Set(['../contracts/deep-freeze.js'])],
])
const approvedStyleRuntimeTargets = new Map<string, ReadonlySet<string>>([
  [coreRuntimeEntrypoint, new Set([
    coreClassificationRuntimeEntrypoint,
    coreStyleRuntimeEntrypoint,
  ])],
  [coreClassificationRuntimeEntrypoint, new Set([coreGeneratedClassificationModel])],
  [coreGeneratedClassificationModel, new Set([coreGeneratedStyleModel])],
  [coreScoringEntrypoint, new Set([coreGeneratedClassificationModel])],
  [coreEligibilityEvaluator, new Set([coreGeneratedClassificationModel])],
  [coreStyleRuntimeEntrypoint, new Set([coreGeneratedStyleModel])],
])
const protectedStyleRuntimeTargets = new Set([
  coreClassificationRuntimeEntrypoint,
  coreGeneratedClassificationModel,
  coreStyleRuntimeEntrypoint,
  coreGeneratedStyleModel,
])
const forbiddenStylePublicExports = new Set(['proveStyleModel'])
const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const
const forbiddenModuleFamilies = new Map<string, RuntimeImportReason>([
  ['browser', 'forbidden-module:browser'],
  ['catalog', 'forbidden-module:catalog'],
  ['dom', 'forbidden-module:dom'],
  ['eligibility', 'forbidden-module:eligibility'],
  ['happy-dom', 'forbidden-module:dom'],
  ['jsdom', 'forbidden-module:dom'],
  ['legacy', 'forbidden-module:legacy'],
  ['localstorage', 'forbidden-module:storage'],
  ['network', 'forbidden-module:network'],
  ['persistence', 'forbidden-module:persistence'],
  ['scoring', 'forbidden-module:scoring'],
  ['storage', 'forbidden-module:storage'],
  ['styles', 'forbidden-module:styles'],
])
const forbiddenPathFamilies = new Map<string, RuntimeImportReason>([
  ['browser', 'forbidden-path:browser'],
  ['catalog', 'forbidden-path:catalog'],
  ['dom', 'forbidden-path:dom'],
  ['eligibility', 'forbidden-path:eligibility'],
  ['legacy', 'forbidden-path:legacy'],
  ['localstorage', 'forbidden-path:storage'],
  ['network', 'forbidden-path:network'],
  ['scoring', 'forbidden-path:scoring'],
  ['storage', 'forbidden-path:storage'],
  ['styles', 'forbidden-path:styles'],
])
const nodeNextOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2024,
  resolveJsonModule: true,
} satisfies ts.CompilerOptions
const runtimeFileExtensions = new Set<string>([
  ts.Extension.Js,
  ts.Extension.Jsx,
  ts.Extension.Mjs,
  ts.Extension.Cjs,
])
const emitCapableExtensions = new Set<string>([
  ts.Extension.Ts,
  ts.Extension.Tsx,
  ts.Extension.Mts,
  ts.Extension.Cts,
  ...runtimeFileExtensions,
])
const declarationExtensions = new Set<string>([
  ts.Extension.Dts,
  ts.Extension.Dmts,
  ts.Extension.Dcts,
])

export type RuntimeImportReason =
  | 'forbidden-module:node'
  | 'forbidden-module:react'
  | 'forbidden-module:zod'
  | 'forbidden-module:browser'
  | 'forbidden-module:dom'
  | 'forbidden-module:eligibility'
  | 'forbidden-module:legacy'
  | 'forbidden-module:network'
  | 'forbidden-module:persistence'
  | 'forbidden-module:scoring'
  | 'forbidden-module:storage'
  | 'forbidden-module:styles'
  | 'forbidden-module:url'
  | 'forbidden-module:catalog'
  | 'forbidden-path:compiler'
  | 'forbidden-path:tools'
  | 'forbidden-path:definitions'
  | 'forbidden-path:browser'
  | 'forbidden-path:dom'
  | 'forbidden-path:eligibility'
  | 'forbidden-path:legacy'
  | 'forbidden-path:network'
  | 'forbidden-path:persistence'
  | 'forbidden-path:scoring'
  | 'forbidden-path:storage'
  | 'forbidden-path:styles'
  | 'forbidden-path:test'
  | 'forbidden-path:catalog'
  | 'forbidden-path:outside-repository'
  | 'forbidden-public-export'
  | 'forbidden-style-runtime-edge'
  | 'forbidden-scoring-eligibility-edge'
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
    .map((segment) => segment.toLowerCase())
}

function moduleUrlScheme(specifier: string): string | undefined {
  return /^([a-z][a-z0-9+.-]*):/i.exec(specifier)?.[1]?.toLowerCase()
}

function isFileUrlSpecifier(specifier: string): boolean {
  return moduleUrlScheme(specifier) === 'file'
}

function forbiddenModuleReason(specifier: string): RuntimeImportReason | undefined {
  if (isBuiltin(specifier)) return 'forbidden-module:node'
  const scheme = moduleUrlScheme(specifier)
  if (scheme === 'http' || scheme === 'https') return 'forbidden-module:network'
  if (scheme === 'blob') return 'forbidden-module:browser'
  if (scheme && scheme !== 'file') return 'forbidden-module:url'
  if (
    specifier.startsWith('.')
      || isAbsolute(specifier)
      || isFileUrlSpecifier(specifier)
  ) return undefined
  const segments = exactModuleSegments(specifier)
  if (segments[0] === 'react' || segments[0] === 'react-dom') {
    return 'forbidden-module:react'
  }
  if (segments[0] === 'zod') return 'forbidden-module:zod'
  for (const segment of segments) {
    const reason = forbiddenModuleFamilies.get(segment)
    if (reason) return reason
  }
  return undefined
}

function forbiddenPathReason(
  relativePath: string,
  allowCorePersistence: boolean,
  allowCoreScoring: boolean,
  allowCoreEligibility: boolean,
): RuntimeImportReason | undefined {
  const segments = relativePath.split('/').filter(Boolean)
  const fileName = segments.at(-1)?.toLowerCase() ?? ''
  const sourceIndex = segments.findIndex((segment, index) => (
    segment === 'src' && segments[index - 1] === 'classification-core'
  ))
  const coreSegment = sourceIndex >= 0 ? segments[sourceIndex + 1] : undefined
  if (coreSegment === 'compiler') return 'forbidden-path:compiler'
  if (coreSegment === 'definitions') return 'forbidden-path:definitions'
  if (segments[0] === 'tools') return 'forbidden-path:tools'
  if (
    segments.some((segment) => segment.toLowerCase() === '__tests__')
      || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(fileName)
  ) return 'forbidden-path:test'
  const isCorePersistence = relativePath === corePersistenceRoot
    || relativePath.startsWith(`${corePersistenceRoot}/`)
  if (
    (!allowCorePersistence || !isCorePersistence)
      && segments.some((segment) => segment.toLowerCase() === 'persistence')
  ) {
    return 'forbidden-path:persistence'
  }
  const isCoreScoring = relativePath === coreScoringRoot
    || relativePath.startsWith(`${coreScoringRoot}/`)
  for (const segment of segments) {
    const reason = forbiddenPathFamilies.get(segment.toLowerCase())
    if (reason === 'forbidden-path:scoring' && allowCoreScoring && isCoreScoring) {
      continue
    }
    const isCoreEligibility = relativePath === coreEligibilityRoot
      || relativePath.startsWith(`${coreEligibilityRoot}/`)
    if (
      reason === 'forbidden-path:eligibility'
        && allowCoreEligibility
        && isCoreEligibility
    ) continue
    if (reason) return reason
  }
  return undefined
}

function importClauseLoadsRuntime(importClause: ts.ImportClause | undefined): boolean {
  if (!importClause) return true
  if (importClause.isTypeOnly) return false
  if (importClause.name) return true
  const bindings = importClause.namedBindings
  if (!bindings || ts.isNamespaceImport(bindings)) return true
  return bindings.elements.length === 0
    || bindings.elements.some((element) => !element.isTypeOnly)
}

function exportDeclarationLoadsRuntime(statement: ts.ExportDeclaration): boolean {
  if (statement.isTypeOnly) return false
  const clause = statement.exportClause
  if (!clause || ts.isNamespaceExport(clause)) return true
  return clause.elements.length === 0
    || clause.elements.some((element) => !element.isTypeOnly)
}

function scanRuntimeModuleLoads(source: string, fileName: string) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  )
  const specifiers: string[] = []
  const nonliteralDynamicLoads: ('import' | 'require')[] = []
  const publicValueExports: string[] = []
  const addSpecifier = (specifier: string) => {
    if (!specifiers.includes(specifier)) specifiers.push(specifier)
  }

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement)
        && ts.isStringLiteral(statement.moduleSpecifier)
        && importClauseLoadsRuntime(statement.importClause)
    ) addSpecifier(statement.moduleSpecifier.text)

    if (
      ts.isExportDeclaration(statement)
        && statement.moduleSpecifier
        && ts.isStringLiteral(statement.moduleSpecifier)
        && exportDeclarationLoadsRuntime(statement)
    ) addSpecifier(statement.moduleSpecifier.text)

    if (
      ts.isExportDeclaration(statement)
        && !statement.isTypeOnly
        && statement.exportClause
        && ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (!element.isTypeOnly && !publicValueExports.includes(element.name.text)) {
          publicValueExports.push(element.name.text)
        }
      }
    }

    if (
      ts.isImportEqualsDeclaration(statement)
        && !statement.isTypeOnly
        && ts.isExternalModuleReference(statement.moduleReference)
        && statement.moduleReference.expression
        && ts.isStringLiteral(statement.moduleReference.expression)
    ) addSpecifier(statement.moduleReference.expression.text)
  }

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const kind = node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? 'import'
        : ts.isIdentifier(node.expression) && node.expression.text === 'require'
          ? 'require'
          : undefined
      if (kind) {
        const target = node.arguments[0]
        if (!target || !ts.isStringLiteralLike(target)) {
          nonliteralDynamicLoads.push(kind)
        } else {
          addSpecifier(target.text)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  for (const statement of sourceFile.statements) {
    if (!ts.canHaveModifiers(statement)) continue
    const exported = ts.getModifiers(statement)?.some(
      ({ kind }) => kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false
    if (!exported) continue
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name)
            && !publicValueExports.includes(declaration.name.text)
        ) publicValueExports.push(declaration.name.text)
      }
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
        && statement.name
        && !publicValueExports.includes(statement.name.text)
    ) {
      publicValueExports.push(statement.name.text)
    }
  }

  return { specifiers, nonliteralDynamicLoads, publicValueExports }
}

function resolveLocalImport(repoRoot: string, fromFile: string, specifier: string) {
  if (
    specifier.startsWith('.')
      || isAbsolute(specifier)
      || isFileUrlSpecifier(specifier)
  ) {
    let pathSpecifier = specifier
    if (isFileUrlSpecifier(specifier)) {
      try {
        pathSpecifier = fileURLToPath(specifier)
      } catch {
        return undefined
      }
    }
    const resolvedModule = ts.resolveModuleName(
      pathSpecifier,
      fromFile,
      nodeNextOptions,
      ts.sys,
    ).resolvedModule
    if (!resolvedModule) return undefined
    if (emitCapableExtensions.has(resolvedModule.extension)) {
      return resolvedModule.resolvedFileName
    }
    if (!declarationExtensions.has(resolvedModule.extension)) return undefined
    const runtimeTarget = resolve(dirname(fromFile), pathSpecifier)
    const hasRuntimeExtension = [...runtimeFileExtensions].some((extension) => (
      runtimeTarget.endsWith(extension)
    ))
    return hasRuntimeExtension && isRegularFile(runtimeTarget) ? runtimeTarget : undefined
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
  if (specifier === `${corePackage}/generated/style-model`) {
    return resolveSourceFile(resolve(
      repoRoot,
      'packages/classification-core/src/style-model.ts',
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
  const entryRelative = repositoryPath(absoluteRoot, entry)
  const styleBoundary = entryRelative === coreStyleRuntimeEntrypoint
  const allowCorePersistence = !styleBoundary
  const allowCoreScoring = !styleBoundary
  const allowCoreEligibility = !styleBoundary
  const pending = [entry]
  while (pending.length > 0) {
    const current = pending.pop()!
    const currentRelative = repositoryPath(absoluteRoot, current)
    if (visited.has(currentRelative)) continue
    visited.add(currentRelative)

    const moduleLoads = scanRuntimeModuleLoads(readFileSync(current, 'utf8'), currentRelative)
    if (styleBoundary && currentRelative === entryRelative) {
      for (const exportedName of moduleLoads.publicValueExports) {
        if (forbiddenStylePublicExports.has(exportedName)) forbidden.push({
          from: currentRelative,
          specifier: exportedName,
          reason: 'forbidden-public-export',
        })
      }
    }
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

      const approvedStyleSpecifiers = approvedStyleRuntimeSpecifiers.get(currentRelative)
      const isLocal = specifier.startsWith('.')
        || isAbsolute(specifier)
        || isFileUrlSpecifier(specifier)
        || isCoreSpecifier(specifier)
      if (!isLocal) {
        if (
          approvedStyleSpecifiers
            && !approvedStyleSpecifiers.has(specifier)
            && !moduleReason
        ) forbidden.push({
          from: currentRelative,
          specifier,
          reason: 'forbidden-style-runtime-edge',
        })
        continue
      }
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
      const pathReason = forbiddenPathReason(
        resolvedRelative,
        allowCorePersistence,
        allowCoreScoring,
        allowCoreEligibility,
      )
      if (pathReason) forbidden.push({
        from: currentRelative,
        specifier,
        reason: pathReason,
      })
      const scoringEligibilityEdge = (
        currentRelative === coreScoringRoot
          || currentRelative.startsWith(`${coreScoringRoot}/`)
      ) && (
        resolvedRelative === coreEligibilityRoot
          || resolvedRelative.startsWith(`${coreEligibilityRoot}/`)
      )
      if (scoringEligibilityEdge) forbidden.push({
        from: currentRelative,
        specifier,
        reason: 'forbidden-scoring-eligibility-edge',
      })
      const approvedStyleTargets = approvedStyleRuntimeTargets.get(currentRelative)
      const violatesExactStyleSource = approvedStyleSpecifiers
        ? !approvedStyleSpecifiers.has(specifier)
        : false
      const violatesProtectedStyleTarget = !approvedStyleSpecifiers
        && protectedStyleRuntimeTargets.has(resolvedRelative)
        && !approvedStyleTargets?.has(resolvedRelative)
      if (
        (violatesExactStyleSource || violatesProtectedStyleTarget)
          && !moduleReason
          && !pathReason
      ) forbidden.push({
        from: currentRelative,
        specifier,
        reason: 'forbidden-style-runtime-edge',
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
  const entrypoints = [coreRuntimeEntrypoint, coreStyleRuntimeEntrypoint]
  const results = entrypoints.map((entrypoint) => checkRuntimeImports(repoRoot, entrypoint))
  const forbidden = results.flatMap((result) => result.forbidden).sort((left, right) => (
    compareCodePoints(left.reason, right.reason)
    || compareCodePoints(left.from, right.from)
    || compareCodePoints(left.specifier, right.specifier)
  ))
  if (forbidden.length > 0) {
    for (const violation of forbidden) {
      process.stderr.write(
        `RUNTIME_IMPORT_FORBIDDEN ${violation.reason} ${violation.from} -> ${violation.specifier}\n`,
      )
    }
    process.exitCode = 1
    return
  }
  process.stdout.write(`${JSON.stringify({
    status: 'pass',
    entrypoints,
    visitedCount: new Set(results.flatMap((result) => result.visited)).size,
  })}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run()
