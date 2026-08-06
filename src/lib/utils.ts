import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind-aware class merge used by every component. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Splits a total into pages the way the UI paginator expects. */
export function paginate(total: number, page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  return {
    page: current,
    pageCount,
    pageSize,
    total,
    skip: (current - 1) * pageSize,
    take: pageSize,
    hasPrevious: current > 1,
    hasNext: current < pageCount,
  }
}

/** Builds a querystring, dropping empty values so URLs stay clean and cacheable. */
export function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

export function truncate(input: string, length: number): string {
  if (input.length <= length) return input
  return `${input.slice(0, length - 1).trimEnd()}…`
}

/** Initials for the avatar fallback on company cards. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

/** Clamps a possibly-hostile `?page=` value. */
export function parsePage(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(Math.floor(parsed), 500)
}

export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

/** Groups rows by a key — used to fold attribute values onto their categories. */
export function groupBy<T, K extends string>(items: readonly T[], key: (item: T) => K) {
  const out = {} as Record<K, T[]>
  for (const item of items) {
    const k = key(item)
    ;(out[k] ??= []).push(item)
  }
  return out
}

/** Day key in Europe/Chisinau — the timezone all billing and stats are aligned to. */
export function chisinauDayKey(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Chisinau',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function isExpired(date: Date | null | undefined): boolean {
  return date !== null && date !== undefined && date.getTime() < Date.now()
}
