import type { DefinitionBundleSource } from '../compiler/source-schema.js'

export type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T

export type ConceptKind = 'question' | 'option' | 'style' | 'intensity' | 'noodle' | 'policy'
export type ConceptKey = `${ConceptKind}/${string}`

export interface ConceptRecord {
  readonly key: ConceptKey
  readonly kind: ConceptKind
  readonly id: string
  readonly sourceFile: string
  readonly messageIds: readonly string[]
}

export interface ClassificationModel {
  readonly mode: DefinitionBundleSource['mode']
  readonly modelVersion: string
  readonly dataVersion: string
  readonly questions: DeepReadonly<DefinitionBundleSource['questions']>
  readonly styles: DeepReadonly<DefinitionBundleSource['styles']>
  readonly policy: DeepReadonly<DefinitionBundleSource['policy']>
  readonly inventory: readonly ConceptRecord[]
}
