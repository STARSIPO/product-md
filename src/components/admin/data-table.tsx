import type { ReactNode } from 'react'
import { ArrowRight, Check, ListChecks } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  DataTableEmpty,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableScroll,
  buttonVariants,
} from '@/components/ui'

/**
 * The admin list primitive.
 *
 * One definition of the columns renders two layouts: a real <table> from `md` up, and a
 * list of cards below it. A horizontally scrolling eight-column table on a 360 px phone
 * is unusable, and duplicating the markup per screen is how the two versions drift
 * apart — so the cell renderers are shared and only the wrapper changes.
 *
 * This is a server component: `cell` receives the row and may return links, badges or
 * client components. Nothing here is interactive on its own.
 */

export interface DataColumn<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** Becomes the card headline on mobile instead of a label/value pair. */
  primary?: boolean
  /** Dropped from the mobile card — internal ids and redundant detail. */
  hideOnMobile?: boolean
  align?: 'left' | 'right'
  className?: string
}

export interface DataTableProps<T> {
  rows: readonly T[]
  columns: readonly DataColumn<T>[]
  rowKey: (row: T) => string
  /** Shown in place of the rows when the result set is empty. */
  empty: string
  /** Accessible description of the table; rendered visually hidden. */
  caption?: string
  className?: string
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  caption,
  className,
}: DataTableProps<T>) {
  const primary = columns.find((column) => column.primary) ?? columns[0]
  const secondary = columns.filter((column) => column !== primary && !column.hideOnMobile)

  return (
    <div
      className={cn(
        // Elevation instead of an outline; `overflow-hidden` keeps the internal row
        // hairlines from poking out past the rounded corners.
        'surface overflow-hidden',
        // Generous gutters: an operator reads these rows all day, and the extra space is
        // what lets the hairline row rules carry the separation on their own.
        // Horizontal only — the empty-state cell sets its own generous vertical padding
        // and an arbitrary descendant variant would outrank it.
        '[&_td]:px-5 [&_th]:px-5',
        // Row actions are built from the shared controls, which top out at 42px — right
        // for a desktop toolbar, two pixels short of a thumb. Below `md` they grow.
        '[&_select]:min-h-[44px] md:[&_select]:min-h-[42px]',
        className,
      )}
    >
      {/* ------------------------------------------------------- table (md+) */}
      <TableScroll className="hidden md:block">
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <THead>
            <TR>
              {columns.map((column) => (
                <TH
                  key={column.key}
                  className={cn(column.align === 'right' && 'text-right', column.className)}
                >
                  {column.header}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <DataTableEmpty colSpan={columns.length}>{empty}</DataTableEmpty>
            ) : (
              rows.map((row) => (
                <TR key={rowKey(row)} interactive>
                  {columns.map((column) => (
                    <TD
                      key={column.key}
                      className={cn(column.align === 'right' && 'text-right', column.className)}
                    >
                      {column.cell(row)}
                    </TD>
                  ))}
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableScroll>

      {/* ------------------------------------------------------ cards (< md) */}
      <div className="md:hidden">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={rowKey(row)} className="px-4 py-4">
                {primary ? (
                  <div className="text-sm font-medium text-foreground">{primary.cell(row)}</div>
                ) : null}
                {secondary.length > 0 ? (
                  <dl className="mt-2 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                    {secondary.map((column) => (
                      <div key={column.key} className="contents">
                        <dt className="text-caption text-muted-foreground">{column.header}</dt>
                        <dd className="min-w-0 text-sm text-foreground">{column.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export interface TableToolbarProps {
  /** Where the GET form submits — the current page path. */
  action: string
  label: string
  submitLabel: string
  resetHref?: string
  resetLabel?: string
  children: ReactNode
  className?: string
}

/**
 * Search and filter bar.
 *
 * A plain GET form on purpose: filters end up in the URL, so a moderator can bookmark
 * "documents pending review" and send the link to a colleague, and the page keeps
 * working with JavaScript disabled.
 */
export function TableToolbar({
  action,
  label,
  submitLabel,
  resetHref,
  resetLabel,
  children,
  className,
}: TableToolbarProps) {
  return (
    <form
      method="get"
      action={action}
      aria-label={label}
      className={cn(
        'surface p-4',
        // Same reason as in DataTable: the shared controls are 42px, and a filter bar is
        // exactly what an operator pokes at one-handed on a phone.
        '[&_select]:min-h-[44px] md:[&_select]:min-h-[42px]',
        '[&_input]:min-h-[44px] md:[&_input]:min-h-[42px]',
        className,
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* The shared button recipe rather than a hand-copied class list — one place
            decides the radius and the focus ring for every control in the panel. */}
        <button type="submit" className={buttonVariants({ variant: 'primary' })}>
          {submitLabel}
        </button>
        {resetHref && resetLabel ? (
          <a href={resetHref} className={buttonVariants({ variant: 'ghost' })}>
            {resetLabel}
          </a>
        ) : null}
      </div>
    </form>
  )
}

/** A labelled metric for the dashboard and the system page. */
export function StatTile({
  label,
  value,
  hint,
  href,
}: {
  label: string
  value: string | number
  hint?: string
  href?: string
}) {
  const body = (
    <>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="tnum mt-1 text-h2">{value}</p>
      {hint ? <p className="mt-1 text-caption text-muted-foreground">{hint}</p> : null}
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        className="surface-interactive block p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {body}
      </a>
    )
  }

  return <div className="surface p-4">{body}</div>
}

/**
 * One entry of the "what needs me right now" queue on the overview page.
 *
 * A zero is not rendered as a zero. "0 жалоб" and "3 жалобы" look alike at a glance and
 * both read as data; «всё чисто» reads as an answer, which is the only thing an operator
 * opening this screen at 8am actually wants. A non-empty queue is the loud state — a
 * tinted card, a large tabular number and a link straight into the filtered list.
 */
export function ActionQueueCard({
  label,
  count,
  href,
  clearLabel,
  openLabel,
  icon,
  tone = 'attention',
}: {
  label: string
  count: number
  href: string
  /** Shown instead of the number when the queue is empty. */
  clearLabel: string
  openLabel: string
  /** Section glyph, rendered inside a tinted chip. Falls back to a generic queue mark. */
  icon?: ReactNode
  tone?: 'attention' | 'critical'
}) {
  const pending = count > 0

  return (
    <a
      href={href}
      aria-label={`${label}: ${pending ? count : clearLabel}`}
      className={cn(
        // Elevation, not an outline. A pending queue is the loud state: it keeps the
        // tinted fill, while a clear one settles onto the same white card as everything
        // else on the page.
        'flex min-h-[132px] flex-col justify-between rounded-lg p-5 shadow-card transition-shadow duration-200 hover:shadow-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        pending ? (tone === 'critical' ? 'bg-destructive-soft' : 'bg-warning-soft') : 'bg-card',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'icon-chip h-10 w-10 [&>svg]:h-5 [&>svg]:w-5',
            pending
              ? tone === 'critical'
                ? 'bg-card text-destructive'
                : 'bg-card text-warning'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {icon ?? <ListChecks />}
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{label}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        {pending ? (
          <p
            className={cn(
              'tnum text-h1 leading-none',
              tone === 'critical' ? 'text-destructive' : 'text-warning',
            )}
          >
            {count}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-medium text-success">
            <Check aria-hidden className="h-4 w-4 shrink-0" />
            {clearLabel}
          </p>
        )}

        <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
          {openLabel}
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </span>
      </div>
    </a>
  )
}

/**
 * CSV download for the list currently on screen.
 *
 * A plain link, not a fetch: the export is a GET route handler that streams
 * `text/csv`, so the browser's own download machinery handles it and the URL — filters
 * included — can be bookmarked or handed to a colleague.
 */
export function ExportLink({
  href,
  label,
  className,
}: {
  href: string
  label: string
  className?: string
}) {
  return (
    <a
      href={href}
      download
      className={buttonVariants({
        variant: 'outline',
        size: 'sm',
        // 36px is a desktop toolbar height; on a phone this has to stay thumb-sized.
        className: cn('min-h-[44px] md:min-h-[36px]', className),
      })}
    >
      {label}
    </a>
  )
}
