import {
  compileClassification,
  syntheticDefinition,
} from '@ramen-style/classification-core/compiler'

const sourceFile = 'packages/classification-core/src/definitions/synthetic.ts'
const result = compileClassification(syntheticDefinition, sourceFile)

if (!result.ok) {
  console.error(JSON.stringify(result.diagnostics, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({
    mode: result.model.mode,
    modelVersion: result.model.modelVersion,
    dataVersion: result.model.dataVersion,
    conceptCount: result.model.inventory.length,
  }))
}
