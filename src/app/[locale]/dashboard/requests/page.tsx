import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateShort, formatNumber } from '@/lib/i18n/format'
import { formatQuantity } from '@/lib/money'
import { parsePage, cn } from '@/lib/utils'
import { REQUEST_STATUSES } from '@/lib/constants'
import { requireBuyer } from '@/server/auth/guards'
import { db } from '@/server/db'
import { listCompanyRequests } from '@/server/services/requests'
import {
  buttonVariants,
  Card,
  EmptyState,
  Pagination,
  StatusBadge,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableScroll,
} from '@/components/ui'

/**
 * "My purchase requests".
 *
 * Same shape as the listings screen — table on desktop, cards on a phone — because a
 * buyer answers the same question here: which of my requests is waiting on me. The
 * offers counter is the primary column; everything else is context.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20
const FILTERS = ['ACTIVE', 'RECEIVING_OFFERS', 'DRAFT', 'COMPLETED', 'CANCELLED'] as const

export default async function DashboardRequestsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { status?: string; page?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireBuyer(locale, localePath(locale, 'dashboard', 'requests'))

  const status =
    searchParams.status && (REQUEST_STATUSES as readonly string[]).includes(searchParams.status)
      ? searchParams.status
      : undefined
  const page = parsePage(searchParams.page)

  const [{ items, total }, grouped] = await Promise.all([
    listCompanyRequests(user.companyId, { status, page, pageSize: PAGE_SIZE }),
    db.purchaseRequest.groupBy({
      by: ['status'],
      where: { companyId: user.companyId, deletedAt: null },
      _count: { status: true },
    }),
  ])

  const counts = new Map(grouped.map((row) => [row.status, row._count.status]))
  const allCount = grouped.reduce((sum, row) => sum + row._count.status, 0)
  const requestStatus = t.requestStatus as Record<string, string | undefined>
  const units = t.units as Record<string, string | undefined>

  const base = localePath(locale, 'dashboard', 'requests')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">{t.dashboard.myRequests}</h1>
        <Link href={localePath(locale, 'requests', 'new')} className={buttonVariants()}>
          {t.dashboard.addRequest}
        </Link>
      </div>

      <nav
        aria-label={t.common.filters}
        className="no-scrollbar -mx-4 overflow-x-auto border-b border-border px-4"
      >
        <ul className="flex min-w-max items-end gap-1">
          <FilterTab href={base} label={t.common.all} count={allCount} active={!status} />
          {FILTERS.map((value) => (
            <FilterTab
              key={value}
              href={`${base}?status=${value}`}
              label={requestStatus[value] ?? value}
              count={counts.get(value) ?? 0}
              active={status === value}
            />
          ))}
        </ul>
      </nav>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList />}
            title={t.dashboard.emptyRequests}
            description={t.dashboard.emptyRequestsText}
            action={
              <Link href={localePath(locale, 'requests', 'new')} className={buttonVariants()}>
                {t.dashboard.addRequest}
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <TableScroll>
              <Table>
                <THead>
                  <TR>
                    <TH>{t.dashboard.colTitle}</TH>
                    <TH>{t.common.status}</TH>
                    <TH className="text-right">{t.request.quantity}</TH>
                    <TH className="text-right">{t.dashboard.colOffers}</TH>
                    <TH>{t.request.deadline}</TH>
                    <TH className="text-right">{t.common.actions}</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((request) => (
                    <TR key={request.id}>
                      <TD>
                        <Link
                          href={localePath(locale, 'requests', request.slug)}
                          className="font-medium hover:text-primary"
                        >
                          {request.title}
                        </Link>
                      </TD>
                      <TD>
                        <StatusBadge
                          status={request.status}
                          label={requestStatus[request.status] ?? request.status}
                          size="sm"
                        />
                      </TD>
                      <TD className="tnum whitespace-nowrap text-right">
                        {formatQuantity(
                          request.quantity,
                          units[request.unit] ?? request.unit,
                          locale,
                        )}
                      </TD>
                      <TD className="tnum text-right">
                        {formatNumber(request.offersCount, locale, 0)}
                      </TD>
                      <TD className="whitespace-nowrap text-caption text-muted-foreground">
                        {request.offersDeadlineAt
                          ? formatDateShort(request.offersDeadlineAt, locale)
                          : t.request.deadlineNone}
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          <RowLink
                            href={localePath(locale, 'requests', request.slug, 'offers')}
                            label={t.offer.receivedOffers}
                          />
                          <RowLink
                            href={localePath(locale, 'requests', request.slug, 'edit')}
                            label={t.common.edit}
                          />
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableScroll>
          </Card>

          <ul className="space-y-3 md:hidden">
            {items.map((request) => (
              <li key={request.id}>
                <Card className="p-3.5">
                  <Link
                    href={localePath(locale, 'requests', request.slug)}
                    className="block text-sm font-medium leading-snug"
                  >
                    {request.title}
                  </Link>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={request.status}
                      label={requestStatus[request.status] ?? request.status}
                      size="sm"
                    />
                    <span className="tnum text-caption text-muted-foreground">
                      {formatQuantity(request.quantity, units[request.unit] ?? request.unit, locale)}
                    </span>
                  </div>

                  <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                    <div className="flex gap-1">
                      <dt>{t.dashboard.colOffers}:</dt>
                      <dd className="tnum text-foreground">
                        {formatNumber(request.offersCount, locale, 0)}
                      </dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>{t.request.deadline}:</dt>
                      <dd className="text-foreground">
                        {request.offersDeadlineAt
                          ? formatDateShort(request.offersDeadlineAt, locale)
                          : t.request.deadlineNone}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-2 flex flex-wrap gap-1 border-t border-border pt-2">
                    <RowLink
                      href={localePath(locale, 'requests', request.slug, 'offers')}
                      label={t.offer.receivedOffers}
                    />
                    <RowLink
                      href={localePath(locale, 'requests', request.slug, 'edit')}
                      label={t.common.edit}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            buildHref={(target) =>
              `${base}?${new URLSearchParams({
                ...(status ? { status } : {}),
                page: String(target),
              }).toString()}`
            }
            labels={{
              pagination: t.a11y.pagination,
              previous: t.a11y.previousPage,
              next: t.a11y.nextPage,
            }}
          />
        </>
      )}
    </div>
  )
}

function FilterTab({
  href,
  label,
  count,
  active,
}: {
  href: string
  label: string
  count: number
  active: boolean
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-t-sm px-3 pb-2.5 pt-2 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:content-['']",
          active
            ? 'font-semibold text-primary after:bg-primary'
            : 'font-medium text-muted-foreground after:bg-transparent hover:text-foreground',
        )}
      >
        {label}
        <span className="tnum text-caption text-muted-foreground">{count}</span>
      </Link>
    </li>
  )
}

function RowLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {label}
    </Link>
  )
}
