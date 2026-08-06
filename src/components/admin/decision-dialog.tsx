'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'

import {
  Alert,
  Button,
  Dialog,
  Field,
  Input,
  RadioGroup,
  Select,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { resolveErrorMessage, translate } from '@/app/[locale]/login/login-form'
import type { ActionResult } from '@/server/actions/result'
import type {
  CompanyStatus,
  DealStatus,
  ProductStatus,
  RequestStatus,
  UserRole,
} from '@/lib/constants'
import {
  claimTaskAction,
  decideComplaintAction,
  decideDocumentAction,
  decideProductAction,
  setReviewHiddenAction,
} from '@/server/actions/moderation'
import {
  adjustCompanyBalanceAction,
  saveTariffAction,
  setCompanyStatusAction,
  setDealStatusAdminAction,
  setFeatureFlagAction,
  setProductStatusAdminAction,
  setRequestStatusAdminAction,
  setUserBlockedAction,
  setUserRoleAction,
} from '@/server/actions/admin'

/**
 * Every staff decision that needs a confirmation and a written reason.
 *
 * They live together because they are one interaction repeated: pick an outcome, justify
 * it, confirm. The reason is not decoration — it is copied into the audit row, and for a
 * moderation verdict it is the exact text the seller reads in their email, so the form
 * refuses to submit an empty one wherever the user is owed an explanation.
 *
 * Errors arrive from the server as dictionary keys and are rendered through
 * `resolveErrorMessage`, so /ru and /ro both get a real sentence rather than an
 * identifier. Labels come from `useI18n()`; nothing here is hardcoded copy.
 */

type AnyActionResult = ActionResult<unknown>

interface RunOptions {
  onSuccess?: () => void
  successMessage?: string
}

/** Shared submit plumbing: pending state, localized error, toast, router refresh. */
function useStaffAction() {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | undefined>(undefined)

  function run(action: () => Promise<AnyActionResult>, options: RunOptions = {}) {
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

// --- moderation --------------------------------------------------------------

export type DecisionKind = 'product' | 'document'

type DecisionValue = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | 'BLOCK'

/**
 * The moderator's verdict form, rendered beside the material under review.
 *
 * A comment is mandatory for everything except APPROVE. The rule is enforced again by
 * `moderationDecisionSchema` on the server — this check only spares the moderator a
 * round trip.
 */
export function DecisionPanel({ kind, entityId }: { kind: DecisionKind; entityId: string }) {
  const { t } = useI18n()
  const { run, pending, error, fieldError } = useStaffAction()
  const [decision, setDecision] = useState<DecisionValue>('APPROVE')
  const [comment, setComment] = useState('')

  const commentRequired = decision !== 'APPROVE'
  const missingComment = commentRequired && comment.trim().length === 0

  function submit() {
    const input = { entityId, decision, comment }
    run(
      () =>
        kind === 'product'
          ? decideProductAction(input)
          : decideDocumentAction(input),
      {
        successMessage: t.moderation.decisionSaved,
        onSuccess: () => setComment(''),
      },
    )
  }

  return (
    <section
      aria-label={t.moderation.decision}
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-h3">{t.moderation.decision}</h2>

      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}

      <div className="mt-3">
        <RadioGroup
          name={`decision-${entityId}`}
          value={decision}
          onChange={(value) => setDecision(value as DecisionValue)}
          disabled={pending}
          options={[
            { value: 'APPROVE', label: t.moderation.approve },
            { value: 'REQUEST_CHANGES', label: t.moderation.requestChanges },
            { value: 'REJECT', label: t.moderation.reject },
            { value: 'BLOCK', label: t.moderation.block },
          ]}
        />
      </div>

      <Field
        className="mt-4"
        label={t.moderation.comment}
        htmlFor={`comment-${entityId}`}
        required={commentRequired}
        hint={t.moderation.commentRequired}
        error={fieldError}
      >
        <Textarea
          id={`comment-${entityId}`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          invalid={fieldError !== undefined}
          rows={5}
          maxLength={2000}
        />
      </Field>

      <Button
        className="mt-4"
        fullWidth
        loading={pending}
        disabled={missingComment}
        onClick={submit}
      >
        {t.common.confirm}
      </Button>
    </section>
  )
}

/** Resolve or refuse a complaint. Both outcomes require a written resolution. */
export function ComplaintDecisionPanel({ complaintId }: { complaintId: string }) {
  const { t } = useI18n()
  const { run, pending, error, fieldError } = useStaffAction()
  const [decision, setDecision] = useState('RESOLVE')
  const [comment, setComment] = useState('')

  return (
    <section
      aria-label={t.moderation.decision}
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-h3">{t.moderation.decision}</h2>

      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}

      <div className="mt-3">
        <RadioGroup
          name={`complaint-${complaintId}`}
          value={decision}
          onChange={setDecision}
          disabled={pending}
          options={[
            { value: 'RESOLVE', label: t.moderation.resolve },
            { value: 'REJECT', label: t.moderation.rejectComplaint },
          ]}
        />
      </div>

      <Field
        className="mt-4"
        label={t.moderation.resolution}
        htmlFor={`resolution-${complaintId}`}
        required
        hint={t.moderation.resolutionHint}
        error={fieldError}
      >
        <Textarea
          id={`resolution-${complaintId}`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          invalid={fieldError !== undefined}
          rows={5}
          maxLength={2000}
        />
      </Field>

      <Button
        className="mt-4"
        fullWidth
        loading={pending}
        disabled={comment.trim().length === 0}
        onClick={() =>
          run(
            () =>
              decideComplaintAction({
                entityId: complaintId,
                resolve: decision === 'RESOLVE',
                comment,
              }),
            { successMessage: t.moderation.decisionSaved },
          )
        }
      >
        {t.common.confirm}
      </Button>
    </section>
  )
}

/** Hide a review (reason required) or put it back. */
export function ReviewDecisionPanel({
  reviewId,
  hidden,
}: {
  reviewId: string
  hidden: boolean
}) {
  const { t } = useI18n()
  const { run, pending, error, fieldError } = useStaffAction()
  const [comment, setComment] = useState('')

  return (
    <section
      aria-label={t.moderation.decision}
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-h3">{t.moderation.decision}</h2>

      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}

      {hidden ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.moderation.hiddenNotice}</p>
      ) : (
        <Field
          className="mt-3"
          label={t.moderation.comment}
          htmlFor={`review-comment-${reviewId}`}
          required
          hint={t.moderation.commentRequired}
          error={fieldError}
        >
          <Textarea
            id={`review-comment-${reviewId}`}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            invalid={fieldError !== undefined}
            rows={4}
            maxLength={2000}
          />
        </Field>
      )}

      <Button
        className="mt-4"
        fullWidth
        variant={hidden ? 'outline' : 'destructive'}
        loading={pending}
        disabled={!hidden && comment.trim().length === 0}
        onClick={() =>
          run(
            () => setReviewHiddenAction({ entityId: reviewId, hidden: !hidden, comment }),
            { successMessage: t.moderation.decisionSaved },
          )
        }
      >
        {hidden ? t.moderation.restore : t.moderation.hide}
      </Button>
    </section>
  )
}

/** Takes a queue task. The server refuses the second claim, not this button. */
export function ClaimButton({ taskId }: { taskId: string }) {
  const { t } = useI18n()
  const { run, pending, error } = useStaffAction()

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={() => run(() => claimTaskAction(taskId), { successMessage: t.moderation.claimed })}
      >
        {t.moderation.claimTask}
      </Button>
      {error ? <span className="text-caption text-destructive">{error}</span> : null}
    </span>
  )
}

// --- generic confirm-with-reason dialog --------------------------------------

interface ReasonDialogProps {
  trigger: string
  triggerVariant?: 'outline' | 'destructive' | 'primary' | 'ghost'
  title: string
  description?: string
  reasonLabel: string
  reasonRequired?: boolean
  confirmLabel: string
  /** Extra controls rendered above the reason field. */
  children?: (state: { pending: boolean }) => ReactNode
  onConfirm: (reason: string, run: (action: () => Promise<AnyActionResult>) => void) => void
}

function ReasonDialog({
  trigger,
  triggerVariant = 'outline',
  title,
  description,
  reasonLabel,
  reasonRequired = true,
  confirmLabel,
  children,
  onConfirm,
}: ReasonDialogProps) {
  const { t } = useI18n()
  const { run, pending, error, fieldError } = useStaffAction()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  return (
    <>
      <Button size="sm" variant={triggerVariant} onClick={() => setOpen(true)}>
        {trigger}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
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
                onConfirm(reason, (action) =>
                  run(action, {
                    onSuccess: () => {
                      setReason('')
                      setOpen(false)
                    },
                  }),
                )
              }
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <div className="space-y-3 pt-1">
          {children?.({ pending })}

          <Field
            label={reasonLabel}
            htmlFor="reason"
            required={reasonRequired}
            error={fieldError}
          >
            <Textarea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              invalid={fieldError !== undefined}
              rows={3}
              maxLength={1000}
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}

// --- users -------------------------------------------------------------------

export interface SelectOption {
  value: string
  label: string
}

/** Role change is immediate; blocking asks for a reason first. */
export function UserActions({
  userId,
  role,
  blocked,
  roleOptions,
  isSelf,
}: {
  userId: string
  role: string
  blocked: boolean
  roleOptions: readonly SelectOption[]
  isSelf: boolean
}) {
  const { t } = useI18n()
  const { run, pending, error } = useStaffAction()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`role-${userId}`}>
        {t.admin.role}
      </label>
      <Select
        id={`role-${userId}`}
        defaultValue={role}
        disabled={pending || isSelf}
        wrapperClassName="w-auto min-w-[150px]"
        onChange={(event) =>
          run(() => setUserRoleAction({ userId, role: event.target.value as UserRole }))
        }
      >
        {roleOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      {isSelf ? null : blocked ? (
        <Button
          size="sm"
          variant="outline"
          loading={pending}
          onClick={() => run(() => setUserBlockedAction({ userId, blocked: false }))}
        >
          {t.admin.unblock}
        </Button>
      ) : (
        <ReasonDialog
          trigger={t.admin.block}
          triggerVariant="destructive"
          title={t.admin.block}
          description={t.admin.blockHint}
          reasonLabel={t.admin.blockReason}
          confirmLabel={t.admin.block}
          onConfirm={(reason, run2) =>
            run2(() => setUserBlockedAction({ userId, blocked: true, reason }))
          }
        />
      )}

      {error ? <span className="text-caption text-destructive">{error}</span> : null}
    </div>
  )
}

// --- companies ---------------------------------------------------------------

export function CompanyActions({
  companyId,
  status,
  statusOptions,
}: {
  companyId: string
  status: string
  statusOptions: readonly SelectOption[]
}) {
  const { t } = useI18n()
  const [nextStatus, setNextStatus] = useState(status)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ReasonDialog
        trigger={t.admin.changeStatus}
        title={t.admin.changeStatus}
        reasonLabel={t.admin.reason}
        reasonRequired={nextStatus !== 'ACTIVE'}
        confirmLabel={t.common.confirm}
        onConfirm={(reason, run) =>
          run(() =>
            setCompanyStatusAction({
              companyId,
              status: nextStatus as CompanyStatus,
              reason,
            }),
          )
        }
      >
        {({ pending }) => (
          <Field label={t.admin.newStatus} htmlFor={`company-status-${companyId}`}>
            <Select
              id={`company-status-${companyId}`}
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
        )}
      </ReasonDialog>

      <BalanceAdjustButton companyId={companyId} />
    </div>
  )
}

/**
 * Manual balance correction.
 *
 * The amount is entered in MDL and may be negative. It never writes `balanceBani`: the
 * server appends an ADJUSTMENT ledger entry and the cached balance follows from it.
 */
export function BalanceAdjustButton({ companyId }: { companyId: string }) {
  const { t } = useI18n()
  const [amount, setAmount] = useState('')

  return (
    <ReasonDialog
      trigger={t.admin.adjustBalance}
      title={t.admin.adjustBalance}
      description={t.admin.adjustHint}
      reasonLabel={t.admin.reason}
      confirmLabel={t.common.confirm}
      onConfirm={(reason, run) =>
        run(() => adjustCompanyBalanceAction({ companyId, amount, reason }))
      }
    >
      {({ pending }) => (
        <Field
          label={t.admin.adjustAmount}
          htmlFor={`amount-${companyId}`}
          hint={t.admin.adjustAmountHint}
        >
          <Input
            id={`amount-${companyId}`}
            inputMode="decimal"
            value={amount}
            disabled={pending}
            placeholder="-100.00"
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
      )}
    </ReasonDialog>
  )
}

// --- content status overrides ------------------------------------------------

export type EntityKind = 'product' | 'request' | 'deal'

export function EntityStatusActions({
  kind,
  entityId,
  status,
  statusOptions,
}: {
  kind: EntityKind
  entityId: string
  status: string
  statusOptions: readonly SelectOption[]
}) {
  const { t } = useI18n()
  const [nextStatus, setNextStatus] = useState(status)

  return (
    <ReasonDialog
      trigger={t.admin.changeStatus}
      title={t.admin.changeStatus}
      description={t.admin.forceStatusHint}
      reasonLabel={t.admin.reason}
      reasonRequired={false}
      confirmLabel={t.common.confirm}
      onConfirm={(reason, run) =>
        run(() => {
          // The union cast is a convenience for the compiler only — the server parses
          // the value against the same const tuple before it touches a row.
          if (kind === 'product') {
            return setProductStatusAdminAction({
              productId: entityId,
              status: nextStatus as ProductStatus,
              reason,
            })
          }
          if (kind === 'request') {
            return setRequestStatusAdminAction({
              requestId: entityId,
              status: nextStatus as RequestStatus,
              reason,
            })
          }
          return setDealStatusAdminAction({
            dealId: entityId,
            status: nextStatus as DealStatus,
            reason,
          })
        })
      }
    >
      {({ pending }) => (
        <Field label={t.admin.newStatus} htmlFor={`status-${entityId}`}>
          <Select
            id={`status-${entityId}`}
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
      )}
    </ReasonDialog>
  )
}

// --- feature flags & tariffs -------------------------------------------------

export function FlagSwitch({
  flagKey,
  enabled,
  label,
}: {
  flagKey: string
  enabled: boolean
  label: string
}) {
  const { run, pending, error } = useStaffAction()
  const [checked, setChecked] = useState(enabled)

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Switch
        id={`flag-${flagKey}`}
        checked={checked}
        disabled={pending}
        label={label}
        onCheckedChange={(next) => {
          setChecked(next)
          run(() => setFeatureFlagAction({ key: flagKey, enabled: next }))
        }}
      />
      {error ? <span className="text-caption text-destructive">{error}</span> : null}
    </span>
  )
}

/** Price is typed in MDL and stored as bani by `tariffSchema`. */
export function TariffForm({
  tariffKey,
  price,
  isActive,
}: {
  tariffKey: string
  price: string
  isActive: boolean
}) {
  const { t } = useI18n()
  const { run, pending, error, fieldError } = useStaffAction()
  const [value, setValue] = useState(price)
  const [active, setActive] = useState(isActive)

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-32">
        <label className="sr-only" htmlFor={`tariff-${tariffKey}`}>
          {t.admin.tariffPrice}
        </label>
        <Input
          id={`tariff-${tariffKey}`}
          inputMode="decimal"
          value={value}
          disabled={pending}
          invalid={fieldError !== undefined}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>

      <Switch
        id={`tariff-active-${tariffKey}`}
        checked={active}
        disabled={pending}
        label={t.admin.tariffActive}
        onCheckedChange={setActive}
      />

      <Button
        size="sm"
        loading={pending}
        onClick={() =>
          run(() => saveTariffAction({ key: tariffKey, priceBani: value, isActive: active }))
        }
      >
        {t.common.save}
      </Button>

      {error ? <span className="text-caption text-destructive">{error}</span> : null}
      {fieldError ? <span className="text-caption text-destructive">{fieldError}</span> : null}
    </div>
  )
}
