'use client'

import { useRef, type KeyboardEvent } from 'react'

import { cn } from '@/lib/utils'

export interface TabItem {
  id: string
  label: string
  badge?: string | number
}

export interface TabsProps {
  tabs: readonly TabItem[]
  active: string
  onChange: (id: string) => void
  /** Accessible name for the tablist — required whenever a page has more than one. */
  label?: string
  className?: string
}

export function Tabs({ tabs, active, onChange, label, className }: TabsProps) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1
    let next = -1

    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next < 0) return

    const target = tabs[next]
    if (!target) return

    event.preventDefault()
    onChange(target.id)
    buttonsRef.current[next]?.focus()
  }

  return (
    <div className={cn('no-scrollbar w-full overflow-x-auto border-b border-border', className)}>
      <div role="tablist" aria-label={label} className="flex min-w-max items-end gap-1">
        {tabs.map((tab, index) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttonsRef.current[index] = node
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                'relative inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-t-sm px-3 pb-2.5 pt-2 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors after:duration-150',
                selected
                  ? 'font-semibold text-primary after:bg-primary'
                  : 'font-medium text-muted-foreground after:bg-transparent hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.badge !== undefined ? (
                <span
                  className={cn(
                    'tnum inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-caption font-medium leading-none',
                    selected ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
