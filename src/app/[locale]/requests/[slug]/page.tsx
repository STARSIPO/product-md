import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  CalendarClock,
  CalendarDays,
  Eye,
  MapPin,
  MessageSquareQuote,
  Paperclip,
  Pencil,
  Repeat,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatCountdown, formatDate, formatDateShort } from '@/lib/i18n/format'
import { formatMoney, formatQuantity } from '@/lib/money'
import { REQUEST_OPEN_STATUSES } from '@/lib/constants'
import { getCurrentUser } from '@/server/auth/session'
import { getRequestBySlug, recordRequestView } from '@/server/services/requests'
import { getMyOffer, getPublicOfferCount } from '@/server/services/offers'
import { getCategoryAttributes } from '@/server/services/categories'
import { listCompanyProducts } from '@/server/services/products'
import { storage } from '@/server/storage'
import { Alert, Badge, Breadcrumbs, StatusBadge, buttonVariants } from '@/components/ui'
import { CompanyCard } from '@/components/company/company-card'
import { MyOfferCard } from '@/components/offer/my-offer-card'
import { OfferDeadline, OfferLauncher } from '@/components/offer/offer-form'

/**
 * A single purchase request.
 *
 * The page shows everything a supplier needs to quote — and exactly one fact about the
 * competition: how many offers exist. `getPublicOfferCount` is a COUNT query, not a
 * list, so there is no over-fetched shape here that a future change could accidentally
 * render. The supplier's own offer comes from `getMyOffer`, which filters on their
 * company id inside the database query.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  const request = await getRequestBySlug(params.slug, null)

  if (!request) return { title: t.states.notFoundTitle, robots: { index: false, follow: false } }

  return {
    title: fmt(t.seo.requestTitle, { title: request.title }),
    description: request.description?.slice(0, 160) ?? t.seo.requestsDescription,
  }
}

export default async function RequestDetailPage({
  params,
}: {
  params: { locale: string; slug: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await getCurrentUser()

  const request = await getRequestBySlug(params.slug, user?.companyId ?? null)
  if (!request) notFound()

  const isOwner = user?.companyId !== undefined && user?.companyId === request.companyId
  if (!isOwner) void recordRequestView(request.id)

  const deadlinePassed =
    request.offersDeadlineAt !== null && request.offersDeadlineAt.getTime() < Date.now()
  const isOpen =
    (REQUEST_OPEN_STATUSES as readonly string[]).includes(request.status) && !deadlinePassed

  // The one id every sealed read is scoped by. Null for guests, buyers and the owner —
  // and a null here means no offer query runs at all.
  const sellerCompanyId = !isOwner && user?.isSeller === true ? user.companyId : null

  const [offersCount, myOffer, attributeDefinitions, sellerProducts] = await Promise.all([
    getPublicOfferCount(request.id),
    sellerCompanyId ? getMyOffer(request.id, sellerCompanyId) : null,
    getCategoryAttributes(request.categoryId, locale, 'REQUEST'),
    sellerCompanyId
      ? listCompanyProducts(sellerCompanyId, { status: 'ACTIVE', pageSize: 50 })
      : null,
  ])

  const optionLabels = new Map(
    attributeDefinitions.flatMap((attribute) =>
      attribute.options.map((option) => [option.id, option.label] as const),
    ),
  )

  // Attachments live in private storage; suppliers reach them through a short-lived
  // signed link rather than a guessable path.
  const attachments = await Promise.all(
    request.attachments.map(async (attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      url: await storage.signedUrl(attachment.key, 600),
    })),
  )

  const offerAttachmentUrl =
    myOffer?.attachmentKey !== undefined && myOffer?.attachmentKey !== null
      ? await storage.signedUrl(myOffer.attachmentKey, 600)
      : null

  const unitLabel = t.units[request.unit as keyof typeof t.units] ?? request.unit
  const place = request.deliveryLocality
  const placeName = place ? (locale === 'ro' ? place.nameRo : place.nameRu) : null
  const districtName = place?.district
    ? locale === 'ro'
      ? place.district.nameRo
      : place.district.nameRu
    : null

  const categoryName =
    request.category.translations.find((translation) => translation.locale === locale)?.name ??
    request.category.translations[0]?.name ??
    ''
  const categorySlug =
    request.category.translations.find((translation) => translation.locale === locale)?.slug ??
    request.category.slug

  const facts: { icon: ReactNode; label: string; value: string }[] = [
    {
      icon: <MessageSquareQuote className="h-4 w-4" aria-hidden />,
      label: t.request.quantity,
      value: formatQuantity(request.quantity, unitLabel, locale),
    },
  ]

  if (request.maxBudgetBani !== null) {
    facts.push({
      icon: <Truck className="h-4 w-4" aria-hidden />,
      label: t.request.budget,
      value: fmt(t.request.budgetTo, { amount: formatMoney(request.maxBudgetBani, locale) }),
    })
  }

  if (request.desiredPriceBani !== null) {
    facts.push({
      icon: <Truck className="h-4 w-4" aria-hidden />,
      label: t.request.desiredPrice,
      value: fmt(t.product.pricePerUnit, {
        price: formatMoney(request.desiredPriceBani, locale),
        unit: unitLabel,
      }),
    })
  }

  if (placeName) {
    facts.push({
      icon: <MapPin className="h-4 w-4" aria-hidden />,
      label: t.request.region,
      value: districtName && districtName !== placeName ? `${placeName}, ${districtName}` : placeName,
    })
  }

  if (request.deliveryAddress) {
    facts.push({
      icon: <MapPin className="h-4 w-4" aria-hidden />,
      label: t.request.deliveryAddress,
      value: request.deliveryAddress,
    })
  }

  if (request.firstDeliveryAt) {
    facts.push({
      icon: <CalendarDays className="h-4 w-4" aria-hidden />,
      label: t.request.deliveryDate,
      value: formatDateShort(request.firstDeliveryAt, locale),
    })
  }

  facts.push({
    icon: <Repeat className="h-4 w-4" aria-hidden />,
    label: t.request.frequency,
    value: request.isRecurring
      ? (t.frequency[request.frequency as keyof typeof t.frequency] ?? t.request.badgeWeekly)
      : t.request.badgeOneTime,
  })

  if (request.supplierRadiusKm !== null) {
    facts.push({
      icon: <MapPin className="h-4 w-4" aria-hidden />,
      label: t.request.supplierRadius,
      value: fmt(t.request.supplierRadiusValue, { km: request.supplierRadiusKm }),
    })
  }

  const requirements: { label: string; value: string }[] = []
  if (request.documentRequirements) {
    requirements.push({
      label: t.request.documentRequirements,
      value: request.documentRequirements,
    })
  }
  if (request.packagingRequirements) {
    requirements.push({
      label: t.request.packagingRequirements,
      value: request.packagingRequirements,
    })
  }
  if (request.storageConditions) {
    requirements.push({ label: t.request.storageConditions, value: request.storageConditions })
  }

  return (
    <div className="container py-10">
      <Breadcrumbs
        label={t.a11y.breadcrumb}
        items={[
          { label: t.catalog.breadcrumbHome, href: localePath(locale) },
          { label: t.request.title, href: localePath(locale, 'requests') },
          { label: categoryName, href: localePath(locale, 'category', categorySlug) },
          { label: request.title },
        ]}
      />

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {request.isUrgent ? (
              <Badge variant="accent" size="sm">
                {t.request.badgeUrgent}
              </Badge>
            ) : null}
            {request.verifiedOnly ? (
              <Badge variant="primary" size="sm">
                {t.request.badgeVerifiedOnly}
              </Badge>
            ) : null}
            {request.allowPartial ? (
              <Badge variant="neutral" size="sm">
                {t.request.badgePartial}
              </Badge>
            ) : null}
            <StatusBadge
              status={request.status}
              label={t.requestStatus[request.status as keyof typeof t.requestStatus] ?? request.status}
              size="sm"
            />
          </div>

          <h1 className="mt-3 text-h1">{request.title}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-muted-foreground">
            <span>{fmt(t.request.postedAt, { date: formatDate(request.createdAt, locale) })}</span>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {fmt(t.product.viewsCount, { count: request.viewsCount })}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden />
              {fmt(t.request.offersCount, { count: offersCount })}
            </span>
          </div>

          {request.visibility === 'PRIVATE' ? (
            <Alert variant="warning" className="mt-4">
              {t.request.privateNotice}
            </Alert>
          ) : null}

          {request.description ? (
            <section className="mt-8" aria-labelledby="request-description-title">
              <h2 id="request-description-title" className="text-h3">
                {t.request.description}
              </h2>
              <p className="mt-2 whitespace-pre-line text-base leading-relaxed">
                {request.description}
              </p>
            </section>
          ) : null}

          <section className="mt-8" aria-labelledby="request-facts-title">
            <h2 id="request-facts-title" className="text-h3">
              {t.request.needed}
            </h2>
            {/* The commercial facts are what a supplier scans before deciding to quote,
                so they sit on their own card with each glyph in a tinted chip instead of
                floating loose against the page. */}
            <dl className="surface mt-3 grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 md:p-5">
              {facts.map((fact) => (
                // The chip spans both rows of a two-row grid, which keeps <dt> and <dd>
                // direct children of the <div> — a <span> around them was invalid in a <dl>.
                <div
                  key={`${fact.label}-${fact.value}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3"
                >
                  <span aria-hidden className="icon-chip row-span-2 h-9 w-9">
                    {fact.icon}
                  </span>
                  <dt className="text-caption text-muted-foreground">{fact.label}</dt>
                  <dd className="tnum text-sm font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {request.attributes.length > 0 ? (
            <section className="mt-8" aria-labelledby="request-attributes-title">
              <h2 id="request-attributes-title" className="text-h3">
                {t.request.attributes}
              </h2>
              {/* Row rules kept: a spec list is read line by line and the lines have to be
                  separable. The box outline around them is what went. */}
              <dl className="surface mt-3 divide-y divide-border">
                {request.attributes.map((value) => {
                  const label =
                    value.attribute.translations.find(
                      (translation) => translation.locale === locale,
                    )?.label ??
                    value.attribute.translations[0]?.label ??
                    value.attribute.key

                  const rendered =
                    value.optionId !== null
                      ? (optionLabels.get(value.optionId) ?? '—')
                      : value.valueBool !== null
                        ? value.valueBool
                          ? t.common.yes
                          : t.common.no
                        : value.valueNumber !== null
                          ? `${value.valueNumber}${value.attribute.unit ? ` ${value.attribute.unit}` : ''}`
                          : (value.valueText ?? '—')

                  return (
                    <div
                      key={value.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3"
                    >
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="text-sm font-medium">{rendered}</dd>
                    </div>
                  )
                })}
              </dl>
            </section>
          ) : null}

          {requirements.length > 0 || request.allowPartial || request.verifiedOnly ? (
            <section className="mt-8" aria-labelledby="request-requirements-title">
              <h2 id="request-requirements-title" className="text-h3">
                {t.request.requirements}
              </h2>
              <div className="surface mt-3 space-y-4 p-4 md:p-5">
                {requirements.length > 0 ? (
                  <dl className="space-y-4">
                    {requirements.map((requirement) => (
                      <div key={requirement.label}>
                        <dt className="text-caption text-muted-foreground">{requirement.label}</dt>
                        <dd className="mt-0.5 whitespace-pre-line text-sm">{requirement.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {request.allowPartial || request.verifiedOnly ? (
                  <ul className="space-y-2 text-sm">
                    {request.allowPartial ? (
                      <li className="flex items-center gap-2.5">
                        <span aria-hidden className="icon-chip h-7 w-7">
                          <ShieldCheck className="h-4 w-4" />
                        </span>
                        {t.request.allowPartial}
                      </li>
                    ) : null}
                    {request.verifiedOnly ? (
                      <li className="flex items-center gap-2.5">
                        <span aria-hidden className="icon-chip h-7 w-7">
                          <ShieldCheck className="h-4 w-4" />
                        </span>
                        {t.request.verifiedOnly}
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            </section>
          ) : null}

          {attachments.length > 0 ? (
            <section className="mt-8" aria-labelledby="request-attachments-title">
              <h2 id="request-attachments-title" className="text-h3">
                {t.request.attachments}
              </h2>
              <ul className="mt-3 space-y-2">
                {attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="surface-interactive flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-primary"
                    >
                      <span aria-hidden className="icon-chip h-9 w-9">
                        <Paperclip className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 truncate">{attachment.fileName}</span>
                      <span className="sr-only">{t.a11y.newTab}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* ------------------------------------------------------------ aside */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="surface p-5">
            {request.offersDeadlineAt ? (
              <p className="surface-muted flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm">
                <CalendarClock className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                <span className="text-muted-foreground">{t.request.deadline}</span>
                <OfferDeadline
                  className="tnum ml-auto font-medium text-warning"
                  deadline={request.offersDeadlineAt.toISOString()}
                  initial={formatCountdown(request.offersDeadlineAt, locale)}
                />
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t.request.deadlineNone}</p>
            )}

            <div className="mt-4">
              {isOwner ? (
                <div className="space-y-2">
                  <Link
                    href={localePath(locale, 'requests', request.slug, 'offers')}
                    className={buttonVariants({ size: 'lg', fullWidth: true })}
                  >
                    <MessageSquareQuote className="mr-2 h-4 w-4" aria-hidden />
                    {t.request.viewOffers}
                  </Link>
                  <Link
                    href={localePath(locale, 'requests', request.slug, 'edit')}
                    className={buttonVariants({ variant: 'outline', fullWidth: true })}
                  >
                    <Pencil className="mr-2 h-4 w-4" aria-hidden />
                    {t.common.edit}
                  </Link>
                  <p className="text-caption text-muted-foreground">{t.request.ownRequestNotice}</p>
                </div>
              ) : !user ? (
                <Link
                  href={`${localePath(locale, 'login')}?next=${encodeURIComponent(
                    localePath(locale, 'requests', request.slug),
                  )}`}
                  className={buttonVariants({ size: 'lg', fullWidth: true })}
                >
                  {t.request.loginToOffer}
                </Link>
              ) : !user.companyId ? (
                <Link
                  href={localePath(locale, 'onboarding')}
                  className={buttonVariants({ size: 'lg', fullWidth: true })}
                >
                  {t.company.createCompany}
                </Link>
              ) : !user.isSeller ? (
                <p className="text-sm text-muted-foreground">{t.request.sellerOnlyNotice}</p>
              ) : myOffer ? null : isOpen ? (
                <OfferLauncher
                  requestId={request.id}
                  requestTitle={request.title}
                  defaultUnit={request.unit}
                  defaultQuantity={request.quantity}
                  products={(sellerProducts?.items ?? []).map((product) => ({
                    id: product.id,
                    title: product.title,
                  }))}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t.errors.offerClosed}</p>
              )}
            </div>

            {!isOwner && user?.isSeller ? (
              <p className="mt-3 text-caption text-muted-foreground">{t.offer.sealedNotice}</p>
            ) : null}
          </div>

          {myOffer ? (
            <MyOfferCard
              offer={{
                id: myOffer.id,
                priceBani: myOffer.priceBani,
                quantity: myOffer.quantity,
                unit: myOffer.unit,
                deliveryPriceBani: myOffer.deliveryPriceBani,
                deliveryAt: myOffer.deliveryAt,
                deliveryDays: myOffer.deliveryDays,
                paymentMethod: myOffer.paymentMethod,
                validUntil: myOffer.validUntil,
                regularity: myOffer.regularity,
                comment: myOffer.comment,
                attachmentKey: myOffer.attachmentKey,
                attachmentName: myOffer.attachmentName,
                alternativeProductId: myOffer.alternativeProductId,
                status: myOffer.status,
              }}
              requestId={request.id}
              attachmentUrl={offerAttachmentUrl}
              products={(sellerProducts?.items ?? []).map((product) => ({
                id: product.id,
                title: product.title,
              }))}
              locale={locale}
              t={t}
            />
          ) : null}

          <div>
            <h2 className="mb-3 text-h3">{t.request.buyer}</h2>
            <CompanyCard company={request.company} locale={locale} t={t} />
          </div>
        </aside>
      </div>
    </div>
  )
}
