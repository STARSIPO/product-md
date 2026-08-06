import Image from 'next/image'

import { cn, initials } from '@/lib/utils'

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<AvatarSize, { classes: string; px: number }> = {
  sm: { classes: 'h-7 w-7 text-caption', px: 28 },
  md: { classes: 'h-9 w-9 text-sm', px: 36 },
  lg: { classes: 'h-12 w-12 text-base', px: 48 },
  xl: { classes: 'h-16 w-16 text-lg', px: 64 },
}

export interface AvatarProps {
  src?: string | null
  /** Company or person name — used as the image alt and as the initials source. */
  name: string
  size?: AvatarSize
  className?: string
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const { classes, px } = SIZES[size]
  const shared = cn(
    'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
    classes,
    className,
  )

  if (src) {
    return (
      <span className={cn(shared, 'bg-muted')}>
        <Image src={src} alt={name} width={px} height={px} className="h-full w-full object-cover" />
      </span>
    )
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(shared, 'bg-primary-soft font-semibold text-primary')}
    >
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  )
}
