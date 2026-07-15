import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const shoyuChintanStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/shoyu-chintan.ts',
  id: 'shoyu-chintan',
  family: 'soup',
  displayPriority: 0,
  messageIds: {
    label: 'style-shoyu-chintan-label',
    summary: 'style-shoyu-chintan-summary',
  },
  accent: '#a55c2f',
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
        { tier: 'exact', optionIds: ['chintan'] },
        { tier: 'adjacent', optionIds: ['paitan'] },
      ],
    },
    {
      questionId: 'tare',
      tiers: [
        { tier: 'exact', optionIds: ['shoyu'] },
        { tier: 'adjacent', optionIds: ['shio'] },
      ],
    },
    {
      questionId: 'source',
      tiers: [
        { tier: 'exact', optionIds: ['chicken', 'duck'] },
        { tier: 'adjacent', optionIds: ['fish-seafood', 'shellfish', 'mixed'] },
        { tier: 'partial', optionIds: ['unsure'] },
      ],
    },
    {
      questionId: 'noodle',
      tiers: [
        { tier: 'exact', optionIds: ['thin-straight', 'medium-thin-straight'] },
        { tier: 'adjacent', optionIds: ['medium-thick-straight'] },
      ],
    },
    {
      questionId: 'signature',
      tiers: [
        { tier: 'exact', optionIds: ['yuzu-citrus'] },
        { tier: 'adjacent', optionIds: ['fish-kombu', 'no-preference'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'classic-shoyu',
      priority: 0,
      labelMessageId: 'adjustment-classic-shoyu-label',
      points: 3,
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
          optionIds: ['chintan'],
        },
        {
          priority: 2,
          questionId: 'tare',
          optionIds: ['shoyu'],
        },
        {
          priority: 3,
          questionId: 'body',
          optionIds: ['light', 'balanced'],
        },
        {
          priority: 4,
          questionId: 'noodle',
          optionIds: ['thin-straight', 'medium-thin-straight'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: [],
} as const satisfies StyleDefinition
