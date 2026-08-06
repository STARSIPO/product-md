import 'server-only'
import { db } from '@/server/db'
import { editDistance, normalize, stem, tokenize } from '@/lib/normalize'
import type { Locale } from '@/lib/i18n/config'

/**
 * Category tree + the "smart category" suggester.
 *
 * The whole taxonomy is loaded into memory and scored in JavaScript rather than
 * matched in SQL. That is a deliberate trade:
 *   - the dataset is tiny (~100 categories, a few hundred synonyms) and changes
 *     rarely, so a 200 ms debounced keystroke must not cost a database round trip
 *   - typo tolerance needs edit distance, which neither SQLite nor stock Postgres
 *     gives us portably (pg_trgm is Postgres-only, and this schema must run on both)
 *   - scoring rules stay readable and testable instead of turning into a CASE tower
 *
 * The cache is invalidated explicitly by the admin category editor via
 * `invalidateCategoryIndex()`; the TTL is a backstop for multi-process deployments.
 */

const CACHE_TTL_MS = 5 * 60 * 1000

export interface CategoryNode {
  id: string
  parentId: string | null
  slug: string
  path: string
  level: number
  sortOrder: number
  isPopular: boolean
  icon: string | null
  defaultUnit: string
  names: Record<Locale, string>
  slugs: Record<Locale, string>
  /** Ancestors first, then this node — used for breadcrumbs and the picker path. */
  trail: { id: string; name: Record<Locale, string> }[]
  childIds: string[]
}

interface SynonymEntry {
  categoryId: string
  locale: string
  normalized: string
  weight: number
  isMisspelling: boolean
}

interface CategoryIndex {
  builtAt: number
  byId: Map<string, CategoryNode>
  bySlug: Map<string, CategoryNode>
  /** localized slug -> node, per locale */
  byLocaleSlug: Map<string, CategoryNode>
  roots: CategoryNode[]
  popular: CategoryNode[]
  synonyms: SynonymEntry[]
  all: CategoryNode[]
}

let indexPromise: Promise<CategoryIndex> | null = null

export function invalidateCategoryIndex(): void {
  indexPromise = null
}

async function buildIndex(): Promise<CategoryIndex> {
  const [categories, synonyms] = await Promise.all([
    db.category.findMany({
      where: { isActive: true },
      include: { translations: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
    }),
    db.categorySynonym.findMany({
      select: {
        categoryId: true,
        locale: true,
        normalized: true,
        weight: true,
        isMisspelling: true,
      },
    }),
  ])

  const byId = new Map<string, CategoryNode>()
  const bySlug = new Map<string, CategoryNode>()
  const byLocaleSlug = new Map<string, CategoryNode>()

  for (const category of categories) {
    const names = { ru: category.slug, ro: category.slug } as Record<Locale, string>
    const slugs = { ru: category.slug, ro: category.slug } as Record<Locale, string>

    for (const translation of category.translations) {
      if (translation.locale === 'ru' || translation.locale === 'ro') {
        names[translation.locale] = translation.name
        slugs[translation.locale] = translation.slug
      }
    }

    const node: CategoryNode = {
      id: category.id,
      parentId: category.parentId,
      slug: category.slug,
      path: category.path,
      level: category.level,
      sortOrder: category.sortOrder,
      isPopular: category.isPopular,
      icon: category.icon,
      defaultUnit: category.defaultUnit,
      names,
      slugs,
      trail: [],
      childIds: [],
    }

    byId.set(node.id, node)
    bySlug.set(node.slug, node)
    byLocaleSlug.set(`ru:${slugs.ru}`, node)
    byLocaleSlug.set(`ro:${slugs.ro}`, node)
  }

  // Second pass: children and ancestor trails (categories are ordered by level, so a
  // parent is always already present).
  for (const node of byId.values()) {
    if (node.parentId) {
      byId.get(node.parentId)?.childIds.push(node.id)
    }

    const trail: CategoryNode['trail'] = []
    let cursor: CategoryNode | undefined = node
    while (cursor) {
      trail.unshift({ id: cursor.id, name: cursor.names })
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
    node.trail = trail
  }

  const all = [...byId.values()]

  return {
    builtAt: Date.now(),
    byId,
    bySlug,
    byLocaleSlug,
    all,
    roots: all.filter((node) => node.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder),
    popular: all.filter((node) => node.isPopular).sort((a, b) => a.sortOrder - b.sortOrder),
    synonyms,
  }
}

async function getIndex(): Promise<CategoryIndex> {
  if (!indexPromise) {
    indexPromise = buildIndex()
  }

  const index = await indexPromise
  if (Date.now() - index.builtAt > CACHE_TTL_MS) {
    indexPromise = buildIndex()
    return indexPromise
  }

  return index
}

// --- reads -------------------------------------------------------------------

export async function getCategoryTree(): Promise<CategoryNode[]> {
  return (await getIndex()).roots
}

export async function getAllCategories(): Promise<CategoryNode[]> {
  return (await getIndex()).all
}

export async function getPopularCategories(limit = 8): Promise<CategoryNode[]> {
  return (await getIndex()).popular.slice(0, limit)
}

export async function getCategoryById(id: string): Promise<CategoryNode | null> {
  return (await getIndex()).byId.get(id) ?? null
}

/** Resolves either the canonical slug or the locale-specific one. */
export async function getCategoryBySlug(
  slug: string,
  locale: Locale,
): Promise<CategoryNode | null> {
  const index = await getIndex()
  return index.byLocaleSlug.get(`${locale}:${slug}`) ?? index.bySlug.get(slug) ?? null
}

export async function getChildren(parentId: string | null): Promise<CategoryNode[]> {
  const index = await getIndex()
  if (parentId === null) return index.roots
  const parent = index.byId.get(parentId)
  if (!parent) return []
  return parent.childIds
    .map((id) => index.byId.get(id))
    .filter((node): node is CategoryNode => node !== undefined)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Every category id in the subtree, including the root itself.
 * Catalogue queries use this so /category/meat also returns chilled beef.
 */
export async function getSubtreeIds(categoryId: string): Promise<string[]> {
  const index = await getIndex()
  const root = index.byId.get(categoryId)
  if (!root) return []

  const ids: string[] = []
  const stack = [root]

  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    ids.push(node.id)
    for (const childId of node.childIds) {
      const child = index.byId.get(childId)
      if (child) stack.push(child)
    }
  }

  return ids
}

// --- suggestion --------------------------------------------------------------

export interface CategorySuggestion {
  category: CategoryNode
  score: number
  /** Human-readable trail, e.g. "Мясо → Говядина" */
  trailLabel: string
  matchedTerm: string | null
}

const MAX_SUGGESTIONS = 8

/**
 * Ranks categories against free-text input.
 *
 * Scoring is intentionally boring and inspectable:
 *   exact normalized match            +1000
 *   candidate starts with the query   + 600
 *   candidate contains the query      + 400
 *   per-token exact / stem / fuzzy    + 250 / 180 / 110
 *   synonym weight                    + weight / 2   (0-50)
 *   depth bonus                       + level * 40   (specific beats generic)
 *   misspelling entry                 -  40
 *
 * The depth bonus is what makes "говядина" propose «Мясо → Говядина» rather than the
 * broader «Мясо»: a leaf that matches is almost always the better answer.
 */
export async function suggestCategories(
  query: string,
  locale: Locale,
  limit = MAX_SUGGESTIONS,
): Promise<CategorySuggestion[]> {
  const normalizedQuery = normalize(query)
  if (normalizedQuery.length < 2) return []

  const index = await getIndex()
  const queryTokens = tokenize(normalizedQuery)
  const queryStems = queryTokens.map(stem)

  const scores = new Map<string, { score: number; term: string | null }>()

  const record = (categoryId: string, score: number, term: string | null) => {
    const existing = scores.get(categoryId)
    if (!existing || score > existing.score) {
      scores.set(categoryId, { score, term })
    }
  }

  const scoreCandidate = (candidate: string, categoryId: string, weight: number, penalty: number) => {
    if (!candidate) return

    let score = 0

    if (candidate === normalizedQuery) {
      score += 1000
    } else if (candidate.startsWith(normalizedQuery)) {
      score += 600
    } else if (candidate.includes(normalizedQuery)) {
      score += 400
    }

    const candidateTokens = tokenize(candidate)
    const candidateStems = candidateTokens.map(stem)

    for (let i = 0; i < queryTokens.length; i += 1) {
      const token = queryTokens[i]
      const tokenStem = queryStems[i]
      if (!token || !tokenStem || token.length < 2) continue

      if (candidateTokens.includes(token)) {
        score += 250
        continue
      }
      if (candidateStems.includes(tokenStem)) {
        score += 180
        continue
      }

      // Typo tolerance scales with word length; short words get no slack.
      const tolerance = token.length <= 4 ? 1 : token.length <= 7 ? 2 : 3
      const near = candidateTokens.some(
        (candidateToken) =>
          candidateToken.startsWith(token.slice(0, 2)) &&
          editDistance(token, candidateToken, tolerance) <= tolerance,
      )
      if (near) score += 110
    }

    if (score === 0) return

    const node = index.byId.get(categoryId)
    score += Math.round(weight / 2)
    score += (node?.level ?? 0) * 40
    score -= penalty

    record(categoryId, score, candidate)
  }

  // Category names in both locales — a Russian-speaking user may type a Romanian term.
  for (const node of index.all) {
    scoreCandidate(normalize(node.names.ru), node.id, 100, 0)
    if (node.names.ro !== node.names.ru) {
      scoreCandidate(normalize(node.names.ro), node.id, 100, 0)
    }
  }

  for (const synonym of index.synonyms) {
    scoreCandidate(
      synonym.normalized,
      synonym.categoryId,
      synonym.weight,
      synonym.isMisspelling ? 40 : 0,
    )
  }

  return [...scores.entries()]
    .map(([categoryId, { score, term }]) => {
      const category = index.byId.get(categoryId)
      if (!category) return null
      return {
        category,
        score,
        matchedTerm: term,
        trailLabel: category.trail.map((step) => step.name[locale]).join(' → '),
      }
    })
    .filter((item): item is CategorySuggestion => item !== null)
    .sort((a, b) => b.score - a.score || a.category.level - b.category.level)
    .slice(0, limit)
}

/**
 * Expands a search query into the category ids it plausibly refers to.
 * Used by the search engine so "помидоры" also matches products filed under
 * «Овощи → Помидоры» even when the listing title says "томаты".
 */
export async function resolveQueryCategories(query: string, locale: Locale): Promise<string[]> {
  const suggestions = await suggestCategories(query, locale, 3)
  // Only trust confident matches — a weak signal would drag in unrelated results.
  return suggestions.filter((item) => item.score >= 400).map((item) => item.category.id)
}

// --- attributes --------------------------------------------------------------

export interface ResolvedAttribute {
  id: string
  key: string
  type: string
  unit: string | null
  isRequired: boolean
  isFilterable: boolean
  appliesTo: string
  sortOrder: number
  label: string
  hint: string | null
  options: { id: string; value: string; label: string }[]
}

/**
 * Attributes for a category, including those inherited from its ancestors.
 *
 * Inheritance is why a listing under «Мясо → Говядина → Охлаждённая» still asks for
 * «вид мяса» defined once on «Мясо». A child may override a parent's attribute by
 * declaring the same `key`; the nearest definition wins.
 */
export async function getCategoryAttributes(
  categoryId: string,
  locale: Locale,
  appliesTo: 'PRODUCT' | 'REQUEST',
): Promise<ResolvedAttribute[]> {
  const index = await getIndex()
  const node = index.byId.get(categoryId)
  if (!node) return []

  const ancestorIds = node.trail.map((step) => step.id)

  const attributes = await db.categoryAttribute.findMany({
    where: {
      categoryId: { in: ancestorIds },
      OR: [{ appliesTo }, { appliesTo: 'BOTH' }],
    },
    include: {
      translations: { where: { locale } },
      options: {
        include: { translations: { where: { locale } } },
        orderBy: { sortOrder: 'asc' },
      },
      category: { select: { level: true } },
    },
    orderBy: { sortOrder: 'asc' },
  })

  // Nearest ancestor wins per key: sort by depth ascending, then let later overwrite.
  const byKey = new Map<string, ResolvedAttribute & { level: number }>()

  for (const attribute of attributes) {
    const isOwn = attribute.categoryId === categoryId
    if (!isOwn && !attribute.inherited) continue

    const level = attribute.category.level
    const existing = byKey.get(attribute.key)
    if (existing && existing.level > level) continue

    byKey.set(attribute.key, {
      level,
      id: attribute.id,
      key: attribute.key,
      type: attribute.type,
      unit: attribute.unit,
      isRequired: attribute.isRequired,
      isFilterable: attribute.isFilterable,
      appliesTo: attribute.appliesTo,
      sortOrder: attribute.sortOrder,
      label: attribute.translations[0]?.label ?? attribute.key,
      hint: attribute.translations[0]?.hint ?? null,
      options: attribute.options.map((option) => ({
        id: option.id,
        value: option.value,
        label: option.translations[0]?.label ?? option.value,
      })),
    })
  }

  return [...byKey.values()]
    .sort((a, b) => a.level - b.level || a.sortOrder - b.sortOrder)
    .map(({ level: _level, ...rest }) => rest)
}
