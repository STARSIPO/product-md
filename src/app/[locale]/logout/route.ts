import { NextResponse, type NextRequest } from 'next/server'
import { destroySession } from '@/server/auth/session'
import { localePath } from '@/lib/i18n/config'
import { resolveLocale } from '@/lib/i18n'

/**
 * A route handler rather than a page so signing out never renders anything: the
 * session is revoked server-side and the browser is redirected in one hop.
 */
export async function GET(request: NextRequest, { params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  await destroySession()
  return NextResponse.redirect(new URL(localePath(locale), request.url))
}
