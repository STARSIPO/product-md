import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '@/env'
import type { MailAdapter, MailMessage } from '@/server/mail/types'

/**
 * Real SMTP delivery.
 *
 * The transporter is a pooled connection and is created once, on first send: building it
 * at module load would open sockets in every process that merely imports the mailer,
 * including builds and CLI scripts that never send anything.
 */

let transporter: Transporter | null = null

function transport(): Transporter {
  if (transporter) return transporter

  const host = env.SMTP_HOST
  if (!host) {
    throw new Error('MAIL_DRIVER="smtp" requires SMTP_HOST.')
  }

  transporter = nodemailer.createTransport({
    host,
    port: env.SMTP_PORT,
    // Implicit TLS on 465; port 587 upgrades via STARTTLS, which nodemailer does itself.
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
    pool: true,
    maxConnections: 3,
  })

  return transporter
}

export class SmtpMailAdapter implements MailAdapter {
  readonly name = 'smtp'

  async send(message: MailMessage): Promise<void> {
    await transport().sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    })
  }
}
