import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'

export type RatingSize = 'sm' | 'md'

const STAR_SIZES: Record<RatingSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-[18px] w-[18px]',
}

const MAX_STARS = 5

export interface RatingProps {
  value: number
  count?: number
  size?: RatingSize
  showValue?: boolean
  /** Screen-reader sentence stating the numeric rating, e.g. "4.5 out of 5". */
  label?: string
  className?: string
}

/**
 * The stars are decorative: everything they encode is repeated as real text
 * (`label` for assistive tech, `showValue`/`count` on screen), so the rating is
 * never communicated by shape or colour alone.
 */
export function Rating({
  value,
  count,
  size = 'sm',
  showValue = false,
  label,
  className,
}: RatingProps) {
  const clamped = Math.min(Math.max(value, 0), MAX_STARS)

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {label ? <span className="sr-only">{label}</span> : null}
      <span aria-hidden="true" className="inline-flex items-center gap-0.5">
        {Array.from({ length: MAX_STARS }, (_, index) => {
          const fill = Math.min(Math.max(clamped - index, 0), 1)
          return (
            <span key={index} className="relative inline-flex">
              <Star
                className={cn(STAR_SIZES[size], 'text-input')}
                fill="currentColor"
                strokeWidth={0}
              />
              {fill > 0 ? (
                <span
                  className="absolute inset-y-0 left-0 overflow-hidden"
                  style={{ width: `${(fill * 100).toFixed(2)}%` }}
                >
                  <Star
                    className={cn(STAR_SIZES[size], 'text-warning')}
                    fill="currentColor"
                    strokeWidth={0}
                  />
                </span>
              ) : null}
            </span>
          )
        })}
      </span>
      {showValue ? (
        <span
          className={cn(
            'tnum font-medium text-foreground',
            size === 'sm' ? 'text-caption' : 'text-sm',
          )}
        >
          {clamped.toFixed(1)}
        </span>
      ) : null}
      {count !== undefined ? (
        <span
          className={cn('tnum text-muted-foreground', size === 'sm' ? 'text-caption' : 'text-sm')}
        >
          ({count})
        </span>
      ) : null}
    </span>
  )
}

export interface RatingInputProps {
  value: number
  onChange: (value: number) => void
  name: string
  size?: RatingSize
  /** Accessible name for the whole group, e.g. "Your rating". */
  label?: string
  /** Accessible name for one star; defaults to the numeral itself. */
  optionLabel?: (star: number) => string
  disabled?: boolean
  className?: string
}

export function RatingInput({
  value,
  onChange,
  name,
  size = 'md',
  label,
  optionLabel,
  disabled = false,
  className,
}: RatingInputProps) {
  return (
    <span
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {Array.from({ length: MAX_STARS }, (_, index) => {
        const star = index + 1
        const id = `${name}-${star}`
        return (
          <label
            key={star}
            htmlFor={id}
            className={cn(
              'inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md transition-colors duration-150',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
              disabled ? 'cursor-not-allowed opacity-55' : 'hover:bg-muted',
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              disabled={disabled}
              onChange={() => onChange(star)}
              className="sr-only"
            />
            <span className="sr-only">{optionLabel ? optionLabel(star) : String(star)}</span>
            <Star
              aria-hidden="true"
              strokeWidth={0}
              fill="currentColor"
              className={cn(
                size === 'sm' ? 'h-5 w-5' : 'h-6 w-6',
                star <= value ? 'text-warning' : 'text-input',
              )}
            />
          </label>
        )
      })}
    </span>
  )
}
