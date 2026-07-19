import { describe, expect, test } from 'vitest'

import { evaluateCoreRuleLines } from './rules.js'
import {
  classificationModel,
  cloneClassificationModel,
  completedAnswers,
} from './test-fixtures.js'

describe('scoring rule lines', () => {
  test('emits seven policy-ordered fixed-point lines with tier precedence', () => {
    const core = classificationModel.styleModel.styles[0]!.cores[0]!
    const lines = evaluateCoreRuleLines(
      classificationModel.policy,
      core,
      completedAnswers,
    )

    expect(lines).toHaveLength(7)
    expect(lines.map(({ questionPriority }) => questionPriority)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(lines.every(({ points }) => Number.isFinite(points))).toBe(true)
    expect(lines.find(({ questionId }) => questionId === 'source')).toMatchObject({
      answerOptionIds: ['pork', 'chicken'],
      tier: expect.stringMatching(/^(exact|adjacent|partial|miss)$/),
    })
    const allLines = classificationModel.styleModel.styles.flatMap((style) => (
      style.cores.flatMap((candidate) => evaluateCoreRuleLines(
        classificationModel.policy,
        candidate,
        completedAnswers,
      ))
    ))
    expect(new Set(allLines.map(({ tier }) => tier))).toEqual(new Set([
      'exact',
      'adjacent',
      'partial',
      'miss',
    ]))
    for (const line of allLines) {
      expect(line.rawPoints).toBe(line.weight * line.ratio)
      expect(Number.isInteger(line.points * 10)).toBe(true)
    }
    expect(allLines.find(({ tier }) => tier === 'miss')).toMatchObject({
      matchedOptionIds: [],
      ratio: 0,
      points: 0,
    })
  })

  test('fails closed when trusted rule coverage is duplicated', () => {
    const model = cloneClassificationModel()
    const core = model.styleModel.styles[0]!.cores[0]!
    ;(core.rules as unknown as Array<(typeof core.rules)[number]>).push(core.rules[0]!)
    expect(() => evaluateCoreRuleLines(model.policy, core, completedAnswers)).toThrow()
  })
})
