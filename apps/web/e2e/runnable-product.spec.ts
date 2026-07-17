import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const screenshots = resolve(import.meta.dirname, '../../../output/playwright/screenshots')
mkdirSync(screenshots, { recursive: true })

const normalSelections = [
  '湯拉麵',
  '清湯',
  '醬油',
  '雞',
  '平衡',
  '細直麵',
  '柚子與柑橘',
  '沒有需要排除',
] as const

const blockedSelections = [
  '湯拉麵',
  '清湯',
  '醬油',
  '豬',
  '清爽',
  '細直麵',
  '海苔與菠菜',
  '豬',
] as const

function collectBrowserErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function answerCurrentQuestion(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click()
  const finish = page.getByRole('button', { name: '完成並看結果' })
  if (await finish.isVisible()) await finish.click()
  else await page.getByRole('button', { name: '下一步' }).click()
}

test('normal completion uses the real flow, scoring and eligibility runtimes', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /從口味出發/ })).toBeVisible()
  await page.screenshot({ path: resolve(screenshots, 'desktop-home.png'), fullPage: true })
  await page.getByRole('button', { name: '開始尋找拉麵風格' }).click()
  await expect(page.getByRole('heading', { name: '今天想吃哪一種？' })).toBeVisible()
  await page.screenshot({ path: resolve(screenshots, 'desktop-questionnaire.png'), fullPage: true })
  for (const selection of normalSelections) await answerCurrentQuestion(page, selection)
  await expect(page).toHaveURL(/\/results$/)
  await expect(page.getByRole('heading', { name: '主要推薦' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '也可以試試' })).toBeVisible()
  await expect(page.getByText('分數', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('信心', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: resolve(screenshots, 'desktop-results.png'), fullPage: true })
  await page.getByRole('button', { name: '以這個風格找拉麵' }).click()
  await expect(page).toHaveURL(/\/finder$/)
  await expect(page.getByText('初始風格')).toBeVisible()
  await expect(page.getByText(/^style:/)).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('eligibility conflicts remain warnings and never become safety guarantees', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)
  await page.goto('/')
  await page.getByRole('button', { name: '開始尋找拉麵風格' }).click()
  for (const selection of blockedSelections) await answerCurrentQuestion(page, selection)
  const warning = page.getByTestId('eligibility-warning')
  await expect(warning).toBeVisible()
  await expect(warning).toContainText('所選排除條件與部分候選風格標籤衝突')
  await expect(page.getByText('原本的高分候選已被排除')).toBeVisible()
  await expect(page.getByText(/無過敏原|安全保證/)).toHaveCount(0)
  await page.screenshot({
    path: resolve(screenshots, 'eligibility-blocked-result.png'),
    fullPage: true,
  })
  expect(browserErrors).toEqual([])
})

test('reload resumes a partial mobile questionnaire and rebuilds completed results', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '開始尋找拉麵風格' }).click()
  for (const selection of normalSelections.slice(0, 3)) {
    await answerCurrentQuestion(page, selection)
  }
  await expect(page.getByRole('heading', { name: '哪種出汁或主角最明顯？' })).toBeVisible()
  await page.screenshot({ path: resolve(screenshots, 'mobile-questionnaire.png'), fullPage: true })
  await page.reload()
  await expect(page.getByRole('heading', { name: '哪種出汁或主角最明顯？' })).toBeVisible()
  for (const selection of normalSelections.slice(3)) await answerCurrentQuestion(page, selection)
  await expect(page).toHaveURL(/\/results$/)
  await page.screenshot({ path: resolve(screenshots, 'mobile-results.png'), fullPage: true })
  const primaryName = await page.locator('.primary-grid .result-card h3').first().textContent()
  await page.reload()
  await expect(page).toHaveURL(/\/results$/)
  await expect(page.locator('.primary-grid .result-card h3').first()).toHaveText(primaryName ?? '')
  expect(browserErrors).toEqual([])
})
