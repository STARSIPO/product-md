'use client'

import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'

export function SiteFooter() {
  const { t, href } = useI18n()
  const year = new Date().getFullYear()

  return (
    // No top rule and no boxed columns: the footer is the white block the page ends
    // on, and the columns are held apart by space alone.
    <footer className="mt-16 bg-card">
      <div className="container py-12">
        <div className="grid gap-x-8 gap-y-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
                <LayoutGrid className="h-[18px] w-[18px]" aria-hidden />
              </span>
              Product.md
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t.footer.aboutText}
            </p>
          </div>

          <FooterColumn title={t.footer.buyers}>
            <FooterLink href={href('products')}>{t.nav.catalog}</FooterLink>
            <FooterLink href={href('sales')}>{t.nav.sales}</FooterLink>
            <FooterLink href={href('delivery')}>{t.nav.delivery}</FooterLink>
            <FooterLink href={href('requests', 'new')}>{t.nav.postRequest}</FooterLink>
            <FooterLink href={href('suppliers')}>{t.nav.suppliers}</FooterLink>
          </FooterColumn>

          {/* No pricing link. The page still exists and still answers the question when
              someone asks it, but nothing in the product advertises a price list —
              there is nothing here that costs the user money. */}
          <FooterColumn title={t.footer.sellers}>
            <FooterLink href={href('products', 'new')}>{t.nav.postProduct}</FooterLink>
            <FooterLink href={href('requests')}>{t.nav.requests}</FooterLink>
            <FooterLink href={href('register')}>{t.nav.becomeSupplier}</FooterLink>
          </FooterColumn>

          <FooterColumn title={t.footer.company}>
            <FooterLink href={href('help')}>{t.footer.help}</FooterLink>
            <FooterLink href={href('contacts')}>{t.footer.contacts}</FooterLink>
            <FooterLink href={href('security')}>{t.footer.security}</FooterLink>
            <FooterLink href={href('partners')}>{t.footer.partners}</FooterLink>
          </FooterColumn>
        </div>

        {/* The platform's legal position, stated where it cannot be missed. */}
        <p className="surface-muted mt-10 px-4 py-3.5 text-caption leading-relaxed text-muted-foreground">
          {t.footer.disclaimer}
        </p>

        <div className="mt-8 flex flex-col gap-3 text-caption text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    // Not `display: contents` — that erases the <li> box, so the column's `space-y`
    // has nothing to put a margin on and every link in the column runs together on
    // one line ("КаталогСоздать заявкуПоставщики").
    <li>
      <Link
        href={href}
        className="inline-block rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </Link>
    </li>
  )
}
