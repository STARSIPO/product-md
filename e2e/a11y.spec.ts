import { expect, test, type Page } from '@playwright/test'
import { LOCALE_LABELS, ru } from './helpers'

/**
 * Accessibility assertions written against the DOM directly.
 *
 * No axe-core: adding a dependency for this would pull an auditing engine into the repo
 * for checks that are cheap to state explicitly, and an explicit assertion says which
 * rule the product actually commits to.
 */

const PAGES = ['/ru', '/ru/products', '/ru/requests', '/ru/login']

async function accessibleNameMissing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const offenders: string[] = []
    const controls = document.querySelectorAll<HTMLElement>(
      'input:not([type=hidden]), select, textarea',
    )

    for (const control of controls) {
      const id = control.getAttribute('id')
      const hasLabel = id !== null && document.querySelector(`label[for="${CSS.escape(id)}"]`) !== null
      const hasAriaLabel = control.hasAttribute('aria-label')
      const hasAriaLabelledBy = control.hasAttribute('aria-labelledby')
      const wrappedInLabel = control.closest('label') !== null
      const hasTitle = control.hasAttribute('title')

      if (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy && !wrappedInLabel && !hasTitle) {
        offenders.push(
          `${control.tagName.toLowerCase()}${id ? `#${id}` : ''}[name=${control.getAttribute('name') ?? '?'}]`,
        )
      }
    }

    return offenders
  })
}

test.describe('accessibility', () => {
  for (const path of PAGES) {
    test(`${path} — exactly one h1`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('h1')).toHaveCount(1)
    })

    test(`${path} — every image has alt text`, async ({ page }) => {
      await page.goto(path)

      const missing = await page.evaluate(() =>
        Array.from(document.querySelectorAll('img'))
          .filter((image) => !image.hasAttribute('alt'))
          .map((image) => image.getAttribute('src') ?? '(no src)'),
      )

      expect(missing, `images without alt on ${path}`).toEqual([])
    })

    test(`${path} — every form control has an accessible name`, async ({ page }) => {
      await page.goto(path)
      const offenders = await accessibleNameMissing(page)
      expect(offenders, `unlabelled controls on ${path}`).toEqual([])
    })
  }

  test('skip link is the first focusable element and becomes visible', async ({ page }) => {
    await page.goto('/ru')

    await page.keyboard.press('Tab')

    const focused = page.locator(':focus')
    await expect(focused).toHaveText(ru.a11y.skipToContent)

    // sr-only until focused, then it must actually occupy space on screen.
    const box = await focused.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.width ?? 0).toBeGreaterThan(1)
    expect(box?.height ?? 0).toBeGreaterThan(1)

    await expect(page.locator('#main')).toBeAttached()
  })

  test('keyboard focus is always visible', async ({ page }) => {
    await page.goto('/ru')

    // Walk a few stops and confirm the browser is drawing a focus indicator: the global
    // :focus-visible rule restyles the ring, it must never remove it.
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('Tab')
    }

    const outlineRemoved = await page.evaluate(() => {
      const active = document.activeElement
      if (!active || active === document.body) return false
      const style = window.getComputedStyle(active)
      const noOutline = style.outlineStyle === 'none' || style.outlineWidth === '0px'
      const noRing = style.boxShadow === 'none'
      return noOutline && noRing
    })

    expect(outlineRemoved, 'focused element has neither outline nor ring').toBe(false)
  })

  test('language switcher is a labelled group with a current selection', async ({ page }) => {
    await page.goto('/ru')

    const group = page.getByRole('group', { name: ru.nav.language }).first()
    await expect(group).toBeVisible()

    await expect(
      group.getByRole('button', { name: LOCALE_LABELS.ru, exact: true }),
    ).toHaveAttribute('aria-current', 'true')
    await expect(
      group.getByRole('button', { name: LOCALE_LABELS.ro, exact: true }),
    ).not.toHaveAttribute('aria-current', 'true')
  })

  test('the document declares its language', async ({ page }) => {
    await page.goto('/ru')
    await expect(page.locator('html')).toHaveAttribute('lang', /^ru/)

    await page.goto('/ro')
    await expect(page.locator('html')).toHaveAttribute('lang', /^ro/)
  })
})
