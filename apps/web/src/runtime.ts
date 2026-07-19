import {
  classificationModel,
  evaluateEligibility,
  evaluateFlow,
  questionModel,
  scoreCompletedAnswers,
  type AnswerDraft,
  type EligibilityOutcome,
  type FlowState,
  type ScoringOutcome,
} from '@ramen-style/classification-core'

export type RuntimeComposition =
  | {
      readonly ok: true
      readonly flow: FlowState & { readonly status: 'complete' }
      readonly scoring: ScoringOutcome
      readonly eligibility: EligibilityOutcome
    }
  | {
      readonly ok: false
      readonly stage: 'flow' | 'scoring' | 'eligibility'
      readonly message: string
    }

export function composeRuntimeResult(draft: AnswerDraft): RuntimeComposition {
  const flow = evaluateFlow(questionModel, draft)
  if (flow.status !== 'complete') {
    return { ok: false, stage: 'flow', message: '問卷尚未完成，無法產生結果。' }
  }
  const scored = scoreCompletedAnswers(classificationModel, flow.completedAnswers)
  if (!scored.ok) {
    return { ok: false, stage: 'scoring', message: '無法計算這組答案，請重新作答。' }
  }
  const eligible = evaluateEligibility(
    classificationModel,
    flow.completedAnswers,
    scored.outcome,
  )
  if (!eligible.ok) {
    return { ok: false, stage: 'eligibility', message: '無法完成排除條件檢查。' }
  }
  return {
    ok: true,
    flow,
    scoring: scored.outcome,
    eligibility: eligible.outcome,
  }
}
