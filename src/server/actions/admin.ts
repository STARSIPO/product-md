'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertAdmin } from '@/server/auth/guards'
import { db, transaction, type Tx } from '@/server/db'
import { generateToken } from '@/server/crypto'
import { appendEntry } from '@/server/services/ledger'
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
