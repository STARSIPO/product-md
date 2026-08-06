import type { Locale } from '@/lib/i18n/config'

/**
 * Money is always an integer number of bani (1 MDL = 100 bani).
 *
 * Floating point never touches a price: `0.1 + 0.2 !== 0.3` is a rounding bug in a
 * marketplace where a supplier quotes 95.50 MDL/kg for 3 tonnes. Quantities may be
 * fractional (2.5 kg), so the one place where a float meets money — quantity ×
 * unit price — rounds explicitly and immediately back to an integer.
 */

export const BANI_PER_MDL = 100

export function mdlToBani(mdl: number): number {
  return Math.round(mdl * BANI_PER_MDL)
}

export function baniToMdl(bani: number): number {
  return bani / BANI_PER_MDL
}

/**
 * Parses user input in either "95.50" or "95,50" form (Romanian keyboards produce
 * a comma) and returns bani. Returns null for anything that is not a clean amount.
 */
export function parseAmountToBani(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.')
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole = '0', fraction = ''] = cleaned.split('.')
  const paddedFraction = fraction.padEnd(2, '0').slice(0, 2)
  return Number(whole) * BANI_PER_MDL + Number(paddedFraction)
}

/**
 * quantity × unitPriceBani, rounded half-up to the nearest bani.
 * Kept in one place so every total in the product is computed identically.
 */
export function lineTotalBani(quantity: number, unitPriceBani: number): number {
  if (!Number.isFinite(quantity) || quantity < 0) return 0
  return Math.round(quantity * unitPriceBani)
}

const NBSP = ' '

/** "95,50 MDL" (ro) / "95,50 MDL" (ru) — always with a non-breaking space. */
export function formatMoney(
  bani: number,
  locale: Locale = 'ru',
  options: { currency?: string; withCurrency?: boolean } = {},
): string {
  const { currency = 'MDL', withCurrency = true } = options
  const intlLocale = locale === 'ro' ? 'ro-MD' : 'ru-MD'

  const formatted = new Intl.NumberFormat(intlLocale, {
    minimumFractionDigits: bani % BANI_PER_MDL === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(baniToMdl(bani))

  return withCurrency ? `${formatted}${NBSP}${currency}` : formatted
}

/** Quantity with its unit — "20 кг", trimming pointless ".00". */
export function formatQuantity(quantity: number, unitLabel: string, locale: Locale = 'ru'): string {
  const intlLocale = locale === 'ro' ? 'ro-MD' : 'ru-MD'
  const formatted = new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: 3,
  }).format(quantity)
  return `${formatted}${NBSP}${unitLabel}`
}

export interface PriceTierLike {
  minQty: number
  maxQty: number | null
  priceBani: number
}

/**
 * Resolves the unit price for a quantity against a wholesale price ladder.
 * Falls back to the listing's base price when no tier matches.
 */
export function resolveTierPriceBani(
  quantity: number,
  basePriceBani: number,
  tiers: readonly PriceTierLike[],
): number {
  if (tiers.length === 0) return basePriceBani

  // Highest matching floor wins, so overlapping ranges degrade predictably.
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty)
  let price = basePriceBani

  for (const tier of sorted) {
    const aboveFloor = quantity >= tier.minQty
    const belowCeiling = tier.maxQty === null || quantity <= tier.maxQty
    if (aboveFloor && belowCeiling) price = tier.priceBani
  }

  return price
}

/** Percentage saved versus the base price, for the "−13%" badge on a tier row. */
export function tierDiscountPercent(basePriceBani: number, tierPriceBani: number): number {
  if (basePriceBani <= 0 || tierPriceBani >= basePriceBani) return 0
  return Math.round(((basePriceBani - tierPriceBani) / basePriceBani) * 100)
}
