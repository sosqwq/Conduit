import { expect, test } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const directory = resolve('frontend/src/tutorial/chapters')
const chapters = readdirSync(directory)
  .filter(file => /^\d{2}-.+\.md$/.test(file))
  .sort()
  .map(file => ({
    key: file.slice(0, 2),
    title: readFileSync(resolve(directory, file), 'utf8').split('\n')[0].replace(/^#\s+/, '').trim(),
  }))

test('a guest can open every published chapter from the tutorial index', async ({ page }) => {
  await page.goto('/')
  await page.locator('nav a[href="/tutorial"]').click()
  await expect(page).toHaveURL('/tutorial')
  expect(chapters.map(chapter => chapter.key)).toEqual(
    Array.from({ length: 10 }, (_, index) => String(index).padStart(2, '0')),
  )
  for (const chapter of chapters) {
    const link = page.locator(`a[href="/tutorial/${chapter.key}"]`)
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(`/tutorial/${chapter.key}`)
    const article = page.getByRole('article')
    await expect(article.getByRole('heading', { level: 1 })).toHaveText(chapter.title)
    await expect(article.locator('pre code.hljs').first()).toBeVisible()
    await expect(article.getByRole('heading', { name: '参考答案' })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL('/tutorial')
  }
})

test('a chapter works as a direct link on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tutorial/00')
  await expect(page.getByRole('article').getByRole('heading', { level: 1 })).toHaveText(chapters[0].title)
  await expect(page.getByRole('navigation', { name: '相邻章节' }).getByRole('link', { name: /下一章/ })).toBeVisible()
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  expect(fits).toBe(true)
})

test('opening a chapter starts at its title and Back restores the reading position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tutorial')
  const firstChapter = page.locator('a[href="/tutorial/00"]')
  const scrollPosition = () => page.evaluate(() => window.scrollY)
  await firstChapter.scrollIntoViewIfNeeded()
  const indexPosition = await scrollPosition()
  expect(indexPosition).toBeGreaterThan(0)
  await firstChapter.click()
  await expect(page.getByRole('article').getByRole('heading', { level: 1 })).toHaveText(chapters[0].title)
  await expect.poll(scrollPosition).toBe(0)

  const nextChapter = page.getByRole('navigation', { name: '相邻章节' }).getByRole('link', { name: /下一章/ })
  await nextChapter.scrollIntoViewIfNeeded()
  const chapterPosition = await scrollPosition()
  await nextChapter.click()
  await expect(page.getByRole('article').getByRole('heading', { level: 1 })).toHaveText(chapters[1].title)
  await expect.poll(scrollPosition).toBe(0)

  await page.goBack()
  await expect(page.getByRole('article').getByRole('heading', { level: 1 })).toHaveText(chapters[0].title)
  await expect.poll(scrollPosition).toBe(chapterPosition)
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('项目教程')
  await expect.poll(scrollPosition).toBe(indexPosition)
})
