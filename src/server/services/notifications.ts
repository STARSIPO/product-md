import 'server-only'
import { db } from '@/server/db'
import { encodeJson } from '@/lib/json'
import type { NotificationType } from '@/lib/constants'
import type { Locale } from '@/lib/i18n/config'
import type { EmailTemplateName, EmailTemplateParams } from '@/server/mail/templates'
import { reportError } from '@/server/observability'

/**
 * Notification fan-out.
 *
 * In-app notifications are the source of truth: a row is always written, so the bell
 * icon is correct even when every outbound channel is down. Email/SMS/push are
 * best-effort side effects — a failing mail server must never roll back the business
 * action that triggered the notification, so dispatch is wrapped and swallowed here
 * rather than bubbling into the caller's transaction.
 */

/**
 * An optional, fully-typed email to send alongside the in-app notification.
 *
 * Modelled as a discriminated union over the template name so the compiler pairs each
 * template with its own params — `{ template: 'lowBalance', params: { url } }` will not
 * build. The alternative (a loose param bag cast at the boundary) produces emails with
 * "undefined" in the subject line, which is exactly the class of bug this prevents.
 */
export type EmailPayload = {
  [K in EmailTemplateName]: { template: K; params: EmailTemplateParams[K] }
}[EmailTemplateName]

/**
 * Some templates need a translated value inside their params — a deal status label,
 * for instance. The caller cannot know the recipient's language (a request can notify
 * twenty suppliers who do not share one), so it may hand over a builder that this
 * module invokes once the recipient's locale is known.
 */
export type EmailPayloadFactory = (locale: Locale) => EmailPayload | Promise<EmailPayload>

export interface NotifyInput {
  userId: string
  type: NotificationType
  params?: Record<string, string | number>
  entityType?: string
  entityId?: string
  /** Where the bell item links to. Already localized by the caller. */
  url?: string
  /** Omit to leave this notification in-app only. */
  email?: EmailPayload | EmailPayloadFactory
}

export async function notify(input: NotifyInput): Promise<void> {
  const notification = await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      params: input.params ? encodeJson(input.params) : null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      url: input.url ?? null,
    },
    select: { id: true },
  })

  void dispatchChannels(input, notification.id)
}

/** Deliberately not awaited by `notify` — see the module comment. */
async function dispatchChannels(input: NotifyInput, notificationId: string): Promise<void> {
  if (!input.email) return

  try {
    const [user, preference] = await Promise.all([
      db.user.findUnique({
        where: { id: input.userId },
        select: { email: true, locale: true, emailVerifiedAt: true },
      }),
      db.notificationPreference.findUnique({
        where: { userId_type: { userId: input.userId, type: input.type } },
        select: { email: true },
      }),
    ])

    if (!user?.email || !user.emailVerifiedAt) return

    // Default is on: a user who has never touched settings still gets told about an
    // accepted offer. Only an explicit opt-out suppresses the email.
    if (preference && !preference.email) return

    const { sendTemplateEmail } = await import('@/server/mail')
    const locale: Locale = user.locale === 'ro' ? 'ro' : 'ru'

    const payload =
      typeof input.email === 'function' ? await input.email(locale) : input.email

    await sendTemplateEmail(user.email, payload.template, locale, payload.params)
  } catch (error) {
    reportError(error, { scope: 'notification-dispatch', notificationId })
  }
}

/** Notifies every member of a company (owner plus any managers). */
export async function notifyCompany(
  companyId: string,
  input: Omit<NotifyInput, 'userId'>,
): Promise<void> {
  const members = await db.companyMember.findMany({
    where: { companyId },
    select: { userId: true },
  })

  await Promise.all(members.map((member) => notify({ ...input, userId: member.userId })))
}

export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } })
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  await db.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  })
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  })
  return result.count
}

export async function listNotifications(userId: string, page = 1, pageSize = 20) {
  const [total, items] = await Promise.all([
    db.notification.count({ where: { userId } }),
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return { items, total }
}
