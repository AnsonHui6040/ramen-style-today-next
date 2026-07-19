import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const sapporoStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/sapporo.ts',
  id: 'sapporo',
  family: 'soup',
  displayPriority: 13,
  messageIds: {
    label: 'style-sapporo-label',
    summary: 'style-sapporo-summary',
  },
  accent: '#c27e2e',
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
        { tier: 'exact', optionIds: ['paitan', 'miso-rich'] },
        { tier: 'adjacent', optionIds: ['chintan'] },
      ],
    },
    {
      questionId: 'tare',
      tiers: [
        { tier: 'exact', optionIds: ['miso'] },
        { tier: 'adjacent', optionIds: ['shoyu'] },
      ],
    },
    {
      questionId: 'source',
      tiers: [
        { tier: 'exact', optionIds: ['pork', 'chicken', 'mixed'] },
        { tier: 'adjacent', optionIds: ['vegetable'] },
        { tier: 'partial', optionIds: ['unsure'] },
      ],
    },
    {
      questionId: 'noodle',
      tiers: [
        { tier: 'exact', optionIds: ['medium-thick-wavy'] },
        { tier: 'adjacent', optionIds: ['medium-thick-straight'] },
      ],
    },
    {
      questionId: 'signature',
      tiers: [
        { tier: 'exact', optionIds: ['corn-butter'] },
        { tier: 'adjacent', optionIds: ['no-preference'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'sapporo-canonical',
      priority: 0,
      labelMessageId: 'adjustment-sapporo-canonical-label',
      points: 5,
      minMatches: 4,
      conditions: [
        {
          priority: 0,
          questionId: 'tare',
          optionIds: ['miso'],
        },
        {
          priority: 1,
          questionId: 'body',
          optionIds: ['rich', 'backfat-heavy'],
        },
        {
          priority: 2,
          questionId: 'noodle',
          optionIds: ['medium-thick-wavy'],
        },
        {
          priority: 3,
          questionId: 'signature',
          optionIds: ['corn-butter'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: ['dairy'],
} as const satisfies StyleDefinition
