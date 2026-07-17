import { describe, expect, test } from 'vitest'

import { resolveSubtype } from './subtype.js'
import { classificationModel } from './test-fixtures.js'
import { cloneClassificationModel } from './test-fixtures.js'

describe('subtype resolution', () => {
  test('resolves every accepted core/noodle pair by exact stable ID', () => {
    let count = 0
    for (const style of classificationModel.styleModel.styles) {
      for (const core of style.cores) {
        for (const subtype of core.subtypes) {
          expect(resolveSubtype(core, subtype.noodleId)).toEqual({
            noodleOptionId: subtype.noodleId,
            matchingSubtypeIds: [subtype.id],
            selectedSubtypeId: subtype.id,
          })
          count += 1
        }
      }
    }
    expect(count).toBe(270)
  })

  test('does not use a first-element fallback', () => {
    const core = classificationModel.styleModel.styles[0]!.cores[0]!
    expect(() => resolveSubtype(core, 'not-a-noodle')).toThrow()
  })

  test('rejects duplicate exact matches', () => {
    const model = cloneClassificationModel()
    const core = model.styleModel.styles[0]!.cores[0]!
    ;(core.subtypes as unknown as Array<(typeof core.subtypes)[number]>).push(
      core.subtypes[0]!,
    )
    expect(() => resolveSubtype(core, core.subtypes[0]!.noodleId)).toThrow()
  })
})
