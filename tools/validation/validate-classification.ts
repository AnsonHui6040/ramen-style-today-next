import {
  classificationDefinition,
  compileClassification,
} from '@ramen-style/classification-core/compiler'

const sourceFile = 'packages/classification-core/src/definitions/classification.ts'
const result = compileClassification(classificationDefinition, sourceFile)

if (!result.ok) {
  console.error(JSON.stringify(result.diagnostics, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({
    modelVersion: result.model.modelVersion,
    dataVersion: result.model.dataVersion,
    provenance: result.model.provenance,
    questionCount: result.model.questions.length,
    styleCount: result.model.styles.length,
    conceptCount: result.model.inventory.length,
  }))
}
