import {
  compareDiagnostics,
  makeDiagnostic,
  type Diagnostic,
} from '../contracts/diagnostic.js'

type DiagnosticBody = Omit<Diagnostic, 'severity'>

export class DiagnosticCollector {
  readonly #items: Diagnostic[] = []

  error(input: DiagnosticBody) {
    this.#items.push(makeDiagnostic({ ...input, severity: 'error' }))
  }

  warning(input: DiagnosticBody) {
    this.#items.push(makeDiagnostic({ ...input, severity: 'warning' }))
  }

  hasErrors() {
    return this.#items.some((item) => item.severity === 'error')
  }

  toArray(): readonly Diagnostic[] {
    return Object.freeze([...this.#items].sort(compareDiagnostics))
  }
}
