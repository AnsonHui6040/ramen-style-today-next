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
  const cores = result.model.styleModel.styles.flatMap(({ cores: values }) => values)
  const subtypes = cores.flatMap(({ subtypes: values }) => values)
  const optionCount = result.model.questions.reduce(
    (count, question) => count + question.options.length,
    0,
  )
  const expectedConceptCount = result.model.questions.length
    + optionCount
    + result.model.styleModel.inventory.length
    + 1
  const styleMetadata = result.model.styleModel.metadata
  const styleProvenance = result.model.provenance.styles
  if (
    result.model.modelVersion !== styleMetadata.modelVersion
    || result.model.styleModel.styles.length !== 18
    || cores.length !== 54
    || subtypes.length !== 270
    || result.model.inventory.length !== expectedConceptCount
    || styleProvenance.modelVersion !== styleMetadata.modelVersion
    || styleProvenance.sourceHash !== styleMetadata.sourceHash
    || styleProvenance.semanticHash !== styleMetadata.semanticHash
    || styleProvenance.dataVersion !== styleMetadata.dataVersion
  ) throw new Error('classification style composition validation failed')

  console.log(JSON.stringify({
    modelVersion: result.model.modelVersion,
    dataVersion: result.model.dataVersion,
    provenance: result.model.provenance,
    questionCount: result.model.questions.length,
    optionCount,
    styleCount: result.model.styleModel.styles.length,
    coreCount: cores.length,
    subtypeCount: subtypes.length,
    conceptCount: result.model.inventory.length,
  }))
}
