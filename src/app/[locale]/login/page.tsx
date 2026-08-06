import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { getCurrentUser } from '@/server/auth/session'
import { isEnabled } from '@/server/services/feature-flags'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from './login-form'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.auth.loginTitle, robots: { index: false, follow: false } }
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { next?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)

  const user = await getCurrentUser()
  if (user) redirect(localePath(locale, 'dashboard'))

  const phoneAuthEnabled = await isEnabled('PHONE_AUTH_ENABLED')

  return (
    <AuthShell
      locale={locale}
      title={t.auth.loginTitle}
      subtitle={t.auth.loginSubtitle}
      footer={
        <p className="text-muted-foreground">
          {t.auth.noAccount}{' '}
          <Link
            href={localePath(locale, 'register')}
            className="font-medium text-primary hover:text-primary-hover"
          >
            {t.common.signUp}
          </Link>
        </p>
      }
    >
      <LoginForm
        locale={locale}
        next={searchParams.next}
        phoneAuthEnabled={phoneAuthEnabled}
      />
    </AuthShell>
  )
}
