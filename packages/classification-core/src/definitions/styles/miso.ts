import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const misoStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/miso.ts',
  id: 'miso',
  family: 'soup',
  displayPriority: 2,
  messageIds: {
    label: 'style-miso-label',
    summary: 'style-miso-summary',
  },
  accent: '#b56439',
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
        { tier: 'adjacent', optionIds: ['medium-thick-straight', 'extra-thick'] },
      ],
    },
    {
      questionId: 'signature',
      tiers: [
        { tier: 'exact', optionIds: ['corn-butter'] },
        { tier: 'adjacent', optionIds: ['no-preference'] },
        { tier: 'partial', optionIds: ['fish-kombu'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'miso-sapporo-lane',
      priority: 0,
      labelMessageId: 'adjustment-miso-sapporo-lane-label',
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
          questionId: 'tare',
          optionIds: ['miso'],
        },
        {
          priority: 2,
          questionId: 'body',
          optionIds: ['balanced', 'rich'],
        },
        {
          priority: 3,
          questionId: 'noodle',
          optionIds: ['medium-thick-wavy'],
        },
        {
          priority: 4,
          questionId: 'signature',
          optionIds: ['corn-butter'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: [],
} as const satisfies StyleDefinition
