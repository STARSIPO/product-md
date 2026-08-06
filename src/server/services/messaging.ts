import 'server-only'
import { Prisma } from '@prisma/client'
import { db, transaction } from '@/server/db'
import { env } from '@/env'
import { DomainError } from '@/server/actions/result'
import { AuthorizationError } from '@/server/auth/guards'
import { encodeJson } from '@/lib/json'
import { localePath } from '@/lib/i18n/config'
import { truncate } from '@/lib/utils'
import type { ConversationType } from '@/lib/constants'
import { notify } from './notifications'

/**
 * Buyer ↔ seller conversations.
 *
 * A conversation is always between two *companies* and always anchored to something
 * concrete — a product, a request, an offer or a deal. That anchor is what makes the
 * thread useful later: "who was that and what were we discussing" is answered by the
 * row itself rather than by scrolling.
 *
 * Access is a single rule with no exceptions: a `ConversationParticipant` row is the
 * only key. Every read and every write in this module takes a `userId` and joins
 * through that table, so a non-participant does not get a 403 with a preview — the
 * conversation simply does not exist for them.
 */

// --- anchors -----------------------------------------------------------------

export interface ConversationAnchor {
  type: ConversationType
  productId?: string
  requestId?: string
  offerId?: string
  dealId?: string
}

interface ResolvedAnchor extends ConversationAnchor {
  buyerCompanyId: string
  sellerCompanyId: string
  subject: string
}

/**
 * Works out which side is which from the anchor, never from the client.
 *
 * The acting company is placed on the side it actually occupies: the owner of a
 * product is the seller, the owner of a request is the buyer. A company that sits on
 * neither side of an offer or a deal is rejected outright.
 */
async function resolveAnchor(
  anchor: ConversationAnchor,
  actingCompanyId: string,
): Promise<ResolvedAnchor> {
  if (anchor.productId) {
    const product = await db.product.findFirst({
      where: { id: anchor.productId, deletedAt: null },
      select: { id: true, title: true, companyId: true },
    })
    if (!product) throw new AuthorizationError('notFound')
    if (product.companyId === actingCompanyId) throw new DomainError('ownProduct')

    return {
      type: 'PRODUCT',
      productId: product.id,
      buyerCompanyId: actingCompanyId,
      sellerCompanyId: product.companyId,
      subject: product.title,
    }
  }

  if (anchor.requestId) {
    const request = await db.purchaseRequest.findFirst({
      where: { id: anchor.requestId, deletedAt: null },
      select: { id: true, title: true, companyId: true },
    })
    if (!request) throw new AuthorizationError('notFound')
    if (request.companyId === actingCompanyId) throw new DomainError('ownProduct')

    return {
      type: 'REQUEST',
      requestId: request.id,
      buyerCompanyId: request.companyId,
      sellerCompanyId: actingCompanyId,
      subject: request.title,
    }
  }

  if (anchor.offerId) {
    const offer = await db.offer.findUnique({
      where: { id: anchor.offerId },
      select: {
        id: true,
        sellerCompanyId: true,
        request: { select: { id: true, title: true, companyId: true } },
      },
    })
    if (!offer) throw new AuthorizationError('notFound')

    const buyerCompanyId = offer.request.companyId
    const sellerCompanyId = offer.sellerCompanyId
    if (buyerCompanyId === sellerCompanyId) throw new DomainError('ownProduct')
    if (actingCompanyId !== buyerCompanyId && actingCompanyId !== sellerCompanyId) {
      throw new AuthorizationError('forbidden')
    }

    return {
      type: 'OFFER',
      offerId: offer.id,
      requestId: offer.request.id,
      buyerCompanyId,
      sellerCompanyId,
      subject: offer.request.title,
    }
  }

  if (anchor.dealId) {
    const deal = await db.deal.findUnique({
      where: { id: anchor.dealId },
      select: { id: true, title: true, buyerCompanyId: true, sellerCompanyId: true },
    })
    if (!deal) throw new AuthorizationError('notFound')
    if (deal.buyerCompanyId === deal.sellerCompanyId) throw new DomainError('ownProduct')
    if (actingCompanyId !== deal.buyerCompanyId && actingCompanyId !== deal.sellerCompanyId) {
      throw new AuthorizationError('forbidden')
    }

    return {
      type: 'DEAL',
      dealId: deal.id,
      buyerCompanyId: deal.buyerCompanyId,
      sellerCompanyId: deal.sellerCompanyId,
      subject: deal.title,
    }
  }

  throw new DomainError('validation')
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

async function findAnchoredConversation(anchor: ResolvedAnchor): Promise<string | null> {
  const found = await db.conversation.findFirst({
    where: {
      type: anchor.type,
      productId: anchor.productId ?? null,
      requestId: anchor.requestId ?? null,
      offerId: anchor.offerId ?? null,
      dealId: anchor.dealId ?? null,
      buyerCompanyId: anchor.buyerCompanyId,
      sellerCompanyId: anchor.sellerCompanyId,
    },
    select: { id: true },
  })
  return found?.id ?? null
}

/**
 * Makes sure the acting user can see the thread their own company owns.
 *
 * Two colleagues share a company but not a participant row, so the second one to open
 * a product conversation would otherwise be locked out of a thread addressed to their
 * own company. The upsert is idempotent and costs one statement.
 */
async function ensureParticipant(
  conversationId: string,
  userId: string,
  companyId: string,
): Promise<void> {
  await db.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId, companyId },
    update: {},
  })
}

/** The member who represents a company when it is pulled into a conversation. */
async function counterpartyMember(companyId: string): Promise<string | null> {
  const member = await db.companyMember.findFirst({
    where: { companyId },
    // OWNER sorts after MANAGER alphabetically, so `desc` puts the owner first.
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
    select: { userId: true },
  })
  return member?.userId ?? null
}

export interface GetOrCreateResult {
  id: string
  created: boolean
}

/**
 * Idempotent by construction.
 *
 * Two taps on "write to the supplier" race each other, and the database — not this
 * function — is the arbiter: the unique indexes on
 * `[type, productId, buyer, seller]` / `[type, requestId, buyer, seller]` turn the
 * loser of the race into a P2002, which is caught and resolved by re-reading the row
 * the winner just wrote.
 */
export async function getOrCreateConversation(
  anchor: ConversationAnchor,
  actingUserId: string,
  actingCompanyId: string,
): Promise<GetOrCreateResult> {
  const resolved = await resolveAnchor(anchor, actingCompanyId)

  const existingId = await findAnchoredConversation(resolved)
  if (existingId) {
    await ensureParticipant(existingId, actingUserId, actingCompanyId)
    return { id: existingId, created: false }
  }

  const counterpartyCompanyId =
    actingCompanyId === resolved.buyerCompanyId
      ? resolved.sellerCompanyId
      : resolved.buyerCompanyId
  const counterpartyUserId = await counterpartyMember(counterpartyCompanyId)

  const participants: Prisma.ConversationParticipantCreateManyConversationInput[] = [
    { userId: actingUserId, companyId: actingCompanyId },
  ]
  if (counterpartyUserId && counterpartyUserId !== actingUserId) {
    participants.push({ userId: counterpartyUserId, companyId: counterpartyCompanyId })
  }

  try {
    const conversation = await db.conversation.create({
      data: {
        type: resolved.type,
        productId: resolved.productId ?? null,
        requestId: resolved.requestId ?? null,
        offerId: resolved.offerId ?? null,
        dealId: resolved.dealId ?? null,
        buyerCompanyId: resolved.buyerCompanyId,
        sellerCompanyId: resolved.sellerCompanyId,
        subject: truncate(resolved.subject, 160),
        participants: { createMany: { data: participants } },
      },
      select: { id: true },
    })
    return { id: conversation.id, created: true }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error

    // Lost the race: the other request already created this exact conversation.
    const raced = await findAnchoredConversation(resolved)
    if (!raced) throw error

    await ensureParticipant(raced, actingUserId, actingCompanyId)
    return { id: raced, created: false }
  }
}

// --- reads -------------------------------------------------------------------

const CONVERSATION_SUMMARY_SELECT = {
  id: true,
  type: true,
  subject: true,
  lastMessageAt: true,
  buyerCompanyId: true,
  sellerCompanyId: true,
  productId: true,
  requestId: true,
  offerId: true,
  dealId: true,
  buyerCompany: { select: { id: true, slug: true, displayName: true, logoKey: true } },
  sellerCompany: { select: { id: true, slug: true, displayName: true, logoKey: true } },
  product: { select: { id: true, slug: true, title: true } },
  request: { select: { id: true, slug: true, title: true } },
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, kind: true, body: true, params: true, senderUserId: true, createdAt: true },
  },
} satisfies Prisma.ConversationSelect

export type ConversationSummary = Prisma.ConversationGetPayload<{
  select: typeof CONVERSATION_SUMMARY_SELECT
}>

export interface ConversationListItem {
  conversation: ConversationSummary
  /** Which side the viewer's company sits on. */
  side: 'buyer' | 'seller'
  counterparty: { id: string; slug: string; displayName: string; logoKey: string | null }
  unread: boolean
  isBlocked: boolean
}

/**
 * The viewer's inbox.
 *
 * Filtering happens in memory on purpose: `contains` is case-sensitive on PostgreSQL
 * and Prisma's `mode: 'insensitive'` does not exist on SQLite, so a database-side
 * filter would behave differently in development and production. An inbox is small
 * enough that one bounded read plus a local pass is both correct and cheap.
 */
export async function listConversations(
  userId: string,
  query?: string,
  limit = 200,
): Promise<ConversationListItem[]> {
  const rows = await db.conversationParticipant.findMany({
    where: { userId, isArchived: false },
    orderBy: { conversation: { lastMessageAt: 'desc' } },
    take: limit,
    select: {
      companyId: true,
      lastReadAt: true,
      isBlocked: true,
      conversation: { select: CONVERSATION_SUMMARY_SELECT },
    },
  })

  const items = rows.map((row): ConversationListItem => {
    const conversation = row.conversation
    const side: 'buyer' | 'seller' =
      conversation.buyerCompanyId === row.companyId ? 'buyer' : 'seller'
    const counterparty = side === 'buyer' ? conversation.sellerCompany : conversation.buyerCompany

    return {
      conversation,
      side,
      counterparty,
      unread: row.lastReadAt === null || row.lastReadAt < conversation.lastMessageAt,
      isBlocked: row.isBlocked,
    }
  })

  const needle = query?.trim().toLocaleLowerCase()
  if (!needle) return items

  return items.filter((item) => {
    const haystack = [item.counterparty.displayName, item.conversation.subject ?? '']
      .join(' ')
      .toLocaleLowerCase()
    return haystack.includes(needle)
  })
}

const MESSAGE_SELECT = {
  id: true,
  kind: true,
  body: true,
  params: true,
  senderUserId: true,
  createdAt: true,
  sender: { select: { id: true, name: true } },
  attachments: { select: { id: true, key: true, fileName: true, mimeType: true, sizeByte: true } },
} satisfies Prisma.MessageSelect

export type ThreadMessage = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>

export interface Thread {
  conversation: ConversationSummary & {
    offer: { id: string; totalBani: number; quantity: number; unit: string } | null
    deal: { id: string; number: string; status: string; totalBani: number } | null
  }
  messages: ThreadMessage[]
  side: 'buyer' | 'seller'
  companyId: string
  counterparty: { id: string; slug: string; displayName: string; logoKey: string | null }
  /** Where the "new messages" divider goes — the value *before* this open. */
  lastReadAt: Date | null
  isBlocked: boolean
  isBlockedByOther: boolean
}

const THREAD_PAGE_SIZE = 200

/**
 * Loads a thread for one participant and marks it read.
 *
 * The previous `lastReadAt` is captured before the update so the unread divider can
 * still be drawn on this render — updating first would erase the very boundary the
 * user came to see.
 */
export async function openThread(conversationId: string, userId: string): Promise<Thread | null> {
  const participant = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true, companyId: true, lastReadAt: true, isBlocked: true },
  })
  if (!participant) return null

  const [conversation, others, messages] = await Promise.all([
    db.conversation.findUnique({
      where: { id: conversationId },
      select: {
        ...CONVERSATION_SUMMARY_SELECT,
        offer: { select: { id: true, totalBani: true, quantity: true, unit: true } },
        deal: { select: { id: true, number: true, status: true, totalBani: true } },
      },
    }),
    db.conversationParticipant.findMany({
      where: { conversationId, NOT: { userId } },
      select: { isBlocked: true },
    }),
    db.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: THREAD_PAGE_SIZE,
      select: MESSAGE_SELECT,
    }),
  ])

  if (!conversation) return null

  const side: 'buyer' | 'seller' =
    conversation.buyerCompanyId === participant.companyId ? 'buyer' : 'seller'

  // Reading is what marks the thread read; the badge in the header follows from it.
  await db.conversationParticipant.update({
    where: { id: participant.id },
    data: { lastReadAt: new Date() },
  })

  return {
    conversation,
    messages,
    side,
    companyId: participant.companyId,
    counterparty: side === 'buyer' ? conversation.sellerCompany : conversation.buyerCompany,
    lastReadAt: participant.lastReadAt,
    isBlocked: participant.isBlocked,
    isBlockedByOther: others.some((other) => other.isBlocked),
  }
}

// --- writes ------------------------------------------------------------------

export interface MessageAttachmentInput {
  key: string
  fileName: string
  mimeType: string
  sizeByte: number
}

/**
 * Appends a message and wakes the other side.
 *
 * The caller has already proved participation; this re-reads the participant row
 * anyway, because that row also carries the block flags and the acting company id —
 * neither of which may come from the client.
 */
export async function postMessage(
  conversationId: string,
  senderUserId: string,
  body: string,
  attachments: readonly MessageAttachmentInput[] = [],
): Promise<{ messageId: string }> {
  const participant = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: senderUserId } },
    select: { id: true, isBlocked: true },
  })
  if (!participant) throw new AuthorizationError('forbidden')
  if (participant.isBlocked) throw new DomainError('conversationBlocked')

  const others = await db.conversationParticipant.findMany({
    where: { conversationId, NOT: { userId: senderUserId } },
    select: { userId: true, isBlocked: true },
  })
  if (others.some((other) => other.isBlocked)) throw new DomainError('conversationBlocked')

  const now = new Date()

  const messageId = await transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId,
        senderUserId,
        kind: 'USER',
        body,
        createdAt: now,
        ...(attachments.length > 0
          ? { attachments: { createMany: { data: attachments.map((file) => ({ ...file })) } } }
          : {}),
      },
      select: { id: true },
    })

    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now },
    })

    // The sender has by definition read their own message.
    await tx.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: now },
    })

    return message.id
  })

  await notifyCounterparties(conversationId, senderUserId, body, others)

  return { messageId }
}

async function notifyCounterparties(
  conversationId: string,
  senderUserId: string,
  body: string,
  others: readonly { userId: string }[],
): Promise<void> {
  if (others.length === 0) return

  const [sender, conversation] = await Promise.all([
    db.user.findUnique({ where: { id: senderUserId }, select: { name: true } }),
    db.conversation.findUnique({
      where: { id: conversationId },
      select: { subject: true },
    }),
  ])

  const senderName = sender?.name ?? ''
  const subject = conversation?.subject ?? ''
  const preview = truncate(body, 140)
  // Stored ru-canonical; the notification list re-localizes it for the reader.
  const url = localePath('ru', 'messages', conversationId)

  await Promise.all(
    others.map((other) =>
      notify({
        userId: other.userId,
        type: 'NEW_MESSAGE',
        params: { sender: senderName, subject },
        entityType: 'CONVERSATION',
        entityId: conversationId,
        url,
        email: {
          template: 'newMessage',
          params: { senderName, preview, url: `${env.APP_URL}${url}` },
        },
      }),
    ),
  )
}

/**
 * Writes a SYSTEM message — "deal created", "offer accepted".
 *
 * Only the i18n key and its params are stored. Nothing here is ever rendered as
 * written text, so a Russian event still reads correctly in a Romanian thread.
 */
export async function postSystemMessage(
  conversationId: string,
  key: string,
  params: Record<string, string | number> = {},
): Promise<void> {
  const now = new Date()
  await transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId,
        kind: 'SYSTEM',
        body: key,
        params: encodeJson(params),
        createdAt: now,
      },
    })
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } })
  })
}

export async function markConversationRead(
  conversationId: string,
  userId: string,
): Promise<void> {
  await db.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  })
}

export async function setConversationBlocked(
  conversationId: string,
  userId: string,
  blocked: boolean,
): Promise<void> {
  const result = await db.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { isBlocked: blocked },
  })
  if (result.count === 0) throw new AuthorizationError('forbidden')
}
