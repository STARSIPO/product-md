import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'
import { localePath, type Locale } from '@/lib/i18n/config'

/** Shared frame for every authentication screen: narrow, centred, no distractions. */
export function AuthShell({
  locale,
  title,
  subtitle,
  children,
  footer,
}: {
  locale: Locale
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="container flex min-h-[calc(100dvh-4rem)] items-center justify-center py-10">
      <div className="w-full max-w-[26rem]">
        <Link
          href={localePath(locale)}
          className="mx-auto mb-6 flex w-fit items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </span>
          Product.md
        </Link>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card sm:p-7">
          <h1 className="text-h3">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-5 text-center text-sm">{footer}</div> : null}
      </div>
    </div>
  )
}
