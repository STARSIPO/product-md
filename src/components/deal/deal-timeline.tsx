import { Circle } from 'lucide-react'
import type { Dictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'

/**
 * The deal's audit trail, straight from DealEvent.
 *
 * Both sides read the same list. That is the point: when a supplier says "I shipped on
 * Tuesday" and a buyer says "nothing arrived", the timestamped transitions are the only
 * shared record either of them has — the platform is not a party to the contract.
 */

export interface DealTimelineEvent {
  id: string
  fromStatus: string | null
  toStatus: string
  comment: string | null
  createdAt: Date
  actor: { id: string; name: string } | null
}

export function DealTimeline({
  events,
  locale,
  t,
}: {
  events: readonly DealTimelineEvent[]
  locale: Locale
  t: Dictionary
}) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.deal.noEvents}</p>
  }

  return (
    <ol className="space-y-4">
      {events.map((event, index) => {
        const status =
          t.dealStatus[event.toStatus as keyof typeof t.dealStatus] ?? event.toStatus
        const isLast = index === events.length - 1

        // The service writes the i18n key 'createdFromOffer' as the comment of the very
        // first event, so it renders translated rather than as raw English.
        const comment =
          event.comment === 'createdFromOffer' ? t.deal.createdFromOffer : event.comment

        return (
          <li key={event.id} className="relative flex gap-3 pl-1">
            {!isLast ? (
              <span
                aria-hidden="true"
                className="absolute left-[9px] top-5 h-full w-px bg-border"
              />
            ) : null}

            <Circle
              aria-hidden="true"
              className="mt-1 h-[18px] w-[18px] shrink-0 fill-primary-soft text-primary"
            />

            <div className="min-w-0 flex-1 pb-1">
              <p className="text-sm font-medium">{status}</p>
              <p className="tnum text-caption text-muted-foreground">
                {formatDateTime(event.createdAt, locale)}
                {event.actor ? ` · ${event.actor.name}` : ''}
              </p>
              {comment ? (
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{comment}</p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
