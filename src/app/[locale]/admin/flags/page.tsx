import type { Metadata } from 'next'
import { AlertTriangle } from 'lucide-react'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { FEATURE_FLAGS } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { getFlags } from '@/server/services/feature-flags'
import { FlagSwitch } from '@/components/admin/decision-dialog'
import { Alert, Badge } from '@/components/ui'

/**
 * Runtime feature flags.
 *
 * These are the switches that change platform behaviour without a deploy, and
 * BILLING_ENABLED is the one that matters commercially: turning it off makes every
 * listing free from the next request onward, and turning it back on resumes the daily
 * charge on the next run of the nightly job. That consequence is stated on the screen
 * rather than left in a changelog — the flag is meant to be flipped under pressure.
 *
 * Every toggle writes an AuditLog row with the previous value and the admin who changed
 * it.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.featureFlags} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

export default async function AdminFlagsPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const flags = await getFlags()
  const descriptions = t.admin.flagDescriptions as Record<string, string | undefined>

  return (
    <div className="space-y-5">
      <Alert variant="warning" icon={<AlertTriangle aria-hidden className="h-[18px] w-[18px]" />}>
        {t.admin.billingWarning}
      </Alert>

      <ul className="surface divide-y divide-border">
        {FEATURE_FLAGS.map((key) => (
          <li key={key} className="flex flex-wrap items-center gap-3 px-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium">{key}</span>
                <Badge variant={flags[key] ? 'success' : 'neutral'} size="sm">
                  {flags[key] ? t.admin.flagEnabled : t.admin.flagDisabled}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{descriptions[key] ?? key}</p>
            </div>

            <FlagSwitch
              flagKey={key}
              enabled={flags[key]}
              label={flags[key] ? t.admin.flagEnabled : t.admin.flagDisabled}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
