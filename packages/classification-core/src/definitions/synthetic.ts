const sourceFile = 'packages/classification-core/src/definitions/synthetic.ts'

export const syntheticPolicy = {
  sourceFile,
  exactRatio: 1,
  adjacentRatio: 0.6,
  partialRatio: 0.4,
  bonusCap: 5,
  penaltyCap: 15,
  confidenceThreshold: 72,
  tieGap: 5,
} as const
