import { expect, test, type Page } from '@playwright/test'
import { ru } from './helpers'

/**
 * Next emits more than one `robots` meta tag in development. Asserting on the first one
 * would let a later, permissive tag through, so every tag on the page is checked.
 */
async function expectAllRobotsNoindex(page: Page): Promise<void> {
  const contents = await page.locator('meta[name="robots"]').evaluateAll((tags) =>
    tags.map((tag) => tag.getAttribute('content') ?? ''),
  )

  expect(contents.length, 'page declares no robots directive').toBeGreaterThan(0)
  for (const content of contents) {
    expect(content, 'every robots tag must forbid indexing').toMatch(/noindex/)
  }
}

/**
 * Every assertion here must hold with an empty database too: the catalogue's empty state
 * is a real feature, so "no products" is a pass, not a skip.
 */
test.describe('catalogue', () => {
  test('loads and shows either results or an empty state', async ({ page }) => {
    const response = await page.goto('/ru/products')
    expect(response?.status()).toBe(200)

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const cards = page.getByRole('article')
    const emptyState = page.getByText(ru.catalog.emptyTitle)

    const cardCount = await cards.count()
    if (cardCount === 0) {
      await expect(emptyState).toBeVisible()
      // The cross-sell to a purchase request is a core product idea, not decoration.
      await expect(page.getByText(ru.catalog.emptyCreateRequest)).toBeVisible()
    } else {
      expect(cardCount).toBeGreaterThan(0)
    }
  })

  test('filters travel through the URL', async ({ page }) => {
    // Filtered views must be shareable and crawlable, so state lives in the query string.
    await page.goto('/ru/products?priceMin=10&sort=price_asc')

    await expect(page).toHaveURL(/priceMin=10/)
    await expect(page).toHaveURL(/sort=price_asc/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('a nonsense filter value does not crash the page', async ({ page }) => {
    // productSearchSchema.safeParse must fall back to defaults rather than throw.
    const response = await page.goto('/ru/products?page=abc&sort=nonsense&priceMin=%zz')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  /**
   * An unknown slug must never fall through to the full catalogue, and must never be
   * indexable.
   *
   * It is asserted as "not-found UI + noindex" rather than "HTTP 404" on purpose. The
   * app's root layout lives at `src/app/[locale]/layout.tsx` so that every page carries
   * the correct `lang` attribute; the cost is that there is no root not-found boundary,
   * and Next resolves `notFound()` inside an already-matched route, answering 200. A
   * genuinely unrouted path still returns 404 (asserted below). The trade-off and its
   * mitigation are documented in docs/ARCHITECTURE.md.
   */
  test('an unknown category is not-found and not indexable', async ({ page }) => {
    const response = await page.goto('/ru/category/no-such-category-xyz')
    expect(response).not.toBeNull()

    await expect(page.getByText(ru.states.notFoundTitle)).toBeVisible()
    await expectAllRobotsNoindex(page)

    // The catalogue itself must not have rendered.
    await expect(page.getByRole('article')).toHaveCount(0)
  })

  test('an unknown product is not-found and not indexable', async ({ page }) => {
    await page.goto('/ru/products/no-such-product-xyz')
    await expect(page.getByText(ru.states.notFoundTitle)).toBeVisible()
    await expectAllRobotsNoindex(page)
  })

  test('a genuinely unrouted path returns 404', async ({ page }) => {
    const response = await page.request.get('/ru/no-such-section-at-all')
    expect(response.status()).toBe(404)
  })

  test('the supplier directory responds', async ({ page }) => {
    const response = await page.goto('/ru/suppliers')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('the request board responds and never leaks offer contents', async ({ page }) => {
    const response = await page.goto('/ru/requests')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // The public board may show how many offers exist, never their prices or authors.
    const html = await page.content()
    expect(html).not.toContain('sealedPrice')
  })
})
