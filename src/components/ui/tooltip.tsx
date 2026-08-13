'use client'

import {
  cloneElement,
  useCallback,
  useId,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

const SIDES: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
}

export interface TooltipProps {
  content: ReactNode
  /** A single focusable element — the tooltip attaches aria-describedby to it. */
  children: ReactElement<{ 'aria-describedby'?: string }>
  side?: TooltipSide
  className?: string
}

/**
 * No positioning library on purpose: tooltips here sit next to small icon buttons in
 * predictable places, so an absolutely positioned sibling is enough and costs nothing.
 * It opens on focus as well as hover, and is removed from the tree when closed so
 * assistive technology never reads a hidden description.
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const id = `${useId()}-tooltip`

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Escape') setOpen(false)
  }, [])

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      onKeyDown={handleKeyDown}
    >
      {cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={cn(
            // rounded-sm, not the card radius: 12px on a 28px-tall label reads bulbous.
            'pointer-events-none absolute z-50 w-max max-w-[16rem] animate-fade-in rounded-sm bg-foreground px-2.5 py-1.5 text-caption text-background shadow-pop',
            SIDES[side],
            className,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  )
}
