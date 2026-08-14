import type { Metadata } from 'next'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { buildQuery, parsePage } from '@/lib/utils'
import { COMPANY_KINDS, COMPANY_STATUSES } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import {
  DataTable,
  ExportLink,
  TableToolbar,
  type DataColumn,
} from '@/components/admin/data-table'
import { CompanyActions } from '@/components/admin/decision-dialog'
import { CompanyKindSelect } from '../_components/retail-controls'
import { Badge, Input, Pagination, Select, StatusBadge } from '@/components/ui'

/**
 * Company administration.
 *
 * The balance column is read-only here on purpose. Corrections go through the ledger
 * dialog, which appends an ADJUSTMENT entry with a reason — `Company.balanceBani` is a
 * cache of the ledger and editing it directly would make the two disagree, which the
 * system page then reports as an inconsistency.
 *
 * `kind` is editable inline and `isRetail` is not. The kind is our classification of the
 * business and an operator is the right person to fix it; whether a company sells to
 * households is that company's own decision, so the panel reports it and leaves it alone.
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
    title: `${t.admin.companies} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminCompaniesPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'companies')
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() : undefined
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  // Validated against the tuple rather than passed through: an unknown value would
  // silently return an empty list and read as "no companies" instead of "bad filter".
  const kindParam = typeof searchParams.kind === 'string' ? searchParams.kind : undefined
  const kind = (COMPANY_KINDS as readonly string[]).includes(kindParam ?? '')
    ? kindParam
    : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where: Prisma.CompanyWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(kind ? { kind } : {}),
    ...(q
      ? {
          OR: [
            { displayName: { contains: q } },
            { legalName: { contains: q } },
            { idno: { contains: q } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    db.company.count({ where }),
    db.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        displayName: true,
        legalName: true,
        idno: true,
        status: true,
        blockReason: true,
        balanceBani: true,
        isBuyer: true,
        isSeller: true,
        kind: true,
        isRetail: true,
        createdAt: true,
        badges: {
          where: { status: 'APPROVED' },
          select: { type: true },
        },
        _count: { select: { products: true, requests: true } },
      },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const companyStatuses = t.admin.companyStatuses as Record<string, string | undefined>
  const badgeTypes = t.verification.types as Record<string, string | undefined>
  const companyKinds = t.company.kinds as Record<string, string | undefined>
  const statusOptions = COMPANY_STATUSES.map((value) => ({
    value,
    label: companyStatuses[value] ?? value,
  }))
  const kindOptions = COMPANY_KINDS.map((value) => ({
    value,
    label: companyKinds[value] ?? value,
  }))

  type Row = (typeof rows)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'company',
      header: t.company.displayName,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={localePath(locale, 'admin', 'companies', row.id)}
            className="rounded font-medium text-primary hover:text-primary-hover"
          >
            {row.displayName}
          </Link>
          <p className="text-caption text-muted-foreground">
            {[row.legalName, row.idno].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    {
      key: 'kind',
      header: t.company.kind,
      cell: (row) => (
        <span className="inline-flex flex-col items-start gap-1">
          <CompanyKindSelect companyId={row.id} kind={row.kind} options={kindOptions} />
          {row.isRetail ? (
            <Badge variant="accent" size="sm">
              {t.nav.deliveryShort}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'verification',
      header: t.admin.verification,
      cell: (row) =>
        row.badges.length === 0 ? (
          <span className="text-caption text-muted-foreground">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.badges.map((badge) => (
              <Badge key={badge.type} variant="success" size="sm">
                {badgeTypes[badge.type] ?? badge.type}
              </Badge>
            ))}
          </span>
        ),
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <span className="inline-flex flex-col items-start gap-1">
          <StatusBadge status={row.status} label={companyStatuses[row.status] ?? row.status} />
          {row.blockReason ? (
            <span className="text-caption text-muted-foreground">{row.blockReason}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'balance',
      header: t.admin.balance,
      align: 'right',
      cell: (row) => (
        <span className="tnum text-sm font-medium">{formatMoney(row.balanceBani, locale)}</span>
      ),
    },
    {
      key: 'content',
      header: t.admin.counts,
      cell: (row) => (
        <span className="tnum text-sm text-muted-foreground">
          {row._count.products} / {row._count.requests}
        </span>
      ),
    },
    {
      key: 'created',
      header: t.admin.registered,
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(row.createdAt, locale)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t.common.actions,
      align: 'right',
      cell: (row) => (
        <CompanyActions companyId={row.id} status={row.status} statusOptions={statusOptions} />
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
          <Input name="q" defaultValue={q ?? ''} placeholder={t.company.idno} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.status}</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {COMPANY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {companyStatuses[value] ?? value}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.company.kind}</span>
          <Select name="kind" defaultValue={kind ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {COMPANY_KINDS.map((value) => (
              <option key={value} value={value}>
                {companyKinds[value] ?? value}
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
              entity: 'companies',
              q,
              status,
              kind,
            })}`}
            label={t.admin.exportCsv}
          />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          empty={t.admin.empty}
          caption={t.admin.companies}
        />

        <Pagination
          className="mt-6"
          page={page}
          pageCount={pageCount}
          buildHref={(target) =>
            `${basePath}${buildQuery({ q, status, kind, page: target > 1 ? target : undefined })}`
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
