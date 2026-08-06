import type { ReactNode } from 'react'
import {
  BadgeCheck,
  Building2,
  FileCheck2,
  Landmark,
  Leaf,
  Mail,
  Phone,
  ScanLine,
} from 'lucide-react'
import { VERIFICATION_TYPES } from '@/lib/constants'
import type { Dictionary } from '@/lib/i18n'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * The only public surface for a company's verification.
 *
 * It renders the *result* of a check and nothing else: no document numbers, no file
 * links, no signed URLs. The documents themselves stay in private storage, reachable
 * only by their owner and by moderators — a badge here is the whole story a buyer gets,
 * which is exactly the privacy promise made on the homepage.
 *
 * Each badge carries an icon *and* its translated label, so verification is never
 * communicated by shape or colour alone.
 */

export interface VerificationBadgeData {
  type: string
  /** Omit when the caller already selected only approved rows. */
  status?: string | null
}

const ICONS: Record<string, ReactNode> = {
  PHONE: <Phone aria-hidden />,
  EMAIL: <Mail aria-hidden />,
  COMPANY: <Building2 aria-hidden />,
  IDNO: <ScanLine aria-hidden />,
  DOCUMENTS: <FileCheck2 aria-hidden />,
  ANSA: <Leaf aria-hidden />,
  BANK: <Landmark aria-hidden />,
  TRUSTED_SUPPLIER: <BadgeCheck aria-hidden />,
}

/** Trust first, then the rest in the canonical order from constants.ts. */
const ORDER: readonly string[] = [
  'TRUSTED_SUPPLIER',
  ...VERIFICATION_TYPES.filter((type) => type !== 'TRUSTED_SUPPLIER'),
]

export function VerificationBadges({
  badges,
  t,
  size = 'md',
  className,
}: {
  badges: readonly VerificationBadgeData[]
  t: Dictionary
  size?: 'sm' | 'md'
  className?: string
}) {
  const approved = badges
    .filter((badge) => badge.status === undefined || badge.status === null || badge.status === 'APPROVED')
    .filter((badge, index, list) => list.findIndex((item) => item.type === badge.type) === index)
    .sort((a, b) => {
      const left = ORDER.indexOf(a.type)
      const right = ORDER.indexOf(b.type)
      return (left === -1 ? ORDER.length : left) - (right === -1 ? ORDER.length : right)
    })

  if (approved.length === 0) return null

  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)}>
      {approved.map((badge) => {
        const label =
          t.verification.types[badge.type as keyof typeof t.verification.types] ?? badge.type

        return (
          <li key={badge.type}>
            <Badge
              variant={badge.type === 'TRUSTED_SUPPLIER' ? 'primary' : 'neutral'}
              size={size}
              icon={ICONS[badge.type]}
            >
              {label}
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}
