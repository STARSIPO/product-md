import Link from 'next/link'
import { MapPin, Package, ShieldCheck } from 'lucide-react'
import { localePath, type Locale } from '@/lib/i18n/config'
import { fmt, type Dictionary } from '@/lib/i18n'
import { Avatar, Rating } from '@/components/ui'

export interface CompanyCardData {
  id: string
  slug: string
  displayName: string
  description: string | null
  logoKey: string | null
  ratingAvg: number
  ratingCount: number
  district: { nameRu: string; nameRo: string } | null
  locality: { nameRu: string; nameRo: string } | null
  badges: { type: string }[]
  _count?: { products: number }
}

export function CompanyCard({
  company,
  locale,
  t,
}: {
  company: CompanyCardData
  locale: Locale
  t: Dictionary
}) {
  const place = company.locality ?? company.district
  const placeName = place ? (locale === 'ro' ? place.nameRo : place.nameRu) : null
  const isVerified = company.badges.some(
    (badge) => badge.type === 'TRUSTED_SUPPLIER' || badge.type === 'DOCUMENTS',
  )

  return (
    <article className="group relative flex gap-3.5 rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:border-muted-foreground/30">
      <Avatar src={company.logoKey ?? undefined} name={company.displayName} size="lg" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <h3 className="min-w-0 text-base font-medium leading-snug">
            <Link
              href={localePath(locale, 'suppliers', company.slug)}
              className="clamp-1 after:absolute after:inset-0 after:content-['']"
            >
              {company.displayName}
            </Link>
          </h3>
          {isVerified ? (
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              aria-label={t.verification.types.TRUSTED_SUPPLIER}
            />
          ) : null}
        </div>

        {company.ratingCount > 0 ? (
          <div className="mt-1">
            <Rating
              value={company.ratingAvg}
              count={company.ratingCount}
              size="sm"
              showValue
              label={fmt(t.a11y.rating, { value: company.ratingAvg.toFixed(1) })}
            />
          </div>
        ) : (
          <p className="mt-1 text-caption text-muted-foreground">{t.company.noReviews}</p>
        )}

        {company.description ? (
          <p className="clamp-2 mt-2 text-sm text-muted-foreground">{company.description}</p>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
          {placeName ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {placeName}
            </span>
          ) : null}
          {company._count ? (
            <span className="inline-flex items-center gap-1">
              <Package className="h-3.5 w-3.5" aria-hidden />
              {company._count.products}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}
