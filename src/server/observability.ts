import 'server-only'
import { env, isProduction } from '@/env'

/**
 * Error reporting and structured events.
 *
 * Everything goes to the console by default. That is deliberate: a reporter that
 * swallows events unless a paid service is configured is worse than no reporter,
 * because failures then disappear silently in exactly the environments nobody watches.
 * `deliver()` below is the single swap point for Sentry.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const
type LogLevel = keyof typeof LEVELS

const THRESHOLD = LEVELS[env.LOG_LEVEL]

/**
 * Secrets reach logs by accident, not by design: a context object is usually just the
 * request payload, and one day that payload has a password in it. Stripping by key name
 * costs nothing and means the accident is not permanent.
 */
const SECRET_KEY = /password|secret|token|authorization|cookie/i

const MAX_DEPTH = 4

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[depth-limit]'

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1))
  }

  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return { name: value.name, message: value.message }

  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SECRET_KEY.test(key) ? '[redacted]' : redactSecrets(item, depth + 1)
  }
  return result
}

/** JSON.stringify throws on circular structures; a log line must never break the caller. */
function serialize(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record)
  } catch {
    return JSON.stringify({ level: record.level, event: record.event, note: 'unserialisable' })
  }
}

/**
 * --- swap point -------------------------------------------------------------
 * SENTRY_DSN is validated in env.ts but nothing consumes it yet: @sentry/nextjs is not
 * a dependency. To wire it up, install the package, initialise it in instrumentation.ts,
 * and add `Sentry.captureException(error, { extra: context })` here for level 'error'.
 * Keep the console line — local development has no Sentry project.
 */
function deliver(level: LogLevel, record: Record<string, unknown>): void {
  if (LEVELS[level] < THRESHOLD) return

  const line = serialize(record)
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.info(line)
  }
}

function describe(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // A stack in production logs is noise in the terminal but the only thing that
      // makes a report actionable, so it stays.
      stack: error.stack,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
    }
  }
  return { name: 'NonError', message: String(error) }
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  deliver('error', {
    level: 'error',
    at: new Date().toISOString(),
    error: describe(error),
    context: context ? redactSecrets(context) : undefined,
    sentry: env.SENTRY_DSN ? 'configured-but-not-wired' : undefined,
  })
}

export function logEvent(name: string, data?: Record<string, unknown>): void {
  deliver('info', {
    level: 'info',
    at: new Date().toISOString(),
    event: name,
    data: data ? redactSecrets(data) : undefined,
  })
}

/** Verbose tracing that is off in production unless LOG_LEVEL is lowered explicitly. */
export function logDebug(name: string, data?: Record<string, unknown>): void {
  if (isProduction && env.LOG_LEVEL !== 'debug') return
  deliver('debug', {
    level: 'debug',
    at: new Date().toISOString(),
    event: name,
    data: data ? redactSecrets(data) : undefined,
  })
}
