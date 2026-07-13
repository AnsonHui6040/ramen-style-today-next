import type { CompiledQuestionModel } from '../contracts/question-model.js'

export const chintanDraft = {
  form: ['soup'],
  archetype: ['chintan'],
} as const

export const misoRichDraft = {
  form: ['tsukemen'],
  archetype: ['miso-rich'],
} as const

export const completeSoupDraft = {
  form: ['soup'],
  archetype: ['chintan'],
  tare: ['shoyu'],
  source: ['pork'],
  body: ['balanced'],
  noodle: ['medium-thin-straight'],
  signature: ['no-preference'],
  exclusions: ['none'],
} as const

export const completeDryDraft = {
  form: ['dry'],
  archetype: ['aburasoba'],
  tare: ['shoyu'],
  source: ['pork'],
  body: ['balanced'],
  noodle: ['medium-thick-straight'],
  signature: ['no-preference'],
  exclusions: ['none'],
} as const

const metadata = {
  schemaVersion: '1',
  compilerVersion: 'test',
  modelVersion: 'test',
  sourceHash: 'test',
  semanticHash: 'test',
} as const

export const genericConditionModel = {
  metadata,
  questions: [
    {
      id: 'gate',
      order: 10,
      messageIds: { title: 'gate-title', description: 'gate-description' },
      selection: { type: 'single', min: 1, max: 1, overrides: [] },
      options: [
        {
          id: 'on',
          order: 1,
          messageIds: { label: 'on-label' },
          exclusive: false,
        },
        {
          id: 'off',
          order: 2,
          messageIds: { label: 'off-label' },
          exclusive: false,
        },
      ],
      allowedOptions: [],
      initialUiOptionIds: [],
      pendingSelection: { emptyBehavior: { type: 'allow-empty' } },
      validSelectionKeys: ['["on"]', '["off"]'],
    },
    {
      id: 'branch',
      order: 20,
      messageIds: { title: 'branch-title', description: 'branch-description' },
      selection: {
        type: 'multiple',
        min: 1,
        max: 2,
        overrides: [{
          when: {
            type: 'all',
            conditions: [
              { type: 'answered', questionId: 'gate' },
              { type: 'answer-includes', questionId: 'gate', optionId: 'on' },
            ],
          },
          min: 1,
          max: 1,
        }],
      },
      availableWhen: {
        type: 'any',
        conditions: [
          { type: 'answer-includes', questionId: 'gate', optionId: 'on' },
          {
            type: 'not',
            condition: { type: 'answered', questionId: 'gate' },
          },
        ],
      },
      options: [
        {
          id: 'alpha',
          order: 1,
          messageIds: { label: 'alpha-label' },
          exclusive: false,
        },
        {
          id: 'beta',
          order: 2,
          messageIds: { label: 'beta-label' },
          availableWhen: {
            type: 'not',
            condition: { type: 'answer-includes', questionId: 'gate', optionId: 'on' },
          },
          exclusive: false,
        },
      ],
      allowedOptions: [{
        when: {
          type: 'all',
          conditions: [
            { type: 'answered', questionId: 'gate' },
            { type: 'answer-includes', questionId: 'gate', optionId: 'on' },
          ],
        },
        selection: { type: 'only', optionIds: ['alpha'] },
      }],
      autoAnswer: {
        type: 'single-allowed-option',
        when: { type: 'answer-includes', questionId: 'gate', optionId: 'on' },
      },
      initialUiOptionIds: [],
      pendingSelection: { emptyBehavior: { type: 'allow-empty' } },
      validSelectionKeys: ['["alpha"]', '["beta"]', '["alpha","beta"]'],
    },
  ],
  semanticDependencies: { gate: [], branch: ['gate'] },
  dependentClosures: { gate: ['branch'], branch: [] },
  topologicalOrder: ['gate', 'branch'],
  forcedIterationUpperBound: 6,
} as const satisfies CompiledQuestionModel

export const forcedCycleModel = {
  metadata,
  questions: [
    {
      id: 'left',
      order: 1,
      messageIds: { title: 'left-title', description: 'left-description' },
      selection: { type: 'single', min: 1, max: 1, overrides: [] },
      options: [
        { id: 'a', order: 1, messageIds: { label: 'a-label' }, exclusive: false },
        { id: 'b', order: 2, messageIds: { label: 'b-label' }, exclusive: false },
      ],
      allowedOptions: [
        {
          when: { type: 'answer-includes', questionId: 'right', optionId: 'x' },
          selection: { type: 'only', optionIds: ['a'] },
        },
        {
          when: {
            type: 'not',
            condition: { type: 'answer-includes', questionId: 'right', optionId: 'x' },
          },
          selection: { type: 'only', optionIds: ['b'] },
        },
      ],
      autoAnswer: { type: 'single-allowed-option' },
      initialUiOptionIds: [],
      pendingSelection: { emptyBehavior: { type: 'allow-empty' } },
      validSelectionKeys: ['["a"]', '["b"]'],
    },
    {
      id: 'right',
      order: 2,
      messageIds: { title: 'right-title', description: 'right-description' },
      selection: { type: 'single', min: 1, max: 1, overrides: [] },
      options: [
        { id: 'x', order: 1, messageIds: { label: 'x-label' }, exclusive: false },
        { id: 'y', order: 2, messageIds: { label: 'y-label' }, exclusive: false },
      ],
      allowedOptions: [
        {
          when: { type: 'answer-includes', questionId: 'left', optionId: 'a' },
          selection: { type: 'only', optionIds: ['y'] },
        },
        {
          when: {
            type: 'not',
            condition: { type: 'answer-includes', questionId: 'left', optionId: 'a' },
          },
          selection: { type: 'only', optionIds: ['x'] },
        },
      ],
      autoAnswer: { type: 'single-allowed-option' },
      initialUiOptionIds: [],
      pendingSelection: { emptyBehavior: { type: 'allow-empty' } },
      validSelectionKeys: ['["x"]', '["y"]'],
    },
  ],
  semanticDependencies: { left: ['right'], right: ['left'] },
  dependentClosures: { left: ['right'], right: ['left'] },
  topologicalOrder: ['left', 'right'],
  forcedIterationUpperBound: 8,
} as const satisfies CompiledQuestionModel
