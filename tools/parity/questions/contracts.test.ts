import { describe, expect, test } from 'vitest'

import {
  applyExpectedDivergences,
  computeExtractorAuthoringHash,
  computeObservableDivergenceValueHash,
  deriveObservableCoverage,
  expectedDivergencesSchema,
  fixtureManifestSchema,
  legacyObservableSeedCaseSchema,
  legacyObservableSeedFileSchema,
  legacyObservableTraceCaseSchema,
  legacyObservableTraceFrameSchema,
  observableDivergenceMissingValueHash,
  type LegacyObservableTraceCase,
} from './contracts.js'

const validAuthoringSources = [
  {
    path: 'tools/parity/questions/contracts.ts',
    hash: 'c'.repeat(64),
  },
  {
    path: 'tools/parity/questions/extractor.ts',
    hash: 'd'.repeat(64),
  },
  {
    path: 'tools/parity/questions/extract.ts',
    hash: 'e'.repeat(64),
  },
] as const

const validFrame = {
  sequence: 0,
  transition: 'initial',
  displayedQuestionId: 'form',
  visibleOptionIds: ['soup', 'dry'],
  disabledOptionIds: [],
  pendingOptionIds: [],
  legacyAnswers: {},
} as const

const validTraceCaseWithoutCoverage = {
  id: 'soup-chintan-complete',
  actions: [
    { type: 'select', questionId: 'form', optionId: 'soup' },
    { type: 'continue', fromQuestionId: 'form' },
  ],
  frames: [
    validFrame,
    {
      sequence: 1,
      transition: 'toggle',
      actionIndex: 0,
      displayedQuestionId: 'form',
      visibleOptionIds: ['soup', 'dry'],
      disabledOptionIds: [],
      pendingOptionIds: ['soup'],
      legacyAnswers: { form: 'soup' },
    },
    {
      sequence: 2,
      transition: 'submit',
      actionIndex: 1,
      displayedQuestionId: 'form',
      legacyAnswers: { form: 'soup' },
    },
    {
      sequence: 3,
      transition: 'next',
      actionIndex: 1,
      displayedQuestionId: 'archetype',
      navigation: { direction: 'next', reachedQuestionId: 'archetype' },
      legacyAnswers: { form: 'soup' },
    },
  ],
} as const

const validTraceCase = {
  ...validTraceCaseWithoutCoverage,
  coverageTags: deriveObservableCoverage(validTraceCaseWithoutCoverage),
}

const validFixtureManifest = {
  fixtureSchemaVersion: 1,
  caseSchemaVersion: 1,
  source: {
    repository: {
      host: 'github.com',
      owner: 'AnsonHui6040',
      repository: 'ramen-style-today',
    },
    commit: 'a'.repeat(40),
    treeHash: 'b'.repeat(40),
    trackedSourceHashes: {
      'src/App.tsx': 'c'.repeat(64),
    },
    lockfilePath: 'package-lock.json',
    lockfileHash: 'd'.repeat(64),
  },
  extractor: {
    version: 1,
    sources: validAuthoringSources,
    hash: computeExtractorAuthoringHash(validAuthoringSources),
  },
  instrumentation: {
    version: 1,
    hash: 'f'.repeat(64),
  },
  runtime: {
    nodeVersion: '24.14.0',
    npmVersion: '11.12.1',
    timezone: 'UTC',
    locale: 'C.UTF-8',
    seed: 'ramen-question-observable-v1',
    lifecycleScripts: 'disabled',
    extractionNetwork: 'denied',
    dependencies: 'physical-isolated',
    fullSuiteBeforeExtraction: true,
    npmConfigPolicy: {
      userConfig: 'isolated-empty-file',
      globalConfig: 'isolated-empty-file',
      distinctFiles: true,
      npmArgvModified: false,
    },
  },
  caseIds: ['soup-chintan-complete'],
  caseCount: 1,
  fixtureContentHash: '1'.repeat(64),
} as const

const validDivergence = {
  caseId: 'soup-chintan-complete',
  jsonPointer: '/frames/1/visibleOptionIds/0',
  operation: 'replace',
  legacyValueHash: '2'.repeat(64),
  approvedValue: 'tsukemen',
  semanticHash: '3'.repeat(64),
  adr: 'docs/adr/0001.md',
  approvalIdentity: 'reviewer@example.com',
  rationale: 'Approved visible option correction.',
} as const

describe('observable legacy trace contracts', () => {
  test('accepts observable frames with unobservable fields omitted', () => {
    expect(legacyObservableTraceCaseSchema.safeParse(validTraceCase).success).toBe(true)
    expect(legacyObservableTraceFrameSchema.safeParse({
      sequence: 1,
      transition: 'previous',
      actionIndex: 0,
      navigation: { direction: 'previous', reachedQuestionId: 'form' },
    }).success).toBe(true)
  })

  test('accepts only unique visible disabled IDs in display order and disjoint from pending', () => {
    const accepted = legacyObservableTraceFrameSchema.safeParse({
      ...validFrame,
      visibleOptionIds: ['pork', 'chicken', 'duck'],
      disabledOptionIds: ['duck'],
    })
    expect(accepted.success).toBe(true)
    if (accepted.success) expect(accepted.data.disabledOptionIds).toEqual(['duck'])

    for (const disabledOptionIds of [
      ['hidden-option'],
      ['duck', 'duck'],
      ['duck', 'chicken'],
    ]) {
      expect(legacyObservableTraceFrameSchema.safeParse({
        ...validFrame,
        visibleOptionIds: ['pork', 'chicken', 'duck'],
        disabledOptionIds,
      }).success).toBe(false)
    }
    expect(legacyObservableTraceFrameSchema.safeParse({
      ...validFrame,
      visibleOptionIds: ['pork', 'chicken', 'duck'],
      disabledOptionIds: ['pork'],
      pendingOptionIds: ['pork'],
    }).success).toBe(false)
  })

  test.each([
    'canonicalAnswers',
    'reachableQuestionIds',
    'interactiveQuestionIds',
    'allowedOptionIdsByQuestion',
    'repairs',
    'diagnostics',
    'invalidatedQuestionIds',
    'accepted',
    'rejected',
    'dependencyClosures',
    'fixedPointIterations',
    'navigationQuery',
    'semanticHash',
    'implementationSha',
    'assurance',
  ])('rejects new-only frozen field %s', (field) => {
    expect(legacyObservableTraceFrameSchema.safeParse({
      ...validFrame,
      [field]: [],
    }).success).toBe(false)
  })

  test('requires contiguous sequences and the single action-free initial frame', () => {
    expect(legacyObservableTraceCaseSchema.safeParse({
      ...validTraceCase,
      frames: validTraceCase.frames.map((frame, index) => (
        index === 2 ? { ...frame, sequence: 9 } : frame
      )),
    }).success).toBe(false)
    expect(legacyObservableTraceCaseSchema.safeParse({
      ...validTraceCase,
      frames: [{ ...validFrame, actionIndex: 0 }, ...validTraceCase.frames.slice(1)],
    }).success).toBe(false)
    expect(legacyObservableTraceCaseSchema.safeParse({
      ...validTraceCase,
      frames: [validFrame, { ...validFrame, sequence: 1 }],
    }).success).toBe(false)
  })

  test('rejects reordered action chunks and observations unrelated to their bound actions', () => {
    const unrelatedTrace = {
      id: 'reordered-unrelated-observations',
      actions: [
        { type: 'select', questionId: 'form', optionId: 'soup' },
        { type: 'continue', fromQuestionId: 'form' },
      ] as const,
      frames: [
        validFrame,
        {
          sequence: 1,
          transition: 'submit',
          actionIndex: 1,
          displayedQuestionId: 'source',
          visibleOptionIds: ['pork'],
          legacyAnswers: { source: ['pork'] },
          observedChanges: {
            answers: [{ questionId: 'tare', before: 'shio', after: 'miso' }],
          },
        },
        {
          sequence: 2,
          transition: 'next',
          actionIndex: 1,
          displayedQuestionId: 'body',
          visibleOptionIds: ['rich'],
          navigation: { direction: 'next', reachedQuestionId: 'noodle' },
          legacyAnswers: { source: ['pork'] },
          observedChanges: {
            visibleOptionIds: {
              questionId: 'archetype',
              before: ['chintan'],
              after: ['aburasoba'],
            },
          },
        },
        {
          sequence: 3,
          transition: 'toggle',
          actionIndex: 0,
          displayedQuestionId: 'tare',
          visibleOptionIds: ['miso'],
          pendingOptionIds: ['miso'],
          legacyAnswers: { tare: 'miso' },
        },
      ],
    } as const

    expect(() => deriveObservableCoverage(unrelatedTrace)).toThrow()
  })

  test('rejects directly observed question and navigation fields unrelated to the bound action', () => {
    const mismatches = [
      validTraceCaseWithoutCoverage.frames.map((frame, index) => (
        index === 1
          ? { ...frame, displayedQuestionId: 'tare', visibleOptionIds: ['miso'] }
          : frame
      )),
      validTraceCaseWithoutCoverage.frames.map((frame, index) => (
        index === 2 ? { ...frame, displayedQuestionId: 'tare' } : frame
      )),
      validTraceCaseWithoutCoverage.frames.map((frame, index) => (
        index === 3
          ? {
              ...frame,
              displayedQuestionId: 'body',
              navigation: { direction: 'next' as const, reachedQuestionId: 'noodle' },
            }
          : frame
      )),
    ]

    for (const frames of mismatches) {
      expect(() => deriveObservableCoverage({
        actions: validTraceCaseWithoutCoverage.actions,
        frames,
      })).toThrow()
    }
  })

  test('accepts only exact adjacent mechanical observedChanges when they are present', () => {
    const exactFrames = validTraceCaseWithoutCoverage.frames.map((frame, index) => (
      index === 1
        ? {
            ...frame,
            observedChanges: {
              answers: [{ questionId: 'form', after: 'soup' }],
            },
          }
        : frame
    ))
    expect(() => deriveObservableCoverage({
      actions: validTraceCaseWithoutCoverage.actions,
      frames: exactFrames,
    })).not.toThrow()

    const fabricatedFrames = exactFrames.map((frame, index) => (
      index === 1
        ? {
            ...frame,
            observedChanges: {
              answers: [{ questionId: 'tare', before: 'shio', after: 'miso' }],
            },
          }
        : frame
    ))
    expect(() => deriveObservableCoverage({
      actions: validTraceCaseWithoutCoverage.actions,
      frames: fabricatedFrames,
    })).toThrow()
  })

  test('maps toggle, continue, and previous actions to their exact frame grammar', () => {
    const previousCaseWithoutCoverage = {
      id: 'previous-case',
      actions: [{ type: 'previous', fromQuestionId: 'archetype' }] as const,
      frames: [
        {
          ...validFrame,
          displayedQuestionId: 'archetype',
        },
        {
          sequence: 1,
          transition: 'previous',
          actionIndex: 0,
          displayedQuestionId: 'form',
          navigation: { direction: 'previous', reachedQuestionId: 'form' },
        },
      ] as const,
    }
    expect(legacyObservableTraceCaseSchema.safeParse({
      ...previousCaseWithoutCoverage,
      coverageTags: deriveObservableCoverage(previousCaseWithoutCoverage),
    }).success).toBe(true)

    const badTransitions = [
      ['next'],
      ['submit'],
      ['submit', 'toggle', 'next'],
      ['submit', 'next', 'complete'],
      ['submit', 'forced-skip'],
    ] as const
    for (const transitions of badTransitions) {
      const frames = [validFrame, ...transitions.map((transition, index) => ({
        sequence: index + 1,
        transition,
        actionIndex: 0,
        ...(transition === 'next'
          ? { navigation: { direction: 'next' as const } }
          : {}),
        ...(transition === 'complete'
          ? { completionMarker: 'results' as const }
          : {}),
        ...(transition === 'forced-skip'
          ? { forcedAutoAnswer: { questionId: 'tare', value: 'miso' } }
          : {}),
      }))]
      const input = {
        id: 'bad-continue',
        actions: [{ type: 'continue', fromQuestionId: 'form' }],
        coverageTags: [],
        frames,
      }
      expect(legacyObservableTraceCaseSchema.safeParse(input).success).toBe(false)
    }
  })

  test('rejects an action whose settled pre-action display names another question', () => {
    const input = {
      id: 'previous-source-mismatch',
      actions: [{ type: 'previous', fromQuestionId: 'archetype' }] as const,
      frames: [
        validFrame,
        {
          sequence: 1,
          transition: 'previous',
          actionIndex: 0,
          displayedQuestionId: 'form',
          navigation: { direction: 'previous' as const, reachedQuestionId: 'form' },
        },
      ],
    } as const

    expect(() => deriveObservableCoverage(input)).toThrow()
  })

  test('rejects toggle state that contradicts its bound select action', () => {
    const input = {
      id: 'toggle-state-mismatch',
      actions: [{ type: 'select', questionId: 'form', optionId: 'soup' }] as const,
      frames: [
        validFrame,
        {
          sequence: 1,
          transition: 'toggle',
          actionIndex: 0,
          displayedQuestionId: 'form',
          visibleOptionIds: ['soup', 'dry'],
          pendingOptionIds: ['dry'],
          legacyAnswers: { form: 'dry' },
          observedChanges: {
            answers: [{ questionId: 'form', after: 'dry' }],
          },
        },
      ],
    } as const

    expect(() => deriveObservableCoverage(input)).toThrow()
  })

  test('rejects select unless the target is absent and enabled before then present after', () => {
    const selectedBefore = {
      actions: [{ type: 'select', questionId: 'form', optionId: 'soup' }] as const,
      frames: [
        {
          ...validFrame,
          pendingOptionIds: ['soup'],
          legacyAnswers: { form: 'soup' },
        },
        {
          sequence: 1,
          transition: 'toggle',
          actionIndex: 0,
          displayedQuestionId: 'form',
          visibleOptionIds: ['soup', 'dry'],
          pendingOptionIds: ['soup'],
          legacyAnswers: { form: 'soup' },
        },
      ],
    } as const
    expect(() => deriveObservableCoverage(selectedBefore)).toThrow()

    const disabledBefore = {
      actions: [{ type: 'select', questionId: 'form', optionId: 'soup' }] as const,
      frames: [
        { ...validFrame, disabledOptionIds: ['soup'] },
        {
          ...validTraceCaseWithoutCoverage.frames[1],
          disabledOptionIds: [],
        },
      ],
    } as const
    expect(() => deriveObservableCoverage(disabledBefore)).toThrow()
    expect(() => deriveObservableCoverage({
      actions: [validTraceCaseWithoutCoverage.actions[0]],
      frames: validTraceCaseWithoutCoverage.frames.slice(0, 2),
    })).not.toThrow()
  })

  test('rejects deselect unless the target is present before and absent after', () => {
    const absentBefore = {
      actions: [{ type: 'deselect', questionId: 'form', optionId: 'dry' }] as const,
      frames: [
        {
          ...validFrame,
          pendingOptionIds: ['soup'],
          legacyAnswers: { form: 'soup' },
        },
        {
          sequence: 1,
          transition: 'toggle',
          actionIndex: 0,
          displayedQuestionId: 'form',
          visibleOptionIds: ['soup', 'dry'],
          pendingOptionIds: ['soup'],
          legacyAnswers: { form: 'soup' },
        },
      ],
    } as const
    expect(() => deriveObservableCoverage(absentBefore)).toThrow()

    const successful = {
      actions: [{ type: 'deselect', questionId: 'form', optionId: 'dry' }] as const,
      frames: [
        {
          ...validFrame,
          pendingOptionIds: ['soup', 'dry'],
          legacyAnswers: { form: ['soup', 'dry'] },
        },
        {
          sequence: 1,
          transition: 'toggle',
          actionIndex: 0,
          displayedQuestionId: 'form',
          visibleOptionIds: ['soup', 'dry'],
          pendingOptionIds: ['soup'],
          legacyAnswers: { form: ['soup'] },
        },
      ],
    } as const
    expect(() => deriveObservableCoverage(successful)).not.toThrow()
  })

  test('rejects next-to-results and complete-to-question terminal contradictions', () => {
    const invalidTerminals = [
      {
        sequence: 2,
        transition: 'next',
        actionIndex: 0,
        navigation: { direction: 'next', reachedScreen: 'results' },
      },
      {
        sequence: 2,
        transition: 'complete',
        actionIndex: 0,
        displayedQuestionId: 'tare',
        navigation: { direction: 'next', reachedQuestionId: 'tare' },
        completionMarker: 'results',
      },
    ] as const

    for (const terminal of invalidTerminals) {
      expect(() => deriveObservableCoverage({
        actions: [{ type: 'continue', fromQuestionId: 'form' }],
        frames: [
          validFrame,
          {
            sequence: 1,
            transition: 'submit',
            actionIndex: 0,
            displayedQuestionId: 'form',
          },
          terminal,
        ],
      })).toThrow()
    }
  })

  test('binds the next action to a reached question when terminal display state is omitted', () => {
    const frames = [
      {
        ...validFrame,
        pendingOptionIds: ['soup'],
        legacyAnswers: { form: 'soup' },
      },
      {
        sequence: 1,
        transition: 'submit',
        actionIndex: 0,
        displayedQuestionId: 'form',
        legacyAnswers: { form: 'soup' },
      },
      {
        sequence: 2,
        transition: 'next',
        actionIndex: 0,
        legacyAnswers: { form: 'soup' },
        navigation: { direction: 'next', reachedQuestionId: 'archetype' },
      },
      {
        sequence: 3,
        transition: 'previous',
        actionIndex: 1,
        legacyAnswers: { form: 'soup' },
        navigation: { direction: 'previous', reachedQuestionId: 'form' },
      },
    ] as const
    const matchingActions = [
      { type: 'continue', fromQuestionId: 'form' },
      { type: 'previous', fromQuestionId: 'archetype' },
    ] as const
    expect(() => deriveObservableCoverage({ actions: matchingActions, frames })).not.toThrow()
    expect(() => deriveObservableCoverage({
      actions: [
        matchingActions[0],
        { type: 'previous', fromQuestionId: 'form' },
      ],
      frames,
    })).toThrow('action source must match')
  })

  test('rejects a forced auto-answer contradicted by the same observed answer frame', () => {
    const input = {
      id: 'forced-answer-mismatch',
      actions: [{ type: 'continue', fromQuestionId: 'form' }] as const,
      frames: [
        validFrame,
        {
          sequence: 1,
          transition: 'submit',
          actionIndex: 0,
          displayedQuestionId: 'form',
        },
        {
          sequence: 2,
          transition: 'forced-skip',
          actionIndex: 0,
          forcedAutoAnswer: { questionId: 'tare', value: 'miso' },
          legacyAnswers: { tare: 'shio' },
        },
        {
          sequence: 3,
          transition: 'complete',
          actionIndex: 0,
          navigation: { direction: 'next', reachedScreen: 'results' },
          completionMarker: 'results',
        },
      ],
    } as const

    expect(() => deriveObservableCoverage(input)).toThrow()
  })

  test('rejects omitted action observations and an unchanged observed toggle', () => {
    const optionalInput = {
      id: 'optional-action-observations',
      actions: [{ type: 'select', questionId: 'form', optionId: 'soup' }] as const,
      frames: [
        { sequence: 0, transition: 'initial' },
        { sequence: 1, transition: 'toggle', actionIndex: 0 },
      ] as const,
    }
    expect(() => deriveObservableCoverage(optionalInput)).toThrow()

    const noOpInput = {
      id: 'observable-max-no-op',
      actions: [{ type: 'select', questionId: 'form', optionId: 'dry' }] as const,
      frames: [
        {
          ...validFrame,
          pendingOptionIds: ['soup'],
          legacyAnswers: { form: 'soup' },
        },
        {
          sequence: 1,
          transition: 'toggle',
          actionIndex: 0,
          displayedQuestionId: 'form',
          visibleOptionIds: ['soup', 'dry'],
          pendingOptionIds: ['soup'],
          legacyAnswers: { form: 'soup' },
        },
      ] as const,
    }
    expect(() => deriveObservableCoverage(noOpInput)).toThrow()
  })

  test.each([
    {
      action: { type: 'select', questionId: 'form', optionId: 'soup' } as const,
      before: [] as readonly string[],
      after: ['soup'] as readonly string[],
    },
    {
      action: { type: 'deselect', questionId: 'form', optionId: 'soup' } as const,
      before: ['soup'] as readonly string[],
      after: [] as readonly string[],
    },
  ])('requires disabled and selection proof for $action.type', ({ action, before, after }) => {
    const frameBase = {
      displayedQuestionId: 'form',
      visibleOptionIds: ['soup', 'dry'],
    } as const
    const missingDisabled = {
      actions: [action],
      frames: [
        { sequence: 0, transition: 'initial', ...frameBase, pendingOptionIds: before },
        {
          sequence: 1,
          transition: 'toggle',
          actionIndex: 0,
          ...frameBase,
          pendingOptionIds: after,
        },
      ],
    } as const
    const missingSelection = {
      actions: [action],
      frames: [
        { sequence: 0, transition: 'initial', ...frameBase, disabledOptionIds: [] },
        { sequence: 1, transition: 'toggle', actionIndex: 0, ...frameBase },
      ],
    } as const

    expect(() => deriveObservableCoverage(missingDisabled)).toThrow()
    expect(() => deriveObservableCoverage(missingSelection)).toThrow()
  })

  test('rejects a toggle with only one directly observed selection boundary', () => {
    const action = [{ type: 'select', questionId: 'form', optionId: 'soup' }] as const
    const missingPost = {
      actions: action,
      frames: [
        {
          sequence: 0,
          transition: 'initial',
          displayedQuestionId: 'form',
          visibleOptionIds: ['soup', 'dry'],
          pendingOptionIds: [],
        },
        {
          sequence: 1,
          transition: 'toggle',
          actionIndex: 0,
          displayedQuestionId: 'form',
          visibleOptionIds: ['soup', 'dry'],
        },
      ],
    } as const
    const missingPre = {
      actions: action,
      frames: [
        {
          sequence: 0,
          transition: 'initial',
          displayedQuestionId: 'form',
          visibleOptionIds: ['soup', 'dry'],
        },
        {
          sequence: 1,
          transition: 'toggle',
          actionIndex: 0,
          displayedQuestionId: 'form',
          visibleOptionIds: ['soup', 'dry'],
          pendingOptionIds: ['soup'],
        },
      ],
    } as const
    expect(() => deriveObservableCoverage(missingPost)).toThrow()
    expect(() => deriveObservableCoverage(missingPre)).toThrow()
  })

  test('requires transition-specific observable markers and forbids them elsewhere', () => {
    expect(legacyObservableTraceFrameSchema.safeParse({
      sequence: 1,
      transition: 'forced-skip',
      actionIndex: 0,
    }).success).toBe(false)
    expect(legacyObservableTraceFrameSchema.safeParse({
      sequence: 1,
      transition: 'toggle',
      actionIndex: 0,
      forcedAutoAnswer: { questionId: 'tare', value: 'miso' },
    }).success).toBe(false)
    expect(legacyObservableTraceFrameSchema.safeParse({
      sequence: 1,
      transition: 'next',
      actionIndex: 0,
      navigation: { direction: 'previous' },
    }).success).toBe(false)
    expect(legacyObservableTraceFrameSchema.safeParse({
      sequence: 1,
      transition: 'complete',
      actionIndex: 0,
    }).success).toBe(false)
  })

  test('accepts a same-action forced-skip chain ending at results', () => {
    const inputWithoutCoverage = {
      id: 'forced-complete',
      actions: [{ type: 'continue', fromQuestionId: 'form' }] as const,
      frames: [
        validFrame,
        { sequence: 1, transition: 'submit', actionIndex: 0 },
        {
          sequence: 2,
          transition: 'forced-skip',
          actionIndex: 0,
          forcedAutoAnswer: { questionId: 'tare', value: 'miso' },
        },
        {
          sequence: 3,
          transition: 'complete',
          actionIndex: 0,
          navigation: { direction: 'next', reachedScreen: 'results' },
          completionMarker: 'results',
        },
      ] as const,
    }
    expect(legacyObservableTraceCaseSchema.safeParse({
      ...inputWithoutCoverage,
      coverageTags: deriveObservableCoverage(inputWithoutCoverage),
    }).success).toBe(true)
  })

  test('accepts terminal and forced-skip observations when optional targets or answers are omitted', () => {
    const inputWithoutCoverage = {
      id: 'optional-terminal-observations',
      actions: [{ type: 'continue', fromQuestionId: 'form' }] as const,
      frames: [
        validFrame,
        { sequence: 1, transition: 'submit', actionIndex: 0 },
        {
          sequence: 2,
          transition: 'forced-skip',
          actionIndex: 0,
          forcedAutoAnswer: { questionId: 'tare', value: 'miso' },
        },
        {
          sequence: 3,
          transition: 'next',
          actionIndex: 0,
          navigation: { direction: 'next' },
        },
      ] as const,
    }
    expect(legacyObservableTraceCaseSchema.safeParse({
      ...inputWithoutCoverage,
      coverageTags: deriveObservableCoverage(inputWithoutCoverage),
    }).success).toBe(true)
  })
})

describe('mechanically derived observable coverage', () => {
  test('derives, deduplicates, and code-point sorts observable tags', () => {
    expect(validTraceCase.coverageTags).toEqual([
      'action:continue',
      'action:select',
      'navigation-target:archetype',
      'option:form:dry',
      'option:form:soup',
      'question:archetype',
      'question:form',
      'transition:initial',
      'transition:next',
      'transition:submit',
      'transition:toggle',
    ])
  })

  test('derives named behaviors only from validated before/after observations', () => {
    const tags = [...new Set([
      ...deriveObservableCoverage({
        actions: [{ type: 'select', questionId: 'form', optionId: 'dry' }],
        frames: [
          {
            ...validFrame,
            legacyAnswers: { form: 'soup' },
            pendingOptionIds: ['soup'],
          },
          {
            sequence: 1,
            transition: 'toggle',
            actionIndex: 0,
            displayedQuestionId: 'form',
            visibleOptionIds: ['dry'],
            pendingOptionIds: ['dry'],
            legacyAnswers: { form: 'dry' },
            observedChanges: {
              visibleOptionIds: {
                questionId: 'form',
                before: ['soup', 'dry'],
                after: ['dry'],
              },
              answers: [{ questionId: 'form', before: 'soup', after: 'dry' }],
            },
          },
        ],
      }),
      ...deriveObservableCoverage({
        actions: [{ type: 'select', questionId: 'source', optionId: 'chicken' }],
        frames: [
          {
            ...validFrame,
            displayedQuestionId: 'source',
            visibleOptionIds: ['pork', 'chicken', 'fish'],
            disabledOptionIds: [],
            pendingOptionIds: ['pork'],
            legacyAnswers: { source: ['pork'] },
          },
          {
            sequence: 1,
            transition: 'toggle',
            actionIndex: 0,
            displayedQuestionId: 'source',
            visibleOptionIds: ['pork', 'chicken', 'fish'],
            disabledOptionIds: ['fish'],
            pendingOptionIds: ['pork', 'chicken'],
            legacyAnswers: { source: ['pork', 'chicken'] },
            observedChanges: {
              answers: [{
                questionId: 'source',
                before: ['pork'],
                after: ['pork', 'chicken'],
              }],
            },
          },
        ],
      }),
      ...deriveObservableCoverage({
        actions: [{ type: 'deselect', questionId: 'exclusions', optionId: 'pork' }],
        frames: [
          {
            ...validFrame,
            displayedQuestionId: 'exclusions',
            visibleOptionIds: ['none', 'pork'],
            pendingOptionIds: ['pork'],
            legacyAnswers: { exclusions: ['pork'] },
          },
          {
            sequence: 1,
            transition: 'toggle',
            actionIndex: 0,
            displayedQuestionId: 'exclusions',
            visibleOptionIds: ['none', 'pork'],
            pendingOptionIds: ['none'],
            legacyAnswers: { exclusions: ['none'] },
            observedChanges: {
              answers: [{ questionId: 'exclusions', before: ['pork'], after: ['none'] }],
            },
          },
        ],
      }),
    ])]
    expect(tags).toEqual(expect.arrayContaining([
      'behavior:branch-visible-change',
      'behavior:branch-answer-change',
      'behavior:exclusive-replacement',
      'behavior:max-selection-blocked',
      'behavior:empty-restoration',
    ]))
  })

  test('does not derive blocked coverage when the option was already disabled', () => {
    const tags = deriveObservableCoverage({
      actions: [{ type: 'select', questionId: 'source', optionId: 'chicken' }],
      frames: [
        {
          sequence: 0,
          transition: 'initial',
          displayedQuestionId: 'source',
          visibleOptionIds: ['pork', 'chicken', 'fish'],
          disabledOptionIds: ['fish'],
          pendingOptionIds: ['pork'],
        },
        {
          sequence: 1,
          transition: 'toggle',
          actionIndex: 0,
          displayedQuestionId: 'source',
          visibleOptionIds: ['pork', 'chicken', 'fish'],
          disabledOptionIds: ['fish'],
          pendingOptionIds: ['pork', 'chicken'],
        },
      ],
    })
    expect(tags).not.toContain('behavior:max-selection-blocked')
  })

  test.each([
    'semantic-class:branch',
    'repair:stale',
    'diagnostic:invalid',
    'invalid-input:option',
    'reachability:all',
    'dependency:form',
    'fixed-point:2',
    'application-result:accepted',
  ])('rejects excluded coverage tag %s', (tag) => {
    expect(legacyObservableTraceCaseSchema.safeParse({
      ...validTraceCase,
      coverageTags: [...validTraceCase.coverageTags, tag],
    }).success).toBe(false)
  })
})

describe('seed, manifest, and divergence contracts', () => {
  test('seed cases reject output-derived coverage metadata', () => {
    expect(legacyObservableSeedCaseSchema.safeParse({
      id: validTraceCase.id,
      actions: validTraceCase.actions,
      coverageTags: validTraceCase.coverageTags,
    }).success).toBe(false)
    expect(legacyObservableSeedFileSchema.safeParse({
      schemaVersion: 1,
      cases: [{
        id: validTraceCase.id,
        actions: validTraceCase.actions,
        frames: validTraceCase.frames,
      }],
    }).success).toBe(false)
  })

  test('frozen manifest accepts immutable lineage and rejects current verification fields', () => {
    expect(fixtureManifestSchema.safeParse(validFixtureManifest).success).toBe(true)
    for (const field of [
      'verifiedSemanticHash',
      'paritySuiteVersion',
      'implementationSha',
      'assurance',
      'generatedAt',
      'hostPath',
    ]) {
      expect(fixtureManifestSchema.safeParse({
        ...validFixtureManifest,
        [field]: field === 'verifiedSemanticHash' ? 'a'.repeat(64) : 'forbidden',
      }).success).toBe(false)
    }
  })

  test('frozen manifest records only the stable npm config policy', () => {
    expect(fixtureManifestSchema.safeParse(validFixtureManifest).success).toBe(true)
    expect(fixtureManifestSchema.safeParse({
      ...validFixtureManifest,
      runtime: {
        ...validFixtureManifest.runtime,
        npmConfigPolicy: {
          ...validFixtureManifest.runtime.npmConfigPolicy,
          userConfigPath: '/private/tmp/random/npm-user-config',
        },
      },
    }).success).toBe(false)
  })

  test('requires the exact ordered authoring sources and their canonical composite hash', () => {
    expect(fixtureManifestSchema.safeParse({
      ...validFixtureManifest,
      extractor: {
        version: 1,
        hash: validFixtureManifest.extractor.hash,
      },
    }).success).toBe(false)
    expect(fixtureManifestSchema.safeParse({
      ...validFixtureManifest,
      extractor: {
        ...validFixtureManifest.extractor,
        sources: [...validAuthoringSources].reverse(),
      },
    }).success).toBe(false)
    expect(fixtureManifestSchema.safeParse({
      ...validFixtureManifest,
      extractor: {
        ...validFixtureManifest.extractor,
        sources: validAuthoringSources.map((source, index) => (
          index === 0 ? { ...source, hash: 'f'.repeat(64) } : source
        )),
      },
    }).success).toBe(false)
  })

  test('requires ordered unique case IDs and matching case count', () => {
    expect(fixtureManifestSchema.safeParse({
      ...validFixtureManifest,
      caseIds: ['a', 'a'],
      caseCount: 2,
    }).success).toBe(false)
    expect(fixtureManifestSchema.safeParse({
      ...validFixtureManifest,
      caseCount: 2,
    }).success).toBe(false)
  })

  test('accepts reviewed frame pointers and operation-specific values', () => {
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [validDivergence],
    }).success).toBe(true)
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [{
        ...validDivergence,
        operation: 'remove',
        approvedValue: undefined,
      }],
    }).success).toBe(true)
  })

  test.each([
    '/frames/1/sequence',
    '/frames/1/transition',
    '/frames/1/actionIndex',
    '/frames/1/completionMarker',
    '/frames/1/forcedAutoAnswer/questionId',
    '/frames/1/forcedAutoAnswer/value',
    '/frames/1/navigation/direction',
    '/frames/1/observedChanges/visibleOptionIds/questionId',
    '/frames/1/observedChanges/answers/0/questionId',
  ])('rejects removal of required observable leaf: %s', (jsonPointer) => {
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [{
        ...validDivergence,
        jsonPointer,
        operation: 'remove',
        approvedValue: undefined,
      }],
    }).success).toBe(false)
  })

  test.each([
    '/frames/1/displayedQuestionId',
    '/frames/1/legacyAnswers/form',
    '/frames/1/navigation/reachedQuestionId',
    '/frames/1/observedChanges/answers/0/before',
    '/frames/1/disabledOptionIds/0',
  ])('retains removal of optional leaves and array elements: %s', (jsonPointer) => {
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [{
        ...validDivergence,
        jsonPointer,
        operation: 'remove',
        approvedValue: undefined,
      }],
    }).success).toBe(true)
  })

  test.each([
    '/canonicalAnswers/form',
    '/frames/1/repairs/0',
    '/frames/1/dependencyClosures/form',
    '/frames/1/fixedPointIterations',
    '/frames/1/accepted',
    '/frames/1/navigationQuery',
  ])('rejects divergence pointer outside observable frames: %s', (jsonPointer) => {
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [{ ...validDivergence, jsonPointer }],
    }).success).toBe(false)
  })

  test.each([
    '/frames/1/wholeFlowState',
    '/frames/1/internalMetadata',
    '/frames/1/whole~1FlowState',
    '/frames/1/internal~0Metadata',
    '/frames/1/unknown~2escape',
    '/frames/1/trailing~',
  ])('rejects unknown or invalidly escaped observable routes: %s', (jsonPointer) => {
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [{ ...validDivergence, jsonPointer }],
    }).success).toBe(false)
  })

  test.each([
    '/frames/1',
    '/frames/1/navigation',
    '/frames/1/visibleOptionIds',
    '/frames/01/displayedQuestionId',
    '/frames/-/displayedQuestionId',
    '/frames/1/visibleOptionIds/01',
  ])('rejects whole, broad, or non-canonical indexed routes: %s', (jsonPointer) => {
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [{ ...validDivergence, jsonPointer }],
    }).success).toBe(false)
  })

  test.each([
    {
      jsonPointer: '/frames/1/legacyAnswers/form',
      operation: 'replace',
      approvedValue: ['soup', 'dry'],
    },
    {
      jsonPointer: '/frames/1/forcedAutoAnswer/questionId',
      operation: 'replace',
      approvedValue: 'tare',
    },
    {
      jsonPointer: '/frames/1/observedChanges/visibleOptionIds/after/0',
      operation: 'replace',
      approvedValue: 'tsukemen',
    },
    {
      jsonPointer: '/frames/1/observedChanges/answers/0/after/0',
      operation: 'replace',
      approvedValue: 'pork',
    },
    {
      jsonPointer: '/frames/1/visibleOptionIds/-',
      operation: 'add',
      approvedValue: 'tsukemen',
    },
    {
      jsonPointer: '/frames/1/pendingOptionIds/0',
      operation: 'remove',
      approvedValue: undefined,
    },
  ] as const)(
    'accepts a legal nested or array-element route: $jsonPointer',
    ({ jsonPointer, operation, approvedValue }) => {
      expect(expectedDivergencesSchema.safeParse({
        schemaVersion: 1,
        entries: [{
          ...validDivergence,
          jsonPointer,
          operation,
          approvedValue,
        }],
      }).success).toBe(true)
    },
  )

  test.each([
    {
      jsonPointer: '/frames/1/actionIndex',
      operation: 'replace',
      approvedValue: '1',
    },
    {
      jsonPointer: '/frames/1/navigation/direction',
      operation: 'replace',
      approvedValue: 'sideways',
    },
    {
      jsonPointer: '/frames/1/visibleOptionIds/-',
      operation: 'replace',
      approvedValue: 'tsukemen',
    },
    {
      jsonPointer: '/frames/1/observedChanges/answers/nope/after',
      operation: 'replace',
      approvedValue: 'pork',
    },
  ] as const)(
    'rejects route-specific operation, index, or value mismatch: $jsonPointer',
    ({ jsonPointer, operation, approvedValue }) => {
      expect(expectedDivergencesSchema.safeParse({
        schemaVersion: 1,
        entries: [{
          ...validDivergence,
          jsonPointer,
          operation,
          approvedValue,
        }],
      }).success).toBe(false)
    },
  )

  test('requires approved values for add/replace and forbids them for remove', () => {
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [{ ...validDivergence, approvedValue: undefined }],
    }).success).toBe(false)
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [{ ...validDivergence, operation: 'remove' }],
    }).success).toBe(false)
  })

  test('rejects divergences whose concrete application invalidates the observable trace', () => {
    const semanticHash = '4'.repeat(64)
    const transitionEntry = {
      ...validDivergence,
      jsonPointer: '/frames/1/transition',
      operation: 'replace' as const,
      legacyValueHash: computeObservableDivergenceValueHash('toggle'),
      approvedValue: 'initial',
      semanticHash,
    }
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [transitionEntry],
    }).success).toBe(true)
    expect(() => applyExpectedDivergences(
      [validTraceCase],
      { schemaVersion: 1, entries: [transitionEntry] },
      semanticHash,
    )).toThrow('invalid observable trace')

    const crossArrayEntry = {
      ...validDivergence,
      jsonPointer: '/frames/1/disabledOptionIds/-',
      operation: 'add' as const,
      legacyValueHash: observableDivergenceMissingValueHash,
      approvedValue: 'soup',
      semanticHash,
    }
    expect(expectedDivergencesSchema.safeParse({
      schemaVersion: 1,
      entries: [crossArrayEntry],
    }).success).toBe(true)
    expect(() => applyExpectedDivergences(
      [validTraceCase],
      { schemaVersion: 1, entries: [crossArrayEntry] },
      semanticHash,
    )).toThrow('invalid observable trace')
  })

  test.each([
    {
      name: 'optional removal',
      jsonPointer: '/frames/2/displayedQuestionId',
      operation: 'remove' as const,
      legacyValue: 'form',
      approvedValue: undefined,
    },
    {
      name: 'array removal',
      jsonPointer: '/frames/2/pendingOptionIds/1',
      operation: 'remove' as const,
      legacyValue: 'dry',
      approvedValue: undefined,
    },
    {
      name: 'array replacement',
      jsonPointer: '/frames/2/pendingOptionIds/1',
      operation: 'replace' as const,
      legacyValue: 'dry',
      approvedValue: 'tsukemen',
    },
    {
      name: 'nested replacement',
      jsonPointer: '/frames/3/navigation/reachedQuestionId',
      operation: 'replace' as const,
      legacyValue: 'archetype',
      approvedValue: 'archetype',
    },
    {
      name: 'array append',
      jsonPointer: '/frames/2/pendingOptionIds/-',
      operation: 'add' as const,
      legacyValue: undefined,
      approvedValue: 'tsukemen',
    },
  ])('applies a schema-valid concrete divergence: $name', ({
    jsonPointer,
    operation,
    legacyValue,
    approvedValue,
  }) => {
    const semanticHash = '4'.repeat(64)
    const withoutCoverage = {
      ...validTraceCase,
      frames: validTraceCase.frames.map((frame, index) => (
        index === 2 ? { ...frame, pendingOptionIds: ['soup', 'dry'] } : frame
      )),
    }
    const traceCase = {
      ...withoutCoverage,
      coverageTags: deriveObservableCoverage(withoutCoverage),
    }
    const entry = {
      ...validDivergence,
      jsonPointer,
      operation,
      legacyValueHash: legacyValue === undefined
        ? observableDivergenceMissingValueHash
        : computeObservableDivergenceValueHash(legacyValue),
      approvedValue,
      semanticHash,
    }
    const applied = applyExpectedDivergences(
      [traceCase],
      { schemaVersion: 1, entries: [entry] },
      semanticHash,
    )
    expect(legacyObservableTraceCaseSchema.safeParse(applied[0]).success).toBe(true)
  })

  test('rejects stale divergence value and semantic hashes at the application boundary', () => {
    const semanticHash = '4'.repeat(64)
    const entry = {
      ...validDivergence,
      jsonPointer: '/frames/1/displayedQuestionId',
      operation: 'replace' as const,
      legacyValueHash: '0'.repeat(64),
      approvedValue: 'form',
      semanticHash,
    }
    expect(() => applyExpectedDivergences(
      [validTraceCase],
      { schemaVersion: 1, entries: [entry] },
      semanticHash,
    )).toThrow('legacy value hash mismatch')
    expect(() => applyExpectedDivergences(
      [validTraceCase],
      {
        schemaVersion: 1,
        entries: [{
          ...entry,
          legacyValueHash: computeObservableDivergenceValueHash('form'),
        }],
      },
      '5'.repeat(64),
    )).toThrow('semantic hash mismatch')
  })

  test('rejects a replace when an earlier array add shifts its frozen target', () => {
    const semanticHash = '4'.repeat(64)
    const withoutCoverage = {
      ...validTraceCase,
      frames: validTraceCase.frames.map((frame, index) => (
        index === 2 ? { ...frame, pendingOptionIds: ['soup', 'dry'] } : frame
      )),
    }
    const traceCase = {
      ...withoutCoverage,
      coverageTags: deriveObservableCoverage(withoutCoverage),
    }
    const entries = [
      {
        ...validDivergence,
        jsonPointer: '/frames/2/pendingOptionIds/0',
        operation: 'add' as const,
        legacyValueHash: observableDivergenceMissingValueHash,
        approvedValue: 'pork',
        semanticHash,
      },
      {
        ...validDivergence,
        jsonPointer: '/frames/2/pendingOptionIds/1',
        operation: 'replace' as const,
        legacyValueHash: computeObservableDivergenceValueHash('dry'),
        approvedValue: 'tsukemen',
        semanticHash,
      },
    ]
    const outcome = (() => {
      try {
        const applied = applyExpectedDivergences(
          [traceCase],
          { schemaVersion: 1, entries },
          semanticHash,
        )
        return {
          status: 'applied',
          pendingOptionIds: applied[0]?.frames[2]?.pendingOptionIds,
        }
      } catch (error) {
        return {
          status: 'rejected',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    })()
    expect(outcome).toEqual({
      status: 'rejected',
      message: 'divergence mutable value hash mismatch',
    })
  })
})

test('parsed trace values remain immutable at the public contract boundary', () => {
  const parsed = legacyObservableTraceCaseSchema.parse(validTraceCase) as LegacyObservableTraceCase
  expect(Object.isFrozen(parsed)).toBe(true)
  expect(Object.isFrozen(parsed.actions)).toBe(true)
  expect(Object.isFrozen(parsed.frames)).toBe(true)
  expect(Object.isFrozen(parsed.frames[0]?.legacyAnswers)).toBe(true)
})
