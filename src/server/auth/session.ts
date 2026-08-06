import 'server-only'
import { cookies, headers } from 'next/headers'
import { cache as reactCache } from 'react'
import { env, isProduction } from '@/env'
import { db } from '@/server/db'
import { generateToken, hashToken } from '@/server/crypto'
import type { UserRole } from '@/lib/constants'

/**
 * Database-backed sessions.
 *
 * The cookie holds a random opaque token; only its SHA-256 hash is stored. That makes
 * sessions revocable server-side (log out everywhere, block a user mid-session, kill a
 * stolen device) — something a self-contained signed JWT cannot do without a
 * blocklist that ends up being a session table anyway.
 */

export const SESSION_COOKIE = 'pmd_session'

/**
 * React's `cache` is only exported under the `react-server` condition. Importing this
 * module from Vitest — where that condition does not apply — yields undefined, which
 * would make the whole auth layer untestable. Outside a request the identity fallback
 * is correct anyway: there is no request to deduplicate against.
 */
const perRequest: typeof reactCache =
  typeof reactCache === 'function' ? reactCache : (<T extends (...args: never[]) => unknown>(fn: T) => fn) as typeof reactCache

export interface SessionUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: UserRole
  locale: string
  emailVerified: boolean
  phoneVerified: boolean
  onboarded: boolean
  twoFactorEnabled: boolean
  companyId: string | null
  companySlug: string | null
  companyName: string | null
  isBuyer: boolean
  isSeller: boolean
  companyStatus: string | null
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    maxAge: maxAgeSeconds,
  }
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken(32)
  const ttlMs = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

  const headerList = headers()
  const forwardedFor = headerList.get('x-forwarded-for')

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: headerList.get('user-agent')?.slice(0, 255) ?? null,
      ip: forwardedFor?.split(',')[0]?.trim().slice(0, 64) ?? null,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  })

  cookies().set(SESSION_COOKIE, token, cookieOptions(env.SESSION_TTL_DAYS * 24 * 60 * 60))
  return token
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (token) {
    await db.session
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined)
  }
  cookies().delete(SESSION_COOKIE)
}

/** Revokes every session except the one making the request. */
export async function revokeOtherSessions(userId: string): Promise<number> {
  const token = cookies().get(SESSION_COOKIE)?.value
  const result = await db.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(token ? { NOT: { tokenHash: hashToken(token) } } : {}),
    },
    data: { revokedAt: new Date() },
  })
  return result.count
}

/**
 * Resolves the current user, or null.
 *
 * `cache()` dedupes this per request: a layout, a page and three server components
 * can all call getCurrentUser() and only one query runs.
 */
export const getCurrentUser = perRequest(async (): Promise<SessionUser | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          companies: {
            include: { company: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      },
    },
  })

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null

  const user = session.user
  if (user.status !== 'ACTIVE' || user.deletedAt) return null

  const membership = user.companies[0]
  const company = membership?.company ?? null

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role as UserRole,
    locale: user.locale,
    emailVerified: user.emailVerifiedAt !== null,
    phoneVerified: user.phoneVerifiedAt !== null,
    onboarded: user.onboardedAt !== null,
    twoFactorEnabled: user.totpEnabledAt !== null,
    companyId: company?.id ?? null,
    companySlug: company?.slug ?? null,
    companyName: company?.displayName ?? null,
    isBuyer: company?.isBuyer ?? false,
    isSeller: company?.isSeller ?? false,
    companyStatus: company?.status ?? null,
  }
})

/** Housekeeping — called by the daily cron job. */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await db.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      ],
    },
  })
  return result.count
}
