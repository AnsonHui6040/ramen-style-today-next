import type { ConceptKey } from '@ramen-style/classification-core/compiler'

export interface DocumentationRelation {
  conceptKey: ConceptKey
  canonicalSource: string
  validators: readonly string[]
  consumers: readonly string[]
  tests: readonly string[]
  migrations: readonly string[]
}

const conceptKeys = [
  'question/demo-form',
  'question/demo-archetype',
  'option/demo-soup',
  'option/demo-dry',
  'option/demo-chintan',
  'option/demo-aburasoba',
  'style/demo-shoyu',
  'intensity/demo-shoyu:standard',
  'noodle/demo-shoyu:medium-thin-straight',
  'policy/default',
] as const satisfies readonly ConceptKey[]

export const documentationRelations: readonly DocumentationRelation[] = conceptKeys.map(
  (conceptKey) => ({
    conceptKey,
    canonicalSource: 'packages/classification-core/src/definitions/synthetic.ts',
    validators: [
      'packages/classification-core/src/compiler/source-schema.ts',
      'packages/classification-core/src/compiler/compile.ts',
    ],
    consumers: ['tools/validation/validate-classification.ts'],
    tests: ['packages/classification-core/src/compiler/compile.test.ts'],
    migrations: [],
  }),
)
