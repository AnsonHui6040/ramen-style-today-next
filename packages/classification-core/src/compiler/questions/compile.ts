import { createHash } from 'node:crypto'

import { deepFreeze } from '../../contracts/deep-freeze.js'
import type { Diagnostic } from '../../contracts/diagnostic.js'
import type {
  CompiledQuestion,
  CompiledQuestionModel,
  QuestionDefinitionSource,
} from '../../contracts/question-model.js'
import { stableJson } from '../stable-json.js'
import {
  canonicalizeQuestionSource,
  type CanonicalQuestion,
} from './canonicalize.js'
import { deriveQuestionGraph } from './dependencies.js'
import {
  proveQuestionModel,
  type QuestionModelProof,
} from './proof.js'

export type CompileQuestionsResult =
  | {
      readonly ok: true
      readonly model: CompiledQuestionModel
      readonly diagnostics: readonly Diagnostic[]
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly Diagnostic[]
    }

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function projectQuestionFlowSource(question: CanonicalQuestion) {
  return {
    id: question.id,
    order: question.order,
    selection: question.selection,
    ...(question.availableWhen === undefined
      ? {}
      : { availableWhen: question.availableWhen }),
    options: question.options.map((option) => ({
      id: option.id,
      order: option.order,
      ...(option.availableWhen === undefined
        ? {}
        : { availableWhen: option.availableWhen }),
      exclusive: option.exclusive,
    })),
    allowedOptions: question.allowedOptions,
    ...(question.autoAnswer === undefined
      ? {}
      : { autoAnswer: question.autoAnswer }),
    initialUiOptionIds: question.initialUiOptionIds,
    pendingSelection: question.pendingSelection,
  }
}

function projectFlowSemantics(question: CompiledQuestion) {
  return {
    ...projectQuestionFlowSource(question),
    validSelectionKeys: question.validSelectionKeys,
  }
}

let cachedSuccessfulProof: {
  readonly key: string
  readonly proof: QuestionModelProof
} | undefined

export function compileQuestions(
  definition: readonly QuestionDefinitionSource[],
): CompileQuestionsResult {
  const canonicalSource = canonicalizeQuestionSource(definition)
  const graph = deriveQuestionGraph(canonicalSource)
  const proofKey = stableJson(canonicalSource.map(projectQuestionFlowSource))
  const proof = cachedSuccessfulProof?.key === proofKey
    ? cachedSuccessfulProof.proof
    : proveQuestionModel(definition)
  if (proof.diagnostics.some(({ severity }) => severity === 'error')) {
    return { ok: false, diagnostics: proof.diagnostics }
  }
  cachedSuccessfulProof = { key: proofKey, proof }

  const compiledQuestions = canonicalSource.map((question) => ({
    ...question,
    validSelectionKeys: proof.validSelectionKeysByQuestion[question.id] ?? [],
  })) satisfies readonly CompiledQuestion[]
  const sourceHash = sha256(stableJson(canonicalSource))
  const semanticHash = sha256(stableJson({
    questions: compiledQuestions.map(projectFlowSemantics),
    semanticDependencies: graph.semanticDependencies,
    dependentClosures: graph.dependentClosures,
    topologicalOrder: graph.topologicalOrder,
  }))
  const model = deepFreeze({
    metadata: {
      schemaVersion: '1',
      compilerVersion: '1',
      modelVersion: 'batch2a.1.0',
      sourceHash,
      semanticHash,
    },
    questions: compiledQuestions,
    semanticDependencies: graph.semanticDependencies,
    dependentClosures: graph.dependentClosures,
    topologicalOrder: graph.topologicalOrder,
    forcedIterationUpperBound: proof.forcedIterationUpperBound,
  } satisfies CompiledQuestionModel)

  return { ok: true, model, diagnostics: proof.diagnostics }
}
