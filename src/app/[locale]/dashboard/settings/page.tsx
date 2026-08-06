import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { hashToken } from '@/server/crypto'
import { SESSION_COOKIE } from '@/server/auth/session'
import { requireUser } from '@/server/auth/guards'
import { db } from '@/server/db'
import { Alert, Card } from '@/components/ui'
import {
  AccountSettingsForm,
  ChangePasswordForm,
  DataSettings,
  DeleteAccountSection,
  SessionsList,
  TwoFactorSettings,
  type SessionRow,
} from './security-settings'

/**
 * Account settings.
 *
 * The session list is the reason this page is not cached: "which devices are signed in
 * as me" is only useful if it is true right now. Sessions are matched against the
 * current cookie by hash — the raw token never leaves the cookie, so the page can mark
 * "this device" without ever handling it.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.settings.title, robots: { index: false, follow: false } }
}

export default async function DashboardSettingsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { setup2fa?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireUser(locale, localePath(locale, 'dashboard', 'settings'))

  const token = cookies().get(SESSION_COOKIE)?.value
  const currentHash = token ? hashToken(token) : null

  const sessions = await db.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, tokenHash: true, userAgent: true, ip: true, createdAt: true },
    take: 25,
  })

  const rows: SessionRow[] = sessions.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    ip: session.ip,
    createdAt: formatDateTime(session.createdAt, locale),
    current: currentHash !== null && session.tokenHash === currentHash,
  }))

  const setup2fa = searchParams.setup2fa === '1'

  return (
    <div className="space-y-6">
      <h1 className="text-h1">{t.settings.title}</h1>

      {/* The admin guard redirects here when two-factor is missing; say why. */}
      {setup2fa && !user.twoFactorEnabled ? (
        <Alert variant="warning">{t.settings.setup2faNotice}</Alert>
      ) : null}

      <Section id="settings-account" title={t.settings.account}>
        <AccountSettingsForm
          initial={{
            name: user.name,
            email: user.email ?? '',
            phone: user.phone ?? '',
            locale: user.locale === 'ro' ? 'ro' : 'ru',
          }}
        />
      </Section>

      <Section id="settings-password" title={t.settings.changePassword}>
        <ChangePasswordForm />
      </Section>

      <Section id="settings-2fa" title={t.settings.twoFactor}>
        <TwoFactorSettings
          enabled={user.twoFactorEnabled}
          isAdmin={user.role === 'ADMIN'}
          autoStart={setup2fa}
        />
      </Section>

      <Section id="settings-sessions" title={t.settings.sessions}>
        <SessionsList sessions={rows} />
      </Section>

      <Section id="settings-data" title={t.settings.data}>
        <DataSettings />
      </Section>

      <Section id="settings-delete" title={t.settings.deleteAccount} tone="destructive">
        <DeleteAccountSection />
      </Section>
    </div>
  )
}

function Section({
  id,
  title,
  tone = 'default',
  children,
}: {
  id: string
  title: string
  tone?: 'default' | 'destructive'
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="mb-3 text-h3">
        {title}
      </h2>
      <Card
        id={id}
        className={
          tone === 'destructive' ? 'border-destructive/30 p-4 sm:p-5' : 'p-4 sm:p-5'
        }
      >
        {children}
      </Card>
    </section>
  )
}
