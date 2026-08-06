import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { env } from '@/env'

/**
 * Symmetric primitives derived from APP_SECRET.
 *
 * Each purpose gets its own sub-key via HKDF-style derivation, so a token signing key
 * can never be used to decrypt a TOTP secret even if one is somehow leaked.
 */
function deriveKey(purpose: string): Buffer {
  return createHash('sha256').update(`${env.APP_SECRET}:${purpose}`).digest()
}

const ENCRYPTION_KEY = deriveKey('encryption')

/** AES-256-GCM. Output: iv.ciphertext.tag, all base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64url'), encrypted.toString('base64url'), tag.toString('base64url')].join(
    '.',
  )
}

export function decryptSecret(payload: string): string | null {
  const parts = payload.split('.')
  if (parts.length !== 3) return null
  const [ivRaw, dataRaw, tagRaw] = parts
  if (!ivRaw || !dataRaw || !tagRaw) return null

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      ENCRYPTION_KEY,
      Buffer.from(ivRaw, 'base64url'),
    )
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataRaw, 'base64url')),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

/** Opaque, unguessable token for sessions, email links and signed URLs. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Tokens are stored hashed, never in plaintext.
 * A leaked database dump then yields no usable session or password-reset link.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(`${token}:${env.APP_SECRET}`).digest('base64url')
}

/** Numeric OTP for SMS. Uniform over the range — no modulo bias. */
export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits
  const limit = Math.floor(0xffffffff / max) * max
  let value: number
  do {
    value = randomBytes(4).readUInt32BE(0)
  } while (value >= limit)
  return String(value % max).padStart(digits, '0')
}

export function signPayload(payload: string, purpose = 'signature'): string {
  return createHmac('sha256', deriveKey(purpose)).update(payload).digest('base64url')
}

export function verifySignature(payload: string, signature: string, purpose = 'signature'): boolean {
  const expected = signPayload(payload, purpose)
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Constant-time comparison for user-supplied secrets (cron bearer, webhook keys). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
