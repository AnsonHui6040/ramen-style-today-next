import { describe, expect, test } from 'vitest'

import { CLASSIFICATION_CORE_PACKAGE } from './index.js'

describe('classification-core package', () => {
  test('exposes the stable runtime package identity', () => {
    expect(CLASSIFICATION_CORE_PACKAGE).toBe('@ramen-style/classification-core')
  })
})
