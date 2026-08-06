'use client'

import { Plus, Trash2 } from 'lucide-react'

import { Button, Field, Input } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { parseAmountToBani, tierDiscountPercent } from '@/lib/money'
import { translate } from '@/app/[locale]/login/login-form'
import type { TierDraft } from './product-wizard'

/**
 * The wholesale price ladder — «от 100 кг по 92,00 MDL».
 *
 * Each row shows the discount it represents against the base price the moment both
 * numbers are typed, because that percentage is the thing the seller is actually
 * deciding; without it they do the arithmetic in their head while filling in a form.
 *
 * Overlapping and inverted ranges are caught by `priceTiersSchema` on every step
 * change, and the keys it returns are attached back to the exact row and column that
 * produced them.
 */

const MAX_TIERS = 10

export function PriceTierEditor({
  tiers,
  onChange,
  basePrice,
  unitLabel,
  errors,
}: {
  tiers: TierDraft[]
  onChange: (tiers: TierDraft[]) => void
  /** The listing's base price, as typed. Used only to render the discount badge. */
  basePrice: string
  unitLabel: string
  /** Keyed `${index}.${field}`; values are dictionary keys — see the wizard's mapper. */
  errors: Record<string, string>
}) {
  const { t, fmt } = useI18n()

  const baseBani = parseAmountToBani(basePrice.trim())

  function update(index: number, patch: Partial<TierDraft>): void {
    onChange(tiers.map((tier, position) => (position === index ? { ...tier, ...patch } : tier)))
  }

  function remove(index: number): void {
    onChange(tiers.filter((_, position) => position !== index))
  }

  function add(): void {
    if (tiers.length >= MAX_TIERS) return
    onChange([...tiers, { minQty: '', maxQty: '', priceBani: '' }])
  }

  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-medium text-foreground">
        {t.productForm.priceTiers}
      </legend>
      <p className="mb-3 text-caption text-muted-foreground">{t.productForm.priceTiersHint}</p>

      {tiers.length === 0 ? (
        <p className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          {t.productForm.noTiers}
        </p>
      ) : (
        <ul className="space-y-4">
          {tiers.map((tier, index) => {
            const tierBani = parseAmountToBani(tier.priceBani.trim())
            const discount =
              baseBani !== null && tierBani !== null ? tierDiscountPercent(baseBani, tierBani) : 0

            return (
              <li key={index} className="rounded-md border border-border p-3">
                <div className="mb-3 flex items-center justify-end gap-2">
                  {discount > 0 ? (
                    <span className="rounded-full bg-success-soft px-2.5 py-1 text-caption font-semibold text-success">
                      <span className="sr-only">{`${t.productForm.tierDiscountLabel}: `}</span>
                      {fmt(t.product.tierDiscount, { percent: discount })}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label={t.productForm.removeTier}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field
                    label={`${t.productForm.tierMin}, ${unitLabel}`}
                    htmlFor={`tier-${index}-min`}
                    error={translate(t, errors[`${index}.minQty`])}
                  >
                    <Input
                      id={`tier-${index}-min`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="100"
                      value={tier.minQty}
                      invalid={Boolean(errors[`${index}.minQty`])}
                      onChange={(event) => update(index, { minQty: event.target.value })}
                    />
                  </Field>

                  <Field
                    label={`${t.productForm.tierMax}, ${unitLabel}`}
                    htmlFor={`tier-${index}-max`}
                    hint={t.productForm.tierMaxHint}
                    error={translate(t, errors[`${index}.maxQty`])}
                  >
                    <Input
                      id={`tier-${index}-max`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="499"
                      value={tier.maxQty}
                      invalid={Boolean(errors[`${index}.maxQty`])}
                      onChange={(event) => update(index, { maxQty: event.target.value })}
                    />
                  </Field>

                  <Field
                    label={t.productForm.tierPrice}
                    htmlFor={`tier-${index}-price`}
                    error={translate(t, errors[`${index}.priceBani`])}
                  >
                    <Input
                      id={`tier-${index}-price`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={t.productForm.pricePlaceholder}
                      value={tier.priceBani}
                      invalid={Boolean(errors[`${index}.priceBani`])}
                      onChange={(event) => update(index, { priceBani: event.target.value })}
                    />
                  </Field>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        className="mt-3"
        onClick={add}
        disabled={tiers.length >= MAX_TIERS}
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        {t.productForm.addTier}
      </Button>
    </fieldset>
  )
}
