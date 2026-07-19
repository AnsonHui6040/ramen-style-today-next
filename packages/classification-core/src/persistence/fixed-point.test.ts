import { describe, expect, test } from 'vitest'
import {
  completeSoupDraft,
  misoRichDraft,
} from '../flow/test-fixtures.js'
import type { AnswerDraft } from '../flow/types.js'
import {
  createStoredClassificationPayloadV1,
  sameStoredClassificationPayloadV1,
} from './create-payload.js'
import type {
  ClassificationRestoreSource,
  StoredClassificationPayloadV1,
} from './contracts.js'
import { restoreClassification } from './restore.js'
import {
  currentV1,
  questionModel,
  verifiedLegacySourceId,
} from './test-fixtures.js'

function versioned(payload: unknown): ClassificationRestoreSource {
  return { kind: 'versioned', payload }
}

function legacy(answers: unknown): ClassificationRestoreSource {
  return {
    kind: 'legacy-unversioned',
    sourceId: verifiedLegacySourceId,
    answers,
  }
}

function expectBuilderRestoreFixedPoint(
  submittedAnswers: AnswerDraft,
  cursorQuestionId?: 'tare',
): void {
  const created = createStoredClassificationPayloadV1(
    questionModel,
    submittedAnswers,
    cursorQuestionId,
  )

  expect(created.status).toBe('created')
  if (created.status !== 'created') return
  const restored = restoreClassification(questionModel, versioned(created.payload))
  expect(restored).toMatchObject({
    status: 'restored',
    writeBackRequired: false,
    migrations: [],
    repairs: [],
    changes: [],
    submittedAnswers: created.payload.submittedAnswers,
  })
  if (restored.status !== 'restored') return
  expect(restored.resumeQuestionId).toBe(cursorQuestionId ?? (
    restored.flowState.status === 'incomplete' ? 'tare' : undefined
  ))

  const rebuilt = createStoredClassificationPayloadV1(
    questionModel,
    created.payload.submittedAnswers,
    created.payload.cursorQuestionId,
  )
  expect(rebuilt).toEqual(created)
}

describe('persistence payload fixed points', () => {
  test('round-trips canonical incomplete payloads with and without a cursor', () => {
    const draft = {
      form: ['soup'],
      archetype: ['chintan'],
    } as AnswerDraft

    expectBuilderRestoreFixedPoint(draft)
    expectBuilderRestoreFixedPoint(draft, 'tare')
  })

  test('round-trips a complete payload without a cursor', () => {
    expectBuilderRestoreFixedPoint(completeSoupDraft)
  })

  test.each([
    ['legacy migration', legacy({ form: 'soup' })],
    ['answer and cursor repair', versioned(currentV1({
      cursorQuestionId: 'tare',
      submittedAnswers: {
        ...misoRichDraft,
        tare: ['miso'],
      },
    }))],
    ['complete cursor removal', versioned(currentV1({
      cursorQuestionId: 'exclusions',
      submittedAnswers: completeSoupDraft,
    }))],
  ] as const)('uses builder output for normalized %s fixed points', (_case, source) => {
    const first = restoreClassification(
      questionModel,
      source as ClassificationRestoreSource,
    )

    expect(first.status).toBe('restored-with-changes')
    if (first.status !== 'restored-with-changes') return
    const rebuilt = createStoredClassificationPayloadV1(
      questionModel,
      first.submittedAnswers,
      first.normalizedPayload.cursorQuestionId,
    )
    expect(rebuilt).toEqual({ status: 'created', payload: first.normalizedPayload })

    const second = restoreClassification(
      questionModel,
      versioned(first.normalizedPayload),
    )
    expect(second).toMatchObject({
      status: 'restored',
      writeBackRequired: false,
      migrations: [],
      repairs: [],
      changes: [],
      submittedAnswers: first.submittedAnswers,
      flowState: first.flowState,
    })
    if (second.status !== 'restored') return
    expect(second.resumeQuestionId).toBe(first.resumeQuestionId)
  })

  test('ignores object insertion order in current V1 comparison', () => {
    const source = versioned({
      submittedAnswers: {
        source: ['pork', 'chicken'],
        archetype: ['chintan'],
        form: ['soup'],
      },
      questionSemanticHash: questionModel.metadata.semanticHash,
      schemaVersion: 1,
      questionModelVersion: questionModel.metadata.modelVersion,
    })
    const result = restoreClassification(questionModel, source)

    expect(result).toMatchObject({
      status: 'restored',
      writeBackRequired: false,
      migrations: [],
      repairs: [],
      changes: [],
    })
  })

  test('compares every formal V1 field and rejects non-schema fields', () => {
    const created = createStoredClassificationPayloadV1(
      questionModel,
      completeSoupDraft,
    )
    expect(created.status).toBe('created')
    if (created.status !== 'created') return
    const payload = created.payload
    const reordered = {
      submittedAnswers: Object.fromEntries(
        Object.entries(payload.submittedAnswers).reverse(),
      ),
      questionSemanticHash: payload.questionSemanticHash,
      schemaVersion: payload.schemaVersion,
      questionModelVersion: payload.questionModelVersion,
    } as StoredClassificationPayloadV1

    expect(sameStoredClassificationPayloadV1(payload, reordered)).toBe(true)
    expect(sameStoredClassificationPayloadV1(payload, {
      ...payload,
      schemaVersion: 2,
    } as unknown as StoredClassificationPayloadV1)).toBe(false)
    expect(sameStoredClassificationPayloadV1(payload, {
      ...payload,
      questionModelVersion: 'future-model',
    })).toBe(false)
    expect(sameStoredClassificationPayloadV1(payload, {
      ...payload,
      questionSemanticHash: 'a'.repeat(64),
    })).toBe(false)
    expect(sameStoredClassificationPayloadV1(payload, {
      ...payload,
      cursorQuestionId: 'exclusions',
    })).toBe(false)
    expect(sameStoredClassificationPayloadV1(payload, {
      ...payload,
      submittedAnswers: {
        ...payload.submittedAnswers,
        exclusions: undefined,
      } as unknown as AnswerDraft,
    })).toBe(false)
    expect(sameStoredClassificationPayloadV1(payload, {
      ...payload,
      submittedAnswers: {
        ...payload.submittedAnswers,
        source: ['chicken'],
      },
    })).toBe(false)
    expect(sameStoredClassificationPayloadV1(payload, {
      ...payload,
      transportMetadata: 'ignored only before closed-schema decoding',
    } as StoredClassificationPayloadV1)).toBe(false)
  })

  test('canonicalizes selection order once and then restores without changes', () => {
    const first = restoreClassification(questionModel, versioned(currentV1({
      submittedAnswers: {
        form: ['soup'],
        archetype: ['chintan'],
        source: ['chicken', 'pork'],
      },
    })))

    expect(first).toMatchObject({
      status: 'restored-with-changes',
      repairs: [{ code: 'canonicalize-answer-order' }],
      writeBackRequired: true,
      normalizedPayload: {
        submittedAnswers: { source: ['pork', 'chicken'] },
      },
    })
    if (first.status !== 'restored-with-changes') return
    const second = restoreClassification(
      questionModel,
      versioned(first.normalizedPayload),
    )
    expect(second).toMatchObject({
      status: 'restored',
      writeBackRequired: false,
      changes: [],
    })
  })
})
