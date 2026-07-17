import {
  classificationDefinition,
  type ClassificationModel,
  type ConceptKey,
} from '@ramen-style/classification-core/compiler'

export interface DocumentationRelation {
  conceptKey: ConceptKey
  canonicalSource: string
  provenanceSources?: readonly string[]
  validators: readonly string[]
  consumers: readonly string[]
  tests: readonly string[]
  migrations: readonly string[]
  generatedArtifacts?: readonly string[]
  messageSources?: readonly string[]
  evidence?: readonly string[]
}

export const documentationDefinition = classificationDefinition
export const documentationSourceFile =
  'packages/classification-core/src/definitions/questions.ts'

export const documentationDetectedConsumers = [
  'apps/web/src/App.tsx',
  'apps/web/src/catalog-adapter.ts',
  'apps/web/src/finder-adapter.ts',
  'apps/web/src/questionnaire.ts',
  'apps/web/src/runtime.ts',
  'apps/web/src/web-persistence.ts',
  'tools/parity/eligibility/parity.ts',
  'tools/parity/questions/observable-trace.ts',
  'tools/parity/questions/parity.ts',
  'tools/parity/scoring/parity.ts',
  'tools/parity/scoring/verify-fixtures.ts',
  'tools/parity/styles/parity.ts',
  'tools/questions/generate-question-model.ts',
  'tools/scoring/generate-classification-model.ts',
  'tools/styles/generate-style-model.ts',
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

const styleValidators = [
  'packages/classification-core/src/compiler/styles/source-schema.ts',
  'packages/classification-core/src/compiler/styles/compile.ts',
  'packages/classification-core/src/compiler/styles/proof.ts',
] as const
const styleConsumers = [
  'packages/classification-core/src/style-model.ts',
  'packages/classification-core/src/index.ts',
  'tools/validation/validate-classification.ts',
] as const
const styleTests = [
  'packages/classification-core/src/definitions/styles/definitions.test.ts',
  'packages/classification-core/src/compiler/styles/source-schema.test.ts',
  'packages/classification-core/src/compiler/styles/compile.test.ts',
  'packages/classification-core/src/compiler/styles/proof.test.ts',
  'packages/classification-core/src/compiler/styles/serialize.test.ts',
  'tools/styles/generate-style-model.test.ts',
  'tools/parity/styles/parity.test.ts',
] as const
const styleGeneratedArtifacts = [
  'packages/classification-core/src/generated/style-model.ts',
] as const
const styleEvidence = [
  'tools/parity/fixtures/styles/legacy-v1/manifest.json',
  'tools/parity/styles/verify-fixtures.ts',
  'tools/parity/styles/parity.ts',
] as const

const scoringValidators = [
  'packages/classification-core/src/compiler/scoring-policy/source-schema.ts',
  'packages/classification-core/src/compiler/scoring-policy/compile.ts',
  'packages/classification-core/src/compiler/scoring-policy/proof.ts',
] as const
const scoringConsumers = [
  'packages/classification-core/src/scoring/score.ts',
  'packages/classification-core/src/classification-model.ts',
  'packages/classification-core/src/index.ts',
  'tools/validation/validate-classification.ts',
] as const
const scoringTests = [
  'packages/classification-core/src/compiler/scoring-policy/source-schema.test.ts',
  'packages/classification-core/src/compiler/scoring-policy/compile.test.ts',
  'packages/classification-core/src/compiler/scoring-policy/proof.test.ts',
  'packages/classification-core/src/scoring/score.test.ts',
  'tools/scoring/generate-classification-model.test.ts',
  'tools/parity/scoring/parity.test.ts',
] as const
const scoringGeneratedArtifacts = [
  'packages/classification-core/src/generated/classification-model.ts',
] as const
const scoringEvidence = [
  'tools/parity/fixtures/scoring/legacy-v1/manifest.json',
  'tools/parity/scoring/verify-fixtures.ts',
  'tools/parity/scoring/parity.ts',
] as const

const eligibilityValidators = [
  'packages/classification-core/src/compiler/eligibility-policy/source-schema.ts',
  'packages/classification-core/src/compiler/eligibility-policy/compile.ts',
  'packages/classification-core/src/compiler/eligibility-policy/proof.ts',
] as const
const eligibilityConsumers = [
  'packages/classification-core/src/eligibility/evaluate.ts',
  'packages/classification-core/src/classification-model.ts',
  'packages/classification-core/src/index.ts',
  'tools/validation/validate-classification.ts',
] as const
const eligibilityTests = [
  'packages/classification-core/src/compiler/eligibility-policy/compile.test.ts',
  'packages/classification-core/src/eligibility/evaluate.test.ts',
  'tools/parity/eligibility/parity.test.ts',
] as const
const eligibilityEvidence = [
  'tools/parity/fixtures/eligibility/legacy-v1/manifest.json',
  'tools/parity/eligibility/verify-fixtures.ts',
  'tools/parity/eligibility/parity.ts',
] as const

function uniqueSources(values: readonly { readonly sourceFile: string }[]) {
  return [...new Set(values.map(({ sourceFile }) => sourceFile))]
}

function styleRelations(model: ClassificationModel) {
  const byKey = new Map<ConceptKey, {
    messageSources: readonly string[]
    provenanceSources: readonly string[]
  }>()
  for (const style of model.styleModel.styles) {
    byKey.set(`style/${style.id}`, {
      messageSources: [style.provenance.sourceFile],
      provenanceSources: [style.provenance.sourceFile],
    })
    for (const core of style.cores) {
      const coreSources = uniqueSources(core.provenance)
      byKey.set(`intensity/${core.id}`, {
        messageSources: uniqueSources(core.provenance.filter(({ path }) => (
          path.startsWith('/intensities/')
        ))),
        provenanceSources: coreSources,
      })
      for (const subtype of core.subtypes) {
        byKey.set(`noodle/${subtype.id}`, {
          messageSources: uniqueSources(subtype.provenance.filter(({ path }) => (
            path.startsWith('/noodles/')
          ))),
          provenanceSources: uniqueSources(subtype.provenance),
        })
      }
    }
  }
  return byKey
}

export function createDocumentationRelations(
  model: ClassificationModel,
): readonly DocumentationRelation[] {
  const compiledStyleRelations = styleRelations(model)
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
      : concept.kind === 'style'
          || concept.kind === 'intensity'
          || concept.kind === 'noodle'
        ? {
            conceptKey: concept.key,
            canonicalSource: concept.sourceFile,
            provenanceSources:
              compiledStyleRelations.get(concept.key)?.provenanceSources ?? [],
            validators: styleValidators,
            consumers: styleConsumers,
            tests: styleTests,
            migrations: [],
            generatedArtifacts: styleGeneratedArtifacts,
            messageSources:
              compiledStyleRelations.get(concept.key)?.messageSources ?? [],
            evidence: styleEvidence,
          }
      : concept.kind === 'policy'
        ? {
            conceptKey: concept.key,
            canonicalSource: concept.sourceFile,
            validators: concept.id === 'eligibility'
              ? eligibilityValidators
              : scoringValidators,
            consumers: concept.id === 'eligibility'
              ? eligibilityConsumers
              : scoringConsumers,
            tests: concept.id === 'eligibility'
              ? eligibilityTests
              : scoringTests,
            migrations: [],
            generatedArtifacts: scoringGeneratedArtifacts,
            evidence: concept.id === 'eligibility'
              ? eligibilityEvidence
              : scoringEvidence,
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
