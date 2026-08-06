import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { getCurrentUser } from '@/server/auth/session'
import { isEnabled } from '@/server/services/feature-flags'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui'
import { RegisterForm } from './register-form'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.auth.registerTitle, robots: { index: false, follow: false } }
}

export default async function RegisterPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await getCurrentUser()
  if (user) redirect(localePath(locale, 'dashboard'))

  const [registrationOpen, phoneAuthEnabled] = await Promise.all([
    isEnabled('REGISTRATION_OPEN'),
    isEnabled('PHONE_AUTH_ENABLED'),
  ])

  return (
    <AuthShell
      locale={locale}
      title={t.auth.registerTitle}
      subtitle={t.auth.registerSubtitle}
      footer={
        <p className="text-muted-foreground">
          {t.auth.hasAccount}{' '}
          <Link
            href={localePath(locale, 'login')}
            className="font-medium text-primary hover:text-primary-hover"
          >
            {t.common.signIn}
          </Link>
        </p>
      }
    >
      {registrationOpen ? (
        <RegisterForm locale={locale} phoneAuthEnabled={phoneAuthEnabled} />
      ) : (
        <Alert variant="warning" title={t.states.forbiddenTitle}>
          {t.states.forbiddenText}
        </Alert>
      )}
    </AuthShell>
  )
}
