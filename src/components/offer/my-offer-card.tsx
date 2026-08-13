import { Lock, Paperclip } from 'lucide-react'
import type { Dictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'
import { formatMoney, formatQuantity, lineTotalBani } from '@/lib/money'
import { formatDateShort } from '@/lib/i18n/format'
import { StatusBadge } from '@/components/ui'
import {
  MyOfferActions,
  type ExistingOffer,
  type SellerProductOption,
} from './offer-form'

/**
 * The supplier's own offer on a request page.
 *
 * This is the only offer a supplier can ever see on someone else's request — it comes
 * from `getMyOffer(requestId, sellerCompanyId)`, which filters on the company id in the
 * database query rather than after fetching.
 */

const STATUS_KEYS = {
  SENT: 'sent',
  VIEWED: 'viewed',
  SHORTLISTED: 'shortlisted',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired',
} as const satisfies Record<string, keyof Dictionary['offer']>

function statusLabel(t: Dictionary, status: string): string {
  const key = (STATUS_KEYS as Record<string, keyof Dictionary['offer'] | undefined>)[status]
  return key ? t.offer[key] : status
}

export function MyOfferCard({
  offer,
  requestId,
  attachmentUrl,
  products,
  locale,
  t,
}: {
  offer: ExistingOffer
  requestId: string
  attachmentUrl: string | null
  products: readonly SellerProductOption[]
  locale: Locale
  t: Dictionary
}) {
  const unitLabel = t.units[offer.unit as keyof typeof t.units] ?? offer.unit

  const rows: { label: string; value: string }[] = [
    {
      label: t.offer.price,
      value: `${formatMoney(offer.priceBani, locale)} / ${unitLabel}`,
    },
    { label: t.offer.quantity, value: formatQuantity(offer.quantity, unitLabel, locale) },
    {
      label: t.offer.deliveryPrice,
      value:
        offer.deliveryPriceBani > 0
          ? formatMoney(offer.deliveryPriceBani, locale)
          : t.product.deliveryFree,
    },
  ]

  if (offer.deliveryAt) {
    rows.push({ label: t.offer.deliveryDate, value: formatDateShort(offer.deliveryAt, locale) })
  } else if (offer.deliveryDays !== null) {
    rows.push({ label: t.offer.deliveryDays, value: String(offer.deliveryDays) })
  }

  if (offer.paymentMethod) {
    rows.push({
      label: t.offer.paymentMethod,
      value:
        t.paymentMethods[offer.paymentMethod as keyof typeof t.paymentMethods] ??
        offer.paymentMethod,
    })
  }

  if (offer.validUntil) {
    rows.push({ label: t.offer.validUntil, value: formatDateShort(offer.validUntil, locale) })
  }

  if (offer.regularity) {
    rows.push({
      label: t.offer.regularity,
      value: t.regularity[offer.regularity as keyof typeof t.regularity] ?? offer.regularity,
    })
  }

  return (
    <section
      aria-labelledby="my-offer-title"
      // A card like every other, plus one hairline ring in the brand colour. The ring is
      // the "this one is yours" state — the only meaning left for an outline in this pass.
      className="surface p-5 ring-1 ring-inset ring-primary/20"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="icon-chip h-9 w-9">
            <Lock className="h-4 w-4" />
          </span>
          <h2 id="my-offer-title" className="text-h3">
            {t.offer.myOffer}
          </h2>
        </div>
        <StatusBadge status={offer.status} label={statusLabel(t, offer.status)} />
      </div>

      <p className="mt-2 text-caption text-muted-foreground">{t.request.sealedForSellers}</p>

      <dl className="mt-4 grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 sm:block">
            <dt className="text-caption text-muted-foreground">{row.label}</dt>
            <dd className="tnum text-sm font-medium sm:mt-0.5">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="surface-muted mt-4 flex items-baseline justify-between gap-3 rounded-md px-3 py-2.5">
        <span className="text-sm text-muted-foreground">{t.offer.total}</span>
        <span className="tnum text-h3 font-semibold">
          {formatMoney(
            lineTotalBani(offer.quantity, offer.priceBani) + offer.deliveryPriceBani,
            locale,
          )}
        </span>
      </p>

      {offer.comment ? (
        <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{offer.comment}</p>
      ) : null}

      {offer.attachmentName && attachmentUrl ? (
        <p className="mt-2">
          <a
            href={attachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="-mx-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary hover:bg-primary-soft/60 hover:text-primary-hover"
          >
            <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
            {offer.attachmentName}
            <span className="sr-only">{t.a11y.newTab}</span>
          </a>
        </p>
      ) : null}

      <div className="mt-4">
        <MyOfferActions requestId={requestId} offer={offer} products={products} />
      </div>
    </section>
  )
}
