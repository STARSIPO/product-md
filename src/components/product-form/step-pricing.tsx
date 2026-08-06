'use client'

import { Field, Input, Select } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { AVAILABILITY, UNITS } from '@/lib/constants'
import { formatMoney, parseAmountToBani } from '@/lib/money'
import { translate } from '@/app/[locale]/login/login-form'
import { PriceTierEditor } from './price-tier-editor'
import type { StepProps } from './product-wizard'

/**
 * Step 3 — «Цена и объём».
 *
 * The price input is a plain text field with `inputMode="decimal"`, not `type="number"`:
 * a Romanian keyboard produces "95,50" and a number input silently discards it. The
 * comma form is accepted, echoed back formatted, and converted to integer bani by
 * `parseAmountToBani` — never by parseFloat.
 */
export function StepPricing({
  form,
  values,
  tierErrors,
}: StepProps & { tierErrors: Record<string, string> }) {
  const { t, locale } = useI18n()
  const { errors } = form.formState

  const unitLabel = t.units[values.unit]
  const priceBani = parseAmountToBani(values.priceBani.trim())

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t.productForm.price}
          htmlFor="product-price"
          hint={
            priceBani === null
              ? t.productForm.priceHint
              : `${formatMoney(priceBani, locale)} / ${unitLabel}`
          }
          required
          error={translate(t, errors.priceBani?.message)}
        >
          <Input
            id="product-price"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            placeholder={t.productForm.pricePlaceholder}
            invalid={Boolean(errors.priceBani)}
            {...form.register('priceBani')}
          />
        </Field>

        <Field
          label={t.productForm.currency}
          htmlFor="product-currency"
          hint={t.productForm.currencyHint}
        >
          {/* One currency today; the field exists so the listing reads unambiguously. */}
          <Select id="product-currency" disabled {...form.register('currency')}>
            <option value="MDL">MDL</option>
          </Select>
        </Field>

        <Field
          label={t.productForm.unit}
          htmlFor="product-unit"
          hint={t.productForm.unitHint}
          required
          error={translate(t, errors.unit?.message)}
        >
          <Select id="product-unit" invalid={Boolean(errors.unit)} {...form.register('unit')}>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t.units[unit]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={t.productForm.availability}
          htmlFor="product-availability"
          error={translate(t, errors.availability?.message)}
        >
          <Select
            id="product-availability"
            invalid={Boolean(errors.availability)}
            {...form.register('availability')}
          >
            {AVAILABILITY.map((code) => (
              <option key={code} value={code}>
                {t.availability[code]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={`${t.productForm.minOrderQty}, ${unitLabel}`}
          htmlFor="product-min-order"
          hint={t.productForm.minOrderQtyHint}
          error={translate(t, errors.minOrderQty?.message)}
        >
          <Input
            id="product-min-order"
            inputMode="decimal"
            autoComplete="off"
            placeholder={t.productForm.minOrderQtyPlaceholder}
            invalid={Boolean(errors.minOrderQty)}
            {...form.register('minOrderQty')}
          />
        </Field>

        <Field
          label={`${t.productForm.availableQty}, ${unitLabel}`}
          htmlFor="product-available-qty"
          hint={t.productForm.availableQtyHint}
          error={translate(t, errors.availableQty?.message)}
        >
          <Input
            id="product-available-qty"
            inputMode="decimal"
            autoComplete="off"
            placeholder={t.productForm.availableQtyPlaceholder}
            invalid={Boolean(errors.availableQty)}
            {...form.register('availableQty')}
          />
        </Field>
      </div>

      <PriceTierEditor
        tiers={values.priceTiers}
        onChange={(tiers) => form.setValue('priceTiers', tiers, { shouldDirty: true })}
        basePrice={values.priceBani}
        unitLabel={unitLabel}
        errors={tierErrors}
      />
    </div>
  )
}
