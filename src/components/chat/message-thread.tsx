'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, FileText, Undo2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { formatDate, formatRelative } from '@/lib/i18n/format'
import { decodeRecord } from '@/lib/json'
import { chisinauDayKey } from '@/lib/utils'
import { setConversationBlockedAction } from '@/server/actions/messages'
import { Alert, Button, useToast } from '@/components/ui'
import { MessageComposer } from './message-composer'
import { ReportButton } from '@/components/complaint/report-button'
import type { Dictionary } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * One conversation.
 *
 * There is no websocket in this deployment, and pretending otherwise would be a lie
 * in the UI. Instead the thread asks the server for a fresh render every 15 seconds
 * while its tab is actually in front — a hidden tab polls nothing, so a user with
 * nine tabs open is not nine times the load. Nothing in the copy claims messages
 * arrive instantly, because they do not.
 */

const POLL_INTERVAL_MS = 15_000

export interface ThreadMessageView {
  id: string
  kind: string
  body: string
  params: string | null
  senderName: string | null
  createdAt: Date
  own: boolean
  attachments: {
    id: string
    key: string
    fileName: string
    mimeType: string
    sizeByte: number
  }[]
}

/** See the twin in `conversation-list.tsx` — same eight lines, other environment. */
function systemMessageText(t: Dictionary, body: string, rawParams: string | null): string {
  const templates = t.systemMessage as Record<string, string | undefined>
  const template = templates[body]
  if (!template) return t.chat.systemPrefix

  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(decodeRecord(rawParams))) {
    if (typeof value === 'string' || typeof value === 'number') params[key] = value
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key]
    return value === undefined ? match : String(value)
  })
}

export function MessageThread({
  conversationId,
  messages,
  lastReadAt,
  isBlocked,
  isBlockedByOther,
  counterpartyId,
  counterpartyName,
}: {
  conversationId: string
  messages: readonly ThreadMessageView[]
  lastReadAt: Date | null
  isBlocked: boolean
  isBlockedByOther: boolean
  counterpartyId: string
  counterpartyName: string
}) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const { toast } = useToast()
  const listRef = useRef<HTMLDivElement>(null)
  const [blocked, setBlocked] = useState(isBlocked)
  const [pending, startTransition] = useTransition()

  // --- polling ---------------------------------------------------------------
  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState === 'visible') router.refresh()
    }

    const timer = window.setInterval(refreshIfVisible, POLL_INTERVAL_MS)
    // Coming back to the tab should not mean waiting out the rest of the interval.
    document.addEventListener('visibilitychange', refreshIfVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [router])

  // --- keep the newest message in view ---------------------------------------
  useEffect(() => {
    const element = listRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages.length])

  useEffect(() => {
    setBlocked(isBlocked)
  }, [isBlocked])

  function toggleBlock() {
    const next = !blocked
    startTransition(async () => {
      const result = await setConversationBlockedAction(conversationId, next)
      if (!result.ok) {
        const errors = t.errors as Record<string, string | undefined>
        toast({ title: errors[result.error] ?? t.errors.generic, variant: 'error' })
        return
      }
      setBlocked(result.data)
      router.refresh()
    })
  }

  // --- day grouping ----------------------------------------------------------
  const todayKey = chisinauDayKey()
  const yesterdayKey = chisinauDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000))

  function dayLabel(date: Date): string {
    const key = chisinauDayKey(date)
    if (key === todayKey) return t.chat.today
    if (key === yesterdayKey) return t.chat.yesterday
    return formatDate(date, locale)
  }

  // The divider marks the first message that arrived after the previous visit —
  // own messages never count, or opening your own thread would always show it.
  const firstUnreadId =
    lastReadAt === null
      ? (messages.find((message) => !message.own)?.id ?? null)
      : (messages.find((message) => !message.own && message.createdAt > lastReadAt)?.id ?? null)

  let previousDayKey = ''

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* --------------------------------------------------------- thread tools */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border px-3 py-2">
        <ReportButton
          entityType="COMPANY"
          entityId={counterpartyId}
          label={t.chat.report}
          variant="ghost"
          size="sm"
        />
        <Button variant="ghost" size="sm" onClick={toggleBlock} loading={pending}>
          {blocked ? (
            <Undo2 className="h-4 w-4" aria-hidden />
          ) : (
            <Ban className="h-4 w-4" aria-hidden />
          )}
          {blocked ? t.chat.unblockUser : t.chat.blockUser}
        </Button>
      </div>

      {blocked ? (
        <div className="px-3 pt-3">
          <Alert variant="warning">{t.chat.blocked}</Alert>
        </div>
      ) : isBlockedByOther ? (
        <div className="px-3 pt-3">
          <Alert variant="warning">{t.chat.blockedByOther}</Alert>
        </div>
      ) : null}

      {/* -------------------------------------------------------------- messages */}
      <div
        ref={listRef}
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t.chat.threadLabel}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t.chat.firstMessageHint}
          </p>
        ) : null}

        {messages.map((message) => {
          const dayKey = chisinauDayKey(message.createdAt)
          const startsDay = dayKey !== previousDayKey
          previousDayKey = dayKey

          return (
            <div key={message.id}>
              {startsDay ? (
                <p className="my-3 text-center text-caption font-medium text-muted-foreground">
                  {dayLabel(message.createdAt)}
                </p>
              ) : null}

              {message.id === firstUnreadId ? (
                <p className="my-3 flex items-center gap-3 text-caption font-medium text-primary">
                  <span aria-hidden className="h-px flex-1 bg-primary/30" />
                  {t.chat.unread}
                  <span aria-hidden className="h-px flex-1 bg-primary/30" />
                </p>
              ) : null}

              {message.kind === 'SYSTEM' ? (
                <p className="my-2 text-center text-caption text-muted-foreground">
                  <span className="rounded-full bg-muted px-3 py-1">
                    {systemMessageText(t, message.body, message.params)}
                  </span>
                </p>
              ) : (
                <div
                  className={cn(
                    'flex flex-col',
                    message.own ? 'items-end' : 'items-start',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-lg px-3 py-2 sm:max-w-[75%]',
                      message.own
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-card',
                    )}
                  >
                    <p
                      className={cn(
                        'text-caption font-medium',
                        message.own ? 'text-primary-foreground/80' : 'text-muted-foreground',
                      )}
                    >
                      {message.own ? t.chat.you : (message.senderName ?? counterpartyName)}
                    </p>

                    <p className="mt-0.5 whitespace-pre-line break-words text-sm">
                      {message.body}
                    </p>

                    {message.attachments.length > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {message.attachments.map((file) => (
                          <li key={file.id}>
                            <a
                              href={`/api/files/${file.key}`}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                'inline-flex min-h-[36px] items-center gap-1.5 rounded text-caption underline underline-offset-2',
                                message.own ? 'text-primary-foreground' : 'text-primary',
                              )}
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              <span className="max-w-[14rem] truncate">{file.fileName}</span>
                              <span className="sr-only">{t.a11y.newTab}</span>
                            </a>

                            {file.mimeType.startsWith('image/') ? (
                              <a href={`/api/files/${file.key}`} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/api/files/${file.key}`}
                                  alt={file.fileName}
                                  loading="lazy"
                                  className="mt-1 max-h-48 w-auto max-w-full rounded-md border border-border bg-card object-contain"
                                />
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <time
                    dateTime={message.createdAt.toISOString()}
                    className="mt-0.5 px-1 text-caption text-muted-foreground"
                  >
                    {formatRelative(message.createdAt, locale)}
                  </time>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="px-3 text-caption text-muted-foreground">{t.chat.pollingHint}</p>

      <MessageComposer
        conversationId={conversationId}
        disabled={blocked || isBlockedByOther}
        disabledReason={blocked ? t.chat.blocked : t.chat.blockedByOther}
      />
    </div>
  )
}
