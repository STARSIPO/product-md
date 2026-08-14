import { Badge, type BadgeSize, type BadgeVariant } from '@/components/ui'
import type { RetailOrderStatus } from '@/lib/constants'

/**
 * One retail order status, coloured.
 *
 * Kept apart from `StatusBadge` because a consumer order means something different at
 * each step than a wholesale deal does: NEW is the shop's to-do list and has to read as
 * "needs you", where a deal's first state is a wait on the other party. Written as a
 * complete map rather than a switch, so adding a status is a compile error here rather
 * than a silently grey chip.
 */
const VARIANTS: Record<RetailOrderStatus, BadgeVariant> = {
  NEW: 'warning',
  CONFIRMED: 'primary',
  PREPARING: 'primary',
  DELIVERING: 'accent',
  DELIVERED: 'success',
  CANCELLED: 'neutral',
}

export function OrderStatusBadge({
  status,
  label,
  size = 'sm',
}: {
  status: string
  /** Already translated — the badge never invents copy. */
  label: string
  size?: BadgeSize
}) {
  const lookup: Partial<Record<string, BadgeVariant>> = VARIANTS
  return (
    <Badge variant={lookup[status] ?? 'neutral'} size={size}>
      {label}
    </Badge>
  )
}
