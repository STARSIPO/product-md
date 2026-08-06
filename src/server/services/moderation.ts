import 'server-only'
import type { Prisma } from '@prisma/client'
import { db, transaction, type Tx } from '@/server/db'
import { env } from '@/env'
import { DomainError } from '@/server/actions/result'
import { DEFAULT_LOCALE, localePath } from '@/lib/i18n/config'
import { notify, notifyCompany } from '@/server/services/notifications'
import { recordAudit } from './audit'
import type { DocumentStatus, ProductStatus, VerificationType } from '@/lib/constants'

/**
 * Moderation queue and decisions.
 *
 * Two invariants shape this module.
 *
 * 1. Claiming is atomic. `ModerationTask` carries @@unique([entityType, entityId, status]),
 *    and a claim is an `updateMany` that keeps `status: 'OPEN'` in the WHERE clause — so
 *    when two moderators press "take" on the same row, exactly one update matches and the
 *    other is told the task is gone. A read-then-write would let both of them start
 *    reviewing the same listing.
 *
 * 2. A decision is never just a status change. Each one closes the task, writes an
 *    AuditLog row and tells the affected company what happened and why. The moderator
 *    comment is mandatory everywhere except APPROVE (enforced by `moderationDecisionSchema`)
 *    and it is the exact text the seller reads, so it travels into `moderatorComment`
 *    and into the email — the user never receives a bare "rejected".
 */

export type Decision = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | 'BLOCK'

export const MODERATION_ENTITY_TYPES = ['PRODUCT', 'DOCUMENT', 'COMPLAINT', 'REVIEW'] as const
export type ModerationEntityType = (typeof MODERATION_ENTITY_TYPES)[number]

export const QUEUE_PAGE_SIZE = 25

export interface ActorContext {
  actorId: string
  ip?: string | null
}

// --- task lifecycle ----------------------------------------------------------

/**
 * Takes a task off the shared queue.
 *
 * `status: 'OPEN'` inside the WHERE is the lock: the database decides the winner, and a
 * zero-row result means somebody else already has it.
 */
export async function claimTask(taskId: string, userId: string): Promise<void> {
  const result = await db.moderationTask.updateMany({
    where: { id: taskId, status: 'OPEN' },
    data: { status: 'CLAIMED', assignedToId: userId },
  })

  if (result.count === 0) throw new DomainError('conflict')

  await recordAudit({
    actorId: userId,
    action: 'moderation.task.claim',
    entityType: 'MODERATION_TASK',
    entityId: taskId,
    oldValue: { status: 'OPEN', assignedToId: null },
    newValue: { status: 'CLAIMED', assignedToId: userId },
  })
}

/** Puts a claimed task back so another moderator can pick it up. */
export async function releaseTask(taskId: string, userId: string): Promise<void> {
  const result = await db.moderationTask.updateMany({
    where: { id: taskId, status: 'CLAIMED', assignedToId: userId },
    data: { status: 'OPEN', assignedToId: null },
  })

  if (result.count === 0) throw new DomainError('conflict')

  await recordAudit({
    actorId: userId,
    action: 'moderation.task.release',
    entityType: 'MODERATION_TASK',
    entityId: taskId,
    oldValue: { status: 'CLAIMED', assignedToId: userId },
    newValue: { status: 'OPEN', assignedToId: null },
  })
}

/**
 * Marks every outstanding task for an entity resolved.
 *
 * The unique index allows only one row per (entityType, entityId, status), so an older
 * DONE row from a previous review round is deleted first, and if both an OPEN and a
 * CLAIMED task exist (the owner edited a listing while it was being reviewed) the extra
 * rows are dropped rather than updated into a collision.
 */
async function closeTasks(
  tx: Tx,
  entityType: string,
  entityId: string,
  actorId: string,
): Promise<void> {
  const outstanding = await tx.moderationTask.findMany({
    where: { entityType, entityId, status: { in: ['OPEN', 'CLAIMED'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })

  const [keep, ...duplicates] = outstanding
  if (!keep) return

  await tx.moderationTask.deleteMany({ where: { entityType, entityId, status: 'DONE' } })

  if (duplicates.length > 0) {
    await tx.moderationTask.deleteMany({
      where: { id: { in: duplicates.map((task) => task.id) } },
    })
  }

  await tx.moderationTask.update({
    where: { id: keep.id },
    data: { status: 'DONE', assignedToId: actorId, resolvedAt: new Date() },
  })
}

// --- queue -------------------------------------------------------------------

export interface QueueTask {
  id: string
  entityType: string
  entityId: string
  kind: string
  status: string
  priority: number
  createdAt: Date
  assignedTo: { id: string; name: string } | null
  /** Free text already fit for display — a listing title, a file name, a company. */
  label: string
  /** Domain code the page has to translate (document type, complaint reason). */
  code: string | null
  companyName: string | null
}

export interface QueuePage {
  items: QueueTask[]
  total: number
  page: number
  pageCount: number
}

export async function listQueue(
  options: {
    entityType?: string | undefined
    status?: string | undefined
    page?: number
    pageSize?: number
  } = {},
): Promise<QueuePage> {
  const pageSize = Math.min(Math.max(options.pageSize ?? QUEUE_PAGE_SIZE, 1), 100)
  const page = Math.max(options.page ?? 1, 1)

  const where: Prisma.ModerationTaskWhereInput = {
    ...(options.entityType ? { entityType: options.entityType } : {}),
    status: options.status ?? { in: ['OPEN', 'CLAIMED'] },
  }

  const [total, tasks] = await Promise.all([
    db.moderationTask.count({ where }),
    db.moderationTask.findMany({
      where,
      // Priority first (a fraud report outranks a routine listing), then oldest first:
      // nothing should be able to sit in the queue indefinitely.
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        kind: true,
        status: true,
        priority: true,
        createdAt: true,
        assignedTo: { select: { id: true, name: true } },
      },
    }),
  ])

  const descriptions = await describeEntities(
    tasks.map((task) => ({ entityType: task.entityType, entityId: task.entityId })),
  )

  return {
    items: tasks.map((task) => {
      const description = descriptions.get(`${task.entityType}:${task.entityId}`)
      return {
        ...task,
        label: description?.label ?? task.entityId,
        code: description?.code ?? null,
        companyName: description?.companyName ?? null,
      }
    }),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export interface EntityDescription {
  label: string
  code: string | null
  companyName: string | null
}

/**
 * Resolves display labels for a mixed batch of queue rows with one query per table
 * rather than one per row.
 */
export async function describeEntities(
  refs: readonly { entityType: string; entityId: string }[],
): Promise<Map<string, EntityDescription>> {
  const out = new Map<string, EntityDescription>()
  if (refs.length === 0) return out

  const idsByType = new Map<string, string[]>()
  for (const ref of refs) {
    const list = idsByType.get(ref.entityType) ?? []
    list.push(ref.entityId)
    idsByType.set(ref.entityType, list)
  }

  const productIds = idsByType.get('PRODUCT') ?? []
  const documentIds = idsByType.get('DOCUMENT') ?? []
  const complaintIds = idsByType.get('COMPLAINT') ?? []
  const reviewIds = idsByType.get('REVIEW') ?? []
  const requestIds = idsByType.get('REQUEST') ?? []
  const companyIds = idsByType.get('COMPANY') ?? []

  const [products, documents, complaints, reviews, requests, companies] = await Promise.all([
    productIds.length > 0
      ? db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, title: true, company: { select: { displayName: true } } },
        })
      : [],
    documentIds.length > 0
      ? db.document.findMany({
          where: { id: { in: documentIds } },
          select: {
            id: true,
            type: true,
            fileName: true,
            company: { select: { displayName: true } },
          },
        })
      : [],
    complaintIds.length > 0
      ? db.complaint.findMany({
          where: { id: { in: complaintIds } },
          select: { id: true, reason: true, entityType: true, entityId: true },
        })
      : [],
    reviewIds.length > 0
      ? db.review.findMany({
          where: { id: { in: reviewIds } },
          select: {
            id: true,
            comment: true,
            overall: true,
            targetCompany: { select: { displayName: true } },
          },
        })
      : [],
    requestIds.length > 0
      ? db.purchaseRequest.findMany({
          where: { id: { in: requestIds } },
          select: { id: true, title: true, company: { select: { displayName: true } } },
        })
      : [],
    companyIds.length > 0
      ? db.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, displayName: true },
        })
      : [],
  ])

  for (const row of products) {
    out.set(`PRODUCT:${row.id}`, {
      label: row.title,
      code: null,
      companyName: row.company.displayName,
    })
  }
  for (const row of documents) {
    out.set(`DOCUMENT:${row.id}`, {
      label: row.fileName,
      code: row.type,
      companyName: row.company.displayName,
    })
  }
  for (const row of complaints) {
    out.set(`COMPLAINT:${row.id}`, {
      label: `${row.entityType} · ${row.entityId}`,
      code: row.reason,
      companyName: null,
    })
  }
  for (const row of reviews) {
    out.set(`REVIEW:${row.id}`, {
      label: row.comment ?? `${row.overall}/5`,
      code: null,
      companyName: row.targetCompany.displayName,
    })
  }
  for (const row of requests) {
    out.set(`REQUEST:${row.id}`, {
      label: row.title,
      code: null,
      companyName: row.company.displayName,
    })
  }
  for (const row of companies) {
    out.set(`COMPANY:${row.id}`, {
      label: row.displayName,
      code: null,
      companyName: row.displayName,
    })
  }

  return out
}

/** Open-task counts per entity type — drives the queue tabs and the admin dashboard. */
export async function getQueueCounts(): Promise<Record<string, number> & { total: number }> {
  const rows = await db.moderationTask.groupBy({
    by: ['entityType'],
    where: { status: { in: ['OPEN', 'CLAIMED'] } },
    _count: { entityType: true },
  })

  const counts: Record<string, number> & { total: number } = { total: 0 }
  for (const row of rows) {
    counts[row.entityType] = row._count.entityType
    counts.total += row._count.entityType
  }
  return counts
}

/** The single open/claimed task for an entity, if the queue has one. */
export async function findTaskFor(
  entityType: string,
  entityId: string,
): Promise<{ id: string; status: string; assignedTo: { id: string; name: string } | null } | null> {
  return db.moderationTask.findFirst({
    where: { entityType, entityId, status: { in: ['OPEN', 'CLAIMED'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, assignedTo: { select: { id: true, name: true } } },
  })
}

// --- product decisions -------------------------------------------------------

const PRODUCT_STATUS_BY_DECISION = {
  APPROVE: 'ACTIVE',
  REJECT: 'REJECTED',
  REQUEST_CHANGES: 'CHANGES_REQUESTED',
  BLOCK: 'BLOCKED',
} as const satisfies Record<Decision, ProductStatus>

export async function decideProduct(
  input: { productId: string; decision: Decision; comment?: string | undefined } & ActorContext,
): Promise<void> {
  const product = await db.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      moderatorComment: true,
      companyId: true,
      publishedAt: true,
    },
  })
  if (!product) throw new DomainError('notFound')

  const status = PRODUCT_STATUS_BY_DECISION[input.decision]
  const approved = input.decision === 'APPROVE'
  const comment = input.comment ?? null

  await transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: {
        status,
        moderatorComment: comment,
        ...(approved ? { publishedAt: new Date(), pausedForBalance: false } : {}),
      },
    })
    await closeTasks(tx, 'PRODUCT', product.id, input.actorId)
  })

  await recordAudit({
    actorId: input.actorId,
    action: `moderation.product.${input.decision.toLowerCase()}`,
    entityType: 'PRODUCT',
    entityId: product.id,
    oldValue: { status: product.status, moderatorComment: product.moderatorComment },
    newValue: { status, moderatorComment: comment },
    reason: comment,
    ip: input.ip ?? undefined,
  })

  await notifyCompany(product.companyId, {
    type: 'MODERATION_RESULT',
    params: { title: product.title, status },
    entityType: 'PRODUCT',
    entityId: product.id,
    url: localePath(DEFAULT_LOCALE, 'products', product.slug),
    email: (locale) => ({
      template: 'moderationDecision',
      params: {
        subjectTitle: product.title,
        approved,
        ...(comment ? { reason: comment } : {}),
        url: `${env.APP_URL}${localePath(locale, 'products', product.slug)}`,
      },
    }),
  })
}

// --- document decisions ------------------------------------------------------

const DOCUMENT_STATUS_BY_DECISION = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  REQUEST_CHANGES: 'CHANGES_REQUESTED',
  // A document has no "blocked" state; refusing it outright is a rejection.
  BLOCK: 'REJECTED',
} as const satisfies Record<Decision, DocumentStatus>

/**
 * Which public badge an approved document grants. Everything that proves the company
 * exists and is allowed to trade rolls up into one DOCUMENTS badge; food-safety (ANSA)
 * and banking details are separate signals buyers look for specifically.
 */
const BADGE_BY_DOCUMENT_TYPE: Record<string, VerificationType> = {
  REGISTRATION: 'DOCUMENTS',
  PERMIT: 'DOCUMENTS',
  CERTIFICATE: 'DOCUMENTS',
  ORIGIN: 'DOCUMENTS',
  OTHER: 'DOCUMENTS',
  ANSA: 'ANSA',
  BANK: 'BANK',
}

export function badgeForDocumentType(type: string): VerificationType {
  return BADGE_BY_DOCUMENT_TYPE[type] ?? 'DOCUMENTS'
}

export async function decideDocument(
  input: { documentId: string; decision: Decision; comment?: string | undefined } & ActorContext,
): Promise<void> {
  const document = await db.document.findUnique({
    where: { id: input.documentId },
    select: {
      id: true,
      companyId: true,
      type: true,
      fileName: true,
      status: true,
      moderatorComment: true,
      expiresAt: true,
    },
  })
  if (!document) throw new DomainError('notFound')

  const status = DOCUMENT_STATUS_BY_DECISION[input.decision]
  const approved = input.decision === 'APPROVE'
  const comment = input.comment ?? null
  const badgeType = badgeForDocumentType(document.type)
  const grantedAt = new Date()

  await transaction(async (tx) => {
    await tx.document.update({
      where: { id: document.id },
      data: { status, moderatorComment: comment },
    })

    // The history row is written for every decision, approved or not: a company must be
    // able to show what was asked of it and when.
    await tx.documentHistory.create({
      data: {
        documentId: document.id,
        actorId: input.actorId,
        fromStatus: document.status,
        toStatus: status,
        comment,
      },
    })

    if (approved) {
      await tx.verificationBadge.upsert({
        where: { companyId_type: { companyId: document.companyId, type: badgeType } },
        create: {
          companyId: document.companyId,
          type: badgeType,
          status: 'APPROVED',
          grantedAt,
          expiresAt: document.expiresAt,
          note: comment,
        },
        // Re-approving a renewed document refreshes the badge instead of stacking a
        // second one — the unique (companyId, type) index is what guarantees that.
        update: { status: 'APPROVED', grantedAt, expiresAt: document.expiresAt },
      })
    }

    await closeTasks(tx, 'DOCUMENT', document.id, input.actorId)
  })

  await recordAudit({
    actorId: input.actorId,
    action: `moderation.document.${input.decision.toLowerCase()}`,
    entityType: 'DOCUMENT',
    entityId: document.id,
    oldValue: { status: document.status, moderatorComment: document.moderatorComment },
    newValue: { status, moderatorComment: comment, badge: approved ? badgeType : null },
    reason: comment,
    ip: input.ip ?? undefined,
  })

  await notifyCompany(document.companyId, {
    type: 'MODERATION_RESULT',
    params: { title: document.fileName, status },
    entityType: 'DOCUMENT',
    entityId: document.id,
    url: localePath(DEFAULT_LOCALE, 'dashboard', 'verification'),
    email: (locale) => ({
      template: 'moderationDecision',
      params: {
        subjectTitle: document.fileName,
        approved,
        ...(comment ? { reason: comment } : {}),
        url: `${env.APP_URL}${localePath(locale, 'dashboard', 'verification')}`,
      },
    }),
  })
}

// --- complaint decisions -----------------------------------------------------

export async function decideComplaint(
  input: { complaintId: string; resolve: boolean; resolution: string } & ActorContext,
): Promise<void> {
  const complaint = await db.complaint.findUnique({
    where: { id: input.complaintId },
    select: {
      id: true,
      status: true,
      resolution: true,
      reason: true,
      entityType: true,
      entityId: true,
      reporterUserId: true,
    },
  })
  if (!complaint) throw new DomainError('notFound')

  const status = input.resolve ? 'RESOLVED' : 'REJECTED'

  await transaction(async (tx) => {
    await tx.complaint.update({
      where: { id: complaint.id },
      data: {
        status,
        resolution: input.resolution,
        handledById: input.actorId,
        resolvedAt: new Date(),
      },
    })
    await closeTasks(tx, 'COMPLAINT', complaint.id, input.actorId)
  })

  await recordAudit({
    actorId: input.actorId,
    action: `moderation.complaint.${input.resolve ? 'resolve' : 'reject'}`,
    entityType: 'COMPLAINT',
    entityId: complaint.id,
    oldValue: { status: complaint.status, resolution: complaint.resolution },
    newValue: { status, resolution: input.resolution },
    reason: input.resolution,
    ip: input.ip ?? undefined,
  })

  const descriptions = await describeEntities([
    { entityType: complaint.entityType, entityId: complaint.entityId },
  ])
  const subjectTitle =
    descriptions.get(`${complaint.entityType}:${complaint.entityId}`)?.label ?? complaint.entityType

  // The person who reported it is the one owed an answer.
  await notify({
    userId: complaint.reporterUserId,
    type: 'COMPLAINT_RESULT',
    params: { status, reason: complaint.reason },
    entityType: 'COMPLAINT',
    entityId: complaint.id,
    email: (locale) => ({
      template: 'moderationDecision',
      params: {
        subjectTitle,
        approved: input.resolve,
        reason: input.resolution,
        url: `${env.APP_URL}${localePath(locale, 'dashboard')}`,
      },
    }),
  })
}

// --- review decisions --------------------------------------------------------

export async function setReviewHidden(
  input: { reviewId: string; hidden: boolean; comment?: string | undefined } & ActorContext,
): Promise<void> {
  const review = await db.review.findUnique({
    where: { id: input.reviewId },
    select: {
      id: true,
      status: true,
      comment: true,
      authorCompanyId: true,
      targetCompanyId: true,
    },
  })
  if (!review) throw new DomainError('notFound')

  const status = input.hidden ? 'HIDDEN' : 'PUBLISHED'
  const comment = input.comment ?? null

  await transaction(async (tx) => {
    await tx.review.update({ where: { id: review.id }, data: { status } })
    await closeTasks(tx, 'REVIEW', review.id, input.actorId)
  })

  await recordAudit({
    actorId: input.actorId,
    action: `moderation.review.${input.hidden ? 'hide' : 'restore'}`,
    entityType: 'REVIEW',
    entityId: review.id,
    oldValue: { status: review.status },
    newValue: { status },
    reason: comment,
    ip: input.ip ?? undefined,
  })

  await notifyCompany(review.authorCompanyId, {
    type: 'MODERATION_RESULT',
    params: { status },
    entityType: 'REVIEW',
    entityId: review.id,
    email: (locale) => ({
      template: 'moderationDecision',
      params: {
        subjectTitle: review.comment ?? review.id,
        approved: !input.hidden,
        ...(comment ? { reason: comment } : {}),
        url: `${env.APP_URL}${localePath(locale, 'dashboard')}`,
      },
    }),
  })
}

// --- review surfaces ---------------------------------------------------------

export const MODERATION_PAGE_SIZE = 20

interface ListOptions {
  status?: string | undefined
  q?: string | undefined
  page?: number
}

function pagination(page: number | undefined, pageSize = MODERATION_PAGE_SIZE) {
  const current = Math.max(page ?? 1, 1)
  return { skip: (current - 1) * pageSize, take: pageSize, page: current, pageSize }
}

/** Listings waiting for a verdict — PENDING by default, any status on request. */
export async function listModerationProducts(options: ListOptions = {}) {
  const { skip, take, page, pageSize } = pagination(options.page)

  // `contains` is case-sensitive on PostgreSQL and Prisma's `mode: 'insensitive'` does
  // not exist on SQLite, so the moderator search stays a plain substring match — the
  // same trade the public search engine makes.
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    status: options.status ?? { in: ['PENDING', 'CHANGES_REQUESTED'] },
    ...(options.q ? { title: { contains: options.q } } : {}),
  }

  const [total, items] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { updatedAt: 'asc' },
      skip,
      take,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        priceBani: true,
        unit: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { id: true, displayName: true } },
      },
    }),
  ])

  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function getProductForReview(productId: string) {
  return db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      status: true,
      moderatorComment: true,
      priceBani: true,
      unit: true,
      minOrderQty: true,
      availableQty: true,
      availability: true,
      originCountry: true,
      manufacturer: true,
      composition: true,
      allergens: true,
      storageConditions: true,
      packaging: true,
      createdAt: true,
      updatedAt: true,
      photos: { select: { key: true, alt: true }, orderBy: { sortOrder: 'asc' } },
      category: { select: { id: true, path: true } },
      company: { select: { id: true, displayName: true, slug: true, status: true } },
    },
  })
}

export async function listModerationDocuments(options: ListOptions = {}) {
  const { skip, take, page, pageSize } = pagination(options.page)

  const where: Prisma.DocumentWhereInput = {
    status: options.status ?? 'PENDING',
    ...(options.q ? { fileName: { contains: options.q } } : {}),
  }

  const [total, items] = await Promise.all([
    db.document.count({ where }),
    db.document.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip,
      take,
      select: {
        id: true,
        type: true,
        number: true,
        status: true,
        fileName: true,
        createdAt: true,
        expiresAt: true,
        company: { select: { id: true, displayName: true } },
      },
    }),
  ])

  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function getDocumentForReview(documentId: string) {
  return db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      type: true,
      number: true,
      status: true,
      moderatorComment: true,
      fileKey: true,
      fileName: true,
      mimeType: true,
      sizeByte: true,
      issuedAt: true,
      expiresAt: true,
      isPublic: true,
      createdAt: true,
      company: {
        select: {
          id: true,
          displayName: true,
          legalName: true,
          idno: true,
          slug: true,
          badges: { select: { type: true, status: true, expiresAt: true } },
        },
      },
      history: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          comment: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      },
    },
  })
}

/**
 * Complaints. With no `status` the moderator worklist is returned (still to decide);
 * `ALL` is the admin archive, which includes everything already handled.
 */
export async function listModerationComplaints(options: ListOptions = {}) {
  const { skip, take, page, pageSize } = pagination(options.page)

  const where: Prisma.ComplaintWhereInput =
    options.status === 'ALL'
      ? {}
      : { status: options.status ?? { in: ['OPEN', 'IN_REVIEW'] } }

  const [total, rows] = await Promise.all([
    db.complaint.count({ where }),
    db.complaint.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip,
      take,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        reason: true,
        description: true,
        status: true,
        resolution: true,
        createdAt: true,
        resolvedAt: true,
        reporter: { select: { id: true, name: true, email: true } },
        handledBy: { select: { id: true, name: true } },
      },
    }),
  ])

  const descriptions = await describeEntities(rows)
  const items = rows.map((row) => ({
    ...row,
    targetLabel: descriptions.get(`${row.entityType}:${row.entityId}`)?.label ?? row.entityId,
  }))

  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function listModerationReviews(options: ListOptions = {}) {
  const { skip, take, page, pageSize } = pagination(options.page)

  const where: Prisma.ReviewWhereInput = {
    ...(options.status ? { status: options.status } : {}),
    ...(options.q ? { comment: { contains: options.q } } : {}),
  }

  const [total, items] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        overall: true,
        comment: true,
        status: true,
        direction: true,
        createdAt: true,
        deal: { select: { number: true } },
        authorCompany: { select: { id: true, displayName: true } },
        targetCompany: { select: { id: true, displayName: true } },
      },
    }),
  ])

  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}

export async function getReviewForReview(reviewId: string) {
  return db.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      overall: true,
      criteria: true,
      comment: true,
      status: true,
      direction: true,
      createdAt: true,
      deal: { select: { id: true, number: true, title: true, totalBani: true } },
      authorCompany: { select: { id: true, displayName: true } },
      targetCompany: { select: { id: true, displayName: true } },
      reply: { select: { body: true, createdAt: true } },
    },
  })
}

export async function getComplaintForReview(complaintId: string) {
  const complaint = await db.complaint.findUnique({
    where: { id: complaintId },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      reason: true,
      description: true,
      status: true,
      resolution: true,
      createdAt: true,
      resolvedAt: true,
      reporter: { select: { id: true, name: true, email: true } },
      handledBy: { select: { id: true, name: true } },
    },
  })

  if (!complaint) return null

  const descriptions = await describeEntities([complaint])
  const description = descriptions.get(`${complaint.entityType}:${complaint.entityId}`)

  return {
    ...complaint,
    targetLabel: description?.label ?? complaint.entityId,
    targetCompanyName: description?.companyName ?? null,
  }
}
