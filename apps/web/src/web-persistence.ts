import {
  classificationModel,
  evaluateFlow,
  questionModel,
  type AnswerDraft,
  type QuestionId,
} from '@ramen-style/classification-core'

export const webStateStorageKey = 'ramen-style-today-next:web-state:v1'

export interface StorageLike {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

export interface RestoredWebState {
  readonly draft: AnswerDraft
  readonly currentQuestionId?: QuestionId
  readonly completed: boolean
  readonly updatedAt: string
}

interface StoredWebStateV1 {
  readonly schemaVersion: 1
  readonly classificationDataVersion: string
  readonly answerDraft: AnswerDraft
  readonly currentQuestionId: QuestionId | null
  readonly completed: boolean
  readonly updatedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function saveWebState(
  storage: StorageLike,
  input: {
    draft: AnswerDraft
    currentQuestionId?: QuestionId
    completed: boolean
    updatedAt?: string
  },
) {
  const flow = evaluateFlow(questionModel, input.draft)
  if (flow.status === 'invalid' || input.completed !== (flow.status === 'complete')) {
    return { ok: false as const, code: 'WEB_STATE_INVALID' as const }
  }
  const payload: StoredWebStateV1 = {
    schemaVersion: 1,
    classificationDataVersion: classificationModel.dataVersion,
    answerDraft: flow.canonicalAnswers,
    currentQuestionId: input.currentQuestionId ?? null,
    completed: input.completed,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  }
  storage.setItem(webStateStorageKey, JSON.stringify(payload))
  return { ok: true as const }
}

export function restoreWebState(storage: StorageLike):
  | { readonly ok: true; readonly state: RestoredWebState }
  | { readonly ok: false; readonly code: 'WEB_STATE_MISSING' | 'WEB_STATE_INVALID' } {
  const raw = storage.getItem(webStateStorageKey)
  if (raw === null) return { ok: false, code: 'WEB_STATE_MISSING' }
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value)
      || value.schemaVersion !== 1
      || value.classificationDataVersion !== classificationModel.dataVersion
      || !isRecord(value.answerDraft)
      || typeof value.completed !== 'boolean'
      || typeof value.updatedAt !== 'string'
      || Number.isNaN(Date.parse(value.updatedAt))
      || !(value.currentQuestionId === null || typeof value.currentQuestionId === 'string')) {
      return { ok: false, code: 'WEB_STATE_INVALID' }
    }
    const flow = evaluateFlow(questionModel, value.answerDraft)
    if (flow.status === 'invalid' || value.completed !== (flow.status === 'complete')) {
      return { ok: false, code: 'WEB_STATE_INVALID' }
    }
    const questionIds = new Set(questionModel.questions.map(({ id }) => id))
    const currentQuestionId = value.currentQuestionId
    if (currentQuestionId !== null && !questionIds.has(currentQuestionId as QuestionId)) {
      return { ok: false, code: 'WEB_STATE_INVALID' }
    }
    return {
      ok: true,
      state: {
        draft: flow.canonicalAnswers,
        ...(currentQuestionId === null
          ? {}
          : { currentQuestionId: currentQuestionId as QuestionId }),
        completed: value.completed,
        updatedAt: value.updatedAt,
      },
    }
  } catch {
    return { ok: false, code: 'WEB_STATE_INVALID' }
  }
}

export function clearWebState(storage: StorageLike) {
  storage.removeItem(webStateStorageKey)
}
