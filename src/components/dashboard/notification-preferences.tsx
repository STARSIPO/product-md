import { getDictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'
import { NOTIFICATION_TYPES, type NotificationType } from '@/lib/constants'
import { saveNotificationPreferences } from '@/server/actions/notifications'
import { Button, Checkbox } from '@/components/ui'

/**
 * Per-event delivery preferences, as a plain form.
 *
 * One `<form>` posting to one server action rather than 56 individual switches: because
 * every row is submitted together, an absent checkbox unambiguously means "off", which
 * is what lets the whole section work with JavaScript disabled — the situation of a user
 * on a bad connection in a warehouse.
 *
 * FIELD CONVENTION — `pref.<NOTIFICATION_TYPE>.<inApp|email|sms|push>`; the action reads
 * exactly these names.
 *
 * Two layouts, one form. From `md` up it is a grid with channel headings, which is the
 * densest way to read fourteen rows. Below `md` each event becomes a card whose
 * checkboxes carry their own visible labels — a five-column grid at 320px is either
 * unreadable or a sideways scroller, and a channel column header that has scrolled out
 * of view labels nothing.
 */

/** Channels that have a column in `NotificationPreference` and an adapter behind it. */
const CHANNELS = [
  { field: 'inApp', labelKey: 'channelInApp' },
  { field: 'email', labelKey: 'channelEmail' },
  { field: 'sms', labelKey: 'channelSms' },
  { field: 'push', labelKey: 'channelPush' },
] as const

export interface NotificationPreferenceRow {
  type: string
  inApp: boolean
  email: boolean
  sms: boolean
  push: boolean
}

export async function NotificationPreferences({
  preferences,
  locale,
}: {
  preferences: readonly NotificationPreferenceRow[]
  locale: Locale
}) {
  const t = await getDictionary(locale)
  const byType = new Map(preferences.map((preference) => [preference.type, preference]))

  /** Defaults are on for in-app and email — silence has to be chosen, not inherited. */
  function isOn(type: NotificationType, field: (typeof CHANNELS)[number]['field']): boolean {
    const preference = byType.get(type)
    if (!preference) return field === 'inApp' || field === 'email'
    return preference[field]
  }

  return (
    <form action={saveNotificationPreferences} className="space-y-4">
      {/* ------------------------------------------------------ desktop: a grid */}
      <table className="hidden w-full border-collapse text-sm md:table">
        <caption className="sr-only">{t.notifications.settings}</caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-2 pr-3 font-medium">
              {t.notifications.typeColumn}
            </th>
            {CHANNELS.map((channel) => (
              <th key={channel.field} scope="col" className="w-20 py-2 text-center font-medium">
                {t.notifications[channel.labelKey]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NOTIFICATION_TYPES.map((type) => (
            <tr key={type} className="border-b border-border last:border-0">
              <th scope="row" className="py-1 pr-3 text-left font-normal">
                {t.notifications.types[type]}
              </th>
              {CHANNELS.map((channel) => (
                <td key={channel.field} className="py-1 text-center">
                  <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md hover:bg-muted">
                    <Checkbox
                      name={`pref.${type}.${channel.field}`}
                      defaultChecked={isOn(type, channel.field)}
                    />
                    <span className="sr-only">
                      {t.notifications.types[type]} — {t.notifications[channel.labelKey]}
                    </span>
                  </label>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* --------------------------------------------------------- phone: cards */}
      <ul className="space-y-2 md:hidden">
        {NOTIFICATION_TYPES.map((type) => (
          // An inset block, not another outlined card: this list already lives inside
          // one, and a box inside a box is what made the settings page feel like a form
          // builder rather than a product.
          <li key={type} className="surface-muted rounded-md px-3 py-2.5">
            <fieldset className="min-w-0 border-0 p-0">
              <legend className="text-sm font-medium">{t.notifications.types[type]}</legend>
              <div className="mt-1 flex flex-wrap gap-x-3">
                {CHANNELS.map((channel) => {
                  const id = `pref-m-${type}-${channel.field}`
                  return (
                    <label
                      key={channel.field}
                      htmlFor={id}
                      className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-caption text-muted-foreground"
                    >
                      <Checkbox
                        id={id}
                        name={`pref.${type}.${channel.field}`}
                        defaultChecked={isOn(type, channel.field)}
                      />
                      {t.notifications[channel.labelKey]}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ul>

      {/* Said once, honestly, instead of a fifth column that writes nothing. */}
      <ul className="space-y-1 text-caption text-muted-foreground">
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

      <Button type="submit" size="lg" fullWidth className="sm:w-auto">
        {t.notifications.settingsSave}
      </Button>
    </form>
  )
}
