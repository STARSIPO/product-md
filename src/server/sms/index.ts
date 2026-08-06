import 'server-only'
import { env } from '@/env'
import { encodeJson } from '@/lib/json'
import { db } from '@/server/db'
import { logEvent, reportError } from '@/server/observability'

/**
 * SMS delivery.
 *
 * No Moldovan aggregator is wired up, and none is faked. The default adapter is honest
 * about that: it stores the message and prints it, so phone signup is fully testable
 * locally, and it never records the message as delivered.
 */

export interface SmsAdapter {
  readonly name: string
  send(to: string, body: string): Promise<void>
}

/**
 * Writes the message where a developer can find it — the server log and the
 * NotificationDelivery table — and stops there.
 *
 * The row stays PENDING rather than SENT on purpose. Nothing was handed to a carrier,
 * so marking it SENT would put a lie in the audit trail and make delivery dashboards
 * report a success rate that does not exist.
 */
export class MockSmsAdapter implements SmsAdapter {
  readonly name = 'mock'

  async send(to: string, body: string): Promise<void> {
    // The OTP is in the body on purpose: reading it out of the log (or the table) is how
    // phone verification is completed on a developer machine.
    console.info(
      `[sms:mock] NOT SENT — no SMS provider is configured (SMS_DRIVER="mock"). ` +
        `Intended recipient ${to}: ${body}`,
    )

    await db.notificationDelivery
      .create({
        data: {
          channel: 'SMS',
          recipient: to,
          template: 'sms.raw',
          payload: encodeJson({ body, sender: env.SMS_SENDER, driver: 'mock' }),
          status: 'PENDING',
          error: 'not transmitted: SMS_DRIVER="mock", no provider configured',
        },
      })
      .catch((error: unknown) => {
        // The log line above already carried the code, so a database hiccup must not
        // block the signup flow that is waiting on this call.
        reportError(error, { scope: 'sms.mock.record', recipient: to })
      })
  }
}

/**
 * Skeleton for a real HTTP aggregator.
 *
 * The endpoint is a constant rather than an env var because every provider has its own
 * request and response shape: switching to a real one means editing the two lines below
 * anyway, and inventing a configuration knob that cannot work on its own would only
 * suggest otherwise.
 */
const SMS_ENDPOINT = 'https://sms-provider.example.md/v1/messages'

export class HttpSmsAdapter implements SmsAdapter {
  readonly name = 'http'

  async send(to: string, body: string): Promise<void> {
    const apiKey = env.SMS_API_KEY?.trim()
    if (!apiKey) {
      throw new Error(
        'SMS_DRIVER="http" requires SMS_API_KEY. Set it, or switch SMS_DRIVER back to "mock" — ' +
          'this adapter will not silently drop messages.',
      )
    }

    const response = await fetch(SMS_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sender: env.SMS_SENDER, to, text: body }),
    })

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200)
      throw new Error(`smsProviderRejected: HTTP ${response.status} ${detail}`)
    }

    logEvent('sms.sent', { recipient: to, provider: SMS_ENDPOINT })
  }
}

export const sms: SmsAdapter =
  env.SMS_DRIVER === 'http' ? new HttpSmsAdapter() : new MockSmsAdapter()

/**
 * Moldovan numbers to E.164.
 *
 * People type their number six different ways — "069 123 456", "(0)69-123-456",
 * "+373 69 123 456" — and the same person must not end up with two accounts because of
 * it. National significant numbers are 8 digits; anything else is rejected rather than
 * guessed, since a wrong normalisation sends someone else's OTP to a stranger.
 */
export function normalizePhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s\-().]/g, '')
  if (!/^\+?\d{9,15}$/.test(cleaned)) return null

  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned

  let national: string
  if (digits.startsWith('373')) {
    national = digits.slice(3)
  } else if (digits.startsWith('0')) {
    national = digits.slice(1)
  } else {
    return null
  }

  // 2xx/3xx fixed lines, 6xx/7xx mobile; a leading 0 or 1 is never a subscriber number.
  if (!/^[2-9]\d{7}$/.test(national)) return null

  return `+373${national}`
}
