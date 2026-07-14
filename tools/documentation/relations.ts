import {
  classificationDefinition,
  type ClassificationModel,
  type ConceptKey,
} from '@ramen-style/classification-core/compiler'

export interface DocumentationRelation {
  conceptKey: ConceptKey
  canonicalSource: string
  validators: readonly string[]
  consumers: readonly string[]
  tests: readonly string[]
  migrations: readonly string[]
}

export const documentationDefinition = classificationDefinition
export const documentationSourceFile =
  'packages/classification-core/src/definitions/questions.ts'

export const documentationDetectedConsumers = [
  'tools/parity/questions/observable-trace.ts',
  'tools/parity/questions/parity.ts',
  'tools/questions/generate-question-model.ts',
  'tools/validation/validate-classification.ts',
] as const

const questionValidators = [
  'packages/classification-core/src/compiler/questions/source-schema.ts',
  'packages/classification-core/src/compiler/questions/compile.ts',
  'packages/classification-core/src/compiler/questions/proof.ts',
] as const
const questionConsumers = [
  'packages/classification-core/src/flow/evaluate.ts',
] as const
const questionTests = [
  'packages/classification-core/src/definitions/questions.test.ts',
  'packages/classification-core/src/compiler/questions/proof.test.ts',
  'tools/parity/questions/parity.test.ts',
] as const

const syntheticValidators = [
  'packages/classification-core/src/compiler/source-schema.ts',
  'packages/classification-core/src/compiler/compile.ts',
] as const
const syntheticTests = [
  'packages/classification-core/src/compiler/compile.test.ts',
] as const

export function createDocumentationRelations(
  model: ClassificationModel,
): readonly DocumentationRelation[] {
  return model.inventory.map((concept) => (
    concept.kind === 'question' || concept.kind === 'option'
      ? {
          conceptKey: concept.key,
          canonicalSource: documentationSourceFile,
          validators: questionValidators,
          consumers: questionConsumers,
          tests: questionTests,
          migrations: [],
        }
      : {
          conceptKey: concept.key,
          canonicalSource: concept.sourceFile,
          validators: syntheticValidators,
          consumers: ['tools/validation/validate-classification.ts'],
          tests: syntheticTests,
          migrations: [],
        }
  ))
}
