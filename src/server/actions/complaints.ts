'use server'

import { Prisma } from '@prisma/client'
import type { z } from 'zod'
import { db } from '@/server/db'
import { assertUser } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import { complaintSchema } from '@/lib/validation'
import { fail, ok, parseInput, runAction, type ActionResult } from './result'

/**
 * Reporting.
 *
 * A complaint form that writes a row nobody ever reads is worse than no form at all,
 * so this action does two things atomically-in-spirit: it records the `Complaint` and
 * it puts an OPEN `ModerationTask` in the queue the moderator actually works from.
 *
 * The task table carries `@@unique([entityType, entityId, status])`: a second report
 * about the same object does not create a second task, it joins the open one. That is
 * deliberate — ten reports about one listing should be one job, not ten.
 */

export type ComplaintInput = z.input<typeof complaintSchema>

/** Reports about these are worth a moderator's attention sooner. */
const HIGH_PRIORITY: readonly string[] = ['FRAUD', 'FAKE_DOCUMENTS', 'UNSAFE_PRODUCT', 'PROHIBITED']

export async function createComplaintAction(
  input: ComplaintInput,
): Promise<ActionResult<string>> {
  return runAction(async () => {
    const user = await assertUser()

    const limit = await checkWriteRateLimit(user.id, 'complaint')
    if (!limit.ok) return fail('rateLimited', { params: { seconds: limit.retryAfterSeconds } })

    const parsed = parseInput(complaintSchema, input)

    const complaint = await db.complaint.create({
      data: {
        reporterUserId: user.id,
        entityType: parsed.entityType,
        entityId: parsed.entityId,
        reason: parsed.reason,
        description: parsed.description ?? null,
        status: 'OPEN',
      },
      select: { id: true },
    })

    try {
      await db.moderationTask.create({
        data: {
          entityType: 'COMPLAINT',
          entityId: complaint.id,
          kind: 'COMPLAINT',
          status: 'OPEN',
          priority: HIGH_PRIORITY.includes(parsed.reason) ? 10 : 0,
        },
      })
    } catch (error) {
      // An open task for this complaint already exists — nothing left to do.
      const duplicate =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      if (!duplicate) throw error
    }

    return ok(complaint.id)
  })
}
