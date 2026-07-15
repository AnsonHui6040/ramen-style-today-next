import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const taiwanMazesobaStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/taiwan-mazesoba.ts',
  id: 'taiwan-mazesoba',
  family: 'dry',
  displayPriority: 17,
  messageIds: {
    label: 'style-taiwan-mazesoba-label',
    summary: 'style-taiwan-mazesoba-summary',
  },
  accent: '#8c3723',
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
        { tier: 'exact', optionIds: ['taiwan-mazesoba', 'soupless-tantan'] },
        { tier: 'adjacent', optionIds: ['dry-other'] },
      ],
    },
    {
      questionId: 'tare',
      tiers: [
        { tier: 'exact', optionIds: ['spicy-sesame'] },
        { tier: 'adjacent', optionIds: ['shoyu'] },
        { tier: 'partial', optionIds: ['none'] },
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
        { tier: 'exact', optionIds: ['extra-thick'] },
        { tier: 'adjacent', optionIds: ['medium-thick-straight'] },
      ],
    },
    {
      questionId: 'signature',
      tiers: [
        { tier: 'exact', optionIds: ['fish-kombu', 'no-preference'] },
        { tier: 'adjacent', optionIds: ['bean-sprout-garlic-backfat'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'taiwan-mazesoba-canonical',
      priority: 0,
      labelMessageId: 'adjustment-taiwan-mazesoba-canonical-label',
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
          optionIds: ['taiwan-mazesoba', 'soupless-tantan'],
        },
        {
          priority: 2,
          questionId: 'tare',
          optionIds: ['spicy-sesame', 'shoyu'],
        },
        {
          priority: 3,
          questionId: 'body',
          optionIds: ['rich', 'ultra-heavy'],
        },
        {
          priority: 4,
          questionId: 'noodle',
          optionIds: ['extra-thick', 'medium-thick-straight'],
        },
      ],
    },
  ],
  conflicts: [
    {
      id: 'taiwan-mazesoba-plain',
      priority: 0,
      labelMessageId: 'adjustment-taiwan-mazesoba-plain-label',
      penalty: 10,
      whenAll: [
        {
          priority: 0,
          questionId: 'archetype',
          optionIds: ['taiwan-mazesoba', 'soupless-tantan'],
        },
        {
          priority: 1,
          questionId: 'tare',
          optionIds: ['none'],
        },
      ],
    },
  ],
  exclusionTags: ['pork'],
} as const satisfies StyleDefinition
