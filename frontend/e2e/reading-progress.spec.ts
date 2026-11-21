import { expect, test } from '@playwright/test'

test('the reading line follows a chapter and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/tutorial/01')
  const chapter = page.locator('.tutorial-prose')
  const meter = chapter.locator('.reading-progress')
  await expect(meter).toBeAttached()
  const scale = () => meter.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a)
  await expect.poll(scale).toBeLessThan(0.05)
  await chapter.evaluate(element => {
    window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top + (element.clientHeight - window.innerHeight) * 0.5)
  })
  await expect.poll(scale).toBeGreaterThan(0.35)
  expect(await scale()).toBeLessThan(0.7)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(meter).toBeHidden()
})
