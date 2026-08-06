'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { Alert, Button, Checkbox, Field, Input, Tabs } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { localePath, type Locale } from '@/lib/i18n/config'
import { registerSchema } from '@/lib/validation'
import { registerWithEmail } from '@/server/actions/auth'
import { PhoneLogin, resolveErrorMessage, translate } from '../login/login-form'

type RegisterValues = z.input<typeof registerSchema>

export function RegisterForm({
  locale,
  phoneAuthEnabled,
}: {
  locale: Locale
  phoneAuthEnabled: boolean
}) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'email' | 'phone'>('email')

  return (
    <div className="space-y-5">
      {phoneAuthEnabled ? (
        <Tabs
          label={t.auth.registerTitle}
          tabs={[
            { id: 'email', label: t.auth.byEmail },
            { id: 'phone', label: t.auth.byPhone },
          ]}
          active={tab}
          onChange={(id) => setTab(id as 'email' | 'phone')}
        />
      ) : null}

      {tab === 'email' ? <EmailRegister locale={locale} /> : <PhoneLogin locale={locale} mode="register" />}
    </div>
  )
}

function EmailRegister({ locale }: { locale: Locale }) {
  const { t, fmt } = useI18n()
  const [formError, setFormError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      passwordConfirm: '',
      acceptTerms: false,
      locale,
    },
  })

  function onSubmit(values: RegisterValues) {
    setFormError(null)

    startTransition(async () => {
      const result = await registerWithEmail(values)

      if (!result.ok) {
        if (result.fields) {
          for (const [field, key] of Object.entries(result.fields)) {
            setError(field as keyof RegisterValues, { message: key })
          }
        }
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }

      setSentTo(result.data.email)
    })
  }

  // Success state doubles as the "check your inbox" screen — no redirect, because the
  // account is not usable until the address is confirmed.
  if (sentTo) {
    return (
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
          <MailCheck className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="mt-4 text-base font-medium">{t.auth.verifyEmailTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {fmt(t.auth.verifyEmailText, { email: sentTo })}
        </p>
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-caption text-muted-foreground">
          {t.auth.devMailerHint}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError ? <Alert variant="destructive">{formError}</Alert> : null}

      <Field
        label={t.auth.name}
        htmlFor="name"
        required
        error={translate(t, errors.name?.message)}
      >
        <Input
          id="name"
          autoComplete="name"
          placeholder={t.auth.namePlaceholder}
          invalid={Boolean(errors.name)}
          {...register('name')}
        />
      </Field>

      <Field
        label={t.auth.email}
        htmlFor="email"
        required
        error={translate(t, errors.email?.message)}
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
        required
        hint={t.auth.passwordPlaceholder}
        error={translate(t, errors.password?.message)}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </Field>

      <Field
        label={t.auth.passwordConfirm}
        htmlFor="passwordConfirm"
        required
        error={translate(t, errors.passwordConfirm?.message)}
      >
        <Input
          id="passwordConfirm"
          type="password"
          autoComplete="new-password"
          invalid={Boolean(errors.passwordConfirm)}
          {...register('passwordConfirm')}
        />
      </Field>

      <div>
        <label className="flex min-h-[44px] items-start gap-2.5 text-sm">
          <Checkbox id="acceptTerms" className="mt-0.5" {...register('acceptTerms')} />
          <span className="text-muted-foreground">
            {t.auth.acceptTerms.split('{terms}')[0]}
            <Link
              href={localePath(locale, 'terms')}
              className="text-primary hover:text-primary-hover"
            >
              {t.auth.acceptTermsLink}
            </Link>
            {(t.auth.acceptTerms.split('{terms}')[1] ?? '').split('{privacy}')[0]}
            <Link
              href={localePath(locale, 'privacy')}
              className="text-primary hover:text-primary-hover"
            >
              {t.auth.acceptPrivacyLink}
            </Link>
          </span>
        </label>
        {errors.acceptTerms ? (
          <p role="alert" className="mt-1 text-caption text-destructive">
            {translate(t, errors.acceptTerms.message)}
          </p>
        ) : null}
      </div>

      <Button type="submit" fullWidth loading={pending}>
        {t.common.signUp}
      </Button>
    </form>
  )
}
