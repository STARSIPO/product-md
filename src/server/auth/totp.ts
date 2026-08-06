import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * TOTP (RFC 6238) for administrator two-factor authentication.
 *
 * Implemented directly against node:crypto rather than pulled from a dependency:
 * it is ~60 lines of well-specified arithmetic, and an auth primitive is exactly the
 * kind of code that should not arrive through a transitive supply chain.
 *
 * Compatible with Google Authenticator, 1Password, Aegis and Authy
 * (SHA-1, 6 digits, 30-second step — the parameters those clients assume).
 */

const DIGITS = 6
const PERIOD_SECONDS = 30
const ALGORITHM = 'sha1'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateTotpSecret(): string {
  const buffer = randomBytes(20) // 160 bits, the RFC 4226 recommendation
  return base32Encode(buffer)
}

function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }

  return output
}

function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return Buffer.from(bytes)
}

function hotp(secret: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8)
  // Counter is a 64-bit big-endian integer; JS bit ops are 32-bit, so split it.
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buffer.writeUInt32BE(counter >>> 0, 4)

  const digest = createHmac(ALGORITHM, secret).update(buffer).digest()

  // Dynamic truncation, RFC 4226 §5.4
  const offset = (digest[digest.length - 1] as number) & 0x0f
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff)

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

export function generateTotp(secretBase32: string, at: Date = new Date()): string {
  const counter = Math.floor(at.getTime() / 1000 / PERIOD_SECONDS)
  return hotp(base32Decode(secretBase32), counter)
}

/**
 * Verifies a code, tolerating one step of clock drift either way (±30 s).
 * Comparison is constant-time so a submitted code cannot be probed digit by digit.
 */
export function verifyTotp(secretBase32: string, code: string, window = 1): boolean {
  const cleaned = code.replace(/\D/g, '')
  if (cleaned.length !== DIGITS) return false

  const secret = base32Decode(secretBase32)
  if (secret.length === 0) return false

  const counter = Math.floor(Date.now() / 1000 / PERIOD_SECONDS)
  const submitted = Buffer.from(cleaned)

  let matched = false
  for (let drift = -window; drift <= window; drift += 1) {
    const candidate = Buffer.from(hotp(secret, counter + drift))
    // No early exit: every window is checked so timing does not reveal which matched.
    if (candidate.length === submitted.length && timingSafeEqual(candidate, submitted)) {
      matched = true
    }
  }

  return matched
}

/** otpauth:// URI that authenticator apps import, by QR or manual paste. */
export function buildOtpAuthUri(secretBase32: string, account: string, issuer = 'Product.md') {
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: ALGORITHM.toUpperCase(),
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  })
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params.toString()}`
}

/** Groups the secret into 4-character blocks for readable manual entry. */
export function formatSecretForDisplay(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, '$1 ').trim()
}
