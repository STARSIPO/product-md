import type { Locator, Page, TestInfo } from '@playwright/test'

import { ru } from '../src/lib/i18n/messages/ru'
import { ro } from '../src/lib/i18n/messages/ro'
import { LOCALE_LABELS } from '../src/lib/i18n/config'

/**
 * The switcher shows "ru"/"ro" visually but exposes the full language name to assistive
 * technology (the two-letter form is aria-hidden). Specs must target the accessible
 * name, so they use this rather than the visible text.
 */
export { LOCALE_LABELS }

/**
 * Shared e2e utilities.
 *
 * The dictionaries are imported from the app rather than duplicated as literals: a spec
 * that hardcodes "Оптовые продукты напрямую от поставщиков" starts failing the day
 * marketing rewrites the headline, which teaches everyone to distrust the suite. These
 * modules are plain data with no server-only imports, so Playwright can load them.
 */
export { ru, ro }

export const MOBILE_PROJECT = 'mobile'

export function isMobileProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === MOBILE_PROJECT
}

/**
 * Console noise that is not the application's fault and would make the "no console
 * errors" assertion useless if left in.
 */
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  // Next dev server has no favicon route yet; the browser logs a failed request.
  /favicon\.ico/i,
  // React DevTools nag, emitted by react-dom in development.
  /Download the React DevTools/i,
  // Dev-only websocket used by Fast Refresh; drops on server restart.
  /_next\/webpack-hmr/i,
]

export interface ConsoleWatcher {
  errors: string[]
}

/**
 * Starts collecting `console.error` output and uncaught page exceptions.
 * Call before `page.goto`, read `watcher.errors` after the page has settled.
 */
export function watchConsole(page: Page): ConsoleWatcher {
  const errors: string[] = []

  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return
    errors.push(text)
  })

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`)
  })

  return { errors }
}

/** The bottom navigation bar, identified by the one link only it has: "Главная". */
export function bottomNav(page: Page): Locator {
  return page
    .getByRole('navigation', { name: ru.nav.menu })
    .filter({ has: page.getByRole('link', { name: ru.nav.home, exact: true }) })
}

/** The header search input, which is the combobox that opens the suggestion overlay. */
export function headerSearchInput(page: Page): Locator {
  return page.locator('#global-search')
}

export function searchOverlay(page: Page): Locator {
  return page.locator('#global-search-results')
}

/** True when the route exists — used to fail loudly instead of asserting on a 404 page. */
export async function pageExists(page: Page, path: string): Promise<boolean> {
  const response = await page.request.get(path)
  return response.status() === 200
}

/**
 * Scrolls to the very bottom of the document and waits a frame so that sticky/fixed
 * elements have settled before their boxes are measured.
 */
export async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await page.waitForTimeout(150)
}
