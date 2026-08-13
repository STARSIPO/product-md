import { formatMoney, formatQuantity, tierDiscountPercent } from '@/lib/money'
import { fmt, type Dictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'
import { Badge, TBody, TD, TH, THead, TR, Table, TableScroll } from '@/components/ui'

/**
 * The wholesale price ladder.
 *
 * Rendered on the server: it is static data a buyer wants to read, compare and cite in
 * a message, so it must exist in the HTML rather than appear after hydration. The
 * discount column repeats the same fact as text ("−13%"), never as colour alone.
 *
 * It carries no box of its own — it sits inside the section surface and reads as a
 * table, so the only rules left are the header underline and the row separators. The
 * outer cells drop their horizontal padding so the ladder lines up with the heading
 * above it instead of floating a step to the right.
 */

export interface PriceTierRow {
  id: string
  minQty: number
  maxQty: number | null
  priceBani: number
}

export function PriceTiersTable({
  tiers,
  basePriceBani,
  unitLabel,
  locale,
  t,
}: {
  tiers: readonly PriceTierRow[]
  basePriceBani: number
  unitLabel: string
  locale: Locale
  t: Dictionary
}) {
  if (tiers.length === 0) return null

  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty)

  return (
    <TableScroll>
      <Table>
        <caption className="sr-only">{t.product.priceTiers}</caption>
        <THead>
          <TR>
            <TH className="pl-0">{t.product.calcQuantity}</TH>
            <TH>{t.product.calcUnitPrice}</TH>
            <TH className="pr-0 text-right">{t.productForm.tierDiscountLabel}</TH>
          </TR>
        </THead>
        <TBody>
          {sorted.map((tier) => {
            const discount = tierDiscountPercent(basePriceBani, tier.priceBani)
            const range =
              tier.maxQty === null
                ? fmt(t.product.tierFrom, {
                    min: formatQuantity(tier.minQty, unitLabel, locale),
                  })
                : fmt(t.product.tierRange, {
                    min: formatQuantity(tier.minQty, unitLabel, locale),
                    max: formatQuantity(tier.maxQty, unitLabel, locale),
                  })

            return (
              <TR key={tier.id}>
                <TD className="tnum whitespace-nowrap pl-0">{range}</TD>
                <TD className="tnum whitespace-nowrap font-medium">
                  {fmt(t.product.pricePerUnit, {
                    price: formatMoney(tier.priceBani, locale),
                    unit: unitLabel,
                  })}
                </TD>
                <TD className="pr-0 text-right">
                  {discount > 0 ? (
                    <Badge variant="success" size="sm">
                      {fmt(t.product.tierDiscount, { percent: discount })}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TD>
              </TR>
            )
          })}
        </TBody>
      </Table>
    </TableScroll>
  )
}
