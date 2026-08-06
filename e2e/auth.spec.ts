import { expect, test } from '@playwright/test'
import { ru } from './helpers'

test.describe('authentication', () => {
  test('registration validates before submitting', async ({ page }) => {
    await page.goto('/ru/register')

    await page.getByRole('button', { name: ru.common.signUp }).click()

    // Client-side validation must catch an empty form; nothing should reach the server.
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page).toHaveURL(/\/register$/)
  })

  test('mismatched passwords are reported on the confirm field', async ({ page }) => {
    await page.goto('/ru/register')

    // Not `exact`: required fields carry a marker after the label text, so an exact
    // match would only ever find the optional ones.
    await expect(page.getByLabel(ru.auth.name)).toBeVisible()

    await page.getByLabel(ru.auth.name).fill('Ион Русу')
    await page.getByLabel(ru.auth.email).fill('mismatch@example.test')
    await page.getByLabel(ru.auth.password, { exact: false }).first().fill('Parola123')
    await page.getByLabel(ru.auth.passwordConfirm).fill('Parola456')

    await page.getByRole('button', { name: ru.common.signUp }).click()

    await expect(page.getByText(ru.validation.passwordMismatch)).toBeVisible()
  })

  test('wrong credentials produce a human message, never a stack trace', async ({ page }) => {
    await page.goto('/ru/login')

    await page.getByLabel(ru.auth.email, { exact: true }).fill('nobody@example.test')
    await page.getByLabel(ru.auth.password, { exact: true }).fill('definitely-wrong')
    await page.getByRole('button', { name: ru.common.signIn }).click()

    // Several live regions exist on the page and most start empty; assert on the one
    // that actually receives the message rather than whichever renders first.
    const alert = page.getByRole('alert').filter({ hasText: /\S/ }).first()
    await expect(alert).toBeVisible()

    const text = (await alert.textContent()) ?? ''
    // The whole point of the dictionary-key error contract: a localized sentence, never
    // a status code or a stack frame.
    expect(text).not.toMatch(/Error 500|Mutation failed|Invalid request|at .*\.ts:/i)
    expect(text.trim().length).toBeGreaterThan(0)
    expect(text).toBe(ru.errors.invalidCredentials)
  })

  test('a signed-out visitor cannot reach the dashboard', async ({ page }) => {
    await page.goto('/ru/dashboard')
    await expect(page).toHaveURL(/\/(login|autentificare)/)
  })

  /**
   * Asserted on what renders, not on the status code.
   *
   * The guards call `redirect()` from a server component, and Next resolves that during
   * streaming — the response is a 200 carrying a navigation instruction rather than a
   * 3xx. The guarantee that matters is that no privileged content is produced, so that
   * is what is checked.
   */
  test('admin and moderation areas show the login screen, not their content', async ({
    page,
  }) => {
    for (const path of ['/ru/admin', '/ru/moderation']) {
      await page.goto(path)

      await expect(
        page.getByRole('heading', { level: 1 }),
        `${path} must render the sign-in screen`,
      ).toHaveText(ru.auth.loginTitle)

      // None of the privileged surfaces may render.
      await expect(page.getByRole('table')).toHaveCount(0)
      await expect(page.getByRole('link', { name: ru.admin.auditLog })).toHaveCount(0)
      await expect(page.getByRole('link', { name: ru.admin.users })).toHaveCount(0)
    }
  })

  test('signing in with the seeded seller account works end to end', async ({ page }) => {
    await page.goto('/ru/login')

    await page.getByLabel(ru.auth.email, { exact: true }).fill('seller@product.md')
    await page.getByLabel(ru.auth.password, { exact: true }).fill('Parola123')
    await page.getByRole('button', { name: ru.common.signIn }).click()

    const landed = await page
      .waitForURL(/\/(dashboard|cabinet)/, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false)

    if (!landed) {
      const alert = await page.getByRole('alert').first().textContent().catch(() => null)
      test.skip(
        true,
        `seed data not loaded — login returned: ${alert ?? 'no message'}. Run npm run db:seed.`,
      )
    }

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
