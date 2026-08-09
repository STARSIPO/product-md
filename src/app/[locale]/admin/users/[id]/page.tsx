import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { USER_ROLES } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { listAudit } from '@/server/services/audit'
import { UserActions, UserSecurityActions } from '@/components/admin/decision-dialog'
import { Badge, StatusBadge } from '@/components/ui'

/**
 * One user, everything an operator can know and do about them.
 *
 * The list answers "who is on the platform"; this answers "what is going on with this
 * account" — where it is signed in, when it last got in and from where, what staff have
 * already done to it. Those questions come up together (a support call, a suspected
 * compromise), so they are on one screen rather than three.
 *
 * Nothing here trusts the URL beyond using it to look the row up: every action re-reads
 * the acting admin from the session and the target from the database.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.userCard} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminUserPage({
  params,
}: {
  params: { locale: string; id: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const actor = await requireAdmin(locale)

  const user = await db.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      locale: true,
      blockReason: true,
      blockedAt: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      totpEnabledAt: true,
      lastLoginAt: true,
      createdAt: true,
      deletedAt: true,
      companies: {
        select: {
          role: true,
          company: { select: { id: true, displayName: true, status: true } },
        },
      },
    },
  })

  if (!user || user.deletedAt) notFound()

  const identifiers = [user.email, user.phone].filter((value): value is string => Boolean(value))

  const [sessions, attempts, history] = await Promise.all([
    db.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
    }),
    identifiers.length > 0
      ? db.loginAttempt.findMany({
          where: { identifier: { in: identifiers } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, ip: true, success: true, createdAt: true },
        })
      : Promise.resolve([]),
    listAudit({ entityType: 'USER', entityId: user.id, pageSize: 12 }),
  ])

  const roles = t.admin.roles as Record<string, string | undefined>
  const userStatuses = t.admin.userStatuses as Record<string, string | undefined>
  const companyStatuses = t.admin.companyStatuses as Record<string, string | undefined>
  const roleOptions = USER_ROLES.map((value) => ({ value, label: roles[value] ?? value }))

  return (
    <div className="space-y-6">
      <Link
        href={localePath(locale, 'admin', 'users')}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded text-sm font-medium text-primary hover:text-primary-hover"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t.admin.backToList}
      </Link>

      {/* --------------------------------------------------------- identity */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h3">{user.name}</h2>
          <Badge variant="outline" size="sm">
            {roles[user.role] ?? user.role}
          </Badge>
          <StatusBadge status={user.status} label={userStatuses[user.status] ?? user.status} />
          {user.totpEnabledAt ? (
            <Badge variant="success" size="sm">
              2FA
            </Badge>
          ) : null}
        </div>

        {user.blockReason ? (
          <p className="mt-2 text-sm text-muted-foreground">{user.blockReason}</p>
        ) : null}

        <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-caption text-muted-foreground">{t.auth.email}</dt>
            <dd className="text-sm">
              {user.email ?? '—'}
              {user.email ? (
                <Badge
                  className="ml-2"
                  variant={user.emailVerifiedAt ? 'success' : 'warning'}
                  size="sm"
                >
                  {user.emailVerifiedAt ? t.admin.verified : t.admin.notVerified}
                </Badge>
              ) : null}
            </dd>
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-caption text-muted-foreground">{t.auth.phone}</dt>
            <dd className="text-sm">
              {user.phone ?? '—'}
              {user.phone ? (
                <Badge
                  className="ml-2"
                  variant={user.phoneVerifiedAt ? 'success' : 'warning'}
                  size="sm"
                >
                  {user.phoneVerifiedAt ? t.admin.verified : t.admin.notVerified}
                </Badge>
              ) : null}
            </dd>
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-caption text-muted-foreground">{t.admin.registered}</dt>
            <dd className="text-sm">{formatDateTime(user.createdAt, locale)}</dd>
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            <dt className="text-caption text-muted-foreground">{t.admin.lastLogin}</dt>
            <dd className="text-sm">
              {user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : t.common.never}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <UserActions
            userId={user.id}
            role={user.role}
            blocked={user.status === 'BLOCKED'}
            roleOptions={roleOptions}
            isSelf={user.id === actor.id}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <UserSecurityActions
            userId={user.id}
            isSelf={user.id === actor.id}
            canResetPassword={user.email !== null}
            emailVerified={user.emailVerifiedAt !== null}
            phoneVerified={user.phoneVerifiedAt !== null}
            hasEmail={user.email !== null}
            hasPhone={user.phone !== null}
          />
        </div>
      </section>

      {/* -------------------------------------------------------- companies */}
      {user.companies.length > 0 ? (
        <section>
          <h2 className="text-h3">{t.admin.companies}</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {user.companies.map((membership) => (
              <li
                key={membership.company.id}
                className="flex flex-wrap items-center gap-2 px-4 py-3"
              >
                <Link
                  href={localePath(locale, 'admin', 'companies', membership.company.id)}
                  className="rounded text-sm font-medium text-primary hover:text-primary-hover"
                >
                  {membership.company.displayName}
                </Link>
                <Badge variant="outline" size="sm">
                  {membership.role}
                </Badge>
                <StatusBadge
                  status={membership.company.status}
                  size="sm"
                  label={companyStatuses[membership.company.status] ?? membership.company.status}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {/* --------------------------------------------------- sessions */}
        <section>
          <h2 className="text-h3">{t.admin.sessionsTitle}</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {sessions.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t.admin.sessionsEmpty}
              </li>
            ) : (
              sessions.map((session) => (
                <li key={session.id} className="px-4 py-3">
                  <p className="truncate text-sm">{session.userAgent ?? t.admin.sessionDevice}</p>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {session.ip ?? '—'} · {t.admin.sessionExpires}{' '}
                    {formatDateTime(session.expiresAt, locale)}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* ---------------------------------------------- login history */}
        <section>
          <h2 className="text-h3">{t.admin.loginHistory}</h2>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {attempts.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t.admin.empty}
              </li>
            ) : (
              attempts.map((attempt) => (
                <li key={attempt.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <Badge variant={attempt.success ? 'success' : 'destructive'} size="sm">
                    {attempt.success ? t.admin.loginOk : t.admin.loginFail}
                  </Badge>
                  <span className="text-caption text-muted-foreground">{attempt.ip ?? '—'}</span>
                  <span className="ml-auto text-caption text-muted-foreground">
                    {formatDateTime(attempt.createdAt, locale)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {/* ----------------------------------------------------- audit trail */}
      <section>
        <h2 className="text-h3">{t.admin.changeHistory}</h2>
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
          {history.items.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t.admin.auditEmpty}
            </li>
          ) : (
            history.items.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-medium text-primary">{row.action}</span>
                  <span className="ml-auto text-caption text-muted-foreground">
                    {row.actor?.name ?? '—'} · {formatDateTime(row.createdAt, locale)}
                  </span>
                </div>
                {row.reason ? <p className="mt-1 text-sm">{row.reason}</p> : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  )
}
