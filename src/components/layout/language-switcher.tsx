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
    // A segmented control: one soft track, the active language raised out of it.
    <div
      className={cn('inline-flex items-center gap-0.5 rounded-full bg-muted p-1', className)}
      role="group"
      aria-label={t.nav.language}
    >
      <Globe className="ml-1.5 mr-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => select(option)}
          aria-current={option === locale ? 'true' : undefined}
          className={cn(
            // 44px on phones (the mobile menu renders this switcher), tighter once it
            // sits in the desktop header.
            'min-h-[44px] rounded-full px-3 text-sm font-medium uppercase transition-colors md:min-h-[32px] md:px-2.5',
            option === locale
              ? 'bg-card text-foreground shadow-card'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="sr-only">{LOCALE_LABELS[option]}</span>
          <span aria-hidden>{option}</span>
        </button>
      ))}
    </div>
  )
}
