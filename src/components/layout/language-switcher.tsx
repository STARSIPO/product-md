'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Globe } from 'lucide-react'
import { LOCALES, LOCALE_LABELS, switchLocalePath } from '@/lib/i18n/config'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

/**
 * Switching language keeps the visitor on the same page — /ru/products/oreh becomes
 * /ro/produse/oreh, not the homepage. Losing the current page on a language switch is
 * the single most common i18n annoyance, and switchLocalePath() exists to avoid it.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t } = useI18n()
  const pathname = usePathname()
  const router = useRouter()

  function select(next: (typeof LOCALES)[number]) {
    if (next === locale) return
    // Persisted so the next locale-less visit lands in the right language.
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.push(switchLocalePath(pathname, locale, next))
    router.refresh()
  }

  return (
    <div
      className={cn('flex items-center gap-0.5 rounded-md p-0.5', className)}
      role="group"
      aria-label={t.nav.language}
    >
      <Globe className="mx-1 h-4 w-4 text-muted-foreground" aria-hidden />
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => select(option)}
          aria-current={option === locale ? 'true' : undefined}
          className={cn(
            'min-h-[36px] rounded px-2 text-sm font-medium uppercase transition-colors',
            option === locale
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <span className="sr-only">{LOCALE_LABELS[option]}</span>
          <span aria-hidden>{option}</span>
        </button>
      ))}
    </div>
  )
}
