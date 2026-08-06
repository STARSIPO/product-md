'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Package } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

/**
 * Product photo gallery.
 *
 * The first photo is server-rendered with `priority`, so the largest element on the
 * page is painted before hydration; switching photos is the only thing that needs
 * JavaScript. Thumbnails are real buttons rather than a scroll-snap carousel — a
 * wholesale buyer comparing a label crop against a pallet shot wants to jump, not swipe.
 */

export interface GalleryPhoto {
  id: string
  key: string
  alt: string | null
}

export function ProductGallery({ photos, title }: { photos: readonly GalleryPhoto[]; title: string }) {
  const { t, fmt } = useI18n()
  const [index, setIndex] = useState(0)

  if (photos.length === 0) {
    return (
      <div className="grid aspect-[4/3] w-full place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
        <Package className="h-10 w-10" aria-hidden />
        <span className="mt-2 text-sm">{t.product.noPhoto}</span>
      </div>
    )
  }

  const safeIndex = Math.min(Math.max(index, 0), photos.length - 1)
  const current = photos[safeIndex]
  if (!current) return null

  const go = (next: number) => setIndex((next + photos.length) % photos.length)

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-muted">
        <Image
          key={current.id}
          src={current.key}
          alt={current.alt ?? title}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="object-cover"
        />

        {photos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(safeIndex - 1)}
              aria-label={t.a11y.previousPage}
              className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/90 text-foreground shadow-card backdrop-blur transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(safeIndex + 1)}
              aria-label={t.a11y.nextPage}
              className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/90 text-foreground shadow-card backdrop-blur transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>

            <p
              aria-live="polite"
              className="tnum absolute bottom-2 right-2 rounded-full bg-foreground/70 px-2.5 py-1 text-caption font-medium text-background"
            >
              {fmt(t.product.photoOf, { current: safeIndex + 1, total: photos.length })}
            </p>
          </>
        ) : null}
      </div>

      {photos.length > 1 ? (
        <ul
          aria-label={t.product.gallery}
          className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          {photos.map((photo, position) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                aria-current={position === safeIndex ? 'true' : undefined}
                aria-label={fmt(t.product.photoOf, {
                  current: position + 1,
                  total: photos.length,
                })}
                className={cn(
                  'relative h-16 w-20 shrink-0 overflow-hidden rounded-md border bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  position === safeIndex
                    ? 'border-primary ring-1 ring-primary'
                    : 'border-border hover:border-muted-foreground/40',
                )}
              >
                <Image
                  src={photo.key}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
