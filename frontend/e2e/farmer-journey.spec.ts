import { expect, test, type Page } from '@playwright/test'

/**
 * Full farmer journey against the running stack:
 * register → onboarding → draw a field → create a paddy plan → scrub the timeline.
 * Uses a unique synthetic account per run; the drawn field is a test polygon, not real land.
 */
const uid = Date.now().toString(36)
const email = `e2e.${uid}@example.test`
const password = 'paddyfield42'

async function register(page: Page) {
  await page.goto('/register')
  await page.getByLabel('Full name').fill('E2E Farmer')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/onboarding/)
}

async function drawSquare(page: Page) {
  const canvas = page.locator('.maplibregl-canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 3
  const d = Math.min(box.width, box.height) / 8
  const pts = [
    [cx - d, cy - d],
    [cx + d, cy - d],
    [cx + d, cy + d],
    [cx - d, cy + d],
  ]
  for (const [x, y] of pts) {
    await page.mouse.click(x, y)
    await page.waitForTimeout(150)
  }
  await page.mouse.click(pts[0][0], pts[0][1]) // close the ring
}

test('register, map a field, plan paddy and scrub the timeline', async ({ page }) => {
  await register(page)

  // Onboarding: English → district → acres → draw field
  await page.getByRole('button', { name: 'English' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('District').selectOption('Thanjavur')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /Acres/ }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Draw my field' }).click()
  await expect(page).toHaveURL(/\/app\/map/)

  // Zoom to a known place via search (synthetic test location in the Cauvery delta).
  const search = page.getByRole('combobox')
  await search.fill('Thanjavur')
  await page.getByRole('option').first().click()
  await page.waitForTimeout(1500)

  await page.getByRole('button', { name: 'Draw a field' }).first().click()
  await drawSquare(page)
  const panel = page.locator('aside, section[aria-label="Field panel"]').filter({ hasText: 'New field' }).first()
  await expect(panel.getByText('Geodesic · server')).toBeVisible()
  await panel.getByLabel('Field name').fill(`E2E plot ${uid}`)
  await panel.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/app\/lands\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: `E2E plot ${uid}` })).toBeVisible()

  // Create a paddy plan
  await page.getByRole('link', { name: 'New crop plan' }).first().click()
  await page.getByLabel('Crop').selectOption('paddy')
  await page.getByLabel('Cultivation method').selectOption('transplanting')
  const today = new Date()
  const anchor = new Date(today.getTime() - 20 * 86_400_000).toISOString().slice(0, 10)
  await page.getByLabel('Transplanting date').fill(anchor)
  await page.getByRole('button', { name: 'Create crop plan' }).click()
  await expect(page).toHaveURL(/\/app\/plans\/[0-9a-f-]+$/)
  await expect(page.getByText('Visualisation of the crop model — not an observation of your field')).toBeVisible()

  // Scrub the timeline with the keyboard and check the day panel follows.
  const slider = page.getByRole('slider', { name: /Crop season timeline/ })
  await expect(slider).toBeVisible()
  const before = await slider.getAttribute('aria-valuenow')
  await slider.focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(slider).not.toHaveAttribute('aria-valuenow', before ?? '')
  const after = Number(await slider.getAttribute('aria-valuenow'))
  expect(after).toBe(Number(before) + 7)

  // Play/pause controls and stage navigation
  await page.getByRole('button', { name: 'Next stage' }).click()
  await page.getByRole('button', { name: 'Play' }).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.getByRole('button', { name: 'Today' }).click()
})

test('rejects a wrong password', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('nobody@example.test')
  await page.getByLabel('Password').fill('not-the-password-1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible()
})
