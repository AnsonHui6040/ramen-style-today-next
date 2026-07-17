import type { SubtypeResolutionTrace } from '../contracts/scoring.js'
import type { CompiledCore } from '../contracts/style-model.js'
import type { OptionId } from '../flow/types.js'
import { ScoringInvariantError } from './trace.js'

export function resolveSubtype(
  core: CompiledCore,
  noodleOptionId: string,
): SubtypeResolutionTrace {
  const matches = core.subtypes.filter(({ noodleId }) => noodleId === noodleOptionId)
  if (matches.length !== 1) throw new ScoringInvariantError()
  return {
    noodleOptionId: noodleOptionId as OptionId,
    matchingSubtypeIds: [matches[0]!.id],
    selectedSubtypeId: matches[0]!.id,
  }
}
