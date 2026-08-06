'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toggleProductFavorite, toggleCompanyFavorite } from '@/server/actions/favorites'
import { useI18n } from '@/lib/i18n/provider'
import { useToast } from '@/components/ui'

/**
 * Optimistic favourite toggle.
 *
 * The heart flips immediately and rolls back if the action fails — waiting on a round
 * trip for a one-bit toggle makes a fast grid feel broken. An unauthenticated user is
 * sent to sign in rather than silently losing the click.
 */
export function FavoriteButton({
  productId,
  companyId,
  initial,
  label,
  className,
}: {
  productId?: string
  companyId?: string
  initial: boolean
  label: string
  className?: string
}) {
  const { t, href } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const [active, setActive] = useState(initial)
  const [pending, startTransition] = useTransition()

  function onClick(event: React.MouseEvent) {
    // The card is a stretched link; without this the click navigates instead.
    event.preventDefault()
    event.stopPropagation()

    const next = !active
    setActive(next)

    startTransition(async () => {
      const result = productId
        ? await toggleProductFavorite(productId)
        : companyId
          ? await toggleCompanyFavorite(companyId)
          : null

      if (!result) return

      if (!result.ok) {
        setActive(!next)
        if (result.error === 'unauthorized') {
          router.push(href('login'))
          return
        }
        toast({ title: t.errors[result.error as keyof typeof t.errors] ?? t.errors.generic, variant: 'error' })
        return
      }

      setActive(result.data)
      toast({
        title: result.data ? t.favorites.added : t.favorites.removed,
        variant: 'success',
      })
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'relative z-10 grid h-9 w-9 place-items-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-card backdrop-blur transition-colors',
        'hover:text-destructive disabled:opacity-60',
        active && 'text-destructive',
        className,
      )}
    >
      <Heart className={cn('h-[18px] w-[18px]', active && 'fill-current')} aria-hidden />
    </button>
  )
}
