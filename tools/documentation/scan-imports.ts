import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import * as ts from 'typescript'
import { compareCodePoints } from '@ramen-style/classification-core/compiler'

const corePackage = '@ramen-style/classification-core'
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules'])

function toPosix(value: string) {
  return value.split(sep).join('/')
}

function isInfrastructureOrTest(relativePath: string) {
  return relativePath.startsWith('packages/classification-core/')
    || relativePath.startsWith('tools/documentation/')
    || relativePath.endsWith('.test.ts')
    || relativePath.endsWith('.test.tsx')
    || relativePath.endsWith('.test.mts')
    || relativePath.endsWith('.test.cts')
}

function isCoreSpecifier(value: string) {
  return value === corePackage || value.startsWith(`${corePackage}/`)
}

export function scanImportSpecifiers(source: string) {
  return ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName)
}

function importsClassificationBehavior(source: string, relativePath: string) {
  const preprocessedCoreImports = scanImportSpecifiers(source).filter(isCoreSpecifier)
  if (preprocessedCoreImports.length === 0) return false

  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
  )
  let comparatorOnlyImportCount = 0
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || !isCoreSpecifier(statement.moduleSpecifier.text)) {
      continue
    }
    const bindings = statement.importClause?.namedBindings
    const isComparatorOnly = !statement.importClause?.name
      && bindings !== undefined
      && ts.isNamedImports(bindings)
      && bindings.elements.length > 0
      && bindings.elements.every((element) => (
        (element.propertyName ?? element.name).text === 'compareCodePoints'
      ))
    if (!isComparatorOnly) return true
    comparatorOnlyImportCount += 1
  }

  return preprocessedCoreImports.length > comparatorOnlyImportCount
}

export function scanCoreConsumers(
  repoRoot: string,
  roots: readonly string[],
  eligibleFiles: ReadonlySet<string>,
): Set<string> {
  const consumers = new Set<string>()

  const visit = (absolutePath: string) => {
    for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
      const child = join(absolutePath, entry.name)
      const relativePath = toPosix(relative(repoRoot, child))
      if (isInfrastructureOrTest(relativePath)) continue
      if (entry.isDirectory()) {
        visit(child)
        continue
      }
      if (!entry.isFile() || !['.ts', '.tsx', '.mts', '.cts'].some((suffix) => entry.name.endsWith(suffix))) {
        continue
      }
      if (!eligibleFiles.has(relativePath)) continue
      const source = readFileSync(child, 'utf8')
      if (importsClassificationBehavior(source, relativePath)) {
        consumers.add(relativePath)
      }
    }
  }

  for (const root of roots) {
    const absoluteRoot = join(repoRoot, root)
    if (existsSync(absoluteRoot)) visit(absoluteRoot)
  }
  return new Set([...consumers].sort(compareCodePoints))
}
