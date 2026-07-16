import { DiagnosticCollector } from './collector.js'
import { isStableSource } from '../contracts/source-path.js'
import {
  definitionBundleSchema,
  type DefinitionBundleSource,
} from './source-schema.js'

function escapePointerToken(value: PropertyKey) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1')
}

function toJsonPointer(path: readonly PropertyKey[]) {
  return path.length ? `/${path.map(escapePointerToken).join('/')}` : ''
}

export function parseDefinitionBundle(input: unknown, sourceFile: string): {
  definition?: DefinitionBundleSource
  diagnostics: ReturnType<DiagnosticCollector['toArray']>
} {
  if (!isStableSource(sourceFile)) {
    const collector = new DiagnosticCollector()
    collector.error({
      code: 'STRUCTURE_INVALID',
      sourceFile: 'runtime://parse-definition-bundle',
      path: '',
      message: 'Invalid parser sourceFile; expected repository-relative POSIX or runtime://',
    })
    return { diagnostics: collector.toArray() }
  }
  const parsed = definitionBundleSchema.safeParse(input)
  if (parsed.success) return { definition: parsed.data, diagnostics: [] }

  const collector = new DiagnosticCollector()
  for (const issue of parsed.error.issues) {
    collector.error({
      code: 'STRUCTURE_INVALID',
      sourceFile,
      path: toJsonPointer(issue.path),
      message: issue.message,
    })
  }
  return { diagnostics: collector.toArray() }
}
