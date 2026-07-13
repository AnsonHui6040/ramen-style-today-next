import type {
  CompiledQuestionModel,
  QuestionDefinitionSource,
  SerializableCondition,
} from '../../contracts/question-model.js'

const alwaysFalse = { type: 'any', conditions: [] } as const satisfies SerializableCondition

function question(
  id: string,
  order: number,
  optionIds: readonly string[],
  overrides: Partial<QuestionDefinitionSource> = {},
): QuestionDefinitionSource {
  return {
    id,
    order,
    messageIds: {
      title: `question-${id}-title`,
      description: `question-${id}-description`,
    },
    selection: { type: 'single', min: 1, max: 1 },
    options: optionIds.map((optionId, optionOrder) => ({
      id: optionId,
      order: optionOrder,
      messageIds: { label: `option-${id}-${optionId}-label` },
    })),
    ...overrides,
  }
}

export const twoOutputDefinition = [
  question('branch', 0, ['left', 'right']),
  question('target', 1, ['a', 'b'], {
    availableWhen: { type: 'answered', questionId: 'branch' },
    allowedOptions: [
      {
        when: { type: 'answer-includes', questionId: 'branch', optionId: 'left' },
        selection: { type: 'only', optionIds: ['a'] },
      },
      {
        when: { type: 'answer-includes', questionId: 'branch', optionId: 'right' },
        selection: { type: 'only', optionIds: ['b'] },
      },
    ],
  }),
] as const satisfies readonly QuestionDefinitionSource[]

export const emptyBranchDefinition = [
  question('branch', 0, ['empty', 'live']),
  question('target', 1, ['value'], {
    availableWhen: { type: 'answered', questionId: 'branch' },
    allowedOptions: [
      {
        when: { type: 'answer-includes', questionId: 'branch', optionId: 'empty' },
        selection: { type: 'only', optionIds: [] },
      },
      {
        when: { type: 'answer-includes', questionId: 'branch', optionId: 'live' },
        selection: { type: 'all' },
      },
    ],
  }),
] as const satisfies readonly QuestionDefinitionSource[]

export const deadQuestionDefinition = [
  question('live', 0, ['value']),
  question('dead-question', 1, ['dead-value'], { availableWhen: alwaysFalse }),
] as const satisfies readonly QuestionDefinitionSource[]

export const deadOptionDefinition = [
  question('options', 0, ['live', 'dead'], {
    options: [
      {
        id: 'live',
        order: 0,
        messageIds: { label: 'option-options-live-label' },
      },
      {
        id: 'dead',
        order: 1,
        messageIds: { label: 'option-options-dead-label' },
        availableWhen: alwaysFalse,
      },
    ],
  }),
] as const satisfies readonly QuestionDefinitionSource[]

export const namedCombinationDefinition = [
  question('choices', 0, ['a', 'b', 'c'], {
    selection: { type: 'multiple', min: 1, max: 2 },
  }),
  question('combo-target', 1, ['value'], {
    availableWhen: {
      type: 'all',
      conditions: [
        { type: 'answer-includes', questionId: 'choices', optionId: 'a' },
        { type: 'answer-includes', questionId: 'choices', optionId: 'b' },
      ],
    },
    options: [{
      id: 'value',
      order: 0,
      messageIds: { label: 'option-combo-target-value-label' },
      availableWhen: {
        type: 'any',
        conditions: [
          { type: 'answer-includes', questionId: 'choices', optionId: 'a' },
          { type: 'answer-includes', questionId: 'choices', optionId: 'b' },
          { type: 'answer-includes', questionId: 'choices', optionId: 'c' },
        ],
      },
    }],
  }),
] as const satisfies readonly QuestionDefinitionSource[]

export const forcedToInteractiveDefinition = [
  question('gate', 0, ['on']),
  question('forced-target', 1, ['forced', 'manual'], {
    allowedOptions: [
      {
        when: {
          type: 'not',
          condition: { type: 'answered', questionId: 'gate' },
        },
        selection: { type: 'only', optionIds: ['forced'] },
      },
      {
        when: { type: 'answered', questionId: 'gate' },
        selection: { type: 'all' },
      },
    ],
    autoAnswer: { type: 'single-allowed-option' },
  }),
] as const satisfies readonly QuestionDefinitionSource[]

export const transientUnsatisfiableDefinition = [
  question('transient', 0, ['exclusive', 'ordinary'], {
    availableWhen: {
      type: 'not',
      condition: { type: 'answered', questionId: 'trigger' },
    },
    selection: {
      type: 'multiple',
      min: 1,
      max: 2,
      overrides: [{
        when: {
          type: 'not',
          condition: { type: 'answered', questionId: 'trigger' },
        },
        min: 2,
        max: 2,
      }],
    },
    options: [
      {
        id: 'exclusive',
        order: 0,
        messageIds: { label: 'option-transient-exclusive-label' },
        exclusive: true,
      },
      {
        id: 'ordinary',
        order: 1,
        messageIds: { label: 'option-transient-ordinary-label' },
      },
    ],
  }),
  question('trigger', 1, ['on']),
] as const satisfies readonly QuestionDefinitionSource[]

export const maximumRepresentativeDefinition = [
  question('branch', 0, ['restricted', 'open']),
  question('maximum-target', 1, ['a', 'b', 'c'], {
    availableWhen: { type: 'answered', questionId: 'branch' },
    selection: { type: 'multiple', min: 1, max: 3 },
    allowedOptions: [
      {
        when: { type: 'answer-includes', questionId: 'branch', optionId: 'restricted' },
        selection: { type: 'only', optionIds: ['a'] },
      },
      {
        when: { type: 'answer-includes', questionId: 'branch', optionId: 'open' },
        selection: { type: 'all' },
      },
    ],
  }),
] as const satisfies readonly QuestionDefinitionSource[]

export const impossibleCompletionDefinition = [
  question('trigger', 0, ['value']),
  question('impossible', 1, ['exclusive', 'ordinary'], {
    availableWhen: { type: 'answered', questionId: 'trigger' },
    selection: {
      type: 'multiple',
      min: 1,
      max: 1,
      overrides: [{
        when: { type: 'answered', questionId: 'trigger' },
        min: 2,
        max: 2,
      }],
    },
    options: [
      {
        id: 'exclusive',
        order: 0,
        messageIds: { label: 'option-impossible-exclusive-label' },
        exclusive: true,
      },
      {
        id: 'ordinary',
        order: 1,
        messageIds: { label: 'option-impossible-ordinary-label' },
      },
    ],
  }),
] as const satisfies readonly QuestionDefinitionSource[]

export const forcedCycleCompiledModel = {
  metadata: {
    schemaVersion: 'damaged-fixture',
    compilerVersion: 'damaged-fixture',
    modelVersion: 'damaged-fixture',
    sourceHash: 'damaged-fixture',
    semanticHash: 'damaged-fixture',
  },
  questions: [{
    id: 'toggle',
    order: 0,
    messageIds: {
      title: 'question-toggle-title',
      description: 'question-toggle-description',
    },
    selection: { type: 'single', min: 1, max: 1, overrides: [] },
    options: [
      {
        id: 'a',
        order: 0,
        messageIds: { label: 'option-toggle-a-label' },
        exclusive: false,
      },
      {
        id: 'b',
        order: 1,
        messageIds: { label: 'option-toggle-b-label' },
        exclusive: false,
      },
    ],
    allowedOptions: [
      {
        when: {
          type: 'not',
          condition: { type: 'answered', questionId: 'toggle' },
        },
        selection: { type: 'only', optionIds: ['a'] },
      },
      {
        when: { type: 'answer-includes', questionId: 'toggle', optionId: 'a' },
        selection: { type: 'only', optionIds: ['b'] },
      },
      {
        when: { type: 'answer-includes', questionId: 'toggle', optionId: 'b' },
        selection: { type: 'only', optionIds: ['a'] },
      },
    ],
    autoAnswer: { type: 'single-allowed-option' },
    initialUiOptionIds: [],
    pendingSelection: { emptyBehavior: { type: 'allow-empty' } },
    validSelectionKeys: ['["a"]', '["b"]'],
  }],
  semanticDependencies: { toggle: ['toggle'] },
  dependentClosures: { toggle: ['toggle'] },
  topologicalOrder: ['toggle'],
  forcedIterationUpperBound: 4,
} as const satisfies CompiledQuestionModel
