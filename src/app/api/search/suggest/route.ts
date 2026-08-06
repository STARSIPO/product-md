import { NextResponse, type NextRequest } from 'next/server'
import { globalSearch } from '@/server/services/search'
import { resolveLocale } from '@/lib/i18n'
import { consume, clientIp } from '@/server/auth/rate-limit'

/**
 * Typeahead endpoint for the header search overlay.
 *
 * Public and unauthenticated by design — a guest must be able to search — so it is
 * rate limited per IP. Everything it returns is already public data; no offer, no
 * document and no contact detail is reachable through it.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const locale = resolveLocale(request.nextUrl.searchParams.get('locale') ?? undefined)

  if (query.length < 2) {
    return NextResponse.json({
      categories: [],
      products: [],
      suppliers: [],
      requests: [],
      districts: [],
    })
  }

  const limit = await consume({ key: `suggest:${clientIp()}`, limit: 60, windowSeconds: 60 })
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const results = await globalSearch(query.slice(0, 200), locale)

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'private, max-age=15' },
  })
}
