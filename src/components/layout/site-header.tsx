'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Bell,
  ChevronDown,
  Heart,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Plus,
  ShieldCheck,
  User as UserIcon,
  X,
  Menu,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui'
import { GlobalSearch } from '@/components/search/global-search'
import { LanguageSwitcher } from './language-switcher'
import type { HeaderCounters } from '@/server/services/counters'

export interface HeaderUser {
  name: string
  companyName: string | null
  companySlug: string | null
  role: string
  isSeller: boolean
  isBuyer: boolean
  hasCompany: boolean
}

interface PopularCategory {
  id: string
  name: string
  slug: string
  icon: string | null
}

export function SiteHeader({
  user,
  counters,
  popularCategories,
}: {
  user: HeaderUser | null
  counters: HeaderCounters
  popularCategories: PopularCategory[]
}) {
  const { t, href } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [postOpen, setPostOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  const isStaff = user?.role === 'ADMIN' || user?.role === 'MODERATOR'

  return (
    // The bottom edge is a hairline rather than a rule: it is the only thing marking
    // where the sticky chrome ends, so it stays — softened, not deleted.
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="container flex h-16 items-center gap-3">
        <Link
          href={href()}
          className="flex shrink-0 items-center gap-2 rounded-md text-lg font-semibold tracking-tight"
        >
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <LayoutGrid className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="hidden sm:inline">Product.md</span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label={t.nav.menu}>
          <HeaderLink href={href('products')}>{t.nav.catalog}</HeaderLink>
          <HeaderLink href={href('requests')}>{t.nav.requests}</HeaderLink>
          <HeaderLink href={href('suppliers')}>{t.nav.suppliers}</HeaderLink>
        </nav>

        {/* The search field is the centre of the header; `min-w-0` keeps it shrinkable
            so nothing pushes the row into a horizontal scroll on a 320px screen. */}
        <div className="min-w-0 flex-1 lg:max-w-xl">
          <GlobalSearch popularCategories={popularCategories} />
        </div>

        <div className="flex items-center gap-1">
          {user ? (
            <>
              <IconLink
                href={href('favorites')}
                label={t.nav.favorites}
                count={counters.favorites}
                icon={<Heart className="h-[18px] w-[18px]" aria-hidden />}
              />
              <IconLink
                href={href('messages')}
                label={t.nav.messages}
                count={counters.unreadMessages}
                icon={<MessageSquare className="h-[18px] w-[18px]" aria-hidden />}
                highlight
              />
              <IconLink
                href={href('notifications')}
                label={t.nav.notifications}
                count={counters.unreadNotifications}
                icon={<Bell className="h-[18px] w-[18px]" aria-hidden />}
                highlight
              />
            </>
          ) : null}

          <div className="hidden md:block">
            <LanguageSwitcher />
          </div>

          {user ? (
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                className="flex h-10 items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft text-caption font-semibold text-primary">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
              </button>

              {accountOpen ? (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={() => setAccountOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-2 w-60 animate-slide-up overflow-hidden rounded-lg bg-card p-1.5 shadow-pop"
                  >
                    <div className="px-2 pb-2 pt-1.5">
                      <p className="truncate text-sm font-medium">{user.name}</p>
                      {user.companyName ? (
                        <p className="truncate text-caption text-muted-foreground">
                          {user.companyName}
                        </p>
                      ) : null}
                    </div>
                    <MenuLink href={href('dashboard')} onClick={() => setAccountOpen(false)}>
                      <UserIcon className="h-4 w-4" aria-hidden />
                      {t.nav.dashboard}
                    </MenuLink>
                    {isStaff ? (
                      <MenuLink
                        href={href(user.role === 'ADMIN' ? 'admin' : 'moderation')}
                        onClick={() => setAccountOpen(false)}
                      >
                        <ShieldCheck className="h-4 w-4" aria-hidden />
                        {user.role === 'ADMIN' ? t.nav.admin : t.nav.moderation}
                      </MenuLink>
                    ) : null}
                    <form action={href('logout')} method="get">
                      <button
                        type="submit"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <LogOut className="h-4 w-4" aria-hidden />
                        {t.common.signOut}
                      </button>
                    </form>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <Link
              href={href('login')}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'hidden md:inline-flex',
              )}
            >
              {t.common.signIn}
            </Link>
          )}

          <div className="relative hidden sm:block">
            <Button size="sm" onClick={() => setPostOpen((open) => !open)} aria-expanded={postOpen}>
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              {t.nav.post}
            </Button>

            {postOpen ? (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden
                  onClick={() => setPostOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-2 w-72 animate-slide-up overflow-hidden rounded-lg bg-card p-1.5 shadow-pop"
                >
                  <PostOption
                    href={href('products', 'new')}
                    title={t.nav.postProduct}
                    hint={t.nav.postProductHint}
                    onClick={() => setPostOpen(false)}
                  />
                  <PostOption
                    href={href('requests', 'new')}
                    title={t.nav.postRequest}
                    hint={t.nav.postRequestHint}
                    onClick={() => setPostOpen(false)}
                  />
                </div>
              </>
            ) : null}
          </div>

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-md transition-colors hover:bg-muted lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t.nav.closeMenu : t.nav.openMenu}
          >
            {menuOpen ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Menu className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="animate-slide-up bg-card shadow-card lg:hidden">
          <nav className="container flex flex-col py-2" aria-label={t.nav.menu}>
            <MobileLink href={href('products')} onClick={() => setMenuOpen(false)}>
              {t.nav.catalog}
            </MobileLink>
            <MobileLink href={href('requests')} onClick={() => setMenuOpen(false)}>
              {t.nav.requests}
            </MobileLink>
            <MobileLink href={href('suppliers')} onClick={() => setMenuOpen(false)}>
              {t.nav.suppliers}
            </MobileLink>
            <MobileLink href={href('pricing')} onClick={() => setMenuOpen(false)}>
              {t.footer.pricing}
            </MobileLink>
            {user ? (
              <MobileLink href={href('dashboard')} onClick={() => setMenuOpen(false)}>
                {t.nav.dashboard}
              </MobileLink>
            ) : (
              <MobileLink href={href('login')} onClick={() => setMenuOpen(false)}>
                {t.common.signIn}
              </MobileLink>
            )}
            <div className="mt-2">
              <LanguageSwitcher />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  )
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  )
}

function MobileLink({
  href,
  onClick,
  children,
}: {
  href: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex min-h-[44px] items-center rounded-md px-2 text-sm font-medium transition-colors hover:bg-muted"
    >
      {children}
    </Link>
  )
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  )
}

function PostOption({
  href,
  title,
  hint,
  onClick,
}: {
  href: string
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="block rounded-md px-2.5 py-2.5 transition-colors hover:bg-muted"
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-caption text-muted-foreground">{hint}</span>
    </Link>
  )
}

function IconLink({
  href,
  label,
  count,
  icon,
  highlight = false,
}: {
  href: string
  label: string
  count: number
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <Link
      href={href}
      aria-label={count > 0 ? `${label} (${count})` : label}
      className="relative hidden h-10 w-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:grid"
    >
      {icon}
      {count > 0 ? (
        <span
          className={cn(
            'absolute right-1 top-1 grid min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-semibold leading-[17px]',
            highlight ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/80 text-card',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  )
}
