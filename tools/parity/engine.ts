/** Legacy-shaped answers, so the same scenarios can drive the legacy oracle and the new flow. */
export interface ParityAnswers {
  form?: string | undefined
  archetype?: string | undefined
  tare?: string | undefined
  source: string[]
  body?: string | undefined
  noodle?: string | undefined
  signature: string[]
  exclusions: string[]
}

export interface ParityQuestion {
  id: string
  selectionType: 'single' | 'multiple'
  minSelections: number
  maxSelections: number
}

export interface ParityPosition {
  questionId: string
  answers: ParityAnswers
}

export interface ParityEngine {
  questions(): ParityQuestion[]
  options(questionId: string, answers: ParityAnswers): string[]
  forced(questionId: string, answers: ParityAnswers): string | undefined
  select(questionId: string, answers: ParityAnswers, value: string): ParityAnswers
  settle(answers: ParityAnswers, questionId: string): ParityPosition
  previous(answers: ParityAnswers, questionId: string): string
  canContinue(answers: ParityAnswers, questionId: string): boolean
  complete(answers: ParityAnswers): ParityAnswers | null
}
