import Link from 'next/link'
import { Search } from 'lucide-react'
import { localePath, type Locale } from '@/lib/i18n/config'
import { fmt, type Dictionary } from '@/lib/i18n'
import { formatRelative } from '@/lib/i18n/format'
import { decodeRecord } from '@/lib/json'
import { Avatar, Input, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * The inbox.
 *
 * Filtering is a plain GET form rather than a controlled input: it costs no
 * JavaScript, survives a reload, and the resulting URL can be bookmarked or shared
 * between the two tabs a procurement manager keeps open.
 */

export interface ConversationListItemView {
  id: string
  type: string
  subject: string | null
  lastMessageAt: Date
  unread: boolean
  counterparty: { slug: string; displayName: string; logoKey: string | null }
  lastMessage: {
    kind: string
    body: string
    params: string | null
    /** True when the viewer wrote it — the preview then reads "You: …". */
    own: boolean
  } | null
}

/**
 * SYSTEM messages store an i18n key plus params, never a sentence — this turns the
 * pair back into text in the reader's language.
 *
 * Deliberately duplicated in `message-thread.tsx`: that component runs on the client
 * and this one on the server, and eight lines of pure formatting is a smaller price
 * than a shared module that drags one environment into the other.
 */
function systemMessageText(t: Dictionary, body: string, rawParams: string | null): string {
  const templates = t.systemMessage as Record<string, string | undefined>
  const template = templates[body]
  if (!template) return t.chat.systemPrefix

  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(decodeRecord(rawParams))) {
    if (typeof value === 'string' || typeof value === 'number') params[key] = value
  }
  return fmt(template, params)
}

export function ConversationList({
  items,
  locale,
  t,
  activeId,
  query,
}: {
  items: readonly ConversationListItemView[]
  locale: Locale
  t: Dictionary
  activeId?: string
  query?: string
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <form
        method="get"
        role="search"
        aria-label={t.chat.searchPlaceholder}
        className="flex gap-2 border-b border-border p-3"
      >
        <label htmlFor="conversation-search" className="sr-only">
          {t.chat.searchPlaceholder}
        </label>
        <Input
          id="conversation-search"
          type="search"
          name="q"
          defaultValue={query ?? ''}
          placeholder={t.chat.searchPlaceholder}
          autoComplete="off"
        />
        <button
          type="submit"
          aria-label={t.common.search}
          className={buttonVariants({ variant: 'outline', size: 'icon' })}
        >
          <Search className="h-4 w-4" aria-hidden />
        </button>
      </form>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {query ? t.chat.noMatches : t.chat.empty}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {items.map((item) => {
            const preview =
              item.lastMessage === null
                ? (item.subject ?? '')
                : item.lastMessage.kind === 'SYSTEM'
                  ? systemMessageText(t, item.lastMessage.body, item.lastMessage.params)
                  : item.lastMessage.body

            return (
              <li key={item.id}>
                <Link
                  href={localePath(locale, 'messages', item.id)}
                  aria-current={item.id === activeId ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[68px] items-start gap-3 px-3 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    item.id === activeId && 'bg-primary-soft/40',
                  )}
                >
                  <Avatar
                    src={item.counterparty.logoKey ?? undefined}
                    name={item.counterparty.displayName}
                    size="md"
                  />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          'clamp-1 min-w-0 flex-1 text-sm',
                          item.unread ? 'font-semibold' : 'font-medium',
                        )}
                      >
                        {item.counterparty.displayName}
                      </span>
                      <time
                        dateTime={item.lastMessageAt.toISOString()}
                        className="shrink-0 text-caption text-muted-foreground"
                      >
                        {formatRelative(item.lastMessageAt, locale)}
                      </time>
                    </span>

                    {item.subject ? (
                      <span className="clamp-1 mt-0.5 block text-caption text-muted-foreground">
                        {item.subject}
                      </span>
                    ) : null}

                    <span
                      className={cn(
                        'clamp-1 mt-1 block text-sm',
                        item.unread ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {item.lastMessage?.kind === 'SYSTEM' ? (
                        <span className="text-caption uppercase tracking-wide">
                          {t.chat.systemPrefix}:{' '}
                        </span>
                      ) : item.lastMessage?.own ? (
                        <span className="text-muted-foreground">{t.chat.you}: </span>
                      ) : null}
                      {preview}
                    </span>
                  </span>

                  {item.unread ? (
                    <span className="mt-1.5 flex shrink-0 items-center">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
                      <span className="sr-only">{t.chat.unread}</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
