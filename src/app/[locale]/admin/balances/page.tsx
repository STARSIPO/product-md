import type { Metadata } from 'next'
import Link from 'next/link'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { buildQuery, parsePage } from '@/lib/utils'
import { LEDGER_TYPES } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import {
  DataTable,
  ExportLink,
  TableToolbar,
  type DataColumn,
} from '@/components/admin/data-table'
import { Alert, Pagination, Select } from '@/components/ui'
import { findBalanceMismatches } from '../_lib/queries'

/**
 * The money ledger, read-only.
 *
 * Nothing on this page writes: a balance moves only through an ADJUSTMENT entry made on
 * the company card, with a reason attached. What this screen is for is answering "where
 * did that money go" — every entry carries the balance before and after it, so a
 * disputed charge can be traced without opening a database client.
 *
 * The reconciliation banner is the important part. `Company.balanceBani` is a cache of
 * the ledger sum and the two are written in one transaction, so a difference is not
 * drift — it means a write escaped that boundary, and the affected companies are named.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 40

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.ledgerTitle} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminBalancesPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const basePath = localePath(locale, 'admin', 'balances')
  const companyId = typeof searchParams.company === 'string' ? searchParams.company : undefined
  const type = typeof searchParams.type === 'string' ? searchParams.type : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const where = {
    ...(companyId ? { companyId } : {}),
    ...(type ? { type } : {}),
  }

  const [total, rows, mismatches] = await Promise.all([
    db.ledgerEntry.count({ where }),
    db.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        amountBani: true,
        balanceAfterBani: true,
        description: true,
        createdAt: true,
        company: { select: { id: true, displayName: true } },
      },
    }),
    findBalanceMismatches(),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const ledgerTypes = t.balance.types as Record<string, string | undefined>

  type Row = (typeof rows)[number]

  const columns: DataColumn<Row>[] = [
    {
      key: 'company',
      header: t.company.displayName,
      primary: true,
      cell: (row) => (
        <Link
          href={localePath(locale, 'admin', 'companies', row.company.id)}
          className="rounded font-medium text-primary hover:text-primary-hover"
        >
          {row.company.displayName}
        </Link>
      ),
    },
    {
      key: 'type',
      header: t.admin.ledgerType,
      cell: (row) => (
        <span className="text-sm">{ledgerTypes[row.type] ?? row.type}</span>
      ),
    },
    {
      key: 'amount',
      header: t.admin.ledgerAmount,
      align: 'right',
      cell: (row) => (
        <span
          className={`tnum text-sm font-medium ${
            row.amountBani < 0 ? 'text-destructive' : 'text-success'
          }`}
        >
          {row.amountBani > 0 ? '+' : ''}
          {formatMoney(row.amountBani, locale)}
        </span>
      ),
    },
    {
      key: 'after',
      header: t.admin.ledgerBalanceAfter,
      align: 'right',
      cell: (row) => (
        <span className="tnum text-sm">{formatMoney(row.balanceAfterBani, locale)}</span>
      ),
    },
    {
      key: 'description',
      header: t.admin.ledgerDescription,
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{row.description ?? '—'}</span>
      ),
    },
    {
      key: 'created',
      header: t.common.date,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(row.createdAt, locale)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------- reconciliation */}
      <section id="mismatch">
        <h2 className="text-h3">{t.admin.mismatchTitle}</h2>

        {mismatches.length === 0 ? (
          <Alert variant="success" className="mt-3">
            {t.admin.balanceConsistent}
          </Alert>
        ) : (
          <>
            <Alert variant="destructive" className="mt-3">
              {fmt(t.admin.balanceMismatch, { count: mismatches.length })}
            </Alert>
            <ul className="surface mt-3 divide-y divide-border">
              {mismatches.map((row) => (
                <li key={row.companyId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link
                    href={localePath(locale, 'admin', 'companies', row.companyId)}
                    className="rounded text-sm font-medium text-primary hover:text-primary-hover"
                  >
                    {row.displayName}
                  </Link>
                  <span className="tnum ml-auto text-sm">
                    {t.admin.cachedBalance}: {formatMoney(row.cached, locale)}
                  </span>
                  <span className="tnum text-sm text-destructive">
                    {t.admin.computedBalance}: {formatMoney(row.computed, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ---------------------------------------------------------- entries */}
      <TableToolbar
        action={basePath}
        label={t.common.filters}
        submitLabel={t.filters.apply}
        resetHref={basePath}
        resetLabel={t.filters.reset}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.admin.ledgerType}</span>
          <Select name="type" defaultValue={type ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {LEDGER_TYPES.map((value) => (
              <option key={value} value={value}>
                {ledgerTypes[value] ?? value}
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
              entity: 'ledger',
              company: companyId,
              type,
            })}`}
            label={t.admin.exportCsv}
          />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          empty={t.balance.emptyHistory}
          caption={t.admin.ledgerTitle}
        />

        <Pagination
          className="mt-6"
          page={page}
          pageCount={pageCount}
          buildHref={(target) =>
            `${basePath}${buildQuery({
              company: companyId,
              type,
              page: target > 1 ? target : undefined,
            })}`
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
