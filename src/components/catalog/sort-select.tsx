'use client'

import { useId, useRef } from 'react'
import { useI18n } from '@/lib/i18n/provider'
import { PRODUCT_SORTS } from '@/lib/constants'
import { Select } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Sort control.
 *
 * A GET form rather than a router push: changing the sort changes the URL, so the sorted
 * view is shareable and the back button behaves. With JavaScript the `change` handler
 * submits it immediately; without JavaScript the form still submits via the (focusable)
 * button or by pressing Enter in the select. Every other active filter travels along as
 * hidden inputs so sorting never silently clears them.
 */
export function SortSelect({
  action,
  value,
  hidden,
  className,
}: {
  action: string
  value: string
  hidden: Readonly<Record<string, string>>
  className?: string
}) {
  const { t } = useI18n()
  const formRef = useRef<HTMLFormElement>(null)
  const id = `${useId()}-sort`

  return (
    <form
      ref={formRef}
      method="get"
      action={action}
      className={cn('flex min-w-0 items-center gap-2', className)}
    >
      {Object.entries(hidden).map(([name, hiddenValue]) => (
        <input key={name} type="hidden" name={name} value={hiddenValue} />
      ))}

      <label htmlFor={id} className="sr-only whitespace-nowrap text-sm text-muted-foreground md:not-sr-only">
        {t.sort.label}
      </label>

      <Select
        id={id}
        name="sort"
        defaultValue={value}
        onChange={() => formRef.current?.requestSubmit()}
        wrapperClassName="w-auto"
        className="w-auto min-w-[10rem]"
      >
        {PRODUCT_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {t.sort[sort]}
          </option>
        ))}
      </Select>

      <button
        type="submit"
        className="sr-only focus:not-sr-only focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-md focus:border focus:border-input focus:bg-card focus:px-3 focus:text-sm"
      >
        {t.filters.apply}
      </button>
    </form>
  )
}
