import * as React from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] gap-1.5 px-3 text-sm',
  md: 'min-h-[42px] gap-2 px-4 text-sm',
  lg: 'min-h-[48px] gap-2 px-5 text-base',
  icon: 'h-[42px] w-[42px] shrink-0 gap-0 p-0',
}

/* Declared after SIZES so a variant may legitimately override the size padding (see `link`). */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-border',
  outline: 'border-input bg-card text-foreground hover:bg-muted',
  ghost: 'border-transparent bg-transparent text-foreground hover:bg-muted',
  destructive: 'border-transparent bg-destructive text-white hover:bg-destructive/90',
  link: 'h-auto min-h-0 border-transparent bg-transparent p-0 text-primary underline-offset-4 hover:underline',
}

export interface ButtonVariantOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
}

/** Exported so <Link>/<a> can be styled identically without duplicating the class list. */
export function buttonVariants({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: ButtonVariantOptions = {}): string {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap rounded-md border font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55',
    SIZES[size],
    VARIANTS[variant],
    fullWidth && 'w-full',
    className,
  )
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size = 'md',
    loading = false,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonVariants({ variant, size, fullWidth, className })}
      disabled={disabled === true || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> : null}
      {loading && size === 'icon' ? null : children}
    </button>
  )
})
