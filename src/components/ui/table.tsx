import * as React from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * `min-w-0` is not optional: as a flex/grid child this element would otherwise be sized
 * by the table inside it and the whole page would scroll sideways at 320px.
 *
 * `relative` is not optional either, for a subtler reason. `overflow-x: auto` only clips
 * descendants whose containing block is inside the scroller — an absolutely positioned
 * one whose containing block sits further up escapes the clip entirely and extends the
 * *document's* scrollable width. Every row-action `<select>` in here carries an
 * `.sr-only` label, and `.sr-only` is `position: absolute`: with a static scroller those
 * labels landed at x≈833 on a 768 px viewport and the whole admin panel scrolled
 * sideways, even though the table itself was clipping perfectly. Making the scroller a
 * containing block is what actually contains it.
 */
export function TableScroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('no-scrollbar relative w-full min-w-0 overflow-x-auto', className)}>
      {children}
    </div>
  )
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
}

/**
 * The grey fill is gone — in a table the hairline plus the caption-sized, muted header
 * text is enough separation, and the fill was reading as a second nested box.
 */
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-border', className)} {...props} />
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />
}

export interface TRProps extends React.HTMLAttributes<HTMLTableRowElement> {
  interactive?: boolean
}

export function TR({ className, interactive = false, ...props }: TRProps) {
  return (
    <tr
      className={cn(interactive && 'transition-colors duration-150 hover:bg-muted/50', className)}
      {...props}
    />
  )
}

export function TH({
  className,
  scope = 'col',
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cn(
        'whitespace-nowrap px-4 py-3 text-caption font-semibold text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle text-foreground', className)} {...props} />
}

export function DataTableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  )
}
