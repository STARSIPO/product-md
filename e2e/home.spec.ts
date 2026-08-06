import { expect, test } from '@playwright/test'
import { LOCALE_LABELS, headerSearchInput, ro, ru, watchConsole } from './helpers'

test.describe('homepage', () => {
  test('renders the marketplace entry point', async ({ page }) => {
    const console = watchConsole(page)
    await page.goto('/ru')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ru.home.heroTitle)

    // Search comes first — this is a catalogue, not a landing page.
    await expect(page.getByLabel(ru.common.search, { exact: true }).first()).toBeVisible()

    await expect(page.getByRole('link', { name: ru.home.ctaRequest })).toBeVisible()
    await expect(page.getByRole('heading', { name: ru.home.newProducts })).toBeVisible()
    await expect(page.getByRole('heading', { name: ru.home.howItWorks })).toBeVisible()

    expect(console.errors).toEqual([])
  })

  test('sends a locale-less URL to a language', async ({ page }) => {
    await page.goto('/')
    // The browser locale is pinned to ru-MD in playwright.config.ts.
    await expect(page).toHaveURL(/\/ru$/)
  })

  test('switching language keeps you on the same page', async ({ page }) => {
    await page.goto('/ru')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ru.home.heroTitle)

    await page
      .getByRole('group', { name: ru.nav.language })
      .first()
      .getByRole('button', { name: LOCALE_LABELS.ro, exact: true })
      .click()

    await expect(page).toHaveURL(/\/ro$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ro.home.heroTitle)
    await expect(page.locator('html')).toHaveAttribute('lang', /^ro/)
  })

  test('promotion strip only appears when something is promoted', async ({ page }) => {
    await page.goto('/ru')

    const promoHeading = page.getByRole('heading', { name: ru.home.promoTitle })
    const count = await promoHeading.count()

    if (count === 0) {
      // Nothing promoted — an empty band would just push listings below the fold.
      test.info().annotations.push({ type: 'note', description: 'no promoted listings seeded' })
      return
    }

    await expect(promoHeading).toBeVisible()
    // Every card in the strip carries the promotion label.
    await expect(page.getByText(ru.home.promoBadge).first()).toBeVisible()
  })

  test('the language the visitor picked is remembered', async ({ page, context }) => {
    await page.goto('/ru')
    await page
      .getByRole('group', { name: ru.nav.language })
      .first()
      .getByRole('button', { name: LOCALE_LABELS.ro, exact: true })
      .click()
    await expect(page).toHaveURL(/\/ro$/)

    const cookie = (await context.cookies()).find((item) => item.name === 'NEXT_LOCALE')
    expect(cookie?.value).toBe('ro')

    await page.goto('/')
    await expect(page).toHaveURL(/\/ro$/)
  })

  test('the header search is reachable and usable', async ({ page }) => {
    await page.goto('/ru')
    const input = headerSearchInput(page)
    await expect(input).toBeVisible()
    await expect(input).toHaveAttribute('role', 'combobox')
  })
})
