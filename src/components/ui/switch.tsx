import { cn } from '@/lib/utils'

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  /** Needed only to link the visible label text to the control. */
  id?: string
  className?: string
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  id,
  className,
}: SwitchProps) {
  const labelId = label !== undefined && id !== undefined ? `${id}-label` : undefined

  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={labelId === undefined ? label : undefined}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span
          aria-hidden="true"
          className={cn(
            'relative block h-6 w-11 rounded-full border transition-colors duration-150',
            checked ? 'border-primary bg-primary' : 'border-input bg-muted',
          )}
        >
          <span
            className={cn(
              'absolute left-0.5 top-0.5 block h-[18px] w-[18px] rounded-full bg-card shadow-card transition-transform duration-150',
              checked && 'translate-x-5',
            )}
          />
        </span>
      </button>
      {label !== undefined && labelId !== undefined ? (
        <label
          id={labelId}
          htmlFor={id}
          className={cn(
            'cursor-pointer text-sm text-foreground',
            disabled && 'cursor-not-allowed opacity-55',
          )}
        >
          {label}
        </label>
      ) : null}
    </span>
  )
}
