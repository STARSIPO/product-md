import 'server-only'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { MailAdapter, MailMessage } from '@/server/mail/types'

/**
 * The development mailbox.
 *
 * Nothing is simulated here: every message is written to ./.mail as a real .html file
 * that opens in a browser, so a developer verifies the actual rendered email — wording,
 * layout, and the working verification link — without an SMTP account and without
 * sending anything to a real address.
 *
 * The one-line console summary exists so the file is discoverable while watching logs.
 */

const MAIL_DIR = resolve(process.cwd(), '.mail')

/**
 * Subjects are Russian or Romanian, so the slug keeps unicode letters instead of
 * stripping them — otherwise every filename would collapse to the same placeholder.
 */
function slugify(subject: string): string {
  const slug = subject
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug.length > 0 ? slug : 'message'
}

/** `-->` inside the body would close the wrapper comment and leak the text into the page. */
function escapeForComment(text: string): string {
  return text.replace(/--+>/g, '- ->')
}

export class ConsoleMailAdapter implements MailAdapter {
  readonly name = 'console'

  async send(message: MailMessage): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `${stamp}-${slugify(message.subject)}.html`
    const filePath = resolve(MAIL_DIR, fileName)

    const header = [
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      '',
      'Plain text alternative:',
      '',
      message.text,
    ].join('\n')

    const document = `<!--\n${escapeForComment(header)}\n-->\n${message.html}\n`

    await mkdir(MAIL_DIR, { recursive: true })
    await writeFile(filePath, document, 'utf8')

    console.info(`[mail:console] ${message.to} — "${message.subject}" → .mail/${fileName}`)
  }
}
