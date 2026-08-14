import Link from 'next/link'
import { Package, Tag } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath, type Locale } from '@/lib/i18n/config'
import { formatDateShort } from '@/lib/i18n/format'
import { formatMoney, isOnSale, salePercent } from '@/lib/money'
import { requireSeller } from '@/server/auth/guards'
import { db } from '@/server/db'
import { listCompanySales } from '@/server/services/sales'
import { SaleBadge } from '@/components/sales/sale-price'
import {
  Badge,
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
import { SaleEditor, type SaleProductOption } from './sale-editor'

/**
 * «Акции» in the seller's account.
 *
 * A discount is not a product of ours — there is no tariff, no balance and nothing to
 * buy on this screen. The seller lowers a price, the listing appears in the public
 * «Акции» section, and ending the sale puts the original price back untouched.
 *
 * Only listings the public can actually reach are offered: discounting a draft would
 * be a saving nobody can see.
 */

export const dynamic = 'force-dynamic'

/** A discount is only meaningful on a listing a buyer can currently open. */
const DISCOUNTABLE_STATUSES = ['ACTIVE', 'PAUSED', 'SOLD_OUT'] as const

export default async function DashboardSalesPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireSeller(locale, localePath(locale, 'dashboard', 'sales'))

  const [sales, catalogue] = await Promise.all([
    listCompanySales(user.companyId),
    db.product.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        status: { in: [...DISCOUNTABLE_STATUSES] },
      },
      select: {
        id: true,
        title: true,
        priceBani: true,
        oldPriceBani: true,
        discountEndsAt: true,
      },
      orderBy: { title: 'asc' },
      take: 300,
    }),
  ])

  // The regular price is resolved here, not in the browser: while a sale is running
  // `priceBani` is the reduced figure and `oldPriceBani` is what it was, and getting
  // that backwards would measure the next discount off the last one.
  const options: SaleProductOption[] = catalogue.map((product) => ({
    id: product.id,
    title: product.title,
    regularPriceBani: product.oldPriceBani ?? product.priceBani,
    currentPriceBani: product.priceBani,
    endsAtDate: product.discountEndsAt ? isoDate(product.discountEndsAt) : null,
    onSale: isOnSale(product),
  }))

  const rows = sales.map((product) => {
    const live = isOnSale(product)
    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      priceBani: product.priceBani,
      oldPriceBani: product.oldPriceBani,
      discountEndsAt: product.discountEndsAt,
      percent: salePercent(product),
      live,
    }
  })

  const activeCount = rows.filter((row) => row.live).length

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1">{t.sales.manageTitle}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t.sales.manageSubtitle}</p>
      </header>

      {options.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package />}
            title={t.dashboard.emptyProducts}
            description={t.dashboard.emptyProductsText}
            action={
              <Link href={localePath(locale, 'products', 'new')} className={buttonVariants()}>
                {t.dashboard.addProduct}
              </Link>
            }
          />
        </Card>
      ) : (
        <SaleEditor products={options} />
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-h3">{t.dashboard.activeSales}</h2>
          <p className="tnum text-sm text-muted-foreground">
            {fmt(t.sales.count, { count: activeCount })}
          </p>
        </div>

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Tag />}
              title={t.sales.manageEmpty}
              description={t.sales.manageEmptyText}
            />
          </Card>
        ) : (
          <>
            {/* ------------------------------------------------- desktop: table */}
            <Card className="hidden overflow-hidden md:block">
              <TableScroll>
                <Table>
                  <THead>
                    <TR>
                      <TH>{t.dashboard.colTitle}</TH>
                      <TH className="text-right">{t.sales.regularPrice}</TH>
                      <TH className="text-right">{t.sales.salePrice}</TH>
                      <TH>{t.sales.currentSaving}</TH>
                      <TH>{t.common.status}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <TR key={row.id}>
                        <TD>
                          <Link
                            href={localePath(locale, 'products', row.slug)}
                            className="font-medium hover:text-primary"
                          >
                            {row.title}
                          </Link>
                        </TD>
                        <TD className="tnum whitespace-nowrap text-right text-muted-foreground">
                          {row.oldPriceBani !== null ? formatMoney(row.oldPriceBani, locale) : '—'}
                        </TD>
                        <TD className="tnum whitespace-nowrap text-right font-semibold">
                          {formatMoney(row.priceBani, locale)}
                        </TD>
                        <TD>
                          {row.live && row.oldPriceBani !== null ? (
                            <span className="tnum whitespace-nowrap text-sm">
                              {fmt(t.sales.savingValue, {
                                amount: formatMoney(row.oldPriceBani - row.priceBani, locale),
                                percent: row.percent,
                              })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TD>
                        <TD>
                          <SaleStatus
                            live={row.live}
                            endsAt={row.discountEndsAt}
                            locale={locale}
                            activeLabel={t.sales.statusActive}
                            endsLabel={t.sales.statusEndsOn}
                            expiredLabel={t.sales.statusExpired}
                          />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableScroll>
            </Card>

            {/* -------------------------------------------------- mobile: cards */}
            <ul className="space-y-3 md:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  <Card className="p-4">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <Link
                        href={localePath(locale, 'products', row.slug)}
                        className="min-w-0 text-sm font-medium leading-snug"
                      >
                        {row.title}
                      </Link>
                      {row.live ? <SaleBadge percent={row.percent} t={t} /> : null}
                    </div>

                    <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="tnum text-base font-semibold">
                        {formatMoney(row.priceBani, locale)}
                      </span>
                      {row.oldPriceBani !== null ? (
                        <s className="tnum text-caption text-muted-foreground">
                          {formatMoney(row.oldPriceBani, locale)}
                        </s>
                      ) : null}
                    </p>

                    <p className="mt-2">
                      <SaleStatus
                        live={row.live}
                        endsAt={row.discountEndsAt}
                        locale={locale}
                        activeLabel={t.sales.statusActive}
                        endsLabel={t.sales.statusEndsOn}
                        expiredLabel={t.sales.statusExpired}
                      />
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="text-caption text-muted-foreground">{t.sales.fairnessNote}</p>
    </div>
  )
}

/** "Действует" / "До 14.09.2026" / "Завершена" — one badge, three honest answers. */
function SaleStatus({
  live,
  endsAt,
  locale,
  activeLabel,
  endsLabel,
  expiredLabel,
}: {
  live: boolean
  endsAt: Date | null
  locale: Locale
  activeLabel: string
  endsLabel: string
  expiredLabel: string
}) {
  if (!live) {
    return (
      <Badge variant="neutral" size="sm">
        {expiredLabel}
      </Badge>
    )
  }

  return (
    <Badge variant="success" size="sm">
      {endsAt ? fmt(endsLabel, { date: formatDateShort(endsAt, locale) }) : activeLabel}
    </Badge>
  )
}

/** A date input speaks in whole days; the time of day is not part of this decision. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
