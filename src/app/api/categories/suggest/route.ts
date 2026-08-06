import { NextResponse, type NextRequest } from 'next/server'
import { getCategoryAttributes, getPopularCategories, suggestCategories } from '@/server/services/categories'
import { resolveLocale } from '@/lib/i18n'
import { clientIp, consume } from '@/server/auth/rate-limit'

/**
 * Powers the "what are you selling / what do you need" field.
 *
 * With no query it returns the popular categories the empty state shows; with a query
 * it returns ranked suggestions where the first is the recommended one. The client
 * debounces at 250 ms — see components/category/category-picker.tsx.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const query = params.get('q')?.trim() ?? ''
  const locale = resolveLocale(params.get('locale') ?? undefined)
  const attributesFor = params.get('attributesFor')
  const appliesTo = params.get('appliesTo') === 'REQUEST' ? 'REQUEST' : 'PRODUCT'

  const limit = await consume({ key: `catsuggest:${clientIp()}`, limit: 120, windowSeconds: 60 })
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  // Second mode: the form asks for the dependent attribute set once a category is picked.
  if (attributesFor) {
    const attributes = await getCategoryAttributes(attributesFor, locale, appliesTo)
    return NextResponse.json({ attributes })
  }

  if (query.length < 2) {
    const popular = await getPopularCategories(8)
    return NextResponse.json({
      suggestions: [],
      popular: popular.map((category) => ({
        id: category.id,
        name: category.names[locale],
        slug: category.slugs[locale],
        defaultUnit: category.defaultUnit,
        trail: category.trail.map((step) => step.name[locale]).join(' → '),
      })),
    })
  }

  const suggestions = await suggestCategories(query.slice(0, 200), locale, 8)

  return NextResponse.json({
    suggestions: suggestions.map((item) => ({
      id: item.category.id,
      name: item.category.names[locale],
      slug: item.category.slugs[locale],
      defaultUnit: item.category.defaultUnit,
      trail: item.trailLabel,
      score: item.score,
    })),
    popular: [],
  })
}
