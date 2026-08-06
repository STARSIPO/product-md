import 'server-only'
import { env } from '@/env'
import type { Locale } from '@/lib/i18n/config'
import { encodeJson } from '@/lib/json'
import { db } from '@/server/db'
import { ConsoleMailAdapter } from '@/server/mail/console'
import { SmtpMailAdapter } from '@/server/mail/smtp'
import {
  renderEmail,
  type EmailTemplateName,
  type EmailTemplateParams,
} from '@/server/mail/templates'
import type { MailAdapter } from '@/server/mail/types'
import { redactSecrets, reportError } from '@/server/observability'

export type { MailAdapter, MailMessage } from '@/server/mail/types'
export type { EmailTemplateName, EmailTemplateParams } from '@/server/mail/templates'
export { renderEmail } from '@/server/mail/templates'

export const mailer: MailAdapter =
  env.MAIL_DRIVER === 'smtp' ? new SmtpMailAdapter() : new ConsoleMailAdapter()

/**
 * Links are the whole point of most of these emails, which is also why they must not be
 * archived: a NotificationDelivery row holding a live password-reset URL would undo the
 * decision in server/auth/tokens.ts to store tokens hashed. The row keeps enough to
 * answer "did we send it, when, and did it fail", and nothing that grants access.
 */
function payloadForStorage(params: unknown): unknown {
  const cleaned = redactSecrets(params)
  if (cleaned === null || typeof cleaned !== 'object' || Array.isArray(cleaned)) return cleaned

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(cleaned as Record<string, unknown>)) {
    result[key] = /url|link/i.test(key) ? '[redacted-link]' : value
  }
  return result
}

/**
 * Renders and sends, and leaves an audit row either way.
 *
 * A mail failure never propagates: notifications are a side effect of accepting an
 * offer or changing a deal status, and a bounced SMTP connection must not roll back the
 * business action that triggered it. The FAILED row is what makes the loss visible.
 */
export async function sendTemplateEmail<T extends EmailTemplateName>(
  to: string,
  template: T,
  locale: Locale,
  params: EmailTemplateParams[T],
): Promise<void> {
  let deliveryId: string | null = null

  try {
    const rendered = renderEmail(template, locale, params)

    const delivery = await db.notificationDelivery.create({
      data: {
        channel: 'EMAIL',
        recipient: to,
        template,
        payload: encodeJson({
          locale,
          subject: rendered.subject,
          driver: mailer.name,
          params: payloadForStorage(params),
        }),
        status: 'PENDING',
      },
      select: { id: true },
    })
    deliveryId = delivery.id

    await mailer.send({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })

    await db.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'SENT', sentAt: new Date() },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reportError(error, { scope: 'mail.sendTemplateEmail', template, recipient: to })

    if (deliveryId) {
      await db.notificationDelivery
        .update({ where: { id: deliveryId }, data: { status: 'FAILED', error: message } })
        // The database may well be the thing that broke; do not throw from the handler.
        .catch(() => undefined)
    } else {
      await db.notificationDelivery
        .create({
          data: {
            channel: 'EMAIL',
            recipient: to,
            template,
            payload: encodeJson({ locale, driver: mailer.name }),
            status: 'FAILED',
            error: message,
          },
        })
        .catch(() => undefined)
    }
  }
}
