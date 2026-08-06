import { describe, expect, it } from 'vitest'
import {
  baniToMdl,
  formatMoney,
  lineTotalBani,
  mdlToBani,
  parseAmountToBani,
  resolveTierPriceBani,
  tierDiscountPercent,
} from '@/lib/money'

describe('money', () => {
  it('converts between MDL and bani without float drift', () => {
    expect(mdlToBani(95.5)).toBe(9550)
    expect(mdlToBani(0.1) + mdlToBani(0.2)).toBe(mdlToBani(0.3))
    expect(baniToMdl(9550)).toBe(95.5)
  })

  it('parses both decimal separators', () => {
    // Romanian keyboards produce a comma; the same field must accept either.
    expect(parseAmountToBani('95.50')).toBe(9550)
    expect(parseAmountToBani('95,50')).toBe(9550)
    expect(parseAmountToBani('95')).toBe(9500)
    expect(parseAmountToBani('95,5')).toBe(9550)
    expect(parseAmountToBani(' 1 200,05 ')).toBe(120005)
  })

  it('rejects malformed amounts instead of guessing', () => {
    expect(parseAmountToBani('')).toBeNull()
    expect(parseAmountToBani('abc')).toBeNull()
    expect(parseAmountToBani('95.505')).toBeNull()
    expect(parseAmountToBani('-95')).toBeNull()
    expect(parseAmountToBani('9,5,5')).toBeNull()
  })

  it('rounds a line total to whole bani', () => {
    expect(lineTotalBani(20, 9500)).toBe(190_000)
    expect(lineTotalBani(2.5, 9500)).toBe(23_750)
    // 0.333 kg at 1000 bani/kg = 333 bani after rounding, never 332.99999
    expect(lineTotalBani(0.333, 1000)).toBe(333)
    expect(lineTotalBani(-5, 1000)).toBe(0)
  })

  describe('wholesale price ladder', () => {
    const tiers = [
      { minQty: 1, maxQty: 19, priceBani: 11_000 },
      { minQty: 20, maxQty: 49, priceBani: 10_000 },
      { minQty: 50, maxQty: null, priceBani: 9_500 },
    ]

    it('resolves the tier matching the quantity', () => {
      expect(resolveTierPriceBani(1, 12_000, tiers)).toBe(11_000)
      expect(resolveTierPriceBani(19, 12_000, tiers)).toBe(11_000)
      expect(resolveTierPriceBani(20, 12_000, tiers)).toBe(10_000)
      expect(resolveTierPriceBani(49, 12_000, tiers)).toBe(10_000)
      expect(resolveTierPriceBani(50, 12_000, tiers)).toBe(9_500)
      expect(resolveTierPriceBani(5_000, 12_000, tiers)).toBe(9_500)
    })

    it('falls back to the base price when nothing matches', () => {
      expect(resolveTierPriceBani(0.5, 12_000, tiers)).toBe(12_000)
      expect(resolveTierPriceBani(20, 12_000, [])).toBe(12_000)
    })

    it('computes the discount badge', () => {
      expect(tierDiscountPercent(11_000, 9_500)).toBe(14)
      expect(tierDiscountPercent(11_000, 11_000)).toBe(0)
      expect(tierDiscountPercent(0, 9_500)).toBe(0)
    })
  })

  it('formats with a currency and locale-correct separators', () => {
    expect(formatMoney(9550, 'ru')).toContain('95,5')
    expect(formatMoney(9550, 'ru')).toContain('MDL')
    expect(formatMoney(9500, 'ru')).toContain('95')
    expect(formatMoney(9550, 'ru', { withCurrency: false })).not.toContain('MDL')
  })
})
