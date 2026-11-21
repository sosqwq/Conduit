import { expect, test, type Page } from '@playwright/test'

const skins = [
  { id: 'grove', name: '山野手记' },
  { id: 'dusk', name: '午夜星图' },
  { id: 'dune', name: '赤陶沙丘' },
] as const

function appearance(page: Page) {
  return page.getByRole('button', { name: 'Appearance', exact: true })
}

async function fitsViewport(page: Page) {
  const pageWidth = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  expect(pageWidth.content).toBeLessThanOrEqual(pageWidth.viewport)
}

test('each skin colors the sign-in form and survives navigation and reload', async ({ page }) => {
  const colors = new Set<string>()
  await page.goto('/login')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-skin', 'grove')
  const otherTab = await page.context().newPage()
  await otherTab.goto('/tutorial')
  for (const skin of skins) {
    await appearance(page).click()
    await page.getByText(skin.name, { exact: true }).click()
    await expect(page.getByRole('radio', { name: skin.name, exact: true })).toBeChecked()
    await expect(html).toHaveAttribute('data-skin', skin.id)
    await expect(otherTab.locator('html')).toHaveAttribute('data-skin', skin.id)
    await page.keyboard.press('Escape')
    await page.getByRole('link', { name: 'Need an account?' }).click()
    await expect(page).toHaveURL('/register')
    await expect(html).toHaveAttribute('data-skin', skin.id)
    await page.reload()
    await expect(html).toHaveAttribute('data-skin', skin.id)
    await page.getByRole('link', { name: 'Have an account?' }).click()
    const submit = page.getByRole('button', { name: 'Sign in', exact: true })
    colors.add(await submit.evaluate(button => getComputedStyle(button).backgroundColor))
  }
  expect(colors.size).toBe(skins.length)

  // The saved palette must already be present while the application bundle is loading.
  await page.route('**/*', route => route.request().resourceType() === 'script'
    ? route.abort() : route.continue())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#root')).toBeEmpty()
  await expect(html).toHaveAttribute('data-skin', 'dune')
})

test('the appearance controls support keyboard selection and remember reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const trigger = appearance(page)
  const atmosphere = page.locator('.journal-atmosphere')
  await expect(atmosphere).not.toHaveCSS('animation-name', 'none')
  await page.evaluate(() => document.fonts.ready)
  const idleWidth = await trigger.evaluate(button => getComputedStyle(button).width)
  await trigger.press('Enter')
  const group = page.getByRole('group', { name: 'Color theme' })
  await expect(group).toBeVisible()
  await group.getByRole('radio', { name: '山野手记' }).press('ArrowRight')
  await expect(group.getByRole('radio', { name: '午夜星图' })).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'dusk')
  const motion = page.getByRole('checkbox', { name: 'Reduce motion' })
  await motion.press('Space')
  await expect(motion).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(group).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveCSS('width', idleWidth)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  await expect(atmosphere).toHaveCSS('animation-name', 'none')
  await trigger.click()
  await expect(motion).toBeChecked()
})

test('system reduced motion updates the page while it is open', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/tutorial')
  await appearance(page).click()
  const motion = page.getByRole('checkbox', { name: 'Reduce motion' })
  await expect(motion).not.toBeChecked()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  await expect(motion).toBeChecked()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full')
  await expect(motion).not.toBeChecked()
})

test('a mobile reader can use every skin and open a tutorial chapter without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  const mainNav = page.getByRole('navigation', { name: 'Main navigation' })
  for (const skin of skins) {
    await appearance(page).click()
    const choice = page.getByText(skin.name, { exact: true })
    await expect(choice).toBeInViewport()
    await choice.click()
    await fitsViewport(page)
    await page.keyboard.press('Escape')
    await mainNav.getByRole('link', { name: '教程' }).click()
    await page.locator('a[href="/tutorial/00"]').click()
    await expect(page.getByRole('article').getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-skin', skin.id)
    await fitsViewport(page)
    await mainNav.getByRole('link', { name: 'Home', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Global Feed' })).toBeVisible()
    const coverCaption = page.locator('.home-page .banner p')
    await expect(coverCaption).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(coverCaption).toHaveCSS('text-align', 'left')
    await fitsViewport(page)
  }
})
