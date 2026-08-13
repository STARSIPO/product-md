'use client'

import { useId, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import {
  formatMoney,
  formatQuantity,
  lineTotalBani,
  resolveTierPriceBani,
  type PriceTierLike,
} from '@/lib/money'
import { Input } from '@/components/ui'

/**
 * Order estimator.
 *
 * The number a buyer actually decides on is «what will this delivery cost me», not the
 * headline price per kilo — so the calculator resolves the wholesale tier for the typed
 * quantity and shows goods, delivery and total separately. Every amount goes through
 * `formatMoney` on integer bani; the only float in the chain is the quantity itself,
 * and `lineTotalBani` rounds it back to an integer immediately.
 *
 * It never implies a binding price: the disclaimer is part of the component, not an
 * optional prop a caller could forget.
 */

export function PriceCalculator({
  basePriceBani,
  tiers,
  minOrderQty,
  unit,
  deliveryPriceBani,
}: {
  basePriceBani: number
  tiers: readonly PriceTierLike[]
  minOrderQty: number
  unit: string
  deliveryPriceBani: number | null
}) {
  const { t, fmt, locale } = useI18n()
  const fieldId = `${useId()}-qty`
  const [raw, setRaw] = useState(() => String(minOrderQty))

  const unitLabel = t.units[unit as keyof typeof t.units] ?? unit
  const parsed = Number(raw.replace(',', '.'))
  const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 0

  const unitPriceBani = resolveTierPriceBani(quantity, basePriceBani, tiers)
  const goodsBani = lineTotalBani(quantity, unitPriceBani)
  const deliveryBani = deliveryPriceBani ?? 0
  const totalBani = goodsBani + deliveryBani
  const belowMin = quantity > 0 && quantity < minOrderQty

  return (
    <section aria-labelledby="price-calculator-title" className="surface p-5">
      <h2 id="price-calculator-title" className="text-h3">
        {t.product.calculator}
      </h2>

      <div className="mt-4">
        <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium">
          {t.product.calcQuantity}, {unitLabel}
        </label>
        <Input
          id={fieldId}
          name="quantity"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          invalid={belowMin}
          aria-describedby={belowMin ? `${fieldId}-warning` : undefined}
        />
      </div>

      {belowMin ? (
        <p
          id={`${fieldId}-warning`}
          role="status"
          className="mt-2 flex items-start gap-1.5 text-caption text-warning"
        >
          <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {fmt(t.product.calcBelowMin, {
              min: formatQuantity(minOrderQty, unitLabel, locale),
            })}
          </span>
        </p>
      ) : null}

      <dl className="mt-4 space-y-2 text-sm" aria-live="polite">
        <Row label={t.product.calcUnitPrice}>
          {fmt(t.product.pricePerUnit, {
            price: formatMoney(unitPriceBani, locale),
            unit: unitLabel,
          })}
        </Row>
        <Row label={t.product.calcGoods}>{formatMoney(goodsBani, locale)}</Row>
        <Row label={t.product.calcDelivery}>
          {deliveryPriceBani === null
            ? t.product.deliveryNegotiable
            : deliveryPriceBani === 0
              ? t.product.deliveryFree
              : formatMoney(deliveryPriceBani, locale)}
        </Row>

        {/* The sum is an inset block rather than a ruled row: one fewer line, and the
            number a buyer actually acts on stops looking like just another list item. */}
        <div className="surface-muted mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-md px-3.5 py-3">
          <dt className="text-sm font-medium">{t.product.calcTotal}</dt>
          <dd className="tnum text-lg font-semibold">{formatMoney(totalBani, locale)}</dd>
        </div>
      </dl>

      <p className="mt-4 text-caption text-muted-foreground">{t.product.calcHint}</p>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tnum font-medium">{children}</dd>
    </div>
  )
}
