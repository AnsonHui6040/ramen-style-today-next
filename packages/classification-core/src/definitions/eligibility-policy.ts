import type { EligibilityPolicyDefinition } from '../contracts/eligibility-policy.js'

export const legacyEligibilityPolicy = {
  sourceFile: 'packages/classification-core/src/definitions/eligibility-policy.ts',
  modelVersion: 'batch3c.1.0',
  exclusionsQuestionId: 'exclusions',
  noneOptionId: 'none',
  rules: [
    { id: 'exclusion:pork', priority: 0, exclusionOptionId: 'pork', restrictionTagIds: ['pork'] },
    { id: 'exclusion:chicken', priority: 1, exclusionOptionId: 'chicken', restrictionTagIds: ['chicken'] },
    { id: 'exclusion:duck', priority: 2, exclusionOptionId: 'duck', restrictionTagIds: ['duck'] },
    { id: 'exclusion:beef', priority: 3, exclusionOptionId: 'beef', restrictionTagIds: [] },
    { id: 'exclusion:fish-seafood', priority: 4, exclusionOptionId: 'fish-seafood', restrictionTagIds: ['fish-seafood'] },
    { id: 'exclusion:shellfish', priority: 5, exclusionOptionId: 'shellfish', restrictionTagIds: ['shellfish'] },
    { id: 'exclusion:shrimp-crab', priority: 6, exclusionOptionId: 'shrimp-crab', restrictionTagIds: [] },
    { id: 'exclusion:dairy', priority: 7, exclusionOptionId: 'dairy', restrictionTagIds: ['dairy'] },
    { id: 'exclusion:none', priority: 8, exclusionOptionId: 'none', restrictionTagIds: [] },
  ],
  selection: {
    ordering: 'scoring-rank-stable-subsequence',
    primaryLimit: 3,
    alternativeLimit: 3,
    blockedLead: 'highest-blocked-primary-gte-eligible-lead',
  },
} as const satisfies EligibilityPolicyDefinition
