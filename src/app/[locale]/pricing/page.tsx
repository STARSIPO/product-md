import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList, Handshake, Megaphone, Store } from 'lucide-react'
import { getDictionary, resolveLocale, fmt } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatMoney } from '@/lib/money'
import { DEFAULT_TARIFFS, PROMOTION_TYPES } from '@/lib/constants'
import { env } from '@/env'
import { db } from '@/server/db'
import { isEnabled } from '@/server/services/feature-flags'
import { Alert, Card, buttonVariants } from '@/components/ui'

/**
 * Public pricing.
 *
 * Reads the live `Tariff` table rather than a hardcoded list, because an admin can
 * change a price at runtime and a marketing page that disagrees with the billing job
 * is worse than no page.
 *
 * Two facts are stated plainly rather than left to the FAQ: listings are free while
 * BILLING_ENABLED is off, and Product.md takes no commission and never handles the
 * money for the goods themselves. Both are the sort of thing a supplier decides on.
 */

export const revalidate = 300

/** Tariff keys are stable identifiers; their labels live in the dictionary. */
const PROMO_TARIFF_KEYS: Record<string, (typeof PROMOTION_TYPES)[number]> = {
  PROMO_BUMP: 'BUMP',
  PROMO_PIN_CATEGORY: 'PIN_CATEGORY',
  PROMO_HOMEPAGE: 'HOMEPAGE',
  PROMO_HIGHLIGHT: 'HIGHLIGHT',
  PROMO_URGENT: 'URGENT',
  PROMO_NEWSLETTER: 'NEWSLETTER',
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: t.pricing.title,
    description: t.pricing.subtitle,
  }
}

export default async function PricingPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const [rows, billingEnabled, promotionsEnabled] = await Promise.all([
    db.tariff.findMany({ where: { isActive: true } }).catch(() => []),
    isEnabled('BILLING_ENABLED'),
    isEnabled('PROMOTIONS_ENABLED'),
  ])

  const byKey = new Map(rows.map((row) => [row.key, row]))

  /** Live row first, seeded default second — never an invented number. */
  function priceOf(key: string): { priceBani: number; unit: string } | null {
    const row = byKey.get(key)
    if (row) return { priceBani: row.priceBani, unit: row.unit }
    const fallback = DEFAULT_TARIFFS[key]
    return fallback ? { priceBani: fallback.priceBani, unit: fallback.unit } : null
  }

  function unitLabel(unit: string): string {
    if (unit === 'DAY') return t.pricing.tariffUnitDay
    if (unit === 'ITEM') return t.pricing.tariffUnitItem
    return t.pricing.tariffUnitPercent
  }

  const listing = priceOf('LISTING_DAILY')

  const promoRows = Object.entries(PROMO_TARIFF_KEYS).flatMap(([key, type]) => {
    const price = priceOf(key)
    if (!price) return []
    return [{ key, label: t.pricing.promos[type], ...price }]
  })

  return (
    <div className="container max-w-4xl py-8">
      <header>
        <h1 className="text-h1">{t.pricing.title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t.pricing.subtitle}</p>
      </header>

      {/* The single most important thing on the page while the flag is off. */}
      {!billingEnabled ? (
        <Alert variant="success" className="mt-5" title={t.pricing.freeNow}>
          {t.pricing.freeNowText}
        </Alert>
      ) : null}

      <Alert variant="info" className="mt-3" title={t.pricing.commissionTitle}>
        {t.pricing.commissionText}
      </Alert>

      {/* ------------------------------------------------------------ the plans */}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <PlanCard
          icon={<Store className="h-4 w-4" aria-hidden />}
          title={t.pricing.listingTitle}
          price={
            billingEnabled && listing
              ? fmt(t.pricing.listingPrice, { price: formatMoney(listing.priceBani, locale) })
              : t.pricing.requestPrice
          }
          text={t.pricing.listingText}
        />

        <PlanCard
          icon={<ClipboardList className="h-4 w-4" aria-hidden />}
          title={t.pricing.requestTitle}
          price={t.pricing.requestPrice}
          text={t.pricing.requestText}
        />

        <PlanCard
          icon={<Handshake className="h-4 w-4" aria-hidden />}
          title={t.pricing.trialTitle}
          price=""
          text={fmt(t.pricing.trialText, { days: env.SELLER_TRIAL_DAYS })}
        />

        {promotionsEnabled ? (
          <PlanCard
            icon={<Megaphone className="h-4 w-4" aria-hidden />}
            title={t.pricing.promoTitle}
            price=""
            text={t.pricing.promoText}
          />
        ) : null}
      </div>

      {/* --------------------------------------------------------- live tariffs */}
      <section className="mt-8" aria-labelledby="pricing-tariffs">
        <h2 id="pricing-tariffs" className="text-h3">
          {t.pricing.tariffsTitle}
        </h2>

        {!billingEnabled ? (
          <p className="mt-1 text-sm text-muted-foreground">{t.pricing.billingOffNote}</p>
        ) : null}

        {listing === null && promoRows.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {t.pricing.tariffsEmpty}
          </p>
        ) : (
          <Card className="mt-3 overflow-hidden">
            <div className="no-scrollbar w-full overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-caption font-semibold text-muted-foreground"
                    >
                      {t.pricing.tariffService}
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-4 py-2.5 text-right text-caption font-semibold text-muted-foreground"
                    >
                      {t.pricing.tariffPrice}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {listing ? (
                    <tr>
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        {t.pricing.listingTitle}
                      </th>
                      <td className="tnum whitespace-nowrap px-4 py-3 text-right">
                        {formatMoney(listing.priceBani, locale)}{' '}
                        <span className="text-caption text-muted-foreground">
                          {unitLabel(listing.unit)}
                        </span>
                      </td>
                    </tr>
                  ) : null}

                  <tr>
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      {t.pricing.requestTitle}
                    </th>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-success">
                      {t.pricing.requestPrice}
                    </td>
                  </tr>

                  {promotionsEnabled
                    ? promoRows.map((row) => (
                        <tr key={row.key}>
                          <th scope="row" className="px-4 py-3 text-left font-normal">
                            {row.label}
                          </th>
                          <td className="tnum whitespace-nowrap px-4 py-3 text-right">
                            {formatMoney(row.priceBani, locale)}{' '}
                            <span className="text-caption text-muted-foreground">
                              {unitLabel(row.unit)}
                            </span>
                          </td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* -------------------------------------------------------------- the FAQ */}
      <section className="mt-8" aria-labelledby="pricing-faq">
        <h2 id="pricing-faq" className="text-h3">
          {t.pricing.faqTitle}
        </h2>

        <dl className="mt-3 space-y-3">
          <FaqItem question={t.pricing.faq1Q} answer={t.pricing.faq1A} />
          <FaqItem question={t.pricing.faq2Q} answer={t.pricing.faq2A} />
          <FaqItem question={t.pricing.faq3Q} answer={t.pricing.faq3A} />
        </dl>
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link href={localePath(locale, 'register')} className={buttonVariants({ size: 'lg' })}>
          {t.home.ctaButton}
        </Link>
        <Link
          href={localePath(locale, 'requests', 'new')}
          className={buttonVariants({ size: 'lg', variant: 'outline' })}
        >
          {t.home.ctaRequest}
        </Link>
      </div>
    </div>
  )
}

function PlanCard({
  icon,
  title,
  price,
  text,
}: {
  icon: React.ReactNode
  title: string
  price: string
  text: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"
        >
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {price ? <p className="mt-2.5 text-lg font-semibold">{price}</p> : null}
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </Card>
  )
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="text-sm font-medium">{question}</dt>
      <dd className="mt-1 text-sm text-muted-foreground">{answer}</dd>
    </div>
  )
}
