import Link from 'next/link'
import { SlidersHorizontal } from 'lucide-react'
import type { Dictionary } from '@/lib/i18n'
import { Field, Select, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Category and district filters for the discounts page.
 *
 * A plain GET form, submitted by a real button: the result is a shareable, crawlable
 * URL, and it works with JavaScript off. There is deliberately no auto-submitting
 * select here — on a phone, changing the category and then the district would fire two
 * navigations and lose the second choice half the time.
 */

export interface SaleFilterOption {
  value: string
  label: string
}

export function SaleFilters({
  action,
  categories,
  districts,
  values,
  resetHref,
  t,
  className,
}: {
  action: string
  categories: readonly SaleFilterOption[]
  districts: readonly SaleFilterOption[]
  values: { category?: string | undefined; district?: string | undefined }
  resetHref: string
  t: Dictionary
  className?: string
}) {
  const hasFilters = values.category !== undefined || values.district !== undefined

  return (
    <form
      action={action}
      method="get"
      className={cn('surface min-w-0 p-4 md:p-5', className)}
      aria-label={t.filters.title}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end md:gap-4">
        <Field label={t.sales.filterCategory} htmlFor="sale-category">
          <Select id="sale-category" name="category" defaultValue={values.category ?? ''}>
            <option value="">{t.sales.filterAll}</option>
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.sales.filterDistrict} htmlFor="sale-district">
          <Select id="sale-district" name="district" defaultValue={values.district ?? ''}>
            <option value="">{t.sales.filterAll}</option>
            {districts.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={cn(buttonVariants(), 'min-h-[44px]')}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {t.filters.apply}
          </button>
          {hasFilters ? (
            <Link
              href={resetHref}
              className={cn(buttonVariants({ variant: 'ghost' }), 'min-h-[44px]')}
            >
              {t.sales.filterReset}
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  )
}
