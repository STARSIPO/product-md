import { LOCALE_TAGS, type Locale } from './config'

/**
 * Locale-aware formatting for dates, numbers and durations.
 *
 * Everything is pinned to Europe/Chisinau. A supplier in Bălți and a buyer in
 * Chișinău must read the same delivery date off the same deal, regardless of what
 * timezone the rendering server happens to sit in.
 */

export const APP_TIMEZONE = 'Europe/Chisinau'

export function formatDate(date: Date | string, locale: Locale): string {
  const value = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: APP_TIMEZONE,
  }).format(value)
}

export function formatDateShort(date: Date | string, locale: Locale): string {
  const value = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: APP_TIMEZONE,
  }).format(value)
}

export function formatDateTime(date: Date | string, locale: Locale): string {
  const value = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIMEZONE,
  }).format(value)
}

export function formatTime(date: Date | string, locale: Locale): string {
  const value = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIMEZONE,
  }).format(value)
}

export function formatNumber(value: number, locale: Locale, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], { maximumFractionDigits }).format(value)
}

/** Compact form for card counters: 1 200 -> "1,2 тыс." */
export function formatCompact(value: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** "3 дня назад" / "acum 3 zile" — for message and listing timestamps. */
export function formatRelative(date: Date | string, locale: Locale): string {
  const value = typeof date === 'string' ? new Date(date) : date
  const diffMs = value.getTime() - Date.now()
  const rtf = new Intl.RelativeTimeFormat(LOCALE_TAGS[locale], { numeric: 'auto' })

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ]

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      return rtf.format(Math.round(diffMs / ms), unit)
    }
  }

  return rtf.format(Math.round(diffMs / 1000), 'second')
}

/**
 * Time left until a request stops accepting offers — "2 дн 4 ч".
 * Returns null once the deadline has passed so the caller can show a closed state.
 */
export function formatCountdown(deadline: Date | string, locale: Locale): string | null {
  const value = typeof deadline === 'string' ? new Date(deadline) : deadline
  const diffMs = value.getTime() - Date.now()
  if (diffMs <= 0) return null

  const totalMinutes = Math.floor(diffMs / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60

  const suffix = locale === 'ro' ? { d: 'z', h: 'h', m: 'min' } : { d: 'дн', h: 'ч', m: 'мин' }

  if (days > 0) return `${days} ${suffix.d} ${hours} ${suffix.h}`
  if (hours > 0) return `${hours} ${suffix.h} ${minutes} ${suffix.m}`
  return `${minutes} ${suffix.m}`
}
