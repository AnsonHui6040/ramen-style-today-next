import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const duckChintanStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/duck-chintan.ts',
  id: 'duck-chintan',
  family: 'soup',
  displayPriority: 6,
  messageIds: {
    label: 'style-duck-chintan-label',
    summary: 'style-duck-chintan-summary',
  },
  accent: '#8d4d38',
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
        { tier: 'exact', optionIds: ['shio', 'shoyu'] },
        { tier: 'adjacent', optionIds: ['none'] },
      ],
    },
    {
      questionId: 'source',
      tiers: [
        { tier: 'exact', optionIds: ['duck'] },
        { tier: 'adjacent', optionIds: ['shellfish', 'mixed'] },
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
        { tier: 'adjacent', optionIds: ['no-preference', 'fish-kombu'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'duck-clear',
      priority: 0,
      labelMessageId: 'adjustment-duck-clear-label',
      points: 4,
      minMatches: 5,
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
          questionId: 'source',
          optionIds: ['duck'],
        },
        {
          priority: 3,
          questionId: 'body',
          optionIds: ['light', 'balanced'],
        },
        {
          priority: 4,
          questionId: 'signature',
          optionIds: ['yuzu-citrus', 'no-preference'],
        },
        {
          priority: 5,
          questionId: 'tare',
          optionIds: ['shio', 'shoyu'],
        },
      ],
    },
  ],
  conflicts: [
    {
      id: 'duck-clear-jiro',
      priority: 0,
      labelMessageId: 'adjustment-duck-clear-jiro-label',
      penalty: 10,
      whenAll: [
        {
          priority: 0,
          questionId: 'body',
          optionIds: ['ultra-heavy'],
        },
        {
          priority: 1,
          questionId: 'signature',
          optionIds: ['bean-sprout-garlic-backfat'],
        },
      ],
    },
  ],
  exclusionTags: ['duck'],
} as const satisfies StyleDefinition
