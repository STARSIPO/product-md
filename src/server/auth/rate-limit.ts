import 'server-only'
import { headers } from 'next/headers'
import { db } from '@/server/db'

/**
 * Sliding-window rate limiting.
 *
 * Two tiers, deliberately:
 *   - an in-process map absorbs bursts without touching the database
 *   - a RateLimitHit table makes the limit hold across serverless invocations and
 *     server restarts, which is where a purely in-memory limiter silently fails
 *
 * Swap point: `consume()` is the only function that touches storage. Pointing it at
 * Redis (INCR + EXPIRE) is a drop-in change and is the right move behind more than
 * one app instance — see docs/ARCHITECTURE.md.
 */

interface Window {
  count: number
  resetAt: number
}

const memory = new Map<string, Window>()

/** Keeps the in-process map from growing without bound on a long-lived server. */
function sweepMemory(now: number) {
  if (memory.size < 5000) return
  for (const [key, window] of memory) {
    if (window.resetAt <= now) memory.delete(key)
  }
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSeconds: number
}

export interface RateLimitOptions {
  /** Distinct bucket name, e.g. "login" or "message". */
  key: string
  limit: number
  windowSeconds: number
  /** Persist to the database as well — use for anything security-relevant. */
  durable?: boolean
}

export async function consume({
  key,
  limit,
  windowSeconds,
  durable = false,
}: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  sweepMemory(now)

  const existing = memory.get(key)
  const window: Window =
    existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs }

  window.count += 1
  memory.set(key, window)

  if (window.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    }
  }

  if (durable) {
    const since = new Date(now - windowMs)

    // Opportunistic cleanup keeps the table small without a dedicated job.
    await db.rateLimitHit.deleteMany({ where: { bucket: key, createdAt: { lt: since } } })
    const count = await db.rateLimitHit.count({ where: { bucket: key, createdAt: { gte: since } } })

    if (count >= limit) {
      return { ok: false, remaining: 0, retryAfterSeconds: windowSeconds }
    }

    await db.rateLimitHit.create({ data: { bucket: key } })
    return { ok: true, remaining: limit - count - 1, retryAfterSeconds: 0 }
  }

  return { ok: true, remaining: limit - window.count, retryAfterSeconds: 0 }
}

/** Best-effort client IP. Behind a proxy, trust only the left-most hop. */
export function clientIp(): string {
  const headerList = headers()
  const forwarded = headerList.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown'
  return headerList.get('x-real-ip') ?? 'unknown'
}

/**
 * Login throttling combines the account and the source address, so one attacker
 * cannot lock every account out by spraying, and one account cannot be brute-forced
 * from a botnet without also tripping the per-identifier limit.
 */
export async function checkLoginRateLimit(identifier: string): Promise<RateLimitResult> {
  const ip = clientIp()

  const byIdentifier = await consume({
    key: `login:id:${identifier.toLowerCase()}`,
    limit: 8,
    windowSeconds: 15 * 60,
    durable: true,
  })
  if (!byIdentifier.ok) return byIdentifier

  return consume({ key: `login:ip:${ip}`, limit: 30, windowSeconds: 15 * 60, durable: true })
}

export async function recordLoginAttempt(
  identifier: string,
  success: boolean,
): Promise<void> {
  await db.loginAttempt
    .create({
      data: { identifier: identifier.toLowerCase(), ip: clientIp(), success },
    })
    .catch(() => undefined)
}

/** OTP/email sends are expensive and abusable — tighter budget than login. */
export function checkOtpRateLimit(target: string): Promise<RateLimitResult> {
  return consume({
    key: `otp:${target.toLowerCase()}`,
    limit: 5,
    windowSeconds: 60 * 60,
    durable: true,
  })
}

export function checkMessageRateLimit(userId: string): Promise<RateLimitResult> {
  return consume({ key: `message:${userId}`, limit: 30, windowSeconds: 60 })
}

export function checkWriteRateLimit(userId: string, action: string): Promise<RateLimitResult> {
  return consume({ key: `write:${action}:${userId}`, limit: 40, windowSeconds: 60 })
}
