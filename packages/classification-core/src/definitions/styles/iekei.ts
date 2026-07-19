import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const iekeiStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/iekei.ts',
  id: 'iekei',
  family: 'soup',
  displayPriority: 10,
  messageIds: {
    label: 'style-iekei-label',
    summary: 'style-iekei-summary',
  },
  accent: '#a33824',
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
        { tier: 'exact', optionIds: ['shoyu'] },
        { tier: 'adjacent', optionIds: ['none'] },
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
        { tier: 'exact', optionIds: ['medium-thick-straight'] },
        { tier: 'adjacent', optionIds: ['medium-thin-straight'] },
      ],
    },
    {
      questionId: 'signature',
      tiers: [
        { tier: 'exact', optionIds: ['nori-spinach'] },
        { tier: 'adjacent', optionIds: ['no-preference'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'iekei-canonical',
      priority: 0,
      labelMessageId: 'adjustment-iekei-canonical-label',
      points: 5,
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
          optionIds: ['paitan'],
        },
        {
          priority: 2,
          questionId: 'tare',
          optionIds: ['shoyu'],
        },
        {
          priority: 3,
          questionId: 'source',
          optionIds: ['pork'],
        },
        {
          priority: 4,
          questionId: 'body',
          optionIds: ['rich', 'backfat-heavy'],
        },
        {
          priority: 5,
          questionId: 'noodle',
          optionIds: ['medium-thick-straight'],
        },
        {
          priority: 6,
          questionId: 'signature',
          optionIds: ['nori-spinach'],
        },
      ],
    },
  ],
  conflicts: [
    {
      id: 'iekei-hakata-thin',
      priority: 0,
      labelMessageId: 'adjustment-iekei-hakata-thin-label',
      penalty: 6,
      whenAll: [
        {
          priority: 0,
          questionId: 'noodle',
          optionIds: ['thin-straight'],
        },
        {
          priority: 1,
          questionId: 'signature',
          optionIds: ['nori-spinach'],
        },
      ],
    },
  ],
  exclusionTags: ['pork'],
} as const satisfies StyleDefinition
