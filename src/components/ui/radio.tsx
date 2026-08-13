import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface RadioOption {
  value: string
  label: string
  hint?: string
  icon?: ReactNode
}

export interface RadioGroupProps {
  name: string
  value: string
  onChange: (value: string) => void
  options: readonly RadioOption[]
  columns?: 1 | 2 | 3
  disabled?: boolean
  className?: string
}

const COLUMNS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
}

/**
 * Cards are the visual layer only — a real <input type="radio"> stays inside every
 * card so arrow-key navigation, form submission and screen readers work natively.
 */
export function RadioGroup({
  name,
  value,
  onChange,
  options,
  columns = 1,
  disabled = false,
  className,
}: RadioGroupProps) {
  return (
    <div className={cn('grid gap-3', COLUMNS[columns], className)}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            // Unselected reads as a raised card (elevation, transparent edge); selected
            // swaps elevation for the tint + outline that actually means something.
            'relative flex min-h-[56px] cursor-pointer items-start gap-3 rounded-md border border-transparent bg-card p-4 shadow-card transition-colors duration-150 hover:border-primary/40',
            'has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:shadow-none',
            'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
            'has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-muted has-[:disabled]:opacity-70 has-[:disabled]:shadow-none',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded-full border border-input bg-card transition-[border-width] duration-150 checked:border-[6px] checked:border-primary focus-visible:outline-none disabled:cursor-not-allowed"
          />
          <span className="flex min-w-0 flex-1 items-start gap-2.5">
            {option.icon ? (
              <span
                aria-hidden="true"
                className="mt-[1px] shrink-0 text-muted-foreground [&>svg]:h-[18px] [&>svg]:w-[18px]"
              >
                {option.icon}
              </span>
            ) : null}
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{option.label}</span>
              {option.hint ? (
                <span className="mt-0.5 block text-caption text-muted-foreground">
                  {option.hint}
                </span>
              ) : null}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}
