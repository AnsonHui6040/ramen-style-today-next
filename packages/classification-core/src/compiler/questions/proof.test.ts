import { describe, expect, test } from 'vitest'

import { questionDefinitions } from '../../definitions/questions.js'
import { stableJson } from '../stable-json.js'
import { proveForcedFixedPoint, proveQuestionModel } from './proof.js'
import {
  deadOptionDefinition,
  deadQuestionDefinition,
  emptyBranchDefinition,
  forcedCycleCompiledModel,
  impossibleCompletionDefinition,
  transientUnsatisfiableDefinition,
} from './test-fixtures.js'

const firstProductionProof = proveQuestionModel(questionDefinitions)
const secondProductionProof = proveQuestionModel(questionDefinitions)

describe('question semantic proofs', () => {
  test.each([
    ['empty branch', emptyBranchDefinition, 'FLOW_EMPTY_BRANCH'],
    ['dead question', deadQuestionDefinition, 'FLOW_DEAD_QUESTION'],
    ['dead option', deadOptionDefinition, 'FLOW_DEAD_OPTION'],
  ] as const)('rejects %s with only its isolated proof failure', (_name, definition, code) => {
    const result = proveQuestionModel(definition)

    expect(result.diagnostics.map((item) => item.code)).toEqual([code])
  })

  test('rejects a non-empty branch that cannot satisfy exclusivity and bounds', () => {
    const result = proveQuestionModel(impossibleCompletionDefinition)

    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'FLOW_IMPOSSIBLE_COMPLETION',
    ])
  })

  test('rejects a transient reachable unsatisfiable environment before it becomes unreachable', () => {
    const result = proveQuestionModel(transientUnsatisfiableDefinition)

    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'FLOW_IMPOSSIBLE_COMPLETION',
    ])
    expect(result.coverage.optionIds).not.toContain('transient:exclusive')
    expect(result.coverage.optionIds).not.toContain('transient:ordinary')
  })

  test('detects a repeated canonical key in defensive forced resolution', () => {
    const result = proveForcedFixedPoint(forcedCycleCompiledModel)

    expect(result.diagnostics.map((item) => item.code)).toContain('FLOW_FORCED_CYCLE')
    expect(result.iterations).toBeLessThanOrEqual(result.upperBound)
  })

  test('covers every production question and question-scoped option occurrence', () => {
    const proof = firstProductionProof

    expect(proof.diagnostics).toEqual([])
    expect(proof.coverage.questionIds).toEqual(questionDefinitions.map(({ id }) => id))
    expect(proof.coverage.optionIds).toHaveLength(53)
    expect(new Set(proof.coverage.optionIds).size).toBe(53)
  })

  test('emits only legal compiled-order selection keys and a model-sized forced bound', () => {
    const proof = firstProductionProof

    expect(proof.validSelectionKeysByQuestion.source).toContain('["pork","chicken"]')
    expect(proof.validSelectionKeysByQuestion.source).not.toContain('["pork","unsure"]')
    expect(proof.validSelectionKeysByQuestion.exclusions).toHaveLength(256)
    expect(proof.forcedIterationUpperBound).toBe(62)
  })

  test('is byte-deterministic across independent production proofs', () => {
    expect(stableJson(firstProductionProof)).toBe(
      stableJson(secondProductionProof),
    )
  })
})
