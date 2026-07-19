import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const chickenPaitanStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/chicken-paitan.ts',
  id: 'chicken-paitan',
  family: 'soup',
  displayPriority: 5,
  messageIds: {
    label: 'style-chicken-paitan-label',
    summary: 'style-chicken-paitan-summary',
  },
  accent: '#df9965',
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
        { tier: 'exact', optionIds: ['shio', 'shoyu', 'none'] },
        { tier: 'adjacent', optionIds: ['miso'] },
      ],
    },
    {
      questionId: 'source',
      tiers: [
        { tier: 'exact', optionIds: ['chicken'] },
        { tier: 'adjacent', optionIds: ['mixed'] },
        { tier: 'partial', optionIds: ['duck', 'unsure'] },
      ],
    },
    {
      questionId: 'noodle',
      tiers: [
        { tier: 'exact', optionIds: ['medium-thin-straight', 'medium-thick-straight'] },
        { tier: 'adjacent', optionIds: ['thin-straight'] },
      ],
    },
    {
      questionId: 'signature',
      tiers: [
        { tier: 'exact', optionIds: ['no-preference'] },
        { tier: 'adjacent', optionIds: ['yuzu-citrus'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'chicken-paitan-core',
      priority: 0,
      labelMessageId: 'adjustment-chicken-paitan-core-label',
      points: 4,
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
          optionIds: ['paitan'],
        },
        {
          priority: 2,
          questionId: 'source',
          optionIds: ['chicken'],
        },
        {
          priority: 3,
          questionId: 'body',
          optionIds: ['balanced', 'rich'],
        },
        {
          priority: 4,
          questionId: 'noodle',
          optionIds: ['medium-thin-straight', 'medium-thick-straight'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: ['chicken'],
} as const satisfies StyleDefinition
