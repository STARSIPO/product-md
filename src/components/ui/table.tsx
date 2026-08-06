import * as React from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function TableScroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('no-scrollbar w-full overflow-x-auto', className)}>{children}</div>
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-border bg-muted/60', className)} {...props} />
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
        'whitespace-nowrap px-4 py-2.5 text-caption font-semibold text-muted-foreground',
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
