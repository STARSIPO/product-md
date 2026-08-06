'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertCompany, assertConversationParticipant } from '@/server/auth/guards'
import { checkMessageRateLimit, checkWriteRateLimit } from '@/server/auth/rate-limit'
import { messageSchema, startConversationSchema } from '@/lib/validation'
import {
  getOrCreateConversation,
  markConversationRead,
  postMessage,
  setConversationBlocked,
  type MessageAttachmentInput,
} from '@/server/services/messaging'
import { recordProductContact } from '@/server/services/products'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Messaging mutations.
 *
 * Every function starts by re-deriving who the caller is. `assertConversationParticipant`
 * is the only door into an existing thread — no action here accepts a company id, a
 * side or a "canWrite" flag from the browser, so tampering with the payload changes
 * nothing about what the server will allow.
 */

export type StartConversationInput = z.input<typeof startConversationSchema>
export type SendMessageInput = z.input<typeof messageSchema>

/**
 * Attachment references are validated against the caller's own upload prefix.
 *
 * The upload route mints `message/<userId>/<random>.<ext>`; accepting any other shape
 * would let a crafted payload attach somebody else's private object to a message and
 * republish it through /api/files.
 */
const attachmentSchema = z.object({
  key: z.string().min(1).max(200),
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  sizeByte: z.number().int().positive().max(10 * 1024 * 1024),
})

const attachmentsSchema = z.array(attachmentSchema).max(5).default([])

function ownedAttachments(
  attachments: readonly z.infer<typeof attachmentSchema>[],
  userId: string,
): MessageAttachmentInput[] {
  const prefix = `message/${userId}/`
  return attachments
    .filter((file) => file.key.startsWith(prefix) && !file.key.includes('..'))
    .map((file) => ({
      key: file.key,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeByte: file.sizeByte,
    }))
}

/**
 * Opens (or reuses) the thread for a product / request / offer and posts the first
 * message. Returns the conversation id so the caller can navigate to it.
 */
export async function startConversationAction(
  input: StartConversationInput,
): Promise<ActionResult<string>> {
  return runAction(async () => {
    const user = await assertCompany()

    const limit = await checkMessageRateLimit(user.id)
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const parsed = parseInput(startConversationSchema, input)
    if (!parsed.productId && !parsed.requestId && !parsed.offerId) {
      return fail('validation')
    }

    const { id } = await getOrCreateConversation(
      {
        type: parsed.productId ? 'PRODUCT' : parsed.requestId ? 'REQUEST' : 'OFFER',
        productId: parsed.productId,
        requestId: parsed.requestId,
        offerId: parsed.offerId,
      },
      user.id,
      user.companyId,
    )

    await postMessage(id, user.id, parsed.body)

    // "How many buyers actually got in touch" is the seller's most useful metric.
    if (parsed.productId) await recordProductContact(parsed.productId)

    revalidatePath('/[locale]/messages', 'page')
    return ok(id)
  })
}

export async function sendMessageAction(
  input: SendMessageInput,
  attachments?: unknown,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const parsed = parseInput(messageSchema, input)

    // Participation first: an outsider must not learn whether the id even exists.
    const user = await assertConversationParticipant(parsed.conversationId)

    const limit = await checkMessageRateLimit(user.id)
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const files = ownedAttachments(parseInput(attachmentsSchema, attachments ?? []), user.id)

    await postMessage(parsed.conversationId, user.id, parsed.body, files)

    revalidatePath('/[locale]/messages/[id]', 'page')
    revalidatePath('/[locale]/messages', 'page')
    return ok()
  })
}

export async function markConversationReadAction(
  conversationId: string,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertConversationParticipant(conversationId)
    await markConversationRead(conversationId, user.id)
    revalidatePath('/[locale]/messages', 'page')
    return ok()
  })
}

/**
 * Blocking is per participant, not per company: it stops this thread only, and either
 * side can lift it again.
 */
export async function setConversationBlockedAction(
  conversationId: string,
  blocked: boolean,
): Promise<ActionResult<boolean>> {
  return runAction(async () => {
    const user = await assertConversationParticipant(conversationId)

    const limit = await checkWriteRateLimit(user.id, 'conversationBlock')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    await setConversationBlocked(conversationId, user.id, blocked)

    revalidatePath('/[locale]/messages/[id]', 'page')
    return ok(blocked)
  })
}
