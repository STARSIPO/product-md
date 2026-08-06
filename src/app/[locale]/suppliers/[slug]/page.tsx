import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  CalendarClock,
  CalendarDays,
  CreditCard,
  Globe,
  Handshake,
  Languages,
  Mail,
  MapPin,
  Package,
  Phone,
  Truck,
  User,
} from 'lucide-react'
import { env } from '@/env'
import { getDictionary, fmt, resolveLocale, type Dictionary } from '@/lib/i18n'
import { LOCALE_LABELS, LOCALE_TAGS, localePath, type Locale } from '@/lib/i18n/config'
import { formatDate, formatDateShort } from '@/lib/i18n/format'
import { formatMoney } from '@/lib/money'
import { db } from '@/server/db'
import { PRODUCT_CARD_SELECT, REQUEST_CARD_SELECT } from '@/server/services/search'
import { REQUEST_OPEN_STATUSES } from '@/lib/constants'
import { ProductCard } from '@/components/product/product-card'
import { RequestCard } from '@/components/request/request-card'
import { VerificationBadges } from '@/components/company/verification-badges'
import { Avatar, Breadcrumbs, Rating, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * A supplier's public profile.
 *
 * Verification is the point of this page, and it is deliberately one-way: the badges
 * state *that* a document was approved, never what it is or where it lives. Nothing here
 * links to a file — documents stay in private storage, reachable only by their owner and
 * by moderators.
 *
 * The tabs are links rather than client state, so /suppliers/agro-x?tab=reviews is a
 * real, shareable, crawlable URL and the page needs no JavaScript at all.
 */

const TABS = ['products', 'requests', 'reviews'] as const
type Tab = (typeof TABS)[number]

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string }
}): Promise<Metadata> {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const company = await db.company.findUnique({
    where: { slug: params.slug },
    select: {
      displayName: true,
      description: true,
      status: true,
      deletedAt: true,
      district: { select: { nameRu: true, nameRo: true } },
      locality: { select: { nameRu: true, nameRo: true } },
    },
  })

  if (!company || company.status !== 'ACTIVE' || company.deletedAt) {
    return { title: t.states.notFoundTitle, robots: { index: false, follow: false } }
  }

  const place = company.locality ?? company.district
  const placeName = place ? (locale === 'ro' ? place.nameRo : place.nameRu) : ''

  return {
    // A company without a locality would otherwise render "… — поставщик в  —".
    title: placeName
      ? fmt(t.seo.supplierTitle, { company: company.displayName, locality: placeName })
      : company.displayName,
    description: company.description?.slice(0, 160) ?? t.seo.suppliersDescription,
  }
}

export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: { locale: string; slug: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const company = await db.company.findUnique({
    where: { slug: params.slug },
    include: {
      district: true,
      locality: true,
      badges: { where: { status: 'APPROVED' }, select: { type: true, status: true } },
    },
  })

  if (!company || company.status !== 'ACTIVE' || company.deletedAt) notFound()

  const tab = resolveTab(searchParams.tab)
  const basePath = localePath(locale, 'suppliers', company.slug)

  const productWhere = { companyId: company.id, status: 'ACTIVE', deletedAt: null }
  const requestWhere = {
    companyId: company.id,
    visibility: 'PUBLIC',
    status: { in: [...REQUEST_OPEN_STATUSES] },
    deletedAt: null,
  }

  const [productCount, requestCount, reviewCount] = await Promise.all([
    db.product.count({ where: productWhere }),
    db.purchaseRequest.count({ where: requestWhere }),
    db.review.count({ where: { targetCompanyId: company.id, status: 'PUBLISHED' } }),
  ])

  const [products, requests, reviews] = await Promise.all([
    tab === 'products'
      ? db.product.findMany({
          where: productWhere,
          select: PRODUCT_CARD_SELECT,
          orderBy: [{ bumpedAt: 'desc' }, { publishedAt: 'desc' }, { id: 'asc' }],
          take: 24,
        })
      : Promise.resolve([]),
    tab === 'requests'
      ? db.purchaseRequest.findMany({
          where: requestWhere,
          select: REQUEST_CARD_SELECT,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 24,
        })
      : Promise.resolve([]),
    tab === 'reviews'
      ? db.review.findMany({
          where: { targetCompanyId: company.id, status: 'PUBLISHED' },
          select: {
            id: true,
            overall: true,
            comment: true,
            createdAt: true,
            authorCompany: { select: { displayName: true } },
            reply: { select: { body: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 24,
        })
      : Promise.resolve([]),
  ])

  const deliveryZoneNames = await resolveDistrictNames(company.deliveryZones, locale)

  const place = company.locality ?? company.district
  const placeName = place ? (locale === 'ro' ? place.nameRo : place.nameRu) : null
  const districtName = company.district
    ? locale === 'ro'
      ? company.district.nameRo
      : company.district.nameRu
    : null

  const paymentMethods = parseStringArray(company.paymentMethods)
  const languages = parseStringArray(company.languages)
  const workingHours = parseWorkingHours(company.workingHours)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: company.displayName,
    legalName: company.legalName,
    url: `${env.APP_URL}${basePath}`,
    ...(company.logoKey ? { logo: company.logoKey } : {}),
    ...(company.description ? { description: company.description.slice(0, 500) } : {}),
    ...(company.website ? { sameAs: [company.website] } : {}),
    ...(company.phone ? { telephone: company.phone } : {}),
    ...(company.email ? { email: company.email } : {}),
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'MD',
      ...(districtName ? { addressRegion: districtName } : {}),
      ...(placeName ? { addressLocality: placeName } : {}),
      ...(company.address ? { streetAddress: company.address } : {}),
    },
    ...(company.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: company.ratingAvg.toFixed(1),
            reviewCount: company.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  }

  const tabLabels: Record<Tab, string> = {
    products: t.product.plural,
    requests: t.request.plural,
    reviews: t.review.title,
  }
  const tabCounts: Record<Tab, number> = {
    products: productCount,
    requests: requestCount,
    reviews: reviewCount,
  }

  return (
    <div className="container py-6 md:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <Breadcrumbs
        label={t.a11y.breadcrumb}
        items={[
          { label: t.catalog.breadcrumbHome, href: localePath(locale) },
          { label: t.nav.suppliers, href: localePath(locale, 'suppliers') },
          { label: company.displayName },
        ]}
      />

      {/* ---------------------------------------------------------------- head */}
      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar src={company.logoKey ?? undefined} name={company.displayName} size="xl" />

        <div className="min-w-0 flex-1">
          <h1 className="text-h1">{company.displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{company.legalName}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {company.ratingCount > 0 ? (
              <Rating
                value={company.ratingAvg}
                count={company.ratingCount}
                size="md"
                showValue
                label={fmt(t.a11y.rating, { value: company.ratingAvg.toFixed(1) })}
              />
            ) : (
              <span className="text-sm text-muted-foreground">{t.company.noReviews}</span>
            )}
            {placeName ? (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" aria-hidden />
                {placeName}
              </span>
            ) : null}
            <span className="text-caption text-muted-foreground">
              {fmt(t.company.registeredAt, { date: formatDate(company.createdAt, locale) })}
            </span>
          </div>

          <VerificationBadges className="mt-3" badges={company.badges} t={t} size="sm" />
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={`${localePath(locale, 'messages')}?company=${company.id}`}
            className={buttonVariants()}
          >
            {t.company.writeMessage}
          </Link>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* --------------------------------------------------------- tab panels */}
        <div className="min-w-0">
          <nav aria-label={t.company.profileTitle} className="no-scrollbar overflow-x-auto border-b border-border">
            <ul className="flex min-w-max items-end gap-1">
              {TABS.map((item) => {
                const selected = item === tab
                return (
                  <li key={item}>
                    <Link
                      href={item === 'products' ? basePath : `${basePath}?tab=${item}`}
                      aria-current={selected ? 'page' : undefined}
                      className={cn(
                        'relative inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-t-sm px-3 pb-2.5 pt-2 text-sm transition-colors',
                        'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full',
                        selected
                          ? 'font-semibold text-primary after:bg-primary'
                          : 'font-medium text-muted-foreground after:bg-transparent hover:text-foreground',
                      )}
                    >
                      {tabLabels[item]}
                      <span
                        className={cn(
                          'tnum inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-caption font-medium leading-none',
                          selected ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {tabCounts[item]}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="mt-5">
            {tab === 'products' ? (
              products.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      locale={locale}
                      t={t}
                      showFavorite={false}
                      priority={index < 3}
                    />
                  ))}
                </div>
              ) : (
                <Placeholder>{t.dashboard.emptyProducts}</Placeholder>
              )
            ) : null}

            {tab === 'requests' ? (
              requests.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {requests.map((request) => (
                    <RequestCard key={request.id} request={request} locale={locale} t={t} />
                  ))}
                </div>
              ) : (
                <Placeholder>{t.request.emptyText}</Placeholder>
              )
            ) : null}

            {tab === 'reviews' ? (
              reviews.length > 0 ? (
                <ul className="space-y-3">
                  {reviews.map((review) => (
                    <li key={review.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {review.authorCompany.displayName}
                        </span>
                        <span className="text-caption text-muted-foreground">
                          {formatDateShort(review.createdAt, locale)}
                        </span>
                      </div>
                      <Rating
                        className="mt-1.5"
                        value={review.overall}
                        showValue
                        label={fmt(t.review.ratingOf, { value: review.overall })}
                      />
                      {review.comment ? (
                        <p className="mt-2 whitespace-pre-line text-sm">{review.comment}</p>
                      ) : null}
                      {review.reply ? (
                        <div className="mt-3 rounded-md border-l-2 border-primary bg-muted/50 px-3 py-2">
                          <p className="text-caption font-medium text-muted-foreground">
                            {t.review.replyTitle}
                          </p>
                          <p className="mt-0.5 whitespace-pre-line text-sm">{review.reply.body}</p>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <Placeholder>{t.review.emptyText}</Placeholder>
              )
            ) : null}
          </div>
        </div>

        {/* ---------------------------------------------------------------- aside */}
        <aside className="space-y-4">
          {company.description ? (
            <Panel title={t.company.about}>
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {company.description}
              </p>
            </Panel>
          ) : null}

          <Panel title={t.company.profileTitle}>
            <dl className="space-y-3 text-sm">
              <Fact
                icon={<Handshake className="h-4 w-4" aria-hidden />}
                label={t.company.dealsCompleted}
                value={String(company.dealsCompleted)}
              />
              <Fact
                icon={<Package className="h-4 w-4" aria-hidden />}
                label={t.company.activeProducts}
                value={String(productCount)}
              />
              {company.avgResponseMinutes !== null ? (
                <Fact
                  icon={<CalendarClock className="h-4 w-4" aria-hidden />}
                  label={t.company.responseTime}
                  value={fmt(t.company.responseTimeValue, {
                    minutes: company.avgResponseMinutes,
                  })}
                />
              ) : null}
              <Fact
                icon={<CalendarDays className="h-4 w-4" aria-hidden />}
                label={t.common.date}
                value={fmt(t.company.registeredAt, {
                  date: formatDate(company.createdAt, locale),
                })}
              />
            </dl>
          </Panel>

          <Panel title={t.product.delivery}>
            <dl className="space-y-3 text-sm">
              {company.minOrderBani > 0 ? (
                <Fact
                  icon={<Package className="h-4 w-4" aria-hidden />}
                  label={t.company.minOrder}
                  value={formatMoney(company.minOrderBani, locale)}
                />
              ) : null}
              <Fact
                icon={<Truck className="h-4 w-4" aria-hidden />}
                label={t.company.pickupAvailable}
                value={company.pickupAvailable ? t.common.yes : t.common.no}
              />
              {deliveryZoneNames.length > 0 ? (
                <Fact
                  icon={<MapPin className="h-4 w-4" aria-hidden />}
                  label={t.company.deliveryGeography}
                  value={deliveryZoneNames.join(', ')}
                />
              ) : null}
              {paymentMethods.length > 0 ? (
                <Fact
                  icon={<CreditCard className="h-4 w-4" aria-hidden />}
                  label={t.company.paymentMethods}
                  value={paymentMethods
                    .map(
                      (method) =>
                        t.paymentMethods[method as keyof typeof t.paymentMethods] ?? method,
                    )
                    .join(', ')}
                />
              ) : null}
              {languages.length > 0 ? (
                <Fact
                  icon={<Languages className="h-4 w-4" aria-hidden />}
                  label={t.company.languages}
                  value={languages
                    .map((code) => LOCALE_LABELS[code as Locale] ?? code)
                    .join(', ')}
                />
              ) : null}
            </dl>
            {company.deliveryTerms ? (
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                {company.deliveryTerms}
              </p>
            ) : null}
          </Panel>

          {workingHours ? (
            <Panel title={t.company.workingHours}>
              <dl className="space-y-1.5 text-sm">
                {DAY_KEYS.map((day, index) => {
                  const value = workingHours[day]
                  return (
                    <div key={day} className="flex items-baseline justify-between gap-3">
                      <dt className="capitalize text-muted-foreground">
                        {weekdayLabel(index, locale)}
                      </dt>
                      <dd className="tnum font-medium">
                        {value ? `${value.from}–${value.to}` : t.common.no}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </Panel>
          ) : null}

          <Panel title={t.company.contactsTitle}>
            <dl className="space-y-3 text-sm">
              {company.contactPerson ? (
                <Fact
                  icon={<User className="h-4 w-4" aria-hidden />}
                  label={t.company.contactPerson}
                  value={company.contactPerson}
                />
              ) : null}
              {company.phone ? (
                <FactLink
                  icon={<Phone className="h-4 w-4" aria-hidden />}
                  label={t.company.phone}
                  value={company.phone}
                  href={`tel:${company.phone}`}
                />
              ) : null}
              {company.email ? (
                <FactLink
                  icon={<Mail className="h-4 w-4" aria-hidden />}
                  label={t.company.email}
                  value={company.email}
                  href={`mailto:${company.email}`}
                />
              ) : null}
              {company.website ? (
                <FactLink
                  icon={<Globe className="h-4 w-4" aria-hidden />}
                  label={t.company.website}
                  value={company.website}
                  href={company.website}
                  external
                  newTabLabel={t.a11y.newTab}
                />
              ) : null}
              {company.address ? (
                <Fact
                  icon={<MapPin className="h-4 w-4" aria-hidden />}
                  label={t.company.address}
                  value={
                    districtName && districtName !== placeName
                      ? `${company.address}, ${placeName ?? ''}, ${districtName}`
                      : `${company.address}${placeName ? `, ${placeName}` : ''}`
                  }
                />
              ) : null}
            </dl>
          </Panel>

          <Panel title={t.company.verificationStatuses}>
            <VerificationBadges badges={company.badges} t={t} size="sm" />
            {company.badges.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.verification.empty}</p>
            ) : (
              <p className="mt-3 text-caption text-muted-foreground">
                {t.verification.privacyNotice}
              </p>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

/** A <div> wrapper is the only element allowed to group <dt>/<dd> inside a <dl>. */
function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
    </div>
  )
}

function FactLink({
  icon,
  label,
  value,
  href,
  external = false,
  newTabLabel,
}: {
  icon: ReactNode
  label: string
  value: string
  href: string
  external?: boolean
  newTabLabel?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="min-w-0 text-right">
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noreferrer nofollow' } : {})}
          className="inline-flex min-h-[44px] items-center break-all font-medium text-primary underline-offset-2 hover:underline"
        >
          {value}
          {external && newTabLabel ? <span className="sr-only"> {newTabLabel}</span> : null}
        </a>
      </dd>
    </div>
  )
}

function resolveTab(value: string | string[] | undefined): Tab {
  const raw = Array.isArray(value) ? value[0] : value
  return TABS.find((tab) => tab === raw) ?? 'products'
}

/** Monday-first weekday names, straight from Intl — no dictionary entry to drift. */
function weekdayLabel(index: number, locale: Locale): string {
  // 2024-01-01 was a Monday.
  const date = new Date(Date.UTC(2024, 0, 1 + index))
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(date)
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, 40)
  } catch {
    return []
  }
}

type DayHours = { from: string; to: string } | null

function parseWorkingHours(raw: string | null): Record<string, DayHours> | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const source = parsed as Record<string, unknown>
  const out: Record<string, DayHours> = {}
  let hasAny = false

  for (const day of DAY_KEYS) {
    const value = source[day]
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { from?: unknown }).from === 'string' &&
      typeof (value as { to?: unknown }).to === 'string'
    ) {
      out[day] = { from: (value as { from: string }).from, to: (value as { to: string }).to }
      hasAny = true
    } else {
      out[day] = null
    }
  }

  return hasAny ? out : null
}

async function resolveDistrictNames(raw: string | null, locale: Locale): Promise<string[]> {
  const ids = parseStringArray(raw)
  if (ids.length === 0) return []

  const districts = await db.district.findMany({
    where: { id: { in: ids } },
    select: { nameRu: true, nameRo: true },
    orderBy: locale === 'ro' ? { nameRo: 'asc' } : { nameRu: 'asc' },
  })

  return districts.map((district) => (locale === 'ro' ? district.nameRo : district.nameRu))
}
