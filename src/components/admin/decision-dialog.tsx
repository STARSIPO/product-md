'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition, type ReactNode } from 'react'

import {
  Alert,
  Badge,
  Button,
  Checkbox,
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
  bulkAddSynonymsAction,
  bumpProductAction,
  cancelRequestAction,
  clearPausedForBalanceAction,
  deleteReviewReplyAction,
  extendCompanyTrialAction,
  markPaymentFailedAction,
  reprocessWebhookAction,
  resetUserPasswordAction,
  revokeUserSessionsAction,
  saveTariffAction,
  setCompanyBadgeAction,
  setCompanyStatusAction,
  setDealDisputeAction,
  setDealStatusAdminAction,
  setFeatureFlagAction,
  setProductPinnedAction,
  setProductStatusAdminAction,
  setRequestStatusAdminAction,
  setUserBlockedAction,
  setUserRoleAction,
  unpublishProductAction,
  verifyUserContactAction,
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

/**
 * The design system caps `size="sm"` at 36px, which is right on a desktop toolbar and
 * too small for a thumb. Staff work these screens on a phone in a warehouse, so the
 * compact controls grow to the 44px minimum below `md` and shrink back above it.
 */
const TOUCH = 'min-h-[44px] md:min-h-[36px]'

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
        className={TOUCH}
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
  const reasonId = useId()

  return (
    <>
      <Button size="sm" className={TOUCH} variant={triggerVariant} onClick={() => setOpen(true)}>
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
            htmlFor={reasonId}
            required={reasonRequired}
            error={fieldError}
          >
            <Textarea
              id={reasonId}
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
          className={TOUCH}
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
        className={TOUCH}
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

// --- users: credentials, sessions, contacts ----------------------------------

/**
 * Issues a one-time password-reset link and shows it once.
 *
 * The admin never types a password for somebody else — that would put a working
 * credential in an operator's hands and in their clipboard history. This mints the same
 * single-use token the "forgot password" flow uses, displays it exactly once, and leaves
 * the token itself out of the audit row.
 */
export function PasswordResetButton({ userId }: { userId: string }) {
  const { t, fmt } = useI18n()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const linkId = useId()

  function close() {
    setOpen(false)
    setUrl(null)
    setCopied(false)
    setError(null)
  }

  function issue() {
    setError(null)
    startTransition(async () => {
      const result = await resetUserPasswordAction(userId)
      if (!result.ok) {
        setError(resolveErrorMessage(t, result, fmt))
        return
      }
      setUrl(result.data.url)
    })
  }

  return (
    <>
      <Button size="sm" className={TOUCH} variant="outline" onClick={() => setOpen(true)}>
        {t.admin.resetPassword}
      </Button>

      <Dialog
        open={open}
        onClose={close}
        title={t.admin.resetPassword}
        description={t.admin.resetPasswordHint}
        closeLabel={t.a11y.closeDialog}
        footer={
          url === null ? (
            <>
              <Button variant="ghost" onClick={close}>
                {t.common.cancel}
              </Button>
              <Button loading={pending} onClick={issue}>
                {t.common.confirm}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={close}>
              {t.common.close}
            </Button>
          )
        }
      >
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        {url === null ? null : (
          <div className="space-y-2 pt-1">
            <Field label={t.admin.resetPasswordLink} htmlFor={linkId} hint={t.admin.resetPasswordLinkHint}>
              <Input id={linkId} readOnly value={url} onFocus={(event) => event.target.select()} />
            </Field>
            <Button
              size="sm"
              className={TOUCH}
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => setCopied(true))
              }}
            >
              {copied ? t.common.copied : t.common.copy}
            </Button>
          </div>
        )}
      </Dialog>
    </>
  )
}

/**
 * Session and contact controls for one user.
 *
 * Everything here re-derives the target from the id on the server and re-checks the
 * admin role; the flags below only decide which buttons are worth showing.
 */
export function UserSecurityActions({
  userId,
  isSelf,
  canResetPassword,
  emailVerified,
  phoneVerified,
  hasEmail,
  hasPhone,
}: {
  userId: string
  isSelf: boolean
  canResetPassword: boolean
  emailVerified: boolean
  phoneVerified: boolean
  hasEmail: boolean
  hasPhone: boolean
}) {
  const { t } = useI18n()
  const { run, pending, error } = useStaffAction()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canResetPassword ? <PasswordResetButton userId={userId} /> : null}

      {isSelf ? null : (
        <ReasonDialog
          trigger={t.admin.revokeSessions}
          triggerVariant="destructive"
          title={t.admin.revokeSessions}
          description={t.admin.revokeSessionsHint}
          reasonLabel={t.admin.reason}
          confirmLabel={t.common.confirm}
          onConfirm={(reason, run2) => run2(() => revokeUserSessionsAction({ userId, reason }))}
        />
      )}

      {hasEmail && !emailVerified ? (
        <Button
          size="sm"
          className={TOUCH}
          variant="outline"
          loading={pending}
          onClick={() =>
            run(() => verifyUserContactAction({ userId, channel: 'EMAIL' }), {
              successMessage: t.admin.contactConfirmed,
            })
          }
        >
          {t.admin.confirmEmail}
        </Button>
      ) : null}

      {hasPhone && !phoneVerified ? (
        <Button
          size="sm"
          className={TOUCH}
          variant="outline"
          loading={pending}
          onClick={() =>
            run(() => verifyUserContactAction({ userId, channel: 'PHONE' }), {
              successMessage: t.admin.contactConfirmed,
            })
          }
        >
          {t.admin.confirmPhone}
        </Button>
      ) : null}

      {error ? <span className="text-caption text-destructive">{error}</span> : null}
    </div>
  )
}

// --- companies: badges and trial ---------------------------------------------

export interface BadgeRow {
  type: string
  granted: boolean
  statusLabel: string
  /** Preformatted on the server so the client never re-implements date formatting. */
  expiresLabel: string | null
  note: string | null
}

/**
 * Manual verification badges.
 *
 * The document queue produces most of these, but not every check happens on the
 * platform: an operator who has phoned ANSA or seen the papers in person needs to be
 * able to record it. TRUSTED_SUPPLIER has no automatic path at all — it exists only
 * here, which is why revoking any badge demands a written note.
 */
export function CompanyBadgeEditor({
  companyId,
  rows,
}: {
  companyId: string
  rows: readonly BadgeRow[]
}) {
  const { t } = useI18n()
  const labels = t.verification.types as Record<string, string | undefined>

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {rows.map((row) => (
        <li key={row.type} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{labels[row.type] ?? row.type}</span>
              <Badge variant={row.granted ? 'success' : 'neutral'} size="sm">
                {row.statusLabel}
              </Badge>
            </div>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {row.granted ? (row.expiresLabel ?? t.admin.badgeNever) : (row.note ?? '—')}
            </p>
          </div>

          {row.granted ? (
            <ReasonDialog
              trigger={t.admin.badgeRevoke}
              triggerVariant="destructive"
              title={`${t.admin.badgeRevoke}: ${labels[row.type] ?? row.type}`}
              description={t.admin.badgesHint}
              reasonLabel={t.admin.badgeNote}
              confirmLabel={t.admin.badgeRevoke}
              onConfirm={(note, run) =>
                run(() =>
                  setCompanyBadgeAction({ companyId, type: row.type as never, granted: false, note }),
                )
              }
            />
          ) : (
            <BadgeGrantButton companyId={companyId} type={row.type} label={labels[row.type] ?? row.type} />
          )}
        </li>
      ))}
    </ul>
  )
}

function BadgeGrantButton({
  companyId,
  type,
  label,
}: {
  companyId: string
  type: string
  label: string
}) {
  const { t } = useI18n()
  const [expiresAt, setExpiresAt] = useState('')
  const fieldId = useId()

  return (
    <ReasonDialog
      trigger={t.admin.badgeGrant}
      title={`${t.admin.badgeGrant}: ${label}`}
      description={t.admin.badgesHint}
      reasonLabel={t.admin.badgeNote}
      reasonRequired={false}
      confirmLabel={t.admin.badgeGrant}
      onConfirm={(note, run) =>
        run(() =>
          setCompanyBadgeAction({ companyId, type: type as never, granted: true, expiresAt, note }),
        )
      }
    >
      {({ pending }) => (
        <Field label={t.admin.badgeExpiresAt} htmlFor={fieldId} hint={t.admin.badgeExpiresHint}>
          <Input
            id={fieldId}
            type="date"
            value={expiresAt}
            disabled={pending}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </Field>
      )}
    </ReasonDialog>
  )
}

/** Adds days to the free-listing window; counted from today or the current end, whichever is later. */
export function TrialExtendButton({ companyId }: { companyId: string }) {
  const { t } = useI18n()
  const { run, pending, error } = useStaffAction()
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState('30')
  const fieldId = useId()

  return (
    <>
      <Button size="sm" className={TOUCH} variant="outline" onClick={() => setOpen(true)}>
        {t.admin.extendTrial}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t.admin.extendTrial}
        closeLabel={t.a11y.closeDialog}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run(() => extendCompanyTrialAction({ companyId, days }), {
                  onSuccess: () => setOpen(false),
                })
              }
            >
              {t.common.confirm}
            </Button>
          </>
        }
      >
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <Field className="pt-1" label={t.admin.extendTrialDays} htmlFor={fieldId}>
          <Input
            id={fieldId}
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={days}
            disabled={pending}
            onChange={(event) => setDays(event.target.value)}
          />
        </Field>
      </Dialog>
    </>
  )
}

// --- listings ----------------------------------------------------------------

/**
 * Everything an operator can do to a listing without going through moderation.
 *
 * Bumping and pinning are reversible and free, so they act immediately; taking a
 * listing down is not, so it goes through a dialog with a mandatory reason that the
 * seller then reads in the moderator comment.
 */
export function ListingAdminActions({
  productId,
  status,
  statusOptions,
  pinned,
  pausedForBalance,
}: {
  productId: string
  status: string
  statusOptions: readonly SelectOption[]
  pinned: boolean
  pausedForBalance: boolean
}) {
  const { t } = useI18n()
  const { run, pending, error } = useStaffAction()

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <EntityStatusActions
        kind="product"
        entityId={productId}
        status={status}
        statusOptions={statusOptions}
      />

      <Button
        size="sm"
        className={TOUCH}
        variant="ghost"
        loading={pending}
        onClick={() => run(() => bumpProductAction(productId), { successMessage: t.admin.bumped })}
      >
        {t.admin.bump}
      </Button>

      <Button
        size="sm"
        className={TOUCH}
        variant="ghost"
        loading={pending}
        onClick={() => run(() => setProductPinnedAction({ productId, value: !pinned }))}
      >
        {pinned ? t.admin.unpinHomepage : t.admin.pinHomepage}
      </Button>

      {pausedForBalance ? (
        <Button
          size="sm"
          className={TOUCH}
          variant="ghost"
          loading={pending}
          onClick={() => run(() => clearPausedForBalanceAction(productId))}
        >
          {t.admin.clearPausedForBalance}
        </Button>
      ) : null}

      <ReasonDialog
        trigger={t.admin.unpublish}
        triggerVariant="destructive"
        title={t.admin.unpublish}
        description={t.admin.unpublishHint}
        reasonLabel={t.admin.reason}
        confirmLabel={t.admin.unpublish}
        onConfirm={(reason, run2) => run2(() => unpublishProductAction({ productId, reason }))}
      />

      {error ? <span className="text-caption text-destructive">{error}</span> : null}
    </div>
  )
}

// --- requests & deals --------------------------------------------------------

export function RequestAdminActions({
  requestId,
  status,
  statusOptions,
}: {
  requestId: string
  status: string
  statusOptions: readonly SelectOption[]
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <EntityStatusActions
        kind="request"
        entityId={requestId}
        status={status}
        statusOptions={statusOptions}
      />

      {status === 'CANCELLED' ? null : (
        <ReasonDialog
          trigger={t.admin.cancelWithReason}
          triggerVariant="destructive"
          title={t.admin.cancelWithReason}
          reasonLabel={t.admin.reason}
          confirmLabel={t.common.confirm}
          onConfirm={(reason, run) => run(() => cancelRequestAction({ requestId, reason }))}
        />
      )}
    </div>
  )
}

export function DealAdminActions({
  dealId,
  status,
  statusOptions,
  disputeExits,
}: {
  dealId: string
  status: string
  statusOptions: readonly SelectOption[]
  /** CONFIRMED / COMPLETED / CANCELLED, already localized by the page. */
  disputeExits: readonly SelectOption[]
}) {
  const { t } = useI18n()
  const disputed = status === 'DISPUTED'
  const [exit, setExit] = useState(disputeExits[0]?.value ?? 'CONFIRMED')
  const fieldId = useId()

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <EntityStatusActions
        kind="deal"
        entityId={dealId}
        status={status}
        statusOptions={statusOptions}
      />

      <ReasonDialog
        trigger={disputed ? t.admin.closeDispute : t.admin.openDispute}
        triggerVariant={disputed ? 'outline' : 'destructive'}
        title={disputed ? t.admin.closeDispute : t.admin.openDispute}
        description={disputed ? t.admin.closeDisputeHint : undefined}
        reasonLabel={t.admin.reason}
        confirmLabel={t.common.confirm}
        onConfirm={(reason, run) =>
          run(() =>
            setDealDisputeAction({
              dealId,
              open: !disputed,
              status: exit as never,
              reason,
            }),
          )
        }
      >
        {({ pending }) =>
          disputed ? (
            <Field label={t.admin.disputeStatus} htmlFor={fieldId}>
              <Select
                id={fieldId}
                value={exit}
                disabled={pending}
                onChange={(event) => setExit(event.target.value)}
              >
                {disputeExits.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null
        }
      </ReasonDialog>
    </div>
  )
}

// --- reviews -----------------------------------------------------------------

/**
 * Hiding a review is a moderation decision and goes through the moderation action;
 * deleting a company's reply is an admin one, because the row has no hidden state and
 * the text is gone for good.
 */
export function ReviewAdminActions({
  reviewId,
  hidden,
  hasReply,
}: {
  reviewId: string
  hidden: boolean
  hasReply: boolean
}) {
  const { t } = useI18n()
  const { run, pending, error } = useStaffAction()

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {hidden ? (
        <Button
          size="sm"
          className={TOUCH}
          variant="outline"
          loading={pending}
          onClick={() =>
            run(() => setReviewHiddenAction({ entityId: reviewId, hidden: false }), {
              successMessage: t.moderation.decisionSaved,
            })
          }
        >
          {t.moderation.restore}
        </Button>
      ) : (
        <ReasonDialog
          trigger={t.moderation.hide}
          triggerVariant="destructive"
          title={t.moderation.hide}
          description={t.moderation.commentRequired}
          reasonLabel={t.moderation.comment}
          confirmLabel={t.moderation.hide}
          onConfirm={(comment, run2) =>
            run2(() => setReviewHiddenAction({ entityId: reviewId, hidden: true, comment }))
          }
        />
      )}

      {hasReply ? (
        <ReasonDialog
          trigger={t.admin.deleteReply}
          triggerVariant="destructive"
          title={t.admin.deleteReply}
          description={t.admin.deleteReplyHint}
          reasonLabel={t.admin.reason}
          confirmLabel={t.common.delete}
          onConfirm={(reason, run2) => run2(() => deleteReviewReplyAction({ reviewId, reason }))}
        />
      ) : null}

      {error ? <span className="text-caption text-destructive">{error}</span> : null}
    </div>
  )
}

// --- synonyms ----------------------------------------------------------------

/**
 * Bulk synonym entry.
 *
 * Teaching the matcher a category is never one word — «картошка», «картофан», the
 * misspelling «картофиль» and "cartofi" arrive together. One per line; terms already
 * known for that category and language are skipped, so the box is safe to paste into
 * twice.
 */
export function BulkSynonymForm({
  categories,
  defaultCategoryId,
  defaultLocale,
}: {
  categories: readonly SelectOption[]
  defaultCategoryId: string
  defaultLocale: 'ru' | 'ro'
}) {
  const { t, fmt } = useI18n()
  const { run, pending, error, fieldError } = useStaffAction()
  const [categoryId, setCategoryId] = useState(defaultCategoryId)
  const [locale, setLocale] = useState<'ru' | 'ro'>(defaultLocale)
  const [terms, setTerms] = useState('')
  const [weight, setWeight] = useState('100')
  const [isMisspelling, setMisspelling] = useState(false)
  const [added, setAdded] = useState<number | null>(null)
  const baseId = useId()

  return (
    <section className="rounded-lg border border-border bg-card p-4 [&_input:not([type=checkbox])]:min-h-[44px] [&_select]:min-h-[44px] md:[&_input:not([type=checkbox])]:min-h-[42px] md:[&_select]:min-h-[42px]">
      <h2 className="text-h3">{t.admin.bulkSynonyms}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.admin.bulkSynonymsHint}</p>

      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}

      {added !== null ? (
        <Alert variant="success" className="mt-3">
          {fmt(t.admin.bulkSynonymsAdded, { count: added })}
        </Alert>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={t.admin.categories} htmlFor={`${baseId}-category`}>
          <Select
            id={`${baseId}-category`}
            value={categoryId}
            disabled={pending}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">—</option>
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.admin.synonymLocale} htmlFor={`${baseId}-locale`}>
          <Select
            id={`${baseId}-locale`}
            value={locale}
            disabled={pending}
            onChange={(event) => setLocale(event.target.value === 'ro' ? 'ro' : 'ru')}
          >
            <option value="ru">ru</option>
            <option value="ro">ro</option>
          </Select>
        </Field>

        <Field
          className="sm:col-span-2"
          label={t.admin.bulkSynonymsTerms}
          htmlFor={`${baseId}-terms`}
          required
          error={fieldError}
        >
          <Textarea
            id={`${baseId}-terms`}
            rows={6}
            value={terms}
            disabled={pending}
            invalid={fieldError !== undefined}
            onChange={(event) => setTerms(event.target.value)}
          />
        </Field>

        <Field label={t.admin.synonymWeight} htmlFor={`${baseId}-weight`}>
          <Input
            id={`${baseId}-weight`}
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            value={weight}
            disabled={pending}
            onChange={(event) => setWeight(event.target.value)}
          />
        </Field>

        <label className="flex min-h-[44px] items-center gap-2.5 self-end text-sm">
          <Checkbox
            checked={isMisspelling}
            disabled={pending}
            onChange={(event) => setMisspelling(event.target.checked)}
          />
          {t.admin.synonymMisspelling}
        </label>
      </div>

      <Button
        className="mt-4 min-h-[44px] md:min-h-[42px]"
        loading={pending}
        disabled={categoryId === '' || terms.trim() === ''}
        onClick={() => {
          setAdded(null)
          run(
            () =>
              bulkAddSynonymsAction({ categoryId, locale, terms, weight, isMisspelling }).then(
                (result) => {
                  if (result.ok) {
                    setAdded(result.data)
                    setTerms('')
                  }
                  return result
                },
              ),
            { successMessage: t.admin.saved },
          )
        }}
      >
        {t.common.add}
      </Button>
    </section>
  )
}

// --- payments ----------------------------------------------------------------

/** Re-runs a stored callback whose handler died half way. Crediting stays idempotent. */
export function WebhookRetryButton({ eventId }: { eventId: string }) {
  const { t } = useI18n()
  const { run, pending, error } = useStaffAction()

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size="sm"
        className={TOUCH}
        variant="outline"
        loading={pending}
        onClick={() =>
          run(() => reprocessWebhookAction(eventId), { successMessage: t.admin.paymentUpdated })
        }
      >
        {t.admin.retryWebhook}
      </Button>
      {error ? <span className="text-caption text-destructive">{error}</span> : null}
    </span>
  )
}

/** Closes out a payment that will never arrive. Bookkeeping only — no balance moves. */
export function PaymentFailButton({ paymentId }: { paymentId: string }) {
  const { t } = useI18n()

  return (
    <ReasonDialog
      trigger={t.admin.markPaymentFailed}
      triggerVariant="destructive"
      title={t.admin.markPaymentFailed}
      description={t.admin.markPaymentFailedHint}
      reasonLabel={t.admin.reason}
      confirmLabel={t.common.confirm}
      onConfirm={(reason, run) => run(() => markPaymentFailedAction({ paymentId, reason }))}
    />
  )
}
