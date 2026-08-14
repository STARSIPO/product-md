'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { COMPANY_KINDS, RETAIL_ORDER_STATUSES } from '@/lib/constants'
import { idSchema } from '@/lib/validation'
import { assertAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { recordAudit, requestIp } from '@/server/services/audit'
import { setProductSale } from '@/server/services/sales'
import { DomainError, ok, parseInput, runAction, type ActionResult } from '@/server/actions/result'

/**
 * Administrative mutations for the retail half of the marketplace.
 *
 * They live beside the screens that use them rather than in `src/server/actions/admin.ts`
 * only because that file is already two thousand lines of unrelated queues; the three
 * rules it states hold here unchanged and without exception:
 *
 *   1. `assertAdmin()` first — the role is re-read from the session row, never taken
 *      from the payload.
 *   2. `recordAudit(...)` last. Company kind decides which sections of the platform a
 *      company can reach, and an order status is the only thing a shopper has to go on,
 *      so both are exactly the kind of change somebody has to be able to trace later.
 *   3. Nothing here touches money. A retail order is settled between the shopper and the
 *      shop; the platform records it and stays out of the payment.
 */

function revalidateAdmin(...segments: string[]): void {
  revalidatePath('/[locale]/admin', 'page')
  for (const segment of segments) {
    revalidatePath(`/[locale]/admin/${segment}`, 'page')
  }
}

// --- company kind ------------------------------------------------------------

const companyKindSchema = z.object({
  companyId: idSchema,
  kind: z.enum(COMPANY_KINDS),
})

export type CompanyKindInput = z.input<typeof companyKindSchema>

/**
 * Corrects what kind of business a company is.
 *
 * `kind` is metadata, not a permission: it decides which sections a company is *offered*
 * (only a retail-capable kind may switch the storefront on), while `isRetail` remains the
 * company's own decision. So this action never flips `isRetail` as a side effect — an
 * operator retyping a farm as HORECA must not silently close a storefront that already
 * has open orders. The storefront is switched off by its owner, or by suspending the
 * company, both of which are separate audited events.
 */
export async function setCompanyKindAction(input: CompanyKindInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(companyKindSchema, input)

    const company = await db.company.findUnique({
      where: { id: parsed.companyId },
      select: { id: true, kind: true },
    })
    if (!company) throw new DomainError('notFound')
    if (company.kind === parsed.kind) return ok()

    await db.company.update({ where: { id: company.id }, data: { kind: parsed.kind } })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.company.kind',
      entityType: 'COMPANY',
      entityId: company.id,
      oldValue: { kind: company.kind },
      newValue: { kind: parsed.kind },
      ip: requestIp(),
    })

    revalidateAdmin('companies')
    return ok()
  })
}

// --- discounts ---------------------------------------------------------------

/**
 * Ends a discount on somebody else's listing.
 *
 * The reason this exists at all: «Акции» is a fairness surface — a listing is there only
 * because the seller lowered the price — and the one way to abuse it is to inflate
 * `oldPriceBani` so a normal price reads as a saving. Pulling the whole listing for that
 * is disproportionate; ending the fake discount is not.
 *
 * The restore itself goes through `setProductSale`, so "clearing a sale puts the previous
 * price back" is defined once and cannot drift between the seller's editor and this
 * button.
 */
export async function clearProductSaleAction(productId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const id = parseInput(idSchema, productId)

    const product = await db.product.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        priceBani: true,
        oldPriceBani: true,
        discountEndsAt: true,
      },
    })
    if (!product) throw new DomainError('notFound')
    if (product.oldPriceBani === null) throw new DomainError('conflict')

    await setProductSale(product.id, product.companyId, { salePriceBani: null, endsAt: null })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.product.sale.clear',
      entityType: 'PRODUCT',
      entityId: product.id,
      oldValue: {
        priceBani: product.priceBani,
        oldPriceBani: product.oldPriceBani,
        discountEndsAt: product.discountEndsAt,
      },
      newValue: { priceBani: product.oldPriceBani, oldPriceBani: null, discountEndsAt: null },
      ip: requestIp(),
    })

    revalidateAdmin('products')
    revalidatePath('/[locale]/sales', 'page')
    revalidatePath('/[locale]', 'page')
    return ok()
  })
}

// --- retail orders -----------------------------------------------------------

const retailOrderStatusAdminSchema = z
  .object({
    orderId: idSchema,
    status: z.enum(RETAIL_ORDER_STATUSES),
    reason: z
      .string()
      .trim()
      .max(500, 'maxLength')
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
  })
  .refine((data) => data.status !== 'CANCELLED' || (data.reason ?? '').length > 0, {
    message: 'required',
    path: ['reason'],
  })

export type RetailOrderStatusAdminInput = z.input<typeof retailOrderStatusAdminSchema>

/**
 * Moves a retail order to any status, bypassing `RETAIL_ORDER_TRANSITIONS`.
 *
 * Deliberate, and the same choice the listing and deal overrides make: the transition
 * table describes what a shop may do in the normal course of business, and this button
 * exists precisely for what it cannot express — an order marked delivered by a mistyped
 * tap, a shop that went quiet with a shopper's order stuck in PREPARING. Cancelling
 * demands a written reason because the shopper reads it.
 */
export async function setRetailOrderStatusAdminAction(
  input: RetailOrderStatusAdminInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await assertAdmin()
    const parsed = parseInput(retailOrderStatusAdminSchema, input)

    const order = await db.retailOrder.findUnique({
      where: { id: parsed.orderId },
      select: { id: true, status: true, cancelReason: true },
    })
    if (!order) throw new DomainError('notFound')

    const now = new Date()
    await db.retailOrder.update({
      where: { id: order.id },
      data: {
        status: parsed.status,
        ...(parsed.status === 'CONFIRMED' ? { confirmedAt: now } : {}),
        ...(parsed.status === 'DELIVERED' ? { deliveredAt: now } : {}),
        ...(parsed.status === 'CANCELLED'
          ? { cancelledAt: now, cancelReason: parsed.reason ?? null }
          : {}),
      },
    })

    await recordAudit({
      actorId: actor.id,
      action: 'admin.retailOrder.status',
      entityType: 'RETAIL_ORDER',
      entityId: order.id,
      oldValue: { status: order.status, cancelReason: order.cancelReason },
      newValue: {
        status: parsed.status,
        cancelReason: parsed.status === 'CANCELLED' ? (parsed.reason ?? null) : order.cancelReason,
      },
      reason: parsed.reason ?? null,
      ip: requestIp(),
    })

    revalidateAdmin('orders')
    revalidatePath('/[locale]/dashboard/orders', 'page')
    revalidatePath('/[locale]/orders', 'page')
    return ok()
  })
}
