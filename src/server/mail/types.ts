import 'server-only'

/**
 * A message is fully rendered before it reaches an adapter: both an HTML and a plain
 * text body, always. Corporate mail filters treat HTML-only mail as spam, and buyers
 * on this platform read mail on phones with images disabled.
 */

export interface MailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export interface MailAdapter {
  readonly name: string
  send(message: MailMessage): Promise<void>
}
