'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertModerator } from '@/server/auth/guards'
import { idSchema, moderationDecisionSchema } from '@/lib/validation'
import { requestIp } from '@/server/services/audit'
import {
  claimTask,
  decideComplaint,
  decideDocument,
  decideProduct,
  releaseTask,
  setReviewHidden,
} from '@/server/services/moderation'
import { ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Moderator mutations.
 *
 * Every entry point re-checks the role with `assertModerator()` — the client sends an
 * entity id and a verdict, never a role, and a crafted POST from a signed-in seller gets
 * the same treatment as one from the browser console.
 *
 * The decision itself lives in src/server/services/moderation.ts, which is what closes
 * the queue task, writes the AuditLog row and notifies the affected company. Nothing in
 * this file touches a table directly.
 */

export type ModerationDecisionInput = z.input<typeof moderationDecisionSchema>

function revalidateModeration(): void {
  revalidatePath('/[locale]/moderation', 'page')
  revalidatePath('/[locale]/moderation/products', 'page')
  revalidatePath('/[locale]/moderation/documents', 'page')
  revalidatePath('/[locale]/moderation/complaints', 'page')
  revalidatePath('/[locale]/moderation/reviews', 'page')
  revalidatePath('/[locale]/admin', 'page')
}

export async function claimTaskAction(taskId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertModerator()
    await claimTask(parseInput(idSchema, taskId), user.id)

    revalidateModeration()
    return ok()
  })
}

export async function releaseTaskAction(taskId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertModerator()
    await releaseTask(parseInput(idSchema, taskId), user.id)

    revalidateModeration()
    return ok()
  })
}

/**
 * Listing verdict. `moderationDecisionSchema` is what makes the comment mandatory for
 * everything except APPROVE — the seller has to be told what to fix.
 */
export async function decideProductAction(
  input: ModerationDecisionInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertModerator()
    const parsed = parseInput(moderationDecisionSchema, input)

    await decideProduct({
      productId: parsed.entityId,
      decision: parsed.decision,
      comment: parsed.comment,
      actorId: user.id,
      ip: requestIp(),
    })

    revalidateModeration()
    revalidatePath('/[locale]/products/[slug]', 'page')
    return ok()
  })
}

export async function decideDocumentAction(
  input: ModerationDecisionInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertModerator()
    const parsed = parseInput(moderationDecisionSchema, input)

    await decideDocument({
      documentId: parsed.entityId,
      decision: parsed.decision,
      comment: parsed.comment,
      actorId: user.id,
      ip: requestIp(),
    })

    revalidateModeration()
    return ok()
  })
}

/**
 * A complaint always ends with a written resolution, whether it is upheld or refused:
 * the reporter receives that text, so "rejected" on its own is not an acceptable answer.
 */
const complaintDecisionSchema = z.object({
  entityId: idSchema,
  resolve: z.boolean(),
  comment: z.string().trim().min(1, 'required').max(2000, 'maxLength'),
})

export type ComplaintDecisionInput = z.input<typeof complaintDecisionSchema>

export async function decideComplaintAction(
  input: ComplaintDecisionInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertModerator()
    const parsed = parseInput(complaintDecisionSchema, input)

    await decideComplaint({
      complaintId: parsed.entityId,
      resolve: parsed.resolve,
      resolution: parsed.comment,
      actorId: user.id,
      ip: requestIp(),
    })

    revalidateModeration()
    return ok()
  })
}

/** Hiding needs a reason; restoring does not. */
const reviewDecisionSchema = z
  .object({
    entityId: idSchema,
    hidden: z.boolean(),
    comment: z
      .string()
      .trim()
      .max(2000, 'maxLength')
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
  })
  .refine((data) => !data.hidden || (data.comment ?? '').length > 0, {
    message: 'required',
    path: ['comment'],
  })

export type ReviewDecisionInput = z.input<typeof reviewDecisionSchema>

export async function setReviewHiddenAction(
  input: ReviewDecisionInput,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertModerator()
    const parsed = parseInput(reviewDecisionSchema, input)

    await setReviewHidden({
      reviewId: parsed.entityId,
      hidden: parsed.hidden,
      comment: parsed.comment,
      actorId: user.id,
      ip: requestIp(),
    })

    revalidateModeration()
    return ok()
  })
}
