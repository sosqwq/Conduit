import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { register } from '../../scripts/official-specs/specs/e2e/helpers/auth'
import { createArticle } from '../../scripts/official-specs/specs/e2e/helpers/articles'

test('a reader can follow an author and add or remove the article from their own favorites', async ({ page, browser, baseURL }) => {
  const id = randomUUID().replaceAll('-', '').slice(0, 14)
  const authorName = `writer${id}`
  const readerName = `reader${id}`
  const title = `A reader journey ${id}`
  await register(page, authorName, `${authorName}@example.test`, 'reader-demo-password')
  await createArticle(page, { title, description: 'A shared article', body: 'Two accounts read the same article.' })
  const articlePath = new URL(page.url()).pathname
  const reader = await browser.newPage({ baseURL })
  try {
    await register(reader, readerName, `${readerName}@example.test`, 'reader-demo-password')
    await reader.goto(`/profile/${authorName}`)
    const followResult = reader.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/follow'))
    await reader.getByRole('button', { name: `Follow ${authorName}`, exact: true }).click()
    expect((await followResult).ok()).toBe(true)
    await reader.goto('/?feed=following')
    await reader.locator('.preview-link').filter({ hasText: title }).click()
    await expect(reader).toHaveURL(articlePath)
    const favoriteResult = reader.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/favorite'))
    await reader.getByRole('button', { name: /Favorite Article/i }).click()
    expect((await favoriteResult).ok()).toBe(true)
    await reader.goto(`/profile/${readerName}/favorites`)
    const preview = reader.locator('.article-preview').filter({ hasText: title })
    await expect(preview).toBeVisible()
    await preview.getByRole('button').click()
    await expect(reader.getByText(/no articles/i)).toBeVisible()
    await reader.reload()
    await expect(reader.getByText(/no articles/i)).toBeVisible()
    await reader.goto(`/profile/${authorName}`)
    const unfollowResult = reader.waitForResponse(response => response.request().method() === 'DELETE' && response.url().endsWith('/follow'))
    await reader.getByRole('button', { name: `Unfollow ${authorName}`, exact: true }).click()
    expect((await unfollowResult).ok()).toBe(true)
    await reader.goto('/?feed=following')
    await expect(reader.locator('.empty-feed-message')).toBeVisible()
    await expect(reader.locator('.preview-link')).toHaveCount(0)
  } finally {
    await reader.close()
  }
})
