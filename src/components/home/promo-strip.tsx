import Image from 'next/image'
import Link from 'next/link'
import { Package, Tag } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { localePath, type Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n'

/**
 * Promotion strip — the wide card row at the top of the catalogue.
 *
 * It renders ONLY when there is something promoted. An empty promo rail is worse than
 * no rail: it teaches users to scroll past that band, and it pushes real listings below
 * the fold for nothing. The page therefore skips this section entirely when the query
 * returns no rows.
 *
 * Horizontally scrollable on phones (native scroll + snap, no carousel JS), a plain
 * 4-column grid from `md` up.
 */

export interface PromoItem {
  id: string
  slug: string
  title: string
  priceBani: number
  unit: string
  photos: { key: string; alt: string | null }[]
  company: { displayName: string }
}

export function PromoStrip({
  items,
  locale,
  t,
}: {
  items: PromoItem[]
  locale: Locale
  t: Dictionary
}) {
  if (items.length === 0) return null

  return (
    <section className="container pt-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="icon-chip h-9 w-9 bg-accent-soft text-accent">
          <Tag className="h-4 w-4" aria-hidden />
        </span>
        <h2 className="text-h3">{t.home.promoTitle}</h2>
      </div>

      {/* `-my-2 py-2` gives the card shadows room inside the horizontal scroller. */}
      <ul className="no-scrollbar -mx-4 -my-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-2 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0">
        {items.map((item) => {
          const photo = item.photos[0]
          const unitLabel = t.units[item.unit as keyof typeof t.units] ?? item.unit

          return (
            <li
              key={item.id}
              className="w-[72vw] shrink-0 snap-start sm:w-[46vw] md:w-auto md:shrink"
            >
              <article className="surface-interactive group relative h-full overflow-hidden">
                <div className="relative aspect-[16/9] bg-muted">
                  {photo ? (
                    <Image
                      src={photo.key}
                      alt={photo.alt ?? item.title}
                      fill
                      sizes="(max-width: 768px) 72vw, 25vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground">
                      <Package className="h-7 w-7" aria-hidden />
                    </div>
                  )}

                  <span className="absolute left-2.5 top-2.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-wide text-accent-foreground">
                    {t.home.promoBadge}
                  </span>
                </div>

                <div className="p-4">
                  <h3 className="text-sm font-medium leading-snug">
                    <Link
                      href={localePath(locale, 'products', item.slug)}
                      className="clamp-2 after:absolute after:inset-0 after:content-['']"
                    >
                      {item.title}
                    </Link>
                  </h3>
                  <p className="tnum mt-2 text-lg font-semibold leading-none">
                    {formatMoney(item.priceBani, locale)}
                    <span className="ml-1 text-caption font-normal text-muted-foreground">
                      / {unitLabel}
                    </span>
                  </p>
                  <p className="clamp-1 mt-2 text-caption text-muted-foreground">
                    {item.company.displayName}
                  </p>
                </div>
              </article>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
