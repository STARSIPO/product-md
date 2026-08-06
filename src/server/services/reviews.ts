import 'server-only'
import { Prisma } from '@prisma/client'
import { db, transaction } from '@/server/db'
import { DomainError } from '@/server/actions/result'
import { AuthorizationError } from '@/server/auth/guards'
import { decodeJson, encodeJson } from '@/lib/json'
import { z } from 'zod'
import {
  BUYER_REVIEW_CRITERIA,
  SELLER_REVIEW_CRITERIA,
  type ReviewDirection,
} from '@/lib/constants'
import { notifyCompany } from './notifications'

/**
 * Reputation.
 *
 * One rule decides whether a review may exist at all, and it is enforced here rather
 * than in the form: **the author must be a participant of a COMPLETED deal, may write
 * exactly one review per (deal, direction), and may never review their own company.**
 * A crafted POST carrying someone else's dealId hits the same three checks as the
 * button does, because the author company is taken from the session and put into the
 * comparison — never read from the payload.
 *
 * The published average is denormalized onto Company for cheap sorting, and it is
 * recomputed *inside the same transaction* that inserts the review. Two reviews
 * landing at once therefore cannot leave `ratingAvg` describing a set of reviews that
 * never existed.
 */

const criterionScoreSchema = z.number().int().min(1).max(5)

/** Criteria differ by direction: a buyer cannot be rated on "delivery". */
export function criteriaFor(direction: ReviewDirection): readonly string[] {
  return direction === 'BUYER_TO_SELLER' ? BUYER_REVIEW_CRITERIA : SELLER_REVIEW_CRITERIA
}

function normalizeCriteria(
  direction: ReviewDirection,
  input: Record<string, number>,
): Record<string, number> {
  const allowed = criteriaFor(direction)
  const out: Record<string, number> = {}

  for (const key of allowed) {
    const parsed = criterionScoreSchema.safeParse(input[key])
    // A missing criterion is not fatal: the average still means something, and
    // forcing five taps before a rushed user can submit costs more reviews than it
    // gains precision.
    if (parsed.success) out[key] = parsed.data
  }

  return out
}

export interface CreateReviewInput {
  dealId: string
  overall: number
  criteria: Record<string, number>
  comment?: string
}

export interface ReviewEligibility {
  dealId: string
  dealNumber: string
  direction: ReviewDirection
  targetCompanyId: string
  targetCompanyName: string
  criteria: readonly string[]
}

/**
 * Answers "may this company review this deal right now" — used by the form to decide
 * what to render, and by `createReview` as the single gate before the write.
 */
export async function assertReviewAllowed(
  dealId: string,
  authorCompanyId: string,
): Promise<ReviewEligibility> {
  const deal = await db.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      number: true,
      status: true,
      buyerCompanyId: true,
      sellerCompanyId: true,
      buyerCompany: { select: { displayName: true } },
      sellerCompany: { select: { displayName: true } },
    },
  })

  // A deal the caller has nothing to do with is "not found", not "forbidden": the
  // existence of a deal id is itself information.
  if (!deal) throw new AuthorizationError('notFound')

  const isBuyer = deal.buyerCompanyId === authorCompanyId
  const isSeller = deal.sellerCompanyId === authorCompanyId
  if (!isBuyer && !isSeller) throw new AuthorizationError('notFound')

  if (deal.status !== 'COMPLETED') throw new DomainError('reviewNotAllowed')

  const direction: ReviewDirection = isBuyer ? 'BUYER_TO_SELLER' : 'SELLER_TO_BUYER'
  const targetCompanyId = isBuyer ? deal.sellerCompanyId : deal.buyerCompanyId
  if (targetCompanyId === authorCompanyId) throw new DomainError('reviewSelf')

  const existing = await db.review.findFirst({
    where: { dealId, direction },
    select: { id: true },
  })
  if (existing) throw new DomainError('reviewExists')

  return {
    dealId: deal.id,
    dealNumber: deal.number,
    direction,
    targetCompanyId,
    targetCompanyName: isBuyer
      ? deal.sellerCompany.displayName
      : deal.buyerCompany.displayName,
    criteria: criteriaFor(direction),
  }
}

export async function createReview(
  authorCompanyId: string,
  input: CreateReviewInput,
): Promise<{ id: string; targetCompanyId: string }> {
  const eligibility = await assertReviewAllowed(input.dealId, authorCompanyId)
  const criteria = normalizeCriteria(eligibility.direction, input.criteria)

  try {
    const id = await transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          dealId: eligibility.dealId,
          authorCompanyId,
          targetCompanyId: eligibility.targetCompanyId,
          direction: eligibility.direction,
          overall: input.overall,
          criteria: encodeJson(criteria),
          comment: input.comment ?? null,
          status: 'PUBLISHED',
        },
        select: { id: true },
      })

      // Recomputed, not incremented: an aggregate that is only ever nudged drifts the
      // first time a review is hidden by a moderator.
      const aggregate = await tx.review.aggregate({
        where: { targetCompanyId: eligibility.targetCompanyId, status: 'PUBLISHED' },
        _avg: { overall: true },
        _count: { _all: true },
      })

      await tx.company.update({
        where: { id: eligibility.targetCompanyId },
        data: {
          ratingAvg: Math.round((aggregate._avg.overall ?? 0) * 100) / 100,
          ratingCount: aggregate._count._all,
        },
      })

      return review.id
    })

    const author = await db.company.findUnique({
      where: { id: authorCompanyId },
      select: { displayName: true },
    })

    await notifyCompany(eligibility.targetCompanyId, {
      type: 'REVIEW_RECEIVED',
      params: { company: author?.displayName ?? '' },
      entityType: 'REVIEW',
      entityId: id,
    })

    return { id, targetCompanyId: eligibility.targetCompanyId }
  } catch (error) {
    // The unique index on [dealId, direction] is the real guard; the read above only
    // saves a round trip in the common case.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainError('reviewExists')
    }
    throw error
  }
}

export async function replyToReview(
  reviewId: string,
  companyId: string,
  body: string,
): Promise<void> {
  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: { id: true, targetCompanyId: true },
  })
  if (!review) throw new AuthorizationError('notFound')

  // Only the company that was reviewed answers, and only once.
  if (review.targetCompanyId !== companyId) throw new AuthorizationError('forbidden')

  try {
    await db.reviewReply.create({ data: { reviewId: review.id, body } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainError('conflict')
    }
    throw error
  }
}

// --- reads -------------------------------------------------------------------

const REVIEW_SELECT = {
  id: true,
  direction: true,
  overall: true,
  criteria: true,
  comment: true,
  createdAt: true,
  authorCompanyId: true,
  targetCompanyId: true,
  authorCompany: { select: { id: true, slug: true, displayName: true, logoKey: true } },
  deal: { select: { id: true, number: true } },
  reply: { select: { id: true, body: true, createdAt: true } },
} satisfies Prisma.ReviewSelect

export type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>

export async function listCompanyReviews(
  companyId: string,
  page = 1,
  pageSize = 10,
): Promise<{ items: ReviewRow[]; total: number }> {
  const where = { targetCompanyId: companyId, status: 'PUBLISHED' }

  const [total, items] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: REVIEW_SELECT,
    }),
  ])

  return { items, total }
}

const criteriaRecordSchema = z.record(z.number())

export function decodeCriteria(raw: string | null | undefined): Record<string, number> {
  return decodeJson(raw, criteriaRecordSchema, {})
}

export interface RatingSummary {
  average: number
  count: number
  /** criterion code -> mean score, only for criteria anybody actually rated */
  criteria: { code: string; average: number; count: number }[]
}

/** Powers `rating-summary.tsx`; reads the same PUBLISHED set as the stored average. */
export async function getRatingSummary(companyId: string): Promise<RatingSummary> {
  const reviews = await db.review.findMany({
    where: { targetCompanyId: companyId, status: 'PUBLISHED' },
    select: { overall: true, criteria: true },
  })

  if (reviews.length === 0) return { average: 0, count: 0, criteria: [] }

  const totals = new Map<string, { sum: number; count: number }>()
  let overallSum = 0

  for (const review of reviews) {
    overallSum += review.overall
    for (const [code, score] of Object.entries(decodeCriteria(review.criteria))) {
      if (!Number.isFinite(score)) continue
      const bucket = totals.get(code) ?? { sum: 0, count: 0 }
      bucket.sum += score
      bucket.count += 1
      totals.set(code, bucket)
    }
  }

  return {
    average: Math.round((overallSum / reviews.length) * 100) / 100,
    count: reviews.length,
    criteria: [...totals.entries()]
      .map(([code, bucket]) => ({
        code,
        average: Math.round((bucket.sum / bucket.count) * 100) / 100,
        count: bucket.count,
      }))
      .sort((a, b) => b.count - a.count),
  }
}
