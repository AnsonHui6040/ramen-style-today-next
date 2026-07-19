import { z } from 'zod'

import { stableIdSchema } from '../../contracts/ids.js'
import type {
  AllowedOptionDecisionRow,
  AllowedOptionSelection,
  SerializableCondition,
} from '../../contracts/question-model.js'

const serializableConditionSchema: z.ZodType<SerializableCondition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('answered'),
      questionId: stableIdSchema,
    }),
    z.strictObject({
      type: z.literal('answer-includes'),
      questionId: stableIdSchema,
      optionId: stableIdSchema,
    }),
    z.strictObject({
      type: z.literal('all'),
      conditions: z.array(serializableConditionSchema),
    }),
    z.strictObject({
      type: z.literal('any'),
      conditions: z.array(serializableConditionSchema),
    }),
    z.strictObject({
      type: z.literal('not'),
      condition: serializableConditionSchema,
    }),
  ]),
)

const allowedOptionSelectionSchema: z.ZodType<AllowedOptionSelection> = z.discriminatedUnion(
  'type',
  [
    z.strictObject({ type: z.literal('all') }),
    z.strictObject({
      type: z.literal('only'),
      optionIds: z.array(stableIdSchema),
    }),
  ],
)

const allowedOptionDecisionRowSchema: z.ZodType<AllowedOptionDecisionRow> = z.strictObject({
  when: serializableConditionSchema,
  selection: allowedOptionSelectionSchema,
})

const optionDefinitionSourceSchema = z.strictObject({
  id: stableIdSchema,
  order: z.number().int().nonnegative(),
  messageIds: z.strictObject({
    label: stableIdSchema,
    description: stableIdSchema.optional(),
  }),
  availableWhen: serializableConditionSchema.optional(),
  exclusive: z.boolean().optional(),
})

export const questionDefinitionSourceSchema = z.strictObject({
  id: stableIdSchema,
  order: z.number().int().nonnegative(),
  messageIds: z.strictObject({
    title: stableIdSchema,
    description: stableIdSchema,
  }),
  selection: z.strictObject({
    type: z.enum(['single', 'multiple']),
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
    overrides: z.array(z.strictObject({
      when: serializableConditionSchema,
      min: z.number().int().nonnegative(),
      max: z.number().int().nonnegative(),
    })).optional(),
  }),
  availableWhen: serializableConditionSchema.optional(),
  options: z.array(optionDefinitionSourceSchema).min(1),
  allowedOptions: z.array(allowedOptionDecisionRowSchema).optional(),
  autoAnswer: z.strictObject({
    type: z.literal('single-allowed-option'),
    when: serializableConditionSchema.optional(),
  }).optional(),
  initialUiOptionIds: z.array(stableIdSchema).optional(),
  pendingSelection: z.strictObject({
    emptyBehavior: z.discriminatedUnion('type', [
      z.strictObject({ type: z.literal('allow-empty') }),
      z.strictObject({ type: z.literal('restore-initial-ui-options') }),
    ]),
  }).optional(),
  weight: z.number().finite().nonnegative().optional(),
}).superRefine((question, context) => {
  const seenOptionOrders = new Set<number>()
  question.options.forEach((option, index) => {
    if (seenOptionOrders.has(option.order)) {
      context.addIssue({
        code: 'custom',
        path: ['options', index, 'order'],
        message: `duplicate option order ${option.order}`,
      })
    }
    seenOptionOrders.add(option.order)
  })

  if (
    question.pendingSelection?.emptyBehavior.type === 'restore-initial-ui-options'
    && !question.initialUiOptionIds?.length
  ) {
    context.addIssue({
      code: 'custom',
      path: ['initialUiOptionIds'],
      message: 'restore-initial-ui-options requires non-empty initialUiOptionIds',
    })
  }
})
