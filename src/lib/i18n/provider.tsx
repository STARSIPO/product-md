'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { localePath, type Locale } from './config'
import { fmt, type Dictionary } from './index'

/**
 * Makes the already-loaded dictionary available to client components.
 *
 * The server renders the layout, loads the dictionary once and hands it down —
 * client components never fetch translations, so there is no flash of untranslated
 * text and no second copy of the dictionary in the payload per component.
 */
interface I18nValue {
  locale: Locale
  t: Dictionary
  fmt: typeof fmt
  /** Builds a localized href from canonical segments — see localePath(). */
  href: (...segments: (string | number)[]) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale
  dictionary: Dictionary
  children: ReactNode
}) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: dictionary,
      fmt,
      href: (...segments) => localePath(locale, ...segments),
    }),
    [locale, dictionary],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used inside <I18nProvider>')
  }
  return context
}
