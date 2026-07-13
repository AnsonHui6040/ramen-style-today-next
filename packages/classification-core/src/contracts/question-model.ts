export type SerializableCondition =
  | { readonly type: 'answered'; readonly questionId: string }
  | { readonly type: 'answer-includes'; readonly questionId: string; readonly optionId: string }
  | { readonly type: 'all'; readonly conditions: readonly SerializableCondition[] }
  | { readonly type: 'any'; readonly conditions: readonly SerializableCondition[] }
  | { readonly type: 'not'; readonly condition: SerializableCondition }

export type AllowedOptionSelection =
  | { readonly type: 'all' }
  | { readonly type: 'only'; readonly optionIds: readonly string[] }

export interface AllowedOptionDecisionRow {
  readonly when: SerializableCondition
  readonly selection: AllowedOptionSelection
}

export interface QuestionDefinitionSource {
  readonly id: string
  readonly order: number
  readonly messageIds: { readonly title: string; readonly description: string }
  readonly selection: {
    readonly type: 'single' | 'multiple'
    readonly min: number
    readonly max: number
    readonly overrides?: readonly {
      readonly when: SerializableCondition
      readonly min: number
      readonly max: number
    }[]
  }
  readonly availableWhen?: SerializableCondition
  readonly options: readonly OptionDefinitionSource[]
  readonly allowedOptions?: readonly AllowedOptionDecisionRow[]
  readonly autoAnswer?: {
    readonly type: 'single-allowed-option'
    readonly when?: SerializableCondition
  }
  readonly initialUiOptionIds?: readonly string[]
  readonly pendingSelection?: {
    readonly emptyBehavior:
      | { readonly type: 'allow-empty' }
      | { readonly type: 'restore-initial-ui-options' }
  }
  readonly weight?: number
}

export interface OptionDefinitionSource {
  readonly id: string
  readonly order: number
  readonly messageIds: { readonly label: string; readonly description?: string }
  readonly availableWhen?: SerializableCondition
  readonly exclusive?: boolean
}

export interface CompiledOption {
  readonly id: string
  readonly order: number
  readonly messageIds: { readonly label: string; readonly description?: string }
  readonly availableWhen?: SerializableCondition
  readonly exclusive: boolean
}

export interface CompiledQuestion {
  readonly id: string
  readonly order: number
  readonly messageIds: { readonly title: string; readonly description: string }
  readonly selection: {
    readonly type: 'single' | 'multiple'
    readonly min: number
    readonly max: number
    readonly overrides: readonly {
      readonly when: SerializableCondition
      readonly min: number
      readonly max: number
    }[]
  }
  readonly availableWhen?: SerializableCondition
  readonly options: readonly CompiledOption[]
  readonly allowedOptions: readonly AllowedOptionDecisionRow[]
  readonly autoAnswer?: {
    readonly type: 'single-allowed-option'
    readonly when?: SerializableCondition
  }
  readonly initialUiOptionIds: readonly string[]
  readonly pendingSelection: {
    readonly emptyBehavior:
      | { readonly type: 'allow-empty' }
      | { readonly type: 'restore-initial-ui-options' }
  }
  readonly validSelectionKeys: readonly string[]
  readonly weight?: number
}

export interface CompiledQuestionModelMetadata {
  readonly schemaVersion: string
  readonly compilerVersion: string
  readonly modelVersion: string
  readonly sourceHash: string
  readonly semanticHash: string
}

export interface CompiledQuestionModel {
  readonly metadata: CompiledQuestionModelMetadata
  readonly questions: readonly CompiledQuestion[]
  readonly semanticDependencies: Readonly<Record<string, readonly string[]>>
  readonly dependentClosures: Readonly<Record<string, readonly string[]>>
  readonly topologicalOrder: readonly string[]
  readonly forcedIterationUpperBound: number
}
