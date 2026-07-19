import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const shellfishDashiStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/shellfish-dashi.ts',
  id: 'shellfish-dashi',
  family: 'soup',
  displayPriority: 9,
  messageIds: {
    label: 'style-shellfish-dashi-label',
    summary: 'style-shellfish-dashi-summary',
  },
  accent: '#3f7570',
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
        { tier: 'adjacent', optionIds: ['konbusui-light', 'paitan'] },
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
        { tier: 'exact', optionIds: ['shellfish'] },
        { tier: 'adjacent', optionIds: ['fish-seafood', 'mixed'] },
        { tier: 'partial', optionIds: ['shrimp-crab', 'unsure'] },
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
        { tier: 'exact', optionIds: ['yuzu-citrus', 'fish-kombu'] },
        { tier: 'adjacent', optionIds: ['no-preference'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'shellfish-clear',
      priority: 0,
      labelMessageId: 'adjustment-shellfish-clear-label',
      points: 4,
      minMatches: 4,
      conditions: [
        {
          priority: 0,
          questionId: 'source',
          optionIds: ['shellfish'],
        },
        {
          priority: 1,
          questionId: 'body',
          optionIds: ['light', 'balanced'],
        },
        {
          priority: 2,
          questionId: 'tare',
          optionIds: ['shio', 'shoyu'],
        },
        {
          priority: 3,
          questionId: 'signature',
          optionIds: ['yuzu-citrus', 'fish-kombu'],
        },
      ],
    },
  ],
  conflicts: [
    {
      id: 'shellfish-jiro',
      priority: 0,
      labelMessageId: 'adjustment-shellfish-jiro-label',
      penalty: 12,
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
  exclusionTags: ['shellfish'],
} as const satisfies StyleDefinition
