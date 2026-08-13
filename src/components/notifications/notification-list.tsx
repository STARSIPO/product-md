'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { formatDate, formatRelative } from '@/lib/i18n/format'
import { chisinauDayKey } from '@/lib/utils'
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/server/actions/notifications'
import { Button, EmptyState, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * The notification centre.
 *
 * Nothing here is stored as a sentence: a row carries a type and a JSON parameter bag,
 * and the text is assembled from the dictionary at render time. That is what lets the
 * same notification read correctly in Russian on the phone and Romanian on the laptop,
 * and it is why an unknown type degrades to its title instead of printing JSON.
 */

export interface NotificationItemView {
  id: string
  type: string
  params: Record<string, string | number>
  /** Already localized by the server; null when the target no longer resolves. */
  href: string | null
  readAt: Date | null
  createdAt: Date
}

export function NotificationList({ items }: { items: readonly NotificationItemView[] }) {
  const { t, locale, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()

  // Optimistic: the row dims the moment it is clicked, not a round trip later.
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set())
  const [allRead, setAllRead] = useState(false)
  const [pending, startTransition] = useTransition()

  const titles = t.notifications.types as Record<string, string | undefined>
  const bodies = t.notifications.body as Record<string, string | undefined>

  function isRead(item: NotificationItemView): boolean {
    return allRead || item.readAt !== null || readIds.has(item.id)
  }

  const unreadCount = items.filter((item) => !isRead(item)).length

  function markOne(id: string) {
    setReadIds((current) => new Set(current).add(id))
    startTransition(async () => {
      await markNotificationReadAction(id)
      router.refresh()
    })
  }

  function markAll() {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction()
      if (!result.ok) {
        const errors = t.errors as Record<string, string | undefined>
        toast({ title: errors[result.error] ?? t.errors.generic, variant: 'error' })
        return
      }
      setAllRead(true)
      toast({ title: t.notifications.allReadDone, variant: 'success' })
      router.refresh()
    })
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Bell aria-hidden />}
        title={t.notifications.empty}
        description={t.notifications.emptyText}
      />
    )
  }

  const todayKey = chisinauDayKey()
  const yesterdayKey = chisinauDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000))

  function dayLabel(date: Date): string {
    const key = chisinauDayKey(date)
    if (key === todayKey) return t.chat.today
    if (key === yesterdayKey) return t.chat.yesterday
    return formatDate(date, locale)
  }

  let previousDayKey = ''

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="tnum text-sm text-muted-foreground">
          {fmt(t.chat.unreadCount, { count: unreadCount })}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={markAll}
          loading={pending}
          disabled={unreadCount === 0}
        >
          <CheckCheck className="h-4 w-4" aria-hidden />
          {t.notifications.markAllRead}
        </Button>
      </div>

      <ul className="surface divide-y divide-border overflow-hidden">
        {items.map((item) => {
          const read = isRead(item)
          const dayKey = chisinauDayKey(item.createdAt)
          const startsDay = dayKey !== previousDayKey
          previousDayKey = dayKey

          const title = titles[item.type] ?? item.type
          const bodyTemplate = bodies[item.type]
          const body = bodyTemplate ? fmt(bodyTemplate, item.params) : null

          return (
            <li key={item.id}>
              {startsDay ? (
                <p className="bg-muted/60 px-4 py-2 text-caption font-medium text-muted-foreground">
                  {dayLabel(item.createdAt)}
                </p>
              ) : null}

              <div
                className={cn(
                  'flex items-start gap-3 px-4 py-3.5',
                  read ? 'bg-transparent' : 'bg-primary-soft/30',
                )}
              >
                <span className="mt-1.5 flex h-2 w-2 shrink-0">
                  {read ? null : (
                    <>
                      <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
                      <span className="sr-only">{t.chat.unread}</span>
                    </>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', read ? 'font-medium' : 'font-semibold')}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        onClick={() => (read ? undefined : markOne(item.id))}
                        className="rounded hover:text-primary"
                      >
                        {title}
                      </Link>
                    ) : (
                      title
                    )}
                  </p>

                  {body ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
                  ) : null}

                  <time
                    dateTime={item.createdAt.toISOString()}
                    className="mt-1 block text-caption text-muted-foreground"
                  >
                    {formatRelative(item.createdAt, locale)}
                  </time>
                </div>

                {read ? null : (
                  <button
                    type="button"
                    onClick={() => markOne(item.id)}
                    aria-label={`${t.notifications.markRead}: ${title}`}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
