'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Percent, Tag, X } from 'lucide-react'
import { MIN_DISCOUNT_PERCENT } from '@/lib/constants'
import { formatMoney, parseAmountToBani, salePercent } from '@/lib/money'
import { formatDateShort } from '@/lib/i18n/format'
import { useI18n } from '@/lib/i18n/provider'
import { resolveErrorMessage } from '@/app/[locale]/login/login-form'
import { clearProductSale, saveProductSale } from '@/server/actions/sales'
import { Alert, Button, Card, Dialog, Field, Input, Select, useToast } from '@/components/ui'

/**
 * The seller's discount editor.
 *
 * One form for starting, changing and ending a sale, because they are the same
 * decision seen from three angles — a separate "edit" screen would make changing a
 * price feel heavier than setting one.
 *
 * The saving is previewed live from the same `salePercent` the catalogue uses, so what
 * the seller reads here is exactly the badge a buyer will see. The client checks the
 * rules before it submits purely so the answer is instant; the server re-checks every
 * one of them against prices it reads itself, and only the product id and the numbers
 * ever leave this component.
 */

export interface SaleProductOption {
  id: string
  title: string
  /** What the price is when nothing is discounted — already resolved on the server. */
  regularPriceBani: number
  currentPriceBani: number
  /** ISO date (YYYY-MM-DD) or null; the time of day is not part of this decision. */
  endsAtDate: string | null
  onSale: boolean
}

/**
 * Tagged rather than shaped: TypeScript widens two differently-shaped object literals
 * into one type with optional members, and `'error' in preview` then narrows nothing.
 */
type Preview =
  { kind: 'error'; message: string } | { kind: 'ok'; percent: number; savingBani: number } | null

export function SaleEditor({ products }: { products: readonly SaleProductOption[] }) {
  const { t, fmt, locale } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [productId, setProductId] = useState<string>(products[0]?.id ?? '')
  const [price, setPrice] = useState<string>('')
  const [endsAt, setEndsAt] = useState<string>('')
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const selected = useMemo(
    () => products.find((product) => product.id === productId),
    [products, productId],
  )

  // The preview and the validation read the same answer, so the hint under the field
  // can never disagree with what pressing the button does.
  const preview = useMemo((): Preview => {
    if (!selected) return null
    const salePriceBani = parseAmountToBani(price)
    if (salePriceBani === null) return null

    if (salePriceBani >= selected.regularPriceBani) {
      return { kind: 'error', message: t.sales.errorNotLower }
    }

    const percent = salePercent({
      priceBani: salePriceBani,
      oldPriceBani: selected.regularPriceBani,
      discountEndsAt: null,
    })

    if (percent < MIN_DISCOUNT_PERCENT) {
      return {
        kind: 'error',
        message: fmt(t.sales.errorTooSmall, { percent: MIN_DISCOUNT_PERCENT }),
      }
    }

    return { kind: 'ok', percent, savingBani: selected.regularPriceBani - salePriceBani }
  }, [selected, price, t, fmt])

  const previewError = preview?.kind === 'error' ? preview.message : null
  const previewSaving = preview?.kind === 'ok' ? preview : null

  function selectProduct(id: string): void {
    setProductId(id)
    setFormError(null)

    // Editing a live sale starts from what is running now, not from an empty field —
    // retyping a price you already set is how a zero gets dropped.
    const product = products.find((candidate) => candidate.id === id)
    if (product?.onSale) {
      setPrice((product.currentPriceBani / 100).toFixed(2))
      setEndsAt(product.endsAtDate ?? '')
    } else {
      setPrice('')
      setEndsAt('')
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setFormError(null)

    if (!selected) {
      setFormError(t.sales.errorNoProduct)
      return
    }
    if (previewError !== null) {
      setFormError(previewError)
      return
    }
    if (previewSaving === null) {
      setFormError(t.validation.price)
      return
    }

    startTransition(async () => {
      const result = await saveProductSale({
        productId: selected.id,
        salePriceBani: price,
        endsAt: endsAt === '' ? null : endsAt,
      })

      if (!result.ok) {
        const message = resolveErrorMessage(t, result, fmt)
        setFormError(message)
        toast({ title: message, variant: 'error' })
        return
      }

      toast({
        title: selected.onSale ? t.sales.updated : t.sales.started,
        variant: 'success',
      })
      router.refresh()
    })
  }

  function clear(): void {
    if (!selected) return
    setConfirmClear(false)

    startTransition(async () => {
      const result = await clearProductSale(selected.id)
      if (!result.ok) {
        const message = resolveErrorMessage(t, result, fmt)
        setFormError(message)
        toast({ title: message, variant: 'error' })
        return
      }

      setPrice('')
      setEndsAt('')
      toast({ title: t.sales.cleared, variant: 'success' })
      router.refresh()
    })
  }

  if (products.length === 0) return null

  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center gap-2.5">
        <span className="icon-chip h-9 w-9 bg-accent-soft text-accent">
          <Tag className="h-4 w-4" aria-hidden />
        </span>
        <h2 className="text-h3">{t.sales.editTitle}</h2>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}

        <Field label={t.sales.selectProduct} htmlFor="sale-product" required>
          <Select
            id="sale-product"
            value={productId}
            onChange={(event) => selectProduct(event.target.value)}
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.title} — {formatMoney(product.regularPriceBani, locale)}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.sales.regularPrice} htmlFor="sale-regular">
            <Input
              id="sale-regular"
              value={selected ? formatMoney(selected.regularPriceBani, locale) : ''}
              readOnly
              disabled
              className="tnum"
            />
          </Field>

          <Field
            label={t.sales.salePrice}
            htmlFor="sale-price"
            hint={fmt(t.sales.salePriceHint, { percent: MIN_DISCOUNT_PERCENT })}
            error={previewError ?? undefined}
            required
          >
            <Input
              id="sale-price"
              inputMode="decimal"
              autoComplete="off"
              placeholder="95.50"
              value={price}
              invalid={previewError !== null}
              onChange={(event) => setPrice(event.target.value)}
              className="tnum"
            />
          </Field>
        </div>

        <Field label={t.sales.endsAtField} htmlFor="sale-ends" hint={t.sales.endsAtHint}>
          <Input
            id="sale-ends"
            type="date"
            min={todayIso}
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </Field>

        {previewSaving ? (
          <div className="surface-muted flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm">
            <Percent className="h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span className="text-muted-foreground">{t.sales.currentSaving}</span>
            <strong className="tnum font-semibold text-accent">
              {fmt(t.sales.savingValue, {
                amount: formatMoney(previewSaving.savingBani, locale),
                percent: previewSaving.percent,
              })}
            </strong>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={pending} className="min-h-[44px]">
            {selected?.onSale ? t.sales.update : t.sales.start}
          </Button>

          {selected?.onSale ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-[44px]"
              disabled={pending}
              onClick={() => setConfirmClear(true)}
            >
              <X className="h-4 w-4" aria-hidden />
              {t.sales.clear}
            </Button>
          ) : null}
        </div>

        {/* Money never enters this decision, and saying so is cheaper than letting a
            seller wonder what a discount will cost them. */}
        <p className="text-caption text-muted-foreground">{t.sales.freeNote}</p>
      </form>

      <Dialog
        open={confirmClear && selected !== undefined}
        onClose={() => setConfirmClear(false)}
        title={t.sales.clearConfirmTitle}
        description={
          selected
            ? fmt(t.sales.clearConfirmText, {
                price: formatMoney(selected.regularPriceBani, locale),
              })
            : undefined
        }
        closeLabel={t.a11y.closeDialog}
        size="sm"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" loading={pending} onClick={clear}>
              {t.sales.clear}
            </Button>
          </div>
        }
      >
        {selected?.endsAtDate ? (
          <p className="text-sm text-muted-foreground">
            {fmt(t.sales.statusEndsOn, { date: formatDateShort(selected.endsAtDate, locale) })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t.sales.noEndDate}</p>
        )}
      </Dialog>
    </Card>
  )
}
