export const persistenceLimits = Object.freeze({
  maxDepth: 4,
  maxQuestionEntries: 64,
  maxSelectionsPerQuestion: 64,
  maxTotalSelections: 512,
  maxIdCodePoints: 128,
  maxModelVersionCodePoints: 128,
} as const)
