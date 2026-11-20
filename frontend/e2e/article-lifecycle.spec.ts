import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createArticle, deleteArticle, editArticle } from '../../scripts/official-specs/specs/e2e/helpers/articles'
import { generateUniqueUser, register } from '../../scripts/official-specs/specs/e2e/helpers/auth'
import { addComment } from '../../scripts/official-specs/specs/e2e/helpers/comments'

test('renaming a published article preserves its comments and updates its tag feed', async ({ page }) => {
  const user = generateUniqueUser()
  const tag = `lifecycle-${randomUUID()}`
  await register(page, user.username, user.email, user.password)
  await createArticle(page, { title: `Draft ${tag}`, description: 'Editing in place', body: '**Hello**', tags: [tag] })
  const originalPath = new URL(page.url()).pathname
  const comment = `A note on ${tag}`
  await addComment(page, comment)
  await expect(page.locator('.card-text').filter({ hasText: comment })).toBeVisible()

  const newTitle = `Published ${tag}`
  await editArticle(page, originalPath.split('/').pop()!, { title: newTitle })
  const updatedPath = new URL(page.url()).pathname
  expect(updatedPath).not.toBe(originalPath)
  await page.reload()
  await expect(page.getByRole('heading', { name: newTitle, exact: true })).toBeVisible()
  await expect(page.locator('.card-text').filter({ hasText: comment })).toBeVisible()
  const oldResponse = await page.request.get(`/api/articles/${originalPath.split('/').pop()}`)
  expect(oldResponse.status()).toBe(404)

  await page.goto(`/tag/${tag}`)
  const preview = page.locator('.article-preview .preview-link')
  await expect(preview).toHaveCount(1)
  await expect(preview).toHaveAttribute('href', updatedPath)
  await preview.click()
  await deleteArticle(page)
  await page.goto(`/tag/${tag}`)
  await expect(page.locator('.empty-feed-message')).toBeVisible()
  await expect(page.locator('.article-preview .preview-link')).toHaveCount(0)
})
