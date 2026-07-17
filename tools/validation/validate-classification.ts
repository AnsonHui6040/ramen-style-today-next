import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  classificationDefinition,
  compileClassification,
  type ClassificationModel,
} from '@ramen-style/classification-core/compiler'
import { verifyCommittedStyleFixtures } from '../parity/styles/verify-fixtures.js'

const sourceFile = 'packages/classification-core/src/definitions/classification.ts'

export function validateClassificationModel(model: ClassificationModel) {
  const fixture = verifyCommittedStyleFixtures()
  const cores = model.styleModel.styles.flatMap(({ cores: values }) => values)
  const subtypes = cores.flatMap(({ subtypes: values }) => values)
  const rules = cores.flatMap(({ rules: values }) => values)
  const adjustments = model.styleModel.styles.flatMap(
    ({ adjustments: values }) => values,
  )
  const optionCount = model.questions.reduce(
    (count, question) => count + question.options.length,
    0,
  )
  const expectedConceptCount = model.questions.length
    + optionCount
    + model.styleModel.inventory.length
    + 1
  const questionMetadata = model.questionModel.metadata
  const styleMetadata = model.styleModel.metadata
  const policyMetadata = model.policy.metadata
  const styleProvenance = model.provenance.styles
  const conceptCounts = Object.fromEntries([
    'question',
    'option',
    'style',
    'intensity',
    'noodle',
    'policy',
  ].map((kind) => [
    kind,
    model.inventory.filter((concept) => concept.kind === kind).length,
  ]))

  if (
    model.modelVersion !== policyMetadata.modelVersion
    || model.questionModel.questions !== model.questions
    || policyMetadata.questionModelVersion !== questionMetadata.modelVersion
    || policyMetadata.questionSemanticHash !== questionMetadata.semanticHash
    || styleMetadata.questionModelVersion !== questionMetadata.modelVersion
    || styleMetadata.questionSemanticHash !== questionMetadata.semanticHash
    || policyMetadata.styleModelVersion !== styleMetadata.modelVersion
    || policyMetadata.styleSemanticHash !== styleMetadata.semanticHash
    || model.provenance.scoringPolicy.origin !== 'legacy-production'
    || model.styleModel.styles.length !== 18
    || cores.length !== 54
    || subtypes.length !== 270
    || rules.length !== 378
    || adjustments.length !== 25
    || model.inventory.length !== expectedConceptCount
    || JSON.stringify(conceptCounts) !== JSON.stringify({
      question: 8,
      option: 53,
      style: 18,
      intensity: 54,
      noodle: 270,
      policy: 1,
    })
    || styleProvenance.modelVersion !== styleMetadata.modelVersion
    || styleProvenance.sourceHash !== styleMetadata.sourceHash
    || styleProvenance.semanticHash !== styleMetadata.semanticHash
    || styleProvenance.dataVersion !== styleMetadata.dataVersion
    || fixture.casesHash
      !== 'cd48d42b596e1d7d71757a8cec109f7787d21596a8905a06c505fefbd0f93517'
    || fixture.fixtureContentHash
      !== 'd33119e4d36a8b37314805dc8e439f724a37bf62b91fd3288a780ad67c2c3028'
    || fixture.manifestHash
      !== 'fa1a4714a77ce70489b56c54b82a812b28cd18dbc31a668a62ae51cc12e9586b'
    || fixture.coverage.styles !== 18
    || fixture.coverage.cores !== 54
    || fixture.coverage.subtypes !== 270
    || fixture.coverage.rules !== 378
    || fixture.coverage.bonusCopies !== 54
    || fixture.coverage.conflictCopies !== 21
    || fixture.coverage.exclusionTags !== 6
    || fixture.coverage.copyRoles !== 8
  ) throw new Error('classification composition validation failed')

  return {
    modelVersion: model.modelVersion,
    dataVersion: model.dataVersion,
    provenance: model.provenance,
    policy: model.policy.metadata,
    questionCount: model.questions.length,
    optionCount,
    styleCount: model.styleModel.styles.length,
    coreCount: cores.length,
    subtypeCount: subtypes.length,
    ruleCount: rules.length,
    adjustmentCount: adjustments.length,
    conceptCount: model.inventory.length,
    styleFixture: {
      casesHash: fixture.casesHash,
      fixtureContentHash: fixture.fixtureContentHash,
      manifestHash: fixture.manifestHash,
      coverage: fixture.coverage,
    },
  }
}

function main() {
  const result = compileClassification(classificationDefinition, sourceFile)
  if (!result.ok) {
    console.error(JSON.stringify(result.diagnostics, null, 2))
    process.exitCode = 1
    return
  }
  console.log(JSON.stringify(validateClassificationModel(result.model)))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
