import type { DefinitionBundleSource } from '../compiler/source-schema.js'

const sourceFile = 'packages/classification-core/src/definitions/synthetic.ts'

// Batch 3A/3B replace these placeholders; they are proof data, not migrated legacy content.
export const proofStyles: DefinitionBundleSource['styles'] = [
  {
    sourceFile,
    id: 'proof-shoyu',
    messageId: 'style-proof-shoyu',
    familyOptionId: 'chintan',
    priority: 0,
    intensities: ['standard'],
    noodles: ['medium-thin-straight'],
  },
]

export const proofPolicy: DefinitionBundleSource['policy'] = {
  sourceFile,
  exactRatio: 1,
  adjacentRatio: 0.6,
  partialRatio: 0.4,
  bonusCap: 5,
  penaltyCap: 15,
  confidenceThreshold: 72,
  tieGap: 5,
}

export const syntheticDefinition: DefinitionBundleSource = {
  mode: 'synthetic',
  modelVersion: 'batch1.0.0',
  questions: [
    {
      sourceFile,
      id: 'demo-form',
      messageId: 'question-demo-form',
      order: 0,
      selectionType: 'single',
      minSelections: 1,
      maxSelections: 1,
      legacyWeight: 50,
      dependsOn: [],
      autoSelectSingleOption: false,
      optionSet: {
        kind: 'flat',
        options: [
          { id: 'demo-soup', messageId: 'option-demo-soup' },
          { id: 'demo-dry', messageId: 'option-demo-dry' },
        ],
      },
    },
    {
      sourceFile,
      id: 'demo-archetype',
      messageId: 'question-demo-archetype',
      order: 1,
      selectionType: 'single',
      minSelections: 1,
      maxSelections: 1,
      legacyWeight: 50,
      dependsOn: ['demo-form'],
      autoSelectSingleOption: false,
      optionSet: {
        kind: 'branch',
        by: 'demo-form',
        branches: [
          {
            when: 'demo-soup',
            options: [{ id: 'demo-chintan', messageId: 'option-demo-chintan' }],
          },
          {
            when: 'demo-dry',
            options: [{ id: 'demo-aburasoba', messageId: 'option-demo-aburasoba' }],
          },
        ],
      },
    },
  ],
  styles: [
    {
      sourceFile,
      id: 'demo-shoyu',
      messageId: 'style-demo-shoyu',
      familyOptionId: 'demo-soup',
      priority: 0,
      intensities: ['standard'],
      noodles: ['medium-thin-straight'],
    },
  ],
  policy: proofPolicy,
}
