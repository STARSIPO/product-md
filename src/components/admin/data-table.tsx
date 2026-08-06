import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { DataTableEmpty, TBody, TD, TH, THead, TR, Table, TableScroll } from '@/components/ui'

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
    <div className={cn('rounded-lg border border-border bg-card', className)}>
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
              <li key={rowKey(row)} className="px-4 py-3.5">
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
      className={cn('rounded-lg border border-border bg-card p-4', className)}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex min-h-[42px] items-center justify-center rounded-md border border-transparent bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {submitLabel}
        </button>
        {resetHref && resetLabel ? (
          <a
            href={resetHref}
            className="inline-flex min-h-[42px] items-center justify-center rounded-md border border-transparent px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
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
        className="block rounded-lg border border-border bg-card px-4 py-3.5 transition-[border-color,box-shadow] duration-150 hover:border-primary/35 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {body}
      </a>
    )
  }

  return <div className="rounded-lg border border-border bg-card px-4 py-3.5">{body}</div>
}
