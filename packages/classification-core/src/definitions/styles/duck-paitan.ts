import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const duckPaitanStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/duck-paitan.ts',
  id: 'duck-paitan',
  family: 'soup',
  displayPriority: 7,
  messageIds: {
    label: 'style-duck-paitan-label',
    summary: 'style-duck-paitan-summary',
  },
  accent: '#6c3f34',
  supportedIntensityIds,
  supportedNoodleIds,
  baseRules: [
    {
      questionId: 'form',
      tiers: [
        { tier: 'exact', optionIds: ['soup'] },
      ],
    },
    {
      questionId: 'archetype',
      tiers: [
        { tier: 'exact', optionIds: ['paitan'] },
        { tier: 'adjacent', optionIds: ['chintan'] },
      ],
    },
    {
      questionId: 'tare',
      tiers: [
        { tier: 'exact', optionIds: ['shio', 'shoyu', 'none'] },
        { tier: 'adjacent', optionIds: ['miso'] },
      ],
    },
    {
      questionId: 'source',
      tiers: [
        { tier: 'exact', optionIds: ['duck'] },
        { tier: 'adjacent', optionIds: ['mixed'] },
        { tier: 'partial', optionIds: ['chicken', 'unsure'] },
      ],
    },
    {
      questionId: 'noodle',
      tiers: [
        { tier: 'exact', optionIds: ['medium-thin-straight', 'medium-thick-straight'] },
        { tier: 'adjacent', optionIds: ['thin-straight'] },
      ],
    },
    {
      questionId: 'signature',
      tiers: [
        { tier: 'exact', optionIds: ['yuzu-citrus', 'no-preference'] },
        { tier: 'adjacent', optionIds: ['fish-kombu'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'duck-paitan-core',
      priority: 0,
      labelMessageId: 'adjustment-duck-paitan-core-label',
      points: 4,
      minMatches: 4,
      conditions: [
        {
          priority: 0,
          questionId: 'form',
          optionIds: ['soup'],
        },
        {
          priority: 1,
          questionId: 'archetype',
          optionIds: ['paitan'],
        },
        {
          priority: 2,
          questionId: 'source',
          optionIds: ['duck'],
        },
        {
          priority: 3,
          questionId: 'body',
          optionIds: ['balanced', 'rich'],
        },
        {
          priority: 4,
          questionId: 'tare',
          optionIds: ['shio', 'shoyu', 'none'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: ['duck'],
} as const satisfies StyleDefinition
