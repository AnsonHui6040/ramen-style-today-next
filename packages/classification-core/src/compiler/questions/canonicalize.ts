import type {
  AllowedOptionDecisionRow,
  AllowedOptionSelection,
  CompiledQuestion,
  OptionDefinitionSource,
  QuestionDefinitionSource,
  SerializableCondition,
} from '../../contracts/question-model.js'
import { compareCodePoints } from '../../contracts/source-path.js'
import { stableJson } from '../stable-json.js'

export type CanonicalQuestion = Omit<CompiledQuestion, 'validSelectionKeys'>

function compareOrdered(
  left: { readonly order: number; readonly id: string },
  right: { readonly order: number; readonly id: string },
) {
  return left.order - right.order || compareCodePoints(left.id, right.id)
}

function canonicalizeCondition(condition: SerializableCondition): SerializableCondition {
  switch (condition.type) {
    case 'answered':
      return { type: 'answered', questionId: condition.questionId }
    case 'answer-includes':
      return {
        type: 'answer-includes',
        questionId: condition.questionId,
        optionId: condition.optionId,
      }
    case 'not':
      return { type: 'not', condition: canonicalizeCondition(condition.condition) }
    case 'all':
    case 'any': {
      const conditions = condition.conditions
        .map(canonicalizeCondition)
        .sort((left, right) => compareCodePoints(stableJson(left), stableJson(right)))
      return { type: condition.type, conditions }
    }
  }
}

function optionIdComparator(options: readonly OptionDefinitionSource[]) {
  const orderById = new Map(options.map((option, index) => [option.id, index]))
  return (left: string, right: string) => {
    const leftOrder = orderById.get(left)
    const rightOrder = orderById.get(right)
    if (leftOrder !== undefined && rightOrder !== undefined && leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    if (leftOrder !== undefined && rightOrder === undefined) return -1
    if (leftOrder === undefined && rightOrder !== undefined) return 1
    return compareCodePoints(left, right)
  }
}

function canonicalizeSelection(
  selection: AllowedOptionSelection,
  compareOptionIds: (left: string, right: string) => number,
): AllowedOptionSelection {
  if (selection.type === 'all') return { type: 'all' }
  return { type: 'only', optionIds: [...selection.optionIds].sort(compareOptionIds) }
}

function canonicalizeDecisionRow(
  row: AllowedOptionDecisionRow,
  compareOptionIds: (left: string, right: string) => number,
): AllowedOptionDecisionRow {
  return {
    when: canonicalizeCondition(row.when),
    selection: canonicalizeSelection(row.selection, compareOptionIds),
  }
}

function canonicalizeOption(option: OptionDefinitionSource) {
  return {
    id: option.id,
    order: option.order,
    messageIds: {
      label: option.messageIds.label,
      ...(option.messageIds.description === undefined
        ? {}
        : { description: option.messageIds.description }),
    },
    ...(option.availableWhen === undefined
      ? {}
      : { availableWhen: canonicalizeCondition(option.availableWhen) }),
    exclusive: option.exclusive ?? false,
  }
}

function canonicalizeQuestion(question: QuestionDefinitionSource): CanonicalQuestion {
  const options = [...question.options].sort(compareOrdered)
  const compareOptionIds = optionIdComparator(options)
  return {
    id: question.id,
    order: question.order,
    messageIds: {
      title: question.messageIds.title,
      description: question.messageIds.description,
    },
    selection: {
      type: question.selection.type,
      min: question.selection.min,
      max: question.selection.max,
      overrides: (question.selection.overrides ?? []).map((override) => ({
        when: canonicalizeCondition(override.when),
        min: override.min,
        max: override.max,
      })),
    },
    ...(question.availableWhen === undefined
      ? {}
      : { availableWhen: canonicalizeCondition(question.availableWhen) }),
    options: options.map(canonicalizeOption),
    allowedOptions: (question.allowedOptions ?? []).map((row) => (
      canonicalizeDecisionRow(row, compareOptionIds)
    )),
    ...(question.autoAnswer === undefined
      ? {}
      : {
          autoAnswer: {
            type: question.autoAnswer.type,
            ...(question.autoAnswer.when === undefined
              ? {}
              : { when: canonicalizeCondition(question.autoAnswer.when) }),
          },
        }),
    initialUiOptionIds: [...(question.initialUiOptionIds ?? [])].sort(compareOptionIds),
    pendingSelection: question.pendingSelection === undefined
      ? { emptyBehavior: { type: 'allow-empty' } }
      : {
          emptyBehavior: question.pendingSelection.emptyBehavior.type === 'allow-empty'
            ? { type: 'allow-empty' }
            : { type: 'restore-initial-ui-options' },
        },
    ...(question.weight === undefined ? {} : { weight: question.weight }),
  }
}

export function canonicalizeQuestionSource(
  questions: readonly QuestionDefinitionSource[],
): readonly CanonicalQuestion[] {
  return [...questions].sort(compareOrdered).map(canonicalizeQuestion)
}
