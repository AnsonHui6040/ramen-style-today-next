import { describe, expect, test } from 'vitest'

import type {
  CompiledQuestionModel,
  QuestionDefinitionSource,
} from '../../contracts/question-model.js'
import { questionDefinitions } from '../../definitions/questions.js'
import { compileQuestions } from './compile.js'
import { renderQuestionArtifact } from './serialize.js'

function compileOrThrow(definitions: readonly QuestionDefinitionSource[]): CompiledQuestionModel {
  const result = compileQuestions(definitions)
  if (!result.ok) throw new Error(`test definitions must compile: ${JSON.stringify(result.diagnostics)}`)
  return result.model
}

describe('question artifact serialization', () => {
  test('renders identical bytes from compiled equivalent reordered source', () => {
    const reordered = [...questionDefinitions].reverse().map((question) => ({
      ...question,
      options: [...question.options].reverse(),
    })) as readonly QuestionDefinitionSource[]

    expect(renderQuestionArtifact(compileOrThrow(questionDefinitions))).toBe(
      renderQuestionArtifact(compileOrThrow(reordered)),
    )
  })

  test('renders stable TypeScript with only the browser-neutral freeze import', () => {
    const rendered = renderQuestionArtifact(compileOrThrow(questionDefinitions))

    expect(rendered.startsWith([
      "import { deepFreeze } from '../contracts/deep-freeze.js'",
      '',
      'const compiledQuestionModel = {',
    ].join('\n'))).toBe(true)
    expect(rendered.endsWith([
      '} as const',
      '',
      'export const questionModel = deepFreeze(compiledQuestionModel)',
      '',
    ].join('\n'))).toBe(true)
    expect(rendered.match(/^import .+$/gm)).toEqual([
      "import { deepFreeze } from '../contracts/deep-freeze.js'",
    ])
    expect(rendered).not.toContain('node:')
    expect(rendered).not.toContain('generatedAt')
    expect(rendered).not.toContain('commitSha')
    expect(rendered).not.toContain(process.cwd())
  })

  test('orders object keys canonically without changing canonical array order', () => {
    const rendered = renderQuestionArtifact(compileOrThrow(questionDefinitions))

    expect(rendered.indexOf('  "dependentClosures"')).toBeLessThan(
      rendered.indexOf('  "forcedIterationUpperBound"'),
    )
    expect(rendered.indexOf('  "forcedIterationUpperBound"')).toBeLessThan(
      rendered.indexOf('  "metadata"'),
    )
    expect(rendered.indexOf('      "id": "form"')).toBeLessThan(
      rendered.indexOf('      "id": "archetype"'),
    )
    expect(rendered.indexOf('          "id": "soup"')).toBeLessThan(
      rendered.indexOf('          "id": "tsukemen"'),
    )
  })
})
