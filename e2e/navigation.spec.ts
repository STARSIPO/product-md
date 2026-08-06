import { expect, test } from '@playwright/test'
import { bottomNav, isMobileProject, ru, scrollToBottom } from './helpers'

/**
 * Runs in both projects. The desktop assertions cover the header; the mobile ones cover
 * the bottom navigation, including the requirement that it never covers page content.
 */
test.describe('navigation', () => {
  const destinations = [
    { path: '/ru/products', heading: ru.catalog.title },
    { path: '/ru/requests', heading: ru.request.title },
    { path: '/ru/suppliers', heading: ru.nav.suppliers },
  ]

  for (const destination of destinations) {
    test(`${destination.path} responds and has a heading`, async ({ page }) => {
      const response = await page.goto(destination.path)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })
  }

  test('localized Romanian routes resolve', async ({ page }) => {
    // /ro/produse is served by the /products page through a middleware rewrite.
    for (const path of ['/ro/produse', '/ro/cereri', '/ro/furnizori']) {
      const response = await page.request.get(path)
      expect(response.status(), `${path} should resolve`).toBe(200)
    }
  })

  test('bottom navigation behaves on mobile', async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'bottom navigation only exists below md')

    await page.goto('/ru')

    const nav = bottomNav(page)
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link')).toHaveCount(5)

    // The layout reserves the bar's height with .pb-safe-nav; prove it by checking that
    // the last piece of content still sits above the bar after scrolling to the bottom.
    await scrollToBottom(page)

    const navBox = await nav.boundingBox()
    expect(navBox).not.toBeNull()

    const footerBox = await page.locator('footer').boundingBox()
    expect(footerBox).not.toBeNull()

    if (navBox && footerBox) {
      const footerBottom = footerBox.y + footerBox.height
      expect(footerBottom, 'footer must end above the bottom navigation').toBeLessThanOrEqual(
        navBox.y + 1,
      )
    }
  })

  test('header links exist on desktop', async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo), 'header nav collapses into a menu below lg')

    await page.goto('/ru')
    const header = page.locator('header')

    await expect(header.getByRole('link', { name: ru.nav.catalog })).toBeVisible()
    await expect(header.getByRole('link', { name: ru.nav.requests })).toBeVisible()
    await expect(header.getByRole('link', { name: ru.nav.suppliers })).toBeVisible()
  })
})
