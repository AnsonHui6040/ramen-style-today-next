import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const jiroStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/jiro.ts',
  id: 'jiro',
  family: 'soup',
  displayPriority: 11,
  messageIds: {
    label: 'style-jiro-label',
    summary: 'style-jiro-summary',
  },
  accent: '#875321',
  supportedIntensityIds,
  supportedNoodleIds,
  baseRules: [
    {
      questionId: 'form',
      tiers: [
        { tier: 'exact', optionIds: ['soup'] },
        { tier: 'adjacent', optionIds: ['dry'] },
      ],
    },
    {
      questionId: 'archetype',
      tiers: [
        { tier: 'exact', optionIds: ['paitan', 'chintan'] },
        { tier: 'adjacent', optionIds: ['dry-other'] },
      ],
    },
    {
      questionId: 'tare',
      tiers: [
        { tier: 'exact', optionIds: ['shoyu'] },
        { tier: 'adjacent', optionIds: ['none'] },
      ],
    },
    {
      questionId: 'source',
      tiers: [
        { tier: 'exact', optionIds: ['pork'] },
        { tier: 'adjacent', optionIds: ['mixed'] },
        { tier: 'partial', optionIds: ['beef', 'unsure'] },
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
        { tier: 'exact', optionIds: ['bean-sprout-garlic-backfat'] },
        { tier: 'adjacent', optionIds: ['no-preference'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'jiro-canonical',
      priority: 0,
      labelMessageId: 'adjustment-jiro-canonical-label',
      points: 5,
      minMatches: 5,
      conditions: [
        {
          priority: 0,
          questionId: 'source',
          optionIds: ['pork'],
        },
        {
          priority: 1,
          questionId: 'tare',
          optionIds: ['shoyu'],
        },
        {
          priority: 2,
          questionId: 'body',
          optionIds: ['ultra-heavy'],
        },
        {
          priority: 3,
          questionId: 'noodle',
          optionIds: ['extra-thick'],
        },
        {
          priority: 4,
          questionId: 'signature',
          optionIds: ['bean-sprout-garlic-backfat'],
        },
      ],
    },
  ],
  conflicts: [
    {
      id: 'jiro-yuzu',
      priority: 0,
      labelMessageId: 'adjustment-jiro-yuzu-label',
      penalty: 15,
      whenAll: [
        {
          priority: 0,
          questionId: 'body',
          optionIds: ['ultra-heavy'],
        },
        {
          priority: 1,
          questionId: 'signature',
          optionIds: ['yuzu-citrus'],
        },
      ],
    },
    {
      id: 'jiro-duck-shellfish',
      priority: 1,
      labelMessageId: 'adjustment-jiro-duck-shellfish-label',
      penalty: 15,
      whenAll: [
        {
          priority: 0,
          questionId: 'source',
          optionIds: ['duck', 'shellfish'],
        },
        {
          priority: 1,
          questionId: 'body',
          optionIds: ['light'],
        },
        {
          priority: 2,
          questionId: 'signature',
          optionIds: ['bean-sprout-garlic-backfat'],
        },
      ],
    },
  ],
  exclusionTags: ['pork'],
} as const satisfies StyleDefinition
