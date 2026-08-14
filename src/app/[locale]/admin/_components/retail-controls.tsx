'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'

import { Alert, Button, Dialog, Field, Select, Textarea, useToast } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { resolveErrorMessage, translate } from '@/app/[locale]/login/login-form'
import type { CompanyKind, RetailOrderStatus } from '@/lib/constants'
import type { ActionResult } from '@/server/actions/result'
import {
  clearProductSaleAction,
  setCompanyKindAction,
  setRetailOrderStatusAdminAction,
} from '../_lib/retail-actions'

/**
 * The interactive controls for the retail admin screens.
 *
 * They follow `components/admin/decision-dialog.tsx` rather than inventing a second
 * dialect: a decision that only corrects a classification saves the moment it is picked,
 * and a decision somebody downstream will read — a cancelled order, a discount pulled off
 * a stranger's listing — asks for confirmation first. Every label comes from the
 * dictionary, and every error arrives as a key that is resolved here so /ru and /ro both
 * get a sentence rather than an identifier.
 */

/** Matches the panel elsewhere: 44px under `md` for a thumb, 36–42px above it. */
const TOUCH = 'min-h-[44px] md:min-h-[36px]'

export interface SelectOption {
  value: string
  label: string
}

/** Pending state, localized error, toast, refresh — the same four every panel control needs. */
function useAdminAction() {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | undefined>(undefined)

  function run(
    action: () => Promise<ActionResult<unknown>>,
    options: { onSuccess?: () => void; successMessage?: string } = {},
  ) {
    setError(null)
    setFieldError(undefined)

    startTransition(async () => {
      const result = await action()

      if (!result.ok) {
        setError(resolveErrorMessage(t, result, fmt))
        const first = result.fields ? Object.values(result.fields)[0] : undefined
        setFieldError(translate(t, first))
        return
      }

      toast({ title: options.successMessage ?? t.admin.saved, variant: 'success' })
      options.onSuccess?.()
      router.refresh()
    })
  }

  return { run, pending, error, fieldError, t }
}

// --- companies ---------------------------------------------------------------

/**
 * Corrects a company's kind.
 *
 * Saved on change without a confirmation: this is a classification, reversible in one
 * more change, and the audit row carries the before and after. It does not touch the
 * company's own decision to sell to households — see `setCompanyKindAction`.
 */
export function CompanyKindSelect({
  companyId,
  kind,
  options,
}: {
  companyId: string
  kind: string
  options: readonly SelectOption[]
}) {
  const { t } = useI18n()
  const { run, pending, error } = useAdminAction()
  const [value, setValue] = useState(kind)

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <label className="sr-only" htmlFor={`company-kind-${companyId}`}>
        {t.company.kind}
      </label>
      <Select
        id={`company-kind-${companyId}`}
        value={value}
        disabled={pending}
        wrapperClassName="w-auto min-w-[170px]"
        onChange={(event) => {
          const next = event.target.value
          setValue(next)
          run(() => setCompanyKindAction({ companyId, kind: next as CompanyKind }))
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {error ? <span className="text-caption text-destructive">{error}</span> : null}
    </span>
  )
}

// --- discounts ---------------------------------------------------------------

/**
 * Ends a discount on a listing the operator does not own.
 *
 * The confirmation spells out the price the listing goes back to, because that is the
 * consequence: `oldPriceBani` is restored as the live price, and the listing leaves
 * «Акции».
 */
export function ClearSaleButton({
  productId,
  restoredPrice,
}: {
  productId: string
  restoredPrice: string
}) {
  const { t, fmt } = useI18n()
  const { run, pending, error } = useAdminAction()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" className={TOUCH} variant="ghost" onClick={() => setOpen(true)}>
        {t.sales.clear}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t.sales.clearConfirmTitle}
        description={fmt(t.sales.clearConfirmText, { price: restoredPrice })}
        closeLabel={t.a11y.closeDialog}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              onClick={() =>
                run(() => clearProductSaleAction(productId), {
                  successMessage: t.sales.cleared,
                  onSuccess: () => setOpen(false),
                })
              }
            >
              {t.sales.clear}
            </Button>
          </>
        }
      >
        {error ? <Alert variant="destructive">{error}</Alert> : null}
      </Dialog>
    </>
  )
}

// --- retail orders -----------------------------------------------------------

/**
 * Overrides the status of one retail order.
 *
 * The select offers every status rather than only the ones the transition table allows —
 * see `setRetailOrderStatusAdminAction` for why. The reason field becomes mandatory for
 * CANCELLED, which is the one outcome the shopper reads back.
 */
export function RetailOrderActions({
  orderId,
  status,
  statusOptions,
}: {
  orderId: string
  status: string
  statusOptions: readonly SelectOption[]
}) {
  const { t } = useI18n()
  const { run, pending, error, fieldError } = useAdminAction()
  const [open, setOpen] = useState(false)
  const [nextStatus, setNextStatus] = useState(status)
  const [reason, setReason] = useState('')
  const reasonId = useId()

  const reasonRequired = nextStatus === 'CANCELLED'

  return (
    <>
      <Button size="sm" className={TOUCH} variant="outline" onClick={() => setOpen(true)}>
        {t.admin.changeStatus}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t.admin.changeStatus}
        description={t.admin.forceStatusHint}
        closeLabel={t.a11y.closeDialog}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              loading={pending}
              disabled={reasonRequired && reason.trim().length === 0}
              onClick={() =>
                run(
                  () =>
                    setRetailOrderStatusAdminAction({
                      orderId,
                      // A convenience cast for the compiler only: the server parses the
                      // value against the same const tuple before it touches a row.
                      status: nextStatus as RetailOrderStatus,
                      reason,
                    }),
                  {
                    successMessage: t.retail.statusUpdated,
                    onSuccess: () => {
                      setReason('')
                      setOpen(false)
                    },
                  },
                )
              }
            >
              {t.common.confirm}
            </Button>
          </>
        }
      >
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <div className="space-y-3 pt-1">
          <Field label={t.admin.newStatus} htmlFor={`order-status-${orderId}`}>
            <Select
              id={`order-status-${orderId}`}
              value={nextStatus}
              disabled={pending}
              onChange={(event) => setNextStatus(event.target.value)}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.retail.cancelReason}
            htmlFor={reasonId}
            required={reasonRequired}
            error={fieldError}
          >
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t.retail.cancelReasonPlaceholder}
              invalid={fieldError !== undefined}
              rows={3}
              maxLength={500}
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
