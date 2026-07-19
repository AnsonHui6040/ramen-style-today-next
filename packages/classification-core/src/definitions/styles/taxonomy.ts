import type { StyleTaxonomyDefinition } from '../../contracts/style-model.js'

export const supportedIntensityIds = [
  'clean',
  'standard',
  'heavy',
] as const

export const supportedNoodleIds = [
  'thin-straight',
  'medium-thin-straight',
  'medium-thick-straight',
  'medium-thick-wavy',
  'extra-thick',
] as const

export const styleTaxonomy = {
  sourceFile: 'packages/classification-core/src/definitions/styles/taxonomy.ts',
  families: [
    { id: 'soup', priority: 0, formOptionId: 'soup' },
    { id: 'tsukemen', priority: 1, formOptionId: 'tsukemen' },
    { id: 'dry', priority: 2, formOptionId: 'dry' },
  ],
  intensities: [
    {
      id: 'clean',
      priority: 0,
      labelMessageId: 'intensity-clean-label',
      summaryMessageId: 'intensity-clean-summary',
      bodyRule: {
        questionId: 'body',
        tiers: [
          { tier: 'exact', optionIds: ['light', 'balanced'] },
          { tier: 'adjacent', optionIds: ['rich'] },
        ],
      },
    },
    {
      id: 'standard',
      priority: 1,
      labelMessageId: 'intensity-standard-label',
      summaryMessageId: 'intensity-standard-summary',
      bodyRule: {
        questionId: 'body',
        tiers: [
          { tier: 'exact', optionIds: ['balanced', 'rich'] },
          { tier: 'adjacent', optionIds: ['light', 'backfat-heavy'] },
        ],
      },
    },
    {
      id: 'heavy',
      priority: 2,
      labelMessageId: 'intensity-heavy-label',
      summaryMessageId: 'intensity-heavy-summary',
      bodyRule: {
        questionId: 'body',
        tiers: [
          { tier: 'exact', optionIds: ['rich', 'backfat-heavy', 'ultra-heavy'] },
          { tier: 'adjacent', optionIds: ['balanced'] },
        ],
      },
    },
  ],
  noodles: [
    {
      id: 'thin-straight',
      priority: 0,
      labelMessageId: 'noodle-thin-straight-label',
      summaryMessageId: 'noodle-thin-straight-summary',
    },
    {
      id: 'medium-thin-straight',
      priority: 1,
      labelMessageId: 'noodle-medium-thin-straight-label',
      summaryMessageId: 'noodle-medium-thin-straight-summary',
    },
    {
      id: 'medium-thick-straight',
      priority: 2,
      labelMessageId: 'noodle-medium-thick-straight-label',
      summaryMessageId: 'noodle-medium-thick-straight-summary',
    },
    {
      id: 'medium-thick-wavy',
      priority: 3,
      labelMessageId: 'noodle-medium-thick-wavy-label',
      summaryMessageId: 'noodle-medium-thick-wavy-summary',
    },
    {
      id: 'extra-thick',
      priority: 4,
      labelMessageId: 'noodle-extra-thick-label',
      summaryMessageId: 'noodle-extra-thick-summary',
    },
  ],
  exclusionTags: [
    { id: 'pork', priority: 0, exclusionsOptionId: 'pork' },
    { id: 'chicken', priority: 1, exclusionsOptionId: 'chicken' },
    { id: 'duck', priority: 2, exclusionsOptionId: 'duck' },
    { id: 'fish-seafood', priority: 4, exclusionsOptionId: 'fish-seafood' },
    { id: 'shellfish', priority: 5, exclusionsOptionId: 'shellfish' },
    { id: 'dairy', priority: 7, exclusionsOptionId: 'dairy' },
  ],
  ruleQuestions: [
    { questionId: 'form', priority: 0, source: 'style-base' },
    { questionId: 'archetype', priority: 1, source: 'style-base' },
    { questionId: 'tare', priority: 2, source: 'style-base' },
    { questionId: 'source', priority: 3, source: 'style-base' },
    { questionId: 'body', priority: 4, source: 'intensity-profile' },
    { questionId: 'noodle', priority: 5, source: 'style-base' },
    { questionId: 'signature', priority: 6, source: 'style-base' },
  ],
} as const satisfies StyleTaxonomyDefinition
