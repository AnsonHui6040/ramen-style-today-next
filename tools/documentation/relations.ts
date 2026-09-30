import type { ClassificationModel } from '@ramen-style/classification-core/compiler'

export interface DocumentationRelation {
  conceptKey: ClassificationModel['inventory'][number]['key']
  canonicalSource: string
  validators: readonly string[]
  consumers: readonly string[]
  tests: readonly string[]
  migrations: readonly string[]
}

const compilerValidators = [
  'packages/classification-core/src/compiler/source-schema.ts',
  'packages/classification-core/src/compiler/compile.ts',
]
const flowValidators = [
  ...compilerValidators,
  'packages/classification-core/src/flow/options.ts',
  'packages/classification-core/src/flow/complete.ts',
]
const flowTests = [
  'packages/classification-core/src/compiler/compile.test.ts',
  'packages/classification-core/src/flow/flow.test.ts',
  'tools/parity/questions-flow.test.ts',
]
const coreConsumers = [
  'tools/parity/generate.ts',
  'tools/parity/new-engine.ts',
  'tools/validation/validate-classification.ts',
]

/** One relation per compiled concept; questions and options are additionally covered by flow tests. */
export function documentationRelationsFor(
  model: ClassificationModel,
): readonly DocumentationRelation[] {
  return model.inventory.map((concept) => {
    const isFlowConcept = concept.kind === 'question' || concept.kind === 'option'
    return {
      conceptKey: concept.key,
      canonicalSource: concept.sourceFile,
      validators: isFlowConcept ? flowValidators : compilerValidators,
      consumers: coreConsumers,
      tests: isFlowConcept
        ? flowTests
        : ['packages/classification-core/src/compiler/compile.test.ts'],
      migrations: [],
    }
  })
}
