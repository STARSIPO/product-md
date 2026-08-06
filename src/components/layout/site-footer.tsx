'use client'

import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'

export function SiteFooter() {
  const { t, href } = useI18n()
  const year = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div className="container py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </span>
              Product.md
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t.footer.aboutText}
            </p>
          </div>

          <FooterColumn title={t.footer.buyers}>
            <FooterLink href={href('products')}>{t.nav.catalog}</FooterLink>
            <FooterLink href={href('requests', 'new')}>{t.nav.postRequest}</FooterLink>
            <FooterLink href={href('suppliers')}>{t.nav.suppliers}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t.footer.sellers}>
            <FooterLink href={href('products', 'new')}>{t.nav.postProduct}</FooterLink>
            <FooterLink href={href('requests')}>{t.nav.requests}</FooterLink>
            <FooterLink href={href('pricing')}>{t.footer.pricing}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t.footer.company}>
            <FooterLink href={href('help')}>{t.footer.help}</FooterLink>
            <FooterLink href={href('contacts')}>{t.footer.contacts}</FooterLink>
            <FooterLink href={href('security')}>{t.footer.security}</FooterLink>
            <FooterLink href={href('partners')}>{t.footer.partners}</FooterLink>
          </FooterColumn>
        </div>

        {/* The platform's legal position, stated where it cannot be missed. */}
        <p className="mt-10 rounded-lg bg-muted px-4 py-3 text-caption leading-relaxed text-muted-foreground">
          {t.footer.disclaimer}
        </p>

        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6 text-caption text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} Product.md. {t.footer.rights}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <FooterLink href={href('terms')}>{t.footer.terms}</FooterLink>
            <FooterLink href={href('privacy')}>{t.footer.privacy}</FooterLink>
            <FooterLink href={href('rules')}>{t.footer.rules}</FooterLink>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li className="contents">
      <Link
        href={href}
        className="inline-block rounded text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </Link>
    </li>
  )
}
