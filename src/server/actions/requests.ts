'use server'

import { revalidatePath } from 'next/cache'
import type { z } from 'zod'
import { db } from '@/server/db'
import { assertBuyer, assertOwnsRequest } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import { purchaseRequestSchema } from '@/lib/validation'
import { MAX_DOCUMENT_BYTES } from '@/lib/constants'
import {
  assertUploadAllowed,
  buildStorageKey,
  sniffMimeType,
  storage,
} from '@/server/storage'
import {
  createRequest,
  duplicateRequest,
  setRequestStatus,
  softDeleteRequest,
  updateRequest,
} from '@/server/services/requests'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Purchase-request mutations.
 *
 * Everything a buyer can do to their own RFQ. Nothing here reads or writes an Offer:
 * offer content lives behind src/server/services/offers.ts, which scopes every query to
 * a viewer, and a request action has no business seeing a supplier's price.
 */

/** The raw shape the wizard submits — strings for money and dates, before coercion. */
export type RequestFormInput = z.input<typeof purchaseRequestSchema>

export interface SavedRequest {
  id: string
  slug: string
  status: string
}

export async function createRequestAction(
  input: RequestFormInput,
  options: { publish: boolean },
): Promise<ActionResult<SavedRequest>> {
  return runAction(async () => {
    const user = await assertBuyer()

    const limit = await checkWriteRateLimit(user.id, 'request')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const parsed = parseInput(purchaseRequestSchema, input)
    const created = await createRequest(user.companyId, parsed, { publish: options.publish })

    revalidatePath('/[locale]/requests', 'page')
    revalidatePath('/[locale]/dashboard/requests', 'page')

    return ok(created)
  })
}

export async function updateRequestAction(
  requestId: string,
  input: RequestFormInput,
  options: { publish: boolean },
): Promise<ActionResult<SavedRequest>> {
  return runAction(async () => {
    const { user } = await assertOwnsRequest(requestId)

    const limit = await checkWriteRateLimit(user.id, 'request')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const parsed = parseInput(purchaseRequestSchema, input)
    const updated = await updateRequest(requestId, parsed, { publish: options.publish })

    revalidatePath('/[locale]/requests', 'page')
    revalidatePath('/[locale]/requests/[slug]', 'page')

    const status = await db.purchaseRequest.findUnique({
      where: { id: requestId },
      select: { status: true },
    })

    return ok({ ...updated, status: status?.status ?? 'DRAFT' })
  })
}

export async function setRequestStatusAction(
  requestId: string,
  status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED',
): Promise<ActionResult<void>> {
  return runAction(async () => {
    await assertOwnsRequest(requestId)
    await setRequestStatus(requestId, status)

    revalidatePath('/[locale]/requests', 'page')
    revalidatePath('/[locale]/requests/[slug]', 'page')
    return ok()
  })
}

export async function deleteRequestAction(requestId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    await assertOwnsRequest(requestId)
    await softDeleteRequest(requestId)

    revalidatePath('/[locale]/requests', 'page')
    return ok()
  })
}

/** "Repeat purchase" — clones a finished request into a fresh draft. */
export async function duplicateRequestAction(requestId: string): Promise<ActionResult<string>> {
  return runAction(async () => {
    const { companyId } = await assertOwnsRequest(requestId)
    const id = await duplicateRequest(requestId, companyId)

    revalidatePath('/[locale]/dashboard/requests', 'page')
    return ok(id)
  })
}

// --- attachments -------------------------------------------------------------

export interface RequestAttachmentView {
  id: string
  fileName: string
  sizeByte: number
}

/**
 * Stores specification files for a request.
 *
 * Uploaded bytes are sniffed and compared against the declared type before anything is
 * written: a declared Content-Type is attacker-controlled, and these files are later
 * served back to suppliers.
 */
export async function uploadRequestAttachments(
  requestId: string,
  formData: FormData,
): Promise<ActionResult<RequestAttachmentView[]>> {
  return runAction(async () => {
    const { user } = await assertOwnsRequest(requestId)

    const limit = await checkWriteRateLimit(user.id, 'requestAttachment')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File)
    if (files.length === 0) return ok([])

    const saved: RequestAttachmentView[] = []

    for (const file of files) {
      if (file.size > MAX_DOCUMENT_BYTES) {
        return fail('fileTooLarge', { params: { size: MAX_DOCUMENT_BYTES / (1024 * 1024) } })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const sniffed = sniffMimeType(buffer)
      if (sniffed === null || sniffed !== file.type) return fail('fileTypeNotAllowed')

      try {
        assertUploadAllowed(sniffed, file.size, 'document')
      } catch {
        return fail('fileTypeNotAllowed')
      }

      const key = buildStorageKey('request', requestId, file.name)
      await storage.put({ key, body: buffer, contentType: sniffed, visibility: 'private' })

      const row = await db.requestAttachment.create({
        data: {
          requestId,
          key,
          fileName: file.name.slice(0, 160),
          mimeType: sniffed,
          sizeByte: file.size,
        },
        select: { id: true, fileName: true, sizeByte: true },
      })

      saved.push(row)
    }

    revalidatePath('/[locale]/requests/[slug]', 'page')
    return ok(saved)
  })
}

export async function deleteRequestAttachment(attachmentId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const attachment = await db.requestAttachment.findUnique({
      where: { id: attachmentId },
      select: { key: true, requestId: true },
    })
    if (!attachment) return fail('notFound')

    // Ownership is re-checked against the request the file hangs off, never the id alone.
    await assertOwnsRequest(attachment.requestId)

    await db.requestAttachment.delete({ where: { id: attachmentId } })
    await storage.delete(attachment.key, 'private').catch(() => undefined)

    revalidatePath('/[locale]/requests/[slug]', 'page')
    return ok()
  })
}
