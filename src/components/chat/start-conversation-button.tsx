'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { startConversationAction } from '@/server/actions/messages'
import {
  Alert,
  Button,
  Dialog,
  Field,
  Textarea,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui'

/**
 * "Write to the supplier" — from a listing, a request or an offer.
 *
 * The first message is composed in a dialog instead of dropping the buyer into an
 * empty thread, because the quality of that first message decides whether a supplier
 * answers at all. Hence the hint about volume, timing and delivery terms.
 *
 * The action is idempotent on the server: a second click reuses the existing thread
 * rather than starting a parallel one.
 */

export function StartConversationButton({
  productId,
  requestId,
  offerId,
  subject,
  label,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: {
  productId?: string
  requestId?: string
  offerId?: string
  /** Shown as the dialog subtitle so the sender sees what they are writing about. */
  subject?: string
  label?: string
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}) {
  const { t, fmt, href } = useI18n()
  const router = useRouter()
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    if (body.trim().length === 0) return
    setError(null)

    startTransition(async () => {
      const result = await startConversationAction({
        productId,
        requestId,
        offerId,
        body: body.trim(),
      })

      if (!result.ok) {
        // Two failures are really "you are not set up yet" — send the user there
        // instead of showing them a dead end.
        if (result.error === 'unauthorized') {
          router.push(href('login'))
          return
        }
        if (result.error === 'companyRequired') {
          router.push(href('onboarding'))
          return
        }

        const errors = t.errors as Record<string, string | undefined>
        setError(
          result.error === 'rateLimited'
            ? t.chat.rateLimited
            : fmt(errors[result.error] ?? t.errors.generic, result.params),
        )
        return
      }

      setOpen(false)
      setBody('')
      router.push(href('messages', result.data))
    })
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="h-4 w-4" aria-hidden />
        {label ?? t.chat.startConversation}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label ?? t.chat.startConversation}
        description={subject}
        closeLabel={t.a11y.closeDialog}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t.common.cancel}
            </Button>
            <Button onClick={submit} loading={pending} disabled={body.trim().length === 0}>
              {t.chat.send}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert variant="destructive">{error}</Alert> : null}

          <Field
            label={t.chat.placeholder}
            htmlFor={`${fieldId}-body`}
            hint={t.chat.firstMessageHint}
            required
          >
            <Textarea
              id={`${fieldId}-body`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t.chat.placeholder}
              maxLength={4000}
              rows={5}
              autoFocus
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
