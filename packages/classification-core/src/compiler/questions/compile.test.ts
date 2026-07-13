import { describe, expect, test } from 'vitest'

import type { QuestionDefinitionSource } from '../../contracts/question-model.js'
import { classificationDefinition } from '../../definitions/classification.js'
import { questionDefinitions } from '../../definitions/questions.js'
import { compileClassification } from '../compile.js'
import { compileQuestions } from './compile.js'
import { deadOptionDefinition } from './test-fixtures.js'

function expectCompiled(definitions: readonly QuestionDefinitionSource[]) {
  const result = compileQuestions(definitions)
  if (!result.ok) throw new Error(`test definitions must compile: ${JSON.stringify(result.diagnostics)}`)
  return result.model
}

const productionModel = expectCompiled(questionDefinitions)

describe('question compiler', () => {
  test('emits fixed metadata and attaches proof output', () => {
    const model = productionModel

    expect(model.metadata).toEqual({
      schemaVersion: '1',
      compilerVersion: '1',
      modelVersion: 'batch2a.1.0',
      sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      semanticHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(model.questions.find(({ id }) => id === 'source')?.validSelectionKeys)
      .toContain('["pork","chicken"]')
    expect(model.questions.find(({ id }) => id === 'exclusions')?.validSelectionKeys)
      .toHaveLength(256)
    expect(model.forcedIterationUpperBound).toBe(62)
    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.questions[0]!.validSelectionKeys)).toBe(true)
  })

  test('separates source and semantic hashes for non-flow metadata', () => {
    const original = productionModel
    const metadataOnly = expectCompiled(questionDefinitions.map((question) => (
      question.id === 'form'
        ? {
            ...question,
            messageIds: {
              ...question.messageIds,
              description: 'question-form-description-revised',
            },
          }
        : question
    )) as readonly QuestionDefinitionSource[])
    const reweighted = expectCompiled(questionDefinitions.map((question) => (
      question.id === 'form' ? { ...question, weight: 17 } : question
    )) as readonly QuestionDefinitionSource[])

    expect(original.metadata.sourceHash).not.toBe(metadataOnly.metadata.sourceHash)
    expect(original.metadata.semanticHash).toBe(metadataOnly.metadata.semanticHash)
    expect(original.metadata.sourceHash).not.toBe(reweighted.metadata.sourceHash)
    expect(original.metadata.semanticHash).toBe(reweighted.metadata.semanticHash)
  }, 10_000)

  test('changes the semantic hash for interaction changes', () => {
    const original = productionModel
    const reorderedOption = expectCompiled(questionDefinitions.map((question) => (
      question.id === 'form'
        ? {
            ...question,
            options: question.options.map((option) => (
              option.id === 'soup' ? { ...option, order: 3 } : option
            )),
          }
        : question
    )) as readonly QuestionDefinitionSource[])

    expect(original.metadata.sourceHash).not.toBe(reorderedOption.metadata.sourceHash)
    expect(original.metadata.semanticHash).not.toBe(reorderedOption.metadata.semanticHash)
  })

  test('canonicalizes equivalent question and option insertion order before hashing', () => {
    const original = productionModel
    const reordered = expectCompiled([...questionDefinitions].reverse().map((question) => ({
      ...question,
      options: [...question.options].reverse(),
    })) as readonly QuestionDefinitionSource[])

    expect(reordered).toEqual(original)
    expect(reordered.metadata.sourceHash).toBe(original.metadata.sourceHash)
    expect(reordered.metadata.semanticHash).toBe(original.metadata.semanticHash)
  })

  test('returns semantic proof failures instead of a partial model', () => {
    const result = compileQuestions(deadOptionDefinition)

    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('model')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'FLOW_DEAD_OPTION',
    }))
  })

  test('classification compilation consumes compiled production questions', () => {
    const result = compileClassification(
      classificationDefinition,
      'packages/classification-core/src/definitions/classification.ts',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.questions[0]!.selection.overrides).toEqual([])
    expect(result.model.questions[0]!.allowedOptions).toEqual([])
    expect(result.model.questions[0]!.validSelectionKeys).toEqual([
      '["dry"]',
      '["soup"]',
      '["tsukemen"]',
    ])
  })
})
