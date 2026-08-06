import 'server-only'
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * `promisify` picks the 3-argument scrypt overload, which drops the tuning options we
 * rely on. The cast restores the 4-argument signature.
 */
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is memory-hard, ships with Node (no native build step that breaks on a
 * teammate's machine), and is a NIST/RFC-7914 recommended KDF. Parameters below cost
 * roughly 100 ms and 16 MB per hash — slow enough to make offline cracking painful,
 * fast enough for an interactive login.
 *
 * Stored format:  scrypt$N$r$p$<salt-b64url>$<hash-b64url>
 * The parameters live inside the string so they can be raised later without
 * invalidating existing hashes.
 */

const N = 16384
const R = 8
const P = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = (await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer

  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Accounts created through phone-only signup have no password yet.
  if (!stored) return false

  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts
  const n = Number(nRaw)
  const r = Number(rRaw)
  const p = Number(pRaw)

  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false
  if (!saltRaw || !hashRaw) return false

  const salt = Buffer.from(saltRaw, 'base64url')
  const expected = Buffer.from(hashRaw, 'base64url')

  try {
    const derived = (await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: 128 * 1024 * 1024,
    })) as Buffer

    // Constant-time: a length check first, because timingSafeEqual throws on mismatch.
    if (derived.length !== expected.length) return false
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/** Minimum policy enforced server-side; the Zod schema mirrors it for the client. */
export function isPasswordStrongEnough(password: string): boolean {
  return password.length >= 8 && /\p{L}/u.test(password) && /\d/.test(password)
}
