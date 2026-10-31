'use client'

import { Moon, Sun } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { applyTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

/**
 * Switches between the light and dark themes.
 *
 * The server cannot know the visitor's theme, so both icons are rendered and CSS
 * shows the right one: the moon offers dark on a light page, the sun offers light
 * on a dark page. Nothing theme-dependent goes through React state, so there is no
 * hydration mismatch and no icon flicker.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n()

  function toggle() {
    applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t.nav.theme}
      title={t.nav.theme}
      className={cn(
        // 44px on phones, where the button sits in the header bar beside the menu.
        'grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-10 md:w-10',
        className,
      )}
    >
      <Moon className="h-[18px] w-[18px] dark:hidden" aria-hidden />
      <Sun className="hidden h-[18px] w-[18px] dark:block" aria-hidden />
    </button>
  )
}
