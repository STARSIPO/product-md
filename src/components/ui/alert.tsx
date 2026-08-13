import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'

import { cn } from '@/lib/utils'

export type AlertVariant = 'info' | 'success' | 'warning' | 'destructive'

/**
 * The tint alone carries the variant — an outline on top of a coloured fill was one
 * line too many. The icon sits in a white chip so it reads as a glyph, not a bullet.
 */
const VARIANTS: Record<AlertVariant, { box: string; icon: string }> = {
  info: { box: 'bg-primary-soft', icon: 'text-primary' },
  success: { box: 'bg-success-soft', icon: 'text-success' },
  warning: { box: 'bg-warning-soft', icon: 'text-warning' },
  destructive: { box: 'bg-destructive-soft', icon: 'text-destructive' },
}

const DEFAULT_ICONS: Record<AlertVariant, ReactNode> = {
  info: <Info aria-hidden="true" />,
  success: <CheckCircle2 aria-hidden="true" />,
  warning: <AlertTriangle aria-hidden="true" />,
  destructive: <AlertCircle aria-hidden="true" />,
}

export interface AlertProps {
  variant: AlertVariant
  title?: string
  children: ReactNode
  icon?: ReactNode
  className?: string
}

export function Alert({ variant, title, children, icon, className }: AlertProps) {
  const tone = VARIANTS[variant]

  return (
    <div
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg p-4 text-sm text-foreground', tone.box, className)}
    >
      <span
        aria-hidden="true"
        className={cn('icon-chip h-9 w-9 bg-card [&>svg]:h-5 [&>svg]:w-5', tone.icon)}
      >
        {icon ?? DEFAULT_ICONS[variant]}
      </span>
      <div className="min-w-0 flex-1 self-center">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn('text-sm text-foreground/90', title && 'mt-0.5')}>{children}</div>
      </div>
    </div>
  )
}
