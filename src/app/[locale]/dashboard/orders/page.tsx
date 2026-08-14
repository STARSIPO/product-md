import Link from 'next/link'
import type { Metadata } from 'next'
import { Phone, ShoppingBasket } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney, formatQuantity } from '@/lib/money'
import { buildQuery, parsePage } from '@/lib/utils'
import { RETAIL_ORDER_STATUSES } from '@/lib/constants'
import { requireSeller } from '@/server/auth/guards'
import { db } from '@/server/db'
import { listSellerOrders } from '@/server/services/retail'
import type { Dictionary } from '@/lib/i18n'
import {
  Alert,
  Card,
  EmptyState,
  Pagination,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableScroll,
  buttonVariants,
} from '@/components/ui'
import { OrderStatusBadge } from '@/components/retail/order-status-badge'
import { OrderActions } from './order-actions'

/**
 * Incoming consumer orders.
 *
 * The shop's working screen: who ordered what, for how much, and the one button that
 * moves the order on. No money is settled here — the shopper pays the shop directly —
 * so an order is a promise to deliver, and the status is the only thing this page
 * changes.
 *
 * Everything is scoped by the company `requireSeller` resolves from the session; there
 * is no company parameter for a caller to swap, and `transitionOrder` re-checks the
 * same ownership on the write path.
 */

export const dynamic = 'force-dynamic'

/** Mirrors the page size inside `listSellerOrders` — the service takes 20 per page. */
const ORDERS_PER_PAGE = 20

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.retail.sellerOrdersTitle, robots: { index: false, follow: false } }
}

export default async function DashboardOrdersPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { status?: string; page?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireSeller(locale, localePath(locale, 'dashboard', 'orders'))

  const status =
    searchParams.status &&
    (RETAIL_ORDER_STATUSES as readonly string[]).includes(searchParams.status)
      ? searchParams.status
      : undefined
  const page = parsePage(searchParams.page)

  const [company, { items, total }] = await Promise.all([
    db.company.findUnique({ where: { id: user.companyId }, select: { isRetail: true } }),
    listSellerOrders(user.companyId, status, page),
  ])

  const pageCount = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE))
  const basePath = localePath(locale, 'dashboard', 'orders')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1">{t.retail.sellerOrdersTitle}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t.retail.sellerOrdersSubtitle}</p>
      </header>

      {/* The storefront can be switched off while orders taken earlier are still open;
          they stay workable, and the reason the shop is no longer listed is said here
          rather than left to be guessed. */}
      {company?.isRetail === false ? (
        <Alert variant="warning">
          {t.company.retailHint}{' '}
          <Link href={localePath(locale, 'dashboard', 'company')} className="font-medium underline">
            {t.company.retailTitle}
          </Link>
        </Alert>
      ) : null}

      {/* `min-w-0` keeps this scroller from sizing the page: without it the row of
          status chips widens the grid column and the account scrolls sideways at 320px. */}
      <nav
        aria-label={t.retail.filterStatus}
        className="no-scrollbar w-full min-w-0 overflow-x-auto"
      >
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
              {t.retail.filterAll}
            </Link>
          </li>
          {RETAIL_ORDER_STATUSES.map((value) => (
            <li key={value}>
              <Link
                href={`${basePath}${buildQuery({ status: value })}`}
                aria-current={status === value ? 'page' : undefined}
                className={buttonVariants({
                  variant: status === value ? 'primary' : 'outline',
                  size: 'sm',
                })}
              >
                {t.retail.statuses[value]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShoppingBasket />}
            title={t.retail.sellerOrdersEmpty}
            description={t.retail.sellerOrdersEmptyText}
          />
        </Card>
      ) : (
        <>
          {/* ---------------------------------------------------- desktop: table */}
          <Card className="hidden overflow-hidden lg:block">
            <TableScroll>
              <Table>
                <THead>
                  <TR>
                    <TH>{t.retail.sellerOrders}</TH>
                    <TH>{t.retail.orderCustomer}</TH>
                    <TH>{t.retail.orderItems}</TH>
                    <TH className="text-right">{t.retail.orderTotal}</TH>
                    <TH>{t.common.status}</TH>
                    <TH>{t.common.actions}</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((order) => (
                    <TR key={order.id}>
                      <TD>
                        <p className="tnum whitespace-nowrap font-medium">
                          {fmt(t.retail.orderNumber, { number: order.number })}
                        </p>
                        <p className="tnum mt-0.5 text-caption text-muted-foreground">
                          {formatDateTime(order.createdAt, locale)}
                        </p>
                      </TD>
                      <TD>
                        <p className="font-medium">{order.customerName}</p>
                        <a
                          href={`tel:${order.customerPhone}`}
                          className="tnum mt-0.5 inline-flex min-h-[24px] items-center gap-1 text-caption text-primary hover:text-primary-hover"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden />
                          {order.customerPhone}
                        </a>
                        <p className="mt-0.5 text-caption text-muted-foreground">
                          {order.deliveryAddress}
                        </p>
                      </TD>
                      <TD>
                        <OrderItems items={order.items} locale={locale} t={t} />
                      </TD>
                      <TD className="tnum whitespace-nowrap text-right font-semibold">
                        {formatMoney(order.totalBani, locale)}
                        <span className="mt-0.5 block text-caption font-normal text-muted-foreground">
                          {order.deliveryFeeBani > 0
                            ? `${t.retail.deliveryFee}: ${formatMoney(order.deliveryFeeBani, locale)}`
                            : t.retail.deliveryFree}
                        </span>
                      </TD>
                      <TD>
                        <OrderStatusBadge
                          status={order.status}
                          label={statusLabel(t, order.status)}
                        />
                        {order.cancelReason ? (
                          <p className="mt-1 max-w-[16rem] text-caption text-muted-foreground">
                            {fmt(t.retail.cancelledReason, { reason: order.cancelReason })}
                          </p>
                        ) : null}
                      </TD>
                      <TD>
                        <OrderActions orderId={order.id} status={order.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableScroll>
          </Card>

          {/* ----------------------------------------------------- mobile: cards */}
          <ul className="space-y-3 lg:hidden">
            {items.map((order) => (
              <li key={order.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="tnum text-sm font-medium">
                        {fmt(t.retail.orderNumber, { number: order.number })}
                      </p>
                      <p className="tnum mt-0.5 text-caption text-muted-foreground">
                        {formatDateTime(order.createdAt, locale)}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} label={statusLabel(t, order.status)} />
                  </div>

                  <div className="surface-muted rounded-md p-3">
                    <p className="text-sm font-medium">{order.customerName}</p>
                    <a
                      href={`tel:${order.customerPhone}`}
                      className="tnum mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-primary"
                    >
                      <Phone className="h-4 w-4" aria-hidden />
                      {order.customerPhone}
                    </a>
                    <p className="text-caption text-muted-foreground">{order.deliveryAddress}</p>
                    {order.deliveryNote ? (
                      <p className="mt-1 text-caption text-muted-foreground">
                        {t.retail.orderComment}: {order.deliveryNote}
                      </p>
                    ) : null}
                  </div>

                  <OrderItems items={order.items} locale={locale} t={t} />

                  <dl className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border pt-3">
                    <dt className="text-sm text-muted-foreground">{t.retail.deliveryFee}</dt>
                    <dd className="tnum text-sm">
                      {order.deliveryFeeBani > 0
                        ? formatMoney(order.deliveryFeeBani, locale)
                        : t.retail.deliveryFree}
                    </dd>
                    <dt className="w-full text-sm font-medium sm:w-auto">{t.retail.orderTotal}</dt>
                    <dd className="tnum text-base font-semibold">
                      {formatMoney(order.totalBani, locale)}
                    </dd>
                  </dl>

                  {order.cancelReason ? (
                    <p className="text-caption text-muted-foreground">
                      {fmt(t.retail.cancelledReason, { reason: order.cancelReason })}
                    </p>
                  ) : null}

                  <OrderActions orderId={order.id} status={order.status} />
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
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

      <p className="text-caption text-muted-foreground">{t.retail.moneyNote}</p>
    </div>
  )
}

/** The lines of one order, as the picker will read them off a phone. */
function OrderItems({
  items,
  locale,
  t,
}: {
  items: readonly {
    id: string
    title: string
    unit: string
    quantity: number
    totalBani: number
  }[]
  locale: Locale
  t: Dictionary
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span className="min-w-0 break-words">{item.title}</span>
          <span className="tnum whitespace-nowrap text-muted-foreground">
            {formatQuantity(item.quantity, unitLabel(t, item.unit), locale)} ·{' '}
            {formatMoney(item.totalBani, locale)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function unitLabel(t: Dictionary, unit: string): string {
  return t.units[unit as keyof typeof t.units] ?? unit
}

function statusLabel(t: Dictionary, status: string): string {
  return t.retail.statuses[status as keyof typeof t.retail.statuses] ?? status
}
