'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

export type SheetSide = 'bottom' | 'right'

const TRANSITION_MS = 220

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** 'right' becomes a side panel from the `sm` breakpoint up; mobile is always a bottom sheet. */
  side?: SheetSide
  footer?: ReactNode
  /** Accessible name for the icon close button; the button is omitted without it. */
  closeLabel?: string
  className?: string
}

/**
 * Also a native <dialog> — showModal() is the only focus trap that cannot be escaped by
 * browser UI or nested portals. role/aria-modal are stated explicitly for older AT that
 * does not yet map the element implicitly. Enter/exit use a transform transition rather
 * than a keyframe so the same component can slide from the bottom or from the right.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  side = 'bottom',
  footer,
  closeLabel,
  className,
}: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)
  const titleId = `${useId()}-title`

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    setEntered(false)
    const timer = window.setTimeout(() => setMounted(false), TRANSITION_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    const element = dialogRef.current
    if (!element) return

    if (mounted && !element.open) {
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      element.showModal()
      const frame = window.requestAnimationFrame(() => setEntered(true))
      return () => window.cancelAnimationFrame(frame)
    }

    if (!mounted && element.open) {
      element.close()
      const trigger = triggerRef.current
      triggerRef.current = null
      trigger?.focus()
    }
    return
  }, [mounted])

  useEffect(() => {
    if (!mounted) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mounted])

  const handleCancel = useCallback(
    (event: SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault()
      onClose()
    },
    [onClose],
  )

  const handleBackdropClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose()
    },
    [onClose],
  )

  const isSide = side === 'right'

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={handleCancel}
      className="fixed inset-0 m-0 h-auto max-h-none w-auto max-w-none bg-transparent p-0 text-foreground backdrop:bg-transparent"
    >
      {mounted ? (
        <>
          <div
            aria-hidden="true"
            className={cn(
              'fixed inset-0 bg-foreground/40 transition-opacity duration-[220ms] ease-out',
              entered ? 'opacity-100' : 'opacity-0',
            )}
          />
          <div
            onClick={handleBackdropClick}
            className={cn(
              'relative flex h-full w-full items-end justify-center',
              isSide && 'sm:items-stretch sm:justify-end',
            )}
          >
            <div
              className={cn(
                'flex max-h-[92vh] w-full flex-col rounded-t-xl bg-card shadow-pop transition-transform duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                isSide
                  ? 'sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-xl'
                  : 'sm:max-w-lg sm:rounded-b-xl',
                entered ? 'translate-y-0' : 'translate-y-full',
                isSide &&
                  (entered
                    ? 'sm:translate-x-0 sm:translate-y-0'
                    : 'sm:translate-x-full sm:translate-y-0'),
                className,
              )}
            >
              {/*
                Unlike the dialog, the sheet body scrolls independently — these two
                hairlines are load-bearing: they mark where the fixed chrome ends and
                the scrolling content begins. They are kept for that reason alone.
              */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
                <h2 id={titleId} className="text-h3">
                  {title}
                </h2>
                {closeLabel ? (
                  <button
                    type="button"
                    aria-label={closeLabel}
                    onClick={onClose}
                    className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <X aria-hidden="true" className="h-5 w-5" />
                  </button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 text-sm sm:px-5">
                {children}
              </div>

              {footer ? (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-5">
                  {footer}
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </dialog>
  )
}
