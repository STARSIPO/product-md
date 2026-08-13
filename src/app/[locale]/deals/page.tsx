import type { Metadata } from 'next'
import Link from 'next/link'
import { Handshake } from 'lucide-react'
import type { Prisma } from '@prisma/client'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireCompany } from '@/server/auth/guards'
import { db } from '@/server/db'
import { formatMoney, formatQuantity } from '@/lib/money'
import { formatDateShort } from '@/lib/i18n/format'
import { DEAL_STATUSES, PAGE_SIZE } from '@/lib/constants'
import { buildQuery, parsePage } from '@/lib/utils'
import { EmptyState, Pagination, StatusBadge, buttonVariants } from '@/components/ui'

/**
 * Every deal this company is a party to, as buyer or as seller.
 *
 * The query mirrors `listDeals` in src/server/services/deals.ts — same participant
 * filter, same select — with one addition the service does not offer: a status facet.
 * Filtering in memory would break the page count, and a deal list is not sealed data:
 * the OR on buyer/seller company id is the whole access rule.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.deal.title, robots: { index: false, follow: false } }
}

export default async function DealsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { status?: string; page?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await requireCompany(locale, localePath(locale, 'deals'))

  const status =
    searchParams.status && (DEAL_STATUSES as readonly string[]).includes(searchParams.status)
      ? searchParams.status
      : undefined
  const page = parsePage(searchParams.page)

  const where: Prisma.DealWhereInput = {
    OR: [{ buyerCompanyId: user.companyId }, { sellerCompanyId: user.companyId }],
    ...(status ? { status } : {}),
  }

  const [total, deals] = await Promise.all([
    db.deal.count({ where }),
    db.deal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        title: true,
        quantity: true,
        unit: true,
        totalBani: true,
        status: true,
        createdAt: true,
        buyerCompanyId: true,
        buyerCompany: { select: { displayName: true } },
        sellerCompany: { select: { displayName: true } },
      },
    }),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const basePath = localePath(locale, 'deals')

  return (
    <div className="container py-10">
      <h1 className="text-h1">{t.deal.title}</h1>

      {/* --------------------------------------------------------- status filter */}
      {/* `min-w-0` keeps this scroller from sizing the page: without it the row of
          status chips widens the container and the whole page scrolls sideways at 320px. */}
      <nav aria-label={t.common.status} className="no-scrollbar mt-6 w-full min-w-0 overflow-x-auto">
        <ul className="flex min-w-max gap-1.5">
          <li>
            <Link
              href={basePath}
              aria-current={status === undefined ? 'page' : undefined}
              className={buttonVariants({
                variant: status === undefined ? 'primary' : 'outline',
                size: 'sm',
              })}
            >
              {t.common.all}
            </Link>
          </li>
          {DEAL_STATUSES.map((value) => (
            <li key={value}>
              <Link
                href={`${basePath}${buildQuery({ status: value })}`}
                aria-current={status === value ? 'page' : undefined}
                className={buttonVariants({
                  variant: status === value ? 'primary' : 'outline',
                  size: 'sm',
                })}
              >
                {t.dealStatus[value]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {deals.length === 0 ? (
        <EmptyState
          className="surface mt-6"
          icon={<Handshake aria-hidden />}
          title={t.deal.emptyTitle}
          description={t.deal.emptyText}
          action={
            <Link href={localePath(locale, 'requests')} className={buttonVariants()}>
              {t.request.title}
            </Link>
          }
        />
      ) : (
        <>
          <ul className="mt-6 space-y-3 md:space-y-4">
            {deals.map((deal) => {
              const isBuyer = deal.buyerCompanyId === user.companyId
              const counterparty = isBuyer
                ? deal.sellerCompany.displayName
                : deal.buyerCompany.displayName

              return (
                <li key={deal.id}>
                  <Link
                    href={localePath(locale, 'deals', deal.id)}
                    className="surface-interactive block p-4 md:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="tnum text-caption text-muted-foreground">
                          {fmt(t.deal.number, { number: deal.number })}
                        </p>
                        <p className="mt-0.5 text-base font-medium">{deal.title}</p>
                      </div>
                      <StatusBadge
                        status={deal.status}
                        label={t.dealStatus[deal.status as keyof typeof t.dealStatus] ?? deal.status}
                        size="sm"
                      />
                    </div>

                    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      <div>
                        <dt className="text-caption text-muted-foreground">
                          {isBuyer ? t.deal.seller : t.deal.buyer}
                        </dt>
                        <dd className="mt-0.5 font-medium">{counterparty}</dd>
                      </div>
                      <div>
                        <dt className="text-caption text-muted-foreground">{t.deal.quantity}</dt>
                        <dd className="tnum mt-0.5 font-medium">
                          {formatQuantity(
                            deal.quantity,
                            t.units[deal.unit as keyof typeof t.units] ?? deal.unit,
                            locale,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-muted-foreground">{t.deal.total}</dt>
                        <dd className="tnum mt-0.5 font-semibold">
                          {formatMoney(deal.totalBani, locale)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-muted-foreground">{t.deal.date}</dt>
                        <dd className="tnum mt-0.5 font-medium">
                          {formatDateShort(deal.createdAt, locale)}
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              )
            })}
          </ul>

          <Pagination
            className="mt-8"
            page={page}
            pageCount={pageCount}
            buildHref={(target) =>
              `${basePath}${buildQuery({ status, page: target > 1 ? target : undefined })}`
            }
            labels={{
              previous: t.a11y.previousPage,
              next: t.a11y.nextPage,
              pagination: t.a11y.pagination,
            }}
          />
        </>
      )}
    </div>
  )
}
