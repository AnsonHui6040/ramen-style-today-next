import { describe, expect, test } from 'vitest'
import type { CompiledQuestionModel } from '../contracts/question-model.js'
import type { AnswerDraft } from '../flow/types.js'
import { forcedCycleModel } from '../flow/test-fixtures.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { projectRepairedSubmittedAnswers } from './repair.js'
import { questionModel } from './test-fixtures.js'

const gateOff = {
  type: 'answer-includes',
  questionId: 'gate',
  optionId: 'off',
} as const

const gateOn = {
  type: 'answer-includes',
  questionId: 'gate',
  optionId: 'on',
} as const

const repairModel = {
  metadata: {
    schemaVersion: '1',
    compilerVersion: 'test',
    modelVersion: 'repair-test',
    sourceHash: 'repair-test',
    semanticHash: 'repair-test',
  },
  questions: [
    {
      id: 'gate',
      order: 1,
      messageIds: { title: 'gate-title', description: 'gate-description' },
      selection: { type: 'single', min: 1, max: 1, overrides: [] },
      options: [
        { id: 'on', order: 1, messageIds: { label: 'on-label' }, exclusive: false },
        { id: 'off', order: 2, messageIds: { label: 'off-label' }, exclusive: false },
      ],
      allowedOptions: [],
      initialUiOptionIds: [],
      pendingSelection: { emptyBehavior: { type: 'allow-empty' } },
      validSelectionKeys: ['["on"]', '["off"]'],
    },
    {
      id: 'unreachable',
      order: 2,
      messageIds: { title: 'unreachable-title', description: 'unreachable-description' },
      selection: { type: 'single', min: 1, max: 1, overrides: [] },
      availableWhen: gateOn,
      options: [{
        id: 'branch-value',
        order: 1,
        messageIds: { label: 'branch-value-label' },
        exclusive: false,
      }],
      allowedOptions: [],
      initialUiOptionIds: [],
      pendingSelection: { emptyBehavior: { type: 'allow-empty' } },
      validSelectionKeys: ['["branch-value"]'],
    },
    {
      id: 'disallowed',
      order: 3,
      messageIds: { title: 'disallowed-title', description: 'disallowed-description' },
      selection: { type: 'multiple', min: 1, max: 2, overrides: [] },
      options: [
        { id: 'keep', order: 1, messageIds: { label: 'keep-label' }, exclusive: false },
        {
          id: 'stale',
          order: 2,
          messageIds: { label: 'stale-label' },
          availableWhen: gateOn,
          exclusive: false,
        },
      ],
      allowedOptions: [],
      initialUiOptionIds: [],
      pendingSelection: { emptyBehavior: { type: 'allow-empty' } },
      validSelectionKeys: ['["keep"]', '["stale"]', '["keep","stale"]'],
    },
    {
      id: 'under-min',
      order: 4,
      messageIds: { title: 'under-min-title', description: 'under-min-description' },
      selection: { type: 'multiple', min: 2, max: 2, overrides: [] },
      options: [
        { id: 'keep-a', order: 1, messageIds: { label: 'keep-a-label' }, exclusive: false },
        { id: 'keep-b', order: 2, messageIds: { label: 'keep-b-label' }, exclusive: false },
        {
          id: 'stale-min',
          order: 3,
          messageIds: { label: 'stale-min-label' },
          availableWhen: gateOn,
          exclusive: false,
        },
      ],
      allowedOptions: [],
      initialUiOptionIds: [],
      pendingSelection: { emptyBehavior: { type: 'allow-empty' } },
      validSelectionKeys: [
        '["keep-a","keep-b"]',
        '["keep-a","stale-min"]',
        '["keep-b","stale-min"]',
      ],
    },
    {
      id: 'forced',
      order: 5,
      messageIds: { title: 'forced-title', description: 'forced-description' },
      selection: { type: 'single', min: 1, max: 1, overrides: [] },
      options: [
        { id: 'forced-value', order: 1, messageIds: { label: 'forced-label' }, exclusive: false },
        { id: 'other-value', order: 2, messageIds: { label: 'other-label' }, exclusive: false },
      ],
      allowedOptions: [{
        when: gateOff,
        selection: { type: 'only', optionIds: ['forced-value'] },
      }],
      autoAnswer: { type: 'single-allowed-option' },
      initialUiOptionIds: [],
      pendingSelection: { emptyBehavior: { type: 'allow-empty' } },
      validSelectionKeys: ['["forced-value"]', '["other-value"]'],
    },
    {
      id: 'ordered',
      order: 6,
      messageIds: { title: 'ordered-title', description: 'ordered-description' },
      selection: { type: 'multiple', min: 1, max: 2, overrides: [] },
      options: [
        { id: 'first', order: 1, messageIds: { label: 'first-label' }, exclusive: false },
        { id: 'second', order: 2, messageIds: { label: 'second-label' }, exclusive: false },
      ],
      allowedOptions: [],
      initialUiOptionIds: [],
      pendingSelection: { emptyBehavior: { type: 'allow-empty' } },
      validSelectionKeys: ['["first"]', '["second"]', '["first","second"]'],
    },
  ],
  semanticDependencies: {
    gate: [],
    unreachable: ['gate'],
    disallowed: ['gate'],
    'under-min': ['gate'],
    forced: ['gate'],
    ordered: [],
  },
  dependentClosures: {
    gate: ['unreachable', 'disallowed', 'under-min', 'forced'],
    unreachable: [],
    disallowed: [],
    'under-min': [],
    forced: [],
    ordered: [],
  },
  topologicalOrder: [
    'gate',
    'unreachable',
    'disallowed',
    'under-min',
    'forced',
    'ordered',
  ],
  forcedIterationUpperBound: 10,
} as const satisfies CompiledQuestionModel

function draft(input: Readonly<Record<string, readonly string[]>>): AnswerDraft {
  return input as AnswerDraft
}

function staleDraft(): AnswerDraft {
  return draft({
    ordered: ['second', 'first'],
    forced: ['other-value'],
    'under-min': ['keep-a', 'stale-min'],
    disallowed: ['stale', 'keep'],
    unreachable: ['branch-value'],
    gate: ['off'],
  })
}

function expectInvalidCode(input: unknown, code: string): void {
  const result = projectRepairedSubmittedAnswers(
    questionModel,
    input as AnswerDraft,
  )

  expect(result).toMatchObject({
    status: 'invalid',
    diagnostics: [expect.objectContaining({ code })],
    repairs: [],
  })
  expect(Object.isFrozen(result)).toBe(true)
}

describe('projectRepairedSubmittedAnswers', () => {
  test('projects stale submitted state in the fixed five-code order', () => {
    const result = projectRepairedSubmittedAnswers(repairModel, staleDraft())

    expect(result.repairs.map(({ code }) => code)).toEqual([
      'remove-unreachable-answer',
      'remove-disallowed-option',
      'remove-stale-under-min-answer',
      'remove-submitted-forced-answer',
      'canonicalize-answer-order',
    ])
    expect(result).toMatchObject({
      status: 'incomplete',
      submittedAnswers: {
        gate: ['off'],
        disallowed: ['keep'],
        ordered: ['first', 'second'],
      },
    })
    if (result.status === 'invalid') return
    expect(result.submittedAnswers).not.toEqual(result.flowState.canonicalAnswers)
    expect(result.flowState.canonicalAnswers).toMatchObject({
      forced: ['forced-value'],
    })
    expect(result.repairs).toEqual([
      {
        code: 'remove-unreachable-answer',
        questionId: 'unreachable',
        beforeOptionIds: ['branch-value'],
      },
      {
        code: 'remove-disallowed-option',
        questionId: 'disallowed',
        beforeOptionIds: ['keep', 'stale'],
        afterOptionIds: ['keep'],
      },
      {
        code: 'remove-stale-under-min-answer',
        questionId: 'under-min',
        beforeOptionIds: ['keep-a', 'stale-min'],
      },
      {
        code: 'remove-submitted-forced-answer',
        questionId: 'forced',
        beforeOptionIds: ['other-value'],
      },
      {
        code: 'canonicalize-answer-order',
        questionId: 'ordered',
        beforeOptionIds: ['second', 'first'],
        afterOptionIds: ['first', 'second'],
      },
    ])
  })

  test('removes a submitted forced entry even when it equals the forced value', () => {
    const result = projectRepairedSubmittedAnswers(repairModel, draft({
      gate: ['off'],
      forced: ['forced-value'],
    }))

    expect(result).toMatchObject({
      status: 'incomplete',
      submittedAnswers: { gate: ['off'] },
      repairs: [{
        code: 'remove-submitted-forced-answer',
        questionId: 'forced',
        beforeOptionIds: ['forced-value'],
      }],
    })
  })

  test.each([
    [{ future: ['unknown'] }, 'ANSWER_UNKNOWN_QUESTION'],
    [{ form: ['unknown'] }, 'ANSWER_UNKNOWN_OPTION'],
    [{ form: ['pork'] }, 'ANSWER_WRONG_OWNER'],
    [{ source: ['pork', 'pork'] }, 'ANSWER_DUPLICATE_OPTION'],
    [{ source: ['unsure', 'pork'] }, 'ANSWER_EXCLUSIVE_CONFLICT'],
    [{ form: [] }, 'ANSWER_SELECTION_BOUNDS'],
    [{ source: ['pork', 'chicken', 'duck', 'beef'] }, 'ANSWER_SELECTION_BOUNDS'],
    [{ form: 'soup' }, 'ANSWER_DRAFT_INVALID'],
  ])('does not repair intrinsically invalid answers: %j', (input, code) => {
    expectInvalidCode(input, code)
  })

  test('re-evaluates the projection and proves a submitted-state fixed point', () => {
    const first = projectRepairedSubmittedAnswers(repairModel, staleDraft())
    expect(first.status).not.toBe('invalid')
    if (first.status === 'invalid') return

    const second = projectRepairedSubmittedAnswers(
      repairModel,
      first.submittedAnswers,
    )
    expect(second).toMatchObject({
      status: first.status,
      submittedAnswers: first.submittedAnswers,
      repairs: [],
      flowState: first.flowState,
    })
    expect(first.flowState.repairs).toEqual([])
    expect(first.flowState.diagnostics).toEqual([])
    for (const forced of first.flowState.forcedAnswers) {
      expect(first.submittedAnswers).not.toHaveProperty(forced.questionId)
    }
  })

  test('is deterministic across object insertion order and does not mutate inputs', () => {
    const input = staleDraft()
    const reordered = draft({
      gate: ['off'],
      unreachable: ['branch-value'],
      disallowed: ['stale', 'keep'],
      'under-min': ['keep-a', 'stale-min'],
      forced: ['other-value'],
      ordered: ['second', 'first'],
    })
    const inputBefore = structuredClone(input)
    const modelBefore = structuredClone(repairModel)

    const first = projectRepairedSubmittedAnswers(repairModel, input)
    const second = projectRepairedSubmittedAnswers(repairModel, reordered)

    expect(first).toEqual(second)
    expect(input).toEqual(inputBefore)
    expect(repairModel).toEqual(modelBefore)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.repairs)).toBe(true)
    if (first.status === 'invalid') return
    expect(Object.isFrozen(first.submittedAnswers)).toBe(true)
    expect(Object.isFrozen(first.flowState)).toBe(true)
  })

  test('uses one stable model view for projection ordering and every evaluation', () => {
    const mutableModel = structuredClone(questionModel) as CompiledQuestionModel
    const changedQuestions = mutableModel.questions.map((question) => (
      question.id !== 'exclusions'
        ? question
        : {
            ...question,
            options: question.options.map((option) => ({
              ...option,
              order: option.id === 'pork'
                ? question.options.find(({ id }) => id === 'chicken')!.order
                : option.id === 'chicken'
                  ? question.options.find(({ id }) => id === 'pork')!.order
                  : option.order,
            })),
          }
    ))
    let questionReads = 0
    const changingModel = new Proxy(mutableModel, {
      get(target, key, receiver) {
        if (key !== 'questions') return Reflect.get(target, key, receiver)
        questionReads += 1
        return questionReads <= 2 ? target.questions : changedQuestions
      },
    })

    const result = projectRepairedSubmittedAnswers(changingModel, {
      exclusions: ['chicken', 'pork'],
    })

    expect(result.status).not.toBe('invalid')
    if (result.status === 'invalid') return
    expect(result.submittedAnswers.exclusions).toEqual(
      result.flowState.canonicalAnswers.exclusions,
    )
    expect(questionReads).toBe(0)
  })

  test('turns non-answer evaluator failures into bounded model-artifact errors', () => {
    expect(() => projectRepairedSubmittedAnswers(
      forcedCycleModel,
      draft({}),
    )).toThrow(PersistenceInvariantError)
    try {
      projectRepairedSubmittedAnswers(forcedCycleModel, draft({}))
    } catch (error) {
      expect(error).toMatchObject({
        invariantCode: 'PERSISTENCE_MODEL_ARTIFACT_INVALID',
      })
      expect((error as Error).message).not.toContain('canonical')
    }
  })

  test('contains trusted model reflection failure while creating the stable snapshot', () => {
    const privateMessage = 'private model descriptor trap'
    const trappedModel = new Proxy(repairModel, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'questions') throw new Error(privateMessage)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    let caught: unknown

    try {
      projectRepairedSubmittedAnswers(trappedModel, draft({ gate: ['off'] }))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(PersistenceInvariantError)
    expect(caught).toMatchObject({
      invariantCode: 'PERSISTENCE_MODEL_ARTIFACT_INVALID',
    })
    expect((caught as Error).message).not.toContain(privateMessage)
  })
})
