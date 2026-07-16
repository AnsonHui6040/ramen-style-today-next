import { createHash } from 'node:crypto'

import { deepFreeze } from '../contracts/deep-freeze.js'
import { compareDiagnostics, type Diagnostic } from '../contracts/diagnostic.js'
import type {
  ClassificationModel,
  ConceptKey,
  ConceptRecord,
} from '../contracts/model.js'
import type {
  CompiledQuestion,
  QuestionDefinitionSource,
} from '../contracts/question-model.js'
import { compareCodePoints } from '../contracts/source-path.js'
import { DiagnosticCollector } from './collector.js'
import { parseDefinitionBundle } from './parse.js'
import { compileQuestions } from './questions/compile.js'
import { extractConditionReferences } from './questions/dependencies.js'
import { stableJson } from './stable-json.js'
import { compileStyles } from './styles/compile.js'

export type CompileResult =
  | { ok: true; model: ClassificationModel; diagnostics: readonly Diagnostic[] }
  | { ok: false; diagnostics: readonly Diagnostic[] }

function duplicateValues(values: readonly string[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].sort(compareCodePoints)
}

function inventoryKey(kind: ConceptRecord['kind'], id: string): ConceptKey {
  return `${kind}/${id}`
}

function optionIdentity(questionId: string, optionId: string) {
  return `${questionId}:${optionId}`
}

type ParsedDefinition = NonNullable<ReturnType<typeof parseDefinitionBundle>['definition']>

function buildInventory(
  definition: ParsedDefinition,
  questions: readonly CompiledQuestion[],
  styleModel: ClassificationModel['styleModel'],
  sourceFile: string,
) {
  const records: ConceptRecord[] = []
  for (const question of questions) {
    records.push({
      key: inventoryKey('question', question.id),
      kind: 'question',
      id: question.id,
      sourceFile,
      messageIds: [question.messageIds.title, question.messageIds.description],
    })
    for (const option of question.options) {
      records.push({
        key: inventoryKey('option', optionIdentity(question.id, option.id)),
        kind: 'option',
        id: option.id,
        ownerQuestionId: question.id,
        sourceFile,
        messageIds: [option.messageIds.label, option.messageIds.description]
          .filter((messageId): messageId is string => messageId !== undefined),
      })
    }
  }
  records.push(...styleModel.inventory)
  records.push({
    key: 'policy/default',
    kind: 'policy',
    id: 'default',
    sourceFile: definition.policy.sourceFile,
    messageIds: [],
  })
  return records.sort((left, right) => compareCodePoints(left.key, right.key))
}

function classificationDataProjection(
  definition: ParsedDefinition,
  questionModel: ReturnType<typeof compileQuestions> & { readonly ok: true },
  styleModel: ReturnType<typeof compileStyles> & { readonly ok: true },
) {
  return {
    modelVersion: definition.modelVersion,
    questionModel: {
      modelVersion: questionModel.model.metadata.modelVersion,
      sourceHash: questionModel.model.metadata.sourceHash,
      semanticHash: questionModel.model.metadata.semanticHash,
    },
    styleModel: {
      modelVersion: styleModel.model.metadata.modelVersion,
      semanticHash: styleModel.model.metadata.semanticHash,
      dataVersion: styleModel.model.metadata.dataVersion,
    },
    scoringPolicy: {
      exactRatio: definition.policy.exactRatio,
      adjacentRatio: definition.policy.adjacentRatio,
      partialRatio: definition.policy.partialRatio,
      bonusCap: definition.policy.bonusCap,
      penaltyCap: definition.policy.penaltyCap,
      confidenceThreshold: definition.policy.confidenceThreshold,
      tieGap: definition.policy.tieGap,
    },
  }
}

export function compileClassification(input: unknown, sourceFile: string): CompileResult {
  const parsed = parseDefinitionBundle(input, sourceFile)
  if (!parsed.definition) return { ok: false, diagnostics: parsed.diagnostics }

  const definition = parsed.definition
  const questionCompilation = compileQuestions(
    definition.questions as readonly QuestionDefinitionSource[],
  )
  const collector = new DiagnosticCollector()
  for (const id of duplicateValues(definition.questions.map((item) => item.id))) {
    collector.error({ code: 'QUESTION_DUPLICATE_ID', sourceFile, path: '/questions', entityId: id, message: `Duplicate question ${id}` })
  }
  for (const [questionIndex, question] of definition.questions.entries()) {
    for (const id of duplicateValues(question.options.map((item) => item.id))) {
      const identity = optionIdentity(question.id, id)
      collector.error({
        code: 'OPTION_DUPLICATE_ID',
        sourceFile,
        path: `/questions/${questionIndex}/options`,
        entityId: identity,
        message: `Duplicate option ${identity}`,
      })
    }
  }
  const questionIds = new Set(definition.questions.map((item) => item.id))
  for (const reference of extractConditionReferences(definition.questions)) {
    if (!questionIds.has(reference.referencedQuestionId)) collector.error({
      code: 'REFERENCE_UNKNOWN',
      sourceFile,
      path: reference.path,
      entityId: reference.ownerQuestionId,
      message: `Unknown question dependency ${reference.referencedQuestionId}`,
    })
  }
  const totalWeight = definition.questions.reduce((sum, question) => sum + (question.weight ?? 0), 0)
  if (totalWeight !== 100) collector.error({
    code: 'POLICY_WEIGHT_TOTAL',
    sourceFile: definition.policy.sourceFile,
    path: '/questions',
    message: `Question weights total ${totalWeight}, expected 100`,
    expected: 100,
    received: totalWeight,
  })
  if (definition.modelVersion !== definition.styles.modelVersion) collector.error({
    code: 'STYLE_MODEL_VERSION_MISMATCH',
    sourceFile,
    path: '/modelVersion',
    entityId: definition.modelVersion,
    message: 'Classification and style model versions must match',
    expected: definition.styles.modelVersion,
    received: definition.modelVersion,
  })

  const questionDiagnostics = [
    ...collector.toArray(),
    ...questionCompilation.diagnostics,
  ].sort(compareDiagnostics)
  if (!questionCompilation.ok) {
    return { ok: false, diagnostics: questionDiagnostics }
  }

  const styleCompilation = compileStyles(
    definition.styles,
    questionCompilation.model,
    definition.styles.sourceFile,
  )
  const styleDiagnostics = [
    ...questionDiagnostics,
    ...styleCompilation.diagnostics,
  ].sort(compareDiagnostics)
  if (!styleCompilation.ok) return { ok: false, diagnostics: styleDiagnostics }

  const inventory = buildInventory(
    definition,
    questionCompilation.model.questions,
    styleCompilation.model,
    sourceFile,
  )
  for (const key of duplicateValues(inventory.map((item) => item.key))) {
    collector.error({
      code: 'CONCEPT_DUPLICATE_KEY',
      sourceFile,
      path: '/inventory',
      entityId: key,
      message: `Duplicate concept key ${key}`,
    })
  }
  const diagnostics = [
    ...collector.toArray(),
    ...questionCompilation.diagnostics,
    ...styleCompilation.diagnostics,
  ].sort(compareDiagnostics)
  if (collector.hasErrors()) return { ok: false, diagnostics }

  const dataVersion = createHash('sha256').update(stableJson(
    classificationDataProjection(definition, questionCompilation, styleCompilation),
  )).digest('hex')
  const styleMetadata = styleCompilation.model.metadata
  const model = deepFreeze({
    modelVersion: definition.modelVersion,
    dataVersion,
    provenance: {
      questions: definition.provenance.questions,
      styles: {
        origin: definition.provenance.styles.origin,
        modelVersion: styleMetadata.modelVersion,
        sourceHash: styleMetadata.sourceHash,
        semanticHash: styleMetadata.semanticHash,
        dataVersion: styleMetadata.dataVersion,
      },
      scoringPolicy: definition.provenance.scoringPolicy,
    },
    questions: questionCompilation.model.questions,
    styleModel: styleCompilation.model,
    policy: definition.policy,
    inventory,
  } satisfies ClassificationModel)
  return { ok: true, model, diagnostics }
}
