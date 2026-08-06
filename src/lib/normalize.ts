/**
 * Text normalization shared by the category typeahead and the search engine.
 *
 * Moldovan B2B traffic is bilingual and messy: a buyer types "carne de vita" with no
 * diacritics, "помидоры" instead of "томаты", or "картошка" instead of "картофель".
 * Everything that indexes or matches user text goes through `normalize()` first so
 * those all collapse onto the same key.
 */

/** Romanian diacritics, including the legacy cedilla forms Windows keyboards emit. */
const DIACRITIC_MAP: Record<string, string> = {
  ă: 'a',
  â: 'a',
  î: 'i',
  ș: 's',
  ş: 's', // U+015F cedilla variant
  ț: 't',
  ţ: 't', // U+0163 cedilla variant
  á: 'a',
  é: 'e',
  í: 'i',
  ó: 'o',
  ú: 'u',
  ü: 'u',
  ö: 'o',
  ё: 'е',
  й: 'и',
}

/**
 * Lowercase, strip diacritics, collapse whitespace and drop punctuation.
 * Cyrillic is preserved as Cyrillic — we never transliterate, because "с" and "c"
 * colliding would produce nonsense matches.
 */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[Ѐ-ӿÀ-ɏ]/g, (char) => DIACRITIC_MAP[char] ?? char)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Russian/Romanian inflection is heavy; a crude stem beats exact matching. */
const RU_SUFFIXES = [
  'ами',
  'ями',
  'ого',
  'его',
  'ому',
  'ему',
  'ыми',
  'ими',
  'ах',
  'ях',
  'ов',
  'ев',
  'ам',
  'ям',
  'ой',
  'ей',
  'ый',
  'ий',
  'ая',
  'яя',
  'ое',
  'ее',
  'ы',
  'и',
  'а',
  'я',
  'о',
  'е',
  'у',
  'ю',
]

const RO_SUFFIXES = ['urilor', 'elor', 'ilor', 'uri', 'ele', 'ilor', 'ul', 'le', 'ii', 'i', 'e', 'a']

/**
 * Light stemmer. Not linguistically correct — deliberately. It only needs to make
 * "помидоры"/"помидор" and "rosii"/"rosie" land on the same token.
 */
export function stem(token: string): string {
  if (token.length <= 4) return token

  const suffixes = /[Ѐ-ӿ]/.test(token) ? RU_SUFFIXES : RO_SUFFIXES
  for (const suffix of suffixes) {
    if (token.length - suffix.length >= 3 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length)
    }
  }
  return token
}

export function tokenize(input: string): string[] {
  const normalized = normalize(input)
  if (!normalized) return []
  return normalized.split(' ').filter((token) => token.length > 0)
}

export function stemTokens(input: string): string[] {
  return tokenize(input).map(stem)
}

/**
 * Damerau-Levenshtein distance, capped so a long non-match exits early instead of
 * filling an O(n·m) matrix. Powers typo tolerance in the category suggester.
 */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1

  const rows = a.length + 1
  const cols = b.length + 1
  let previous = new Array<number>(cols)
  let current = new Array<number>(cols)

  for (let j = 0; j < cols; j += 1) previous[j] = j

  for (let i = 1; i < rows; i += 1) {
    current[0] = i
    let rowMin = current[0] as number

    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      )
      current[j] = value
      if (value < rowMin) rowMin = value
    }

    if (rowMin > max) return max + 1
    const swap = previous
    previous = current
    current = swap
  }

  return previous[cols - 1] as number
}

/** Distance threshold that scales with word length: short words tolerate less. */
export function isFuzzyMatch(query: string, candidate: string): boolean {
  if (candidate.includes(query)) return true
  const tolerance = query.length <= 4 ? 1 : query.length <= 7 ? 2 : 3
  return editDistance(query, candidate, tolerance) <= tolerance
}

/** URL-safe slug that keeps Cyrillic readable by transliterating it. */
const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

export function slugify(input: string, maxLength = 70): string {
  const base = normalize(input)
    .split('')
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return base.slice(0, maxLength).replace(/-+$/g, '') || 'item'
}
