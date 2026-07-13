import { createHash } from 'node:crypto'

import { z } from 'zod'

export const extractorAuthoringSourcePaths = [
  'tools/parity/questions/contracts.ts',
  'tools/parity/questions/extractor.ts',
  'tools/parity/questions/extract.ts',
] as const

export interface ExtractorAuthoringSourceIdentity {
  readonly path: (typeof extractorAuthoringSourcePaths)[number]
  readonly hash: string
}

export function computeExtractorAuthoringHash(
  sources: readonly { readonly path: string; readonly hash: string }[],
) {
  const digest = createHash('sha256')
  digest.update('ramen-question-extractor-authoring-v1\0')
  for (const source of sources) {
    digest.update(source.path)
    digest.update('\0')
    digest.update(source.hash)
    digest.update('\0')
  }
  return digest.digest('hex')
}

export type LegacyNavigationDirection = 'next' | 'previous'

export type LegacyObservableTransition =
  | 'initial'
  | 'toggle'
  | 'submit'
  | 'forced-skip'
  | 'next'
  | 'previous'
  | 'complete'

export type LegacyObservableAction =
  | { readonly type: 'select'; readonly questionId: string; readonly optionId: string }
  | { readonly type: 'deselect'; readonly questionId: string; readonly optionId: string }
  | { readonly type: 'continue'; readonly fromQuestionId: string }
  | { readonly type: 'previous'; readonly fromQuestionId: string }

export type LegacyObservedAnswerValue = string | readonly string[]

export type LegacyObservedAnswers = Readonly<
  Partial<Record<string, LegacyObservedAnswerValue>>
>

export interface LegacyObservedChanges {
  readonly visibleOptionIds?: {
    readonly questionId: string
    readonly before: readonly string[]
    readonly after: readonly string[]
  }
  readonly answers?: readonly {
    readonly questionId: string
    readonly before?: LegacyObservedAnswerValue
    readonly after?: LegacyObservedAnswerValue
  }[]
}

export interface LegacyObservableTraceFrame {
  readonly sequence: number
  readonly transition: LegacyObservableTransition
  readonly actionIndex?: number
  readonly displayedQuestionId?: string
  readonly visibleOptionIds?: readonly string[]
  readonly pendingOptionIds?: readonly string[]
  readonly legacyAnswers?: LegacyObservedAnswers
  readonly forcedAutoAnswer?: {
    readonly questionId: string
    readonly value: LegacyObservedAnswerValue
  }
  readonly navigation?: {
    readonly direction: LegacyNavigationDirection
    readonly reachedQuestionId?: string
    readonly reachedScreen?: 'results'
  }
  readonly completionMarker?: 'results'
  readonly observedChanges?: LegacyObservedChanges
}

export interface LegacyObservableTraceCase {
  readonly id: string
  readonly actions: readonly LegacyObservableAction[]
  readonly coverageTags: readonly string[]
  readonly frames: readonly LegacyObservableTraceFrame[]
}

export type TraceCoverageTag =
  | `question:${string}`
  | `option:${string}:${string}`
  | `action:${LegacyObservableAction['type']}`
  | `transition:${LegacyObservableTransition}`
  | `navigation-target:${string | 'results'}`
  | `behavior:${
    | 'forced-skip'
    | 'completion'
    | 'exclusive-replacement'
    | 'max-no-op'
    | 'empty-restoration'
    | 'branch-visible-change'
    | 'branch-answer-change'
  }`

const identifierSchema = z.string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const caseIdSchema = identifierSchema
const repositoryNameSchema = z.string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_.-]+$/)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const gitObjectSchema = z.string().regex(/^[a-f0-9]{40}$/)
const repositoryPathSchema = z.string().min(1).max(512).refine((value) => (
  !value.startsWith('/')
    && !value.includes('\\')
    && value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
), 'expected a repository-relative path')

function compareCodePoints(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!)
  const sharedLength = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>()
  const freeze = (current: unknown): void => {
    if (!current || typeof current !== 'object' || seen.has(current)) return
    seen.add(current)
    for (const child of Object.values(current)) freeze(child)
    Object.freeze(current)
  }
  freeze(value)
  return value
}

const stringArraySchema = z.array(identifierSchema).max(256)
const legacyObservedAnswerValueSchema = z.union([
  identifierSchema,
  stringArraySchema,
])

const legacyObservedAnswersSchema = z.record(
  identifierSchema,
  legacyObservedAnswerValueSchema,
)

const observedChangesSchema = z.strictObject({
  visibleOptionIds: z.strictObject({
    questionId: identifierSchema,
    before: stringArraySchema,
    after: stringArraySchema,
  }).optional(),
  answers: z.array(z.strictObject({
    questionId: identifierSchema,
    before: legacyObservedAnswerValueSchema.optional(),
    after: legacyObservedAnswerValueSchema.optional(),
  }).superRefine((value, context) => {
    if (value.before === undefined && value.after === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'an observed answer change requires before or after',
      })
    }
  })).max(256).optional(),
})

export const legacyObservableActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('select'),
    questionId: identifierSchema,
    optionId: identifierSchema,
  }),
  z.strictObject({
    type: z.literal('deselect'),
    questionId: identifierSchema,
    optionId: identifierSchema,
  }),
  z.strictObject({
    type: z.literal('continue'),
    fromQuestionId: identifierSchema,
  }),
  z.strictObject({
    type: z.literal('previous'),
    fromQuestionId: identifierSchema,
  }),
])

const frameShape = z.strictObject({
  sequence: z.number().int().nonnegative(),
  transition: z.enum([
    'initial',
    'toggle',
    'submit',
    'forced-skip',
    'next',
    'previous',
    'complete',
  ]),
  actionIndex: z.number().int().nonnegative().optional(),
  displayedQuestionId: identifierSchema.optional(),
  visibleOptionIds: stringArraySchema.optional(),
  pendingOptionIds: stringArraySchema.optional(),
  legacyAnswers: legacyObservedAnswersSchema.optional(),
  forcedAutoAnswer: z.strictObject({
    questionId: identifierSchema,
    value: legacyObservedAnswerValueSchema,
  }).optional(),
  navigation: z.strictObject({
    direction: z.enum(['next', 'previous']),
    reachedQuestionId: identifierSchema.optional(),
    reachedScreen: z.literal('results').optional(),
  }).optional(),
  completionMarker: z.literal('results').optional(),
  observedChanges: observedChangesSchema.optional(),
}).superRefine((frame, context) => {
  if (frame.transition === 'initial') {
    if (frame.actionIndex !== undefined) {
      context.addIssue({ code: 'custom', path: ['actionIndex'], message: 'initial forbids actionIndex' })
    }
  } else if (frame.actionIndex === undefined) {
    context.addIssue({ code: 'custom', path: ['actionIndex'], message: 'actionIndex is required' })
  }

  if (frame.transition === 'forced-skip') {
    if (!frame.forcedAutoAnswer) {
      context.addIssue({
        code: 'custom',
        path: ['forcedAutoAnswer'],
        message: 'forced-skip requires forcedAutoAnswer',
      })
    } else {
      const directlyObservedAnswer = frame.legacyAnswers?.[frame.forcedAutoAnswer.questionId]
      if (
        directlyObservedAnswer !== undefined
        && !canonicalAnswerValuesEqual(directlyObservedAnswer, frame.forcedAutoAnswer.value)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['legacyAnswers', frame.forcedAutoAnswer.questionId],
          message: 'forcedAutoAnswer must match the same-frame legacy answer',
        })
      }
    }
  } else if (frame.forcedAutoAnswer !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['forcedAutoAnswer'],
      message: 'forcedAutoAnswer is allowed only for forced-skip',
    })
  }

  if (frame.transition === 'next') {
    if (frame.navigation?.direction !== 'next') {
      context.addIssue({ code: 'custom', path: ['navigation'], message: 'next requires next navigation' })
    }
    if (frame.navigation?.reachedScreen !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['navigation', 'reachedScreen'],
        message: 'next may only name a reached question',
      })
    }
  } else if (frame.transition === 'previous') {
    if (frame.navigation?.direction !== 'previous') {
      context.addIssue({
        code: 'custom',
        path: ['navigation'],
        message: 'previous requires previous navigation',
      })
    }
    if (frame.navigation?.reachedScreen !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['navigation', 'reachedScreen'],
        message: 'previous may only name a reached question',
      })
    }
  } else if (frame.transition === 'complete') {
    if (frame.completionMarker !== 'results') {
      context.addIssue({
        code: 'custom',
        path: ['completionMarker'],
        message: 'complete requires results marker',
      })
    }
    if (frame.navigation && frame.navigation.direction !== 'next') {
      context.addIssue({
        code: 'custom',
        path: ['navigation'],
        message: 'complete navigation may only move next',
      })
    }
    if (frame.navigation?.reachedQuestionId !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['navigation', 'reachedQuestionId'],
        message: 'complete may only reach results',
      })
    }
    if (frame.displayedQuestionId !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['displayedQuestionId'],
        message: 'complete forbids an ordinary displayed question',
      })
    }
  } else {
    if (frame.navigation !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['navigation'],
        message: 'navigation is allowed only for terminal navigation transitions',
      })
    }
    if (frame.completionMarker !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['completionMarker'],
        message: 'completionMarker is allowed only for complete',
      })
    }
  }

  if (
    (frame.transition === 'next' || frame.transition === 'previous')
    && frame.displayedQuestionId !== undefined
    && frame.navigation?.reachedQuestionId !== undefined
    && frame.displayedQuestionId !== frame.navigation.reachedQuestionId
  ) {
    context.addIssue({
      code: 'custom',
      path: ['displayedQuestionId'],
      message: 'terminal displayedQuestionId must match the reached question',
    })
  }
})

export const legacyObservableTraceFrameSchema = frameShape

interface ActionFrameInput {
  readonly actions: readonly LegacyObservableAction[]
  readonly frames: readonly LegacyObservableTraceFrame[]
}

type ParsedActionFrameInput = {
  readonly actions: readonly z.infer<typeof legacyObservableActionSchema>[]
  readonly frames: readonly z.infer<typeof legacyObservableTraceFrameSchema>[]
}

function validateActionFrames(input: ParsedActionFrameInput, context: z.RefinementCtx) {
  let valid = true
  const addIssue = (issue: Parameters<z.RefinementCtx['addIssue']>[0]) => {
    valid = false
    context.addIssue(issue)
  }
  if (input.frames.length === 0) {
    addIssue({ code: 'custom', path: ['frames'], message: 'at least one frame is required' })
    return false
  }

  input.frames.forEach((frame, index) => {
    if (frame.sequence !== index) {
      addIssue({
        code: 'custom',
        path: ['frames', index, 'sequence'],
        message: 'frame sequences must begin at zero and increase by one',
      })
    }
    if ((index === 0) !== (frame.transition === 'initial')) {
      addIssue({
        code: 'custom',
        path: ['frames', index, 'transition'],
        message: 'initial must be the single first frame',
      })
    }
    if (frame.actionIndex !== undefined && frame.actionIndex >= input.actions.length) {
      addIssue({
        code: 'custom',
        path: ['frames', index, 'actionIndex'],
        message: 'frame actionIndex is out of range',
      })
    }
    if (index > 0 && frame.observedChanges !== undefined) {
      const expected = deriveMechanicalObservedChanges(input.frames[index - 1]!, frame)
      if (!valuesEqual(frame.observedChanges, expected)) {
        addIssue({
          code: 'custom',
          path: ['frames', index, 'observedChanges'],
          message: 'observedChanges must equal the adjacent mechanical before/after diff',
        })
      }
    }
  })

  let frameCursor = 1
  let settledDisplayedQuestionId = input.frames[0]?.displayedQuestionId
  input.actions.forEach((action, actionIndex) => {
    const actionFrameStart = frameCursor
    while (input.frames[frameCursor]?.actionIndex === actionIndex) frameCursor += 1
    const actionFrames = input.frames.slice(actionFrameStart, frameCursor)
    const transitions = actionFrames.map((frame) => frame.transition)
    const sourceQuestionId = 'questionId' in action ? action.questionId : action.fromQuestionId
    if (
      settledDisplayedQuestionId !== undefined
      && settledDisplayedQuestionId !== sourceQuestionId
    ) {
      addIssue({
        code: 'custom',
        path: ['actions', actionIndex],
        message: 'action source must match the settled pre-action displayed question',
      })
    }
    const preActionFrame = input.frames[actionFrameStart - 1]
    if (
      (action.type === 'select' || action.type === 'deselect')
      && preActionFrame?.visibleOptionIds !== undefined
      && !preActionFrame.visibleOptionIds.includes(action.optionId)
    ) {
      addIssue({
        code: 'custom',
        path: ['actions', actionIndex, 'optionId'],
        message: 'action option must be present in directly observed pre-action options',
      })
    }
    if (action.type === 'select' || action.type === 'deselect') {
      if (transitions.length !== 1 || transitions[0] !== 'toggle') {
        addIssue({
          code: 'custom',
          path: ['actions', actionIndex],
          message: `${action.type} requires exactly one toggle frame`,
        })
      }
    } else if (action.type === 'previous') {
      if (transitions.length !== 1 || transitions[0] !== 'previous') {
        addIssue({
          code: 'custom',
          path: ['actions', actionIndex],
          message: 'previous requires exactly one previous frame',
        })
      }
    } else {
      const beginsWithSubmit = transitions[0] === 'submit'
      const terminal = transitions.at(-1)
      const hasOneTerminal = terminal === 'next' || terminal === 'complete'
      const middleIsForced = transitions.slice(1, -1).every(
        (transition) => transition === 'forced-skip',
      )
      if (transitions.length < 2 || !beginsWithSubmit || !hasOneTerminal || !middleIsForced) {
        addIssue({
          code: 'custom',
          path: ['actions', actionIndex],
          message: 'continue requires submit, forced-skip*, and one next or complete frame',
        })
      }
    }

    actionFrames.forEach((frame, offset) => {
      const frameIndex = actionFrameStart + offset
      if (frame.transition === 'toggle' && (action.type === 'select' || action.type === 'deselect')) {
        if (
          frame.displayedQuestionId !== undefined
          && frame.displayedQuestionId !== action.questionId
        ) {
          addIssue({
            code: 'custom',
            path: ['frames', frameIndex, 'displayedQuestionId'],
            message: 'toggle displayedQuestionId must match its bound action questionId',
          })
        }
        if (frame.visibleOptionIds && !frame.visibleOptionIds.includes(action.optionId)) {
          addIssue({
            code: 'custom',
            path: ['frames', frameIndex, 'visibleOptionIds'],
            message: 'toggle visibleOptionIds must include its bound action optionId',
          })
        }
        validateToggleState(
          action,
          input.frames[frameIndex - 1],
          frame,
          frameIndex,
          addIssue,
        )
      }
      if (frame.transition === 'submit' && action.type === 'continue') {
        if (
          frame.displayedQuestionId !== undefined
          && frame.displayedQuestionId !== action.fromQuestionId
        ) {
          addIssue({
            code: 'custom',
            path: ['frames', frameIndex, 'displayedQuestionId'],
            message: 'submit displayedQuestionId must match its bound continue action',
          })
        }
      }
      if (frame.transition === 'next' || frame.transition === 'previous') {
        const reachedQuestionId = frame.navigation?.reachedQuestionId
        if (
          frame.displayedQuestionId !== undefined
          && reachedQuestionId !== undefined
          && frame.displayedQuestionId !== reachedQuestionId
        ) {
          addIssue({
            code: 'custom',
            path: ['frames', frameIndex, 'displayedQuestionId'],
            message: 'terminal displayedQuestionId must match the reached question',
          })
        }
      }
    })

    for (const frame of actionFrames) {
      if (frame.transition === 'complete') {
        settledDisplayedQuestionId = undefined
      } else if (frame.transition === 'next' || frame.transition === 'previous') {
        settledDisplayedQuestionId = frame.displayedQuestionId
      } else if (frame.displayedQuestionId !== undefined) {
        settledDisplayedQuestionId = frame.displayedQuestionId
      }
    }
  })

  if (frameCursor !== input.frames.length) {
    addIssue({
      code: 'custom',
      path: ['frames', frameCursor, 'actionIndex'],
      message: 'action frame chunks must consume indices 0 through N-1 in order',
    })
  }

  return valid
}

function canonicalAnswerValue(value: LegacyObservedAnswerValue) {
  return typeof value === 'string' ? [value] : value
}

function canonicalAnswerValuesEqual(
  left: LegacyObservedAnswerValue,
  right: LegacyObservedAnswerValue,
) {
  return valuesEqual(canonicalAnswerValue(left), canonicalAnswerValue(right))
}

function validateToggleState(
  action: Extract<LegacyObservableAction, { readonly type: 'select' | 'deselect' }>,
  previous: z.infer<typeof legacyObservableTraceFrameSchema> | undefined,
  current: z.infer<typeof legacyObservableTraceFrameSchema>,
  frameIndex: number,
  addIssue: (issue: Parameters<z.RefinementCtx['addIssue']>[0]) => void,
) {
  const directlyObservedAnswer = current.legacyAnswers?.[action.questionId]
  const previousObservedAnswer = previous?.legacyAnswers?.[action.questionId]
  const pendingConsistent = current.pendingOptionIds === undefined || (
    action.type === 'select'
      ? current.pendingOptionIds.includes(action.optionId) || (
          previous?.pendingOptionIds !== undefined
          && valuesEqual(current.pendingOptionIds, previous.pendingOptionIds)
        )
      : !current.pendingOptionIds.includes(action.optionId)
  )
  if (!pendingConsistent) {
    addIssue({
      code: 'custom',
      path: ['frames', frameIndex, 'pendingOptionIds'],
      message: 'toggle pendingOptionIds must match its bound action operation',
    })
  }

  const answerConsistent = directlyObservedAnswer === undefined || (
    action.type === 'select'
      ? canonicalAnswerValue(directlyObservedAnswer).includes(action.optionId) || (
          previousObservedAnswer !== undefined
          && canonicalAnswerValuesEqual(directlyObservedAnswer, previousObservedAnswer)
        )
      : !canonicalAnswerValue(directlyObservedAnswer).includes(action.optionId)
  )
  if (!answerConsistent) {
    addIssue({
      code: 'custom',
      path: ['frames', frameIndex, 'legacyAnswers', action.questionId],
      message: 'toggle legacy answer must match its bound action operation',
    })
  }

  if (
    current.pendingOptionIds !== undefined
    && directlyObservedAnswer !== undefined
    && !valuesEqual(current.pendingOptionIds, canonicalAnswerValue(directlyObservedAnswer))
  ) {
    addIssue({
      code: 'custom',
      path: ['frames', frameIndex, 'legacyAnswers', action.questionId],
      message: 'same-frame pending and legacy answer observations must agree',
    })
  }
}

function deriveMechanicalObservedChanges(
  previous: z.infer<typeof legacyObservableTraceFrameSchema>,
  current: z.infer<typeof legacyObservableTraceFrameSchema>,
) {
  const visibleOptionIds = (
    previous.displayedQuestionId !== undefined
    && previous.displayedQuestionId === current.displayedQuestionId
    && previous.visibleOptionIds !== undefined
    && current.visibleOptionIds !== undefined
    && !valuesEqual(previous.visibleOptionIds, current.visibleOptionIds)
  )
    ? {
        questionId: current.displayedQuestionId,
        before: previous.visibleOptionIds,
        after: current.visibleOptionIds,
      }
    : undefined

  const answers = (
    previous.legacyAnswers !== undefined
    && current.legacyAnswers !== undefined
  )
    ? [...new Set([
        ...Object.keys(previous.legacyAnswers),
        ...Object.keys(current.legacyAnswers),
      ])].flatMap((questionId) => {
        const before = previous.legacyAnswers?.[questionId]
        const after = current.legacyAnswers?.[questionId]
        if (valuesEqual(before, after)) return []
        return [{
          questionId,
          ...(before === undefined ? {} : { before }),
          ...(after === undefined ? {} : { after }),
        }]
      })
    : []

  if (!visibleOptionIds && answers.length === 0) return undefined
  return {
    ...(visibleOptionIds ? { visibleOptionIds } : {}),
    ...(answers.length > 0 ? { answers } : {}),
  }
}

const actionFramesSchema = z.strictObject({
  actions: z.array(legacyObservableActionSchema).max(1024),
  frames: z.array(legacyObservableTraceFrameSchema).max(4096),
}).superRefine((input, context) => {
  validateActionFrames(input, context)
})

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function deriveObservableCoverage(input: ActionFrameInput): readonly TraceCoverageTag[] {
  const validated = actionFramesSchema.parse({
    actions: input.actions,
    frames: input.frames,
  })
  return deriveValidatedCoverage(validated)
}

function deriveValidatedCoverage(
  validated: ParsedActionFrameInput,
): readonly TraceCoverageTag[] {
  const tags = new Set<TraceCoverageTag>()

  validated.actions.forEach((action) => tags.add(`action:${action.type}`))
  validated.frames.forEach((frame, frameIndex) => {
    tags.add(`transition:${frame.transition}`)
    if (frame.displayedQuestionId) tags.add(`question:${frame.displayedQuestionId}`)
    if (frame.displayedQuestionId) {
      frame.visibleOptionIds?.forEach((optionId) => {
        tags.add(`option:${frame.displayedQuestionId}:${optionId}`)
      })
    }
    if (frame.navigation?.reachedQuestionId) {
      tags.add(`navigation-target:${frame.navigation.reachedQuestionId}`)
    }
    if (frame.navigation?.reachedScreen === 'results') {
      tags.add('navigation-target:results')
    }
    if (frame.transition === 'forced-skip') tags.add('behavior:forced-skip')
    if (frame.transition === 'complete') tags.add('behavior:completion')
    if (frame.observedChanges?.visibleOptionIds) {
      const change = frame.observedChanges.visibleOptionIds
      tags.add('behavior:branch-visible-change')
      tags.add(`question:${change.questionId}`)
      for (const optionId of [...change.before, ...change.after]) {
        tags.add(`option:${change.questionId}:${optionId}`)
      }
    }
    if (frame.observedChanges?.answers?.length) tags.add('behavior:branch-answer-change')

    const action = frame.actionIndex === undefined
      ? undefined
      : validated.actions[frame.actionIndex]
    const previousFrame = validated.frames[frameIndex - 1]
    if (frame.transition !== 'toggle' || !action || !previousFrame) return
    const before = previousFrame.pendingOptionIds
    const after = frame.pendingOptionIds
    if (action.type === 'select' && before && after) {
      if (valuesEqual(before, after)) tags.add('behavior:max-no-op')
      else if (before.length === 1 && after.length === 1) {
        tags.add('behavior:exclusive-replacement')
      }
    }
    if (
      action.type === 'deselect'
      && after?.length === 1
      && after[0] === 'none'
      && !before?.includes('none')
    ) tags.add('behavior:empty-restoration')
  })

  return Object.freeze([...tags].sort(compareCodePoints))
}

const traceCaseShape = z.strictObject({
  id: caseIdSchema,
  actions: z.array(legacyObservableActionSchema).max(1024),
  coverageTags: z.array(z.string().min(1).max(256)).max(4096),
  frames: z.array(legacyObservableTraceFrameSchema).max(4096),
}).superRefine((traceCase, context) => {
  const actionFramesValid = validateActionFrames(traceCase, context)
  if (!actionFramesValid) return
  try {
    const derived = deriveValidatedCoverage(traceCase)
    if (!valuesEqual(traceCase.coverageTags, derived)) {
      context.addIssue({
        code: 'custom',
        path: ['coverageTags'],
        message: 'coverageTags must exactly equal mechanically derived observable coverage',
      })
    }
  } catch {
    // validateActionFrames already reports the structural mismatch.
  }
})

export const legacyObservableTraceCaseSchema = traceCaseShape.transform(
  (value): LegacyObservableTraceCase => deepFreeze(value) as LegacyObservableTraceCase,
)

export const legacyObservableSeedCaseSchema = z.strictObject({
  id: caseIdSchema,
  actions: z.array(legacyObservableActionSchema).max(1024),
})

export const legacyObservableSeedFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  cases: z.array(legacyObservableSeedCaseSchema).min(1).max(1024),
}).superRefine((seedFile, context) => {
  const ids = new Set<string>()
  seedFile.cases.forEach((seedCase, index) => {
    if (ids.has(seedCase.id)) {
      context.addIssue({
        code: 'custom',
        path: ['cases', index, 'id'],
        message: 'duplicate seed case ID',
      })
    }
    ids.add(seedCase.id)
  })
})

const runtimeContractSchema = z.strictObject({
  nodeVersion: z.string().regex(/^24\.[0-9]+\.[0-9]+$/),
  npmVersion: z.string().regex(/^11\.[0-9]+\.[0-9]+$/),
  timezone: z.literal('UTC'),
  locale: z.string().min(1).max(32),
  seed: z.string().min(1).max(160),
  lifecycleScripts: z.literal('disabled'),
  extractionNetwork: z.literal('denied'),
  dependencies: z.literal('physical-isolated'),
  fullSuiteBeforeExtraction: z.literal(true),
  npmConfigPolicy: z.strictObject({
    userConfig: z.literal('isolated-empty-file'),
    globalConfig: z.literal('isolated-empty-file'),
    distinctFiles: z.literal(true),
    npmArgvModified: z.literal(false),
  }),
})

const extractorAuthoringSourcesSchema = z.tuple([
  z.strictObject({
    path: z.literal(extractorAuthoringSourcePaths[0]),
    hash: sha256Schema,
  }),
  z.strictObject({
    path: z.literal(extractorAuthoringSourcePaths[1]),
    hash: sha256Schema,
  }),
  z.strictObject({
    path: z.literal(extractorAuthoringSourcePaths[2]),
    hash: sha256Schema,
  }),
])

const extractorIdentitySchema = z.strictObject({
  version: z.literal(1),
  sources: extractorAuthoringSourcesSchema,
  hash: sha256Schema,
}).superRefine((identity, context) => {
  if (identity.hash !== computeExtractorAuthoringHash(identity.sources)) {
    context.addIssue({
      code: 'custom',
      path: ['hash'],
      message: 'extractor hash must match the canonical ordered authoring source identity',
    })
  }
})

export const fixtureManifestSchema = z.strictObject({
  fixtureSchemaVersion: z.literal(1),
  caseSchemaVersion: z.literal(1),
  source: z.strictObject({
    repository: z.strictObject({
      host: z.literal('github.com'),
      owner: repositoryNameSchema,
      repository: repositoryNameSchema,
    }),
    commit: gitObjectSchema,
    treeHash: gitObjectSchema,
    trackedSourceHashes: z.record(repositoryPathSchema, sha256Schema),
    lockfilePath: repositoryPathSchema,
    lockfileHash: sha256Schema,
  }),
  extractor: extractorIdentitySchema,
  instrumentation: z.strictObject({
    version: z.number().int().positive(),
    hash: sha256Schema,
  }),
  runtime: runtimeContractSchema,
  caseIds: z.array(caseIdSchema).min(1).max(1024),
  caseCount: z.number().int().positive(),
  fixtureContentHash: sha256Schema,
}).superRefine((manifest, context) => {
  if (manifest.caseCount !== manifest.caseIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['caseCount'],
      message: 'caseCount must equal caseIds length',
    })
  }
  const uniqueIds = new Set(manifest.caseIds)
  if (uniqueIds.size !== manifest.caseIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['caseIds'],
      message: 'caseIds must be unique',
    })
  }
})

interface ObservableDivergenceRoute {
  readonly acceptsValue: (value: unknown) => boolean
}

function routeFor(schema: z.ZodType): ObservableDivergenceRoute {
  return { acceptsValue: (value) => schema.safeParse(value).success }
}

function decodeJsonPointer(pointer: string) {
  if (!pointer.startsWith('/')) return undefined
  const encodedSegments = pointer.slice(1).split('/')
  if (encodedSegments.some((segment) => /~(?:[^01]|$)/.test(segment))) return undefined
  return encodedSegments.map((segment) => (
    segment.replaceAll('~1', '/').replaceAll('~0', '~')
  ))
}

function isCanonicalArrayIndex(
  segment: string,
  maximumExclusive: number,
  operation: 'add' | 'replace' | 'remove',
) {
  if (segment === '-') return operation === 'add'
  if (!/^(?:0|[1-9][0-9]*)$/.test(segment)) return false
  return Number(segment) < maximumExclusive
}

function parseObservableFrameRoute(
  pointer: string,
  operation: 'add' | 'replace' | 'remove',
): ObservableDivergenceRoute | undefined {
  const segments = decodeJsonPointer(pointer)
  if (
    !segments
    || segments[0] !== 'frames'
    || !isCanonicalArrayIndex(segments[1] ?? '', 4096, 'replace')
  ) return undefined
  const route = segments.slice(2)
  if (route.length === 1) {
    if (route[0] === 'sequence' || route[0] === 'actionIndex') {
      return routeFor(z.number().int().nonnegative())
    }
    if (route[0] === 'transition') {
      return routeFor(z.enum([
        'initial',
        'toggle',
        'submit',
        'forced-skip',
        'next',
        'previous',
        'complete',
      ]))
    }
    if (route[0] === 'displayedQuestionId') return routeFor(identifierSchema)
    if (route[0] === 'completionMarker') return routeFor(z.literal('results'))
    return undefined
  }

  if (
    (route[0] === 'visibleOptionIds' || route[0] === 'pendingOptionIds')
    && route.length === 2
    && isCanonicalArrayIndex(route[1]!, 256, operation)
  ) return routeFor(identifierSchema)

  if (route[0] === 'legacyAnswers' && identifierSchema.safeParse(route[1]).success) {
    if (route.length === 2) return routeFor(legacyObservedAnswerValueSchema)
    if (
      route.length === 3
      && isCanonicalArrayIndex(route[2]!, 256, operation)
    ) return routeFor(identifierSchema)
    return undefined
  }

  if (route[0] === 'forcedAutoAnswer') {
    if (route.length === 2 && route[1] === 'questionId') return routeFor(identifierSchema)
    if (route.length === 2 && route[1] === 'value') {
      return routeFor(legacyObservedAnswerValueSchema)
    }
    if (
      route.length === 3
      && route[1] === 'value'
      && isCanonicalArrayIndex(route[2]!, 256, operation)
    ) return routeFor(identifierSchema)
    return undefined
  }

  if (route[0] === 'navigation' && route.length === 2) {
    if (route[1] === 'direction') return routeFor(z.enum(['next', 'previous']))
    if (route[1] === 'reachedQuestionId') return routeFor(identifierSchema)
    if (route[1] === 'reachedScreen') return routeFor(z.literal('results'))
    return undefined
  }

  if (route[0] !== 'observedChanges') return undefined
  if (route[1] === 'visibleOptionIds') {
    if (route.length === 3 && route[2] === 'questionId') return routeFor(identifierSchema)
    if (
      route.length === 4
      && (route[2] === 'before' || route[2] === 'after')
      && isCanonicalArrayIndex(route[3]!, 256, operation)
    ) return routeFor(identifierSchema)
    return undefined
  }
  if (
    route[1] !== 'answers'
    || !isCanonicalArrayIndex(route[2] ?? '', 256, 'replace')
  ) return undefined
  if (route.length === 4 && route[3] === 'questionId') return routeFor(identifierSchema)
  if (route.length === 4 && (route[3] === 'before' || route[3] === 'after')) {
    return routeFor(legacyObservedAnswerValueSchema)
  }
  if (
    route.length === 5
    && (route[3] === 'before' || route[3] === 'after')
    && isCanonicalArrayIndex(route[4]!, 256, operation)
  ) return routeFor(identifierSchema)
  return undefined
}

const divergenceSchema = z.strictObject({
  caseId: caseIdSchema,
  jsonPointer: z.string().min(1).max(1024),
  operation: z.enum(['add', 'replace', 'remove']),
  legacyValueHash: sha256Schema,
  approvedValue: z.json().optional(),
  semanticHash: sha256Schema,
  adr: repositoryPathSchema,
  approvalIdentity: z.string().min(1).max(256),
  rationale: z.string().min(1).max(2000),
}).superRefine((divergence, context) => {
  const route = parseObservableFrameRoute(divergence.jsonPointer, divergence.operation)
  if (!route) {
    context.addIssue({
      code: 'custom',
      path: ['jsonPointer'],
      message: 'divergence pointer must name an observable frame leaf or array element',
    })
  }
  if (divergence.operation === 'remove' && divergence.approvedValue !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['approvedValue'],
      message: 'remove forbids approvedValue',
    })
  }
  if (divergence.operation !== 'remove' && divergence.approvedValue === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['approvedValue'],
      message: 'add and replace require approvedValue',
    })
  }
  if (
    route
    && divergence.operation !== 'remove'
    && divergence.approvedValue !== undefined
    && !route.acceptsValue(divergence.approvedValue)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['approvedValue'],
      message: 'approvedValue must match the observable route value type',
    })
  }
})

export const expectedDivergencesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  entries: z.array(divergenceSchema).max(4096),
}).superRefine((manifest, context) => {
  const keys = manifest.entries.map((entry) => (
    `${entry.caseId}\0${entry.jsonPointer}\0${entry.operation}`
  ))
  const sorted = [...keys].sort(compareCodePoints)
  if (!valuesEqual(keys, sorted) || new Set(keys).size !== keys.length) {
    context.addIssue({
      code: 'custom',
      path: ['entries'],
      message: 'divergences must be unique and deterministically ordered',
    })
  }
})
