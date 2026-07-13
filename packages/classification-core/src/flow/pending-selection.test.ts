import { describe, expect, test } from 'vitest'

import { deepFreeze } from '../contracts/deep-freeze.js'
import { questionModel } from '../generated/question-model.js'
import { evaluateFlow } from './evaluate.js'
import { updatePendingSelection } from './pending-selection.js'
import { chintanDraft } from './test-fixtures.js'
import type {
  PendingQuestionState,
  PendingSelectionOperation,
} from './types.js'

function makeQuestionState(
  overrides: Partial<PendingQuestionState<string, string>> = {},
): PendingQuestionState<string, string> {
  return deepFreeze({
    questionId: 'generic',
    optionOrder: ['pork', 'none'],
    allowedOptionIds: ['pork', 'none'],
    exclusiveOptionIds: ['none'],
    minSelections: 1,
    maxSelections: 2,
    initialUiOptionIds: [],
    emptyBehavior: { type: 'allow-empty' as const },
    ...overrides,
  })
}

const sourceQuestion = questionModel.questions.find(({ id }) => id === 'source')!
const chintanState = evaluateFlow(questionModel, chintanDraft)
const sourceState = makeQuestionState({
  questionId: sourceQuestion.id,
  optionOrder: sourceQuestion.options.map(({ id }) => id),
  allowedOptionIds: chintanState.allowedOptionIdsByQuestion.source ?? [],
  exclusiveOptionIds: sourceQuestion.options
    .filter(({ exclusive }) => exclusive)
    .map(({ id }) => id),
  minSelections: sourceQuestion.selection.min,
  maxSelections: sourceQuestion.selection.max,
  initialUiOptionIds: sourceQuestion.initialUiOptionIds,
  emptyBehavior: sourceQuestion.pendingSelection.emptyBehavior,
})

function select(
  state: PendingQuestionState<string, string>,
  current: readonly string[],
  optionId: string,
) {
  return updatePendingSelection(state, current, { type: 'select', optionId }).optionIds
}

function captureObjectState(value: object) {
  return {
    frozen: Object.isFrozen(value),
    descriptors: Object.getOwnPropertyDescriptors(value),
  }
}

function captureCallerObjects(values: readonly object[]) {
  return values.map((value) => ({ value, state: captureObjectState(value) }))
}

function expectCallerObjectsUnchanged(
  captures: ReturnType<typeof captureCallerObjects>,
) {
  for (const { value, state } of captures) {
    expect(Object.isFrozen(value)).toBe(state.frozen)
    expect(Object.getOwnPropertyDescriptors(value)).toEqual(state.descriptors)
  }
}

describe('updatePendingSelection', () => {
  test('uses compiled empty behavior without checking exclusions ID', () => {
    const genericState = makeQuestionState({
      questionId: 'generic',
      initialUiOptionIds: ['none'],
      emptyBehavior: { type: 'restore-initial-ui-options' },
    })

    expect(updatePendingSelection(genericState, ['pork'], {
      type: 'deselect',
      optionId: 'pork',
    }).optionIds).toEqual(['none'])
  })

  test('preserves exclusive and max-selection legacy toggles', () => {
    expect(select(sourceState, ['pork'], 'unsure')).toEqual(['unsure'])
    expect(select(sourceState, ['unsure'], 'pork')).toEqual(['pork'])
    expect(select(sourceState, ['pork', 'chicken'], 'duck')).toEqual(['pork', 'chicken'])
  })

  test.each([
    {
      name: 'selects a new ordinary option in compiled order',
      state: makeQuestionState({
        optionOrder: ['pork', 'chicken', 'duck', 'none'],
        allowedOptionIds: ['pork', 'chicken', 'duck', 'none'],
        exclusiveOptionIds: ['none'],
        maxSelections: 3,
      }),
      current: ['duck', 'pork'],
      operation: { type: 'select', optionId: 'chicken' },
      expected: ['pork', 'chicken', 'duck'],
    },
    {
      name: 'keeps an existing ordinary selection as a canonical no-op',
      state: makeQuestionState(),
      current: ['pork'],
      operation: { type: 'select', optionId: 'pork' },
      expected: ['pork'],
    },
    {
      name: 'deselects an ordinary option and preserves compiled order',
      state: makeQuestionState({
        optionOrder: ['pork', 'chicken', 'duck', 'none'],
        allowedOptionIds: ['pork', 'chicken', 'duck', 'none'],
        exclusiveOptionIds: ['none'],
        maxSelections: 3,
      }),
      current: ['duck', 'pork', 'chicken'],
      operation: { type: 'deselect', optionId: 'chicken' },
      expected: ['pork', 'duck'],
    },
    {
      name: 'allows an empty pending selection when compiled to allow empty',
      state: makeQuestionState(),
      current: ['pork'],
      operation: { type: 'deselect', optionId: 'pork' },
      expected: [],
    },
    {
      name: 'keeps a missing deselection as a canonical no-op',
      state: makeQuestionState(),
      current: ['pork'],
      operation: { type: 'deselect', optionId: 'none' },
      expected: ['pork'],
    },
    {
      name: 'does not restore defaults when deselecting an absent option',
      state: makeQuestionState({
        initialUiOptionIds: ['none'],
        emptyBehavior: { type: 'restore-initial-ui-options' },
      }),
      current: [],
      operation: { type: 'deselect', optionId: 'pork' },
      expected: [],
    },
  ] as const)('$name', ({ state, current, operation, expected }) => {
    const result = updatePendingSelection(state, current, operation)

    expect(result).toEqual({ optionIds: expected, diagnostics: [] })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.optionIds)).toBe(true)
    expect(Object.isFrozen(result.diagnostics)).toBe(true)
  })

  test('rejects an unknown option with a deterministic diagnostic and canonical no-op', () => {
    const current = ['none', 'pork', 'pork']
    const result = updatePendingSelection(makeQuestionState(), current, {
      type: 'select',
      optionId: 'future',
    })

    expect(result.optionIds).toEqual(['pork', 'none'])
    expect(result.diagnostics).toMatchObject([{
      severity: 'error',
      code: 'ANSWER_UNKNOWN_OPTION',
      sourceFile: 'runtime://pending-selection',
      path: '/operation/optionId',
      entityId: 'generic:future',
      expected: ['pork', 'none'],
      received: 'future',
    }])
  })

  test('rejects a known disallowed option without changing canonical pending IDs', () => {
    const state = makeQuestionState({ allowedOptionIds: ['pork'] })
    const result = updatePendingSelection(state, ['pork'], {
      type: 'select',
      optionId: 'none',
    })

    expect(result.optionIds).toEqual(['pork'])
    expect(result.diagnostics).toMatchObject([{
      code: 'ANSWER_OPTION_DISALLOWED',
      path: '/operation/optionId',
      entityId: 'generic:none',
      expected: ['pork'],
      received: 'none',
    }])
  })

  test('rejects an invalid operation type deterministically', () => {
    const operation = { type: 'toggle', optionId: 'pork' }
    const result = updatePendingSelection(
      makeQuestionState(),
      ['pork'],
      operation as unknown as PendingSelectionOperation<string>,
    )

    expect(result.optionIds).toEqual(['pork'])
    expect(result.diagnostics).toMatchObject([{
      code: 'STRUCTURE_INVALID',
      sourceFile: 'runtime://pending-selection',
      path: '/operation/type',
      expected: ['select', 'deselect'],
      received: 'toggle',
    }])
  })

  test.each(['type', 'optionId'] as const)(
    'rejects an accessor-backed %s without invoking its throwing getter',
    (key) => {
      let getterCalls = 0
      const operation: Record<string, unknown> = {
        type: 'select',
        optionId: 'pork',
      }
      Object.defineProperty(operation, key, {
        enumerable: true,
        configurable: true,
        get() {
          getterCalls += 1
          throw new Error(`executed ${key} getter`)
        },
      })
      const current = ['none', 'pork']
      const callerObjects = captureCallerObjects([operation, current])

      const result = updatePendingSelection(
        makeQuestionState(),
        current,
        operation as unknown as PendingSelectionOperation<string>,
      )

      expect(getterCalls).toBe(0)
      expect(result.optionIds).toEqual(['pork', 'none'])
      expect(result.diagnostics).toMatchObject([{
        code: 'STRUCTURE_INVALID',
        path: `/operation/${key}`,
        expected: 'own enumerable data property',
        received: 'accessor',
      }])
      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result.diagnostics[0])).toBe(true)
      expectCallerObjectsUnchanged(callerObjects)
    },
  )

  test.each(['type', 'optionId'] as const)(
    'rejects a prototype-provided %s as a missing own operation field',
    (key) => {
      const prototype = { [key]: key === 'type' ? 'select' : 'pork' }
      const operation = Object.assign(
        Object.create(prototype) as Record<string, unknown>,
        key === 'type' ? { optionId: 'pork' } : { type: 'select' },
      )
      const current = ['none', 'pork']
      const callerObjects = captureCallerObjects([prototype, operation, current])

      const result = updatePendingSelection(
        makeQuestionState(),
        current,
        operation as unknown as PendingSelectionOperation<string>,
      )

      expect(result.optionIds).toEqual(['pork', 'none'])
      expect(result.diagnostics).toMatchObject([{
        code: 'STRUCTURE_INVALID',
        path: `/operation/${key}`,
        expected: 'own enumerable data property',
        received: 'missing',
      }])
      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result.optionIds)).toBe(true)
      expect(Object.isFrozen(result.diagnostics)).toBe(true)
      expectCallerObjectsUnchanged(callerObjects)
    },
  )

  test.each(['type', 'optionId'] as const)(
    'rejects a non-enumerable own %s operation field',
    (key) => {
      const operation: Record<string, unknown> = {
        type: 'select',
        optionId: 'pork',
      }
      Object.defineProperty(operation, key, {
        value: operation[key],
        enumerable: false,
        configurable: true,
        writable: true,
      })

      const result = updatePendingSelection(
        makeQuestionState(),
        ['pork'],
        operation as unknown as PendingSelectionOperation<string>,
      )

      expect(result.optionIds).toEqual(['pork'])
      expect(result.diagnostics).toMatchObject([{
        code: 'STRUCTURE_INVALID',
        path: `/operation/${key}`,
        expected: 'own enumerable data property',
        received: 'non-enumerable',
      }])
      expect(Object.isFrozen(result.diagnostics[0])).toBe(true)
      expect(Object.isFrozen(operation)).toBe(false)
    },
  )

  test.each([
    { name: 'function', value: function callerOwnedType() {} },
    { name: 'symbol', value: Symbol('caller-owned-type') },
  ])('normalizes a caller-owned $name type without retaining it', ({ name, value }) => {
    const operation = { type: value, optionId: 'pork' }

    const result = updatePendingSelection(
      makeQuestionState(),
      ['pork'],
      operation as unknown as PendingSelectionOperation<string>,
    )

    expect(result.optionIds).toEqual(['pork'])
    expect(result.diagnostics).toMatchObject([{
      code: 'STRUCTURE_INVALID',
      path: '/operation/type',
      expected: ['select', 'deselect'],
      received: name,
    }])
    expect(result.diagnostics[0]?.received).not.toBe(value)
    expect(Object.isFrozen(result.diagnostics[0])).toBe(true)
    expect(Object.isFrozen(operation)).toBe(false)
  })

  test('rejects an array operation even when it provides usable-looking fields', () => {
    const operation = Object.assign([], { type: 'select', optionId: 'none' })

    const result = updatePendingSelection(
      makeQuestionState(),
      ['pork'],
      operation as unknown as PendingSelectionOperation<string>,
    )

    expect(result.optionIds).toEqual(['pork'])
    expect(result.diagnostics).toMatchObject([{
      code: 'STRUCTURE_INVALID',
      path: '/operation',
      expected: 'non-array object',
      received: 'array',
    }])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(operation)).toBe(false)
  })

  test('accepts structural extra fields without reading an extra accessor', () => {
    let getterCalls = 0
    const operation = { type: 'select', optionId: 'none' } as const
    Object.defineProperty(operation, 'metadata', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        throw new Error('executed metadata getter')
      },
    })
    const callerObjects = captureCallerObjects([operation])

    const result = updatePendingSelection(makeQuestionState(), ['pork'], operation)

    expect(getterCalls).toBe(0)
    expect(result).toEqual({ optionIds: ['none'], diagnostics: [] })
    expectCallerObjectsUnchanged(callerObjects)
  })

  test.each([
    {
      name: 'canonical no-op',
      operation: { type: 'select', optionId: 'duck' },
    },
    {
      name: 'diagnostic rejection',
      operation: { type: 'select', optionId: 'future' },
    },
  ] as const)('preserves caller ownership on $name', ({ operation }) => {
    const optionOrder = ['pork', 'chicken', 'duck', 'none']
    const allowedOptionIds = ['pork', 'chicken', 'duck', 'none']
    const exclusiveOptionIds = ['none']
    const initialUiOptionIds: string[] = []
    const emptyBehavior = { type: 'allow-empty' as const }
    const state: PendingQuestionState<string, string> = {
      questionId: 'generic',
      optionOrder,
      allowedOptionIds,
      exclusiveOptionIds,
      minSelections: 1,
      maxSelections: 2,
      initialUiOptionIds,
      emptyBehavior,
    }
    const current = ['chicken', 'pork']
    const callerObjects = captureCallerObjects([
      state,
      optionOrder,
      allowedOptionIds,
      exclusiveOptionIds,
      initialUiOptionIds,
      emptyBehavior,
      current,
      operation,
    ])

    const result = updatePendingSelection(state, current, operation)

    expect(result.optionIds).toEqual(['pork', 'chicken'])
    expect(result.optionIds).not.toBe(current)
    expect(Object.isFrozen(result)).toBe(true)
    expectCallerObjectsUnchanged(callerObjects)
  })
})
