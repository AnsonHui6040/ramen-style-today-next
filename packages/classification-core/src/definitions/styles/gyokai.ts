import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const gyokaiStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/gyokai.ts',
  id: 'gyokai',
  family: 'soup',
  displayPriority: 8,
  messageIds: {
    label: 'style-gyokai-label',
    summary: 'style-gyokai-summary',
  },
  accent: '#4a6f79',
  supportedIntensityIds,
  supportedNoodleIds,
  baseRules: [
    {
      questionId: 'form',
      tiers: [
        { tier: 'exact', optionIds: ['soup'] },
        { tier: 'adjacent', optionIds: ['tsukemen'] },
      ],
    },
    {
      questionId: 'archetype',
      tiers: [
        { tier: 'exact', optionIds: ['chintan'] },
        { tier: 'adjacent', optionIds: ['gyokai-rich', 'paitan'] },
      ],
    },
    {
      questionId: 'tare',
      tiers: [
        { tier: 'exact', optionIds: ['shio', 'shoyu'] },
        { tier: 'adjacent', optionIds: ['none'] },
      ],
    },
    {
      questionId: 'source',
      tiers: [
        { tier: 'exact', optionIds: ['fish-seafood'] },
        { tier: 'adjacent', optionIds: ['shellfish', 'mixed'] },
        { tier: 'partial', optionIds: ['shrimp-crab', 'unsure'] },
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
        { tier: 'exact', optionIds: ['fish-kombu'] },
        { tier: 'adjacent', optionIds: ['no-preference'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'gyokai-soup-core',
      priority: 0,
      labelMessageId: 'adjustment-gyokai-soup-core-label',
      points: 4,
      minMatches: 4,
      conditions: [
        {
          priority: 0,
          questionId: 'source',
          optionIds: ['fish-seafood'],
        },
        {
          priority: 1,
          questionId: 'tare',
          optionIds: ['shio', 'shoyu'],
        },
        {
          priority: 2,
          questionId: 'signature',
          optionIds: ['fish-kombu'],
        },
        {
          priority: 3,
          questionId: 'body',
          optionIds: ['light', 'balanced', 'rich'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: ['fish-seafood'],
} as const satisfies StyleDefinition
