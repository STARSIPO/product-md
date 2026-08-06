import { NextResponse, type NextRequest } from 'next/server'
import { getChildren, getCategoryById } from '@/server/services/categories'
import { resolveLocale } from '@/lib/i18n'

/**
 * One level of the category tree, for the "Все категории" browser.
 *
 * Level-at-a-time rather than the whole tree: it keeps the payload tiny and matches
 * how the picker actually navigates (drill down, step back up), so there is nothing
 * to keep in sync on the client.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const locale = resolveLocale(params.get('locale') ?? undefined)
  const parentId = params.get('parent')

  const [children, parent] = await Promise.all([
    getChildren(parentId && parentId !== 'root' ? parentId : null),
    parentId && parentId !== 'root' ? getCategoryById(parentId) : Promise.resolve(null),
  ])

  return NextResponse.json({
    parent: parent
      ? {
          id: parent.id,
          parentId: parent.parentId,
          name: parent.names[locale],
          trail: parent.trail.map((step) => step.name[locale]).join(' / '),
          defaultUnit: parent.defaultUnit,
          hasChildren: parent.childIds.length > 0,
        }
      : null,
    items: children.map((child) => ({
      id: child.id,
      parentId: child.parentId,
      name: child.names[locale],
      trail: child.trail.map((step) => step.name[locale]).join(' / '),
      defaultUnit: child.defaultUnit,
      hasChildren: child.childIds.length > 0,
    })),
  })
}
