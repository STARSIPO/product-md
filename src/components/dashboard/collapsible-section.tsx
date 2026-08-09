'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A form block that folds on a phone and is always open on a desktop.
 *
 * Not a `<details>`: `open` is a boolean attribute, so making it depend on the viewport
 * would need JavaScript that runs before paint and a hydration mismatch either way.
 * The panel is instead hidden by a class below `md` and forced visible from `md` up, so
 * the desktop layout is right in the first paint and stays right without JavaScript.
 *
 * A media-query listener then tells the component it is on a desktop, which is what
 * keeps `aria-expanded` honest — a header announcing "collapsed" above a visible panel
 * is worse than no header at all — and makes the toggle inert where there is nothing to
 * toggle.
 *
 * Content is always in the DOM. Folding a section must not hide a field from
 * find-in-page, and must never drop its value from the form.
 */

const DESKTOP_QUERY = '(min-width: 768px)'

export function CollapsibleSection({
  title,
  description,
  summary,
  defaultOpen = false,
  forceOpen = false,
  expandLabel,
  collapseLabel,
  children,
}: {
  title: string
  description?: string
  /** One line of "what is in here", shown only while the section is folded. */
  summary?: string
  defaultOpen?: boolean
  /**
   * Unfolds the section and keeps it unfolded — for the case where something inside it
   * needs to be seen, typically a rejected field. A validation error the user has to go
   * looking for is the same as no error message at all.
   */
  forceOpen?: boolean
  expandLabel: string
  collapseLabel: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen || forceOpen)
  const [isDesktop, setIsDesktop] = useState(false)
  const panelId = `${useId()}-panel`

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    const sync = () => setIsDesktop(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  const expanded = open || isDesktop

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <h2>
        <button
          type="button"
          onClick={() => {
            if (!isDesktop) setOpen((current) => !current)
          }}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:cursor-default md:hover:bg-transparent"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-h3">{title}</span>
            {description ? (
              <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                {description}
              </span>
            ) : null}
            {summary && !expanded ? (
              <span className="mt-1 block truncate text-caption text-muted-foreground">
                {summary}
              </span>
            ) : null}
          </span>
          <span className="sr-only">{expanded ? collapseLabel : expandLabel}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-150 md:hidden',
              open && 'rotate-180',
            )}
          />
        </button>
      </h2>

      <div
        id={panelId}
        className={cn(
          'space-y-4 border-t border-border px-4 pb-4 pt-4 sm:px-5 md:block',
          open ? 'block' : 'hidden',
        )}
      >
        {children}
      </div>
    </section>
  )
}
