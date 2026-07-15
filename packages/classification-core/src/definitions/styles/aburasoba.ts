import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const aburasobaStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/aburasoba.ts',
  id: 'aburasoba',
  family: 'dry',
  displayPriority: 16,
  messageIds: {
    label: 'style-aburasoba-label',
    summary: 'style-aburasoba-summary',
  },
  accent: '#964c2a',
  supportedIntensityIds,
  supportedNoodleIds,
  baseRules: [
    {
      questionId: 'form',
      tiers: [
        { tier: 'exact', optionIds: ['dry'] },
      ],
    },
    {
      questionId: 'archetype',
      tiers: [
        { tier: 'exact', optionIds: ['aburasoba'] },
        { tier: 'adjacent', optionIds: ['dry-other'] },
      ],
    },
    {
      questionId: 'tare',
      tiers: [
        { tier: 'exact', optionIds: ['shoyu'] },
        { tier: 'adjacent', optionIds: ['none', 'spicy-sesame'] },
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
        { tier: 'exact', optionIds: ['medium-thick-straight', 'extra-thick'] },
        { tier: 'adjacent', optionIds: ['medium-thin-straight'] },
      ],
    },
    {
      questionId: 'signature',
      tiers: [
        { tier: 'exact', optionIds: ['no-preference'] },
        { tier: 'adjacent', optionIds: ['bean-sprout-garlic-backfat', 'fish-kombu'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'aburasoba-canonical',
      priority: 0,
      labelMessageId: 'adjustment-aburasoba-canonical-label',
      points: 4,
      minMatches: 4,
      conditions: [
        {
          priority: 0,
          questionId: 'form',
          optionIds: ['dry'],
        },
        {
          priority: 1,
          questionId: 'archetype',
          optionIds: ['aburasoba'],
        },
        {
          priority: 2,
          questionId: 'tare',
          optionIds: ['shoyu', 'none'],
        },
        {
          priority: 3,
          questionId: 'body',
          optionIds: ['rich', 'backfat-heavy'],
        },
        {
          priority: 4,
          questionId: 'noodle',
          optionIds: ['medium-thick-straight', 'extra-thick'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: ['pork'],
} as const satisfies StyleDefinition
