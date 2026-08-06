import 'server-only'
import { z } from 'zod'
import { AuthorizationError } from '@/server/auth/guards'
import { reportError } from '@/server/observability'
import type { Dictionary } from '@/lib/i18n'

/**
 * The contract every server action returns.
 *
 * Two rules drive this shape:
 *   1. The user must never see "Error 500", "Mutation failed" or a stack trace. An
 *      action returns an i18n *key* plus params; the client renders it through the
 *      dictionary, so the message is localized and human.
 *   2. Field errors travel separately from the form-level error, so React Hook Form
 *      can attach them to the right input instead of dumping a list at the top.
 */

export type FieldErrors = Record<string, string>

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: ErrorKey }
  | { ok: false; error: ErrorKey; params?: Record<string, string | number>; fields?: FieldErrors }

/** Keys under `errors.*` in the dictionary. */
export type ErrorKey = keyof Dictionary['errors'] | keyof Dictionary['validation']

export function ok(): ActionResult<void>
export function ok<T>(data: T): ActionResult<T>
export function ok<T>(data?: T): ActionResult<T | void> {
  return { ok: true, data: data as T }
}

export function fail(
  error: ErrorKey,
  options: { params?: Record<string, string | number>; fields?: FieldErrors } = {},
): ActionResult<never> {
  return { ok: false, error, params: options.params, fields: options.fields }
}

/** Flattens a Zod error into `{ fieldName: messageKey }`. */
export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (path && !fields[path]) fields[path] = issue.message
  }
  return fields
}

const AUTHORIZATION_MESSAGES = {
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  notFound: 'notFound',
  companyRequired: 'companyRequired',
} as const satisfies Record<AuthorizationError['code'], ErrorKey>

/**
 * Wraps an action body so no unexpected throw ever reaches the client as a raw error.
 *
 * Known failures (authorization, validation, our own DomainError) map to a specific
 * localized key. Anything else is reported to observability and returned as the
 * generic message — the details stay on the server where they belong.
 */
export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return fail(AUTHORIZATION_MESSAGES[error.code])
    }

    if (error instanceof DomainError) {
      return fail(error.key, { params: error.params })
    }

    if (error instanceof z.ZodError) {
      return fail('validation', { fields: fieldErrorsFromZod(error) })
    }

    // `redirect()` and `notFound()` work by throwing; let Next handle them.
    if (isNextControlFlow(error)) throw error

    reportError(error, { scope: 'server-action' })
    return fail('generic')
  }
}

function isNextControlFlow(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    /^(NEXT_REDIRECT|NEXT_NOT_FOUND|DYNAMIC_SERVER_USAGE)/.test(
      (error as { digest: string }).digest,
    )
  )
}

/**
 * A business-rule violation that the user is allowed to see — "you already sent an
 * offer for this request", "insufficient balance". Distinct from a bug.
 */
export class DomainError extends Error {
  constructor(
    public readonly key: ErrorKey,
    public readonly params?: Record<string, string | number>,
  ) {
    super(key)
    this.name = 'DomainError'
  }
}

/** Parses input with Zod inside an action, converting failure into a field-level result. */
export function parseInput<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw parsed.error
  }
  return parsed.data
}

/** Turns a FormData into a plain object, collapsing repeated keys into arrays. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const output: Record<string, unknown> = {}

  for (const [key, value] of formData.entries()) {
    const existing = output[key]
    if (existing === undefined) {
      output[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      output[key] = [existing, value]
    }
  }

  return output
}
