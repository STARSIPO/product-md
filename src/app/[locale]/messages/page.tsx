import type { Metadata } from 'next'
import { MessageSquare } from 'lucide-react'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireUser } from '@/server/auth/guards'
import { listConversations } from '@/server/services/messaging'
import { EmptyState } from '@/components/ui'
import {
  ConversationList,
  type ConversationListItemView,
} from '@/components/chat/conversation-list'

/**
 * The inbox.
 *
 * Two panes from `lg` up — list on the left, thread on the right — but the right pane
 * here is only ever the "pick something" placeholder: the thread lives at its own URL
 * so it can be linked from a notification, shared between colleagues and reached with
 * the browser's back button. On a phone this is simply the list.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.chat.title, robots: { index: false, follow: false } }
}

export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { q?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await requireUser(locale, localePath(locale, 'messages'))

  const query = searchParams.q?.trim() ?? ''
  const conversations = await listConversations(user.id, query)

  const items: ConversationListItemView[] = conversations.map((item) => {
    const last = item.conversation.messages[0] ?? null
    return {
      id: item.conversation.id,
      type: item.conversation.type,
      subject: item.conversation.subject,
      lastMessageAt: item.conversation.lastMessageAt,
      unread: item.unread,
      counterparty: {
        slug: item.counterparty.slug,
        displayName: item.counterparty.displayName,
        logoKey: item.counterparty.logoKey,
      },
      lastMessage: last
        ? {
            kind: last.kind,
            body: last.body,
            params: last.params,
            own: last.senderUserId === user.id,
          }
        : null,
    }
  })

  return (
    <div className="container py-6">
      <h1 className="text-h1">{t.chat.title}</h1>

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <ConversationList items={items} locale={locale} t={t} query={query} />
        </div>

        <div className="hidden rounded-lg border border-dashed border-border bg-card lg:block">
          <EmptyState
            icon={<MessageSquare aria-hidden />}
            title={items.length === 0 ? t.chat.empty : t.chat.emptyThread}
            description={items.length === 0 ? t.chat.emptyText : undefined}
          />
        </div>
      </div>
    </div>
  )
}
