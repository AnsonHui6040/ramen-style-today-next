import { compareCodePoints } from '../contracts/source-path.js'
import type { CompiledScoringPolicy } from '../contracts/scoring-policy.js'
import type {
  RankingTraceEntry,
  StyleScoreTrace,
} from '../contracts/scoring.js'
import type { CompletedAnswers } from '../flow/types.js'
import { ScoringInvariantError } from './trace.js'

export interface RankedStyleCandidates {
  readonly styleCandidates: readonly StyleScoreTrace[]
  readonly primaryRanking: readonly RankingTraceEntry[]
  readonly alternativeRanking: readonly RankingTraceEntry[]
  readonly selectedPrimaryStyleIds: readonly string[]
  readonly selectedAlternativeStyleIds: readonly string[]
}

export function compareStyleTraces(left: StyleScoreTrace, right: StyleScoreTrace): number {
  return Math.round(right.rankingKeys.score * 10) - Math.round(left.rankingKeys.score * 10)
    || left.displayPriority - right.displayPriority
    || compareCodePoints(left.styleId, right.styleId)
}

export function rankStyleCandidates(
  policy: CompiledScoringPolicy,
  answers: CompletedAnswers,
  candidates: readonly StyleScoreTrace[],
): RankedStyleCandidates {
  const family = answers[policy.ranking.primaryFamilyQuestionId][0]
  if (!family) throw new ScoringInvariantError()
  const ids = new Set<string>()
  const priorities = new Set<number>()
  for (const candidate of candidates) {
    if (ids.has(candidate.styleId) || priorities.has(candidate.displayPriority)) {
      throw new ScoringInvariantError()
    }
    ids.add(candidate.styleId)
    priorities.add(candidate.displayPriority)
  }
  const globallyRanked = [...candidates].sort(compareStyleTraces)
  const primary = globallyRanked.filter((candidate) => candidate.family === family)
  const alternative = globallyRanked.filter((candidate) => candidate.family !== family)

  const rankGroup = (group: readonly StyleScoreTrace[], limit: number) => group.map(
    (candidate, groupRank): StyleScoreTrace => ({
      ...candidate,
      group: candidate.family === family ? 'primary' : 'alternative',
      groupRank,
      displayPosition: groupRank < limit ? groupRank : null,
      confidence: null,
    }),
  )
  const rankedPrimary = rankGroup(primary, policy.ranking.primaryLimit)
  const rankedAlternative = rankGroup(alternative, policy.ranking.alternativeLimit)
  const byId = new Map([...rankedPrimary, ...rankedAlternative].map((candidate) => (
    [candidate.styleId, candidate] as const
  )))
  const styleCandidates = globallyRanked.map(({ styleId }) => byId.get(styleId)!)
  const entries = (group: readonly StyleScoreTrace[]): RankingTraceEntry[] => group.map(
    (candidate) => ({
      styleId: candidate.styleId,
      score: candidate.rankingKeys.score,
      displayPriority: candidate.displayPriority,
      rankingKeys: candidate.rankingKeys,
      groupRank: candidate.groupRank,
      selected: candidate.displayPosition !== null,
    }),
  )
  const primaryRanking = entries(rankedPrimary)
  const alternativeRanking = entries(rankedAlternative)
  return {
    styleCandidates,
    primaryRanking,
    alternativeRanking,
    selectedPrimaryStyleIds: primaryRanking.filter(({ selected }) => selected).map(({ styleId }) => styleId),
    selectedAlternativeStyleIds: alternativeRanking.filter(({ selected }) => selected).map(({ styleId }) => styleId),
  }
}
