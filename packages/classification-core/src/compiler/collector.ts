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
    const sorted = [...this.#items].sort(compareDiagnostics)
    return Object.freeze(sorted.filter((item, index) => (
      index === 0 || compareDiagnostics(sorted[index - 1]!, item) !== 0
    )))
  }
}
