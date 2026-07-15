import { describe, expect, test } from 'vitest'
import { questionModel } from '../generated/question-model.js'
import { evaluateFlow } from '../flow/evaluate.js'
import {
  chintanDraft,
  completeSoupDraft,
  misoRichDraft,
} from '../flow/test-fixtures.js'
import type { SuccessfulFlowState } from './contracts.js'
import { PersistenceInvariantError } from './invariant-error.js'
import { resolveResumeQuestion } from './resume.js'

describe('resolveResumeQuestion', () => {
  test('uses no cursor for a complete state', () => {
    expect(resolveResumeQuestion(
      questionModel,
      evaluateFlow(questionModel, completeSoupDraft) as SuccessfulFlowState,
      undefined,
    )).toEqual({
      resumeQuestionId: undefined,
      repairs: [],
    })
  })

  test('removes a cursor from a complete state', () => {
    expect(resolveResumeQuestion(
      questionModel,
      evaluateFlow(questionModel, completeSoupDraft) as SuccessfulFlowState,
      'exclusions',
    )).toEqual({
      resumeQuestionId: undefined,
      repairs: [{
        code: 'normalize-cursor',
        beforeCursorQuestionId: 'exclusions',
      }],
    })
  })

  test('drops an unknown bounded cursor and resumes at the first actionable question', () => {
    expect(resolveResumeQuestion(
      questionModel,
      evaluateFlow(questionModel, {}) as SuccessfulFlowState,
      'future-question',
    )).toEqual({
      resumeQuestionId: 'form',
      repairs: [{
        code: 'drop-unknown-cursor',
        beforeCursorQuestionId: 'future-question',
      }],
    })
  })

  test('normalizes a known forced cursor after final evaluation', () => {
    expect(resolveResumeQuestion(
      questionModel,
      evaluateFlow(questionModel, misoRichDraft) as SuccessfulFlowState,
      'tare',
    )).toEqual({
      resumeQuestionId: 'source',
      repairs: [{
        code: 'normalize-cursor',
        beforeCursorQuestionId: 'tare',
        afterCursorQuestionId: 'source',
      }],
    })
  })

  test('normalizes a known unreachable cursor', () => {
    expect(resolveResumeQuestion(
      questionModel,
      evaluateFlow(questionModel, {}) as SuccessfulFlowState,
      'archetype',
    )).toEqual({
      resumeQuestionId: 'form',
      repairs: [{
        code: 'normalize-cursor',
        beforeCursorQuestionId: 'archetype',
        afterCursorQuestionId: 'form',
      }],
    })
  })

  test('retains a usable interactive cursor when no earlier question is actionable', () => {
    expect(resolveResumeQuestion(
      questionModel,
      evaluateFlow(questionModel, chintanDraft) as SuccessfulFlowState,
      'tare',
    )).toEqual({
      resumeQuestionId: 'tare',
      repairs: [],
    })
  })

  test('prefers an earlier missing actionable question over a later usable cursor', () => {
    expect(resolveResumeQuestion(
      questionModel,
      evaluateFlow(questionModel, {}) as SuccessfulFlowState,
      'exclusions',
    )).toEqual({
      resumeQuestionId: 'form',
      repairs: [{
        code: 'normalize-cursor',
        beforeCursorQuestionId: 'exclusions',
        afterCursorQuestionId: 'form',
      }],
    })
  })

  test('deep-freezes the exact resolution', () => {
    const resolution = resolveResumeQuestion(
      questionModel,
      evaluateFlow(questionModel, {}) as SuccessfulFlowState,
      'future-question',
    )

    expect(Object.isFrozen(resolution)).toBe(true)
    expect(Object.isFrozen(resolution.repairs)).toBe(true)
    expect(Object.isFrozen(resolution.repairs[0])).toBe(true)
  })

  test('throws a bounded invariant for an incomplete state with no actionable target', () => {
    const evaluated = evaluateFlow(questionModel, {})
    const inconsistent = {
      ...evaluated,
      interactiveQuestionIds: [],
    } as unknown as SuccessfulFlowState
    let caught: unknown

    try {
      resolveResumeQuestion(questionModel, inconsistent, undefined)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(PersistenceInvariantError)
    expect(caught).toMatchObject({
      invariantCode: 'PERSISTENCE_RESUME_INCONSISTENT',
    })
    expect((caught as Error).message.length).toBeLessThanOrEqual(300)
  })

  test('throws an invariant when the first actionable question is unreachable', () => {
    const evaluated = evaluateFlow(questionModel, {})
    const inconsistent = {
      ...evaluated,
      reachableQuestionIds: [],
    } as unknown as SuccessfulFlowState

    expect(() => resolveResumeQuestion(
      questionModel,
      inconsistent,
      undefined,
    )).toThrowError(expect.objectContaining({
      invariantCode: 'PERSISTENCE_RESUME_INCONSISTENT',
    }))
  })
})
