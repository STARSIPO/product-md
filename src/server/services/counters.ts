import 'server-only'
import { db } from '@/server/db'

/**
 * Badge counters for the header and mobile navigation.
 *
 * One batched call per request rather than three independent widgets each firing
 * their own query — the header renders on every single page, so this is the hottest
 * query path in the app.
 */

export interface HeaderCounters {
  unreadMessages: number
  unreadNotifications: number
  favorites: number
}

const EMPTY: HeaderCounters = { unreadMessages: 0, unreadNotifications: 0, favorites: 0 }

export async function getHeaderCounters(userId: string | null): Promise<HeaderCounters> {
  if (!userId) return EMPTY

  const [notifications, favorites, participants] = await Promise.all([
    db.notification.count({ where: { userId, readAt: null } }),
    db.favorite.count({ where: { userId } }),
    db.conversationParticipant.findMany({
      where: { userId, isArchived: false },
      select: {
        lastReadAt: true,
        conversation: { select: { lastMessageAt: true } },
      },
    }),
  ])

  // "Unread" is per conversation, not per message: the badge answers "how many
  // conversations need me", which is what the user actually acts on.
  const unreadMessages = participants.filter((participant) => {
    const lastMessageAt = participant.conversation.lastMessageAt
    return participant.lastReadAt === null || participant.lastReadAt < lastMessageAt
  }).length

  return { unreadMessages, unreadNotifications: notifications, favorites }
}
