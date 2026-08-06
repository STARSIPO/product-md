'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/server/db'
import { assertUser } from '@/server/auth/guards'
import { ok, fail, runAction, type ActionResult } from './result'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'

/**
 * Favourites are per-user (not per-company): the buyer's procurement manager and the
 * owner keep separate shortlists even though they share a company profile.
 */

export async function toggleProductFavorite(productId: string): Promise<ActionResult<boolean>> {
  return runAction(async () => {
    const user = await assertUser()

    const limit = await checkWriteRateLimit(user.id, 'favorite')
    if (!limit.ok) {
      return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })
    }

    const existing = await db.favorite.findUnique({
      where: { userId_productId: { userId: user.id, productId } },
      select: { id: true },
    })

    if (existing) {
      await db.$transaction([
        db.favorite.delete({ where: { id: existing.id } }),
        db.product.update({
          where: { id: productId },
          data: { favoritesCount: { decrement: 1 } },
        }),
      ])
      revalidatePath('/[locale]/favorites', 'page')
      return ok(false)
    }

    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true },
    })
    if (!product) return fail('notFound')

    await db.$transaction([
      db.favorite.create({ data: { userId: user.id, productId } }),
      db.product.update({ where: { id: productId }, data: { favoritesCount: { increment: 1 } } }),
    ])

    revalidatePath('/[locale]/favorites', 'page')
    return ok(true)
  })
}

export async function toggleCompanyFavorite(companyId: string): Promise<ActionResult<boolean>> {
  return runAction(async () => {
    const user = await assertUser()

    const existing = await db.favorite.findUnique({
      where: { userId_companyId: { userId: user.id, companyId } },
      select: { id: true },
    })

    if (existing) {
      await db.favorite.delete({ where: { id: existing.id } })
      revalidatePath('/[locale]/favorites', 'page')
      return ok(false)
    }

    const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true } })
    if (!company) return fail('notFound')

    await db.favorite.create({ data: { userId: user.id, companyId } })
    revalidatePath('/[locale]/favorites', 'page')
    return ok(true)
  })
}

export async function saveSearch(input: {
  name: string
  query: string
  target: 'PRODUCT' | 'REQUEST'
}): Promise<ActionResult<string>> {
  return runAction(async () => {
    const user = await assertUser()

    const saved = await db.savedSearch.create({
      data: {
        userId: user.id,
        name: input.name.slice(0, 120),
        query: input.query.slice(0, 2000),
        target: input.target,
      },
      select: { id: true },
    })

    revalidatePath('/[locale]/favorites', 'page')
    return ok(saved.id)
  })
}

export async function deleteSavedSearch(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertUser()
    await db.savedSearch.deleteMany({ where: { id, userId: user.id } })
    revalidatePath('/[locale]/favorites', 'page')
    return ok()
  })
}

export async function updateSavedSearchNotifications(
  id: string,
  input: { notifyNew: boolean; notifyPriceDrop: boolean },
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertUser()
    await db.savedSearch.updateMany({
      where: { id, userId: user.id },
      data: { notifyNew: input.notifyNew, notifyPriceDrop: input.notifyPriceDrop },
    })
    revalidatePath('/[locale]/favorites', 'page')
    return ok()
  })
}
