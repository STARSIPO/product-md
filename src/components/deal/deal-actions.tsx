'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Printer } from 'lucide-react'
import { Alert, Button, Dialog, Field, Textarea, useToast } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { DEAL_TRANSITIONS, type DealStatus } from '@/lib/constants'
import { resolveErrorMessage } from '@/app/[locale]/login/login-form'
import { transitionDealAction } from '@/server/actions/deals'

/**
 * Status controls for one deal.
 *
 * The buttons are derived from DEAL_TRANSITIONS plus the same role rules the server
 * enforces (only the seller prepares and ships, only the buyer completes), so a user is
 * never shown a move that will be refused. The server re-checks all of it: this list is
 * an affordance, not a permission.
 */

/**
 * "Print / Save as PDF" for the agreement sheet.
 *
 * Lives here rather than in the document page because that page is a server component
 * and window.print() needs a browser. It is `.print-hidden`, so it never appears on the
 * printed sheet it triggers.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer className="mr-2 h-4 w-4" aria-hidden />
      {label}
    </Button>
  )
}

const SELLER_ONLY: readonly DealStatus[] = ['PREPARING', 'SHIPPED']
const BUYER_ONLY: readonly DealStatus[] = ['COMPLETED']

/** Transitions that must carry an explanation the other side will read. */
const NEEDS_REASON: readonly DealStatus[] = ['CANCELLED', 'DISPUTED']

export function DealActions({
  dealId,
  status,
  side,
  buyerConfirmed,
  sellerConfirmed,
}: {
  dealId: string
  status: string
  side: 'buyer' | 'seller'
  buyerConfirmed: boolean
  sellerConfirmed: boolean
}) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const [reasonFor, setReasonFor] = useState<DealStatus | null>(null)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const from = status as DealStatus
  const allowed = DEAL_TRANSITIONS[from] ?? []
  const alreadyConfirmed = side === 'buyer' ? buyerConfirmed : sellerConfirmed

  function labelFor(target: DealStatus): string {
    switch (target) {
      case 'CONFIRMED':
        return side === 'buyer' ? t.deal.confirmBuyer : t.deal.confirmSeller
      case 'PREPARING':
        return t.deal.markPreparing
      case 'SHIPPED':
        return t.deal.markShipped
      case 'DELIVERED':
        return t.deal.markDelivered
      case 'COMPLETED':
        return t.deal.markCompleted
      case 'CANCELLED':
        return t.deal.cancel
      case 'DISPUTED':
        return t.deal.dispute
      default:
        return t.dealStatus[target] ?? target
    }
  }

  function submit(target: DealStatus, comment?: string) {
    setError(null)
    startTransition(async () => {
      const result = await transitionDealAction({ dealId, status: target, comment })

      if (!result.ok) {
        setError(resolveErrorMessage(t, result, fmt))
        return
      }

      setReasonFor(null)
      setReason('')
      toast({ title: t.deal.statusUpdated, variant: 'success' })
      router.refresh()
    })
  }

  const targets = allowed.filter((target) => {
    if (SELLER_ONLY.includes(target) && side !== 'seller') return false
    if (BUYER_ONLY.includes(target) && side !== 'buyer') return false
    // This side has already given its consent; the deal is waiting on the other one.
    if (target === 'CONFIRMED' && alreadyConfirmed && from === 'AWAITING_CONFIRMATION') {
      return false
    }
    return true
  })

  if (targets.length === 0 && !alreadyConfirmed) return null

  return (
    <div className="space-y-3">
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {from === 'AWAITING_CONFIRMATION' && alreadyConfirmed ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {t.deal.awaitingOther}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {targets.map((target) => {
          const destructive = target === 'CANCELLED' || target === 'DISPUTED'
          return (
            <Button
              key={target}
              variant={destructive ? 'outline' : 'primary'}
              loading={pending && reasonFor === null}
              onClick={() =>
                NEEDS_REASON.includes(target) ? setReasonFor(target) : submit(target)
              }
              className={destructive ? 'text-destructive' : undefined}
            >
              {labelFor(target)}
            </Button>
          )
        })}
      </div>

      <Dialog
        open={reasonFor !== null}
        onClose={() => setReasonFor(null)}
        title={reasonFor ? labelFor(reasonFor) : ''}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReasonFor(null)} disabled={pending}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              disabled={reason.trim().length === 0}
              onClick={() => reasonFor && submit(reasonFor, reason.trim())}
            >
              {t.common.confirm}
            </Button>
          </>
        }
      >
        <Field
          label={reasonFor === 'DISPUTED' ? t.deal.disputeReason : t.deal.cancelReason}
          htmlFor="deal-reason"
          required
        >
          <Textarea
            id="deal-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            maxLength={1000}
          />
        </Field>
      </Dialog>
    </div>
  )
}
