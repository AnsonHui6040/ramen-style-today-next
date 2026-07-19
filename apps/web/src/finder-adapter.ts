import type { EligibilityCandidate } from '@ramen-style/classification-core'

export type FinderProjection =
  | {
      readonly availability: 'available'
      readonly styleId: string
      readonly initialFilterId: string
    }
  | { readonly availability: 'unavailable'; readonly reason: 'no-eligible-lead' }

export function deriveFinderProjection(
  selectedPrimary: EligibilityCandidate | null,
): FinderProjection {
  if (!selectedPrimary || selectedPrimary.decision !== 'eligible') {
    return Object.freeze({ availability: 'unavailable', reason: 'no-eligible-lead' })
  }
  return Object.freeze({
    availability: 'available',
    styleId: selectedPrimary.styleId,
    initialFilterId: `style:${selectedPrimary.styleId}`,
  })
}
