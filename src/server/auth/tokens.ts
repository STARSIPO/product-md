import 'server-only'
import { db } from '@/server/db'
import { generateNumericCode, generateToken, hashToken } from '@/server/crypto'

/**
 * One-time tokens: email verification links, password resets, phone/email OTPs and
 * TOTP enrolment.
 *
 * Rules that hold for every type:
 *   - stored hashed, so the database never contains a usable link
 *   - single use — consumed atomically, replaying a link does nothing
 *   - issuing a new token of the same type invalidates the previous one
 *   - OTPs count attempts and burn out, so a 6-digit code cannot be brute-forced
 */

export type TokenType =
  | 'EMAIL_VERIFY'
  | 'PASSWORD_RESET'
  | 'PHONE_OTP'
  | 'EMAIL_OTP'
  | 'TOTP_ENROLL'

const TTL_MINUTES: Record<TokenType, number> = {
  EMAIL_VERIFY: 24 * 60,
  PASSWORD_RESET: 60,
  PHONE_OTP: 10,
  EMAIL_OTP: 10,
  TOTP_ENROLL: 15,
}

const MAX_OTP_ATTEMPTS = 5

/** Long random link token — returned in plaintext exactly once, to be emailed. */
export async function issueLinkToken(
  type: Extract<TokenType, 'EMAIL_VERIFY' | 'PASSWORD_RESET'>,
  target: string,
  userId: string | null,
): Promise<string> {
  const token = generateToken(32)

  await db.$transaction([
    db.verificationToken.updateMany({
      where: { target, type, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    db.verificationToken.create({
      data: {
        type,
        target,
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TTL_MINUTES[type] * 60_000),
      },
    }),
  ])

  return token
}

/** Short numeric code for SMS/email OTP. */
export async function issueOtp(
  type: Extract<TokenType, 'PHONE_OTP' | 'EMAIL_OTP'>,
  target: string,
  userId: string | null,
): Promise<string> {
  const code = generateNumericCode(6)

  await db.$transaction([
    db.verificationToken.updateMany({
      where: { target, type, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    db.verificationToken.create({
      data: {
        type,
        target,
        userId,
        tokenHash: hashToken(code),
        expiresAt: new Date(Date.now() + TTL_MINUTES[type] * 60_000),
      },
    }),
  ])

  return code
}

export type ConsumeResult =
  | { ok: true; userId: string | null; target: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'too_many_attempts' }

/**
 * Validates and burns a link token.
 * `updateMany ... where consumedAt: null` is the atomic step: two concurrent
 * requests with the same link cannot both succeed.
 */
export async function consumeLinkToken(type: TokenType, token: string): Promise<ConsumeResult> {
  const record = await db.verificationToken.findFirst({
    where: { type, tokenHash: hashToken(token), consumedAt: null },
  })

  if (!record) return { ok: false, reason: 'invalid' }
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' }

  const claimed = await db.verificationToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  })

  if (claimed.count === 0) return { ok: false, reason: 'invalid' }

  return { ok: true, userId: record.userId, target: record.target }
}

/**
 * Validates an OTP for a target. A wrong code increments the attempt counter; once it
 * passes MAX_OTP_ATTEMPTS the code is dead and a new one must be requested.
 */
export async function consumeOtp(
  type: Extract<TokenType, 'PHONE_OTP' | 'EMAIL_OTP'>,
  target: string,
  code: string,
): Promise<ConsumeResult> {
  const record = await db.verificationToken.findFirst({
    where: { type, target, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!record) return { ok: false, reason: 'invalid' }

  if (record.expiresAt.getTime() < Date.now()) {
    await db.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    })
    return { ok: false, reason: 'expired' }
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await db.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    })
    return { ok: false, reason: 'too_many_attempts' }
  }

  if (record.tokenHash !== hashToken(code)) {
    await db.verificationToken.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    })
    return { ok: false, reason: 'invalid' }
  }

  const claimed = await db.verificationToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  })

  if (claimed.count === 0) return { ok: false, reason: 'invalid' }

  return { ok: true, userId: record.userId, target: record.target }
}

export async function pruneExpiredTokens(): Promise<number> {
  const result = await db.verificationToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  })
  return result.count
}
