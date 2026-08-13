import Link from 'next/link'
import { Package, Wallet } from 'lucide-react'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateShort, formatNumber } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { parsePage } from '@/lib/utils'
import { PRODUCT_STATUSES } from '@/lib/constants'
import { requireSeller } from '@/server/auth/guards'
import { db } from '@/server/db'
import { storage } from '@/server/storage'
import { listCompanyProducts } from '@/server/services/products'
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
import { SectionRail, type SectionRailItem } from '@/components/dashboard/section-rail'
import { ListingActions } from './listing-actions'

/**
 * "My listings".
 *
 * A table on a desktop and cards on a phone — not a table squeezed into a horizontal
 * scroller. A seller checking prices on a phone in a warehouse is the normal case here,
 * and a six-column table is unusable in that context.
 *
 * A listing paused by the nightly billing job says so in its own words and links
 * straight to the top-up screen: "PAUSED" alone would read as something the seller did.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

/** The filters worth offering; the rest of the lifecycle is reachable through "all". */
const FILTERS = ['ACTIVE', 'DRAFT', 'PENDING', 'PAUSED', 'ARCHIVED'] as const

export default async function DashboardProductsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { status?: string; page?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireSeller(locale, localePath(locale, 'dashboard', 'products'))

  const status =
    searchParams.status && (PRODUCT_STATUSES as readonly string[]).includes(searchParams.status)
      ? searchParams.status
      : undefined
  const page = parsePage(searchParams.page)

  const [{ items, total }, grouped, company] = await Promise.all([
    listCompanyProducts(user.companyId, { status, page, pageSize: PAGE_SIZE }),
    db.product.groupBy({
      by: ['status'],
      where: { companyId: user.companyId, deletedAt: null },
      _count: { status: true },
    }),
    db.company.findUnique({
      where: { id: user.companyId },
      select: { balanceBani: true },
    }),
  ])

  const counts = new Map(grouped.map((row) => [row.status, row._count.status]))
  const allCount = grouped.reduce((sum, row) => sum + row._count.status, 0)
  const productStatus = t.productStatus as Record<string, string | undefined>

  const rows = items.map((product) => ({
    id: product.id,
    slug: product.slug,
    title: product.title,
    status: product.status,
    statusLabel: productStatus[product.status] ?? product.status,
    priceBani: product.priceBani,
    unit: product.unit,
    views: product.viewsCount,
    updatedAt: product.updatedAt,
    pausedForBalance: product.pausedForBalance,
    photoUrl: product.photos[0] ? storage.publicUrl(product.photos[0].key) : null,
  }))

  const balanceHref = localePath(locale, 'dashboard', 'balance')
  const base = localePath(locale, 'dashboard', 'products')

  const filters: SectionRailItem[] = [
    { key: 'all', href: base, label: t.common.all, count: allCount, active: status === undefined },
    ...FILTERS.map((value) => ({
      key: value,
      href: `${base}?status=${value}`,
      label: productStatus[value] ?? value,
      count: counts.get(value) ?? 0,
      active: status === value,
    })),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">{t.dashboard.myProducts}</h1>
        <Link href={localePath(locale, 'products', 'new')} className={buttonVariants()}>
          {t.dashboard.addProduct}
        </Link>
      </div>

      {/* Links rather than buttons: the filter belongs in the URL so it survives a
          refresh and can be shared. */}
      <SectionRail label={t.common.filters} items={filters} />

      {rows.length === 0 ? (
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
        <>
          {/* --------------------------------------------------- desktop: table */}
          <Card className="hidden overflow-hidden md:block">
            <TableScroll>
              <Table>
                <THead>
                  <TR>
                    <TH className="w-[72px]">
                      <span className="sr-only">{t.dashboard.colPhoto}</span>
                    </TH>
                    <TH>{t.dashboard.colTitle}</TH>
                    <TH>{t.common.status}</TH>
                    <TH className="text-right">{t.product.price}</TH>
                    <TH className="text-right">{t.dashboard.colViews}</TH>
                    <TH>{t.dashboard.colUpdated}</TH>
                    <TH className="text-right">{t.common.actions}</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Thumb url={row.photoUrl} alt={row.title} noPhoto={t.product.noPhoto} />
                      </TD>
                      <TD>
                        <Link
                          href={localePath(locale, 'products', row.slug)}
                          className="font-medium hover:text-primary"
                        >
                          {row.title}
                        </Link>
                        {row.pausedForBalance ? (
                          <BalanceNotice
                            href={balanceHref}
                            text={t.dashboard.pausedForBalance}
                            action={t.dashboard.pausedForBalanceAction}
                          />
                        ) : null}
                      </TD>
                      <TD>
                        <StatusBadge status={row.status} label={row.statusLabel} size="sm" />
                      </TD>
                      <TD className="tnum whitespace-nowrap text-right">
                        {formatMoney(row.priceBani, locale)}
                      </TD>
                      <TD className="tnum text-right">{formatNumber(row.views, locale, 0)}</TD>
                      <TD className="whitespace-nowrap text-caption text-muted-foreground">
                        {formatDateShort(row.updatedAt, locale)}
                      </TD>
                      <TD>
                        <div className="flex justify-end">
                          <ListingActions
                            productId={row.id}
                            slug={row.slug}
                            status={row.status}
                          />
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableScroll>
          </Card>

          {/* ---------------------------------------------------- mobile: cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Card className="p-4">
                  <div className="flex gap-3">
                    <Thumb url={row.photoUrl} alt={row.title} noPhoto={t.product.noPhoto} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={localePath(locale, 'products', row.slug)}
                        className="block text-sm font-medium leading-snug"
                      >
                        {row.title}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <StatusBadge status={row.status} label={row.statusLabel} size="sm" />
                        <span className="tnum text-sm font-semibold">
                          {formatMoney(row.priceBani, locale)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                    <div className="flex gap-1">
                      <dt>{t.dashboard.colViews}:</dt>
                      <dd className="tnum text-foreground">
                        {formatNumber(row.views, locale, 0)}
                      </dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>{t.dashboard.colUpdated}:</dt>
                      <dd className="text-foreground">{formatDateShort(row.updatedAt, locale)}</dd>
                    </div>
                  </dl>

                  {row.pausedForBalance ? (
                    <BalanceNotice
                      href={balanceHref}
                      text={t.dashboard.pausedForBalance}
                      action={t.dashboard.pausedForBalanceAction}
                    />
                  ) : null}

                  {/* Separated by space: the rule here divided a card from its own
                      buttons, which is not a boundary that needed drawing. */}
                  <div className="mt-2">
                    <ListingActions productId={row.id} slug={row.slug} status={row.status} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            buildHref={(target) =>
              `${localePath(locale, 'dashboard', 'products')}?${new URLSearchParams({
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

      {(company?.balanceBani ?? 0) <= 0 && counts.get('PAUSED') ? (
        <p className="text-caption text-muted-foreground">{t.balance.zeroBalanceWarning}</p>
      ) : null}
    </div>
  )
}

function Thumb({ url, alt, noPhoto }: { url: string | null; alt: string; noPhoto: string }) {
  if (!url) {
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Package className="h-4 w-4" aria-hidden />
        <span className="sr-only">{noPhoto}</span>
      </span>
    )
  }

  // A plain <img>: these are 48px thumbnails behind a login, so the optimizer would
  // cost more than it saves.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      className="h-12 w-12 shrink-0 rounded-md object-cover"
    />
  )
}

function BalanceNotice({
  href,
  text,
  action,
}: {
  href: string
  text: string
  action: string
}) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-caption text-warning">
      <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
      <Link href={href} className="font-medium text-primary underline underline-offset-2">
        {action}
      </Link>
    </p>
  )
}
