import Link from 'next/link'
import { Briefcase, ClipboardList, Handshake, Package, ShieldCheck } from 'lucide-react'
import { localePath, type Locale } from '@/lib/i18n/config'
import { fmt, type Dictionary } from '@/lib/i18n'
import { formatMoney, formatQuantity } from '@/lib/money'
import { Avatar, Badge } from '@/components/ui'

/**
 * "What are we talking about" — the anchor of a conversation, shown next to it.
 *
 * A wholesale thread is worthless without the numbers it refers to: the buyer asks
 * "is 500 kg still 42 lei", and the answer depends on a listing neither party wants
 * to go and re-open. On desktop this sits beside the thread permanently; on mobile
 * the thread page folds it into a disclosure so it never pushes the messages down.
 */

export interface ContextCardData {
  type: string
  subject: string | null
  product: { slug: string; title: string } | null
  request: { slug: string; title: string } | null
  offer: { id: string; totalBani: number; quantity: number; unit: string } | null
  deal: { id: string; number: string; status: string; totalBani: number } | null
  counterparty: { slug: string; displayName: string; logoKey: string | null }
  /** Which side the *viewer* is on — the card labels the other party accordingly. */
  side: 'buyer' | 'seller'
  verified?: boolean
}

const ICONS: Record<string, typeof Package> = {
  PRODUCT: Package,
  REQUEST: ClipboardList,
  OFFER: Briefcase,
  DEAL: Handshake,
}

export function ContextCard({
  data,
  locale,
  t,
  className,
}: {
  data: ContextCardData
  locale: Locale
  t: Dictionary
  className?: string
}) {
  const Icon = ICONS[data.type] ?? Package
  const heading =
    data.type === 'REQUEST'
      ? t.chat.aboutRequest
      : data.type === 'OFFER'
        ? t.chat.aboutOffer
        : data.type === 'DEAL'
          ? t.chat.aboutDeal
          : t.chat.aboutProduct

  const unitLabel = data.offer
    ? (t.units[data.offer.unit as keyof typeof t.units] ?? data.offer.unit)
    : ''

  return (
    <section
      aria-label={heading}
      className={className ?? 'rounded-lg border border-border bg-card p-4 shadow-card'}
    >
      <p className="flex items-center gap-1.5 text-caption uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {heading}
      </p>

      {/* ------------------------------------------------------- the counterparty */}
      <div className="mt-3 flex items-start gap-3">
        <Avatar
          src={data.counterparty.logoKey ?? undefined}
          name={data.counterparty.displayName}
          size="md"
        />
        <div className="min-w-0">
          <Link
            href={localePath(locale, 'suppliers', data.counterparty.slug)}
            className="clamp-2 rounded text-sm font-medium hover:text-primary"
          >
            {data.counterparty.displayName}
          </Link>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {data.side === 'buyer' ? t.deal.seller : t.deal.buyer}
          </p>
        </div>
        {data.verified ? (
          <ShieldCheck
            className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-label={t.verification.types.TRUSTED_SUPPLIER}
          />
        ) : null}
      </div>

      {/* --------------------------------------------------------- the anchor row */}
      <div className="mt-4 border-t border-border pt-3">
        {data.product ? (
          <Link
            href={localePath(locale, 'products', data.product.slug)}
            className="clamp-2 rounded text-sm font-medium text-primary hover:text-primary-hover"
          >
            {data.product.title}
          </Link>
        ) : data.request ? (
          <Link
            href={localePath(locale, 'requests', data.request.slug)}
            className="clamp-2 rounded text-sm font-medium text-primary hover:text-primary-hover"
          >
            {data.request.title}
          </Link>
        ) : (
          <p className="clamp-2 text-sm font-medium">{data.subject ?? t.chat.title}</p>
        )}

        {data.offer ? (
          <dl className="mt-3 space-y-1.5 text-caption">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{t.offer.quantity}</dt>
              <dd className="tnum font-medium">
                {formatQuantity(data.offer.quantity, unitLabel, locale)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">{t.offer.total}</dt>
              <dd className="tnum font-medium">{formatMoney(data.offer.totalBani, locale)}</dd>
            </div>
          </dl>
        ) : null}

        {data.deal ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" size="sm">
                {fmt(t.deal.number, { number: data.deal.number })}
              </Badge>
              <Badge variant="primary" size="sm">
                {t.dealStatus[data.deal.status as keyof typeof t.dealStatus] ?? data.deal.status}
              </Badge>
            </div>
            <p className="tnum text-caption text-muted-foreground">
              {t.deal.total}: {formatMoney(data.deal.totalBani, locale)}
            </p>
            <Link
              href={localePath(locale, 'deals', data.deal.id)}
              className="inline-block rounded text-caption font-medium text-primary hover:text-primary-hover"
            >
              {t.common.details}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  )
}
