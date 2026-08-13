'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
}

interface ToastItem extends ToastOptions {
  id: number
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 5000
const MAX_VISIBLE = 3

const VARIANTS: Record<ToastVariant, { icon: ReactNode; tone: string }> = {
  success: {
    icon: <CheckCircle2 aria-hidden="true" className="h-5 w-5" />,
    tone: 'bg-success-soft text-success',
  },
  error: {
    icon: <AlertCircle aria-hidden="true" className="h-5 w-5" />,
    tone: 'bg-destructive-soft text-destructive',
  },
  info: {
    icon: <Info aria-hidden="true" className="h-5 w-5" />,
    tone: 'bg-primary-soft text-primary',
  },
}

export interface ToastProviderProps {
  children: ReactNode
  /** Accessible name for the live region, e.g. "Notifications". */
  label?: string
  /** Accessible name for the per-toast close button; omitted, no button is rendered. */
  dismissLabel?: string
}

export function ToastProvider({ children, label, dismissLabel }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback((options: ToastOptions) => {
    nextId.current += 1
    const item: ToastItem = { ...options, id: nextId.current }
    setItems((current) => [...current.slice(-(MAX_VISIBLE - 1)), item])
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-label={label}
        className="pb-safe-nav pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 p-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[22rem] sm:p-0 sm:pb-0"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} dismissLabel={dismissLabel} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({
  item,
  onDismiss,
  dismissLabel,
}: {
  item: ToastItem
  onDismiss: (id: number) => void
  dismissLabel?: string
}) {
  const [paused, setPaused] = useState(false)
  const remaining = useRef(AUTO_DISMISS_MS)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    if (paused) {
      remaining.current -= Date.now() - startedAt.current
      return
    }
    startedAt.current = Date.now()
    const timer = window.setTimeout(() => onDismiss(item.id), Math.max(0, remaining.current))
    return () => window.clearTimeout(timer)
  }, [paused, item.id, onDismiss])

  const tone = VARIANTS[item.variant ?? 'info']

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="surface pointer-events-auto flex animate-slide-up items-start gap-3 p-4 shadow-pop"
    >
      <span aria-hidden="true" className={cn('icon-chip h-9 w-9', tone.tone)}>
        {tone.icon}
      </span>
      <div className="min-w-0 flex-1 self-center">
        <p className="text-sm font-semibold text-foreground">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-caption text-muted-foreground">{item.description}</p>
        ) : null}
      </div>
      {dismissLabel ? (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={() => onDismiss(item.id)}
          className="-mr-1.5 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>')
  }
  return context
}
