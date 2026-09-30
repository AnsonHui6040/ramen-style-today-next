import type { ClassificationModel } from '../contracts/model.js'

export type FlowQuestion = ClassificationModel['questions'][number]

/** Selected option IDs per question ID. A missing or empty entry means unanswered. */
export type FlowAnswers = Readonly<Record<string, readonly string[]>>

export interface FlowPosition {
  readonly questionId: string
  readonly answers: FlowAnswers
}
