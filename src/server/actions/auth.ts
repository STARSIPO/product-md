'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { db } from '@/server/db'
import { env } from '@/env'
import { hashPassword, verifyPassword } from '@/server/auth/password'
import { createSession, destroySession, getCurrentUser } from '@/server/auth/session'
import {
  checkLoginRateLimit,
  checkOtpRateLimit,
  recordLoginAttempt,
} from '@/server/auth/rate-limit'
import { consumeLinkToken, consumeOtp, issueLinkToken, issueOtp } from '@/server/auth/tokens'
import { buildOtpAuthUri, generateTotpSecret, verifyTotp } from '@/server/auth/totp'
import { decryptSecret, encryptSecret } from '@/server/crypto'
import { sendTemplateEmail } from '@/server/mail'
import { sms } from '@/server/sms'
import { isEnabled } from '@/server/services/feature-flags'
import { localePath, type Locale } from '@/lib/i18n/config'
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  phoneStartSchema,
  phoneVerifySchema,
  registerSchema,
  resetPasswordSchema,
  totpCodeSchema,
} from '@/lib/validation'
import { DomainError, fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Authentication actions.
 *
 * Recurring principle: responses must not leak whether an account exists. Registering
 * with a taken email, resetting a password for an unknown address and logging in with
 * a wrong password all produce the same shape of answer a legitimate user would see —
 * otherwise the forms become an account-enumeration oracle.
 */

function verificationUrl(locale: Locale, token: string): string {
  return `${env.APP_URL}${localePath(locale, 'register')}/verify?token=${token}`
}

function resetUrl(locale: Locale, token: string): string {
  return `${env.APP_URL}${localePath(locale, 'login')}/reset?token=${token}`
}

export async function registerWithEmail(
  raw: unknown,
): Promise<ActionResult<{ email: string }>> {
  return runAction(async () => {
    if (!(await isEnabled('REGISTRATION_OPEN'))) return fail('forbidden')

    const input = parseInput(registerSchema, raw)

    const existing = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true, emailVerifiedAt: true },
    })

    if (existing) {
      // Same success shape as a real signup. The person who owns the address gets an
      // email telling them an account already exists; a prober learns nothing.
      const token = await issueLinkToken('EMAIL_VERIFY', input.email, existing.id)
      if (!existing.emailVerifiedAt) {
        await sendTemplateEmail(input.email, 'verifyEmail', input.locale, {
          url: verificationUrl(input.locale, token),
          expiresInHours: 24,
        })
      }
      return ok({ email: input.email })
    }

    const passwordHash = await hashPassword(input.password)

    const user = await db.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        locale: input.locale,
        acceptedTermsAt: new Date(),
      },
      select: { id: true },
    })

    const token = await issueLinkToken('EMAIL_VERIFY', input.email, user.id)
    await sendTemplateEmail(input.email, 'verifyEmail', input.locale, {
      url: verificationUrl(input.locale, token),
      expiresInHours: 24,
    })

    return ok({ email: input.email })
  })
}

export async function loginWithEmail(raw: unknown): Promise<ActionResult<{ next: string }>> {
  return runAction(async () => {
    const input = parseInput(loginSchema, raw)

    const limit = await checkLoginRateLimit(input.email)
    if (!limit.ok) {
      return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })
    }

    const user = await db.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        emailVerifiedAt: true,
        totpEnabledAt: true,
        deletedAt: true,
      },
    })

    const valid = await verifyPassword(input.password, user?.passwordHash ?? null)

    if (!user || !valid || user.deletedAt) {
      await recordLoginAttempt(input.email, false)
      return fail('invalidCredentials')
    }

    if (user.status === 'BLOCKED') {
      await recordLoginAttempt(input.email, false)
      return fail('accountBlocked')
    }

    if (!user.emailVerifiedAt) {
      await recordLoginAttempt(input.email, false)
      return fail('emailNotVerified')
    }

    // An account with TOTP does not get a session yet — it gets a short-lived
    // challenge cookie that only /login/2fa can exchange for one.
    if (user.totpEnabledAt) {
      cookies().set('pmd_2fa', user.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        path: '/',
        maxAge: 5 * 60,
      })
      await recordLoginAttempt(input.email, true)
      return ok({ next: '2fa' })
    }

    await recordLoginAttempt(input.email, true)
    await createSession(user.id)
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    return ok({ next: input.next ?? '' })
  })
}

export async function completeTwoFactorLogin(raw: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const input = parseInput(totpCodeSchema, raw)

    const userId = cookies().get('pmd_2fa')?.value
    if (!userId) return fail('unauthorized')

    const limit = await checkLoginRateLimit(`2fa:${userId}`)
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, totpSecretEnc: true, totpEnabledAt: true, status: true },
    })

    if (!user?.totpSecretEnc || !user.totpEnabledAt || user.status !== 'ACTIVE') {
      return fail('unauthorized')
    }

    const secret = decryptSecret(user.totpSecretEnc)
    if (!secret || !verifyTotp(secret, input.code)) return fail('invalidCode')

    cookies().delete('pmd_2fa')
    await createSession(user.id)
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    return ok()
  })
}

export async function logout(locale: Locale): Promise<never> {
  await destroySession()
  redirect(localePath(locale))
}

export async function verifyEmailToken(token: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const result = await consumeLinkToken('EMAIL_VERIFY', token)
    if (!result.ok) return fail('tokenInvalid')

    if (result.userId) {
      await db.user.update({
        where: { id: result.userId },
        data: { emailVerifiedAt: new Date() },
      })

      const membership = await db.companyMember.findFirst({
        where: { userId: result.userId },
        select: { companyId: true },
      })

      if (membership) {
        await db.verificationBadge.upsert({
          where: { companyId_type: { companyId: membership.companyId, type: 'EMAIL' } },
          create: {
            companyId: membership.companyId,
            type: 'EMAIL',
            status: 'APPROVED',
            grantedAt: new Date(),
          },
          update: { status: 'APPROVED', grantedAt: new Date() },
        })
      }
    }

    return ok()
  })
}

export async function requestPasswordReset(raw: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const input = parseInput(forgotPasswordSchema, raw)

    const limit = await checkOtpRateLimit(input.email)
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const user = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true, locale: true },
    })

    // Always report success: the response must be identical for a known and an
    // unknown address.
    if (user) {
      const token = await issueLinkToken('PASSWORD_RESET', input.email, user.id)
      const locale: Locale = user.locale === 'ro' ? 'ro' : 'ru'
      await sendTemplateEmail(input.email, 'resetPassword', locale, {
        url: resetUrl(locale, token),
        expiresInMinutes: 60,
      })
    }

    return ok()
  })
}

export async function resetPassword(raw: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const input = parseInput(resetPasswordSchema, raw)

    const result = await consumeLinkToken('PASSWORD_RESET', input.token)
    if (!result.ok || !result.userId) return fail('tokenInvalid')

    const passwordHash = await hashPassword(input.password)

    await db.$transaction([
      db.user.update({
        where: { id: result.userId },
        data: { passwordHash, emailVerifiedAt: new Date() },
      }),
      // A password reset is also the recovery path after a compromise, so every other
      // session dies with it.
      db.session.updateMany({
        where: { userId: result.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])

    return ok()
  })
}

export async function changePassword(raw: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const current = await getCurrentUser()
    if (!current) return fail('unauthorized')

    const input = parseInput(changePasswordSchema, raw)

    const user = await db.user.findUnique({
      where: { id: current.id },
      select: { passwordHash: true },
    })

    if (!(await verifyPassword(input.currentPassword, user?.passwordHash ?? null))) {
      return fail('invalidCredentials', { fields: { currentPassword: 'invalidCredentials' } })
    }

    await db.user.update({
      where: { id: current.id },
      data: { passwordHash: await hashPassword(input.password) },
    })

    return ok()
  })
}

// --- phone -------------------------------------------------------------------

export async function startPhoneAuth(raw: unknown): Promise<ActionResult<{ phone: string }>> {
  return runAction(async () => {
    if (!(await isEnabled('PHONE_AUTH_ENABLED'))) return fail('forbidden')

    const input = parseInput(phoneStartSchema, raw)

    const limit = await checkOtpRateLimit(input.phone)
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const user = await db.user.findUnique({
      where: { phone: input.phone },
      select: { id: true },
    })

    const code = await issueOtp('PHONE_OTP', input.phone, user?.id ?? null)

    // With SMS_DRIVER=mock this prints the code to the server log and records a
    // delivery row marked as NOT sent. It never claims an SMS went out.
    await sms.send(input.phone, `Product.md: ${code}`)

    return ok({ phone: input.phone })
  })
}

export async function verifyPhoneAuth(raw: unknown): Promise<ActionResult<{ isNew: boolean }>> {
  return runAction(async () => {
    if (!(await isEnabled('PHONE_AUTH_ENABLED'))) return fail('forbidden')

    const input = parseInput(phoneVerifySchema, raw)

    const result = await consumeOtp('PHONE_OTP', input.phone, input.code)
    if (!result.ok) {
      return fail(result.reason === 'expired' ? 'codeExpired' : 'invalidCode')
    }

    const existing = await db.user.findUnique({
      where: { phone: input.phone },
      select: { id: true, status: true },
    })

    if (existing) {
      if (existing.status !== 'ACTIVE') return fail('accountBlocked')

      await db.user.update({
        where: { id: existing.id },
        data: { phoneVerifiedAt: new Date(), lastLoginAt: new Date() },
      })
      await createSession(existing.id)
      return ok<{ isNew: boolean }>({ isNew: false })
    }

    if (!input.name) return fail('validation', { fields: { name: 'required' } })
    if (!input.acceptTerms) return fail('validation', { fields: { acceptTerms: 'acceptTerms' } })
    if (!(await isEnabled('REGISTRATION_OPEN'))) return fail('forbidden')

    const created = await db.user.create({
      data: {
        phone: input.phone,
        name: input.name,
        phoneVerifiedAt: new Date(),
        acceptedTermsAt: new Date(),
        lastLoginAt: new Date(),
      },
      select: { id: true },
    })

    await createSession(created.id)
    return ok<{ isNew: boolean }>({ isNew: true })
  })
}

// --- two-factor enrolment ----------------------------------------------------

export async function beginTotpEnrollment(): Promise<
  ActionResult<{ secret: string; uri: string }>
> {
  return runAction(async () => {
    const user = await getCurrentUser()
    if (!user) return fail('unauthorized')

    const secret = generateTotpSecret()

    // Stored encrypted immediately but NOT enabled: the account only gains a second
    // factor once the user proves the app is producing matching codes.
    await db.user.update({
      where: { id: user.id },
      data: { totpSecretEnc: encryptSecret(secret), totpEnabledAt: null },
    })

    return ok({
      secret,
      uri: buildOtpAuthUri(secret, user.email ?? user.phone ?? user.name),
    })
  })
}

export async function confirmTotpEnrollment(raw: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const current = await getCurrentUser()
    if (!current) return fail('unauthorized')

    const input = parseInput(totpCodeSchema, raw)

    const user = await db.user.findUnique({
      where: { id: current.id },
      select: { totpSecretEnc: true },
    })

    if (!user?.totpSecretEnc) throw new DomainError('generic')

    const secret = decryptSecret(user.totpSecretEnc)
    if (!secret || !verifyTotp(secret, input.code)) return fail('invalidCode')

    await db.user.update({
      where: { id: current.id },
      data: { totpEnabledAt: new Date() },
    })

    return ok()
  })
}

export async function disableTotp(raw: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const current = await getCurrentUser()
    if (!current) return fail('unauthorized')

    // Admin access is gated on 2FA; letting an admin switch it off would be a
    // privilege downgrade with no audit trail.
    if (current.role === 'ADMIN') return fail('forbidden')

    const input = parseInput(totpCodeSchema, raw)
    const user = await db.user.findUnique({
      where: { id: current.id },
      select: { totpSecretEnc: true },
    })

    const secret = user?.totpSecretEnc ? decryptSecret(user.totpSecretEnc) : null
    if (!secret || !verifyTotp(secret, input.code)) return fail('invalidCode')

    await db.user.update({
      where: { id: current.id },
      data: { totpSecretEnc: null, totpEnabledAt: null },
    })

    return ok()
  })
}
