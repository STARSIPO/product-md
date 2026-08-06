'use client'

import { useId, useState, useTransition } from 'react'
import { Flag } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { COMPLAINT_REASONS, type ComplaintEntity, type ComplaintReason } from '@/lib/constants'
import { createComplaintAction } from '@/server/actions/complaints'
import {
  Alert,
  Button,
  Dialog,
  Field,
  Select,
  Textarea,
  useToast,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui'

/**
 * "Report" for anything the moderation queue understands — a listing, a company, a
 * message, an offer, a document, a review, a deal or a request.
 *
 * The dialog is deliberately two fields: a reason from a fixed list (so the queue can
 * be triaged and counted) and free text (so the reporter can say the thing the list
 * has no code for). Submitting opens a real moderator task; the toast says so rather
 * than thanking the user for feedback that goes nowhere.
 */

export function ReportButton({
  entityType,
  entityId,
  label,
  variant = 'ghost',
  size = 'sm',
  className,
}: {
  entityType: ComplaintEntity
  entityId: string
  label?: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}) {
  const { t, fmt } = useI18n()
  const { toast } = useToast()
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ComplaintReason>('FRAUD')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)

    startTransition(async () => {
      const result = await createComplaintAction({
        entityType,
        entityId,
        reason,
        description: description.trim() === '' ? undefined : description.trim(),
      })

      if (!result.ok) {
        const errors = t.errors as Record<string, string | undefined>
        setError(fmt(errors[result.error] ?? t.errors.generic, result.params))
        return
      }

      setOpen(false)
      setDescription('')
      toast({ title: t.complaint.submitted, variant: 'success' })
    })
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className={className}
      >
        <Flag className="h-4 w-4" aria-hidden />
        {label ?? t.complaint.title}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t.complaint.title}
        description={t.complaint.subtitle}
        closeLabel={t.a11y.closeDialog}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t.common.cancel}
            </Button>
            <Button onClick={submit} loading={pending}>
              {t.complaint.submit}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert variant="destructive">{error}</Alert> : null}

          <Field label={t.complaint.reason} htmlFor={`${fieldId}-reason`} required>
            <Select
              id={`${fieldId}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value as ComplaintReason)}
            >
              {COMPLAINT_REASONS.map((code) => (
                <option key={code} value={code}>
                  {t.complaint.reasons[code]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t.complaint.description}
            htmlFor={`${fieldId}-description`}
            hint={t.common.optional}
          >
            <Textarea
              id={`${fieldId}-description`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t.complaint.descriptionPlaceholder}
              maxLength={3000}
              rows={4}
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
