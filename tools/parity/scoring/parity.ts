import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  classificationModel,
  scoreCompletedAnswers,
  type ScoringOutcome,
} from '@ramen-style/classification-core'

import type { LegacyScoringObservation } from './contracts.js'
import { loadVerifiedScoringFixtureSet } from './verify-fixtures.js'

interface Mismatch {
  readonly pointer: string
  readonly expected: string
  readonly received: string
}

const maximumDisplayedMismatches = 20
const compareStableIds = (left: string, right: string) => (
  left < right ? -1 : left > right ? 1 : 0
)

function compact(value: unknown) {
  const text = JSON.stringify(value)
  if (text === undefined) return '<undefined>'
  let result = ''
  let count = 0
  for (const character of text) {
    if (count >= 160) return `${result}…`
    result += character
    count += 1
  }
  return result
}

function collectMismatches(
  expected: unknown,
  received: unknown,
  pointer: string,
  output: Mismatch[],
) {
  if (output.length >= maximumDisplayedMismatches) return
  if (Object.is(expected, received)) return
  if (Array.isArray(expected) && Array.isArray(received)) {
    if (expected.length !== received.length) {
      output.push({
        pointer: `${pointer}/length`,
        expected: String(expected.length),
        received: String(received.length),
      })
    }
    for (let index = 0; index < Math.max(expected.length, received.length); index += 1) {
      collectMismatches(expected[index], received[index], `${pointer}/${index}`, output)
    }
    return
  }
  if (
    expected && received
    && typeof expected === 'object'
    && typeof received === 'object'
    && !Array.isArray(expected)
    && !Array.isArray(received)
  ) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(received)])
    for (const key of [...keys].sort()) {
      collectMismatches(
        (expected as Record<string, unknown>)[key],
        (received as Record<string, unknown>)[key],
        `${pointer}/${key}`,
        output,
      )
    }
    return
  }
  output.push({ pointer, expected: compact(expected), received: compact(received) })
}

function adjustmentProjection(
  line: ScoringOutcome['trace']['styleCandidates'][number]['coreCandidates'][number]['adjustmentLines'][number],
) {
  return {
    id: line.id,
    status: line.status,
    matchedConditionPriorities: line.conditions.flatMap(({ matched }, priority) => (
      matched ? [priority] : []
    )),
    matchedCount: line.matchedCount,
    requiredMatchCount: line.requiredMatchCount,
    matchRatio: line.matchRatio,
    requestedPoints: line.requestedPoints,
    appliedPoints: line.appliedPoints,
  }
}

function projectCurrentCase(
  legacy: LegacyScoringObservation,
  outcome: ScoringOutcome,
) {
  const styleById = new Map<
    string,
    ScoringOutcome['trace']['styleCandidates'][number]
  >(outcome.trace.styleCandidates.map((style) => [style.styleId, style]))
  const coreById = new Map<
    string,
    ScoringOutcome['trace']['styleCandidates'][number]['coreCandidates'][number]
  >(outcome.trace.styleCandidates.flatMap((style) => (
    style.coreCandidates.map((core) => [core.coreId, core] as const)
  )))
  const noodleId = legacy.answers.noodle[0]
  const coreCandidates = legacy.coreCandidates.map((expectedCore) => {
    const core = coreById.get(expectedCore.coreId)
    if (!core) return { missingCoreId: expectedCore.coreId }
    return {
      styleId: core.styleId,
      coreId: core.coreId,
      corePriority: core.corePriority,
      subtypeId: `${core.coreId}:${noodleId}`,
      score: core.finalTotal,
      rankingKeys: core.rankingKeys,
      questionLines: core.questionLines.map((line) => ({
        questionId: line.questionId,
        answerOptionIds: line.answerOptionIds,
        tier: line.tier,
        ratio: line.ratio,
        weight: line.weight,
        rawPoints: line.rawPoints,
        points: line.points,
      })),
      bonusLines: core.adjustmentLines
        .filter(({ kind }) => kind === 'bonus')
        .map(adjustmentProjection),
      conflictLines: core.adjustmentLines
        .filter(({ kind }) => kind === 'conflict')
        .map(adjustmentProjection),
    }
  })

  const collapseDecisions: Array<Record<string, unknown>> = []
  const sourceOrderedStyles = [...outcome.trace.styleCandidates]
    .sort((left, right) => (
      left.displayPriority - right.displayPriority
      || compareStableIds(left.styleId, right.styleId)
    ))
  for (const style of sourceOrderedStyles) {
    let previous: typeof style.coreCandidates[number] | undefined
    const sourceOrderedCores = [...style.coreCandidates]
      .sort((left, right) => (
        left.corePriority - right.corePriority
        || compareStableIds(left.coreId, right.coreId)
      ))
    for (const core of sourceOrderedCores) {
      const selected = !previous || core.finalTotal > previous.finalTotal
      collapseDecisions.push({
        styleId: style.styleId,
        coreId: core.coreId,
        corePriority: core.corePriority,
        score: core.finalTotal,
        previousCoreId: previous?.coreId ?? null,
        selected,
      })
      if (selected) previous = core
    }
  }

  const displayed = [...outcome.results, ...outcome.alternativeResults]
  const confidenceObservations = displayed.map((result) => {
    const confidence = result.trace.confidence
    if (!confidence) return { missingConfidence: result.styleId }
    return {
      styleId: result.styleId,
      score: confidence.score,
      nextScore: confidence.nextScore,
      base: confidence.base,
      gapBoostBeforeCap: confidence.gapBoostBeforeCap,
      gapBoost: confidence.gapBoost,
      uncertaintyPenalty: confidence.uncertaintyTotal,
      rawConfidence: confidence.rawConfidence,
      confidence: confidence.confidence,
    }
  })

  const low = outcome.trace.lowConfidence
  return {
    id: legacy.id,
    answers: legacy.answers,
    coreCandidates,
    ranking: {
      styleCandidates: legacy.ranking.styleCandidates.map(({ styleId }) => {
        const style = styleById.get(styleId)
        if (!style) return { missingStyleId: styleId }
        const core = style.coreCandidates.find(({ coreId }) => coreId === style.selectedCoreId)
        return {
          styleId: style.styleId,
          family: style.family,
          displayPriority: style.displayPriority,
          coreId: style.selectedCoreId,
          subtypeId: style.subtypeResolution.selectedSubtypeId,
          score: style.rankingKeys.score,
          coreRankingKeys: core?.rankingKeys,
          styleRankingKeys: style.rankingKeys,
        }
      }),
      primaryStyleIds: outcome.trace.primaryRanking.map(({ styleId }) => styleId),
      alternativeStyleIds: outcome.trace.alternativeRanking.map(({ styleId }) => styleId),
      displayedPrimary: outcome.results.map((result) => ({
        styleId: result.styleId,
        score: result.score,
        confidence: result.confidence,
      })),
      displayedAlternative: outcome.alternativeResults.map((result) => ({
        styleId: result.styleId,
        score: result.score,
        confidence: result.confidence,
      })),
      collapseDecisions,
      confidenceObservations,
      lowConfidenceInputs: {
        hasPrimaryResult: low.hasPrimaryResult,
        topConfidence: low.topConfidence,
        confidenceThreshold: low.confidenceThreshold,
        confidenceBelowThreshold: low.confidenceBelowThreshold,
        topScore: low.topScore,
        secondScore: low.secondScore,
        scoreGap: low.scoreGap,
        scoreGapThreshold: low.scoreGapThreshold,
        scoreGapBelowThreshold: low.scoreGapBelowThreshold,
      },
      lowConfidence: low.lowConfidence,
    },
  }
}

export type ScoringParityResult =
  | {
      readonly status: 'pass'
      readonly mismatchCount: 0
      readonly waiverCount: 0
      readonly caseCount: number
      readonly coreCount: number
      readonly questionLineCount: number
      readonly adjustmentLineCount: number
      readonly casesHash: string
    }
  | {
      readonly status: 'fail'
      readonly mismatchCount: number
      readonly waiverCount: 0
      readonly mismatches: readonly Mismatch[]
      readonly casesHash: string
    }

export function runScoringParity(): ScoringParityResult {
  const fixture = loadVerifiedScoringFixtureSet()
  const mismatches: Mismatch[] = []
  let mismatchCount = 0
  for (const legacy of fixture.cases) {
    const scored = scoreCompletedAnswers(classificationModel, legacy.answers)
    if (!scored.ok) {
      mismatchCount += 1
      if (mismatches.length < maximumDisplayedMismatches) mismatches.push({
        pointer: `/cases/${legacy.id}`,
        expected: 'valid-scoring-outcome',
        received: 'scoring-failure',
      })
      continue
    }
    const caseMismatches: Mismatch[] = []
    collectMismatches(
      legacy,
      projectCurrentCase(legacy, scored.outcome),
      `/cases/${legacy.id}`,
      caseMismatches,
    )
    mismatchCount += caseMismatches.length
    mismatches.push(...caseMismatches.slice(0, maximumDisplayedMismatches - mismatches.length))
  }
  if (mismatchCount > 0) return Object.freeze({
    status: 'fail' as const,
    mismatchCount,
    waiverCount: 0 as const,
    mismatches: Object.freeze(mismatches),
    casesHash: fixture.verification.casesHash,
  })
  return Object.freeze({
    status: 'pass' as const,
    mismatchCount: 0 as const,
    waiverCount: 0 as const,
    caseCount: fixture.cases.length,
    coreCount: fixture.cases.length * 54,
    questionLineCount: fixture.verification.coreLineCount,
    adjustmentLineCount: fixture.verification.adjustmentLineCount,
    casesHash: fixture.verification.casesHash,
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runScoringParity()
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (result.status === 'fail') process.exitCode = 1
  } catch {
    process.stderr.write('scoring parity verification failed\n')
    process.exitCode = 1
  }
}
