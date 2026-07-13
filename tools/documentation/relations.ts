import type { ConceptKey } from '@ramen-style/classification-core/compiler'

export interface DocumentationRelation {
  conceptKey: ConceptKey
  canonicalSource: string
  validators: readonly string[]
  consumers: readonly string[]
  tests: readonly string[]
  migrations: readonly string[]
}

const syntheticSourceFile = 'packages/classification-core/src/definitions/synthetic.ts'

export const documentationDefinition = {
  modelVersion: 'batch1.1.0',
  provenance: {
    questions: { origin: 'synthetic' },
    styles: { origin: 'synthetic' },
    scoringPolicy: { origin: 'synthetic' },
  },
  questions: [
    {
      id: 'demo-form',
      order: 0,
      messageIds: {
        title: 'question-demo-form-title',
        description: 'question-demo-form-description',
      },
      selection: { type: 'single', min: 1, max: 1 },
      weight: 50,
      options: [
        {
          id: 'demo-soup',
          order: 0,
          messageIds: { label: 'option-demo-soup-label' },
        },
        {
          id: 'demo-dry',
          order: 1,
          messageIds: { label: 'option-demo-dry-label' },
        },
      ],
    },
    {
      id: 'demo-archetype',
      order: 1,
      messageIds: {
        title: 'question-demo-archetype-title',
        description: 'question-demo-archetype-description',
      },
      selection: { type: 'single', min: 1, max: 1 },
      weight: 50,
      options: [
        {
          id: 'demo-chintan',
          order: 0,
          messageIds: { label: 'option-demo-chintan-label' },
        },
        {
          id: 'demo-aburasoba',
          order: 1,
          messageIds: { label: 'option-demo-aburasoba-label' },
        },
      ],
    },
  ],
  styles: [
    {
      sourceFile: syntheticSourceFile,
      id: 'demo-shoyu',
      messageId: 'style-demo-shoyu',
      familyOptionId: { questionId: 'demo-archetype', optionId: 'demo-chintan' },
      priority: 0,
      intensities: ['standard'],
      noodles: ['medium-thin-straight'],
    },
  ],
  policy: {
    sourceFile: syntheticSourceFile,
    exactRatio: 1,
    adjacentRatio: 0.6,
    partialRatio: 0.4,
    bonusCap: 5,
    penaltyCap: 15,
    confidenceThreshold: 72,
    tieGap: 5,
  },
} as const

const questionConceptKeys = [
  'question/demo-form',
  'question/demo-archetype',
  'option/demo-form:demo-soup',
  'option/demo-form:demo-dry',
  'option/demo-archetype:demo-chintan',
  'option/demo-archetype:demo-aburasoba',
] as const satisfies readonly ConceptKey[]

const syntheticConceptKeys = [
  'style/demo-shoyu',
  'intensity/demo-shoyu:standard',
  'noodle/demo-shoyu:medium-thin-straight',
  'policy/default',
] as const satisfies readonly ConceptKey[]

const validators = [
  'packages/classification-core/src/compiler/source-schema.ts',
  'packages/classification-core/src/compiler/compile.ts',
] as const
const tests = ['packages/classification-core/src/compiler/compile.test.ts'] as const
const questionConsumers = ['tools/questions/generate-question-model.ts'] as const

export const documentationRelations: readonly DocumentationRelation[] = [
  ...questionConceptKeys.map((conceptKey) => ({
    conceptKey,
    canonicalSource: 'tools/documentation/relations.ts',
    validators,
    consumers: questionConsumers,
    tests,
    migrations: [],
  })),
  ...syntheticConceptKeys.map((conceptKey) => ({
    conceptKey,
    canonicalSource: syntheticSourceFile,
    validators,
    consumers: ['tools/validation/validate-classification.ts'],
    tests,
    migrations: [],
  })),
]
