'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

export type DialogSize = 'sm' | 'md' | 'lg'

const SIZES: Record<DialogSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
}

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: DialogSize
  /** Accessible name for the icon close button; the button is omitted without it. */
  closeLabel?: string
  className?: string
}

/**
 * Built on the native <dialog>: showModal() gives a real focus trap, inertness of the
 * rest of the page and top-layer stacking that no z-index hack can break. React state
 * stays the single source of truth, so the native Escape `cancel` is intercepted and
 * routed back through onClose instead of closing the element behind React's back.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel,
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const reactId = useId()
  const titleId = `${reactId}-title`
  const descriptionId = `${reactId}-description`

  useEffect(() => {
    const element = dialogRef.current
    if (!element) return

    if (open) {
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (!element.open) element.showModal()
      return
    }

    if (element.open) element.close()
    const trigger = triggerRef.current
    triggerRef.current = null
    trigger?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

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

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      className="fixed inset-0 m-0 h-auto max-h-none w-auto max-w-none overflow-y-auto overscroll-contain bg-transparent p-0 text-foreground backdrop:animate-fade-in backdrop:bg-foreground/40"
    >
      {open ? (
        <div
          onClick={handleBackdropClick}
          className="flex min-h-full w-full items-end justify-center sm:items-center sm:p-6"
        >
          <div
            className={cn(
              // Elevation only: shadow-pop separates the panel from the scrim, so the
              // outline and both internal rules are gone. Spacing does that work now.
              'w-full animate-slide-up rounded-t-xl bg-card shadow-pop sm:rounded-xl',
              SIZES[size],
              className,
            )}
          >
            <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
              <div className="min-w-0">
                <h2 id={titleId} className="text-h3">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </p>
                ) : null}
              </div>
              {closeLabel ? (
                <button
                  type="button"
                  aria-label={closeLabel}
                  onClick={onClose}
                  className="-mr-2 -mt-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              ) : null}
            </div>

            <div
              className={cn(
                'px-5 text-sm',
                footer ? undefined : 'pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5',
              )}
            >
              {children}
            </div>

            {footer ? (
              <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:pb-5">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  )
}
