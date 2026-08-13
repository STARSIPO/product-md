import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { cn } from '@/lib/utils'
import { hashToken } from '@/server/crypto'
import { SESSION_COOKIE } from '@/server/auth/session'
import { requireUser } from '@/server/auth/guards'
import { db } from '@/server/db'
import { Alert, Card, buttonVariants } from '@/components/ui'
import {
  NotificationPreferences,
  type NotificationPreferenceRow,
} from '@/components/dashboard/notification-preferences'
import {
  AccountSettingsForm,
  ChangePasswordForm,
  DataSettings,
  DeleteAccountSection,
  SessionsList,
  TwoFactorSettings,
  type SessionRow,
} from './security-settings'
import { SectionRail } from '@/components/dashboard/section-rail'

/**
 * Account settings, in four sections instead of one scroll.
 *
 * The old page stacked profile, password, two-factor, sessions, export and account
 * deletion on top of each other — six blocks a person had to scroll past to reach the
 * one they came for, and on a phone that is most of a minute of thumb work.
 *
 * The section lives in the URL rather than in component state, so the whole screen stays
 * a Server Component: only the block being looked at is rendered and only its JavaScript
 * ships. It also means a link can point at "security" directly, which is what the admin
 * two-factor guard needs.
 *
 * The session list is why nothing here is cached: "which devices are signed in as me" is
 * only useful if it is true right now. Sessions are matched against the current cookie by
 * hash, so the page can mark "this device" without ever handling the raw token.
 */

export const dynamic = 'force-dynamic'

const TABS = ['profile', 'security', 'notifications', 'data'] as const
type SettingsTab = (typeof TABS)[number]

/** Exactly the columns the session list needs — the raw token hash never leaves here. */
interface SessionSelection {
  id: string
  tokenHash: string
  userAgent: string | null
  ip: string | null
  createdAt: Date
}

function resolveTab(value: string | undefined): SettingsTab {
  return (TABS as readonly string[]).includes(value ?? '') ? (value as SettingsTab) : 'profile'
}

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
  searchParams: { setup2fa?: string; tab?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireUser(locale, localePath(locale, 'dashboard', 'settings'))

  const setup2fa = searchParams.setup2fa === '1'
  // The admin guard sends people here to enrol; that lives under Security, so open it.
  const tab = setup2fa ? 'security' : resolveTab(searchParams.tab)

  // Only the visible section is queried. A person opening "notifications" has no reason
  // to pay for a session lookup they will not see.
  const sessions: SessionSelection[] =
    tab === 'security'
      ? await db.session.findMany({
          where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, tokenHash: true, userAgent: true, ip: true, createdAt: true },
          take: 25,
        })
      : []

  const preferences: NotificationPreferenceRow[] =
    tab === 'notifications'
      ? await db.notificationPreference.findMany({
          where: { userId: user.id },
          select: { type: true, inApp: true, email: true, sms: true, push: true },
        })
      : []

  const token = cookies().get(SESSION_COOKIE)?.value
  const currentHash = token ? hashToken(token) : null

  const rows: SessionRow[] = sessions.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    ip: session.ip,
    createdAt: formatDateTime(session.createdAt, locale),
    current: currentHash !== null && session.tokenHash === currentHash,
  }))

  const labels: Record<SettingsTab, string> = {
    profile: t.settings.profile,
    security: t.settings.security,
    notifications: t.settings.notifications,
    data: t.settings.data,
  }

  return (
    <div className="space-y-6">
      <h1 className="text-h1">{t.settings.title}</h1>

      <SettingsTabs locale={locale} active={tab} labels={labels} label={t.settings.tabsLabel} />

      {setup2fa && !user.twoFactorEnabled ? (
        <Alert variant="warning">{t.settings.setup2faNotice}</Alert>
      ) : null}

      {tab === 'profile' ? (
        <>
          <Block id="settings-account" title={t.settings.account} description={t.settings.profileHint}>
            <AccountSettingsForm
              initial={{
                name: user.name,
                email: user.email ?? '',
                phone: user.phone ?? '',
                locale: user.locale === 'ro' ? 'ro' : 'ru',
              }}
            />
          </Block>

          {/* The company profile is a different object with a different audience; it gets
              its own screen rather than another forty fields under this one. */}
          <Block
            id="settings-company"
            title={t.settings.company}
            description={t.settings.companyLinkHint}
          >
            <Link
              href={localePath(locale, 'dashboard', 'company')}
              className={buttonVariants({ variant: 'outline', fullWidth: true, className: 'sm:w-auto' })}
            >
              {t.settings.companyLink}
            </Link>
          </Block>
        </>
      ) : null}

      {tab === 'security' ? (
        <>
          <Block
            id="settings-password"
            title={t.settings.changePassword}
            description={t.settings.securityHint}
          >
            <ChangePasswordForm />
          </Block>

          <Block id="settings-2fa" title={t.settings.twoFactor}>
            <TwoFactorSettings
              enabled={user.twoFactorEnabled}
              isAdmin={user.role === 'ADMIN'}
              autoStart={setup2fa}
            />
          </Block>

          <Block id="settings-sessions" title={t.settings.sessions}>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.settings.noSessions}</p>
            ) : (
              <SessionsList sessions={rows} />
            )}
          </Block>
        </>
      ) : null}

      {tab === 'notifications' ? (
        <Block
          id="settings-notifications"
          title={t.notifications.settings}
          description={t.settings.notificationsHint}
        >
          <NotificationPreferences preferences={preferences} locale={locale} />
        </Block>
      ) : null}

      {tab === 'data' ? (
        <>
          <Block id="settings-data" title={t.settings.exportData} description={t.settings.dataHint}>
            <DataSettings />
          </Block>

          <Block id="settings-delete" title={t.settings.deleteAccount} tone="destructive">
            <DeleteAccountSection />
          </Block>
        </>
      ) : null}
    </div>
  )
}

/**
 * Links, not buttons: the section is part of the address, so it survives a refresh, can
 * be shared, and needs no JavaScript to change. The strip scrolls sideways on a phone
 * rather than collapsing — four labels are not worth hiding behind a menu.
 */
function SettingsTabs({
  locale,
  active,
  labels,
  label,
}: {
  locale: Locale
  active: SettingsTab
  labels: Record<SettingsTab, string>
  label: string
}) {
  const base = localePath(locale, 'dashboard', 'settings')

  return (
    <SectionRail
      label={label}
      items={TABS.map((tab) => ({
        key: tab,
        href: tab === 'profile' ? base : `${base}?tab=${tab}`,
        label: labels[tab],
        active: tab === active,
      }))}
    />
  )
}

function Block({
  id,
  title,
  description,
  tone = 'default',
  children,
}: {
  id: string
  title: string
  description?: string
  tone?: 'default' | 'destructive'
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="text-h3">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {/* The only outline left on this page, and it is carrying meaning: a ring in the
          destructive tone is what marks the block that deletes an account. A card that
          is merely a card gets elevation instead. */}
      <Card className={cn('p-4 sm:p-5', tone === 'destructive' && 'ring-1 ring-destructive/25')}>
        {children}
      </Card>
    </section>
  )
}
