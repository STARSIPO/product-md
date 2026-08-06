'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, FolderTree, Loader2, Sparkles, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'
import { Button, Field, Input } from '@/components/ui'

/**
 * The "smart category" field.
 *
 * This is the first thing a seller or buyer touches, and the spec is strict about how
 * it behaves:
 *   - categories appear immediately, before anything is typed (popular ones)
 *   - typing produces ranked suggestions, debounced ~250 ms
 *   - exactly ONE suggestion is presented as «Рекомендуемая категория», with a
 *     «Выбрать другую» escape hatch next to it
 *   - a category is NEVER assigned without the user confirming it
 *   - the chosen path is shown as a trail and the user can step back up a level
 *
 * Ranking lives on the server (src/server/services/categories.ts) so the same synonym
 * and typo handling powers search; this component only renders the result.
 */

export interface PickedCategory {
  id: string
  name: string
  trail: string
  defaultUnit: string
}

interface Suggestion extends PickedCategory {
  slug?: string
  score?: number
}

interface TreeItem extends PickedCategory {
  parentId: string | null
  hasChildren: boolean
}

const DEBOUNCE_MS = 250

export function CategoryPicker({
  value,
  onChange,
  label,
  placeholder,
  hint,
  error,
  appliesTo = 'PRODUCT',
  autoFocus = false,
}: {
  value: PickedCategory | null
  onChange: (category: PickedCategory | null) => void
  label: string
  placeholder: string
  hint?: string
  error?: string
  appliesTo?: 'PRODUCT' | 'REQUEST'
  autoFocus?: boolean
}) {
  const { t, locale } = useI18n()

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [popular, setPopular] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [browsing, setBrowsing] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // Popular categories are fetched once and shown before the user types anything, so
  // the field is never an empty box with no way forward.
  useEffect(() => {
    let cancelled = false
    void fetch(`/api/categories/suggest?locale=${locale}&appliesTo=${appliesTo}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { popular?: Suggestion[] } | null) => {
        if (!cancelled && data?.popular) setPopular(data.popular)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [locale, appliesTo])

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < 2) {
      abortRef.current?.abort()
      setSuggestions([])
      setLoading(false)
      return
    }

    setLoading(true)
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const response = await fetch(
          `/api/categories/suggest?q=${encodeURIComponent(trimmed)}&locale=${locale}&appliesTo=${appliesTo}`,
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error('suggest failed')
        const data = (await response.json()) as { suggestions: Suggestion[] }
        setSuggestions(data.suggestions)
        setShowAlternatives(false)
      } catch (fetchError) {
        if ((fetchError as Error).name !== 'AbortError') setSuggestions([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [query, locale, appliesTo])

  const pick = useCallback(
    (category: PickedCategory) => {
      onChange(category)
      setBrowsing(false)
      setSuggestions([])
      setQuery('')
    },
    [onChange],
  )

  // --- already chosen: show the trail and let the user change it -------------
  if (value && !browsing) {
    return (
      <Field label={label} hint={hint} error={error}>
        <div className="flex items-start gap-3 rounded-md border border-primary/40 bg-primary-soft/40 p-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Check className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted-foreground">{t.productForm.selectedPath}</p>
            <p className="mt-0.5 break-words text-sm font-medium">{value.trail}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null)
              setBrowsing(false)
            }}
          >
            {t.common.change}
          </Button>
        </div>
      </Field>
    )
  }

  // --- browsing the full tree ------------------------------------------------
  if (browsing) {
    return (
      <Field label={label} hint={hint} error={error}>
        <CategoryBrowser
          locale={locale}
          onPick={pick}
          onClose={() => setBrowsing(false)}
          backLabel={t.productForm.backLevel}
          closeLabel={t.common.cancel}
          title={t.productForm.allCategories}
        />
      </Field>
    )
  }

  const recommended = suggestions[0]
  const alternatives = suggestions.slice(1)

  return (
    <Field label={label} hint={hint} error={error} htmlFor="category-query">
      <div className="space-y-3">
        <div className="relative">
          <Input
            id="category-query"
            value={query}
            autoFocus={autoFocus}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            invalid={Boolean(error)}
            aria-describedby="category-picker-status"
          />
          {loading ? (
            <Loader2
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t.common.clear}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <p id="category-picker-status" className="sr-only" aria-live="polite">
          {loading
            ? t.common.loading
            : recommended
              ? `${t.productForm.recommendedCategory}: ${recommended.trail}`
              : ''}
        </p>

        {recommended ? (
          <div className="rounded-md border border-primary/40 bg-primary-soft/30 p-3">
            <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t.productForm.recommendedCategory}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 break-words text-sm font-medium">{recommended.trail}</p>
              <div className="flex shrink-0 gap-2">
                {alternatives.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAlternatives((open) => !open)}
                    aria-expanded={showAlternatives}
                  >
                    {t.productForm.chooseAnother}
                  </Button>
                ) : null}
                <Button type="button" size="sm" onClick={() => pick(recommended)}>
                  {t.common.select}
                </Button>
              </div>
            </div>

            {showAlternatives ? (
              <ul className="mt-3 space-y-1 border-t border-primary/20 pt-2">
                {alternatives.map((suggestion) => (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      onClick={() => pick(suggestion)}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded px-2 text-left text-sm transition-colors hover:bg-card"
                    >
                      <FolderTree className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="break-words">{suggestion.trail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {!recommended && query.trim().length >= 2 && !loading ? (
          <p className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            {t.search.noResultsHint}
          </p>
        ) : null}

        {query.trim().length < 2 && popular.length > 0 ? (
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
              {t.productForm.popularCategories}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {popular.map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() => pick(category)}
                    className="min-h-[36px] rounded-full border border-border px-3 text-sm transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary"
                  >
                    {category.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button type="button" variant="outline" size="sm" onClick={() => setBrowsing(true)}>
          <FolderTree className="mr-1.5 h-4 w-4" aria-hidden />
          {t.productForm.allCategories}
        </Button>
      </div>
    </Field>
  )
}

/** Level-by-level tree navigation for people who would rather browse than type. */
function CategoryBrowser({
  locale,
  onPick,
  onClose,
  backLabel,
  closeLabel,
  title,
}: {
  locale: string
  onPick: (category: PickedCategory) => void
  onClose: () => void
  backLabel: string
  closeLabel: string
  title: string
}) {
  const [parentId, setParentId] = useState<string | null>(null)
  const [parent, setParent] = useState<TreeItem | null>(null)
  const [items, setItems] = useState<TreeItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void fetch(`/api/categories/tree?locale=${locale}&parent=${parentId ?? 'root'}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { parent: TreeItem | null; items: TreeItem[] } | null) => {
        if (cancelled || !data) return
        setParent(data.parent)
        setItems(data.items)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [parentId, locale])

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        {parent ? (
          <button
            type="button"
            onClick={() => setParentId(parent.parentId)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded text-sm font-medium text-primary"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {backLabel}
          </button>
        ) : (
          <span className="text-sm font-medium">{title}</span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {closeLabel}
        </button>
      </div>

      {parent ? (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
          <span className="min-w-0 break-words text-caption text-muted-foreground">
            {parent.trail}
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={() => onPick(parent)}>
            {closeLabel === '' ? '' : '✓'}
          </Button>
        </div>
      ) : null}

      <ul className="max-h-72 overflow-y-auto p-1">
        {loading ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">…</li>
        ) : (
          items.map((item) => (
            <li key={item.id}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="min-h-[44px] flex-1 rounded px-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  {item.name}
                </button>
                {item.hasChildren ? (
                  <button
                    type="button"
                    onClick={() => setParentId(item.id)}
                    aria-label={item.name}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
