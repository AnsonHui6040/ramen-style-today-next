import { expect, test } from 'vitest'

import { pageFromPath, pathFor } from './App.js'

const pagesBasePath = '/ramen-style-today-next/'

test('resolves root-hosted routes without changing their public paths', () => {
  expect(pageFromPath('/', '/')).toBe('home')
  expect(pageFromPath('/questionnaire', '/')).toBe('quiz')
  expect(pageFromPath('/results/', '/')).toBe('results')
  expect(pageFromPath('/finder', '/')).toBe('finder')
  expect(pageFromPath('/not-a-route', '/')).toBe('not-found')

  expect(pathFor('home', '/')).toBe('/')
  expect(pathFor('quiz', '/')).toBe('/questionnaire')
  expect(pathFor('results', '/')).toBe('/results')
  expect(pathFor('finder', '/')).toBe('/finder')
})

test('removes and restores the GitHub Pages deployment base path', () => {
  expect(pageFromPath('/ramen-style-today-next/', pagesBasePath)).toBe('home')
  expect(pageFromPath(
    '/ramen-style-today-next/questionnaire/',
    pagesBasePath,
  )).toBe('quiz')
  expect(pageFromPath('/ramen-style-today-next/results/', pagesBasePath)).toBe('results')
  expect(pageFromPath('/ramen-style-today-next/finder/', pagesBasePath)).toBe('finder')
  expect(pageFromPath('/ramen-style-today-next/not-a-route', pagesBasePath))
    .toBe('not-found')
  expect(pageFromPath('/questionnaire', pagesBasePath)).toBe('not-found')

  expect(pathFor('home', pagesBasePath)).toBe('/ramen-style-today-next/')
  expect(pathFor('quiz', pagesBasePath))
    .toBe('/ramen-style-today-next/questionnaire/')
  expect(pathFor('results', pagesBasePath)).toBe('/ramen-style-today-next/results/')
  expect(pathFor('finder', pagesBasePath)).toBe('/ramen-style-today-next/finder/')
})
