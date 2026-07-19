import { compareCodePoints } from '../contracts/source-path.js'
import type { CoreScoreTrace } from '../contracts/scoring.js'
import { ScoringInvariantError } from './trace.js'

export function compareCoreTraces(left: CoreScoreTrace, right: CoreScoreTrace): number {
  return Math.round(right.finalTotal * 10) - Math.round(left.finalTotal * 10)
    || left.corePriority - right.corePriority
    || compareCodePoints(left.coreId, right.coreId)
}

export function selectCoreCandidate(candidates: readonly CoreScoreTrace[]) {
  if (candidates.length === 0) throw new ScoringInvariantError()
  const ids = new Set<string>()
  const priorities = new Set<number>()
  for (const candidate of candidates) {
    if (ids.has(candidate.coreId) || priorities.has(candidate.corePriority)) {
      throw new ScoringInvariantError()
    }
    ids.add(candidate.coreId)
    priorities.add(candidate.corePriority)
  }
  const ordered = [...candidates].sort(compareCoreTraces)
  const selectedId = ordered[0]!.coreId
  const marked = ordered.map((candidate) => ({
    ...candidate,
    selected: candidate.coreId === selectedId,
  }))
  return { candidates: marked, selected: marked[0]! }
}
