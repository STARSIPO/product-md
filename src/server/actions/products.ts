'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/server/db'
import { assertOwnsProduct, assertSeller } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import {
  createProduct,
  duplicateProduct as duplicateProductRecord,
  setProductStatus,
  softDeleteProduct,
  updateProduct as updateProductRecord,
} from '@/server/services/products'
import { idSchema, productSchema } from '@/lib/validation'
import { MAX_PRODUCT_PHOTOS } from '@/lib/constants'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Seller listing actions.
 *
 * Everything the wizard sends is untrusted: the company the listing is filed under
 * comes from `assertSeller()` and never from the payload, photo keys are accepted only
 * when they sit under this company's own upload prefix, and attached documents are
 * re-read from the database so a seller cannot staple someone else's certificate — or
 * their own still-pending one — to a listing.
 *
 * The wizard posts money as the raw string the seller typed ("95,50"); `productSchema`
 * is what turns it into integer bani, on the server, every time.
 */

/** A photo the client has already uploaded through /api/uploads/product-photo. */
const productPhotoSchema = z.object({
  key: z.string().trim().min(1, 'required').max(200, 'maxLength'),
  alt: z
    .string()
    .trim()
    .max(200, 'maxLength')
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
})

const productActionSchema = productSchema.extend({
  photos: z.array(productPhotoSchema).max(MAX_PRODUCT_PHOTOS, 'max').optional(),
  documentIds: z.array(idSchema).max(20, 'max').optional(),
})

type ProductActionValues = z.infer<typeof productActionSchema>

interface SavedProduct {
  id: string
  slug: string
  status: string
}

// --- shared helpers ----------------------------------------------------------

/**
 * The catalogue, the listing page and the seller's own lists all render from the same
 * row, so a publish has to drop all three. Paths are route patterns, not concrete URLs:
 * one call then covers /ru and /ro.
 */
function revalidateListing(): void {
  revalidatePath('/[locale]/products', 'page')
  revalidatePath('/[locale]/products/[slug]', 'page')
  revalidatePath('/[locale]/dashboard/products', 'page')
}

/**
 * Replaces the photo set, in the order the seller arranged it — index 0 is the cover.
 *
 * A key is only accepted when it starts with this company's own upload prefix. The
 * upload route mints keys as `product/<companyId>/<random>.<ext>`, so a crafted payload
 * cannot point a listing at another company's object or at a private document.
 */
async function syncPhotos(
  productId: string,
  companyId: string,
  photos: ProductActionValues['photos'],
): Promise<void> {
  if (photos === undefined) return

  const prefix = `product/${companyId}/`
  const accepted = photos
    .filter((photo) => photo.key.startsWith(prefix) && !photo.key.includes('..'))
    .slice(0, MAX_PRODUCT_PHOTOS)

  await db.productPhoto.deleteMany({ where: { productId } })
  if (accepted.length === 0) return

  await db.productPhoto.createMany({
    data: accepted.map((photo, index) => ({
      productId,
      key: photo.key,
      alt: photo.alt ?? null,
      sortOrder: index,
    })),
  })
}

/** Attaches company documents — only ones this company owns and a moderator approved. */
async function syncDocuments(
  productId: string,
  companyId: string,
  documentIds: ProductActionValues['documentIds'],
): Promise<void> {
  if (documentIds === undefined) return

  await db.productDocument.deleteMany({ where: { productId } })
  if (documentIds.length === 0) return

  const approved = await db.document.findMany({
    where: { id: { in: documentIds }, companyId, status: 'APPROVED' },
    select: { id: true },
  })
  if (approved.length === 0) return

  await db.productDocument.createMany({
    data: approved.map((document) => ({ productId, documentId: document.id })),
  })
}

// --- create ------------------------------------------------------------------

/** Saves a listing without publishing it. The row lands in DRAFT and stays private. */
export async function saveProductDraft(input: unknown): Promise<ActionResult<SavedProduct>> {
  return runAction(async () => {
    const user = await assertSeller()

    const limit = await checkWriteRateLimit(user.id, 'product')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const values = parseInput(productActionSchema, input)

    const product = await createProduct(user.companyId, values, { publish: false })
    await syncPhotos(product.id, user.companyId, values.photos)
    await syncDocuments(product.id, user.companyId, values.documentIds)

    revalidateListing()
    return ok(product)
  })
}

/**
 * Publishes a new listing. Whether that means PENDING or ACTIVE is decided by the
 * REQUIRE_MODERATION flag inside the service — never by the client.
 */
export async function publishProduct(input: unknown): Promise<ActionResult<SavedProduct>> {
  return runAction(async () => {
    const user = await assertSeller()

    const limit = await checkWriteRateLimit(user.id, 'product')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const values = parseInput(productActionSchema, input)

    const product = await createProduct(user.companyId, values, { publish: true })
    await syncPhotos(product.id, user.companyId, values.photos)
    await syncDocuments(product.id, user.companyId, values.documentIds)

    revalidateListing()
    return ok(product)
  })
}

// --- update ------------------------------------------------------------------

export async function updateProductAction(
  productId: string,
  input: unknown,
  options: { publish: boolean },
): Promise<ActionResult<SavedProduct>> {
  return runAction(async () => {
    const user = await assertSeller()

    const limit = await checkWriteRateLimit(user.id, 'product')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    // Ownership is re-read from the row, not taken from the form.
    const owner = await assertOwnsProduct(productId)
    const values = parseInput(productActionSchema, input)

    const isStaff = owner.user.role === 'ADMIN' || owner.user.role === 'MODERATOR'
    const product = await updateProductRecord(productId, values, {
      publish: options.publish,
      isStaff,
    })

    await syncPhotos(product.id, owner.companyId, values.photos)
    await syncDocuments(product.id, owner.companyId, values.documentIds)

    revalidateListing()
    return ok(product)
  })
}

// --- lifecycle wrappers ------------------------------------------------------

export async function pauseProduct(productId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    await assertSeller()
    await assertOwnsProduct(productId)

    const product = await db.product.findUnique({
      where: { id: productId },
      select: { status: true },
    })
    if (!product || product.status !== 'ACTIVE') return fail('conflict')

    await setProductStatus(productId, 'PAUSED')
    revalidateListing()
    return ok()
  })
}

export async function resumeProduct(productId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    await assertSeller()
    await assertOwnsProduct(productId)

    const product = await db.product.findUnique({
      where: { id: productId },
      select: { status: true },
    })
    if (!product || product.status !== 'PAUSED') return fail('conflict')

    await setProductStatus(productId, 'ACTIVE')
    revalidateListing()
    return ok()
  })
}

export async function archiveProduct(productId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    await assertSeller()
    await assertOwnsProduct(productId)

    await setProductStatus(productId, 'ARCHIVED')
    revalidateListing()
    return ok()
  })
}

/** Copies a listing into a fresh DRAFT so a seller can vary one field and republish. */
export async function duplicateProduct(
  productId: string,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await assertSeller()

    const limit = await checkWriteRateLimit(user.id, 'product')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const { companyId } = await assertOwnsProduct(productId)
    const id = await duplicateProductRecord(productId, companyId)

    revalidateListing()
    return ok({ id })
  })
}

/** Soft delete: the row survives for dispute history, the catalogue stops seeing it. */
export async function deleteProduct(productId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    await assertSeller()
    await assertOwnsProduct(productId)

    await softDeleteProduct(productId)
    revalidateListing()
    return ok()
  })
}
