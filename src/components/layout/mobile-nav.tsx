'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, LayoutGrid, MessageSquare, Plus, User } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

/**
 * Bottom navigation for phones.
 *
 * The layout adds `pb-safe-nav` to <main>, which reserves the bar's height plus the
 * iOS home-indicator inset — so the bar never covers the last row of content or a
 * sticky action button.
 */
export function MobileNav({
  isAuthenticated,
  unreadMessages,
}: {
  isAuthenticated: boolean
  unreadMessages: number
}) {
  const { t, href } = useI18n()
  const pathname = usePathname()

  const items = [
    { key: 'home', label: t.nav.home, icon: Home, target: href() },
    { key: 'catalog', label: t.nav.catalog, icon: LayoutGrid, target: href('products') },
    { key: 'post', label: t.nav.post, icon: Plus, target: href('products', 'new'), primary: true },
    {
      key: 'messages',
      label: t.nav.messages,
      icon: MessageSquare,
      target: href('messages'),
      badge: unreadMessages,
    },
    {
      key: 'profile',
      label: isAuthenticated ? t.nav.profile : t.common.signIn,
      icon: User,
      target: isAuthenticated ? href('dashboard') : href('login'),
    },
  ] as const

  return (
    <nav
      aria-label={t.nav.menu}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActive(pathname, item.target)
          const Icon = item.icon

          return (
            <li key={item.key}>
              <Link
                href={item.target}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-7 place-items-center rounded-full',
                    'primary' in item && item.primary
                      ? 'bg-primary text-primary-foreground'
                      : undefined,
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="max-w-full truncate">{item.label}</span>

                {'badge' in item && item.badge > 0 ? (
                  <span className="absolute right-[22%] top-1.5 grid min-w-[16px] place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function isActive(pathname: string, target: string): boolean {
  // The locale root ("/ru") should only light up Home, not every route beneath it.
  const segments = target.split('/').filter(Boolean)
  if (segments.length <= 1) return pathname === target || pathname === `${target}/`
  return pathname === target || pathname.startsWith(`${target}/`)
}
