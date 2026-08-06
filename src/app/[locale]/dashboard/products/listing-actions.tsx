'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Archive, Copy, Pause, Pencil, Play } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { resolveErrorMessage } from '@/app/[locale]/login/login-form'
import {
  archiveListing,
  duplicateListing,
  pauseListing,
  resumeListing,
} from '@/server/actions/listings'
import type { ActionResult } from '@/server/actions/result'

/**
 * Row actions for one listing.
 *
 * The only thing this component sends to the server is the product id; ownership is
 * re-resolved there on every call (`assertOwnsProduct`), so a button rendered from a
 * stale page — or fabricated outright — cannot touch someone else's listing.
 *
 * Failures are announced through an aria-live region rather than only a toast: a
 * screen-reader user pressing "pause" has to hear that it did not happen.
 */

export function ListingActions({
  productId,
  slug,
  status,
}: {
  productId: string
  slug: string
  status: string
}) {
  const { t, fmt, href } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        const message = resolveErrorMessage(t, result, fmt)
        setError(message)
        toast({ title: message, variant: 'error' })
        return
      }
      toast({ title: successMessage, variant: 'success' })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Link
        href={href('products', slug, 'edit')}
        aria-label={`${t.common.edit}`}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Pencil className="h-4 w-4" aria-hidden />
        <span className="sr-only lg:not-sr-only lg:inline">{t.common.edit}</span>
      </Link>

      {status === 'ACTIVE' ? (
        <Button
          variant="ghost"
          size="sm"
          loading={pending}
          className="min-h-[44px]"
          onClick={() => run(() => pauseListing(productId), t.dashboard.statusChanged)}
        >
          <Pause className="h-4 w-4" aria-hidden />
          <span className="sr-only lg:not-sr-only lg:inline">{t.common.pause}</span>
        </Button>
      ) : null}

      {status === 'PAUSED' || status === 'SOLD_OUT' ? (
        <Button
          variant="ghost"
          size="sm"
          loading={pending}
          className="min-h-[44px]"
          onClick={() => run(() => resumeListing(productId), t.dashboard.statusChanged)}
        >
          <Play className="h-4 w-4" aria-hidden />
          <span className="sr-only lg:not-sr-only lg:inline">{t.common.resume}</span>
        </Button>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        className="min-h-[44px]"
        onClick={() => run(() => duplicateListing(productId), t.dashboard.duplicated)}
      >
        <Copy className="h-4 w-4" aria-hidden />
        <span className="sr-only lg:not-sr-only lg:inline">{t.common.duplicate}</span>
      </Button>

      {status !== 'ARCHIVED' ? (
        <Button
          variant="ghost"
          size="sm"
          loading={pending}
          className="min-h-[44px]"
          onClick={() => {
            if (!window.confirm(t.dashboard.confirmArchive)) return
            run(() => archiveListing(productId), t.dashboard.archived)
          }}
        >
          <Archive className="h-4 w-4" aria-hidden />
          <span className="sr-only lg:not-sr-only lg:inline">{t.common.archive}</span>
        </Button>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {error ?? ''}
      </p>
    </div>
  )
}
