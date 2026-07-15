import { z } from 'zod'

import { stableIdSchema, versionSchema } from '../../contracts/ids.js'
import { isRepositorySource } from '../../contracts/source-path.js'
import type {
  StyleDefinition,
  StyleDefinitionBundleSource,
} from '../../contracts/style-model.js'
import { DiagnosticCollector } from '../collector.js'

const sourceFileSchema = z.string().min(1).refine(
  isRepositorySource,
  'style sourceFile must be a repository-relative POSIX path',
)
const prioritySchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveFiniteSchema = z.number().finite().positive()
const positiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

const familyIdSchema = z.enum(['soup', 'tsukemen', 'dry'])
const intensityIdSchema = z.enum(['clean', 'standard', 'heavy'])
const noodleIdSchema = z.enum([
  'thin-straight',
  'medium-thin-straight',
  'medium-thick-straight',
  'medium-thick-wavy',
  'extra-thick',
])
const exclusionTagIdSchema = z.enum([
  'pork',
  'chicken',
  'duck',
  'fish-seafood',
  'shellfish',
  'dairy',
])
const matchTierSchema = z.enum(['exact', 'adjacent', 'partial'])

const styleRuleTierDefinitionSchema = z.strictObject({
  tier: matchTierSchema,
  optionIds: z.array(stableIdSchema),
})

const styleRuleDefinitionSchema = z.strictObject({
  questionId: stableIdSchema,
  tiers: z.array(styleRuleTierDefinitionSchema),
})

const adjustmentConditionDefinitionSchema = z.strictObject({
  priority: prioritySchema,
  questionId: stableIdSchema,
  optionIds: z.array(stableIdSchema),
})

const bonusDefinitionSchema = z.strictObject({
  id: stableIdSchema,
  priority: prioritySchema,
  labelMessageId: stableIdSchema,
  points: positiveFiniteSchema,
  minMatches: positiveSafeIntegerSchema,
  conditions: z.array(adjustmentConditionDefinitionSchema).min(1),
}).refine(
  (value) => value.minMatches <= value.conditions.length,
  { path: ['minMatches'], message: 'minMatches must not exceed conditions length' },
)

const conflictDefinitionSchema = z.strictObject({
  id: stableIdSchema,
  priority: prioritySchema,
  labelMessageId: stableIdSchema,
  penalty: positiveFiniteSchema,
  whenAll: z.array(adjustmentConditionDefinitionSchema),
})

const intensityOverrideDefinitionSchema = z.strictObject({
  rules: z.array(styleRuleDefinitionSchema),
})

const styleTaxonomyDefinitionSchema = z.strictObject({
  sourceFile: sourceFileSchema,
  families: z.array(z.strictObject({
    id: familyIdSchema,
    priority: prioritySchema,
    formOptionId: stableIdSchema,
  })).min(1),
  intensities: z.array(z.strictObject({
    id: intensityIdSchema,
    priority: prioritySchema,
    labelMessageId: stableIdSchema,
    summaryMessageId: stableIdSchema,
    bodyRule: styleRuleDefinitionSchema,
  })).min(1),
  noodles: z.array(z.strictObject({
    id: noodleIdSchema,
    priority: prioritySchema,
    labelMessageId: stableIdSchema,
    summaryMessageId: stableIdSchema,
  })).min(1),
  exclusionTags: z.array(z.strictObject({
    id: exclusionTagIdSchema,
    priority: prioritySchema,
    exclusionsOptionId: stableIdSchema,
  })).min(1),
  ruleQuestions: z.array(z.strictObject({
    questionId: stableIdSchema,
    priority: prioritySchema,
    source: z.enum(['style-base', 'intensity-profile']),
  })).min(1),
})

const rawStyleDefinitionSchema = z.strictObject({
  sourceFile: sourceFileSchema,
  id: stableIdSchema,
  family: familyIdSchema,
  displayPriority: prioritySchema,
  messageIds: z.strictObject({
    label: stableIdSchema,
    summary: stableIdSchema,
  }),
  accent: z.string().min(1),
  supportedIntensityIds: z.array(intensityIdSchema),
  supportedNoodleIds: z.array(noodleIdSchema),
  baseRules: z.array(styleRuleDefinitionSchema),
  intensityOverrides: z.strictObject({
    clean: intensityOverrideDefinitionSchema.optional(),
    standard: intensityOverrideDefinitionSchema.optional(),
    heavy: intensityOverrideDefinitionSchema.optional(),
  }).optional(),
  bonuses: z.array(bonusDefinitionSchema),
  conflicts: z.array(conflictDefinitionSchema),
  exclusionTags: z.array(exclusionTagIdSchema),
})

export const styleDefinitionSchema = rawStyleDefinitionSchema.transform(
  (value): StyleDefinition => {
    const definition = {
      sourceFile: value.sourceFile,
      id: value.id,
      family: value.family,
      displayPriority: value.displayPriority,
      messageIds: value.messageIds,
      accent: value.accent,
      supportedIntensityIds: value.supportedIntensityIds,
      supportedNoodleIds: value.supportedNoodleIds,
      baseRules: value.baseRules,
      bonuses: value.bonuses,
      conflicts: value.conflicts,
      exclusionTags: value.exclusionTags,
    }
    const overrides = value.intensityOverrides
    if (overrides === undefined) return definition

    return {
      ...definition,
      intensityOverrides: {
        ...(overrides.clean === undefined ? {} : { clean: overrides.clean }),
        ...(overrides.standard === undefined ? {} : { standard: overrides.standard }),
        ...(overrides.heavy === undefined ? {} : { heavy: overrides.heavy }),
      },
    }
  },
)

export const styleDefinitionBundleSchema = z.strictObject({
  sourceFile: sourceFileSchema,
  modelVersion: versionSchema,
  taxonomy: styleTaxonomyDefinitionSchema,
  definitions: z.array(styleDefinitionSchema).min(1),
})

function escapePointerToken(value: PropertyKey) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1')
}

function toJsonPointer(path: readonly PropertyKey[]) {
  return path.length ? `/${path.map(escapePointerToken).join('/')}` : ''
}

export function parseStyleDefinitionBundle(input: unknown, sourceFile: string): {
  definition?: StyleDefinitionBundleSource
  diagnostics: ReturnType<DiagnosticCollector['toArray']>
} {
  if (!isRepositorySource(sourceFile)) {
    const collector = new DiagnosticCollector()
    collector.error({
      code: 'STRUCTURE_INVALID',
      sourceFile: 'runtime://parse-style-definition-bundle',
      path: '',
      message: 'Invalid parser sourceFile; expected repository-relative POSIX path',
    })
    return { diagnostics: collector.toArray() }
  }
  const parsed = styleDefinitionBundleSchema.safeParse(input)
  if (parsed.success) {
    return {
      definition: parsed.data,
      diagnostics: [],
    }
  }

  const collector = new DiagnosticCollector()
  for (const issue of parsed.error.issues) collector.error({
    code: 'STRUCTURE_INVALID',
    sourceFile,
    path: toJsonPointer(issue.path),
    message: 'Invalid style definition structure',
  })
  return { diagnostics: collector.toArray() }
}
