import type { Metadata } from 'next'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { buildQuery, parsePage } from '@/lib/utils'
import { USER_ROLES, USER_STATUSES } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import {
  DataTable,
  ExportLink,
  TableToolbar,
  type DataColumn,
} from '@/components/admin/data-table'
import { UserActions } from '@/components/admin/decision-dialog'
import { Input, Pagination, Select, StatusBadge } from '@/components/ui'

/**
 * User administration.
 *
 * Role and block state are the two levers on this list, and both are audited. The acting
 * admin's own row is intentionally inert: demoting or blocking yourself is never a
 * legitimate operation and is the fastest way to lock everyone out of this screen.
 *
 * Everything heavier — a forced password reset, ending every session, confirming a
 * contact by hand, reading the login history — lives on the individual card, because
 * those are decisions taken about *one* person after looking at them, not bulk levers.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.users} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const actor = await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'users')
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() : undefined
  const role = typeof searchParams.role === 'string' ? searchParams.role : undefined
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { email: { contains: q.toLowerCase() } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        blockReason: true,
        createdAt: true,
        lastLoginAt: true,
        companies: { select: { company: { select: { displayName: true } } }, take: 1 },
      },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const roles = t.admin.roles as Record<string, string | undefined>
  const userStatuses = t.admin.userStatuses as Record<string, string | undefined>
  const roleOptions = USER_ROLES.map((value) => ({ value, label: roles[value] ?? value }))

  type Row = (typeof rows)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'name',
      header: t.settings.name,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={localePath(locale, 'admin', 'users', row.id)}
            className="rounded font-medium text-primary hover:text-primary-hover"
          >
            {row.name}
          </Link>
          <p className="text-caption text-muted-foreground">
            {[row.email, row.phone, row.companies[0]?.company.displayName]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: t.admin.role,
      cell: (row) => <span className="text-sm">{roles[row.role] ?? row.role}</span>,
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <span className="inline-flex flex-col items-start gap-1">
          <StatusBadge status={row.status} label={userStatuses[row.status] ?? row.status} />
          {row.blockReason ? (
            <span className="text-caption text-muted-foreground">{row.blockReason}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'created',
      header: t.admin.registered,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(row.createdAt, locale)}
        </span>
      ),
    },
    {
      key: 'lastLogin',
      header: t.admin.lastLogin,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.lastLoginAt ? formatDateTime(row.lastLoginAt, locale) : t.common.never}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t.common.actions,
      align: 'right',
      cell: (row) => (
        <UserActions
          userId={row.id}
          role={row.role}
          blocked={row.status === 'BLOCKED'}
          roleOptions={roleOptions}
          isSelf={row.id === actor.id}
        />
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <TableToolbar
        action={basePath}
        label={t.common.filters}
        submitLabel={t.filters.apply}
        resetHref={basePath}
        resetLabel={t.filters.reset}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.search}</span>
          <Input name="q" defaultValue={q ?? ''} placeholder={t.settings.email} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.admin.role}</span>
          <Select name="role" defaultValue={role ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {USER_ROLES.map((value) => (
              <option key={value} value={value}>
                {roles[value] ?? value}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.status}</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {USER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {userStatuses[value] ?? value}
              </option>
            ))}
          </Select>
        </label>
      </TableToolbar>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="tnum text-sm text-muted-foreground">
            {fmt(t.admin.totalRows, { count: total })}
          </p>
          <ExportLink
            className="ml-auto"
            href={`${localePath(locale, 'admin', 'export')}${buildQuery({
              entity: 'users',
              q,
              role,
              status,
            })}`}
            label={t.admin.exportCsv}
          />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          empty={t.admin.empty}
          caption={t.admin.users}
        />

        <Pagination
          className="mt-6"
          page={page}
          pageCount={pageCount}
          buildHref={(target) =>
            `${basePath}${buildQuery({ q, role, status, page: target > 1 ? target : undefined })}`
          }
          labels={{
            previous: t.a11y.previousPage,
            next: t.a11y.nextPage,
            pagination: t.a11y.pagination,
          }}
        />
      </div>
    </div>
  )
}
