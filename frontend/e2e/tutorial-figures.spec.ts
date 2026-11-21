import { expect, test } from '@playwright/test'

test('every chapter serves its own illustrated explanation', async ({ page }) => {
  const images = new Set<string>()
  for (let index = 0; index < 10; index++) {
    const chapter = String(index).padStart(2, '0')
    await test.step(`chapter ${chapter}`, async () => {
      await page.goto(`/tutorial/${chapter}`)
      const figure = page.getByRole('article').locator('figure').first()
      const diagram = figure.getByRole('img')
      await diagram.scrollIntoViewIfNeeded()
      await expect(diagram).toHaveAccessibleName(/\S/)
      await expect(figure.locator('figcaption')).toHaveText(/\S/)
      await expect.poll(() => diagram.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
      images.add(await diagram.evaluate((image: HTMLImageElement) => image.currentSrc))
    })
  }
  expect(images.size).toBe(10)
})

test('a reader on a narrow screen can open a vector diagram with the keyboard and go back', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/tutorial/09')
  const figure = page.getByRole('article').locator('figure').first()
  await figure.scrollIntoViewIfNeeded()
  await expect(figure.getByRole('img')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)

  const original = figure.getByRole('link').first()
  expect(await original.evaluate(link => link.tabIndex)).toBeGreaterThanOrEqual(0)
  await original.press('Enter')
  await expect(page.locator('svg:root')).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL('/tutorial/09')
  await expect(figure.getByRole('img')).toBeVisible()
})
