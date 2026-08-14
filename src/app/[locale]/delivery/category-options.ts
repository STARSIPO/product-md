import 'server-only'
import { db } from '@/server/db'
import { getAllCategories } from '@/server/services/categories'
import type { Locale } from '@/lib/i18n/config'
import type { StorefrontCategoryOption } from '@/components/retail/storefront-filters'

/**
 * The category filter offered on the storefront.
 *
 * Built from what is actually for sale rather than from the whole tree: a household
 * shopper picking «Мясо птицы» and landing on an empty grid learns nothing except that
 * the filter lies. Scoped to one shop when a shop page asks.
 *
 * The option value is the *canonical* category slug, not the localized one, because
 * `searchRetailProducts` resolves the filter through the Russian slug index and falls
 * back to the canonical one — a Romanian slug would resolve to nothing.
 */
export async function getRetailCategoryOptions(
  locale: Locale,
  companyId?: string,
): Promise<StorefrontCategoryOption[]> {
  const [rows, categories] = await Promise.all([
    db.product.groupBy({
      by: ['categoryId'],
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        isRetail: true,
        availability: { not: 'OUT_OF_STOCK' },
        company: { status: 'ACTIVE', isRetail: true },
        ...(companyId ? { companyId } : {}),
      },
    }),
    getAllCategories(),
  ])

  const present = new Set(rows.map((row) => row.categoryId))

  return categories
    .filter((node) => present.has(node.id))
    .map((node) => ({
      value: node.slug,
      label: node.trail.map((step) => step.name[locale]).join(' → '),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale))
}
