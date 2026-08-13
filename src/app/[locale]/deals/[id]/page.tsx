import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, FileText, MessageSquare, Star } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireCompany } from '@/server/auth/guards'
import { getDealForParticipant } from '@/server/services/deals'
import { formatMoney, formatQuantity } from '@/lib/money'
import { formatDate, formatDateShort } from '@/lib/i18n/format'
import { Alert, Badge, Breadcrumbs, StatusBadge, buttonVariants } from '@/components/ui'
import { DealTimeline } from '@/components/deal/deal-timeline'
import { DealActions } from '@/components/deal/deal-actions'

/**
 * One deal, seen by one of its two participants.
 *
 * `getDealForParticipant` puts the company id in the WHERE clause, so a deal that
 * belongs to two other companies simply does not exist for this page.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.deal.single, robots: { index: false, follow: false } }
}

export default async function DealDetailPage({
  params,
}: {
  params: { locale: string; id: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await requireCompany(locale, localePath(locale, 'deals', params.id))

  const deal = await getDealForParticipant(params.id, user.companyId)
  if (!deal) notFound()

  const side: 'buyer' | 'seller' = deal.buyerCompanyId === user.companyId ? 'buyer' : 'seller'
  const unitLabel = t.units[deal.unit as keyof typeof t.units] ?? deal.unit

  const alreadyReviewed = deal.reviews.some(
    (review) => review.authorCompanyId === user.companyId,
  )

  const facts: { label: string; value: string }[] = [
    { label: t.deal.subject, value: deal.title },
    { label: t.deal.quantity, value: formatQuantity(deal.quantity, unitLabel, locale) },
    {
      label: t.deal.unitPrice,
      value: `${formatMoney(deal.unitPriceBani, locale)} / ${unitLabel}`,
    },
    {
      label: t.deal.deliveryPrice,
      value:
        deal.deliveryPriceBani > 0
          ? formatMoney(deal.deliveryPriceBani, locale)
          : t.product.deliveryFree,
    },
  ]

  if (deal.deliveryAddress) {
    facts.push({ label: t.deal.deliveryAddress, value: deal.deliveryAddress })
  }
  if (deal.deliveryAt) {
    facts.push({ label: t.deal.deliveryDate, value: formatDateShort(deal.deliveryAt, locale) })
  }
  if (deal.paymentMethod) {
    facts.push({
      label: t.deal.paymentMethod,
      value:
        t.paymentMethods[deal.paymentMethod as keyof typeof t.paymentMethods] ??
        deal.paymentMethod,
    })
  }
  facts.push({ label: t.deal.date, value: formatDate(deal.createdAt, locale) })

  return (
    <div className="container py-10">
      <Breadcrumbs
        label={t.a11y.breadcrumb}
        items={[
          { label: t.deal.title, href: localePath(locale, 'deals') },
          { label: fmt(t.deal.number, { number: deal.number }) },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="tnum text-h1">{fmt(t.deal.number, { number: deal.number })}</h1>
          <p className="mt-1 text-muted-foreground">{deal.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={deal.status}
            label={t.dealStatus[deal.status as keyof typeof t.dealStatus] ?? deal.status}
          />
          <Badge variant="outline" size="sm">
            {side === 'buyer' ? t.deal.asBuyer : t.deal.asSeller}
          </Badge>
        </div>
      </div>

      {deal.status === 'CANCELLED' && deal.cancelReason ? (
        <Alert variant="warning" title={t.deal.cancelReason} className="mt-4">
          {deal.cancelReason}
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------------------- parties */}
          <section aria-labelledby="deal-parties">
            <h2 id="deal-parties" className="sr-only">
              {t.deal.signatures}
            </h2>
            {/* Two cards separated by a gap — the divider grid was one box pretending to
                be two, and the two parties are genuinely separate things. */}
            <div className="grid gap-3 sm:grid-cols-2 md:gap-4">
              <Party
                role={t.deal.buyer}
                company={deal.buyerCompany}
                confirmedLabel={t.deal.buyerConfirmed}
                notConfirmedLabel={t.deal.notConfirmed}
                confirmed={deal.buyerConfirmedAt !== null}
                href={localePath(locale, 'suppliers', deal.buyerCompany.slug)}
              />
              <Party
                role={t.deal.seller}
                company={deal.sellerCompany}
                confirmedLabel={t.deal.sellerConfirmed}
                notConfirmedLabel={t.deal.notConfirmed}
                confirmed={deal.sellerConfirmedAt !== null}
                href={localePath(locale, 'suppliers', deal.sellerCompany.slug)}
              />
            </div>
          </section>

          {/* --------------------------------------------------------- terms */}
          <section aria-labelledby="deal-terms">
            <h2 id="deal-terms" className="text-h3">
              {t.deal.lineItems}
            </h2>
            {/* The row rules stay: this is a spec sheet whose lines must be told apart,
                which rule 4 keeps. Only the surrounding outline goes. */}
            <dl className="surface mt-3 divide-y divide-border">
              {facts.map((fact) => (
                <div
                  key={fact.label}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3"
                >
                  <dt className="text-sm text-muted-foreground">{fact.label}</dt>
                  <dd className="tnum text-sm font-medium">{fact.value}</dd>
                </div>
              ))}
              <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-b-lg bg-muted/60 px-5 py-4">
                <dt className="text-sm font-medium">{t.deal.total}</dt>
                <dd className="tnum text-h3 font-semibold">{formatMoney(deal.totalBani, locale)}</dd>
              </div>
            </dl>

            {deal.comment ? (
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                {deal.comment}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              {deal.request ? (
                <Link
                  href={localePath(locale, 'requests', deal.request.slug)}
                  className="text-primary hover:text-primary-hover"
                >
                  {t.deal.fromRequest}: {deal.request.title}
                </Link>
              ) : null}
              {deal.product ? (
                <Link
                  href={localePath(locale, 'products', deal.product.slug)}
                  className="text-primary hover:text-primary-hover"
                >
                  {t.deal.fromProduct}: {deal.product.title}
                </Link>
              ) : null}
            </div>
          </section>

          {/* ------------------------------------------------------- history */}
          <section aria-labelledby="deal-history">
            <h2 id="deal-history" className="text-h3">
              {t.deal.history}
            </h2>
            <div className="surface mt-3 p-5">
              <DealTimeline events={deal.events} locale={locale} t={t} />
            </div>
          </section>
        </div>

        {/* ------------------------------------------------------------ aside */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="surface p-5">
            <DealActions
              dealId={deal.id}
              status={deal.status}
              side={side}
              buyerConfirmed={deal.buyerConfirmedAt !== null}
              sellerConfirmed={deal.sellerConfirmedAt !== null}
            />
          </div>

          <div className="space-y-2">
            <Link
              href={localePath(locale, 'deals', deal.id, 'document')}
              className={buttonVariants({ variant: 'outline', fullWidth: true })}
            >
              <FileText className="mr-2 h-4 w-4" aria-hidden />
              {t.deal.documentOpen}
            </Link>

            <Link
              href={localePath(locale, 'messages')}
              className={buttonVariants({ variant: 'ghost', fullWidth: true })}
            >
              <MessageSquare className="mr-2 h-4 w-4" aria-hidden />
              {t.chat.title}
            </Link>

            {/*
              The review form is owned by another agent (src/components/review/review-form.tsx).
              TODO: when that file lands, render it here instead of linking to ?review=1.
            */}
            {deal.status === 'COMPLETED' ? (
              alreadyReviewed ? (
                <p className="text-caption text-muted-foreground">{t.deal.reviewLeft}</p>
              ) : (
                <Link
                  href={`${localePath(locale, 'deals', deal.id)}?review=1`}
                  className={buttonVariants({ fullWidth: true })}
                >
                  <Star className="mr-2 h-4 w-4" aria-hidden />
                  {t.deal.leaveReview}
                </Link>
              )
            ) : null}
          </div>

          <p className="text-caption text-muted-foreground">{t.deal.disclaimer}</p>
        </aside>
      </div>
    </div>
  )
}

function Party({
  role,
  company,
  confirmed,
  confirmedLabel,
  notConfirmedLabel,
  href,
}: {
  role: string
  company: {
    displayName: string
    legalName: string | null
    idno: string | null
    phone: string | null
    email: string | null
    address: string | null
  }
  confirmed: boolean
  confirmedLabel: string
  notConfirmedLabel: string
  href: string
}) {
  return (
    <div className="surface flex flex-col p-5">
      <p className="text-caption uppercase tracking-wide text-muted-foreground">{role}</p>
      <p className="mt-1 text-base font-medium">
        <Link href={href} className="hover:text-primary">
          {company.displayName}
        </Link>
      </p>
      {company.legalName ? (
        <p className="text-caption text-muted-foreground">{company.legalName}</p>
      ) : null}
      {company.idno ? (
        <p className="tnum text-caption text-muted-foreground">IDNO {company.idno}</p>
      ) : null}
      {company.address ? (
        <p className="mt-1 text-caption text-muted-foreground">{company.address}</p>
      ) : null}
      <p className="mt-1 text-caption text-muted-foreground">
        {[company.phone, company.email].filter(Boolean).join(' · ')}
      </p>
      {/* Consent is the one fact a party block is read for, so it gets a pill rather
          than another line of grey caption text. */}
      <p
        className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium ${
          confirmed ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'
        }`}
      >
        {confirmed ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
        {confirmed ? confirmedLabel : notConfirmedLabel}
      </p>
    </div>
  )
}
