import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const tonkotsuStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/tonkotsu.ts',
  id: 'tonkotsu',
  family: 'soup',
  displayPriority: 3,
  messageIds: {
    label: 'style-tonkotsu-label',
    summary: 'style-tonkotsu-summary',
  },
  accent: '#d9783b',
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
        { tier: 'exact', optionIds: ['none'] },
        { tier: 'adjacent', optionIds: ['shio', 'shoyu'] },
      ],
    },
    {
      questionId: 'source',
      tiers: [
        { tier: 'exact', optionIds: ['pork'] },
        { tier: 'adjacent', optionIds: ['mixed'] },
        { tier: 'partial', optionIds: ['unsure'] },
      ],
    },
    {
      questionId: 'noodle',
      tiers: [
        { tier: 'exact', optionIds: ['thin-straight'] },
        { tier: 'adjacent', optionIds: ['medium-thin-straight', 'medium-thick-straight'] },
      ],
    },
    {
      questionId: 'signature',
      tiers: [
        { tier: 'exact', optionIds: ['no-preference'] },
        { tier: 'adjacent', optionIds: ['nori-spinach'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'tonkotsu-core',
      priority: 0,
      labelMessageId: 'adjustment-tonkotsu-core-label',
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
          optionIds: ['pork'],
        },
        {
          priority: 3,
          questionId: 'body',
          optionIds: ['rich'],
        },
        {
          priority: 4,
          questionId: 'noodle',
          optionIds: ['thin-straight'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: ['pork'],
} as const satisfies StyleDefinition
