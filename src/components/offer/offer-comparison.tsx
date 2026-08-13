'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Award, Check, Paperclip, Star, X } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Rating,
  StatusBadge,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableScroll,
  useToast,
} from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { formatMoney, formatQuantity } from '@/lib/money'
import { formatDateShort } from '@/lib/i18n/format'
import type { Dictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'
import {
  acceptOfferAction,
  rejectOfferAction,
  shortlistOfferAction,
} from '@/server/actions/offers'
import { resolveErrorMessage } from '@/app/[locale]/login/login-form'

/**
 * Side-by-side comparison of every offer on one request — the buyer's half of the sealed
 * auction, and the only screen in the product where more than one offer is visible at
 * once. The rows arrive from `listOffersForBuyer`, which verifies request ownership
 * against the database before it returns anything; this component receives no flag it
 * could get wrong.
 *
 * On phones the table becomes stacked cards. A nine-column table on a 360 px screen is
 * unreadable, and this is the screen where a purchasing decision actually gets made.
 */

export interface ComparisonSupplier {
  id: string
  slug: string
  displayName: string
  ratingAvg: number
  ratingCount: number
  dealsCompleted: number
  avgResponseMinutes: number | null
  hasDocuments: boolean
  localityName: string | null
}

export interface ComparisonOffer {
  id: string
  status: string
  priceBani: number
  quantity: number
  unit: string
  deliveryPriceBani: number
  totalBani: number
  deliveryAt: Date | null
  deliveryDays: number | null
  paymentMethod: string | null
  validUntil: Date | null
  regularity: string | null
  comment: string | null
  attachmentName: string | null
  attachmentUrl: string | null
  distanceKm: number | null
  supplier: ComparisonSupplier
  alternativeProduct: { id: string; slug: string; title: string } | null
}

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

type ActionOutcome = Awaited<ReturnType<typeof rejectOfferAction>>

export function OfferComparison({
  offers,
  requestSlug,
  decided,
}: {
  offers: readonly ComparisonOffer[]
  requestSlug: string
  decided: boolean
}) {
  const { t, fmt, locale, href } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const [message, setMessage] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<ComparisonOffer | null>(null)
  const [rejecting, setRejecting] = useState<ComparisonOffer | null>(null)
  const [pending, startTransition] = useTransition()

  // "Best price" compares the total the buyer actually pays, delivery included — a low
  // unit price with an expensive delivery is not the cheapest offer.
  const bestTotal = useMemo(() => {
    const live = offers
      .filter((offer) => offer.status !== 'REJECTED' && offer.status !== 'EXPIRED')
      .map((offer) => offer.totalBani)
    return live.length > 0 ? Math.min(...live) : null
  }, [offers])

  function run(offerId: string, action: () => Promise<ActionOutcome>) {
    setMessage(null)
    setPendingId(offerId)
    startTransition(async () => {
      const result = await action()
      setPendingId(null)
      if (!result.ok) {
        setMessage(resolveErrorMessage(t, result, fmt))
        return
      }
      router.refresh()
    })
  }

  function toggleShortlist(offer: ComparisonOffer) {
    const next = offer.status !== 'SHORTLISTED'
    run(offer.id, () => shortlistOfferAction(offer.id, next))
  }

  function confirmReject() {
    const offer = rejecting
    if (!offer) return
    setRejecting(null)
    run(offer.id, () => rejectOfferAction(offer.id))
  }

  function confirmAccept() {
    const offer = confirming
    if (!offer) return

    setMessage(null)
    setPendingId(offer.id)

    startTransition(async () => {
      const result = await acceptOfferAction(offer.id)
      setPendingId(null)

      if (!result.ok) {
        setMessage(resolveErrorMessage(t, result, fmt))
        setConfirming(null)
        return
      }

      setConfirming(null)
      toast({ title: t.deal.dealCreated, variant: 'success' })
      router.push(href('deals', result.data))
    })
  }

  /**
   * Money and distance are right-aligned so the digits line up column-wise — with
   * `tnum` that turns nine unrelated numbers into something a buyer can scan down.
   */
  const columns: { label: string; numeric?: boolean }[] = [
    { label: t.offer.colSupplier },
    { label: t.offer.colUnitPrice, numeric: true },
    { label: t.offer.colTotal, numeric: true },
    { label: t.offer.colDelivery, numeric: true },
    { label: t.offer.colRating },
    { label: t.offer.colDeliveryDate },
    { label: t.offer.colDocuments },
    { label: t.offer.colDistance, numeric: true },
    { label: t.offer.colResponseTime, numeric: true },
    { label: t.common.actions },
  ]

  return (
    <div className="space-y-4">
      <Alert variant="info">{t.offer.compareHint}</Alert>

      <p role="status" aria-live="polite" className="sr-only">
        {pending ? t.common.saving : ''}
      </p>

      {message ? <Alert variant="destructive">{message}</Alert> : null}

      {/* ------------------------------------------------------- mobile cards */}
      <ul className="space-y-3 md:hidden">
        {offers.map((offer) => {
          const isBest = offer.totalBani === bestTotal && offer.status !== 'REJECTED'
          return (
            <li
              key={offer.id}
              // The winning quote is the one fact this screen exists to surface, so it is
              // the single place a ring is allowed: it marks a state, not a box.
              className={`surface p-4 ${isBest ? 'ring-1 ring-inset ring-success/40' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={href('suppliers', offer.supplier.slug)}
                    className="text-base font-medium hover:text-primary"
                  >
                    {offer.supplier.displayName}
                  </Link>
                  {offer.supplier.localityName ? (
                    <p className="text-caption text-muted-foreground">
                      {offer.supplier.localityName}
                    </p>
                  ) : null}
                </div>
                <StatusBadge status={offer.status} label={statusLabel(t, offer.status)} size="sm" />
              </div>

              {isBest ? (
                <Badge variant="success" size="sm" className="mt-2">
                  <Award className="mr-1 h-3 w-3" aria-hidden />
                  {t.offer.bestPrice}
                </Badge>
              ) : null}

              {/* The total is the number the decision turns on: it gets its own block. */}
              <div className="surface-muted mt-3 flex items-baseline justify-between gap-3 rounded-md px-3 py-2.5">
                <span className="text-caption text-muted-foreground">{t.offer.colTotal}</span>
                <span
                  className={`tnum text-h3 font-semibold ${isBest ? 'text-success' : ''}`}
                >
                  {formatMoney(offer.totalBani, locale)}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <CardField label={t.offer.colUnitPrice}>
                  <span className="tnum font-medium">
                    {fmt(t.product.pricePerUnit, {
                      price: formatMoney(offer.priceBani, locale),
                      unit: t.units[offer.unit as keyof typeof t.units] ?? offer.unit,
                    })}
                  </span>
                </CardField>
                <CardField label={t.offer.colDelivery}>
                  <span className="tnum">
                    {offer.deliveryPriceBani > 0
                      ? formatMoney(offer.deliveryPriceBani, locale)
                      : t.product.deliveryFree}
                  </span>
                </CardField>
                <CardField label={t.offer.colDeliveryDate}>
                  {deliveryLabel(t, offer, locale)}
                </CardField>
                <CardField label={t.offer.colRating}>
                  <Rating
                    value={offer.supplier.ratingAvg}
                    size="sm"
                    showValue
                    label={fmt(t.a11y.rating, { value: offer.supplier.ratingAvg.toFixed(1) })}
                  />
                </CardField>
                <CardField label={t.offer.colDocuments}>
                  {offer.supplier.hasDocuments ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Check className="h-4 w-4 shrink-0" aria-hidden />
                      {t.offer.documentsYes}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t.offer.documentsNo}</span>
                  )}
                </CardField>
                <CardField label={t.offer.colDistance}>
                  <span className="tnum">
                    {offer.distanceKm === null
                      ? t.offer.distanceUnknown
                      : fmt(t.offer.distanceKm, { km: Math.round(offer.distanceKm) })}
                  </span>
                </CardField>
                <CardField label={t.offer.colResponseTime}>
                  <span className="tnum">
                    {responseLabel(t, fmt, offer.supplier.avgResponseMinutes)}
                  </span>
                </CardField>
              </dl>

              <OfferExtras offer={offer} />

              <div className="mt-4">
                <RowActions
                  offer={offer}
                  decided={decided}
                  busy={pending && pendingId === offer.id}
                  onShortlist={() => toggleShortlist(offer)}
                  onReject={() => setRejecting(offer)}
                  onAccept={() => setConfirming(offer)}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {/* ------------------------------------------------------------- table */}
      <TableScroll className="surface hidden md:block">
        <Table>
          <caption className="sr-only">{t.offer.compareTitle}</caption>
          <THead>
            <TR>
              {columns.map((column) => (
                <TH
                  key={column.label}
                  scope="col"
                  className={column.numeric ? 'text-right' : undefined}
                >
                  {column.label}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {offers.map((offer) => {
              const isBest = offer.totalBani === bestTotal && offer.status !== 'REJECTED'
              return (
                <TR key={offer.id} interactive className={isBest ? 'bg-success-soft/50' : undefined}>
                  <TH scope="row" className="max-w-[220px] whitespace-normal text-foreground">
                    <Link
                      href={href('suppliers', offer.supplier.slug)}
                      className="font-medium hover:text-primary"
                    >
                      {offer.supplier.displayName}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge
                        status={offer.status}
                        label={statusLabel(t, offer.status)}
                        size="sm"
                      />
                      {isBest ? (
                        <Badge variant="success" size="sm">
                          <Award className="mr-1 h-3 w-3" aria-hidden />
                          {t.offer.bestPrice}
                        </Badge>
                      ) : null}
                    </span>
                    {offer.supplier.localityName ? (
                      <span className="mt-1 block text-caption font-normal text-muted-foreground">
                        {offer.supplier.localityName}
                      </span>
                    ) : null}
                  </TH>

                  <TD className="tnum whitespace-nowrap text-right">
                    {formatMoney(offer.priceBani, locale)}
                    <span className="block text-caption text-muted-foreground">
                      {formatQuantity(
                        offer.quantity,
                        t.units[offer.unit as keyof typeof t.units] ?? offer.unit,
                        locale,
                      )}
                    </span>
                  </TD>

                  <TD
                    className={`tnum whitespace-nowrap text-right text-base font-semibold ${
                      isBest ? 'text-success' : ''
                    }`}
                  >
                    {formatMoney(offer.totalBani, locale)}
                  </TD>

                  <TD className="tnum whitespace-nowrap text-right">
                    {offer.deliveryPriceBani > 0
                      ? formatMoney(offer.deliveryPriceBani, locale)
                      : t.product.deliveryFree}
                  </TD>

                  <TD>
                    <Rating
                      value={offer.supplier.ratingAvg}
                      size="sm"
                      showValue
                      label={fmt(t.a11y.rating, { value: offer.supplier.ratingAvg.toFixed(1) })}
                    />
                    <span className="block text-caption text-muted-foreground">
                      {fmt(t.company.reviewsCount, { count: offer.supplier.ratingCount })}
                    </span>
                  </TD>

                  <TD className="whitespace-nowrap">{deliveryLabel(t, offer, locale)}</TD>

                  <TD>
                    {offer.supplier.hasDocuments ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <Check className="h-4 w-4 shrink-0" aria-hidden />
                        {t.offer.documentsYes}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t.offer.documentsNo}</span>
                    )}
                  </TD>

                  <TD className="tnum whitespace-nowrap text-right">
                    {offer.distanceKm === null
                      ? t.offer.distanceUnknown
                      : fmt(t.offer.distanceKm, { km: Math.round(offer.distanceKm) })}
                  </TD>

                  <TD className="tnum whitespace-nowrap text-right">
                    {responseLabel(t, fmt, offer.supplier.avgResponseMinutes)}
                  </TD>

                  <TD>
                    <RowActions
                      offer={offer}
                      decided={decided}
                      busy={pending && pendingId === offer.id}
                      compact
                      onShortlist={() => toggleShortlist(offer)}
                      onReject={() => setRejecting(offer)}
                      onAccept={() => setConfirming(offer)}
                    />
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </TableScroll>

      {/* Details that do not fit a column but decide a purchase all the same. */}
      <ul className="hidden space-y-3 md:block">
        {offers
          .filter((offer) => offer.comment || offer.attachmentName || offer.alternativeProduct)
          .map((offer) => (
            <li key={offer.id} className="surface p-4">
              <p className="text-sm font-medium">{offer.supplier.displayName}</p>
              <OfferExtras offer={offer} />
            </li>
          ))}
      </ul>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={t.offer.acceptConfirmTitle}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={pending}>
              {t.common.cancel}
            </Button>
            <Button onClick={confirmAccept} loading={pending}>
              {t.offer.accept}
            </Button>
          </>
        }
      >
        <p>
          {fmt(t.offer.acceptConfirmText, {
            supplier: confirming?.supplier.displayName ?? '',
          })}
        </p>
        {confirming ? (
          <p className="tnum mt-3 text-sm font-medium">
            {t.offer.total}: {formatMoney(confirming.totalBani, locale)}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={t.offer.rejectConfirmTitle}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)} disabled={pending}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" onClick={confirmReject} loading={pending}>
              {t.offer.reject}
            </Button>
          </>
        }
      >
        <p>{t.offer.rejectConfirmText}</p>
      </Dialog>

      <p>
        <Link
          href={href('requests', requestSlug)}
          className="inline-flex min-h-[44px] items-center text-caption text-muted-foreground hover:text-foreground"
        >
          {t.request.single}
        </Link>
      </p>
    </div>
  )
}

function CardField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

function OfferExtras({ offer }: { offer: ComparisonOffer }) {
  const { t, href } = useI18n()

  if (!offer.comment && !offer.attachmentName && !offer.alternativeProduct) return null

  // An inset block rather than a rule: the free-text notes are secondary to the figures
  // above them, and reading as a recessed panel says that without drawing a line.
  return (
    <div className="surface-muted mt-3 space-y-2 rounded-md p-3">
      {offer.comment ? (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{offer.comment}</p>
      ) : null}

      {offer.alternativeProduct ? (
        <p className="text-sm">
          <span className="text-muted-foreground">{t.offer.alternativeProduct}: </span>
          <Link
            href={href('products', offer.alternativeProduct.slug)}
            className="font-medium text-primary hover:text-primary-hover"
          >
            {offer.alternativeProduct.title}
          </Link>
        </p>
      ) : null}

      {offer.attachmentName && offer.attachmentUrl ? (
        <a
          href={offer.attachmentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          {offer.attachmentName}
          <span className="sr-only">{t.a11y.newTab}</span>
        </a>
      ) : null}
    </div>
  )
}

function RowActions({
  offer,
  decided,
  busy,
  compact = false,
  onShortlist,
  onReject,
  onAccept,
}: {
  offer: ComparisonOffer
  decided: boolean
  busy: boolean
  /** Table rows use the 38px button; the mobile card keeps the 44px touch target. */
  compact?: boolean
  onShortlist: () => void
  onReject: () => void
  onAccept: () => void
}) {
  const { t } = useI18n()
  const size = compact ? 'sm' : 'md'

  if (offer.status === 'ACCEPTED') {
    return <span className="text-caption font-medium text-success">{t.offer.accepted}</span>
  }

  if (offer.status === 'REJECTED') {
    return <span className="text-caption text-muted-foreground">{t.offer.rejected}</span>
  }

  if (offer.status === 'EXPIRED') {
    return <span className="text-caption text-muted-foreground">{t.offer.expired}</span>
  }

  // Once a supplier is chosen the request is closed: no second deal from the same RFQ.
  if (decided) {
    return <span className="text-caption text-muted-foreground">{t.offer.distanceUnknown}</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size={size} loading={busy} onClick={onAccept}>
        {t.offer.accept}
      </Button>
      <Button
        size={size}
        variant="outline"
        onClick={onShortlist}
        disabled={busy}
        aria-pressed={offer.status === 'SHORTLISTED'}
      >
        <Star
          className="mr-1 h-3.5 w-3.5"
          fill={offer.status === 'SHORTLISTED' ? 'currentColor' : 'none'}
          aria-hidden
        />
        {offer.status === 'SHORTLISTED' ? t.offer.shortlisted : t.offer.shortlist}
      </Button>
      <Button size={size} variant="ghost" onClick={onReject} disabled={busy}>
        <X className="mr-1 h-3.5 w-3.5" aria-hidden />
        {t.offer.reject}
      </Button>
    </div>
  )
}

function deliveryLabel(t: Dictionary, offer: ComparisonOffer, locale: Locale): string {
  if (offer.deliveryAt) return formatDateShort(offer.deliveryAt, locale)
  if (offer.deliveryDays !== null) return `${offer.deliveryDays} ${t.offer.deliveryDays}`
  return t.offer.distanceUnknown
}

function responseLabel(
  t: Dictionary,
  fmt: (template: string, params?: Record<string, string | number>) => string,
  minutes: number | null,
): string {
  if (minutes === null || minutes <= 0) return t.offer.distanceUnknown
  if (minutes < 60) return fmt(t.company.responseTimeValue, { minutes })
  return fmt(t.offer.responseHours, { hours: Math.round(minutes / 60) })
}
