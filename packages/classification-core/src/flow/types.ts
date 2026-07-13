import type { Diagnostic } from '../contracts/diagnostic.js'
import type { questionModel } from '../generated/question-model.js'

export type QuestionId = typeof questionModel.questions[number]['id']
export type OptionId = typeof questionModel.questions[number]['options'][number]['id']

export type AnswerDraft = Readonly<Partial<Record<QuestionId, readonly OptionId[]>>>
export type DecodedAnswerDraft = Readonly<Record<string, readonly string[]>>
export type CanonicalAnswers = AnswerDraft
export type CompletedAnswers = Readonly<Record<QuestionId, readonly OptionId[]>>

export interface AnswerSubmission {
  readonly questionId: QuestionId
  readonly optionIds: readonly OptionId[]
}

export type DecodeAnswerDraftResult =
  | {
      readonly ok: true
      readonly draft: DecodedAnswerDraft
      readonly diagnostics?: never
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly Diagnostic[]
      readonly draft?: never
    }

export interface ForcedAnswer {
  readonly questionId: QuestionId
  readonly optionIds: readonly OptionId[]
  readonly reason: 'single-allowed-option'
}

export interface FlowRepair {
  readonly code:
    | 'remove-unreachable-answer'
    | 'remove-disallowed-option'
    | 'replace-with-forced-answer'
  readonly questionId: QuestionId
  readonly previousOptionIds: readonly OptionId[]
  readonly canonicalOptionIds?: readonly OptionId[]
}

export interface FlowStateBase {
  readonly canonicalAnswers: CanonicalAnswers
  readonly reachableQuestionIds: readonly QuestionId[]
  readonly interactiveQuestionIds: readonly QuestionId[]
  readonly allowedOptionIdsByQuestion: Readonly<
    Partial<Record<QuestionId, readonly OptionId[]>>
  >
  readonly forcedAnswers: readonly ForcedAnswer[]
  readonly repairs: readonly FlowRepair[]
  readonly diagnostics: readonly Diagnostic[]
}

export type FlowState =
  | (FlowStateBase & { readonly status: 'incomplete'; readonly completedAnswers?: never })
  | (FlowStateBase & { readonly status: 'invalid'; readonly completedAnswers?: never })
  | (FlowStateBase & { readonly status: 'complete'; readonly completedAnswers: CompletedAnswers })

export interface ForcedAnswerChange {
  readonly questionId: QuestionId
  readonly previousOptionIds?: readonly OptionId[]
  readonly nextOptionIds?: readonly OptionId[]
  readonly reason: 'single-allowed-option'
}

export type ApplyAnswerResult =
  | {
      readonly accepted: true
      readonly changed: boolean
      readonly draft: AnswerDraft
      readonly state: FlowState
      readonly invalidatedQuestionIds: readonly QuestionId[]
      readonly forcedChanges: readonly ForcedAnswerChange[]
    }
  | {
      readonly accepted: false
      readonly draft: AnswerDraft
      readonly state: FlowState
      readonly diagnostics: readonly Diagnostic[]
    }
