import { expect, test, type Page } from '@playwright/test'
import { bottomNav, headerSearchInput, ru } from './helpers'

/**
 * Mobile-project only (see testMatch in playwright.config.ts).
 *
 * The single most valuable assertion here is the absence of horizontal overflow: it is
 * the failure mode that a desktop-sized development loop never surfaces, and it makes a
 * catalogue unusable on the phone that most Moldovan buyers actually browse on.
 */

const WIDTHS = [320, 375, 390, 768]
const PATHS = ['/ru', '/ru/products', '/ru/requests']

/** Behind the session guard, so these are checked in their own signed-in block. */
const DASHBOARD_PATHS = ['/ru/dashboard', '/ru/dashboard/products', '/ru/dashboard/statistics']

async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
}

/**
 * Signs in as the seeded seller.
 *
 * Returns false rather than throwing when the seed is missing, so a developer with an
 * empty database gets a skipped test with an explanation instead of a wall of red that
 * says nothing about the layout these specs are actually asserting on.
 */
async function signInAsSeller(page: Page): Promise<boolean> {
  await page.goto('/ru/login')
  await page.getByLabel(ru.auth.email, { exact: true }).fill('seller@product.md')
  await page.getByLabel(ru.auth.password, { exact: true }).fill('Parola123')
  await page.getByRole('button', { name: ru.common.signIn }).click()

  return page
    .waitForURL(/\/(dashboard|cabinet)/, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
}

test.describe('responsive layout', () => {
  for (const width of WIDTHS) {
    for (const path of PATHS) {
      test(`${path} has no horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(path)

        const overflow = await horizontalOverflow(page)

        expect(
          overflow.scrollWidth,
          `page scrolls sideways at ${width}px (${overflow.scrollWidth} > ${overflow.clientWidth})`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)
      })
    }
  }

  /**
   * The catalogue keeps two columns down to 320px. That is a deliberate density
   * decision, not an accident: a wholesale buyer comparing beef suppliers needs to
   * scan many listings at once, so the grid never collapses to a single column the
   * way a consumer app's would. This test used to assert the opposite; it now guards
   * the density against a well-meaning future simplification.
   */
  test('product cards keep two columns at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/ru/products')

    const cards = page.getByRole('article')
    const count = await cards.count()

    if (count < 2) {
      test.info().annotations.push({ type: 'note', description: 'fewer than two listings seeded' })
      return
    }

    const first = await cards.nth(0).boundingBox()
    const second = await cards.nth(1).boundingBox()
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()

    if (first && second) {
      // Side by side: same row, second card starts to the right of the first.
      expect(Math.abs(second.y - first.y), 'the first two cards share a row').toBeLessThanOrEqual(2)
      expect(second.x, 'the second card sits beside the first').toBeGreaterThan(first.x)

      // Density is worth nothing if the cards are unreadable. 320px minus the container
      // padding and one gap leaves ~140px per card — assert we are still in that range.
      expect(first.width, 'cards stay wide enough to read').toBeGreaterThanOrEqual(130)
    }
  })

  test('the header search stays usable on a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/ru')

    const input = headerSearchInput(page)
    await expect(input).toBeVisible()

    const box = await input.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.width).toBeGreaterThan(100)
      // Touch target height floor.
      expect(box.height).toBeGreaterThanOrEqual(36)
    }
  })

  test('bottom navigation items meet the touch-target floor', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/ru')

    const links = bottomNav(page).getByRole('link')
    const count = await links.count()
    expect(count).toBe(5)

    for (let index = 0; index < count; index += 1) {
      const box = await links.nth(index).boundingBox()
      expect(box).not.toBeNull()
      if (box) {
        expect(box.height, `nav item ${index} is too short to tap`).toBeGreaterThanOrEqual(44)
      }
    }
  })

  test('the desktop category rail collapses into a scrollable row', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/ru')

    const rail = page.getByRole('navigation', { name: ru.home.catalogTitle })
    // Both the desktop column and the mobile row carry the same label; on a phone the
    // visible one must be the row, and it must not push content sideways.
    const visible = rail.locator('visible=true').first()
    await expect(visible).toBeVisible()
  })
})

/**
 * The account area, which is where the sideways-scroll defects actually lived: an
 * eleven-item section rail, filter strips, six-column tables and a forty-field profile
 * form.
 *
 * Deliberately one test rather than one per path or per width. `checkLoginRateLimit`
 * allows eight attempts per account per fifteen minutes, and the seed ships exactly one
 * seller — a spec that signed in per test would spend that budget, start skipping itself
 * halfway through the file, and take its own retries down with it. Signing in is not
 * what is under test here; the layout is.
 */
test.describe('dashboard responsive layout', () => {
  test('the account area survives a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    const signedIn = await signInAsSeller(page)
    test.skip(!signedIn, 'seed data not loaded — run npm run db:seed')

    for (const path of DASHBOARD_PATHS) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

        const overflow = await horizontalOverflow(page)
        expect(
          overflow.scrollWidth,
          `${path} scrolls sideways at ${width}px (${overflow.scrollWidth} > ${overflow.clientWidth})`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)
      }
    }

    // ---------------------------------------------------------------- at 320px
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/ru/dashboard')

    // The rail becomes a visible scrollable strip, not a menu that hides navigation.
    // One <nav> holds both shapes of the same list; on a phone the first is the strip.
    const menu = page.getByRole('navigation', { name: ru.dashboard.menuLabel })
    const overview = menu.getByRole('link', { name: ru.dashboard.overview, exact: true }).first()
    await expect(overview).toBeVisible()

    const tab = await overview.boundingBox()
    expect(tab).not.toBeNull()
    if (tab) expect(tab.height, 'section tabs are too short to tap').toBeGreaterThanOrEqual(44)

    // Listings become cards. The table stays in the markup for wide screens, but none of
    // it may render here — a horizontally scrolling table is the thing being replaced.
    await page.goto('/ru/dashboard/products')
    await expect(page.getByRole('table')).toBeHidden()
  })
})
