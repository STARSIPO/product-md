'use client'

import { Button, Checkbox, CheckboxField, Field, Input, Textarea } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { formatMoney, parseAmountToBani } from '@/lib/money'
import { translate } from '@/app/[locale]/login/login-form'
import type { DistrictOption, StepProps } from './product-wizard'

/**
 * Step 5 — «Доставка».
 *
 * Delivery reach is the second thing a buyer filters on after price, so the regions are
 * real checkboxes over the `District` table rather than free text: a listing that says
 * "по всей стране" in prose is invisible to a district filter.
 */
export function StepDelivery({
  form,
  values,
  districts,
}: StepProps & { districts: DistrictOption[] }) {
  const { t, fmt, locale } = useI18n()
  const { errors } = form.formState

  const selected = new Set(values.deliveryRegions)
  const deliveryBani = parseAmountToBani(values.deliveryPriceBani.trim())

  function toggleRegion(id: string): void {
    const next = selected.has(id)
      ? values.deliveryRegions.filter((region) => region !== id)
      : [...values.deliveryRegions, id]
    form.setValue('deliveryRegions', next, { shouldDirty: true })
  }

  return (
    <div className="space-y-5">
      <Field
        label={t.productForm.deliveryTerms}
        htmlFor="product-delivery-terms"
        hint={t.productForm.deliveryTermsHint}
        error={translate(t, errors.deliveryTerms?.message)}
      >
        <Textarea
          id="product-delivery-terms"
          rows={3}
          maxLength={1000}
          placeholder={t.productForm.deliveryTermsPlaceholder}
          invalid={Boolean(errors.deliveryTerms)}
          {...form.register('deliveryTerms')}
        />
      </Field>

      <Field
        label={t.productForm.deliveryPrice}
        htmlFor="product-delivery-price"
        hint={
          deliveryBani === null
            ? t.productForm.deliveryPriceHint
            : formatMoney(deliveryBani, locale)
        }
        error={translate(t, errors.deliveryPriceBani?.message)}
      >
        <Input
          id="product-delivery-price"
          inputMode="decimal"
          autoComplete="off"
          placeholder={t.productForm.pricePlaceholder}
          invalid={Boolean(errors.deliveryPriceBani)}
          {...form.register('deliveryPriceBani')}
        />
      </Field>

      <CheckboxField
        id="product-pickup"
        label={t.productForm.pickupAvailable}
        hint={t.product.pickup}
        {...form.register('pickupAvailable')}
      />

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-medium text-foreground">
          {t.productForm.deliveryRegions}
        </legend>
        <p className="mb-3 text-caption text-muted-foreground">
          {t.productForm.deliveryRegionsHint}
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              form.setValue(
                'deliveryRegions',
                districts.map((district) => district.id),
                { shouldDirty: true },
              )
            }
          >
            {t.productForm.deliveryRegionsAll}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => form.setValue('deliveryRegions', [], { shouldDirty: true })}
          >
            {t.productForm.deliveryRegionsNone}
          </Button>
          <span className="tnum text-caption text-muted-foreground" aria-live="polite">
            {fmt(t.productForm.deliveryRegionsSelected, { count: selected.size })}
          </span>
        </div>

        <ul className="grid gap-x-4 sm:grid-cols-2">
          {districts.map((district) => {
            const id = `district-${district.id}`
            return (
              <li key={district.id}>
                <label
                  htmlFor={id}
                  className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm"
                >
                  <Checkbox
                    id={id}
                    checked={selected.has(district.id)}
                    onChange={() => toggleRegion(district.id)}
                  />
                  <span className="min-w-0 break-words">{district.name}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>
    </div>
  )
}
