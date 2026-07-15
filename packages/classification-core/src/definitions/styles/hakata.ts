import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const hakataStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/hakata.ts',
  id: 'hakata',
  family: 'soup',
  displayPriority: 12,
  messageIds: {
    label: 'style-hakata-label',
    summary: 'style-hakata-summary',
  },
  accent: '#f1994f',
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
        { tier: 'adjacent', optionIds: ['medium-thin-straight'] },
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
      id: 'hakata-canonical',
      priority: 0,
      labelMessageId: 'adjustment-hakata-canonical-label',
      points: 5,
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
          questionId: 'noodle',
          optionIds: ['thin-straight'],
        },
        {
          priority: 4,
          questionId: 'tare',
          optionIds: ['none', 'shio'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: ['pork'],
} as const satisfies StyleDefinition
