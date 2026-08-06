'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/server/db'
import { assertUser } from '@/server/auth/guards'
import { checkWriteRateLimit } from '@/server/auth/rate-limit'
import { NOTIFICATION_TYPES } from '@/lib/constants'
import { markAllRead, markRead } from '@/server/services/notifications'
import { ok, runAction, type ActionResult } from './result'

/**
 * Notification centre mutations.
 *
 * Every one of them scopes by the session `userId` — `markRead` and `markAllRead` put
 * it in the WHERE clause, so passing a stranger's notification id updates zero rows
 * instead of theirs.
 */

export async function markNotificationReadAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const user = await assertUser()
    await markRead(user.id, id)
    revalidatePath('/[locale]/notifications', 'page')
    return ok()
  })
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<number>> {
  return runAction(async () => {
    const user = await assertUser()
    const count = await markAllRead(user.id)
    revalidatePath('/[locale]/notifications', 'page')
    return ok(count)
  })
}

/**
 * Saves the whole preference grid in one submit.
 *
 * FIELD CONVENTION — `pref.<NOTIFICATION_TYPE>.<inApp|email|sms|push>`. The page
 * renders one checkbox per cell under exactly these names; because the form posts
 * every type at once, an absent key unambiguously means "off" (it would have been
 * present had it been on). That is also why the section needs no JavaScript.
 *
 * Telegram has no column in `NotificationPreference` and no delivery adapter, so the
 * page renders it disabled with `t.notifications.channelHintTelegram` instead of a
 * switch that quietly writes nothing.
 */
export async function saveNotificationPreferences(formData: FormData): Promise<void> {
  const user = await assertUser()

  const limit = await checkWriteRateLimit(user.id, 'notificationPrefs')
  if (!limit.ok) return

  for (const type of NOTIFICATION_TYPES) {
    const values = {
      inApp: formData.get(`pref.${type}.inApp`) !== null,
      email: formData.get(`pref.${type}.email`) !== null,
      sms: formData.get(`pref.${type}.sms`) !== null,
      push: formData.get(`pref.${type}.push`) !== null,
    }

    await db.notificationPreference.upsert({
      where: { userId_type: { userId: user.id, type } },
      create: { userId: user.id, type, ...values },
      update: values,
    })
  }

  revalidatePath('/[locale]/notifications', 'page')
}
