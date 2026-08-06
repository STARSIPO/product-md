import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'

import { cn } from '@/lib/utils'

export type AlertVariant = 'info' | 'success' | 'warning' | 'destructive'

const VARIANTS: Record<AlertVariant, { box: string; icon: string }> = {
  info: { box: 'border-primary/20 bg-primary-soft', icon: 'text-primary' },
  success: { box: 'border-success/20 bg-success-soft', icon: 'text-success' },
  warning: { box: 'border-warning/25 bg-warning-soft', icon: 'text-warning' },
  destructive: { box: 'border-destructive/25 bg-destructive-soft', icon: 'text-destructive' },
}

const DEFAULT_ICONS: Record<AlertVariant, ReactNode> = {
  info: <Info aria-hidden="true" className="h-[18px] w-[18px]" />,
  success: <CheckCircle2 aria-hidden="true" className="h-[18px] w-[18px]" />,
  warning: <AlertTriangle aria-hidden="true" className="h-[18px] w-[18px]" />,
  destructive: <AlertCircle aria-hidden="true" className="h-[18px] w-[18px]" />,
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
      className={cn(
        'flex gap-3 rounded-md border p-3.5 text-sm text-foreground',
        tone.box,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('mt-[1px] shrink-0', tone.icon)}>
        {icon ?? DEFAULT_ICONS[variant]}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn('text-sm text-foreground/90', title && 'mt-0.5')}>{children}</div>
      </div>
    </div>
  )
}
