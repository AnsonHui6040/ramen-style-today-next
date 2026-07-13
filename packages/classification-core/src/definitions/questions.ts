import type { QuestionDefinitionSource } from '../contracts/question-model.js'

export const productionQuestionIds = [
  'form',
  'archetype',
  'tare',
  'source',
  'body',
  'noodle',
  'signature',
  'exclusions',
] as const

export const archetypeIds = [
  'chintan',
  'paitan',
  'konbusui-light',
  'gyokai-rich',
  'miso-rich',
  'tsukemen-other',
  'aburasoba',
  'taiwan-mazesoba',
  'soupless-tantan',
  'dry-other',
] as const

export const questionDefinitions = [
  {
    id: 'form',
    order: 0,
    messageIds: {
      title: 'question-form-title',
      description: 'question-form-description',
    },
    selection: { type: 'single', min: 1, max: 1 },
    options: [
      {
        id: 'soup',
        order: 0,
        messageIds: {
          label: 'option-form-soup-label',
          description: 'option-form-soup-description',
        },
      },
      {
        id: 'tsukemen',
        order: 1,
        messageIds: {
          label: 'option-form-tsukemen-label',
          description: 'option-form-tsukemen-description',
        },
      },
      {
        id: 'dry',
        order: 2,
        messageIds: {
          label: 'option-form-dry-label',
          description: 'option-form-dry-description',
        },
      },
    ],
    weight: 16,
  },
  {
    id: 'archetype',
    order: 1,
    messageIds: {
      title: 'question-archetype-title',
      description: 'question-archetype-description',
    },
    selection: { type: 'single', min: 1, max: 1 },
    availableWhen: { type: 'answered', questionId: 'form' },
    options: [
      {
        id: 'chintan',
        order: 0,
        messageIds: {
          label: 'option-archetype-chintan-label',
          description: 'option-archetype-chintan-description',
        },
      },
      {
        id: 'paitan',
        order: 1,
        messageIds: {
          label: 'option-archetype-paitan-label',
          description: 'option-archetype-paitan-description',
        },
      },
      {
        id: 'konbusui-light',
        order: 2,
        messageIds: {
          label: 'option-archetype-konbusui-light-label',
          description: 'option-archetype-konbusui-light-description',
        },
      },
      {
        id: 'gyokai-rich',
        order: 3,
        messageIds: {
          label: 'option-archetype-gyokai-rich-label',
          description: 'option-archetype-gyokai-rich-description',
        },
      },
      {
        id: 'miso-rich',
        order: 4,
        messageIds: {
          label: 'option-archetype-miso-rich-label',
          description: 'option-archetype-miso-rich-description',
        },
      },
      {
        id: 'tsukemen-other',
        order: 5,
        messageIds: {
          label: 'option-archetype-tsukemen-other-label',
          description: 'option-archetype-tsukemen-other-description',
        },
      },
      {
        id: 'aburasoba',
        order: 6,
        messageIds: {
          label: 'option-archetype-aburasoba-label',
          description: 'option-archetype-aburasoba-description',
        },
      },
      {
        id: 'taiwan-mazesoba',
        order: 7,
        messageIds: {
          label: 'option-archetype-taiwan-mazesoba-label',
          description: 'option-archetype-taiwan-mazesoba-description',
        },
      },
      {
        id: 'soupless-tantan',
        order: 8,
        messageIds: {
          label: 'option-archetype-soupless-tantan-label',
          description: 'option-archetype-soupless-tantan-description',
        },
      },
      {
        id: 'dry-other',
        order: 9,
        messageIds: {
          label: 'option-archetype-dry-other-label',
          description: 'option-archetype-dry-other-description',
        },
      },
    ],
    allowedOptions: [
      {
        when: { type: 'answer-includes', questionId: 'form', optionId: 'soup' },
        selection: { type: 'only', optionIds: ['chintan', 'paitan'] },
      },
      {
        when: { type: 'answer-includes', questionId: 'form', optionId: 'tsukemen' },
        selection: {
          type: 'only',
          optionIds: ['konbusui-light', 'gyokai-rich', 'miso-rich', 'tsukemen-other'],
        },
      },
      {
        when: { type: 'answer-includes', questionId: 'form', optionId: 'dry' },
        selection: {
          type: 'only',
          optionIds: ['aburasoba', 'taiwan-mazesoba', 'soupless-tantan', 'dry-other'],
        },
      },
    ],
    weight: 16,
  },
  {
    id: 'tare',
    order: 2,
    messageIds: {
      title: 'question-tare-title',
      description: 'question-tare-description',
    },
    selection: { type: 'single', min: 1, max: 1 },
    availableWhen: { type: 'answered', questionId: 'archetype' },
    options: [
      {
        id: 'shoyu',
        order: 0,
        messageIds: {
          label: 'option-tare-shoyu-label',
          description: 'option-tare-shoyu-description',
        },
      },
      {
        id: 'shio',
        order: 1,
        messageIds: {
          label: 'option-tare-shio-label',
          description: 'option-tare-shio-description',
        },
      },
      {
        id: 'miso',
        order: 2,
        messageIds: {
          label: 'option-tare-miso-label',
          description: 'option-tare-miso-description',
        },
      },
      {
        id: 'spicy-sesame',
        order: 3,
        messageIds: {
          label: 'option-tare-spicy-sesame-label',
          description: 'option-tare-spicy-sesame-description',
        },
      },
      {
        id: 'none',
        order: 4,
        messageIds: {
          label: 'option-tare-none-label',
          description: 'option-tare-none-description',
        },
      },
    ],
    allowedOptions: [
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'chintan' },
        selection: { type: 'all' },
      },
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'paitan' },
        selection: { type: 'all' },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'konbusui-light',
        },
        selection: { type: 'only', optionIds: ['shio', 'shoyu'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'gyokai-rich',
        },
        selection: { type: 'only', optionIds: ['shoyu', 'shio', 'miso'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'miso-rich',
        },
        selection: { type: 'only', optionIds: ['miso'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'tsukemen-other',
        },
        selection: { type: 'all' },
      },
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'aburasoba' },
        selection: { type: 'only', optionIds: ['shoyu', 'none'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'taiwan-mazesoba',
        },
        selection: { type: 'only', optionIds: ['spicy-sesame', 'shoyu', 'none'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'soupless-tantan',
        },
        selection: { type: 'only', optionIds: ['spicy-sesame'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'dry-other',
        },
        selection: { type: 'all' },
      },
    ],
    autoAnswer: { type: 'single-allowed-option' },
    weight: 15,
  },
  {
    id: 'source',
    order: 3,
    messageIds: {
      title: 'question-source-title',
      description: 'question-source-description',
    },
    selection: { type: 'multiple', min: 1, max: 2 },
    availableWhen: { type: 'answered', questionId: 'archetype' },
    options: [
      {
        id: 'pork',
        order: 0,
        messageIds: {
          label: 'option-source-pork-label',
          description: 'option-source-pork-description',
        },
      },
      {
        id: 'chicken',
        order: 1,
        messageIds: {
          label: 'option-source-chicken-label',
          description: 'option-source-chicken-description',
        },
      },
      {
        id: 'duck',
        order: 2,
        messageIds: {
          label: 'option-source-duck-label',
          description: 'option-source-duck-description',
        },
      },
      {
        id: 'beef',
        order: 3,
        messageIds: {
          label: 'option-source-beef-label',
          description: 'option-source-beef-description',
        },
      },
      {
        id: 'fish-seafood',
        order: 4,
        messageIds: {
          label: 'option-source-fish-seafood-label',
          description: 'option-source-fish-seafood-description',
        },
      },
      {
        id: 'shellfish',
        order: 5,
        messageIds: {
          label: 'option-source-shellfish-label',
          description: 'option-source-shellfish-description',
        },
      },
      {
        id: 'shrimp-crab',
        order: 6,
        messageIds: {
          label: 'option-source-shrimp-crab-label',
          description: 'option-source-shrimp-crab-description',
        },
      },
      {
        id: 'vegetable',
        order: 7,
        messageIds: {
          label: 'option-source-vegetable-label',
          description: 'option-source-vegetable-description',
        },
      },
      {
        id: 'mixed',
        order: 8,
        messageIds: {
          label: 'option-source-mixed-label',
          description: 'option-source-mixed-description',
        },
      },
      {
        id: 'unsure',
        order: 9,
        messageIds: {
          label: 'option-source-unsure-label',
          description: 'option-source-unsure-description',
        },
        exclusive: true,
      },
    ],
    allowedOptions: [
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'chintan' },
        selection: { type: 'all' },
      },
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'paitan' },
        selection: { type: 'all' },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'konbusui-light',
        },
        selection: {
          type: 'only',
          optionIds: ['fish-seafood', 'shellfish', 'vegetable', 'mixed', 'unsure'],
        },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'gyokai-rich',
        },
        selection: {
          type: 'only',
          optionIds: ['fish-seafood', 'shellfish', 'mixed', 'unsure'],
        },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'miso-rich',
        },
        selection: {
          type: 'only',
          optionIds: ['pork', 'chicken', 'fish-seafood', 'vegetable', 'mixed', 'unsure'],
        },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'tsukemen-other',
        },
        selection: { type: 'all' },
      },
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'aburasoba' },
        selection: { type: 'only', optionIds: ['pork', 'mixed', 'unsure'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'taiwan-mazesoba',
        },
        selection: { type: 'only', optionIds: ['pork', 'mixed', 'unsure'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'soupless-tantan',
        },
        selection: { type: 'only', optionIds: ['pork', 'vegetable', 'mixed', 'unsure'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'dry-other',
        },
        selection: { type: 'all' },
      },
    ],
    autoAnswer: { type: 'single-allowed-option' },
    weight: 18,
  },
  {
    id: 'body',
    order: 4,
    messageIds: {
      title: 'question-body-title',
      description: 'question-body-description',
    },
    selection: { type: 'single', min: 1, max: 1 },
    availableWhen: { type: 'answered', questionId: 'archetype' },
    options: [
      {
        id: 'light',
        order: 0,
        messageIds: {
          label: 'option-body-light-label',
          description: 'option-body-light-description',
        },
      },
      {
        id: 'balanced',
        order: 1,
        messageIds: {
          label: 'option-body-balanced-label',
          description: 'option-body-balanced-description',
        },
      },
      {
        id: 'rich',
        order: 2,
        messageIds: {
          label: 'option-body-rich-label',
          description: 'option-body-rich-description',
        },
      },
      {
        id: 'backfat-heavy',
        order: 3,
        messageIds: {
          label: 'option-body-backfat-heavy-label',
          description: 'option-body-backfat-heavy-description',
        },
      },
      {
        id: 'ultra-heavy',
        order: 4,
        messageIds: {
          label: 'option-body-ultra-heavy-label',
          description: 'option-body-ultra-heavy-description',
        },
      },
    ],
    allowedOptions: [
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'chintan' },
        selection: { type: 'all' },
      },
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'paitan' },
        selection: { type: 'all' },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'konbusui-light',
        },
        selection: { type: 'only', optionIds: ['light', 'balanced'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'gyokai-rich',
        },
        selection: { type: 'only', optionIds: ['balanced', 'rich', 'ultra-heavy'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'miso-rich',
        },
        selection: { type: 'only', optionIds: ['balanced', 'rich', 'ultra-heavy'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'tsukemen-other',
        },
        selection: { type: 'all' },
      },
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'aburasoba' },
        selection: { type: 'only', optionIds: ['light', 'balanced', 'rich'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'taiwan-mazesoba',
        },
        selection: { type: 'only', optionIds: ['balanced', 'rich', 'ultra-heavy'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'soupless-tantan',
        },
        selection: { type: 'only', optionIds: ['balanced', 'rich', 'ultra-heavy'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'dry-other',
        },
        selection: { type: 'all' },
      },
    ],
    autoAnswer: { type: 'single-allowed-option' },
    weight: 14,
  },
  {
    id: 'noodle',
    order: 5,
    messageIds: {
      title: 'question-noodle-title',
      description: 'question-noodle-description',
    },
    selection: { type: 'single', min: 1, max: 1 },
    availableWhen: { type: 'answered', questionId: 'archetype' },
    options: [
      {
        id: 'thin-straight',
        order: 0,
        messageIds: {
          label: 'option-noodle-thin-straight-label',
          description: 'option-noodle-thin-straight-description',
        },
      },
      {
        id: 'medium-thin-straight',
        order: 1,
        messageIds: {
          label: 'option-noodle-medium-thin-straight-label',
          description: 'option-noodle-medium-thin-straight-description',
        },
      },
      {
        id: 'medium-thick-straight',
        order: 2,
        messageIds: {
          label: 'option-noodle-medium-thick-straight-label',
          description: 'option-noodle-medium-thick-straight-description',
        },
      },
      {
        id: 'medium-thick-wavy',
        order: 3,
        messageIds: {
          label: 'option-noodle-medium-thick-wavy-label',
          description: 'option-noodle-medium-thick-wavy-description',
        },
      },
      {
        id: 'extra-thick',
        order: 4,
        messageIds: {
          label: 'option-noodle-extra-thick-label',
          description: 'option-noodle-extra-thick-description',
        },
      },
    ],
    allowedOptions: [
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'chintan' },
        selection: { type: 'all' },
      },
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'paitan' },
        selection: { type: 'all' },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'konbusui-light',
        },
        selection: {
          type: 'only',
          optionIds: ['medium-thin-straight', 'medium-thick-straight'],
        },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'gyokai-rich',
        },
        selection: {
          type: 'only',
          optionIds: ['medium-thick-straight', 'medium-thick-wavy', 'extra-thick'],
        },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'miso-rich',
        },
        selection: {
          type: 'only',
          optionIds: ['medium-thick-straight', 'medium-thick-wavy', 'extra-thick'],
        },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'tsukemen-other',
        },
        selection: { type: 'all' },
      },
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'aburasoba' },
        selection: {
          type: 'only',
          optionIds: ['medium-thin-straight', 'medium-thick-straight', 'extra-thick'],
        },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'taiwan-mazesoba',
        },
        selection: { type: 'only', optionIds: ['medium-thick-straight', 'extra-thick'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'soupless-tantan',
        },
        selection: { type: 'only', optionIds: ['medium-thick-straight', 'extra-thick'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'dry-other',
        },
        selection: { type: 'all' },
      },
    ],
    autoAnswer: { type: 'single-allowed-option' },
    weight: 11,
  },
  {
    id: 'signature',
    order: 6,
    messageIds: {
      title: 'question-signature-title',
      description: 'question-signature-description',
    },
    selection: { type: 'multiple', min: 1, max: 2 },
    availableWhen: { type: 'answered', questionId: 'archetype' },
    options: [
      {
        id: 'nori-spinach',
        order: 0,
        messageIds: {
          label: 'option-signature-nori-spinach-label',
          description: 'option-signature-nori-spinach-description',
        },
      },
      {
        id: 'corn-butter',
        order: 1,
        messageIds: {
          label: 'option-signature-corn-butter-label',
          description: 'option-signature-corn-butter-description',
        },
      },
      {
        id: 'bean-sprout-garlic-backfat',
        order: 2,
        messageIds: {
          label: 'option-signature-bean-sprout-garlic-backfat-label',
          description: 'option-signature-bean-sprout-garlic-backfat-description',
        },
      },
      {
        id: 'fish-kombu',
        order: 3,
        messageIds: {
          label: 'option-signature-fish-kombu-label',
          description: 'option-signature-fish-kombu-description',
        },
      },
      {
        id: 'yuzu-citrus',
        order: 4,
        messageIds: {
          label: 'option-signature-yuzu-citrus-label',
          description: 'option-signature-yuzu-citrus-description',
        },
      },
      {
        id: 'no-preference',
        order: 5,
        messageIds: {
          label: 'option-signature-no-preference-label',
          description: 'option-signature-no-preference-description',
        },
        exclusive: true,
      },
    ],
    allowedOptions: [
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'chintan' },
        selection: { type: 'all' },
      },
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'paitan' },
        selection: { type: 'all' },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'konbusui-light',
        },
        selection: { type: 'only', optionIds: ['fish-kombu', 'yuzu-citrus', 'no-preference'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'gyokai-rich',
        },
        selection: { type: 'only', optionIds: ['fish-kombu', 'no-preference'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'miso-rich',
        },
        selection: { type: 'only', optionIds: ['corn-butter', 'fish-kombu', 'no-preference'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'tsukemen-other',
        },
        selection: { type: 'all' },
      },
      {
        when: { type: 'answer-includes', questionId: 'archetype', optionId: 'aburasoba' },
        selection: {
          type: 'only',
          optionIds: ['no-preference', 'bean-sprout-garlic-backfat', 'fish-kombu'],
        },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'taiwan-mazesoba',
        },
        selection: {
          type: 'only',
          optionIds: ['fish-kombu', 'bean-sprout-garlic-backfat', 'no-preference'],
        },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'soupless-tantan',
        },
        selection: { type: 'only', optionIds: ['no-preference', 'bean-sprout-garlic-backfat'] },
      },
      {
        when: {
          type: 'answer-includes',
          questionId: 'archetype',
          optionId: 'dry-other',
        },
        selection: { type: 'all' },
      },
    ],
    autoAnswer: { type: 'single-allowed-option' },
    weight: 10,
  },
  {
    id: 'exclusions',
    order: 7,
    messageIds: {
      title: 'question-exclusions-title',
      description: 'question-exclusions-description',
    },
    selection: { type: 'multiple', min: 1, max: 8 },
    options: [
      {
        id: 'pork',
        order: 0,
        messageIds: {
          label: 'option-exclusions-pork-label',
          description: 'option-exclusions-pork-description',
        },
      },
      {
        id: 'chicken',
        order: 1,
        messageIds: {
          label: 'option-exclusions-chicken-label',
          description: 'option-exclusions-chicken-description',
        },
      },
      {
        id: 'duck',
        order: 2,
        messageIds: {
          label: 'option-exclusions-duck-label',
          description: 'option-exclusions-duck-description',
        },
      },
      {
        id: 'beef',
        order: 3,
        messageIds: {
          label: 'option-exclusions-beef-label',
          description: 'option-exclusions-beef-description',
        },
      },
      {
        id: 'fish-seafood',
        order: 4,
        messageIds: {
          label: 'option-exclusions-fish-seafood-label',
          description: 'option-exclusions-fish-seafood-description',
        },
      },
      {
        id: 'shellfish',
        order: 5,
        messageIds: {
          label: 'option-exclusions-shellfish-label',
          description: 'option-exclusions-shellfish-description',
        },
      },
      {
        id: 'shrimp-crab',
        order: 6,
        messageIds: {
          label: 'option-exclusions-shrimp-crab-label',
          description: 'option-exclusions-shrimp-crab-description',
        },
      },
      {
        id: 'dairy',
        order: 7,
        messageIds: {
          label: 'option-exclusions-dairy-label',
          description: 'option-exclusions-dairy-description',
        },
      },
      {
        id: 'none',
        order: 8,
        messageIds: {
          label: 'option-exclusions-none-label',
          description: 'option-exclusions-none-description',
        },
        exclusive: true,
      },
    ],
    initialUiOptionIds: ['none'],
    pendingSelection: {
      emptyBehavior: { type: 'restore-initial-ui-options' },
    },
    weight: 0,
  },
] as const satisfies readonly QuestionDefinitionSource[]
