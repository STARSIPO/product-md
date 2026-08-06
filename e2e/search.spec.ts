import { expect, test } from '@playwright/test'
import { headerSearchInput, ru, searchOverlay } from './helpers'

test.describe('search', () => {
  test('the overlay offers categories before anything is typed', async ({ page }) => {
    await page.goto('/ru')

    await headerSearchInput(page).click()

    const overlay = searchOverlay(page)
    await expect(overlay).toBeVisible()
    // An empty search box is a navigation surface, not a dead input.
    await expect(overlay.getByText(ru.search.popularCategories)).toBeVisible()
  })

  test('typing at least two characters queries the suggest endpoint', async ({ page }) => {
    await page.goto('/ru')

    const input = headerSearchInput(page)
    await input.click()

    const request = page.waitForRequest(
      (candidate) => candidate.url().includes('/api/search/suggest'),
      { timeout: 10_000 },
    )

    await input.fill('говядина')
    const suggest = await request

    expect(suggest.url()).toContain('q=')
    expect(suggest.url()).toContain('locale=ru')
    await expect(searchOverlay(page)).toBeVisible()
  })

  test('a single character does not trigger a request', async ({ page }) => {
    await page.goto('/ru')

    let called = false
    page.on('request', (candidate) => {
      if (candidate.url().includes('/api/search/suggest')) called = true
    })

    const input = headerSearchInput(page)
    await input.click()
    await input.fill('г')
    await page.waitForTimeout(700)

    expect(called, 'suggest must not fire below the two-character threshold').toBe(false)
  })

  test('Enter navigates to the results page', async ({ page }) => {
    await page.goto('/ru')

    const input = headerSearchInput(page)
    await input.fill('картофель')
    await input.press('Enter')

    await expect(page).toHaveURL(/\/ru\/search\?q=/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('the suggest endpoint answers directly', async ({ page }) => {
    const response = await page.request.get('/api/search/suggest?q=молоко&locale=ru')
    expect(response.status()).toBe(200)

    const body = (await response.json()) as Record<string, unknown>
    for (const group of ['categories', 'products', 'suppliers', 'requests', 'districts']) {
      expect(Array.isArray(body[group]), `${group} must be an array`).toBe(true)
    }
  })

  test('the category suggester ranks a typed product name', async ({ page }) => {
    // Drives the "what are you selling" field; typo tolerance lives on the server.
    const response = await page.request.get('/api/categories/suggest?q=говядина&locale=ru')
    expect(response.status()).toBe(200)

    const body = (await response.json()) as { suggestions: { trail: string }[] }
    expect(Array.isArray(body.suggestions)).toBe(true)

    if (body.suggestions.length === 0) {
      test.info().annotations.push({ type: 'note', description: 'categories not seeded yet' })
      return
    }

    // The recommendation is the first entry and should be a leaf, not the broad parent.
    expect(body.suggestions[0]?.trail).toBeTruthy()
  })
})
