import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { parseMockCheckoutToken, payments, signMockWebhook } from '@/server/payments'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { formatMoney } from '@/lib/money'
import { reportError } from '@/server/observability'

/**
 * The fake bank page.
 *
 * A real provider hosts this screen; with PAYMENT_DRIVER=mock it lives here so the
 * whole top-up round trip — leave the app, decide, come back, receive a signed
 * callback — can be exercised on a laptop with no merchant account.
 *
 * It is deliberately plain HTML with inline styles and no scripts: it stands in for a
 * page on somebody else's domain, so it must not depend on anything of ours. And it
 * signs its callback exactly the way a provider would rather than being trusted by the
 * receiving route — otherwise the interesting bugs (replay, bad signature, amount
 * mismatch) would be untestable.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** The return URL carries the locale the user was browsing in; fall back to the cookie. */
function localeFrom(returnUrl: string | null): 'ru' | 'ro' {
  const fromPath = returnUrl?.match(/^https?:\/\/[^/]+\/(ru|ro)(?:\/|$)/)?.[1]
  if (fromPath) return resolveLocale(fromPath)
  return resolveLocale(cookies().get('NEXT_LOCALE')?.value)
}

function page(body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<meta name="robots" content="noindex">` +
      `<title>Mock checkout</title></head>` +
      `<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;` +
      `background:#f4f5f4;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#16181a;padding:24px">` +
      body +
      `</body></html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    },
  )
}

export async function GET(request: NextRequest) {
  if (payments.name !== 'mock') {
    return new NextResponse('Not found', { status: 404 })
  }

  const token = request.nextUrl.searchParams.get('token') ?? ''
  const payload = token ? parseMockCheckoutToken(token) : null

  const locale = localeFrom(payload?.returnUrl ?? null)
  const t = await getDictionary(locale)

  if (!payload) {
    return page(
      `<main style="max-width:26rem;width:100%;background:#fff;border:1px solid #e3e5e3;border-radius:12px;padding:24px">` +
        `<h1 style="margin:0 0 8px;font-size:20px">${escapeHtml(t.balance.checkoutTitle)}</h1>` +
        `<p style="margin:0;color:#5c6360">${escapeHtml(t.balance.checkoutExpired)}</p>` +
        `</main>`,
    )
  }

  const amount = escapeHtml(formatMoney(payload.amountBani, locale, { currency: payload.currency }))

  return page(
    `<main style="max-width:26rem;width:100%;background:#fff;border:1px solid #e3e5e3;border-radius:12px;padding:24px">` +
      `<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5c6360">Product.md</p>` +
      `<h1 style="margin:0 0 8px;font-size:20px">${escapeHtml(t.balance.checkoutTitle)}</h1>` +
      `<p style="margin:0 0 16px;color:#5c6360;font-size:14px">${escapeHtml(t.balance.checkoutText)}</p>` +
      `<p style="margin:0 0 20px;padding:12px 14px;background:#f4f5f4;border-radius:8px;display:flex;justify-content:space-between;gap:12px">` +
      `<span style="color:#5c6360">${escapeHtml(t.balance.checkoutAmount)}</span>` +
      `<strong>${amount}</strong></p>` +
      `<form method="post" style="display:flex;flex-direction:column;gap:10px">` +
      `<input type="hidden" name="token" value="${escapeHtml(token)}">` +
      `<button type="submit" name="decision" value="pay" ` +
      `style="min-height:48px;border:0;border-radius:8px;background:#0F6B45;color:#fff;font-size:15px;font-weight:600;cursor:pointer">` +
      `${escapeHtml(t.balance.checkoutConfirm)}</button>` +
      `<button type="submit" name="decision" value="cancel" ` +
      `style="min-height:48px;border:1px solid #cfd3d0;border-radius:8px;background:#fff;color:#16181a;font-size:15px;cursor:pointer">` +
      `${escapeHtml(t.balance.checkoutCancel)}</button>` +
      `</form></main>`,
  )
}

export async function POST(request: NextRequest) {
  if (payments.name !== 'mock') {
    return new NextResponse('Not found', { status: 404 })
  }

  const form = await request.formData()
  const token = String(form.get('token') ?? '')
  const decision = String(form.get('decision') ?? 'cancel')

  const payload = parseMockCheckoutToken(token)
  if (!payload) {
    const locale = localeFrom(null)
    const t = await getDictionary(locale)
    return page(
      `<main style="max-width:26rem;width:100%;background:#fff;border:1px solid #e3e5e3;border-radius:12px;padding:24px">` +
        `<h1 style="margin:0 0 8px;font-size:20px">${escapeHtml(t.balance.checkoutTitle)}</h1>` +
        `<p style="margin:0;color:#5c6360">${escapeHtml(t.balance.checkoutExpired)}</p>` +
        `</main>`,
    )
  }

  const succeeded = decision === 'pay'

  // Derived from the payment id, not from the clock: a second delivery of this exact
  // callback carries the same externalId and is rejected by the unique index on
  // WebhookEvent[provider, externalId].
  const body = JSON.stringify({
    externalId: `mock_${payload.paymentId}`,
    paymentId: payload.paymentId,
    status: succeeded ? 'SUCCEEDED' : 'FAILED',
    amountBani: payload.amountBani,
  })

  // Built from the incoming origin rather than APP_URL: in development those differ
  // (a dev server on another port), and a callback that cannot reach itself would fail
  // silently after the user has already "paid".
  const webhookUrl = new URL('/api/payments/webhook/mock', request.nextUrl.origin)

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mock-signature': signMockWebhook(body),
      },
      body,
      cache: 'no-store',
    })

    if (!response.ok && response.status !== 400) {
      reportError(new Error(`mock webhook returned ${response.status}`), {
        scope: 'mock-checkout',
        paymentId: payload.paymentId,
      })
    }
  } catch (error) {
    reportError(error, { scope: 'mock-checkout', paymentId: payload.paymentId })
  }

  const back = new URL(payload.returnUrl)
  back.searchParams.set('payment', succeeded ? 'success' : 'cancelled')

  // 303 so the browser follows with a GET and a refresh does not re-post the decision.
  return NextResponse.redirect(back, { status: 303 })
}
