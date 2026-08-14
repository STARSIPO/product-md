'use client'

import { useState, useTransition } from 'react'
import { Banknote, CreditCard } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { useI18n } from '@/lib/i18n/provider'
import { retailOrderSchema } from '@/lib/validation'
import { Alert, Button, Field, Input, RadioGroup, Select, Textarea } from '@/components/ui'
import { resolveErrorMessage, translate } from '@/app/[locale]/login/login-form'
import { placeRetailOrderAction, type PlacedRetailOrder } from '@/server/actions/retail'

/**
 * Who the order goes to and where.
 *
 * Deliberately short, and deliberately open to a signed-out visitor: this is the one
 * form in the product filled in by a person rather than by a company, and every field
 * that is not needed to hand a bag to someone at a door has been left out. No account,
 * no IDNO, no payment details — the shopper pays the shop on delivery.
 *
 * The schema is the server's own `retailOrderSchema` with the two fields the client does
 * not get to choose removed. The basket's contents and the seller are appended here and
 * re-validated, then re-priced, on the server.
 */

const checkoutSchema = retailOrderSchema.omit({ sellerCompanyId: true, lines: true })
type CheckoutValues = z.input<typeof checkoutSchema>

const FORM_FIELDS = [
  'customerName',
  'customerPhone',
  'customerEmail',
  'deliveryAddress',
  'deliveryLocalityId',
  'deliveryNote',
  'paymentMethod',
] as const satisfies readonly (keyof CheckoutValues)[]

function isFormField(name: string): name is (typeof FORM_FIELDS)[number] {
  return (FORM_FIELDS as readonly string[]).includes(name)
}

export interface LocalityOption {
  id: string
  name: string
}

export function CheckoutForm({
  sellerCompanyId,
  lines,
  localities,
  defaults,
  disabled = false,
  onPlaced,
}: {
  sellerCompanyId: string
  lines: readonly { productId: string; quantity: number }[]
  localities: readonly LocalityOption[]
  defaults: { name: string; phone: string; email: string }
  disabled?: boolean
  onPlaced: (order: PlacedRetailOrder) => void
}) {
  const { t, fmt } = useI18n()
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema, undefined, { raw: true }),
    defaultValues: {
      customerName: defaults.name,
      customerPhone: defaults.phone,
      customerEmail: defaults.email,
      deliveryAddress: '',
      deliveryLocalityId: '',
      deliveryNote: '',
      paymentMethod: 'CASH',
    },
  })

  const paymentMethod = watch('paymentMethod') ?? 'CASH'

  function onSubmit(values: CheckoutValues) {
    setFormError(null)

    if (lines.length === 0) {
      setFormError(t.retail.errorCartEmpty)
      return
    }

    startTransition(async () => {
      const result = await placeRetailOrderAction({
        ...values,
        sellerCompanyId,
        lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      })

      if (!result.ok) {
        if (result.fields) {
          for (const [field, key] of Object.entries(result.fields)) {
            // `lines.3.quantity` names a basket row, not an input on this form; attaching
            // it to a field RHF does not know would swallow the message entirely.
            if (isFormField(field)) setError(field, { message: key })
          }
        }
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }

      onPlaced(result.data)
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError ? <Alert variant="destructive">{formError}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t.retail.customerName}
          htmlFor="retail-name"
          required
          error={errors.customerName ? translate(t, errors.customerName.message) : undefined}
        >
          <Input
            id="retail-name"
            autoComplete="name"
            placeholder={t.retail.customerNamePlaceholder}
            invalid={Boolean(errors.customerName)}
            {...register('customerName')}
          />
        </Field>

        <Field
          label={t.retail.customerPhone}
          htmlFor="retail-phone"
          required
          hint={t.retail.customerPhoneHint}
          error={errors.customerPhone ? translate(t, errors.customerPhone.message) : undefined}
        >
          <Input
            id="retail-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t.retail.customerPhonePlaceholder}
            invalid={Boolean(errors.customerPhone)}
            {...register('customerPhone')}
          />
        </Field>

        <Field
          label={t.retail.customerEmail}
          htmlFor="retail-email"
          hint={t.retail.customerEmailHint}
          error={errors.customerEmail ? translate(t, errors.customerEmail.message) : undefined}
        >
          <Input
            id="retail-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            invalid={Boolean(errors.customerEmail)}
            {...register('customerEmail')}
          />
        </Field>

        <Field label={t.retail.deliveryLocality} htmlFor="retail-locality">
          <Select id="retail-locality" {...register('deliveryLocalityId')}>
            <option value="">{t.validation.selectOption}</option>
            {localities.map((locality) => (
              <option key={locality.id} value={locality.id}>
                {locality.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label={t.retail.deliveryAddress}
        htmlFor="retail-address"
        required
        error={errors.deliveryAddress ? translate(t, errors.deliveryAddress.message) : undefined}
      >
        <Input
          id="retail-address"
          autoComplete="street-address"
          placeholder={t.retail.deliveryAddressPlaceholder}
          invalid={Boolean(errors.deliveryAddress)}
          {...register('deliveryAddress')}
        />
      </Field>

      <Field
        label={t.retail.deliveryNote}
        htmlFor="retail-note"
        error={errors.deliveryNote ? translate(t, errors.deliveryNote.message) : undefined}
      >
        <Textarea
          id="retail-note"
          rows={3}
          placeholder={t.retail.deliveryNotePlaceholder}
          invalid={Boolean(errors.deliveryNote)}
          {...register('deliveryNote')}
        />
      </Field>

      {/*
        Two methods, both settled with the shop itself. Deferred payment and bank
        transfer belong to the wholesale half and are not offered to a household.
      */}
      <fieldset className="min-w-0 border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-medium text-foreground">
          {t.retail.paymentMethod}
        </legend>
        <p className="mb-3 text-caption text-muted-foreground">{t.retail.paymentHint}</p>
        <input type="hidden" {...register('paymentMethod')} />
        <RadioGroup
          name="retail-payment"
          columns={2}
          value={paymentMethod}
          onChange={(value) =>
            setValue('paymentMethod', value as CheckoutValues['paymentMethod'], {
              shouldDirty: true,
            })
          }
          options={[
            {
              value: 'CASH',
              label: t.paymentMethods.CASH,
              icon: <Banknote aria-hidden />,
            },
            {
              value: 'CARD',
              label: t.paymentMethods.CARD,
              icon: <CreditCard aria-hidden />,
            },
          ]}
        />
      </fieldset>

      <Button type="submit" size="lg" fullWidth loading={pending} disabled={disabled}>
        {pending ? t.retail.placing : t.retail.placeOrder}
      </Button>
    </form>
  )
}
