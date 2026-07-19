import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const gyokaiTsukemenStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/gyokai-tsukemen.ts',
  id: 'gyokai-tsukemen',
  family: 'tsukemen',
  displayPriority: 15,
  messageIds: {
    label: 'style-gyokai-tsukemen-label',
    summary: 'style-gyokai-tsukemen-summary',
  },
  accent: '#2d5d75',
  supportedIntensityIds,
  supportedNoodleIds,
  baseRules: [
    {
      questionId: 'form',
      tiers: [
        { tier: 'exact', optionIds: ['tsukemen'] },
      ],
    },
    {
      questionId: 'archetype',
      tiers: [
        { tier: 'exact', optionIds: ['gyokai-rich'] },
        { tier: 'adjacent', optionIds: ['miso-rich', 'tsukemen-other'] },
      ],
    },
    {
      questionId: 'tare',
      tiers: [
        { tier: 'exact', optionIds: ['shoyu', 'shio'] },
        { tier: 'adjacent', optionIds: ['miso'] },
      ],
    },
    {
      questionId: 'source',
      tiers: [
        { tier: 'exact', optionIds: ['fish-seafood'] },
        { tier: 'adjacent', optionIds: ['mixed', 'shellfish'] },
        { tier: 'partial', optionIds: ['unsure'] },
      ],
    },
    {
      questionId: 'noodle',
      tiers: [
        { tier: 'exact', optionIds: ['medium-thick-straight', 'extra-thick'] },
        { tier: 'adjacent', optionIds: ['medium-thin-straight'] },
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
      id: 'gyokai-tsukemen-canonical',
      priority: 0,
      labelMessageId: 'adjustment-gyokai-tsukemen-canonical-label',
      points: 4,
      minMatches: 4,
      conditions: [
        {
          priority: 0,
          questionId: 'form',
          optionIds: ['tsukemen'],
        },
        {
          priority: 1,
          questionId: 'archetype',
          optionIds: ['gyokai-rich'],
        },
        {
          priority: 2,
          questionId: 'source',
          optionIds: ['fish-seafood'],
        },
        {
          priority: 3,
          questionId: 'body',
          optionIds: ['rich'],
        },
        {
          priority: 4,
          questionId: 'signature',
          optionIds: ['fish-kombu'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: ['fish-seafood'],
} as const satisfies StyleDefinition
