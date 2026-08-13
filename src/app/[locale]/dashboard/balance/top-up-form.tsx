'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Alert, Button, Field, Input } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { topUpSchema } from '@/lib/validation'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { resolveErrorMessage, translate } from '@/app/[locale]/login/login-form'
import { startTopUp } from '@/server/actions/balance'

/**
 * Top-up.
 *
 * The presets are the point: a seller does not want to think about arithmetic, they
 * want "enough for a month". Each one is labelled with how long it lasts at the current
 * burn rate, which the server computed — the browser is never asked to price anything.
 *
 * Submitting leaves the application entirely: the action creates a Payment row and
 * hands back the provider's URL. The balance itself only ever moves when the webhook
 * comes back.
 */

type TopUpValues = z.input<typeof topUpSchema>

/** Integer bani into the "30" / "30.50" an amount input should show. */
function baniToInput(bani: number): string {
  return bani % 100 === 0 ? String(bani / 100) : (bani / 100).toFixed(2)
}

export function TopUpForm({
  presets,
  dailyCostBani,
  minAmountBani,
}: {
  presets: readonly number[]
  /** What one day of active listings costs today; null when billing is off. */
  dailyCostBani: number | null
  minAmountBani: number
}) {
  const { t, fmt, locale } = useI18n()
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TopUpValues>({
    resolver: zodResolver(topUpSchema, undefined, { raw: true }),
    defaultValues: { amountBani: baniToInput(presets[0] ?? minAmountBani) },
  })

  const current = String(watch('amountBani') ?? '')

  function onSubmit(values: TopUpValues) {
    setFormError(null)

    startTransition(async () => {
      const result = await startTopUp(values, locale)

      if (!result.ok) {
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }

      // A full navigation, not a router push: the next page belongs to the provider.
      window.location.assign(result.data.redirectUrl)
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div aria-live="polite">
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      </div>

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="mb-2 text-sm font-medium">{t.balance.presetsTitle}</legend>
        <div className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
          {presets.map((preset) => {
            const value = baniToInput(preset)
            const selected = current === value
            const days =
              dailyCostBani !== null && dailyCostBani > 0
                ? Math.floor(preset / dailyCostBani)
                : null

            return (
              <button
                key={preset}
                type="button"
                aria-pressed={selected}
                onClick={() => setValue('amountBani', value, { shouldValidate: true })}
                className={cn(
                  // Unselected presets are inset blocks, not outlined boxes; the one
                  // that is chosen is filled and ringed. An outline that only thickens
                  // is a hard thing to see at a glance, and four identical boxes with
                  // one slightly greener edge is exactly the wireframe look.
                  'flex min-h-[68px] flex-col items-start justify-center rounded-md px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  selected
                    ? 'bg-primary-soft ring-2 ring-primary'
                    : 'bg-muted/60 hover:bg-primary-soft/60',
                )}
              >
                <span className="tnum text-sm font-semibold">{formatMoney(preset, locale)}</span>
                {days !== null ? (
                  <span className="mt-0.5 text-caption text-muted-foreground">
                    {fmt(t.balance.presetDays, { days })}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </fieldset>

      <Field
        label={t.balance.customAmount}
        htmlFor="top-up-amount"
        hint={fmt(t.balance.minAmount, { amount: formatMoney(minAmountBani, locale) })}
        error={errors.amountBani ? translate(t, errors.amountBani.message) : undefined}
      >
        <Input
          id="top-up-amount"
          inputMode="decimal"
          autoComplete="off"
          invalid={Boolean(errors.amountBani)}
          {...register('amountBani')}
        />
      </Field>

      <Button type="submit" loading={pending}>
        {t.balance.payButton}
      </Button>
    </form>
  )
}
