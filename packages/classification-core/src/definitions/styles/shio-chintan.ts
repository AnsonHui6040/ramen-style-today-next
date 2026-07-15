import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const shioChintanStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/shio-chintan.ts',
  id: 'shio-chintan',
  family: 'soup',
  displayPriority: 1,
  messageIds: {
    label: 'style-shio-chintan-label',
    summary: 'style-shio-chintan-summary',
  },
  accent: '#d4b35a',
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
        { tier: 'exact', optionIds: ['shio'] },
        { tier: 'adjacent', optionIds: ['shoyu'] },
      ],
    },
    {
      questionId: 'source',
      tiers: [
        { tier: 'exact', optionIds: ['chicken', 'duck', 'shellfish'] },
        { tier: 'adjacent', optionIds: ['fish-seafood', 'mixed'] },
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
        { tier: 'exact', optionIds: ['yuzu-citrus', 'no-preference'] },
        { tier: 'adjacent', optionIds: ['fish-kombu'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'classic-shio',
      priority: 0,
      labelMessageId: 'adjustment-classic-shio-label',
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
          optionIds: ['shio'],
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
      ],
    },
  ],
  conflicts: [
    {
      id: 'shio-light-conflict',
      priority: 0,
      labelMessageId: 'adjustment-shio-light-conflict-label',
      penalty: 8,
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
  exclusionTags: [],
} as const satisfies StyleDefinition
