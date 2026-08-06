import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { requireUser } from '@/server/auth/guards'
import { openThread } from '@/server/services/messaging'
import { db } from '@/server/db'
import { Avatar } from '@/components/ui'
import { ContextCard, type ContextCardData } from '@/components/chat/context-card'
import { MessageThread, type ThreadMessageView } from '@/components/chat/message-thread'

/**
 * One thread.
 *
 * `openThread` takes the viewer's user id and joins through ConversationParticipant,
 * so a conversation belonging to two other companies returns null and this page 404s.
 * There is no branch that renders a partial view for a non-participant — the id of a
 * conversation is not evidence of anything.
 *
 * Layout: on `lg` the context card is a permanent column beside the messages; below
 * that it collapses into a native <details>, which keeps the thread at the top of the
 * screen instead of pushing it under a card nobody asked to see.
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

export default async function ConversationPage({
  params,
}: {
  params: { locale: string; id: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await requireUser(locale, localePath(locale, 'messages', params.id))

  const thread = await openThread(params.id, user.id)
  if (!thread) notFound()

  const badges = await db.verificationBadge.findMany({
    where: {
      companyId: thread.counterparty.id,
      status: 'APPROVED',
      type: { in: ['TRUSTED_SUPPLIER', 'DOCUMENTS'] },
    },
    select: { id: true },
  })

  const messages: ThreadMessageView[] = thread.messages.map((message) => ({
    id: message.id,
    kind: message.kind,
    body: message.body,
    params: message.params,
    senderName: message.sender?.name ?? null,
    createdAt: message.createdAt,
    own: message.senderUserId === user.id,
    attachments: message.attachments.map((file) => ({
      id: file.id,
      key: file.key,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeByte: file.sizeByte,
    })),
  }))

  const contextData: ContextCardData = {
    type: thread.conversation.type,
    subject: thread.conversation.subject,
    product: thread.conversation.product
      ? { slug: thread.conversation.product.slug, title: thread.conversation.product.title }
      : null,
    request: thread.conversation.request
      ? { slug: thread.conversation.request.slug, title: thread.conversation.request.title }
      : null,
    offer: thread.conversation.offer,
    deal: thread.conversation.deal,
    counterparty: {
      slug: thread.counterparty.slug,
      displayName: thread.counterparty.displayName,
      logoKey: thread.counterparty.logoKey,
    },
    side: thread.side,
    verified: badges.length > 0,
  }

  return (
    <div className="container py-4 md:py-6">
      <Link
        href={localePath(locale, 'messages')}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.chat.backToList}
      </Link>

      <div className="mt-2 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
          {/* ------------------------------------------------------- thread header */}
          <div className="flex items-center gap-3 border-b border-border px-3 py-3">
            <Avatar
              src={thread.counterparty.logoKey ?? undefined}
              name={thread.counterparty.displayName}
              size="md"
            />
            <div className="min-w-0">
              <h1 className="clamp-1 text-base font-medium">
                <Link
                  href={localePath(locale, 'suppliers', thread.counterparty.slug)}
                  className="rounded hover:text-primary"
                >
                  {thread.counterparty.displayName}
                </Link>
              </h1>
              {thread.conversation.subject ? (
                <p className="clamp-1 text-caption text-muted-foreground">
                  {thread.conversation.subject}
                </p>
              ) : null}
            </div>
          </div>

          {/*
            Mobile disclosure. A native <details> needs no JavaScript, is keyboard
            operable out of the box and — closed — costs exactly one row of height.
          */}
          <details className="group border-b border-border lg:hidden">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">{t.chat.showDetails}</span>
              <span className="hidden group-open:inline">{t.chat.hideDetails}</span>
              <ChevronDown
                className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="px-3 pb-3">
              <ContextCard
                data={contextData}
                locale={locale}
                t={t}
                className="rounded-lg border border-border bg-background p-3"
              />
            </div>
          </details>

          <div className="flex min-h-[60vh] flex-col lg:min-h-[64vh]">
            <MessageThread
              conversationId={thread.conversation.id}
              messages={messages}
              lastReadAt={thread.lastReadAt}
              isBlocked={thread.isBlocked}
              isBlockedByOther={thread.isBlockedByOther}
              counterpartyId={thread.counterparty.id}
              counterpartyName={thread.counterparty.displayName}
            />
          </div>
        </div>

        {/* ------------------------------------------- desktop: permanent side card */}
        <aside className="hidden lg:block lg:self-start">
          <ContextCard data={contextData} locale={locale} t={t} />
        </aside>
      </div>
    </div>
  )
}
