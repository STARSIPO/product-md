'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Download, KeyRound, ShieldCheck, Trash2 } from 'lucide-react'
import { Alert, Button, Field, Input, Select, useToast } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { LOCALES, LOCALE_LABELS, localePath } from '@/lib/i18n/config'
import { changePasswordSchema, totpCodeSchema } from '@/lib/validation'
import { changePassword, confirmTotpEnrollment, disableTotp } from '@/server/actions/auth'
import {
  deleteAccount,
  revokeAllOtherSessions,
  revokeSession,
  startTotpEnrollment,
  updateAccountSettings,
} from '@/server/actions/company'
import { resolveErrorMessage, translate } from '@/app/[locale]/login/login-form'

/**
 * Account settings: profile, password, two-factor, sessions, data, deletion.
 *
 * Everything destructive here is deliberately slower than everything else — deleting
 * an account takes a typed word, and disabling two-factor takes a current code. The
 * asymmetry is the point: turning protection *on* should be one click, turning it off
 * should require proving you still hold the factor.
 */

export interface AccountInitialValues {
  name: string
  email: string
  phone: string
  locale: string
}

export function AccountSettingsForm({ initial }: { initial: AccountInitialValues }) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()

  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ variant: 'success' | 'destructive'; text: string } | null>(
    null,
  )
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setMessage(null)
    setErrors({})

    startTransition(async () => {
      const result = await updateAccountSettings(values)

      if (!result.ok) {
        if (result.fields) {
          const resolved: Record<string, string> = {}
          for (const [field, key] of Object.entries(result.fields)) {
            resolved[field] = translate(t, key) ?? key
          }
          setErrors(resolved)
        }
        setMessage({ variant: 'destructive', text: resolveErrorMessage(t, result, fmt) })
        return
      }

      setMessage({ variant: 'success', text: t.settings.saved })
      toast({ title: t.settings.saved, variant: 'success' })
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div aria-live="polite">
        {message ? <Alert variant={message.variant}>{message.text}</Alert> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.settings.name} htmlFor="account-name" required error={errors['name']}>
          <Input
            id="account-name"
            autoComplete="name"
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            invalid={Boolean(errors['name'])}
            maxLength={120}
          />
        </Field>

        <Field label={t.settings.locale} htmlFor="account-locale">
          <Select
            id="account-locale"
            value={values.locale}
            onChange={(event) =>
              setValues((current) => ({ ...current, locale: event.target.value }))
            }
          >
            {LOCALES.map((value) => (
              <option key={value} value={value}>
                {LOCALE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.settings.email} htmlFor="account-email" error={errors['email']}>
          <Input
            id="account-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
            invalid={Boolean(errors['email'])}
          />
        </Field>

        <Field label={t.settings.phone} htmlFor="account-phone" error={errors['phone']}>
          <Input
            id="account-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value }))}
            invalid={Boolean(errors['phone'])}
          />
        </Field>
      </div>

      <Button type="submit" loading={pending}>
        {t.common.save}
      </Button>
    </form>
  )
}

// --- password ----------------------------------------------------------------

type PasswordValues = z.input<typeof changePasswordSchema>

export function ChangePasswordForm() {
  const { t, fmt } = useI18n()
  const { toast } = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', passwordConfirm: '' },
  })

  function onSubmit(values: PasswordValues) {
    setFormError(null)
    setDone(false)

    startTransition(async () => {
      const result = await changePassword(values)
      if (!result.ok) {
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }
      reset()
      setDone(true)
      toast({ title: t.settings.passwordChanged, variant: 'success' })
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div aria-live="polite">
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
        {done && !formError ? <Alert variant="success">{t.settings.passwordChanged}</Alert> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t.settings.currentPassword}
          htmlFor="current-password"
          required
          error={errors.currentPassword ? translate(t, errors.currentPassword.message) : undefined}
          className="sm:col-span-2"
        >
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            invalid={Boolean(errors.currentPassword)}
            {...register('currentPassword')}
          />
        </Field>

        <Field
          label={t.settings.newPassword}
          htmlFor="new-password"
          required
          error={errors.password ? translate(t, errors.password.message) : undefined}
        >
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>

        <Field
          label={t.auth.passwordConfirm}
          htmlFor="new-password-confirm"
          required
          error={errors.passwordConfirm ? translate(t, errors.passwordConfirm.message) : undefined}
        >
          <Input
            id="new-password-confirm"
            type="password"
            autoComplete="new-password"
            invalid={Boolean(errors.passwordConfirm)}
            {...register('passwordConfirm')}
          />
        </Field>
      </div>

      <Button type="submit" loading={pending}>
        <KeyRound className="h-4 w-4" aria-hidden />
        {t.settings.changePassword}
      </Button>
    </form>
  )
}

// --- two-factor --------------------------------------------------------------

type TotpValues = z.input<typeof totpCodeSchema>

export function TwoFactorSettings({
  enabled,
  isAdmin,
  autoStart,
}: {
  enabled: boolean
  isAdmin: boolean
  /** The admin guard sends people here with ?setup2fa=1 — start enrolment for them. */
  autoStart: boolean
}) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()

  const [enrollment, setEnrollment] = useState<{ secret: string; uri: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [mode, setMode] = useState<'idle' | 'enable' | 'disable'>('idle')
  const [pending, startTransition] = useTransition()
  const started = useRef(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TotpValues>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: '' },
  })

  function begin() {
    setFormError(null)
    setMode('enable')
    startTransition(async () => {
      const result = await startTotpEnrollment()
      if (!result.ok) {
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }
      setEnrollment(result.data)
    })
  }

  useEffect(() => {
    if (autoStart && !enabled && !started.current) {
      started.current = true
      begin()
    }
    // `begin` is stable enough for a one-shot effect guarded by a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, enabled])

  function onSubmit(values: TotpValues) {
    setFormError(null)

    startTransition(async () => {
      const result =
        mode === 'disable' ? await disableTotp(values) : await confirmTotpEnrollment(values)

      if (!result.ok) {
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }

      reset()
      setEnrollment(null)
      setMode('idle')
      toast({
        title: mode === 'disable' ? t.settings.twoFactorDisabled : t.settings.twoFactorEnabled,
        variant: 'success',
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.settings.twoFactorText}</p>

      <p className="text-sm">
        <ShieldCheck
          aria-hidden
          className={enabled ? 'mr-1.5 inline h-4 w-4 text-success' : 'mr-1.5 inline h-4 w-4 text-muted-foreground'}
        />
        <strong>{enabled ? t.settings.twoFactorOn : t.settings.twoFactorOff}</strong>
      </p>

      <div aria-live="polite">
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      </div>

      {!enabled && mode !== 'enable' ? (
        <Button loading={pending} onClick={begin}>
          {t.settings.twoFactorEnable}
        </Button>
      ) : null}

      {enabled && mode !== 'disable' ? (
        isAdmin ? (
          <Alert variant="info">{t.settings.twoFactorAdminNote}</Alert>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setMode('disable')
              setFormError(null)
            }}
          >
            {t.settings.twoFactorDisable}
          </Button>
        )
      ) : null}

      {enrollment ? (
        <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">{t.settings.twoFactorManualHint}</p>

          <Field label={t.settings.twoFactorSecret} htmlFor="totp-secret">
            {/* Read-only and selectable rather than an image: there is no QR library
                here, and a picture that is not a real QR code helps nobody. */}
            <Input
              id="totp-secret"
              readOnly
              value={enrollment.secret}
              onFocus={(event) => event.currentTarget.select()}
              className="tnum font-mono"
            />
          </Field>

          <Field label={t.settings.twoFactorUri} htmlFor="totp-uri">
            <Input
              id="totp-uri"
              readOnly
              value={enrollment.uri}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-caption"
            />
          </Field>
        </div>
      ) : null}

      {mode !== 'idle' ? (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <Field
            label={t.settings.twoFactorCode}
            htmlFor="totp-code"
            required
            error={errors.code ? translate(t, errors.code.message) : undefined}
          >
            <Input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={t.auth.codePlaceholder}
              invalid={Boolean(errors.code)}
              {...register('code')}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending}>
              {mode === 'disable' ? t.settings.twoFactorDisable : t.settings.twoFactorConfirm}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMode('idle')
                setEnrollment(null)
                reset()
              }}
            >
              {t.common.cancel}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

// --- sessions ----------------------------------------------------------------

export interface SessionRow {
  id: string
  userAgent: string | null
  ip: string | null
  createdAt: string
  current: boolean
}

export function SessionsList({ sessions }: { sessions: readonly SessionRow[] }) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()

  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function revokeOne(id: string) {
    setMessage(null)
    startTransition(async () => {
      const result = await revokeSession(id)
      if (!result.ok) {
        setMessage(resolveErrorMessage(t, result, fmt))
        return
      }
      setMessage(t.settings.sessionRevoked)
      toast({ title: t.settings.sessionRevoked, variant: 'success' })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div aria-live="polite">
        {message ? <p className="text-caption text-muted-foreground">{message}</p> : null}
      </div>

      <ul className="divide-y divide-border rounded-md border border-border">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex min-h-[56px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">
                {session.userAgent ?? t.settings.sessionUnknownDevice}
                {session.current ? (
                  <span className="ml-2 text-caption font-medium text-primary">
                    {t.settings.sessionCurrent}
                  </span>
                ) : null}
              </p>
              <p className="text-caption text-muted-foreground">
                {t.settings.sessionStarted}: {session.createdAt}
                {session.ip ? ` · ${t.settings.sessionIp}: ${session.ip}` : ''}
              </p>
            </div>

            {!session.current ? (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px]"
                loading={pending}
                onClick={() => revokeOne(session.id)}
              >
                {t.settings.sessionRevoke}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {sessions.length > 1 ? (
        <Button
          variant="outline"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await revokeAllOtherSessions()
              if (!result.ok) {
                setMessage(resolveErrorMessage(t, result, fmt))
                return
              }
              setMessage(t.settings.sessionsRevoked)
              toast({ title: t.settings.sessionsRevoked, variant: 'success' })
              router.refresh()
            })
          }
        >
          {t.settings.sessionsRevokeAll}
        </Button>
      ) : null}
    </div>
  )
}

// --- data & deletion ---------------------------------------------------------

export function DataSettings() {
  const { t } = useI18n()

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t.settings.exportDataText}</p>
      {/* A plain link: the route streams the file with its own Content-Disposition,
          so there is nothing for JavaScript to do here. */}
      <a
        href="/api/account/export"
        download
        className="inline-flex min-h-[42px] items-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Download className="h-4 w-4" aria-hidden />
        {t.settings.exportDataButton}
      </a>
    </div>
  )
}

export function DeleteAccountSection() {
  const { t, fmt, locale } = useI18n()
  const router = useRouter()

  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const keyword = t.settings.deleteAccountKeyword
  const matches = confirm.trim().toLocaleUpperCase() === keyword.toLocaleUpperCase()

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.settings.deleteAccountText}</p>

      <div aria-live="polite">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
      </div>

      <Field
        label={t.settings.deleteAccountConfirm}
        htmlFor="delete-confirm"
        hint={keyword}
        error={confirm.length > 0 && !matches ? t.settings.deleteAccountMismatch : undefined}
      >
        <Input
          id="delete-confirm"
          value={confirm}
          autoComplete="off"
          onChange={(event) => setConfirm(event.target.value)}
          invalid={confirm.length > 0 && !matches}
        />
      </Field>

      <Button
        variant="destructive"
        disabled={!matches}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteAccount({ confirm })
            if (!result.ok) {
              setError(resolveErrorMessage(t, result, fmt))
              return
            }
            router.push(localePath(locale))
            router.refresh()
          })
        }
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {t.settings.deleteAccountButton}
      </Button>
    </div>
  )
}
