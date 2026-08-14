'use client'

import { useId, useRef } from 'react'
import { Search } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { Button, Input, Select } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface StorefrontCategoryOption {
  value: string
  label: string
}

/**
 * Search and category for the storefront.
 *
 * A GET form, like every other filter in the product: the filtered view stays a URL, so
 * it is shareable, indexable and survives a reload. JavaScript only makes the category
 * apply on change instead of on submit — without it the visible button still works.
 *
 * The category list holds only categories that actually have something for sale today,
 * so a shopper never picks a filter that empties the grid.
 */
export function StorefrontFilters({
  action,
  q,
  category,
  categories,
  className,
}: {
  action: string
  q: string | undefined
  category: string | undefined
  categories: readonly StorefrontCategoryOption[]
  className?: string
}) {
  const { t } = useI18n()
  const formRef = useRef<HTMLFormElement>(null)
  const reactId = useId()
  const searchId = `${reactId}-q`
  const categoryId = `${reactId}-category`

  return (
    <form
      ref={formRef}
      method="get"
      action={action}
      className={cn('flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center', className)}
    >
      <div className="flex min-w-0 flex-1 gap-2">
        <label htmlFor={searchId} className="sr-only">
          {t.common.search}
        </label>
        <Input
          id={searchId}
          name="q"
          type="search"
          inputMode="search"
          defaultValue={q ?? ''}
          placeholder={t.retail.searchPlaceholder}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="outline" aria-label={t.common.search} className="shrink-0">
          <Search className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {categories.length > 0 ? (
        <>
          <label htmlFor={categoryId} className="sr-only">
            {t.sales.filterCategory}
          </label>
          <Select
            id={categoryId}
            name="category"
            defaultValue={category ?? ''}
            onChange={() => formRef.current?.requestSubmit()}
            wrapperClassName="sm:w-56 sm:shrink-0"
          >
            <option value="">{t.retail.categoryAll}</option>
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </>
      ) : null}
    </form>
  )
}
