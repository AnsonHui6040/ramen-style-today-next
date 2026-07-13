import { describe, expect, test } from 'vitest'

import type { QuestionDefinitionSource } from '../../contracts/question-model.js'
import { questionDefinitions } from '../../definitions/questions.js'
import { canonicalizeQuestionSource } from './canonicalize.js'
import {
  deriveQuestionGraph,
  extractConditionReferences,
} from './dependencies.js'

function question(
  id: string,
  order: number,
  availableWhen?: QuestionDefinitionSource['availableWhen'],
): QuestionDefinitionSource {
  return {
    id,
    order,
    messageIds: { title: `question-${id}-title`, description: `question-${id}-description` },
    selection: { type: 'single', min: 1, max: 1 },
    ...(availableWhen ? { availableWhen } : {}),
    options: [{
      id: 'value',
      order: 0,
      messageIds: { label: `option-${id}-value-label` },
    }],
  }
}

describe('question semantic dependencies', () => {
  test('derives archetype validity dependencies from decision rows', () => {
    const canonical = canonicalizeQuestionSource(questionDefinitions)
    const graph = deriveQuestionGraph(canonical)

    expect(graph.semanticDependencies.tare).toEqual(['archetype'])
    expect(graph.dependentClosures.form).toEqual([
      'archetype', 'tare', 'source', 'body', 'noodle', 'signature',
    ])
    expect(graph.dependentClosures.form).not.toContain('exclusions')
    expect(graph.topologicalOrder).toEqual([
      'form', 'archetype', 'tare', 'source', 'body', 'noodle', 'signature', 'exclusions',
    ])
    expect(graph.diagnostics).toEqual([])
  })

  test('extracts references from every semantic condition-bearing field', () => {
    const definitions: QuestionDefinitionSource[] = [
      question('question-available', 0),
      question('option-available', 1),
      question('allowed-options', 2),
      question('selection-override', 3),
      question('auto-answer', 4),
      {
        ...question('owner', 5, { type: 'answered', questionId: 'question-available' }),
        options: [{
          ...question('unused', 0).options[0]!,
          availableWhen: { type: 'answered', questionId: 'option-available' },
        }],
        allowedOptions: [{
          when: { type: 'answered', questionId: 'allowed-options' },
          selection: { type: 'all' },
        }],
        selection: {
          type: 'single',
          min: 1,
          max: 1,
          overrides: [{
            when: { type: 'answered', questionId: 'selection-override' },
            min: 0,
            max: 1,
          }],
        },
        autoAnswer: {
          type: 'single-allowed-option',
          when: { type: 'answered', questionId: 'auto-answer' },
        },
      },
    ]
    const canonical = canonicalizeQuestionSource(definitions)

    expect(extractConditionReferences(canonical).filter(({ ownerQuestionId }) => (
      ownerQuestionId === 'owner'
    ))).toEqual([
      {
        ownerQuestionId: 'owner',
        referencedQuestionId: 'question-available',
        path: '/questions/5/availableWhen/questionId',
      },
      {
        ownerQuestionId: 'owner',
        referencedQuestionId: 'option-available',
        path: '/questions/5/options/0/availableWhen/questionId',
      },
      {
        ownerQuestionId: 'owner',
        referencedQuestionId: 'allowed-options',
        path: '/questions/5/allowedOptions/0/when/questionId',
      },
      {
        ownerQuestionId: 'owner',
        referencedQuestionId: 'selection-override',
        path: '/questions/5/selection/overrides/0/when/questionId',
      },
      {
        ownerQuestionId: 'owner',
        referencedQuestionId: 'auto-answer',
        path: '/questions/5/autoAnswer/when/questionId',
      },
    ])
    expect(deriveQuestionGraph(canonical).semanticDependencies.owner).toEqual([
      'question-available',
      'option-available',
      'allowed-options',
      'selection-override',
      'auto-answer',
    ])
  })

  test('rejects duplicate order and unknown condition references', () => {
    const invalidDefinitions = [
      question('a', 0, { type: 'answered', questionId: 'missing' }),
      question('b', 0),
    ]

    const result = deriveQuestionGraph(canonicalizeQuestionSource(invalidDefinitions))

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'QUESTION_ORDER_DUPLICATE',
      'CONDITION_REFERENCE_UNKNOWN',
    ])
  })

  test('uses a stable Kahn order independent from display order', () => {
    const definitions = [
      question('first-in-display', 0, { type: 'answered', questionId: 'last-in-display' }),
      question('independent', 1),
      question('last-in-display', 2),
    ]

    const graph = deriveQuestionGraph(canonicalizeQuestionSource(definitions))

    expect(graph.topologicalOrder).toEqual([
      'independent',
      'last-in-display',
      'first-in-display',
    ])
  })

  test('reports cycles found through nested commutative conditions', () => {
    const definitions = [
      question('a', 0, {
        type: 'all',
        conditions: [{
          type: 'not',
          condition: {
            type: 'any',
            conditions: [{ type: 'answered', questionId: 'b' }],
          },
        }],
      }),
      question('b', 1, { type: 'answered', questionId: 'a' }),
    ]

    const graph = deriveQuestionGraph(canonicalizeQuestionSource(definitions))

    expect(graph.diagnostics).toContainEqual(expect.objectContaining({
      code: 'FLOW_CYCLE',
      path: '/questions',
    }))
  })
})
