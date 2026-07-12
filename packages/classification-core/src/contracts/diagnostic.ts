import type { DiagnosticCode } from './diagnostic-codes.js'
import { isStableSource } from './source-path.js'

export type DiagnosticSeverity = 'error' | 'warning'

export interface DiagnosticReference {
  sourceFile: string
  path: string
  entityId?: string
}

export interface Diagnostic {
  severity: DiagnosticSeverity
  code: DiagnosticCode
  sourceFile: string
  path: string
  entityId?: string
  message: string
  expected?: unknown
  received?: unknown
  related?: readonly DiagnosticReference[]
}

function isJsonPointer(value: string) {
  return /^(?:\/(?:[^~/]|~0|~1)*)*$/.test(value)
}

export function makeDiagnostic(input: Diagnostic): Diagnostic {
  if (!isStableSource(input.sourceFile)) {
    throw new Error(
      'diagnostic sourceFile must be repository-relative POSIX or runtime:// lower-kebab identifier segments',
    )
  }
  if (!isJsonPointer(input.path)) {
    throw new Error('diagnostic path must be an RFC 6901 JSON Pointer')
  }
  for (const related of input.related ?? []) {
    if (!isStableSource(related.sourceFile) || !isJsonPointer(related.path)) {
      throw new Error('diagnostic related references must use stable sources and JSON Pointers')
    }
  }
  return Object.freeze({ ...input })
}

export function compareDiagnostics(left: Diagnostic, right: Diagnostic) {
  return left.sourceFile.localeCompare(right.sourceFile)
    || left.path.localeCompare(right.path)
    || left.code.localeCompare(right.code)
}
