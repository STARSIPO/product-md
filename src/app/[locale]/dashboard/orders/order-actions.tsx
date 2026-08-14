'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Dialog, Field, Textarea, useToast } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { RETAIL_ORDER_TRANSITIONS, type RetailOrderStatus } from '@/lib/constants'
import { resolveErrorMessage } from '@/app/[locale]/login/login-form'
import { updateRetailOrderStatus } from '@/server/actions/retail-orders'

/**
 * The buttons that move one order along.
 *
 * Rendered from RETAIL_ORDER_TRANSITIONS — the same map the server enforces — so a shop
 * is never offered a move that will be refused, and a delivered or cancelled order
 * simply has no controls left. This is an affordance, not a permission: the action
 * re-checks the transition and the ownership of the row on every call.
 *
 * Cancelling is the one move that asks for something back. The shopper is a person
 * waiting for food, and "отменён" with no reason is the message that generates the
 * phone call this screen exists to avoid.
 */

type ActionKey =
  'actionConfirm' | 'actionPreparing' | 'actionDelivering' | 'actionDelivered' | 'actionCancel'

/** The verb for arriving at each status. NEW is nobody's target — it is where an order starts. */
const LABEL_KEYS: Record<RetailOrderStatus, ActionKey | null> = {
  NEW: null,
  CONFIRMED: 'actionConfirm',
  PREPARING: 'actionPreparing',
  DELIVERING: 'actionDelivering',
  DELIVERED: 'actionDelivered',
  CANCELLED: 'actionCancel',
}

export function OrderActions({ orderId, status }: { orderId: string; status: string }) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()

  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const from = status as RetailOrderStatus
  const allowed = RETAIL_ORDER_TRANSITIONS[from] ?? []

  function submit(target: RetailOrderStatus, cancelReason?: string) {
    setError(null)

    startTransition(async () => {
      const result = await updateRetailOrderStatus({
        orderId,
        status: target,
        reason: cancelReason,
      })

      if (!result.ok) {
        setError(resolveErrorMessage(t, result, fmt))
        return
      }

      setCancelling(false)
      setReason('')
      toast({ title: t.retail.statusUpdated, variant: 'success' })
      router.refresh()
    })
  }

  if (allowed.length === 0) return null

  return (
    <div className="space-y-2">
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {allowed.map((target) => {
          const key = LABEL_KEYS[target]
          if (key === null) return null

          const isCancel = target === 'CANCELLED'
          return (
            <Button
              key={target}
              size="sm"
              variant={isCancel ? 'ghost' : 'primary'}
              loading={pending && !cancelling}
              className={isCancel ? 'text-destructive' : undefined}
              onClick={() => (isCancel ? setCancelling(true) : submit(target))}
            >
              {t.retail[key]}
            </Button>
          )
        })}
      </div>

      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={t.retail.cancelTitle}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(false)} disabled={pending}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              disabled={reason.trim().length === 0}
              onClick={() => submit('CANCELLED', reason.trim())}
            >
              {t.retail.actionCancel}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{t.retail.cancelText}</p>

        <Field label={t.retail.cancelReason} htmlFor={`cancel-reason-${orderId}`} required>
          <Textarea
            id={`cancel-reason-${orderId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t.retail.cancelReasonPlaceholder}
            rows={3}
            maxLength={500}
          />
        </Field>
      </Dialog>
    </div>
  )
}
