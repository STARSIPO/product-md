'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { SlidersHorizontal } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { AVAILABILITY, UNITS } from '@/lib/constants'
import { Button, Checkbox, Input, Select, Sheet, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Catalogue facets.
 *
 * The whole panel is one plain `<form method="get">`. That is the load-bearing decision
 * here: filtering changes the URL, so every filtered view is shareable, bookmarkable,
 * crawlable and survives a page reload — and the catalogue keeps working with
 * JavaScript switched off. Nothing in here fetches; submitting navigates, and the
 * server re-renders from `searchParams`.
 *
 * `page` is deliberately absent from the form: changing a filter must return the buyer
 * to page 1 rather than to a page that may no longer exist.
 */

export interface FilterOption {
  value: string
  label: string
}

export interface FilterValues {
  q?: string | undefined
  category?: string | undefined
  priceMin?: string | undefined
  priceMax?: string | undefined
  unit?: string | undefined
  minOrderMax?: string | undefined
  district?: string | undefined
  delivery: boolean
  pickup: boolean
  verified: boolean
  origin?: string | undefined
  availability?: string | undefined
  regular: boolean
  ratingMin?: string | undefined
  since?: string | undefined
  sort?: string | undefined
}

export interface FilterPanelProps {
  /** Where the GET form submits — the catalogue or the category page. */
  action: string
  values: FilterValues
  categories: readonly FilterOption[]
  districts: readonly FilterOption[]
  /** On a category page the category lives in the path, so it is submitted hidden. */
  lockCategory?: boolean
  /** Set when the apply button lives outside the form (the mobile sheet footer). */
  formId?: string
  hideActions?: boolean
  resetHref: string
  className?: string
}

const RATING_STEPS = ['3', '4', '4.5'] as const
const SINCE_STEPS = ['24h', '7d', '30d'] as const

export function FilterPanel({
  action,
  values,
  categories,
  districts,
  lockCategory = false,
  formId,
  hideActions = false,
  resetHref,
  className,
}: FilterPanelProps) {
  const { t, fmt } = useI18n()
  const prefix = useId()
  const id = (name: string) => `${prefix}-${name}`

  const sinceLabels: Record<(typeof SINCE_STEPS)[number], string> = {
    '24h': t.filters.publishedLast24h,
    '7d': t.filters.publishedLast7d,
    '30d': t.filters.publishedLast30d,
  }

  return (
    <form
      id={formId}
      method="get"
      action={action}
      aria-label={t.filters.title}
      className={cn('space-y-5', className)}
    >
      {/* Carried through so filtering never silently drops the query or the sort. */}
      {values.q ? <input type="hidden" name="q" value={values.q} /> : null}
      {values.sort ? <input type="hidden" name="sort" value={values.sort} /> : null}
      {lockCategory && values.category ? (
        <input type="hidden" name="category" value={values.category} />
      ) : null}

      {!lockCategory ? (
        <Group label={t.filters.category} htmlFor={id('category')}>
          <Select id={id('category')} name="category" defaultValue={values.category ?? ''}>
            <option value="">{t.catalog.allCategories}</option>
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </Select>
        </Group>
      ) : null}

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="mb-1.5 text-sm font-medium">{t.filters.price}</legend>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={id('priceMin')} className="sr-only">
              {t.filters.priceFrom}
            </label>
            <Input
              id={id('priceMin')}
              name="priceMin"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={t.common.from}
              defaultValue={values.priceMin ?? ''}
            />
          </div>
          <div>
            <label htmlFor={id('priceMax')} className="sr-only">
              {t.filters.priceTo}
            </label>
            <Input
              id={id('priceMax')}
              name="priceMax"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={t.common.to}
              defaultValue={values.priceMax ?? ''}
            />
          </div>
        </div>
      </fieldset>

      <Group label={t.filters.unit} htmlFor={id('unit')}>
        <Select id={id('unit')} name="unit" defaultValue={values.unit ?? ''}>
          <option value="">{t.common.all}</option>
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {t.units[unit]}
            </option>
          ))}
        </Select>
      </Group>

      <Group label={t.filters.minOrderUpTo} htmlFor={id('minOrderMax')}>
        <Input
          id={id('minOrderMax')}
          name="minOrderMax"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={values.minOrderMax ?? ''}
        />
      </Group>

      <Group label={t.filters.region} htmlFor={id('district')}>
        <Select id={id('district')} name="district" defaultValue={values.district ?? ''}>
          <option value="">{t.common.all}</option>
          {districts.map((district) => (
            <option key={district.value} value={district.value}>
              {district.label}
            </option>
          ))}
        </Select>
      </Group>

      <Group label={t.filters.availability} htmlFor={id('availability')}>
        <Select id={id('availability')} name="availability" defaultValue={values.availability ?? ''}>
          <option value="">{t.common.all}</option>
          {AVAILABILITY.map((value) => (
            <option key={value} value={value}>
              {t.availability[value]}
            </option>
          ))}
        </Select>
      </Group>

      <Group label={t.filters.origin} htmlFor={id('origin')}>
        <Input
          id={id('origin')}
          name="origin"
          type="text"
          autoComplete="country-name"
          defaultValue={values.origin ?? ''}
        />
      </Group>

      <Group label={t.filters.rating} htmlFor={id('ratingMin')}>
        <Select id={id('ratingMin')} name="ratingMin" defaultValue={values.ratingMin ?? ''}>
          <option value="">{t.common.all}</option>
          {RATING_STEPS.map((step) => (
            <option key={step} value={step}>
              {fmt(t.filters.ratingFrom, { value: step })}
            </option>
          ))}
        </Select>
      </Group>

      <Group label={t.filters.publishedAt} htmlFor={id('since')}>
        <Select id={id('since')} name="since" defaultValue={values.since ?? ''}>
          <option value="">{t.common.all}</option>
          {SINCE_STEPS.map((step) => (
            <option key={step} value={step}>
              {sinceLabels[step]}
            </option>
          ))}
        </Select>
      </Group>

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">{t.filters.delivery}</legend>
        <Toggle name="delivery" label={t.filters.deliveryAvailable} checked={values.delivery} />
        <Toggle name="pickup" label={t.filters.pickup} checked={values.pickup} />
        <Toggle name="verified" label={t.filters.verifiedOnly} checked={values.verified} />
        <Toggle name="regular" label={t.filters.regularSupply} checked={values.regular} />
      </fieldset>

      {!hideActions ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button type="submit" fullWidth>
            {t.filters.apply}
          </Button>
          <Link
            href={resetHref}
            className={buttonVariants({ variant: 'ghost', fullWidth: true })}
          >
            {t.filters.reset}
          </Link>
        </div>
      ) : null}
    </form>
  )
}

function Group({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm">
      <Checkbox name={name} value="true" defaultChecked={checked} />
      {label}
    </label>
  )
}

/**
 * Mobile entry point: the same panel, in a bottom sheet.
 *
 * The apply button sits in the sheet footer and reaches the form through `form=`, so
 * the markup stays a single form — the sheet adds a container, not a second code path.
 */
export function FilterSheet(props: Omit<FilterPanelProps, 'formId' | 'hideActions' | 'className'>) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const formId = 'catalog-filters-mobile'

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="lg:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {t.common.filters}
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t.filters.title}
        closeLabel={t.common.close}
        footer={
          <>
            <Link
              href={props.resetHref}
              className={buttonVariants({ variant: 'ghost' })}
              onClick={() => setOpen(false)}
            >
              {t.filters.reset}
            </Link>
            <Button type="submit" form={formId}>
              {t.filters.apply}
            </Button>
          </>
        }
      >
        <FilterPanel {...props} formId={formId} hideActions />
      </Sheet>
    </>
  )
}
