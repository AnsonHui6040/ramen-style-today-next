import type { DefinitionBundleSource } from '../compiler/source-schema.js'

const sourceFile = 'packages/classification-core/src/definitions/synthetic.ts'

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
      weight: 50,
      dependsOn: [],
      options: [
        { id: 'demo-soup', messageId: 'option-demo-soup' },
        { id: 'demo-dry', messageId: 'option-demo-dry' },
      ],
    },
    {
      sourceFile,
      id: 'demo-archetype',
      messageId: 'question-demo-archetype',
      order: 1,
      selectionType: 'single',
      minSelections: 1,
      maxSelections: 1,
      weight: 50,
      dependsOn: ['demo-form'],
      options: [
        { id: 'demo-chintan', messageId: 'option-demo-chintan' },
        { id: 'demo-aburasoba', messageId: 'option-demo-aburasoba' },
      ],
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
  policy: {
    sourceFile,
    exactRatio: 1,
    adjacentRatio: 0.6,
    partialRatio: 0.4,
    bonusCap: 5,
    penaltyCap: 15,
    confidenceThreshold: 72,
    tieGap: 5,
  },
}
