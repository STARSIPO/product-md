'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Alert, Button, Field, Input, Tabs } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { localePath, type Locale } from '@/lib/i18n/config'
import { loginSchema, phoneStartSchema, phoneVerifySchema } from '@/lib/validation'
import { loginWithEmail, startPhoneAuth, verifyPhoneAuth } from '@/server/actions/auth'
import type { ActionResult } from '@/server/actions/result'
import type { Dictionary } from '@/lib/i18n'

type LoginValues = z.input<typeof loginSchema>

/**
 * Translates an action result into a form message.
 *
 * Errors arrive as dictionary keys, never as sentences, so the same server code
 * produces the right language on both /ru and /ro. An unrecognised key degrades to the
 * generic message instead of rendering a raw identifier at the user.
 */
export function resolveErrorMessage(
  t: Dictionary,
  result: Extract<ActionResult<unknown>, { ok: false }>,
  fmt: (template: string, params?: Record<string, string | number>) => string,
): string {
  const errors = t.errors as Record<string, string | undefined>
  const validation = t.validation as Record<string, string | undefined>
  const template = errors[result.error] ?? validation[result.error] ?? t.errors.generic
  return fmt(template, result.params)
}

export function LoginForm({
  locale,
  next,
  phoneAuthEnabled,
}: {
  locale: Locale
  next?: string
  phoneAuthEnabled: boolean
}) {
  const { t, fmt } = useI18n()
  const [tab, setTab] = useState<'email' | 'phone'>('email')

  return (
    <div className="space-y-5">
      {phoneAuthEnabled ? (
        <Tabs
          label={t.auth.loginTitle}
          tabs={[
            { id: 'email', label: t.auth.byEmail },
            { id: 'phone', label: t.auth.byPhone },
          ]}
          active={tab}
          onChange={(id) => setTab(id as 'email' | 'phone')}
        />
      ) : null}

      {tab === 'email' ? (
        <EmailLogin locale={locale} next={next} />
      ) : (
        <PhoneLogin locale={locale} mode="login" />
      )}
    </div>
  )
}

function EmailLogin({ locale, next }: { locale: Locale; next?: string }) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', next },
  })

  function onSubmit(values: LoginValues) {
    setFormError(null)

    startTransition(async () => {
      const result = await loginWithEmail(values)

      if (!result.ok) {
        if (result.fields) {
          for (const [field, key] of Object.entries(result.fields)) {
            setError(field as keyof LoginValues, { message: key })
          }
        }
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }

      if (result.data.next === '2fa') {
        router.push(`${localePath(locale, 'login')}/2fa`)
        return
      }

      router.push(result.data.next || localePath(locale, 'dashboard'))
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError ? <Alert variant="destructive">{formError}</Alert> : null}

      <Field
        label={t.auth.email}
        htmlFor="email"
        error={errors.email ? translate(t, errors.email.message) : undefined}
      >
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t.auth.emailPlaceholder}
          invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </Field>

      <Field
        label={t.auth.password}
        htmlFor="password"
        error={errors.password ? translate(t, errors.password.message) : undefined}
      >
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </Field>

      <div className="flex justify-end">
        <Link
          href={`${localePath(locale, 'login')}/forgot`}
          className="rounded text-sm text-primary hover:text-primary-hover"
        >
          {t.auth.forgotPassword}
        </Link>
      </div>

      <Button type="submit" fullWidth loading={pending}>
        {t.common.signIn}
      </Button>
    </form>
  )
}

type PhoneStartValues = z.input<typeof phoneStartSchema>
type PhoneVerifyValues = z.input<typeof phoneVerifySchema>

export function PhoneLogin({ locale, mode }: { locale: Locale; mode: 'login' | 'register' }) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const startForm = useForm<PhoneStartValues>({
    resolver: zodResolver(phoneStartSchema),
    defaultValues: { phone: '', locale },
  })

  const verifyForm = useForm<PhoneVerifyValues>({
    resolver: zodResolver(phoneVerifySchema),
    defaultValues: { phone: '', code: '', name: '', acceptTerms: false },
  })

  function sendCode(values: PhoneStartValues) {
    setFormError(null)
    startTransition(async () => {
      const result = await startPhoneAuth(values)
      if (!result.ok) {
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }
      setSentTo(result.data.phone)
      verifyForm.setValue('phone', result.data.phone)
    })
  }

  function verify(values: PhoneVerifyValues) {
    setFormError(null)
    startTransition(async () => {
      const result = await verifyPhoneAuth(values)
      if (!result.ok) {
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }
      router.push(
        result.data.isNew ? localePath(locale, 'onboarding') : localePath(locale, 'dashboard'),
      )
      router.refresh()
    })
  }

  if (!sentTo) {
    return (
      <form onSubmit={startForm.handleSubmit(sendCode)} className="space-y-4" noValidate>
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}

        <Field
          label={t.auth.phone}
          htmlFor="phone"
          hint={t.auth.devSmsHint}
          error={
            startForm.formState.errors.phone
              ? translate(t, startForm.formState.errors.phone.message)
              : undefined
          }
        >
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t.auth.phonePlaceholder}
            invalid={Boolean(startForm.formState.errors.phone)}
            {...startForm.register('phone')}
          />
        </Field>

        <Button type="submit" fullWidth loading={pending}>
          {t.auth.sendCode}
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={verifyForm.handleSubmit(verify)} className="space-y-4" noValidate>
      {formError ? <Alert variant="destructive">{formError}</Alert> : null}

      <Alert variant="info">{fmt(t.auth.verifyPhoneText, { phone: sentTo })}</Alert>

      <Field
        label={t.auth.code}
        htmlFor="code"
        error={
          verifyForm.formState.errors.code
            ? translate(t, verifyForm.formState.errors.code.message)
            : undefined
        }
      >
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder={t.auth.codePlaceholder}
          invalid={Boolean(verifyForm.formState.errors.code)}
          {...verifyForm.register('code')}
        />
      </Field>

      {mode === 'register' ? (
        <Field
          label={t.auth.name}
          htmlFor="name"
          error={
            verifyForm.formState.errors.name
              ? translate(t, verifyForm.formState.errors.name.message)
              : undefined
          }
        >
          <Input
            id="name"
            autoComplete="name"
            placeholder={t.auth.namePlaceholder}
            {...verifyForm.register('name')}
          />
        </Field>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setSentTo(null)}>
          {t.common.back}
        </Button>
        <Button type="submit" fullWidth loading={pending}>
          {t.common.continue}
        </Button>
      </div>
    </form>
  )
}

/** Zod messages are dictionary keys; this resolves them, falling back to the raw key. */
export function translate(t: Dictionary, key: string | undefined): string | undefined {
  if (!key) return undefined
  const validation = t.validation as Record<string, string | undefined>
  const errors = t.errors as Record<string, string | undefined>
  return validation[key] ?? errors[key] ?? key
}
