'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, transaction } from '@/server/db'
import { assertCompany } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import {
  assertUploadAllowed,
  buildStorageKey,
  sniffMimeType,
  storage,
} from '@/server/storage'
import { MAX_DOCUMENT_BYTES } from '@/lib/constants'
import { documentSchema } from '@/lib/validation'
import { fail, formDataToObject, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Verification documents.
 *
 * Two rules hold everywhere in this module:
 *
 *   1. Documents go to PRIVATE storage and are only ever reachable through
 *      /api/files/<key>, which re-checks ownership on every request. The key is never
 *      handed to the browser as a URL of its own.
 *   2. Publishing a document is an explicit, per-document opt-in that defaults to OFF.
 *      What is public by default is the *badge* — the result of the check — not the
 *      registration certificate behind it.
 */

const idSchema = z.string().min(1, 'required').max(40)
const visibilitySchema = z.object({ documentId: idSchema, isPublic: z.boolean() })

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
}

export interface DocumentView {
  id: string
  type: string
  status: string
  fileName: string
}

export async function uploadDocument(formData: FormData): Promise<ActionResult<DocumentView>> {
  return runAction(async () => {
    const user = await assertCompany()

    const limit = await checkWriteRateLimit(user.id, 'document')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const entry = formData.get('file')
    if (!(entry instanceof File)) {
      return fail('validation', { fields: { file: 'required' } })
    }

    const fields = formDataToObject(formData)
    delete fields['file']
    const input = parseInput(documentSchema, fields)

    if (entry.size > MAX_DOCUMENT_BYTES) {
      return fail('fileTooLarge', {
        params: { size: Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024)) },
      })
    }

    const buffer = Buffer.from(await entry.arrayBuffer())

    // A stream can understate its length; judge the bytes actually received.
    if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
      return fail('fileTooLarge', {
        params: { size: Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024)) },
      })
    }

    // The declared Content-Type is attacker-controlled: it is only useful as something
    // to compare the sniffed format against, and a mismatch is a rejection.
    const sniffed = sniffMimeType(buffer)
    const extension = sniffed === null ? undefined : EXTENSION_BY_MIME[sniffed]
    if (sniffed === null || extension === undefined || sniffed !== entry.type) {
      return fail('fileTypeNotAllowed')
    }

    try {
      assertUploadAllowed(sniffed, buffer.byteLength, 'document')
    } catch {
      return fail('fileTypeNotAllowed')
    }

    const key = buildStorageKey('document', user.companyId, `document${extension}`)
    await storage.put({ key, body: buffer, contentType: sniffed, visibility: 'private' })

    const document = await transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          companyId: user.companyId,
          type: input.type,
          number: input.number ?? null,
          issuedAt: input.issuedAt ?? null,
          expiresAt: input.expiresAt ?? null,
          fileKey: key,
          // Kept for display only; it never becomes part of the storage key.
          fileName: entry.name.slice(0, 160),
          mimeType: sniffed,
          sizeByte: buffer.byteLength,
          status: 'PENDING',
          isPublic: input.isPublic ?? false,
        },
        select: { id: true, type: true, status: true, fileName: true },
      })

      await tx.documentHistory.create({
        data: {
          documentId: created.id,
          actorId: user.id,
          fromStatus: null,
          toStatus: 'PENDING',
        },
      })

      // Uploading paperwork puts the "documents checked" badge into review. An
      // already-approved badge is left alone — this must not be a way to reset it.
      await tx.verificationBadge.upsert({
        where: { companyId_type: { companyId: user.companyId, type: 'DOCUMENTS' } },
        create: { companyId: user.companyId, type: 'DOCUMENTS', status: 'PENDING' },
        update: {},
      })

      return created
    })

    revalidatePath('/[locale]/dashboard/verification', 'page')
    return ok(document)
  })
}

export async function deleteDocument(documentId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertCompany()
    const id = parseInput(idSchema, documentId)

    // Scoped by companyId: an id belonging to another company simply does not resolve.
    const document = await db.document.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, fileKey: true },
    })
    if (!document) return fail('notFound')

    await db.document.delete({ where: { id: document.id } })
    await storage.delete(document.fileKey, 'private').catch(() => undefined)

    revalidatePath('/[locale]/dashboard/verification', 'page')
    return ok()
  })
}

export async function setDocumentVisibility(
  documentId: string,
  isPublic: boolean,
): Promise<ActionResult<boolean>> {
  return runAction(async () => {
    const user = await assertCompany()
    const input = parseInput(visibilitySchema, { documentId, isPublic })

    const document = await db.document.findFirst({
      where: { id: input.documentId, companyId: user.companyId },
      select: { id: true },
    })
    if (!document) return fail('notFound')

    await db.document.update({
      where: { id: document.id },
      data: { isPublic: input.isPublic },
    })

    revalidatePath('/[locale]/dashboard/verification', 'page')
    revalidatePath('/[locale]/suppliers/[slug]', 'page')
    return ok(input.isPublic)
  })
}
