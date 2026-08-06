import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath, switchLocalePath, type Locale } from '@/lib/i18n/config'
import { requireUser } from '@/server/auth/guards'
import { db } from '@/server/db'
import { listNotifications } from '@/server/services/notifications'
import { saveNotificationPreferences } from '@/server/actions/notifications'
import { NOTIFICATION_TYPES, type NotificationType } from '@/lib/constants'
import { decodeRecord } from '@/lib/json'
import { parsePage } from '@/lib/utils'
import { Alert, Button, Checkbox, Pagination, TableScroll } from '@/components/ui'
import {
  NotificationList,
  type NotificationItemView,
} from '@/components/notifications/notification-list'

/**
 * The notification centre and its delivery preferences.
 *
 * The preferences grid is a single plain <form> posting to a server action rather
 * than 70 individual switches. That is not only cheaper: because every row is
 * submitted together, an absent checkbox unambiguously means "off", so the whole
 * section keeps working with JavaScript disabled — which is exactly the situation of
 * a user on a bad connection in a warehouse.
 */

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

/** Channels that have a column in `NotificationPreference` and an adapter behind it. */
const CHANNELS = [
  { field: 'inApp', labelKey: 'channelInApp' },
  { field: 'email', labelKey: 'channelEmail' },
  { field: 'sms', labelKey: 'channelSms' },
  { field: 'push', labelKey: 'channelPush' },
] as const

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return { title: t.notifications.title, robots: { index: false, follow: false } }
}

/**
 * Turns a stored target into a link for *this* reader.
 *
 * Notification URLs are written ru-canonical (`/ru/messages/<id>`), because the writer
 * cannot know which language the recipient reads in — a request can notify twenty
 * suppliers who do not share one. `switchLocalePath` translates the segments here,
 * where the reader is finally known.
 */
function notificationHref(
  locale: Locale,
  url: string | null,
  entityType: string | null,
  entityId: string | null,
): string | null {
  if (url) {
    if (/^https?:\/\//i.test(url)) return url

    const localized = /^\/(ru|ro)(\/|$)/.exec(url)
    const from = localized?.[1]
    if (from === 'ru' || from === 'ro') return switchLocalePath(url, from, locale)

    return `/${locale}${url.startsWith('/') ? url : `/${url}`}`
  }

  if (!entityId) return null
  if (entityType === 'CONVERSATION') return localePath(locale, 'messages', entityId)
  if (entityType === 'DEAL') return localePath(locale, 'deals', entityId)
  return null
}

function toParams(raw: string | null): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(decodeRecord(raw))) {
    if (typeof value === 'string' || typeof value === 'number') params[key] = value
  }
  return params
}

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: { page?: string }
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await requireUser(locale, localePath(locale, 'notifications'))

  const page = parsePage(searchParams.page)

  const [{ items, total }, preferences] = await Promise.all([
    listNotifications(user.id, page, PAGE_SIZE),
    db.notificationPreference.findMany({
      where: { userId: user.id },
      select: { type: true, inApp: true, email: true, sms: true, push: true },
    }),
  ])

  const byType = new Map(preferences.map((preference) => [preference.type, preference]))

  const views: NotificationItemView[] = items.map((item) => ({
    id: item.id,
    type: item.type,
    params: toParams(item.params),
    href: notificationHref(locale, item.url, item.entityType, item.entityId),
    readAt: item.readAt,
    createdAt: item.createdAt,
  }))

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  /** Defaults are on for in-app and email — silence has to be chosen, not inherited. */
  function isEnabled(type: NotificationType, field: (typeof CHANNELS)[number]['field']): boolean {
    const preference = byType.get(type)
    if (!preference) return field === 'inApp' || field === 'email'
    return preference[field]
  }

  return (
    <div className="container py-6">
      <h1 className="text-h1">{t.notifications.title}</h1>

      <div className="mt-5">
        <NotificationList items={views} />
      </div>

      {pageCount > 1 ? (
        <div className="mt-5">
          <Pagination
            page={page}
            pageCount={pageCount}
            buildHref={(next) => `${localePath(locale, 'notifications')}?page=${next}`}
            labels={{
              previous: t.a11y.previousPage,
              next: t.a11y.nextPage,
              pagination: t.a11y.pagination,
            }}
          />
        </div>
      ) : null}

      {/* ------------------------------------------------------------ preferences */}
      <section aria-labelledby="notification-preferences" className="mt-10">
        <h2 id="notification-preferences" className="text-h3">
          {t.notifications.settings}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.notifications.settingsHint}</p>

        <form action={saveNotificationPreferences} className="mt-4">
          <TableScroll>
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">{t.notifications.settings}</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t.notifications.typeColumn}
                  </th>
                  {CHANNELS.map((channel) => (
                    <th
                      key={channel.field}
                      scope="col"
                      className="px-3 py-2 text-center font-medium"
                    >
                      {t.notifications[channel.labelKey]}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-center font-medium">
                    {t.notifications.channelTelegram}
                  </th>
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_TYPES.map((type) => (
                  <tr key={type} className="border-b border-border last:border-0">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">
                      {t.notifications.types[type]}
                    </th>

                    {CHANNELS.map((channel) => {
                      const id = `pref-${type}-${channel.field}`
                      return (
                        <td key={channel.field} className="px-3 py-1.5 text-center">
                          <label
                            htmlFor={id}
                            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md hover:bg-muted"
                          >
                            <Checkbox
                              id={id}
                              name={`pref.${type}.${channel.field}`}
                              defaultChecked={isEnabled(type, channel.field)}
                            />
                            <span className="sr-only">
                              {t.notifications.types[type]} — {t.notifications[channel.labelKey]}
                            </span>
                          </label>
                        </td>
                      )
                    })}

                    {/* No column, no adapter — an honest disabled control, not a lie. */}
                    <td className="px-3 py-1.5 text-center">
                      <span className="inline-flex h-11 w-11 items-center justify-center">
                        <Checkbox
                          disabled
                          checked={false}
                          readOnly
                          aria-label={`${t.notifications.types[type]} — ${t.notifications.channelTelegram}`}
                          title={t.notifications.channelHintTelegram}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          <ul className="mt-3 space-y-1 text-caption text-muted-foreground">
            <li>
              {t.notifications.channelSms}: {t.notifications.channelHintSms}
            </li>
            <li>
              {t.notifications.channelPush}: {t.notifications.channelHintPush}
            </li>
            <li>
              {t.notifications.channelTelegram}: {t.notifications.channelHintTelegram}
            </li>
          </ul>

          <div className="mt-4">
            <Button type="submit">{t.notifications.settingsSave}</Button>
          </div>
        </form>

        {!user.emailVerified ? (
          <Alert variant="info" className="mt-4">
            {t.errors.emailNotVerified}
          </Alert>
        ) : null}
      </section>
    </div>
  )
}
