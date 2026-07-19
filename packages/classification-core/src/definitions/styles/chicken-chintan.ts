import type { StyleDefinition } from '../../contracts/style-model.js'
import {
  supportedIntensityIds,
  supportedNoodleIds,
} from './taxonomy.js'

export const chickenChintanStyle = {
  sourceFile: 'packages/classification-core/src/definitions/styles/chicken-chintan.ts',
  id: 'chicken-chintan',
  family: 'soup',
  displayPriority: 4,
  messageIds: {
    label: 'style-chicken-chintan-label',
    summary: 'style-chicken-chintan-summary',
  },
  accent: '#cf8d53',
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
        { tier: 'exact', optionIds: ['chicken'] },
        { tier: 'adjacent', optionIds: ['mixed'] },
        { tier: 'partial', optionIds: ['duck', 'unsure'] },
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
        { tier: 'exact', optionIds: ['no-preference'] },
        { tier: 'adjacent', optionIds: ['yuzu-citrus'] },
      ],
    },
  ],
  bonuses: [
    {
      id: 'chicken-clear',
      priority: 0,
      labelMessageId: 'adjustment-chicken-clear-label',
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
          optionIds: ['chintan'],
        },
        {
          priority: 2,
          questionId: 'source',
          optionIds: ['chicken'],
        },
        {
          priority: 3,
          questionId: 'body',
          optionIds: ['light', 'balanced'],
        },
        {
          priority: 4,
          questionId: 'tare',
          optionIds: ['shio', 'shoyu'],
        },
      ],
    },
  ],
  conflicts: [],
  exclusionTags: ['chicken'],
} as const satisfies StyleDefinition
