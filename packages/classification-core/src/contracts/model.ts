import type { DeepReadonly } from './deep-freeze.js'
import type { CompiledQuestion } from './question-model.js'
import type { ClassificationSourceProvenance } from './provenance.js'
import type { CompiledStyleModel } from './style-model.js'
import type { DefinitionBundleSource } from '../compiler/source-schema.js'

export type { DeepReadonly } from './deep-freeze.js'

export type ConceptKind = 'question' | 'option' | 'style' | 'intensity' | 'noodle' | 'policy'
export type ConceptKey = `${ConceptKind}/${string}`

export interface ConceptRecord {
  readonly key: ConceptKey
  readonly kind: ConceptKind
  readonly id: string
  readonly ownerQuestionId?: string
  readonly sourceFile: string
  readonly messageIds: readonly string[]
}

export interface ClassificationModel {
  readonly modelVersion: string
  readonly dataVersion: string
  readonly provenance: DeepReadonly<ClassificationSourceProvenance>
  readonly questions: DeepReadonly<readonly CompiledQuestion[]>
  readonly styleModel: CompiledStyleModel
  readonly policy: DeepReadonly<DefinitionBundleSource['policy']>
  readonly inventory: readonly ConceptRecord[]
}
