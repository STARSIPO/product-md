import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateShort } from '@/lib/i18n/format'
import { formatMoney, formatQuantity } from '@/lib/money'
import { parsePage } from '@/lib/utils'
import { requireSeller } from '@/server/auth/guards'
import { listMyOffers } from '@/server/services/offers'
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
 * Offers this company has sent.
 *
 * Read through `listMyOffers`, which scopes every row to the caller's own company id
 * in the query itself — a supplier can only ever see its own bid. Nothing on this page
 * exposes a competitor's price, and no filter here can be widened to.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

export default async function DashboardOffersPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { page?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await requireSeller(locale, localePath(locale, 'dashboard', 'offers'))
  const page = parsePage(searchParams.page)

  const { items, total } = await listMyOffers(user.companyId, page, PAGE_SIZE)

  const units = t.units as Record<string, string | undefined>
  const requestStatus = t.requestStatus as Record<string, string | undefined>
  const offerStatus: Record<string, string | undefined> = {
    SENT: t.offer.sent,
    VIEWED: t.offer.viewed,
    SHORTLISTED: t.offer.shortlisted,
    ACCEPTED: t.offer.accepted,
    REJECTED: t.offer.rejected,
    WITHDRAWN: t.offer.withdrawn,
    EXPIRED: t.offer.expired,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">{t.offer.myOffers}</h1>
        <Link
          href={localePath(locale, 'requests')}
          className={buttonVariants({ variant: 'outline' })}
        >
          {t.nav.requests}
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">{t.offer.sealedNotice}</p>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox />}
            title={t.dashboard.emptyOffers}
            description={t.dashboard.emptyOffersText}
            action={
              <Link href={localePath(locale, 'requests')} className={buttonVariants()}>
                {t.nav.requests}
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
                    <TH>{t.request.single}</TH>
                    <TH>{t.common.status}</TH>
                    <TH className="text-right">{t.offer.price}</TH>
                    <TH className="text-right">{t.offer.total}</TH>
                    <TH>{t.request.deadline}</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((offer) => (
                    <TR key={offer.id}>
                      <TD>
                        <Link
                          href={localePath(locale, 'requests', offer.request.slug)}
                          className="font-medium hover:text-primary"
                        >
                          {offer.request.title}
                        </Link>
                        <p className="mt-0.5 text-caption text-muted-foreground">
                          {offer.request.company.displayName} ·{' '}
                          {requestStatus[offer.request.status] ?? offer.request.status}
                        </p>
                      </TD>
                      <TD>
                        <StatusBadge
                          status={offer.status}
                          label={offerStatus[offer.status] ?? offer.status}
                          size="sm"
                        />
                      </TD>
                      <TD className="tnum whitespace-nowrap text-right">
                        {formatMoney(offer.priceBani, locale)}
                        <span className="block text-caption text-muted-foreground">
                          {formatQuantity(offer.quantity, units[offer.unit] ?? offer.unit, locale)}
                        </span>
                      </TD>
                      <TD className="tnum whitespace-nowrap text-right font-semibold">
                        {formatMoney(offer.totalBani, locale)}
                      </TD>
                      <TD className="whitespace-nowrap text-caption text-muted-foreground">
                        {offer.request.offersDeadlineAt
                          ? formatDateShort(offer.request.offersDeadlineAt, locale)
                          : t.request.deadlineNone}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableScroll>
          </Card>

          <ul className="space-y-3 md:hidden">
            {items.map((offer) => (
              <li key={offer.id}>
                <Card className="p-4">
                  <Link
                    href={localePath(locale, 'requests', offer.request.slug)}
                    className="block text-sm font-medium leading-snug"
                  >
                    {offer.request.title}
                  </Link>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {offer.request.company.displayName}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge
                      status={offer.status}
                      label={offerStatus[offer.status] ?? offer.status}
                      size="sm"
                    />
                    <span className="tnum text-sm font-semibold">
                      {formatMoney(offer.totalBani, locale)}
                    </span>
                  </div>

                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                    <div className="flex gap-1">
                      <dt>{t.offer.price}:</dt>
                      <dd className="tnum text-foreground">
                        {formatMoney(offer.priceBani, locale)}
                      </dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>{t.request.deadline}:</dt>
                      <dd className="text-foreground">
                        {offer.request.offersDeadlineAt
                          ? formatDateShort(offer.request.offersDeadlineAt, locale)
                          : t.request.deadlineNone}
                      </dd>
                    </div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            buildHref={(target) =>
              `${localePath(locale, 'dashboard', 'offers')}?page=${target}`
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
