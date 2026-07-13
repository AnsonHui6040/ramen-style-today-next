import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  compileQuestions,
  questionDefinitions,
  type CompiledQuestionModel,
} from '@ramen-style/classification-core/compiler'
import { compareParityCase, type ParityMismatch } from './compare.js'
import {
  applyExpectedDivergences,
  deriveObservableCoverage,
  expectedDivergencesSchema,
  fixtureManifestSchema,
  legacyObservableTraceCaseSchema,
  type LegacyObservableTraceCase,
} from './contracts.js'
import { executeObservableTrace } from './observable-trace.js'

const compilation = compileQuestions(questionDefinitions)
if (!compilation.ok) throw new Error('production question definitions must compile')
const questionModel = compilation.model

export interface ParityDiagnostic {
  readonly code:
    | 'PARITY_FIXTURE_INVALID'
    | 'PARITY_COVERAGE_INVALID'
    | 'PARITY_MISMATCH'
    | 'PARITY_DIVERGENCE_INVALID'
  readonly message: string
}

export interface FixtureCoverageResult {
  readonly diagnostics: readonly ParityDiagnostic[]
}

export function hasObservableBranchChange(tags: Iterable<string>) {
  const observed = new Set(tags)
  return observed.has('behavior:branch-visible-change')
    || observed.has('behavior:branch-answer-change')
}

function codePointCompare(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!)
  const sharedLength = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function boundedMessage(message: string, maximumLength = 300) {
  const controlFree = Array.from(message, (character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint > 31 && (codePoint < 127 || codePoint > 159) ? character : ' '
  }).join('')
  const oneLine = controlFree.replace(/\s+/g, ' ').trim()
  return oneLine.slice(0, maximumLength)
}

function diagnostic(code: ParityDiagnostic['code'], message: string): ParityDiagnostic {
  return Object.freeze({ code, message: boundedMessage(message) })
}

export function validateFixtureCoverage(
  cases: readonly LegacyObservableTraceCase[],
  requiredCoverage: readonly string[],
): FixtureCoverageResult {
  const diagnostics: ParityDiagnostic[] = []
  const observed = new Set<string>()
  for (const traceCase of cases) {
    let derived: readonly string[]
    try {
      derived = deriveObservableCoverage({
        actions: traceCase.actions,
        frames: traceCase.frames,
      })
    } catch {
      diagnostics.push(diagnostic(
        'PARITY_FIXTURE_INVALID',
        `Case ${traceCase.id} has invalid observable actions or frames`,
      ))
      continue
    }
    const declared = traceCase.coverageTags
    const forbidden = declared.find((tag) => (
      tag === 'behavior:max-no-op'
      || tag.startsWith('semantic-class:')
      || tag.startsWith('diagnostic:')
      || tag.startsWith('repair:')
      || tag.startsWith('dependency:')
      || tag.startsWith('reachability:')
    ))
    if (forbidden || JSON.stringify(declared) !== JSON.stringify(derived)) {
      diagnostics.push(diagnostic(
        'PARITY_COVERAGE_INVALID',
        `Case ${traceCase.id} has fabricated, forbidden, duplicate, reordered, or orphan coverage`,
      ))
      continue
    }
    try {
      legacyObservableTraceCaseSchema.parse(traceCase)
    } catch {
      diagnostics.push(diagnostic('PARITY_FIXTURE_INVALID', `Case ${traceCase.id} is invalid`))
      continue
    }
    for (const tag of declared) observed.add(tag)
  }
  for (const required of requiredCoverage) {
    if (!observed.has(required)) {
      diagnostics.push(diagnostic('PARITY_COVERAGE_INVALID', `Missing required coverage ${required}`))
    }
  }
  if (!hasObservableBranchChange(observed)) {
    diagnostics.push(diagnostic(
      'PARITY_COVERAGE_INVALID',
      'Missing required branch visible-option or answer change coverage',
    ))
  }
  return Object.freeze({ diagnostics: Object.freeze(diagnostics) })
}

export function requiredObservableCoverage(model: CompiledQuestionModel): readonly string[] {
  const required = new Set<string>([
    'action:select',
    'action:deselect',
    'action:continue',
    'action:previous',
    'transition:initial',
    'transition:toggle',
    'transition:submit',
    'transition:forced-skip',
    'transition:next',
    'transition:previous',
    'transition:complete',
    'navigation-target:results',
    'behavior:forced-skip',
    'behavior:completion',
    'behavior:exclusive-replacement',
    'behavior:max-selection-blocked',
    'behavior:empty-restoration',
  ])
  for (const question of model.questions) {
    required.add(`question:${question.id}`)
    required.add(`navigation-target:${question.id}`)
    for (const option of question.options) required.add(`option:${question.id}:${option.id}`)
  }
  return Object.freeze([...required].sort(codePointCompare))
}

function parseCasesEnvelope(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('fixture cases envelope must be an object')
  }
  const record = input as Record<string, unknown>
  if (JSON.stringify(Object.keys(record).sort(codePointCompare)) !== JSON.stringify([
    'cases',
    'schemaVersion',
  ]) || record.schemaVersion !== 1) throw new Error('fixture cases envelope is invalid')
  return legacyObservableTraceCaseSchema.array().parse(record.cases)
}

function compactAction(action: LegacyObservableTraceCase['actions'][number], index: number) {
  if (action.type === 'select' || action.type === 'deselect') {
    return `${index}:${action.type}:${action.questionId}:${action.optionId}`
  }
  return `${index}:${action.type}:${action.fromQuestionId}`
}

export function formatMismatchDiagnostic(
  mismatch: ParityMismatch,
  traceCase: LegacyObservableTraceCase,
  semanticHash: string,
  fixtureHash: string,
  artifactPath: string,
) {
  const orderedActions = boundedMessage(
    traceCase.actions.map(compactAction).join(','),
    1_800,
  )
  return boundedMessage([
    `PARITY_MISMATCH case=${mismatch.caseId}`,
    `pointer=${mismatch.pointer}`,
    `expected=${mismatch.expectedValue}`,
    `received=${mismatch.receivedValue}`,
    `semanticHash=${semanticHash}`,
    `fixtureHash=${fixtureHash}`,
    mismatch.replayCommand,
    `artifact=${artifactPath}`,
    `actions=${orderedActions}`,
  ].join(' '), 4_096)
}

class ParityMismatchError extends Error {}

export function runParityQuestions(arguments_: readonly string[] = []) {
  let selectedCaseId: string | undefined
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] !== '--case' || !arguments_[index + 1] || selectedCaseId) {
      throw new Error('Usage: parity.ts [--case <case-id>]')
    }
    selectedCaseId = arguments_[index + 1]
    index += 1
  }

  const fixtureRoot = fileURLToPath(new URL('../fixtures/questions/', import.meta.url))
  const casesPath = join(fixtureRoot, 'legacy-v1/cases.json')
  const manifestPath = join(fixtureRoot, 'legacy-v1/manifest.json')
  const divergencePath = join(fixtureRoot, 'expected-divergences.json')
  const casesBytes = readFileSync(casesPath)
  const manifest = fixtureManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
  const frozenCases = parseCasesEnvelope(JSON.parse(casesBytes.toString('utf8')))
  const actualHash = createHash('sha256').update(casesBytes).digest('hex')
  if (
    actualHash !== manifest.fixtureContentHash
    || manifest.caseCount !== frozenCases.length
    || JSON.stringify(manifest.caseIds) !== JSON.stringify(frozenCases.map(({ id }) => id))
  ) throw new Error('PARITY_FIXTURE_INVALID: fixture manifest identity mismatch')

  const required = requiredObservableCoverage(questionModel)
  const frozenCoverage = validateFixtureCoverage(frozenCases, required)
  if (frozenCoverage.diagnostics.length > 0) {
    throw new Error(frozenCoverage.diagnostics.map(({ code, message }) => `${code}: ${message}`).join('; '))
  }
  let divergences: unknown
  try {
    divergences = expectedDivergencesSchema.parse(JSON.parse(readFileSync(divergencePath, 'utf8')))
  } catch {
    throw new Error('PARITY_DIVERGENCE_INVALID: divergence manifest is invalid')
  }
  const adjustedCases = applyExpectedDivergences(
    frozenCases,
    divergences,
    questionModel.metadata.semanticHash,
  )
  const selected = selectedCaseId
    ? adjustedCases.filter(({ id }) => id === selectedCaseId)
    : adjustedCases
  if (selectedCaseId && selected.length === 0) throw new Error(`Unknown parity case ${selectedCaseId}`)

  const receivedCases = selected.map((expected) => {
    const trace = executeObservableTrace(questionModel, expected.actions)
    return legacyObservableTraceCaseSchema.parse({
      id: expected.id,
      actions: trace.actions,
      coverageTags: deriveObservableCoverage(trace),
      frames: trace.frames,
    })
  })
  const receivedCoverage = validateFixtureCoverage(
    receivedCases,
    selectedCaseId ? receivedCases.flatMap(({ coverageTags }) => coverageTags) : required,
  )
  if (receivedCoverage.diagnostics.length > 0) {
    throw new Error(receivedCoverage.diagnostics.map(({ code, message }) => `${code}: ${message}`).join('; '))
  }

  for (const [index, expected] of selected.entries()) {
    const received = receivedCases[index]!
    const mismatch = compareParityCase(expected, received)
    if (!mismatch) continue
    const artifactRoot = mkdtempSync(join(tmpdir(), 'ramen-question-parity-'))
    const artifactPath = join(artifactRoot, `${expected.id}.json`)
    writeFileSync(artifactPath, `${JSON.stringify({ expected, received }, null, 2)}\n`)
    throw new ParityMismatchError(formatMismatchDiagnostic(
      mismatch,
      expected,
      questionModel.metadata.semanticHash,
      manifest.fixtureContentHash,
      artifactPath,
    ))
  }

  const result = Object.freeze({
    status: 'pass' as const,
    caseCount: selected.length,
    fixtureContentHash: manifest.fixtureContentHash,
    semanticHash: questionModel.metadata.semanticHash,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runParityQuestions(process.argv.slice(2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${error instanceof ParityMismatchError
      ? boundedMessage(message, 4_096)
      : boundedMessage(message)}\n`)
    process.exitCode = 1
  }
}
