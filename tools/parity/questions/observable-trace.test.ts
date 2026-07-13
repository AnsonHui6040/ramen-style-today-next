import { describe, expect, test } from 'vitest'

import {
  compileQuestions,
  questionDefinitions,
} from '@ramen-style/classification-core/compiler'
import {
  deriveObservableCoverage,
  legacyObservableSeedCaseSchema,
} from './contracts.js'
import {
  executeObservableTrace,
  projectDisabledOptionIds,
} from './observable-trace.js'
import {
  expectedCase,
  formContinueActions,
  maxSelectionActions,
  maxSelectionBlockedOptionId,
  rejectedContinueActions,
  unchangedToggleActions,
} from './test-fixtures.js'

const compilation = compileQuestions(questionDefinitions)
if (!compilation.ok) throw new Error('production question definitions must compile')
const questionModel = compilation.model

describe('observable runtime projection', () => {
  test('executes seed actions and projects observable trace fields only', () => {
    const trace = executeObservableTrace(questionModel, expectedCase.actions)
    expect(trace.frames[0]).toMatchObject({
      transition: 'initial',
      displayedQuestionId: 'form',
    })
    const serialized = JSON.stringify(trace)
    for (const forbidden of [
      'canonicalAnswers', 'reachableQuestionIds', 'interactiveQuestionIds',
      'allowedOptionIdsByQuestion', 'repairs', 'diagnostics',
      'invalidatedQuestionIds', 'accepted', 'dependencyClosures',
      'fixedPointIterations',
    ]) expect(serialized).not.toContain(`"${forbidden}"`)
  })

  test('keeps select pending and projects its legacy-shaped answer', () => {
    const trace = executeObservableTrace(questionModel, [formContinueActions[0]])
    const actionFrames = trace.frames.filter(({ actionIndex }) => actionIndex === 0)
    expect(actionFrames.map(({ transition }) => transition)).toEqual(['toggle'])
    expect(actionFrames[0]!.pendingOptionIds).toEqual(['soup'])
    expect(actionFrames[0]!.legacyAnswers).toMatchObject({ form: 'soup' })
  })

  test('projects maximum-selection blocked state without a disabled action', () => {
    const trace = executeObservableTrace(questionModel, maxSelectionActions)
    expect(maxSelectionActions).not.toContainEqual({
      type: 'select',
      questionId: 'source',
      optionId: maxSelectionBlockedOptionId,
    })
    const selectActionIndex = maxSelectionActions.findLastIndex(
      (action) => action.type === 'select' && action.questionId === 'source',
    )
    const toggle = trace.frames.find((frame) =>
      frame.actionIndex === selectActionIndex && frame.transition === 'toggle',
    )
    if (!toggle) throw new Error('missing source select toggle')
    const before = trace.frames[toggle.sequence - 1]
    if (!before) throw new Error('missing pre-select frame')
    expect(before.visibleOptionIds).toContain(maxSelectionBlockedOptionId)
    expect(toggle.visibleOptionIds).toContain(maxSelectionBlockedOptionId)
    expect(before.disabledOptionIds).toEqual([])
    expect(toggle.disabledOptionIds).toContain(maxSelectionBlockedOptionId)
    expect(toggle.pendingOptionIds).not.toContain(maxSelectionBlockedOptionId)
    expect(deriveObservableCoverage({
      actions: maxSelectionActions,
      frames: trace.frames,
    })).toContain('behavior:max-selection-blocked')
  })

  test('projects the exact compiled disabled-option predicate', () => {
    expect(projectDisabledOptionIds(
      ['pork', 'chicken', 'duck', 'none'],
      ['pork', 'chicken'],
      ['none'],
      2,
    )).toEqual(['duck'])
    expect(projectDisabledOptionIds(
      ['pork', 'chicken', 'duck', 'none'],
      ['none'],
      ['none'],
      1,
    )).toEqual([])
  })

  test('rejects an unchanged toggle as not legacy-representable', () => {
    expect(() => executeObservableTrace(questionModel, unchangedToggleActions))
      .toThrow('PARITY_SEED_NOT_LEGACY_REPRESENTABLE')
  })

  test('maps one continue action to submit then one terminal transition', () => {
    const trace = executeObservableTrace(questionModel, formContinueActions)
    const actionFrames = trace.frames.filter(({ actionIndex }) => actionIndex === 1)
    expect(actionFrames.map(({ transition }) => transition)).toEqual(['submit', 'next'])
    expect(actionFrames.every(({ actionIndex }) => actionIndex === 1)).toBe(true)
  })

  test('rejects continue when applyAnswer cannot represent the legacy action', () => {
    expect(() => executeObservableTrace(questionModel, rejectedContinueActions))
      .toThrow('seed is not legacy-representable')
  })

  test('freezes mechanically derived coverage, never seed coverage', () => {
    expect(expectedCase.coverageTags).toEqual(deriveObservableCoverage({
      actions: expectedCase.actions,
      frames: expectedCase.frames,
    }))
    expect(legacyObservableSeedCaseSchema.safeParse({
      id: expectedCase.id,
      actions: expectedCase.actions,
      coverageTags: expectedCase.coverageTags,
    }).success).toBe(false)
  })
})
