import type { CompiledQuestionModel } from '../../contracts/question-model.js'
import { stableValue } from '../stable-json.js'

export function renderQuestionArtifact(model: CompiledQuestionModel) {
  const value = JSON.stringify(stableValue(model), null, 2)
  return [
    "import { deepFreeze } from '../contracts/deep-freeze.js'",
    '',
    `const compiledQuestionModel = ${value} as const`,
    '',
    'export const questionModel = deepFreeze(compiledQuestionModel)',
    '',
  ].join('\n')
}
