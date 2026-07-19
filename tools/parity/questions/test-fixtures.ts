import {
  computeObservableDivergenceValueHash,
  deriveObservableCoverage,
  type LegacyObservableAction,
  type LegacyObservableTraceCase,
} from './contracts.js'

export const formContinueActions = [
  { type: 'select', questionId: 'form', optionId: 'soup' },
  { type: 'continue', fromQuestionId: 'form' },
] as const satisfies readonly LegacyObservableAction[]

export const rejectedContinueActions = [
  { type: 'continue', fromQuestionId: 'form' },
] as const satisfies readonly LegacyObservableAction[]

export const maxSelectionBlockedOptionId = 'duck'

export const maxSelectionActions = [
  { type: 'select', questionId: 'form', optionId: 'soup' },
  { type: 'continue', fromQuestionId: 'form' },
  { type: 'select', questionId: 'archetype', optionId: 'chintan' },
  { type: 'continue', fromQuestionId: 'archetype' },
  { type: 'select', questionId: 'tare', optionId: 'shoyu' },
  { type: 'continue', fromQuestionId: 'tare' },
  { type: 'select', questionId: 'source', optionId: 'pork' },
  { type: 'select', questionId: 'source', optionId: 'chicken' },
] as const satisfies readonly LegacyObservableAction[]

export const unchangedToggleActions = [
  ...maxSelectionActions,
  { type: 'select', questionId: 'source', optionId: maxSelectionBlockedOptionId },
] as const satisfies readonly LegacyObservableAction[]

const expectedCaseBody = {
  id: 'form-select',
  actions: [formContinueActions[0]],
  frames: [
    {
      sequence: 0,
      transition: 'initial',
      displayedQuestionId: 'form',
      visibleOptionIds: ['soup', 'tsukemen', 'dry'],
      disabledOptionIds: [],
      pendingOptionIds: [],
      legacyAnswers: {},
    },
    {
      sequence: 1,
      transition: 'toggle',
      actionIndex: 0,
      displayedQuestionId: 'form',
      visibleOptionIds: ['soup', 'tsukemen', 'dry'],
      disabledOptionIds: [],
      pendingOptionIds: ['soup'],
      legacyAnswers: { form: 'soup' },
      observedChanges: {
        answers: [{ questionId: 'form', after: 'soup' }],
      },
    },
  ],
} as const

export const expectedCase: LegacyObservableTraceCase = {
  ...expectedCaseBody,
  coverageTags: deriveObservableCoverage(expectedCaseBody),
}

export const requiredCoverage = expectedCase.coverageTags

export const casesWithOrphanTag = [{
  ...expectedCase,
  coverageTags: [...expectedCase.coverageTags, 'semantic-class:orphan'],
}] as unknown as readonly LegacyObservableTraceCase[]

const receivedTraceBody = {
  ...expectedCase,
  frames: [
    expectedCase.frames[0]!,
    {
      ...expectedCase.frames[1]!,
      visibleOptionIds: ['tsukemen', 'soup', 'dry'],
      observedChanges: {
        visibleOptionIds: {
          questionId: 'form',
          before: ['soup', 'tsukemen', 'dry'],
          after: ['tsukemen', 'soup', 'dry'],
        },
        answers: [{ questionId: 'form', after: 'soup' }],
      },
    },
  ],
}

export const receivedTrace: LegacyObservableTraceCase = {
  ...receivedTraceBody,
  coverageTags: deriveObservableCoverage(receivedTraceBody),
}

export const validDivergence = {
  caseId: expectedCase.id,
  jsonPointer: '/frames/1/visibleOptionIds/0',
  operation: 'replace' as const,
  legacyValueHash: computeObservableDivergenceValueHash('soup'),
  approvedValue: 'tsukemen',
  semanticHash: 'd1bd2fcecabcfde8a7512b530d9cbec7f2fc0bb1d62ad65cbece2799be753c0d',
  adr: 'docs/adr/0001-test.md',
  approvalIdentity: 'test-approval',
  rationale: 'Test-only divergence fixture',
}
