'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { env } from '@/env'
import { localePath, type Locale } from '@/lib/i18n/config'
import { assertAdmin } from '@/server/auth/guards'
import { issueLinkToken } from '@/server/auth/tokens'
import { db, transaction, type Tx } from '@/server/db'
import { generateToken } from '@/server/crypto'
import { appendEntry } from '@/server/services/ledger'
import { resumeListingsAfterTopUp } from '@/server/services/billing'
import { setFlag } from '@/server/services/feature-flags'
import {
  invalidateCategoryIndex,
  suggestCategories,
  type CategorySuggestion,
} from '@/server/services/categories'
import { diff, recordAudit, requestIp } from '@/server/services/audit'
import { normalize } from '@/lib/normalize'
import { parseAmountToBani } from '@/lib/money'
import { localeSchema, idSchema, featureFlagSchema, tariffSchema } from '@/lib/validation'
import {
  COMPANY_STATUSES,
  DEAL_STATUSES,
  FEATURE_FLAGS,
  PRODUCT_STATUSES,
  REQUEST_STATUSES,
  UNITS,
  USER_ROLES,
  VERIFICATION_TYPES,
  type FeatureFlagKey,
} from '@/lib/constants'
import { DomainError, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Administrative mutations.
 *
 * Three rules hold for every action in this file, without exception:
 *
 *   1. `assertAdmin()` first. The role is re-read from the session row on the server;
 *      nothing that arrives in the payload influences authorization.
 *   2. `recordAudit(...)` last. An admin change that leaves no trace is indistinguishable
 *      from a compromise, so the audit row is part of the action, not an afterthought.
 *   3. Money moves only through the ledger. `Company.balanceBani` is a cache of the
 *      newest entry — this file never writes it, `appendEntry()` does, inside the
 *      transaction that appends the row.
 */

const flag = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true' || value === 'on')

const reasonSchema = z.string().trim().min(1, 'required').max(1000, 'maxLength')
const optionalReasonSchema = z
  .string()
  .trim()
  .max(1000, 'maxLength')
  .optional()
  .transform((value) => (value === '' ? undefined : value))

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'required')
  .max(80, 'maxLength')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'url')

const shortText = (max: number) => z.string().trim().min(1, 'required').max(max, 'maxLength')

/**
 * A number typed into a form arrives as a string; `z.coerce.number()` alone would type
 * the action's input as `number` and force every caller to convert first, which is how a
 * NaN reaches the schema instead of a validation message.
 */
const boundedInt = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => (typeof value === 'number' ? value : value.trim()))
    .pipe(z.coerce.number().int().min(min, 'min').max(max, 'max'))

/**
 * `<input type="date">` gives YYYY-MM-DD. An expiry is inclusive, so it lands at the end
 * of the chosen day rather than at midnight — a badge valid "до 31 декабря" that stops
 * working on the morning of the 31st is a support ticket.
 */
const optionalFutureDay = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((value) => (typeof value === 'string' ? value.trim() : ''))
  .transform((value, ctx) => {
    if (value === '') return undefined
    const date = new Date(`${value}T23:59:59`)
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dateFuture' })
      return z.NEVER
    }
    return date
  })

function revalidateAdmin(...segments: string[]): void {
  revalidatePath('/[locale]/admin', 'page')
  for (const segment of segments) {
    revalidatePath(`/[locale]/admin/${segment}`, 'page')
  }
}

// --- users -------------------------------------------------------------------

const userRoleSchema = z.object({
  userId: idSchema,
  role: z.enum(USER_ROLES),
})

export type UserRoleInput = z.input<typeof userRoleSchema>

export async function setUserRoleAction(input: UserRoleInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(userRoleSchema, input)

    // Losing the last admin to a mis-click is an outage, not an edge case.
    if (parsed.userId === actor.id && parsed.role !== 'ADMIN') {
      throw new DomainError('forbidden')
    }

    const user = await db.user.findUnique({
      where: { id: parsed.userId },
      select: { id: true, role: true },
    })
    if (!user) throw new DomainError('notFound')

    await db.user.update({ where: { id: user.id }, data: { role: parsed.role } })

    const changes = diff({ role: user.role }, { role: parsed.role })
    await recordAudit({
      actorId: actor.id,
      action: 'admin.user.role',
      entityType: 'USER',
      entityId: user.id,
      oldValue: changes.before,
      newValue: changes.after,
      ip: requestIp(),
    })

    revalidateAdmin('users')
    return ok()
  })
}

const userBlockSchema = z
  .object({
    userId: idSchema,
    blocked: flag,
    reason: optionalReasonSchema,
  })
  .refine((data) => !data.blocked || (data.reason ?? '').length > 0, {
    message: 'required',
    path: ['reason'],
  })

export type UserBlockInput = z.input<typeof userBlockSchema>

export async function setUserBlockedAction(input: UserBlockInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(userBlockSchema, input)

    if (parsed.userId === actor.id) throw new DomainError('forbidden')

    const user = await db.user.findUnique({
      where: { id: parsed.userId },
      select: { id: true, status: true, blockReason: true },
    })
    if (!user) throw new DomainError('notFound')

    const status = parsed.blocked ? 'BLOCKED' : 'ACTIVE'

    await transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          status,
          blockedAt: parsed.blocked ? new Date() : null,
          blockReason: parsed.blocked ? (parsed.reason ?? null) : null,
        },
      })

      // A blocked account must stop working now, not when its cookie expires.
      if (parsed.blocked) {
        await tx.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      }
    })

    await recordAudit({
      actorId: actor.id,
      action: parsed.blocked ? 'admin.user.block' : 'admin.user.unblock',
      entityType: 'USER',
      entityId: user.id,
      oldValue: { status: user.status, blockReason: user.blockReason },
      newValue: { status, blockReason: parsed.reason ?? null },
      reason: parsed.reason ?? null,
      ip: requestIp(),
    })

    revalidateAdmin('users')
    return ok()
  })
}

/**
 * Ends every session the user has open.
 *
 * Blocking already does this; this is the milder tool for "their laptop was stolen" or
 * "they left the company but keep the account". Refused on the acting admin's own row:
 * it would work, and the operator would be signed out mid-task wondering what broke.
 */
const revokeSessionsSchema = z.object({
  userId: idSchema,
  reason: reasonSchema,
})

export type RevokeSessionsInput = z.input<typeof revokeSessionsSchema>

export async function revokeUserSessionsAction(
  input: RevokeSessionsInput,
): Promise<ActionResult<number>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(revokeSessionsSchema, input)

    if (parsed.userId === actor.id) throw new DomainError('forbidden')

    const user = await db.user.findUnique({ where: { id: parsed.userId }, select: { id: true } })
    if (!user) throw new DomainError('notFound')

    const result = await db.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.user.sessions.revoke',
      entityType: 'USER',
      entityId: user.id,
      newValue: { revokedSessions: result.count },
      reason: parsed.reason,
      ip: requestIp(),
    })

    revalidateAdmin('users', 'users/[id]')
    return ok(result.count)
  })
}

/**
 * Forced password reset.
 *
 * The admin never sees or sets a password: `issueLinkToken` mints a single-use link,
 * invalidating any previous one, and the operator hands it over out of band. The token
 * is returned to the caller exactly once and is deliberately *not* written into the
 * audit row — the log records that a reset was issued, never the credential itself.
 */
export async function resetUserPasswordAction(
  userId: string,
): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const id = parseInput(idSchema, userId)

    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, locale: true },
    })
    if (!user) throw new DomainError('notFound')

    // A phone-only account has nothing to key the token on; it recovers through the OTP
    // flow instead.
    if (!user.email) throw new DomainError('conflict')

    const token = await issueLinkToken('PASSWORD_RESET', user.email, user.id)
    const locale: Locale = user.locale === 'ro' ? 'ro' : 'ru'
    const url = `${env.APP_URL}${localePath(locale, 'login')}/reset?token=${token}`

    await recordAudit({
      actorId: actor.id,
      action: 'admin.user.password.reset',
      entityType: 'USER',
      entityId: user.id,
      newValue: { channel: 'EMAIL', target: user.email },
      ip: requestIp(),
    })

    revalidateAdmin('users', 'users/[id]')
    return ok({ url })
  })
}

const verifyContactSchema = z.object({
  userId: idSchema,
  channel: z.enum(['EMAIL', 'PHONE']),
})

export type VerifyContactInput = z.input<typeof verifyContactSchema>

/**
 * Manual contact confirmation — for the supplier who cannot receive our mail, or the
 * number that never gets the SMS. It only marks the contact as verified; it never
 * changes the address itself, so this cannot be used to move an account.
 */
export async function verifyUserContactAction(
  input: VerifyContactInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(verifyContactSchema, input)

    const user = await db.user.findUnique({
      where: { id: parsed.userId },
      select: {
        id: true,
        email: true,
        phone: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
      },
    })
    if (!user) throw new DomainError('notFound')

    const isEmail = parsed.channel === 'EMAIL'
    if (isEmail ? !user.email : !user.phone) throw new DomainError('conflict')

    const now = new Date()
    await db.user.update({
      where: { id: user.id },
      data: isEmail ? { emailVerifiedAt: now } : { phoneVerifiedAt: now },
    })

    const changes = diff(
      isEmail
        ? { emailVerifiedAt: user.emailVerifiedAt }
        : { phoneVerifiedAt: user.phoneVerifiedAt },
      isEmail ? { emailVerifiedAt: now } : { phoneVerifiedAt: now },
    )

    await recordAudit({
      actorId: actor.id,
      action: 'admin.user.contact.verify',
      entityType: 'USER',
      entityId: user.id,
      oldValue: changes.before,
      newValue: changes.after,
      ip: requestIp(),
    })

    revalidateAdmin('users', 'users/[id]')
    return ok()
  })
}

// --- companies ---------------------------------------------------------------

const companyStatusSchema = z
  .object({
    companyId: idSchema,
    status: z.enum(COMPANY_STATUSES),
    reason: optionalReasonSchema,
  })
  .refine((data) => data.status === 'ACTIVE' || (data.reason ?? '').length > 0, {
    message: 'required',
    path: ['reason'],
  })

export type CompanyStatusInput = z.input<typeof companyStatusSchema>

export async function setCompanyStatusAction(
  input: CompanyStatusInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(companyStatusSchema, input)

    const company = await db.company.findUnique({
      where: { id: parsed.companyId },
      select: { id: true, status: true, blockReason: true },
    })
    if (!company) throw new DomainError('notFound')

    await db.company.update({
      where: { id: company.id },
      data: {
        status: parsed.status,
        blockReason: parsed.status === 'ACTIVE' ? null : (parsed.reason ?? null),
      },
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.company.status',
      entityType: 'COMPANY',
      entityId: company.id,
      oldValue: { status: company.status, blockReason: company.blockReason },
      newValue: { status: parsed.status, blockReason: parsed.reason ?? null },
      reason: parsed.reason ?? null,
      ip: requestIp(),
    })

    revalidateAdmin('companies')
    return ok()
  })
}

/**
 * Signed amount in MDL. `moneySchema` refuses a minus sign because no price is ever
 * negative — a correction, however, is exactly as likely to be a debit as a credit.
 */
const signedMoneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === 'number' ? value.toFixed(2) : value.trim()))
  .transform((value, ctx) => {
    const negative = value.startsWith('-')
    const bani = parseAmountToBani(negative ? value.slice(1) : value)
    if (bani === null || bani === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'price' })
      return z.NEVER
    }
    return negative ? -bani : bani
  })

const balanceAdjustSchema = z.object({
  companyId: idSchema,
  amount: signedMoneySchema,
  reason: reasonSchema,
})

export type BalanceAdjustInput = z.input<typeof balanceAdjustSchema>

/**
 * Manual balance correction — a refund after a failed payment, a goodwill credit, an
 * operator fixing an import.
 *
 * It writes an ADJUSTMENT ledger entry and lets `appendEntry` update the cached balance
 * inside the same transaction. The idempotency key is minted per call (the operator is
 * expressing a new intent each time, unlike the daily charge which must collapse), and
 * the unique index still turns a double-submitted form into one entry.
 */
export async function adjustCompanyBalanceAction(
  input: BalanceAdjustInput,
): Promise<ActionResult<{ balanceAfterBani: number }>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(balanceAdjustSchema, input)

    const company = await db.company.findUnique({
      where: { id: parsed.companyId },
      select: { id: true, balanceBani: true },
    })
    if (!company) throw new DomainError('notFound')

    const entry = await appendEntry({
      companyId: company.id,
      amountBani: parsed.amount,
      type: 'ADJUSTMENT',
      idempotencyKey: `adjustment:${company.id}:${generateToken(12)}`,
      description: parsed.reason,
      entityType: 'USER',
      entityId: actor.id,
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.company.balance',
      entityType: 'COMPANY',
      entityId: company.id,
      oldValue: { balanceBani: company.balanceBani },
      newValue: { balanceBani: entry.balanceAfterBani, amountBani: parsed.amount },
      reason: parsed.reason,
      ip: requestIp(),
    })

    revalidateAdmin('companies')
    return ok({ balanceAfterBani: entry.balanceAfterBani })
  })
}

const badgeSchema = z
  .object({
    companyId: idSchema,
    type: z.enum(VERIFICATION_TYPES),
    granted: flag,
    expiresAt: optionalFutureDay,
    note: optionalReasonSchema,
  })
  // Taking a badge away downgrades a company in front of every buyer who filters on it,
  // so it has to be justified in writing. Granting one does not.
  .refine((data) => data.granted || (data.note ?? '').length > 0, {
    message: 'required',
    path: ['note'],
  })

export type BadgeInput = z.input<typeof badgeSchema>

/**
 * Grants or revokes a verification badge by hand.
 *
 * Most badges are produced by the document queue, but not all verification happens on
 * the platform: an operator who has just phoned ANSA, or met the owner and seen the
 * papers, needs to be able to say so. TRUSTED_SUPPLIER is only ever granted this way —
 * there is no automatic path to it, by design.
 *
 * The row is keyed on (companyId, type), so re-granting updates rather than duplicating.
 */
export async function setCompanyBadgeAction(input: BadgeInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(badgeSchema, input)

    const company = await db.company.findUnique({
      where: { id: parsed.companyId },
      select: { id: true },
    })
    if (!company) throw new DomainError('notFound')

    const existing = await db.verificationBadge.findUnique({
      where: { companyId_type: { companyId: company.id, type: parsed.type } },
      select: { status: true, expiresAt: true, note: true },
    })

    const next = {
      status: parsed.granted ? 'APPROVED' : 'REJECTED',
      grantedAt: parsed.granted ? new Date() : null,
      expiresAt: parsed.granted ? (parsed.expiresAt ?? null) : null,
      note: parsed.note ?? null,
    }

    await db.verificationBadge.upsert({
      where: { companyId_type: { companyId: company.id, type: parsed.type } },
      create: { companyId: company.id, type: parsed.type, ...next },
      update: next,
    })

    const changes = diff(
      {
        status: existing?.status ?? null,
        expiresAt: existing?.expiresAt ?? null,
        note: existing?.note ?? null,
      },
      { status: next.status, expiresAt: next.expiresAt, note: next.note },
    )

    await recordAudit({
      actorId: actor.id,
      action: parsed.granted ? 'admin.company.badge.grant' : 'admin.company.badge.revoke',
      entityType: 'COMPANY',
      entityId: company.id,
      oldValue: { type: parsed.type, ...changes.before },
      newValue: { type: parsed.type, ...changes.after },
      reason: parsed.note ?? null,
      ip: requestIp(),
    })

    revalidateAdmin('companies', 'companies/[id]', 'verification')
    revalidatePath('/[locale]/suppliers/[slug]', 'page')
    return ok()
  })
}

const trialSchema = z.object({
  companyId: idSchema,
  days: boundedInt(1, 365),
})

export type TrialInput = z.input<typeof trialSchema>

/**
 * Extends the free-listing window.
 *
 * Counted from whichever is later — today or the current end date — so extending a live
 * trial adds days instead of silently shortening it, and extending an expired one starts
 * a fresh window rather than landing in the past.
 */
export async function extendCompanyTrialAction(input: TrialInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(trialSchema, input)

    const company = await db.company.findUnique({
      where: { id: parsed.companyId },
      select: { id: true, trialEndsAt: true },
    })
    if (!company) throw new DomainError('notFound')

    const now = Date.now()
    const base = Math.max(now, company.trialEndsAt?.getTime() ?? now)
    const trialEndsAt = new Date(base + parsed.days * 24 * 60 * 60 * 1000)

    await db.company.update({ where: { id: company.id }, data: { trialEndsAt } })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.company.trial.extend',
      entityType: 'COMPANY',
      entityId: company.id,
      oldValue: { trialEndsAt: company.trialEndsAt },
      newValue: { trialEndsAt, days: parsed.days },
      ip: requestIp(),
    })

    revalidateAdmin('companies', 'companies/[id]')
    return ok()
  })
}

// --- content status overrides ------------------------------------------------

const productStatusSchema = z.object({
  productId: idSchema,
  status: z.enum(PRODUCT_STATUSES),
  reason: optionalReasonSchema,
})

export type ProductStatusInput = z.input<typeof productStatusSchema>

export async function setProductStatusAdminAction(
  input: ProductStatusInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(productStatusSchema, input)

    const product = await db.product.findUnique({
      where: { id: parsed.productId },
      select: { id: true, status: true, publishedAt: true },
    })
    if (!product) throw new DomainError('notFound')

    await db.product.update({
      where: { id: product.id },
      data: {
        status: parsed.status,
        ...(parsed.reason ? { moderatorComment: parsed.reason } : {}),
        ...(parsed.status === 'ACTIVE' && product.publishedAt === null
          ? { publishedAt: new Date() }
          : {}),
      },
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.product.status',
      entityType: 'PRODUCT',
      entityId: product.id,
      oldValue: { status: product.status },
      newValue: { status: parsed.status },
      reason: parsed.reason ?? null,
      ip: requestIp(),
    })

    revalidateAdmin('products')
    return ok()
  })
}

const productFlagSchema = z.object({
  productId: idSchema,
  value: flag,
})

export type ProductFlagInput = z.input<typeof productFlagSchema>

/**
 * Editorial bump — moves a listing to the top of the "newest" ordering without charging
 * anybody. Used to give a good supplier a hand on a slow day, or to re-surface a listing
 * that was stuck in moderation for a week through no fault of its own.
 */
export async function bumpProductAction(productId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const id = parseInput(idSchema, productId)

    const product = await db.product.findUnique({
      where: { id },
      select: { id: true, bumpedAt: true },
    })
    if (!product) throw new DomainError('notFound')

    const bumpedAt = new Date()
    await db.product.update({ where: { id: product.id }, data: { bumpedAt } })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.product.bump',
      entityType: 'PRODUCT',
      entityId: product.id,
      oldValue: { bumpedAt: product.bumpedAt },
      newValue: { bumpedAt },
      ip: requestIp(),
    })

    revalidateAdmin('products')
    revalidatePath('/[locale]/products', 'page')
    return ok()
  })
}

/** Pins or unpins a listing on the home page rail. */
export async function setProductPinnedAction(
  input: ProductFlagInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(productFlagSchema, input)

    const product = await db.product.findUnique({
      where: { id: parsed.productId },
      select: { id: true, isHomepagePinned: true },
    })
    if (!product) throw new DomainError('notFound')

    await db.product.update({
      where: { id: product.id },
      data: { isHomepagePinned: parsed.value },
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.product.pin',
      entityType: 'PRODUCT',
      entityId: product.id,
      oldValue: { isHomepagePinned: product.isHomepagePinned },
      newValue: { isHomepagePinned: parsed.value },
      ip: requestIp(),
    })

    revalidateAdmin('products')
    revalidatePath('/[locale]', 'page')
    return ok()
  })
}

/**
 * Clears the "paused because the balance ran out" marker.
 *
 * The nightly job sets it and a top-up clears it; this is the manual escape hatch for
 * the case where the money arrived by bank transfer, or the charge was our mistake. It
 * only clears the flag — the status is a separate, deliberate decision.
 */
export async function clearPausedForBalanceAction(
  productId: string,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const id = parseInput(idSchema, productId)

    const product = await db.product.findUnique({
      where: { id },
      select: { id: true, pausedForBalance: true },
    })
    if (!product) throw new DomainError('notFound')
    if (!product.pausedForBalance) throw new DomainError('conflict')

    await db.product.update({ where: { id: product.id }, data: { pausedForBalance: false } })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.product.unpause',
      entityType: 'PRODUCT',
      entityId: product.id,
      oldValue: { pausedForBalance: true },
      newValue: { pausedForBalance: false },
      ip: requestIp(),
    })

    revalidateAdmin('products')
    return ok()
  })
}

const unpublishSchema = z.object({
  productId: idSchema,
  reason: reasonSchema,
})

export type UnpublishInput = z.input<typeof unpublishSchema>

/**
 * Pulls a listing off the catalogue immediately, with a written reason.
 *
 * Distinct from the generic status override because the reason is mandatory here: this
 * is the button pressed when something has to come down *now*, and the seller is owed an
 * explanation they can read in `moderatorComment`.
 */
export async function unpublishProductAction(
  input: UnpublishInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(unpublishSchema, input)

    const product = await db.product.findUnique({
      where: { id: parsed.productId },
      select: { id: true, status: true, moderatorComment: true },
    })
    if (!product) throw new DomainError('notFound')

    await db.product.update({
      where: { id: product.id },
      data: { status: 'PAUSED', moderatorComment: parsed.reason },
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.product.unpublish',
      entityType: 'PRODUCT',
      entityId: product.id,
      oldValue: { status: product.status },
      newValue: { status: 'PAUSED' },
      reason: parsed.reason,
      ip: requestIp(),
    })

    revalidateAdmin('products')
    revalidatePath('/[locale]/products/[slug]', 'page')
    return ok()
  })
}

const requestStatusSchema = z.object({
  requestId: idSchema,
  status: z.enum(REQUEST_STATUSES),
  reason: optionalReasonSchema,
})

export type RequestStatusInput = z.input<typeof requestStatusSchema>

export async function setRequestStatusAdminAction(
  input: RequestStatusInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(requestStatusSchema, input)

    const request = await db.purchaseRequest.findUnique({
      where: { id: parsed.requestId },
      select: { id: true, status: true },
    })
    if (!request) throw new DomainError('notFound')

    await db.purchaseRequest.update({
      where: { id: request.id },
      data: { status: parsed.status },
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.request.status',
      entityType: 'REQUEST',
      entityId: request.id,
      oldValue: { status: request.status },
      newValue: { status: parsed.status },
      reason: parsed.reason ?? null,
      ip: requestIp(),
    })

    revalidateAdmin('requests')
    return ok()
  })
}

const requestCancelSchema = z.object({
  requestId: idSchema,
  reason: reasonSchema,
})

export type RequestCancelInput = z.input<typeof requestCancelSchema>

/** Cancels a purchase request. Suppliers who bid on it deserve a stated reason. */
export async function cancelRequestAction(
  input: RequestCancelInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(requestCancelSchema, input)

    const request = await db.purchaseRequest.findUnique({
      where: { id: parsed.requestId },
      select: { id: true, status: true },
    })
    if (!request) throw new DomainError('notFound')
    if (request.status === 'CANCELLED') throw new DomainError('conflict')

    await db.purchaseRequest.update({
      where: { id: request.id },
      data: { status: 'CANCELLED' },
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.request.cancel',
      entityType: 'REQUEST',
      entityId: request.id,
      oldValue: { status: request.status },
      newValue: { status: 'CANCELLED' },
      reason: parsed.reason,
      ip: requestIp(),
    })

    revalidateAdmin('requests')
    revalidatePath('/[locale]/requests/[slug]', 'page')
    return ok()
  })
}

const dealStatusAdminSchema = z.object({
  dealId: idSchema,
  status: z.enum(DEAL_STATUSES),
  reason: optionalReasonSchema,
})

export type DealStatusAdminInput = z.input<typeof dealStatusAdminSchema>

/**
 * Forcing a deal status bypasses `DEAL_TRANSITIONS` on purpose — that map protects the
 * two trading parties from each other, not an operator unpicking a stuck dispute. The
 * override is recorded twice: once on the deal timeline both parties can read, once in
 * the audit log.
 */
export async function setDealStatusAdminAction(
  input: DealStatusAdminInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(dealStatusAdminSchema, input)

    const deal = await db.deal.findUnique({
      where: { id: parsed.dealId },
      select: { id: true, status: true },
    })
    if (!deal) throw new DomainError('notFound')

    await transaction(async (tx) => {
      await tx.deal.update({
        where: { id: deal.id },
        data: {
          status: parsed.status,
          ...(parsed.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
          ...(parsed.status === 'CANCELLED'
            ? { cancelledAt: new Date(), cancelReason: parsed.reason ?? null }
            : {}),
        },
      })

      await tx.dealEvent.create({
        data: {
          dealId: deal.id,
          actorId: actor.id,
          fromStatus: deal.status,
          toStatus: parsed.status,
          comment: parsed.reason ?? null,
        },
      })
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.deal.status',
      entityType: 'DEAL',
      entityId: deal.id,
      oldValue: { status: deal.status },
      newValue: { status: parsed.status },
      reason: parsed.reason ?? null,
      ip: requestIp(),
    })

    revalidateAdmin('deals')
    return ok()
  })
}

/** Closing a dispute has to land somewhere; these are the only sane destinations. */
const DISPUTE_EXITS = ['CONFIRMED', 'COMPLETED', 'CANCELLED'] as const

const dealDisputeSchema = z.object({
  dealId: idSchema,
  open: flag,
  status: z.enum(DISPUTE_EXITS).default('CONFIRMED'),
  reason: reasonSchema,
})

export type DealDisputeInput = z.input<typeof dealDisputeSchema>

/**
 * Opens or closes a dispute on a deal.
 *
 * Product.md is not a party to the agreement and holds none of the money, so "resolving"
 * a dispute means recording what the operator decided and putting the deal back into a
 * state both sides can act on. The verdict is written to the deal timeline the traders
 * read, not only to the audit log they cannot see.
 */
export async function setDealDisputeAction(
  input: DealDisputeInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(dealDisputeSchema, input)

    const deal = await db.deal.findUnique({
      where: { id: parsed.dealId },
      select: { id: true, status: true },
    })
    if (!deal) throw new DomainError('notFound')

    const isOpen = deal.status === 'DISPUTED'
    if (parsed.open === isOpen) throw new DomainError('conflict')

    const status = parsed.open ? 'DISPUTED' : parsed.status

    await transaction(async (tx) => {
      await tx.deal.update({
        where: { id: deal.id },
        data: {
          status,
          ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
          ...(status === 'CANCELLED'
            ? { cancelledAt: new Date(), cancelReason: parsed.reason }
            : {}),
        },
      })

      await tx.dealEvent.create({
        data: {
          dealId: deal.id,
          actorId: actor.id,
          fromStatus: deal.status,
          toStatus: status,
          comment: parsed.reason,
        },
      })
    })

    await recordAudit({
      actorId: actor.id,
      action: parsed.open ? 'admin.deal.dispute.open' : 'admin.deal.dispute.close',
      entityType: 'DEAL',
      entityId: deal.id,
      oldValue: { status: deal.status },
      newValue: { status },
      reason: parsed.reason,
      ip: requestIp(),
    })

    revalidateAdmin('deals')
    revalidatePath('/[locale]/deals/[id]', 'page')
    return ok()
  })
}

// --- reviews -----------------------------------------------------------------

const deleteReplySchema = z.object({
  reviewId: idSchema,
  reason: reasonSchema,
})

export type DeleteReplyInput = z.input<typeof deleteReplySchema>

/**
 * Removes a company's public reply to a review.
 *
 * Hiding the review itself is a moderator decision and lives in moderation.ts. This is
 * the narrower case: the review stands, but the answer to it broke the rules. The reply
 * has no "hidden" state in the schema, so the row is deleted — which is why the old text
 * is copied into the audit row first and a reason is mandatory.
 */
export async function deleteReviewReplyAction(
  input: DeleteReplyInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(deleteReplySchema, input)

    const reply = await db.reviewReply.findUnique({
      where: { reviewId: parsed.reviewId },
      select: { id: true, body: true, review: { select: { targetCompanyId: true } } },
    })
    if (!reply) throw new DomainError('notFound')

    await db.reviewReply.delete({ where: { id: reply.id } })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.review.reply.delete',
      entityType: 'REVIEW',
      entityId: parsed.reviewId,
      oldValue: { body: reply.body },
      reason: parsed.reason,
      ip: requestIp(),
    })

    revalidateAdmin('reviews')
    revalidatePath('/[locale]/suppliers/[slug]', 'page')
    return ok()
  })
}

// --- categories --------------------------------------------------------------

const categorySchema = z.object({
  id: idSchema.optional(),
  parentId: idSchema.optional().nullable(),
  slug: slugSchema,
  nameRu: shortText(120),
  nameRo: shortText(120),
  slugRu: slugSchema,
  slugRo: slugSchema,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isPopular: flag,
  isActive: flag,
  defaultUnit: z.enum(UNITS).default('KG'),
  icon: z
    .string()
    .trim()
    .max(40, 'maxLength')
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
})

export type CategoryInput = z.input<typeof categorySchema>

interface ParentInfo {
  path: string
  level: number
}

async function loadParent(tx: Tx, parentId: string | null): Promise<ParentInfo | null> {
  if (!parentId) return null
  const parent = await tx.category.findUnique({
    where: { id: parentId },
    select: { path: true, level: true },
  })
  if (!parent) throw new DomainError('notFound')
  return parent
}

/**
 * Creates or updates a category, keeping the materialized `path` consistent.
 *
 * `path` is what makes "everything under Мясо" a single indexed prefix query, so a
 * rename or a move has to rewrite the whole subtree — otherwise the catalogue silently
 * loses branches. The move is also checked for cycles: a category may not become its own
 * descendant.
 */
export async function saveCategoryAction(input: CategoryInput): Promise<ActionResult<string>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(categorySchema, input)
    const parentId = parsed.parentId ?? null

    const categoryId = await transaction(async (tx) => {
      const parent = await loadParent(tx, parentId)
      const path = parent ? `${parent.path}/${parsed.slug}` : parsed.slug
      const level = parent ? parent.level + 1 : 0

      const data = {
        parentId,
        slug: parsed.slug,
        path,
        level,
        sortOrder: parsed.sortOrder,
        isPopular: parsed.isPopular,
        isActive: parsed.isActive,
        defaultUnit: parsed.defaultUnit,
        icon: parsed.icon ?? null,
      }

      if (!parsed.id) {
        const created = await tx.category.create({ data, select: { id: true } })
        await writeCategoryTranslations(tx, created.id, parsed)
        return created.id
      }

      const existing = await tx.category.findUnique({
        where: { id: parsed.id },
        select: { id: true, path: true, level: true, parentId: true, slug: true },
      })
      if (!existing) throw new DomainError('notFound')

      if (parentId === existing.id || (parent && parent.path.startsWith(`${existing.path}/`))) {
        throw new DomainError('conflict')
      }

      await tx.category.update({ where: { id: existing.id }, data })
      await writeCategoryTranslations(tx, existing.id, parsed)

      if (existing.path !== path || existing.level !== level) {
        const descendants = await tx.category.findMany({
          where: { path: { startsWith: `${existing.path}/` } },
          select: { id: true, path: true, level: true },
        })
        for (const descendant of descendants) {
          await tx.category.update({
            where: { id: descendant.id },
            data: {
              path: `${path}${descendant.path.slice(existing.path.length)}`,
              level: descendant.level + (level - existing.level),
            },
          })
        }
      }

      return existing.id
    })

    // The suggester keeps the whole taxonomy in memory; without this it would serve the
    // old tree until the TTL expires.
    invalidateCategoryIndex()

    await recordAudit({
      actorId: actor.id,
      action: parsed.id ? 'admin.category.update' : 'admin.category.create',
      entityType: 'CATEGORY',
      entityId: categoryId,
      newValue: {
        slug: parsed.slug,
        parentId,
        nameRu: parsed.nameRu,
        nameRo: parsed.nameRo,
        isActive: parsed.isActive,
        isPopular: parsed.isPopular,
      },
      ip: requestIp(),
    })

    revalidateAdmin('categories', 'synonyms')
    return ok(categoryId)
  })
}

async function writeCategoryTranslations(
  tx: Tx,
  categoryId: string,
  values: { nameRu: string; nameRo: string; slugRu: string; slugRo: string },
): Promise<void> {
  const rows = [
    { locale: 'ru', name: values.nameRu, slug: values.slugRu },
    { locale: 'ro', name: values.nameRo, slug: values.slugRo },
  ]

  for (const row of rows) {
    await tx.categoryTranslation.upsert({
      where: { categoryId_locale: { categoryId, locale: row.locale } },
      create: { categoryId, locale: row.locale, name: row.name, slug: row.slug },
      update: { name: row.name, slug: row.slug },
    })
  }
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const id = parseInput(idSchema, categoryId)

    const category = await db.category.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        _count: { select: { children: true, products: true, requests: true } },
      },
    })
    if (!category) throw new DomainError('notFound')

    // Deleting a category with content would orphan listings; deactivate it instead.
    if (
      category._count.children > 0 ||
      category._count.products > 0 ||
      category._count.requests > 0
    ) {
      throw new DomainError('conflict')
    }

    await db.category.delete({ where: { id: category.id } })
    invalidateCategoryIndex()

    await recordAudit({
      actorId: actor.id,
      action: 'admin.category.delete',
      entityType: 'CATEGORY',
      entityId: category.id,
      oldValue: { slug: category.slug },
      ip: requestIp(),
    })

    revalidateAdmin('categories', 'synonyms')
    return ok()
  })
}

const attributeSchema = z.object({
  id: idSchema.optional(),
  categoryId: idSchema,
  key: z
    .string()
    .trim()
    .min(1, 'required')
    .max(60, 'maxLength')
    .regex(/^[a-z0-9_]+$/, 'url'),
  type: z.enum(['TEXT', 'NUMBER', 'SELECT', 'MULTISELECT', 'BOOL', 'DATE']),
  unit: z
    .string()
    .trim()
    .max(20, 'maxLength')
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  isRequired: flag,
  isFilterable: flag,
  appliesTo: z.enum(['PRODUCT', 'REQUEST', 'BOTH']).default('BOTH'),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  inherited: flag,
  labelRu: shortText(120),
  labelRo: shortText(120),
  hintRu: z
    .string()
    .trim()
    .max(300, 'maxLength')
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  hintRo: z
    .string()
    .trim()
    .max(300, 'maxLength')
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
})

export type AttributeInput = z.input<typeof attributeSchema>

export async function saveAttributeAction(input: AttributeInput): Promise<ActionResult<string>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(attributeSchema, input)

    const attributeId = await transaction(async (tx) => {
      const data = {
        categoryId: parsed.categoryId,
        key: parsed.key,
        type: parsed.type,
        unit: parsed.unit ?? null,
        isRequired: parsed.isRequired,
        isFilterable: parsed.isFilterable,
        appliesTo: parsed.appliesTo,
        sortOrder: parsed.sortOrder,
        inherited: parsed.inherited,
      }

      const id = parsed.id
        ? (await tx.categoryAttribute.update({ where: { id: parsed.id }, data, select: { id: true } }))
            .id
        : (await tx.categoryAttribute.create({ data, select: { id: true } })).id

      for (const row of [
        { locale: 'ru', label: parsed.labelRu, hint: parsed.hintRu ?? null },
        { locale: 'ro', label: parsed.labelRo, hint: parsed.hintRo ?? null },
      ]) {
        await tx.categoryAttributeTranslation.upsert({
          where: { attributeId_locale: { attributeId: id, locale: row.locale } },
          create: { attributeId: id, locale: row.locale, label: row.label, hint: row.hint },
          update: { label: row.label, hint: row.hint },
        })
      }

      return id
    })

    invalidateCategoryIndex()

    await recordAudit({
      actorId: actor.id,
      action: parsed.id ? 'admin.attribute.update' : 'admin.attribute.create',
      entityType: 'CATEGORY_ATTRIBUTE',
      entityId: attributeId,
      newValue: { key: parsed.key, type: parsed.type, categoryId: parsed.categoryId },
      ip: requestIp(),
    })

    revalidateAdmin('categories')
    return ok(attributeId)
  })
}

export async function deleteAttributeAction(attributeId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const id = parseInput(idSchema, attributeId)

    const attribute = await db.categoryAttribute.findUnique({
      where: { id },
      select: { id: true, key: true, categoryId: true },
    })
    if (!attribute) throw new DomainError('notFound')

    await db.categoryAttribute.delete({ where: { id: attribute.id } })
    invalidateCategoryIndex()

    await recordAudit({
      actorId: actor.id,
      action: 'admin.attribute.delete',
      entityType: 'CATEGORY_ATTRIBUTE',
      entityId: attribute.id,
      oldValue: { key: attribute.key, categoryId: attribute.categoryId },
      ip: requestIp(),
    })

    revalidateAdmin('categories')
    return ok()
  })
}

const attributeOptionSchema = z.object({
  id: idSchema.optional(),
  attributeId: idSchema,
  value: z
    .string()
    .trim()
    .min(1, 'required')
    .max(60, 'maxLength')
    .regex(/^[A-Za-z0-9_-]+$/, 'url'),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  labelRu: shortText(120),
  labelRo: shortText(120),
})

export type AttributeOptionInput = z.input<typeof attributeOptionSchema>

export async function saveAttributeOptionAction(
  input: AttributeOptionInput,
): Promise<ActionResult<string>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(attributeOptionSchema, input)

    const optionId = await transaction(async (tx) => {
      const data = {
        attributeId: parsed.attributeId,
        value: parsed.value,
        sortOrder: parsed.sortOrder,
      }

      const id = parsed.id
        ? (
            await tx.categoryAttributeOption.update({
              where: { id: parsed.id },
              data,
              select: { id: true },
            })
          ).id
        : (await tx.categoryAttributeOption.create({ data, select: { id: true } })).id

      for (const row of [
        { locale: 'ru', label: parsed.labelRu },
        { locale: 'ro', label: parsed.labelRo },
      ]) {
        await tx.categoryAttributeOptionTranslation.upsert({
          where: { optionId_locale: { optionId: id, locale: row.locale } },
          create: { optionId: id, locale: row.locale, label: row.label },
          update: { label: row.label },
        })
      }

      return id
    })

    invalidateCategoryIndex()

    await recordAudit({
      actorId: actor.id,
      action: parsed.id ? 'admin.attributeOption.update' : 'admin.attributeOption.create',
      entityType: 'CATEGORY_ATTRIBUTE_OPTION',
      entityId: optionId,
      newValue: { value: parsed.value, attributeId: parsed.attributeId },
      ip: requestIp(),
    })

    revalidateAdmin('categories')
    return ok(optionId)
  })
}

export async function deleteAttributeOptionAction(optionId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const id = parseInput(idSchema, optionId)

    const option = await db.categoryAttributeOption.findUnique({
      where: { id },
      select: { id: true, value: true, attributeId: true },
    })
    if (!option) throw new DomainError('notFound')

    await db.categoryAttributeOption.delete({ where: { id: option.id } })
    invalidateCategoryIndex()

    await recordAudit({
      actorId: actor.id,
      action: 'admin.attributeOption.delete',
      entityType: 'CATEGORY_ATTRIBUTE_OPTION',
      entityId: option.id,
      oldValue: { value: option.value, attributeId: option.attributeId },
      ip: requestIp(),
    })

    revalidateAdmin('categories')
    return ok()
  })
}

// --- synonyms ----------------------------------------------------------------

const synonymSchema = z.object({
  id: idSchema.optional(),
  categoryId: idSchema,
  locale: localeSchema,
  term: shortText(80),
  weight: z.coerce.number().int().min(1).max(200).default(100),
  isMisspelling: flag,
})

export type SynonymInput = z.input<typeof synonymSchema>

/**
 * Synonyms drive the smart-category typeahead: "картошка", "cartofi" and the common
 * misspelling "картофиль" all have to land on «Овощи → Картофель».
 *
 * `normalized` is recomputed here rather than trusted from the form — the matcher only
 * ever compares normalized strings, so a hand-typed value that skipped `normalize()`
 * would be dead weight in the index.
 */
export async function saveSynonymAction(input: SynonymInput): Promise<ActionResult<string>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(synonymSchema, input)

    const data = {
      categoryId: parsed.categoryId,
      locale: parsed.locale,
      term: parsed.term,
      normalized: normalize(parsed.term),
      weight: parsed.weight,
      isMisspelling: parsed.isMisspelling,
    }

    const synonym = parsed.id
      ? await db.categorySynonym.update({ where: { id: parsed.id }, data, select: { id: true } })
      : await db.categorySynonym.create({ data, select: { id: true } })

    invalidateCategoryIndex()

    await recordAudit({
      actorId: actor.id,
      action: parsed.id ? 'admin.synonym.update' : 'admin.synonym.create',
      entityType: 'CATEGORY_SYNONYM',
      entityId: synonym.id,
      newValue: data,
      ip: requestIp(),
    })

    revalidateAdmin('synonyms')
    return ok(synonym.id)
  })
}

export async function deleteSynonymAction(synonymId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const id = parseInput(idSchema, synonymId)

    const synonym = await db.categorySynonym.findUnique({
      where: { id },
      select: { id: true, term: true, categoryId: true, locale: true },
    })
    if (!synonym) throw new DomainError('notFound')

    await db.categorySynonym.delete({ where: { id: synonym.id } })
    invalidateCategoryIndex()

    await recordAudit({
      actorId: actor.id,
      action: 'admin.synonym.delete',
      entityType: 'CATEGORY_SYNONYM',
      entityId: synonym.id,
      oldValue: { term: synonym.term, categoryId: synonym.categoryId, locale: synonym.locale },
      ip: requestIp(),
    })

    revalidateAdmin('synonyms')
    return ok()
  })
}

const bulkSynonymSchema = z.object({
  categoryId: idSchema,
  locale: localeSchema,
  terms: z.string().trim().min(1, 'required').max(4000, 'maxLength'),
  weight: boundedInt(1, 200).default(100),
  isMisspelling: flag,
})

export type BulkSynonymInput = z.input<typeof bulkSynonymSchema>

/**
 * Adds a whole vocabulary at once — one term per line.
 *
 * Teaching the matcher a new category is never one word: «картошка», «картофан», the
 * misspelling «картофиль» and the Romanian "cartofi" all arrive together, and typing
 * them one row at a time is how the taxonomy stops being maintained. Terms already known
 * for this category and locale are skipped rather than duplicated, so the box can be
 * pasted into twice without consequence.
 */
export async function bulkAddSynonymsAction(
  input: BulkSynonymInput,
): Promise<ActionResult<number>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(bulkSynonymSchema, input)

    const category = await db.category.findUnique({
      where: { id: parsed.categoryId },
      select: { id: true },
    })
    if (!category) throw new DomainError('notFound')

    const seen = new Set<string>()
    const candidates: { term: string; normalized: string }[] = []

    for (const line of parsed.terms.split('\n')) {
      const term = line.trim().slice(0, 80)
      if (term === '') continue
      const normalized = normalize(term)
      if (normalized === '' || seen.has(normalized)) continue
      seen.add(normalized)
      candidates.push({ term, normalized })
    }

    if (candidates.length === 0) throw new DomainError('validation')

    const existing = await db.categorySynonym.findMany({
      where: {
        categoryId: category.id,
        locale: parsed.locale,
        normalized: { in: candidates.map((item) => item.normalized) },
      },
      select: { normalized: true },
    })
    const known = new Set(existing.map((row) => row.normalized))
    const fresh = candidates.filter((item) => !known.has(item.normalized))

    await transaction(async (tx) => {
      for (const item of fresh) {
        await tx.categorySynonym.create({
          data: {
            categoryId: category.id,
            locale: parsed.locale,
            term: item.term,
            normalized: item.normalized,
            weight: parsed.weight,
            isMisspelling: parsed.isMisspelling,
          },
        })
      }
    })

    invalidateCategoryIndex()

    await recordAudit({
      actorId: actor.id,
      action: 'admin.synonym.bulkCreate',
      entityType: 'CATEGORY',
      entityId: category.id,
      newValue: {
        locale: parsed.locale,
        added: fresh.length,
        skipped: candidates.length - fresh.length,
        terms: fresh.map((item) => item.term).slice(0, 50),
      },
      ip: requestIp(),
    })

    revalidateAdmin('synonyms')
    return ok(fresh.length)
  })
}

export interface SuggestionPreview {
  categoryId: string
  name: string
  trailLabel: string
  score: number
  matchedTerm: string | null
}

/**
 * Read-only preview of what the typeahead would answer. Editing synonyms blind is how a
 * taxonomy rots, so the editor can try a query and see the ranking it produces.
 */
export async function previewSuggestionsAction(
  query: string,
  locale: 'ru' | 'ro',
): Promise<ActionResult<SuggestionPreview[]>> {
  return runAction(async () => {
    await assertAdmin()
    const parsedLocale = parseInput(localeSchema, locale)
    const suggestions: CategorySuggestion[] = await suggestCategories(
      String(query).slice(0, 200),
      parsedLocale,
      10,
    )

    return ok(
      suggestions.map((item) => ({
        categoryId: item.category.id,
        name: item.category.names[parsedLocale],
        trailLabel: item.trailLabel,
        score: item.score,
        matchedTerm: item.matchedTerm,
      })),
    )
  })
}

// --- tariffs -----------------------------------------------------------------

export type TariffInput = z.input<typeof tariffSchema>

export async function saveTariffAction(input: TariffInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(tariffSchema, input)

    const existing = await db.tariff.findUnique({
      where: { key: parsed.key },
      select: { priceBani: true, isActive: true },
    })

    const isActive = parsed.isActive ?? true

    await db.tariff.upsert({
      where: { key: parsed.key },
      create: { key: parsed.key, priceBani: parsed.priceBani, isActive },
      update: { priceBani: parsed.priceBani, isActive },
    })

    const changes = diff(
      { priceBani: existing?.priceBani ?? null, isActive: existing?.isActive ?? null },
      { priceBani: parsed.priceBani, isActive },
    )

    await recordAudit({
      actorId: actor.id,
      action: 'admin.tariff.update',
      entityType: 'TARIFF',
      entityId: parsed.key,
      oldValue: changes.before,
      newValue: changes.after,
      ip: requestIp(),
    })

    revalidateAdmin('tariffs')
    return ok()
  })
}

// --- feature flags -----------------------------------------------------------

export type FeatureFlagInput = z.input<typeof featureFlagSchema>

/**
 * Flipping a flag changes behaviour for every visitor immediately — switching
 * BILLING_ENABLED off makes all listings free on the next request. That is the point of
 * having it, and precisely why the change is audited with the actor and the old value.
 */
export async function setFeatureFlagAction(input: FeatureFlagInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(featureFlagSchema, input)

    const known: readonly string[] = FEATURE_FLAGS
    if (!known.includes(parsed.key)) throw new DomainError('notFound')
    const key = parsed.key as FeatureFlagKey

    const existing = await db.featureFlag.findUnique({
      where: { key },
      select: { enabled: true },
    })

    await setFlag(key, parsed.enabled)

    await recordAudit({
      actorId: actor.id,
      action: 'admin.flag.set',
      entityType: 'FEATURE_FLAG',
      entityId: key,
      oldValue: { enabled: existing?.enabled ?? null },
      newValue: { enabled: parsed.enabled },
      ip: requestIp(),
    })

    revalidateAdmin('flags')
    // Prices and "free right now" notices are rendered all over the public site.
    revalidatePath('/[locale]', 'layout')
    return ok()
  })
}

// --- payments ----------------------------------------------------------------

/**
 * The canonical callback shape. Every driver's `verifyWebhook` normalizes to this, and
 * the raw body is stored before processing, so a stored payload that already speaks it
 * can be replayed here. A bank format that does not is refused rather than guessed at —
 * see the note in reprocessWebhookAction.
 */
const webhookPayloadSchema = z.object({
  paymentId: z.string().min(1).nullish(),
  status: z.enum(['SUCCEEDED', 'FAILED', 'PENDING', 'REFUNDED']).optional(),
  amountBani: z.number().int().nullish(),
})

/**
 * Re-runs a webhook whose handler died half way.
 *
 * The event row is written before any processing precisely so this is possible: the
 * provider considers the callback delivered, the money left the buyer's card, and the
 * balance never moved. Re-crediting is safe because `appendEntry` is keyed on
 * `topup:<paymentId>` — pressing the button twice writes one ledger entry.
 *
 * Two refusals worth stating out loud:
 *   - an event whose signature did not verify is never acted on, no matter how stuck
 *     the payment looks; that check is the only thing standing between a forged POST
 *     and a credited balance
 *   - a payload this deployment's driver does not express in the canonical shape is
 *     reported as a conflict instead of being parsed hopefully. Adding a real bank
 *     driver means teaching it to normalize here too.
 */
export async function reprocessWebhookAction(eventId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const id = parseInput(idSchema, eventId)

    const event = await db.webhookEvent.findUnique({
      where: { id },
      select: {
        id: true,
        provider: true,
        payload: true,
        signatureValid: true,
        processedAt: true,
        error: true,
      },
    })
    if (!event) throw new DomainError('notFound')
    if (!event.signatureValid) throw new DomainError('forbidden')

    let decoded: unknown
    try {
      decoded = JSON.parse(event.payload)
    } catch {
      throw new DomainError('conflict')
    }

    const parsed = webhookPayloadSchema.safeParse(decoded)
    if (!parsed.success || !parsed.data.paymentId) throw new DomainError('conflict')

    const payment = await db.payment.findUnique({
      where: { id: parsed.data.paymentId },
      select: { id: true, companyId: true, amountBani: true, status: true },
    })
    if (!payment) throw new DomainError('notFound')

    const reported = parsed.data.status ?? 'SUCCEEDED'
    let outcome: string

    if (payment.status === 'SUCCEEDED') {
      outcome = 'alreadyCredited'
    } else if (reported !== 'SUCCEEDED') {
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: reported === 'REFUNDED' ? 'REFUNDED' : reported === 'PENDING' ? 'PENDING' : 'FAILED',
        },
      })
      outcome = reported
    } else if (
      parsed.data.amountBani !== null &&
      parsed.data.amountBani !== undefined &&
      parsed.data.amountBani !== payment.amountBani
    ) {
      // The amount the provider reports must match ours exactly; reconciling the
      // difference silently is how a balance ends up wrong by a hundred bani forever.
      await db.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureCode: 'amount_mismatch' },
      })
      outcome = 'amountMismatch'
    } else {
      const entry = await appendEntry({
        companyId: payment.companyId,
        amountBani: payment.amountBani,
        type: 'TOP_UP',
        idempotencyKey: `topup:${payment.id}`,
        description: 'payment',
        entityType: 'PAYMENT',
        entityId: payment.id,
      })

      await db.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      })

      // A seller who has paid should not have to re-publish by hand.
      await resumeListingsAfterTopUp(payment.companyId)
      outcome = entry.deduplicated ? 'alreadyCredited' : 'credited'
    }

    await db.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), error: null },
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.payment.webhook.reprocess',
      entityType: 'PAYMENT',
      entityId: payment.id,
      oldValue: { status: payment.status, webhookError: event.error },
      newValue: { outcome, webhookEventId: event.id },
      ip: requestIp(),
    })

    revalidateAdmin('payments', 'balances')
    return ok()
  })
}

const paymentFailSchema = z.object({
  paymentId: idSchema,
  reason: reasonSchema,
})

export type PaymentFailInput = z.input<typeof paymentFailSchema>

/**
 * Closes out a payment that will never arrive.
 *
 * Purely bookkeeping: it moves the row out of PENDING so the queue on the overview page
 * stops pointing at it, and touches no balance. A payment that already succeeded is
 * refused — undoing a credit is a refund through the ledger, not a status edit.
 */
export async function markPaymentFailedAction(
  input: PaymentFailInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(paymentFailSchema, input)

    const payment = await db.payment.findUnique({
      where: { id: parsed.paymentId },
      select: { id: true, status: true, failureCode: true },
    })
    if (!payment) throw new DomainError('notFound')
    if (payment.status === 'SUCCEEDED') throw new DomainError('conflict')

    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureCode: 'admin_manual', completedAt: new Date() },
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.payment.fail',
      entityType: 'PAYMENT',
      entityId: payment.id,
      oldValue: { status: payment.status, failureCode: payment.failureCode },
      newValue: { status: 'FAILED', failureCode: 'admin_manual' },
      reason: parsed.reason,
      ip: requestIp(),
    })

    revalidateAdmin('payments')
    return ok()
  })
}
