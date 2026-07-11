import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import * as ts from 'typescript'

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
      const imports = ts.preProcessFile(readFileSync(child, 'utf8'), true, true).importedFiles
      if (imports.some(({ fileName }) => fileName === corePackage || fileName.startsWith(`${corePackage}/`))) {
        consumers.add(relativePath)
      }
    }
  }

  for (const root of roots) {
    const absoluteRoot = join(repoRoot, root)
    if (existsSync(absoluteRoot)) visit(absoluteRoot)
  }
  return new Set([...consumers].sort())
}
