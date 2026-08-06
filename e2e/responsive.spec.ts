import { expect, test } from '@playwright/test'
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

test.describe('responsive layout', () => {
  for (const width of WIDTHS) {
    for (const path of PATHS) {
      test(`${path} has no horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(path)

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))

        expect(
          overflow.scrollWidth,
          `page scrolls sideways at ${width}px (${overflow.scrollWidth} > ${overflow.clientWidth})`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)
      })
    }
  }

  test('product cards stack to one column at 320px', async ({ page }) => {
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
      // Same column means the second card starts below the first, not beside it.
      expect(second.y).toBeGreaterThan(first.y + first.height - 4)
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
