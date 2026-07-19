import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const konbusuiTsukemenStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/konbusui-tsukemen.ts',
  id: 'konbusui-tsukemen',
  family: 'tsukemen',
  displayPriority: 14,
  messageIds: {
    label: 'style-konbusui-tsukemen-label',
    summary: 'style-konbusui-tsukemen-summary',
  },
  accent: '#3d747a',
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
        { tier: 'exact', optionIds: ['konbusui-light'] },
        { tier: 'adjacent', optionIds: ['tsukemen-other'] },
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
        { tier: 'exact', optionIds: ['fish-seafood', 'shellfish'] },
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
        { tier: 'exact', optionIds: ['fish-kombu', 'no-preference'] },
        { tier: 'adjacent', optionIds: ['yuzu-citrus'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'konbusui-canonical',
      priority: 0,
      labelMessageId: 'adjustment-konbusui-canonical-label',
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
          optionIds: ['konbusui-light'],
        },
        {
          priority: 2,
          questionId: 'source',
          optionIds: ['fish-seafood', 'shellfish'],
        },
        {
          priority: 3,
          questionId: 'body',
          optionIds: ['light', 'balanced'],
        },
        {
          priority: 4,
          questionId: 'signature',
          optionIds: ['fish-kombu', 'no-preference'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: ['fish-seafood'],
} as const satisfies StyleDefinition
