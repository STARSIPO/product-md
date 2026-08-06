'use server'

import { revalidatePath } from 'next/cache'
import type { z } from 'zod'
import { assertCompany } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import { reviewReplySchema, reviewSchema } from '@/lib/validation'
import { createReview, replyToReview } from '@/server/services/reviews'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Review mutations.
 *
 * Neither action takes a target company, a direction or a deal side from the client.
 * All three are derived inside `createReview` from the deal row plus the session's
 * company, which is what makes "only a participant of a completed deal, once per
 * direction, never about yourself" enforceable rather than merely displayed.
 */

export type ReviewFormInput = z.input<typeof reviewSchema>
export type ReviewReplyInput = z.input<typeof reviewReplySchema>

export async function createReviewAction(input: ReviewFormInput): Promise<ActionResult<string>> {
  return runAction(async () => {
    const user = await assertCompany()

    const limit = await checkWriteRateLimit(user.id, 'review')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const parsed = parseInput(reviewSchema, input)

    const { id } = await createReview(user.companyId, {
      dealId: parsed.dealId,
      overall: parsed.overall,
      criteria: parsed.criteria,
      comment: parsed.comment,
    })

    revalidatePath('/[locale]/deals/[id]', 'page')
    revalidatePath('/[locale]/suppliers/[slug]', 'page')

    return ok(id)
  })
}

export async function replyToReviewAction(input: ReviewReplyInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertCompany()

    const limit = await checkWriteRateLimit(user.id, 'reviewReply')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const parsed = parseInput(reviewReplySchema, input)
    await replyToReview(parsed.reviewId, user.companyId, parsed.body)

    revalidatePath('/[locale]/suppliers/[slug]', 'page')
    return ok()
  })
}
