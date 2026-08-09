import 'server-only'
import { redirect, notFound } from 'next/navigation'
import { localePath, type Locale } from '@/lib/i18n/config'
import { getCurrentUser, type SessionUser } from './session'
import { db } from '@/server/db'

/**
 * Server-side authorization.
 *
 * Nothing trusts the client: a role, a company id or an "isOwner" flag arriving in a
 * form body is ignored. Every guard re-reads the session from the database and
 * re-checks ownership against the row being touched.
 *
 * There are two families:
 *   - require*  → for pages; redirects the visitor somewhere sensible
 *   - assert*   → for server actions; throws AuthorizationError, which the action
 *                 wrapper converts into a localized error instead of a stack trace
 */

export class AuthorizationError extends Error {
  constructor(
    public readonly code: 'unauthorized' | 'forbidden' | 'notFound' | 'companyRequired',
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'AuthorizationError'
  }
}

// --- page guards -------------------------------------------------------------

export async function requireUser(locale: Locale, returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) {
    const target = returnTo ? `?next=${encodeURIComponent(returnTo)}` : ''
    redirect(`${localePath(locale, 'login')}${target}`)
  }
  return user
}

/** A user who has finished onboarding and owns a company profile. */
export async function requireCompany(
  locale: Locale,
  returnTo?: string,
): Promise<SessionUser & { companyId: string }> {
  const user = await requireUser(locale, returnTo)
  if (!user.companyId) {
    redirect(localePath(locale, 'onboarding'))
  }
  return user as SessionUser & { companyId: string }
}

export async function requireSeller(
  locale: Locale,
  returnTo?: string,
): Promise<SessionUser & { companyId: string }> {
  const user = await requireCompany(locale, returnTo)
  if (!user.isSeller) {
    redirect(localePath(locale, 'dashboard', 'settings'))
  }
  return user
}

export async function requireBuyer(
  locale: Locale,
  returnTo?: string,
): Promise<SessionUser & { companyId: string }> {
  const user = await requireCompany(locale, returnTo)
  if (!user.isBuyer) {
    redirect(localePath(locale, 'dashboard', 'settings'))
  }
  return user
}

export async function requireModerator(locale: Locale): Promise<SessionUser> {
  const user = await requireUser(locale)
  if (user.role !== 'MODERATOR' && user.role !== 'ADMIN') notFound()
  return user
}

/**
 * Admin pages additionally require an active TOTP enrolment. An admin without 2FA is
 * sent to set it up rather than silently granted access.
 *
 * The requirement is behind REQUIRE_ADMIN_2FA so the owner can run a demo without
 * enrolling an authenticator. Turning it off is a visible, audited action in the admin
 * panel — not something a deploy can do by accident.
 */
export async function requireAdmin(locale: Locale): Promise<SessionUser> {
  const user = await requireUser(locale)
  if (user.role !== 'ADMIN') notFound()

  if (!user.twoFactorEnabled) {
    const { isEnabled } = await import('@/server/services/feature-flags')
    if (await isEnabled('REQUIRE_ADMIN_2FA')) {
      // Enrolment lives under the dashboard shell — `/[locale]/settings` is not a route,
      // so sending an admin there 404s them out of the panel instead of onto the form.
      redirect(`${localePath(locale, 'dashboard', 'settings')}?setup2fa=1`)
    }
  }

  return user
}

// --- server action guards ----------------------------------------------------

export async function assertUser(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) throw new AuthorizationError('unauthorized')
  return user
}

export async function assertCompany(): Promise<SessionUser & { companyId: string }> {
  const user = await assertUser()
  if (!user.companyId) throw new AuthorizationError('companyRequired')
  if (user.companyStatus === 'BLOCKED') throw new AuthorizationError('forbidden')
  return user as SessionUser & { companyId: string }
}

export async function assertSeller(): Promise<SessionUser & { companyId: string }> {
  const user = await assertCompany()
  if (!user.isSeller) throw new AuthorizationError('forbidden')
  return user
}

export async function assertBuyer(): Promise<SessionUser & { companyId: string }> {
  const user = await assertCompany()
  if (!user.isBuyer) throw new AuthorizationError('forbidden')
  return user
}

export async function assertModerator(): Promise<SessionUser> {
  const user = await assertUser()
  if (user.role !== 'MODERATOR' && user.role !== 'ADMIN') {
    throw new AuthorizationError('forbidden')
  }
  return user
}

export async function assertAdmin(): Promise<SessionUser> {
  const user = await assertUser()
  if (user.role !== 'ADMIN') throw new AuthorizationError('forbidden')
  return user
}

// --- ownership checks --------------------------------------------------------

/**
 * Confirms the caller's company owns a product. Moderators and admins bypass the
 * ownership test but still have to be authenticated.
 */
export async function assertOwnsProduct(productId: string): Promise<{
  user: SessionUser
  companyId: string
}> {
  const user = await assertUser()

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { companyId: true, deletedAt: true },
  })

  if (!product || product.deletedAt) throw new AuthorizationError('notFound')

  const isStaff = user.role === 'ADMIN' || user.role === 'MODERATOR'
  if (!isStaff && product.companyId !== user.companyId) {
    throw new AuthorizationError('forbidden')
  }

  return { user, companyId: product.companyId }
}

export async function assertOwnsRequest(requestId: string): Promise<{
  user: SessionUser
  companyId: string
}> {
  const user = await assertUser()

  const request = await db.purchaseRequest.findUnique({
    where: { id: requestId },
    select: { companyId: true, deletedAt: true },
  })

  if (!request || request.deletedAt) throw new AuthorizationError('notFound')

  const isStaff = user.role === 'ADMIN' || user.role === 'MODERATOR'
  if (!isStaff && request.companyId !== user.companyId) {
    throw new AuthorizationError('forbidden')
  }

  return { user, companyId: request.companyId }
}

/** Either side of a deal may act on it; nobody else may even read it. */
export async function assertDealParticipant(dealId: string): Promise<{
  user: SessionUser
  side: 'buyer' | 'seller'
  companyId: string
}> {
  const user = await assertCompany()

  const deal = await db.deal.findUnique({
    where: { id: dealId },
    select: { buyerCompanyId: true, sellerCompanyId: true },
  })

  if (!deal) throw new AuthorizationError('notFound')

  if (deal.buyerCompanyId === user.companyId) {
    return { user, side: 'buyer', companyId: user.companyId }
  }
  if (deal.sellerCompanyId === user.companyId) {
    return { user, side: 'seller', companyId: user.companyId }
  }

  throw new AuthorizationError('forbidden')
}

export async function assertConversationParticipant(conversationId: string): Promise<SessionUser> {
  const user = await assertUser()

  const participant = await db.conversationParticipant.findFirst({
    where: { conversationId, userId: user.id },
    select: { id: true },
  })

  if (!participant) throw new AuthorizationError('forbidden')
  return user
}
