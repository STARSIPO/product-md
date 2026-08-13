'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Lock, Pencil, Send, Undo2 } from 'lucide-react'
import type { z } from 'zod'
import {
  Alert,
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { chisinauDayKey } from '@/lib/utils'
import { formatMoney, lineTotalBani, parseAmountToBani } from '@/lib/money'
import { formatCountdown } from '@/lib/i18n/format'
import { offerSchema } from '@/lib/validation'
import { PAYMENT_METHODS, SUPPLY_REGULARITY, UNITS } from '@/lib/constants'
import { resolveErrorMessage, translate } from '@/app/[locale]/login/login-form'
import {
  createOfferAction,
  updateOfferAction,
  withdrawOfferAction,
} from '@/server/actions/offers'

/**
 * The supplier's sealed commercial offer.
 *
 * The sealed notice sits above the fields, not below the button: a supplier only quotes
 * their true best price if they are certain no competitor can read it, and that promise
 * has to be visible while they are typing the number.
 *
 * Values are submitted raw — the resolver runs in `raw` mode on purpose. Money strings
 * ("95,50") must reach the server untouched so `moneySchema` converts them to bani
 * exactly once; sending the already-parsed number would multiply it by a hundred.
 */

type OfferValues = z.input<typeof offerSchema>

export interface ExistingOffer {
  id: string
  priceBani: number
  quantity: number
  unit: string
  deliveryPriceBani: number
  deliveryAt: Date | null
  deliveryDays: number | null
  paymentMethod: string | null
  validUntil: Date | null
  regularity: string | null
  comment: string | null
  attachmentKey: string | null
  attachmentName: string | null
  alternativeProductId: string | null
  status: string
}

export interface SellerProductOption {
  id: string
  title: string
}

function toDateInput(value: Date | null): string {
  return value ? chisinauDayKey(value) : ''
}

/** Bani back to the "95.50" the money input expects. */
function toAmountInput(bani: number | null | undefined): string {
  if (bani === null || bani === undefined) return ''
  return (bani / 100).toFixed(2)
}

export function OfferForm({
  requestId,
  defaultUnit,
  defaultQuantity,
  offer,
  products,
  onDone,
}: {
  requestId: string
  defaultUnit: string
  defaultQuantity: number
  offer: ExistingOffer | null
  products: readonly SellerProductOption[]
  onDone?: () => void
}) {
  const { t, fmt, locale } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<OfferValues>({
    resolver: zodResolver(offerSchema, undefined, { raw: true }),
    defaultValues: {
      requestId,
      priceBani: toAmountInput(offer?.priceBani),
      quantity: offer?.quantity ?? defaultQuantity,
      unit: (offer?.unit ?? defaultUnit) as OfferValues['unit'],
      deliveryPriceBani: toAmountInput(offer?.deliveryPriceBani ?? null),
      deliveryAt: toDateInput(offer?.deliveryAt ?? null),
      deliveryDays: offer?.deliveryDays ?? undefined,
      paymentMethod: (offer?.paymentMethod ?? undefined) as OfferValues['paymentMethod'],
      validUntil: toDateInput(offer?.validUntil ?? null),
      regularity: (offer?.regularity ?? undefined) as OfferValues['regularity'],
      comment: offer?.comment ?? '',
      alternativeProductId: offer?.alternativeProductId ?? '',
    },
  })

  const watchedPrice = watch('priceBani')
  const watchedQuantity = watch('quantity')
  const watchedDelivery = watch('deliveryPriceBani')
  const watchedUnit = watch('unit')

  const totals = useMemo(() => {
    const unitPriceBani = parseAmountToBani(String(watchedPrice ?? '').trim()) ?? 0
    const deliveryBani = parseAmountToBani(String(watchedDelivery ?? '').trim()) ?? 0
    const quantity = Number(watchedQuantity)
    const goodsBani = lineTotalBani(Number.isFinite(quantity) ? quantity : 0, unitPriceBani)
    return { unitPriceBani, deliveryBani, totalBani: goodsBani + deliveryBani }
  }, [watchedPrice, watchedQuantity, watchedDelivery])

  const unitLabel = t.units[watchedUnit as keyof typeof t.units] ?? watchedUnit

  function onSubmit(values: OfferValues) {
    setFormError(null)

    startTransition(async () => {
      const result = offer
        ? await updateOfferAction(offer.id, values)
        : await createOfferAction(values)

      if (!result.ok) {
        if (result.fields) {
          for (const [field, key] of Object.entries(result.fields)) {
            setError(field as keyof OfferValues, { message: key })
          }
        }
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }

      toast({
        title: offer ? t.offer.updated : t.request.offerSent,
        variant: 'success',
      })
      onDone?.()
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Alert variant="info" icon={<Lock aria-hidden="true" className="h-[18px] w-[18px]" />}>
        {t.offer.sealedNotice}
      </Alert>

      {formError ? <Alert variant="destructive">{formError}</Alert> : null}

      <input type="hidden" {...register('requestId')} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t.offer.price}
          htmlFor="offer-price"
          required
          error={errors.priceBani ? translate(t, errors.priceBani.message) : undefined}
        >
          <Input
            id="offer-price"
            inputMode="decimal"
            autoComplete="off"
            placeholder="95.50"
            invalid={Boolean(errors.priceBani)}
            {...register('priceBani')}
          />
        </Field>

        <Field
          label={t.offer.quantity}
          htmlFor="offer-quantity"
          required
          error={errors.quantity ? translate(t, errors.quantity.message) : undefined}
        >
          <div className="flex gap-2">
            <Input
              id="offer-quantity"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              className="min-w-0 flex-1"
              invalid={Boolean(errors.quantity)}
              {...register('quantity', { valueAsNumber: true })}
            />
            <Select
              aria-label={t.requestForm.unit}
              wrapperClassName="w-32 shrink-0"
              {...register('unit')}
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {t.units[unit]}
                </option>
              ))}
            </Select>
          </div>
        </Field>

        <Field
          label={t.offer.deliveryPrice}
          htmlFor="offer-delivery-price"
          hint={t.product.deliveryFree}
          error={
            errors.deliveryPriceBani ? translate(t, errors.deliveryPriceBani.message) : undefined
          }
        >
          <Input
            id="offer-delivery-price"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            invalid={Boolean(errors.deliveryPriceBani)}
            {...register('deliveryPriceBani')}
          />
        </Field>

        <Field
          label={t.offer.validUntil}
          htmlFor="offer-valid-until"
          error={errors.validUntil ? translate(t, errors.validUntil.message) : undefined}
        >
          <Input
            id="offer-valid-until"
            type="date"
            invalid={Boolean(errors.validUntil)}
            {...register('validUntil')}
          />
        </Field>

        <Field
          label={t.offer.deliveryDate}
          htmlFor="offer-delivery-at"
          error={errors.deliveryAt ? translate(t, errors.deliveryAt.message) : undefined}
        >
          <Input
            id="offer-delivery-at"
            type="date"
            invalid={Boolean(errors.deliveryAt)}
            {...register('deliveryAt')}
          />
        </Field>

        <Field
          label={t.offer.deliveryDays}
          htmlFor="offer-delivery-days"
          error={errors.deliveryDays ? translate(t, errors.deliveryDays.message) : undefined}
        >
          <Input
            id="offer-delivery-days"
            type="number"
            inputMode="numeric"
            min="0"
            max="365"
            invalid={Boolean(errors.deliveryDays)}
            {...register('deliveryDays', {
              setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
            })}
          />
        </Field>

        <Field label={t.offer.paymentMethod} htmlFor="offer-payment">
          <Select
            id="offer-payment"
            {...register('paymentMethod', {
              setValueAs: (value: string) => (value === '' ? undefined : value),
            })}
          >
            <option value="">{t.validation.selectOption}</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {t.paymentMethods[method]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.offer.regularity} htmlFor="offer-regularity">
          <Select
            id="offer-regularity"
            {...register('regularity', {
              setValueAs: (value: string) => (value === '' ? undefined : value),
            })}
          >
            <option value="">{t.validation.selectOption}</option>
            {SUPPLY_REGULARITY.map((value) => (
              <option key={value} value={value}>
                {t.regularity[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {products.length > 0 ? (
        <Field
          label={t.offer.alternativeProduct}
          htmlFor="offer-alternative"
          hint={t.offer.alternativeProductHint}
        >
          <Select id="offer-alternative" {...register('alternativeProductId')}>
            <option value="">{t.offer.alternativeNone}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field
        label={t.offer.comment}
        htmlFor="offer-comment"
        error={errors.comment ? translate(t, errors.comment.message) : undefined}
      >
        <Textarea
          id="offer-comment"
          placeholder={t.offer.commentPlaceholder}
          invalid={Boolean(errors.comment)}
          {...register('comment')}
        />
      </Field>

      {/*
        The stored attachment is shown but not replaceable here: writing Offer.attachmentKey
        would mean touching the Offer table outside src/server/services/offers.ts, which is
        the one thing the sealed-bid model does not allow. TODO: expose a scoped
        `setOfferAttachment(offerId, sellerCompanyId, …)` in that service, then wire an
        upload control in its place.
      */}
      {offer?.attachmentName ? (
        <p className="text-caption text-muted-foreground">
          {t.offer.attachment}: <span className="font-medium">{offer.attachmentName}</span>
        </p>
      ) : null}

      <div className="surface-muted rounded-md p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">{t.offer.total}</span>
          <output aria-live="polite" className="tnum text-h3 font-semibold text-foreground">
            {formatMoney(totals.totalBani, locale)}
          </output>
        </div>
        <p className="mt-1 text-caption text-muted-foreground">
          {fmt(t.product.pricePerUnit, {
            price: formatMoney(totals.unitPriceBani, locale),
            unit: unitLabel,
          })}
          {totals.deliveryBani > 0 ? ` · ${t.offer.deliveryIncluded}` : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          <Send className="mr-1.5 h-4 w-4" aria-hidden />
          {offer ? t.offer.updateOffer : t.offer.sendOffer}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            {t.common.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

/**
 * The «Предложить условия» call to action on a public request page.
 * Opens the sealed form in a modal so the supplier never loses the request details.
 */
export function OfferLauncher({
  requestId,
  requestTitle,
  defaultUnit,
  defaultQuantity,
  products,
}: {
  requestId: string
  requestTitle: string
  defaultUnit: string
  defaultQuantity: number
  products: readonly SellerProductOption[]
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="lg" fullWidth onClick={() => setOpen(true)}>
        {t.request.makeOffer}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t.offer.title}
        description={requestTitle}
        size="lg"
        closeLabel={t.common.close}
      >
        <OfferForm
          requestId={requestId}
          defaultUnit={defaultUnit}
          defaultQuantity={defaultQuantity}
          offer={null}
          products={products}
          onDone={() => setOpen(false)}
        />
      </Dialog>
    </>
  )
}

/** Edit / withdraw controls rendered under the supplier's own offer card. */
export function MyOfferActions({
  requestId,
  offer,
  products,
}: {
  requestId: string
  offer: ExistingOffer
  products: readonly SellerProductOption[]
}) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const locked = offer.status === 'ACCEPTED' || offer.status === 'WITHDRAWN'
  if (locked) return null

  function withdraw() {
    setError(null)
    startTransition(async () => {
      const result = await withdrawOfferAction(offer.id)
      if (!result.ok) {
        setError(resolveErrorMessage(t, result, fmt))
        return
      }
      setWithdrawing(false)
      toast({ title: t.offer.withdrawnDone, variant: 'success' })
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="mr-1.5 h-4 w-4" aria-hidden />
          {t.request.editOffer}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setWithdrawing(true)}>
          <Undo2 className="mr-1.5 h-4 w-4" aria-hidden />
          {t.offer.withdrawOffer}
        </Button>
      </div>

      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        title={t.offer.updateOffer}
        size="lg"
        closeLabel={t.common.close}
      >
        <OfferForm
          requestId={requestId}
          defaultUnit={offer.unit}
          defaultQuantity={offer.quantity}
          offer={offer}
          products={products}
          onDone={() => setEditing(false)}
        />
      </Dialog>

      <Dialog
        open={withdrawing}
        onClose={() => setWithdrawing(false)}
        title={t.offer.withdrawConfirmTitle}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setWithdrawing(false)} disabled={pending}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" onClick={withdraw} loading={pending}>
              {t.offer.withdrawOffer}
            </Button>
          </>
        }
      >
        <p>{t.offer.withdrawConfirmText}</p>
        <p aria-live="polite" className="mt-2 text-caption text-destructive">
          {error}
        </p>
      </Dialog>
    </>
  )
}

/**
 * Live "time left to bid" counter.
 *
 * Starts from a value rendered on the server so the first paint matches, then ticks on
 * its own — a deadline that silently goes stale is the difference between sending an
 * offer and missing the request.
 */
export function OfferDeadline({
  deadline,
  initial,
  className,
}: {
  deadline: string
  initial: string | null
  className?: string
}) {
  const { t, fmt, locale } = useI18n()
  const [remaining, setRemaining] = useState<string | null>(initial)

  useEffect(() => {
    function tick() {
      setRemaining(formatCountdown(deadline, locale))
    }

    tick()
    const timer = window.setInterval(tick, 30_000)
    return () => window.clearInterval(timer)
  }, [deadline, locale])

  return (
    <span aria-live="polite" className={className}>
      {remaining === null ? t.request.deadlinePassed : fmt(t.request.deadlineIn, { time: remaining })}
    </span>
  )
}
