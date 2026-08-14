import Link from 'next/link'
import type { Metadata } from 'next'
import { ShoppingBasket } from 'lucide-react'
import { getDictionary, fmt, resolveLocale, type Dictionary } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney, formatQuantity } from '@/lib/money'
import { requireUser } from '@/server/auth/guards'
import { listCustomerOrders } from '@/server/services/retail'
import {
  Card,
  EmptyState,
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

/**
 * «Мои заказы» — the shopper's side of retail delivery.
 *
 * A shopper can order without an account, so this page is only ever a convenience for
 * the ones who signed in: `listCustomerOrders` matches on the user id stored with the
 * order, and a guest order simply has none to match.
 *
 * Everything is read-only. The shop drives the status, and the money was never ours to
 * show a receipt for — the total here is what the shop asked for, and the shop is who
 * it was paid to.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.retail.myOrders, robots: { index: false, follow: false } }
}

export default async function CustomerOrdersPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireUser(locale, localePath(locale, 'orders'))
  const orders = await listCustomerOrders(user.id)

  return (
    <div className="container py-10">
      <h1 className="text-h1">{t.retail.myOrders}</h1>

      {orders.length === 0 ? (
        <EmptyState
          className="surface mt-6"
          icon={<ShoppingBasket aria-hidden />}
          title={t.retail.ordersEmpty}
          description={t.retail.ordersEmptyText}
          action={
            <Link href={localePath(locale, 'delivery')} className={buttonVariants()}>
              {t.retail.ordersEmptyAction}
            </Link>
          }
        />
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((order) => (
            <li key={order.id}>
              <Card className="space-y-4 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="tnum text-sm font-semibold">
                      {fmt(t.retail.orderNumber, { number: order.number })}
                    </p>
                    <p className="tnum mt-0.5 text-caption text-muted-foreground">
                      {fmt(t.retail.orderPlacedAt, {
                        date: formatDateTime(order.createdAt, locale),
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <OrderStatusBadge status={order.status} label={statusLabel(t, order.status)} />
                    <p className="mt-1 max-w-[18rem] text-caption text-muted-foreground">
                      {statusHint(t, order.status)}
                    </p>
                  </div>
                </div>

                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-caption text-muted-foreground">{t.retail.orderShop}</dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      <Link
                        href={localePath(locale, 'suppliers', order.sellerCompany.slug)}
                        className="hover:text-primary"
                      >
                        {order.sellerCompany.displayName}
                      </Link>
                      {order.sellerCompany.phone ? (
                        <a
                          href={`tel:${order.sellerCompany.phone}`}
                          className="tnum ml-2 inline-flex min-h-[24px] items-center text-caption font-normal text-primary"
                        >
                          {order.sellerCompany.phone}
                        </a>
                      ) : null}
                    </dd>
                  </div>

                  <div className="min-w-0">
                    <dt className="text-caption text-muted-foreground">
                      {t.retail.orderDeliveryTo}
                    </dt>
                    <dd className="mt-0.5 break-words text-sm">
                      {[localityName(order.locality, locale), order.deliveryAddress]
                        .filter(Boolean)
                        .join(', ')}
                    </dd>
                  </div>

                  <div className="min-w-0">
                    <dt className="text-caption text-muted-foreground">{t.retail.orderPayment}</dt>
                    <dd className="mt-0.5 text-sm">{paymentLabel(t, order.paymentMethod)}</dd>
                  </div>

                  {order.deliveryNote ? (
                    <div className="min-w-0">
                      <dt className="text-caption text-muted-foreground">
                        {t.retail.orderComment}
                      </dt>
                      <dd className="mt-0.5 break-words text-sm">{order.deliveryNote}</dd>
                    </div>
                  ) : null}
                </dl>

                {/* ------------------------------------------- items: table / cards */}
                <div>
                  <h2 className="text-sm font-medium">{t.retail.orderItems}</h2>

                  <TableScroll className="mt-2 hidden md:block">
                    <Table>
                      <THead>
                        <TR>
                          <TH>{t.retail.colProduct}</TH>
                          <TH className="text-right">{t.retail.colQuantity}</TH>
                          <TH className="text-right">{t.retail.colUnitPrice}</TH>
                          <TH className="text-right">{t.retail.colSum}</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {order.items.map((item) => (
                          <TR key={item.id}>
                            <TD>{item.title}</TD>
                            <TD className="tnum whitespace-nowrap text-right">
                              {formatQuantity(item.quantity, unitLabel(t, item.unit), locale)}
                            </TD>
                            <TD className="tnum whitespace-nowrap text-right text-muted-foreground">
                              {formatMoney(item.unitPriceBani, locale)}
                            </TD>
                            <TD className="tnum whitespace-nowrap text-right font-medium">
                              {formatMoney(item.totalBani, locale)}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableScroll>

                  <ul className="mt-2 space-y-2 md:hidden">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="surface-muted flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md p-3"
                      >
                        <span className="min-w-0 break-words text-sm">{item.title}</span>
                        <span className="tnum whitespace-nowrap text-sm font-medium">
                          {formatMoney(item.totalBani, locale)}
                        </span>
                        <span className="tnum w-full text-caption text-muted-foreground">
                          {formatQuantity(item.quantity, unitLabel(t, item.unit), locale)} ×{' '}
                          {formatMoney(item.unitPriceBani, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* ------------------------------------------------------- totals */}
                <dl className="space-y-1 border-t border-border pt-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">{t.retail.itemsTotal}</dt>
                    <dd className="tnum">{formatMoney(order.itemsTotalBani, locale)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">{t.retail.deliveryFee}</dt>
                    <dd className="tnum">
                      {order.deliveryFeeBani > 0
                        ? formatMoney(order.deliveryFeeBani, locale)
                        : t.retail.deliveryFree}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 pt-1">
                    <dt className="font-medium">{t.retail.orderTotal}</dt>
                    <dd className="tnum text-base font-semibold">
                      {formatMoney(order.totalBani, locale)}
                    </dd>
                  </div>
                </dl>

                {order.cancelReason ? (
                  <p className="text-caption text-muted-foreground">
                    {fmt(t.retail.cancelledReason, { reason: order.cancelReason })}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-caption text-muted-foreground">{t.retail.totalHint}</p>
    </div>
  )
}

function localityName(locality: { nameRu: string; nameRo: string } | null, locale: Locale): string {
  if (!locality) return ''
  return locale === 'ro' ? locality.nameRo : locality.nameRu
}

function unitLabel(t: Dictionary, unit: string): string {
  return t.units[unit as keyof typeof t.units] ?? unit
}

function statusLabel(t: Dictionary, status: string): string {
  return t.retail.statuses[status as keyof typeof t.retail.statuses] ?? status
}

function statusHint(t: Dictionary, status: string): string {
  return t.retail.statusHints[status as keyof typeof t.retail.statusHints] ?? ''
}

function paymentLabel(t: Dictionary, method: string): string {
  return t.paymentMethods[method as keyof typeof t.paymentMethods] ?? method
}
