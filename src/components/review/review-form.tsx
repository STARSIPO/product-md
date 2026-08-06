'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/provider'
import { createReviewAction, replyToReviewAction } from '@/server/actions/reviews'
import { Alert, Button, Field, RatingInput, Textarea, useToast } from '@/components/ui'

/**
 * Leaving a review, and answering one.
 *
 * The form shows only the criteria that apply to the caller's side of the deal — a
 * buyer rates quality and delivery, a seller rates payment discipline — but that list
 * is re-derived server-side from the deal row, so an edited payload cannot smuggle
 * "delivery: 1" onto a buyer.
 *
 * Every failure the server can return here is a rule the user is allowed to know
 * about ("only after a completed deal", "already reviewed"), so the messages are
 * shown verbatim from the dictionary rather than collapsed into a generic error.
 */

export function ReviewForm({
  dealId,
  criteria,
  targetCompanyName,
  onDone,
}: {
  dealId: string
  /** Criterion codes for this direction, produced by the server. */
  criteria: readonly string[]
  targetCompanyName?: string
  onDone?: () => void
}) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const fieldId = useId()

  const [overall, setOverall] = useState(0)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const labels = t.review.criteria as Record<string, string | undefined>

  function submit() {
    if (overall < 1) return
    setError(null)

    startTransition(async () => {
      const result = await createReviewAction({
        dealId,
        overall,
        criteria: scores,
        comment: comment.trim() === '' ? undefined : comment.trim(),
      })

      if (!result.ok) {
        const errors = t.errors as Record<string, string | undefined>
        setError(fmt(errors[result.error] ?? t.errors.generic, result.params))
        return
      }

      toast({ title: t.review.submitted, variant: 'success' })
      onDone?.()
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="space-y-5"
      noValidate
    >
      <div>
        <h2 className="text-h3">{t.review.leaveTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {targetCompanyName ?? t.review.leaveSubtitle}
        </p>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">{t.review.overall}</legend>
        <RatingInput
          name={`${fieldId}-overall`}
          value={overall}
          onChange={setOverall}
          label={t.review.overall}
          optionLabel={(star) => fmt(t.review.ratingOf, { value: star })}
        />
      </fieldset>

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">{t.review.breakdown}</legend>
        <div className="space-y-1">
          {criteria.map((code) => (
            <div
              key={code}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1 last:border-0"
            >
              <span className="text-sm">{labels[code] ?? code}</span>
              <RatingInput
                name={`${fieldId}-${code}`}
                value={scores[code] ?? 0}
                onChange={(value) => setScores((current) => ({ ...current, [code]: value }))}
                size="sm"
                label={labels[code] ?? code}
                optionLabel={(star) => fmt(t.review.ratingOf, { value: star })}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <Field label={t.review.comment} htmlFor={`${fieldId}-comment`} hint={t.common.optional}>
        <Textarea
          id={`${fieldId}-comment`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t.review.commentPlaceholder}
          maxLength={3000}
          rows={4}
        />
      </Field>

      <Button type="submit" loading={pending} disabled={overall < 1}>
        {t.review.submit}
      </Button>
    </form>
  )
}

/** The reviewed company's single answer. One per review, enforced server-side. */
export function ReviewReplyForm({ reviewId }: { reviewId: string }) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const fieldId = useId()

  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    if (body.trim().length === 0) return
    setError(null)

    startTransition(async () => {
      const result = await replyToReviewAction({ reviewId, body: body.trim() })

      if (!result.ok) {
        const errors = t.errors as Record<string, string | undefined>
        setError(fmt(errors[result.error] ?? t.errors.generic, result.params))
        return
      }

      setOpen(false)
      setBody('')
      toast({ title: t.review.replySubmitted, variant: 'success' })
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t.review.reply}
      </Button>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="mt-2 space-y-2"
      noValidate
    >
      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <Field label={t.review.replyTitle} htmlFor={`${fieldId}-reply`}>
        <Textarea
          id={`${fieldId}-reply`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t.review.replyPlaceholder}
          maxLength={2000}
          rows={3}
          autoFocus
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={pending} disabled={body.trim().length === 0}>
          {t.review.replySubmit}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  )
}
