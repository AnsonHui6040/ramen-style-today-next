import { styleDefinitionBundle } from '../../definitions/styles/index.js'
import { questionModel } from '../../generated/question-model.js'
import type { CompiledQuestionModel } from '../../contracts/question-model.js'
import type { StyleDefinitionBundleSource } from '../../contracts/style-model.js'

export const styleBundleFallbackSource =
  'packages/classification-core/src/definitions/styles/index.ts'

export type DeepMutable<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer Item)[]
      ? DeepMutable<Item>[]
      : T extends object
        ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
        : T

function mutableClone<T>(value: T): DeepMutable<T> {
  return JSON.parse(JSON.stringify(value)) as DeepMutable<T>
}

export function canonicalStyleDefinitionBundleFixture(): DeepMutable<StyleDefinitionBundleSource> {
  return mutableClone(styleDefinitionBundle)
}

export function acceptedQuestionModelFixture(): DeepMutable<CompiledQuestionModel> {
  return mutableClone(questionModel)
}

export function styleDefinitionBundleFixture() {
  return {
    sourceFile: styleBundleFallbackSource,
    modelVersion: 'batch3a.1.0',
    taxonomy: {
      sourceFile: 'packages/classification-core/src/definitions/styles/taxonomy.ts',
      families: [{ id: 'soup', priority: 0, formOptionId: 'soup' }],
      intensities: [{
        id: 'clean',
        priority: 0,
        labelMessageId: 'intensity-clean-label',
        summaryMessageId: 'intensity-clean-summary',
        bodyRule: {
          questionId: 'body',
          tiers: [{ tier: 'exact', optionIds: ['light'] }],
        },
      }],
      noodles: [{
        id: 'thin-straight',
        priority: 0,
        labelMessageId: 'noodle-thin-straight-label',
        summaryMessageId: 'noodle-thin-straight-summary',
      }],
      exclusionTags: [{
        id: 'pork',
        priority: 0,
        exclusionsOptionId: 'pork',
      }],
      ruleQuestions: [{
        questionId: 'broth',
        priority: 0,
        source: 'style-base',
      }],
    },
    definitions: [{
      sourceFile: 'packages/classification-core/src/definitions/styles/demo-style.ts',
      id: 'demo-style',
      family: 'soup',
      displayPriority: 0,
      messageIds: {
        label: 'style-demo-label',
        summary: 'style-demo-summary',
      },
      accent: '#123456',
      supportedIntensityIds: ['clean'],
      supportedNoodleIds: ['thin-straight'],
      baseRules: [{
        questionId: 'broth',
        tiers: [{ tier: 'exact', optionIds: ['clear'] }],
      }],
      bonuses: [{
        id: 'demo-bonus',
        priority: 0,
        labelMessageId: 'adjustment-demo-bonus-label',
        points: 1,
        minMatches: 1,
        conditions: [{
          priority: 0,
          questionId: 'broth',
          optionIds: ['clear'],
        }],
      }],
      conflicts: [{
        id: 'demo-conflict',
        priority: 0,
        labelMessageId: 'adjustment-demo-conflict-label',
        penalty: 1,
        whenAll: [{
          priority: 0,
          questionId: 'broth',
          optionIds: ['rich'],
        }],
      }],
      exclusionTags: ['pork'],
    }],
  }
}
