import type { Metadata } from 'next'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { formatDateTime } from '@/lib/i18n/format'
import { baniToMdl } from '@/lib/money'
import { DEFAULT_TARIFFS } from '@/lib/constants'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { isEnabled } from '@/server/services/feature-flags'
import { DataTable, type DataColumn } from '@/components/admin/data-table'
import { TariffForm } from '@/components/admin/decision-dialog'
import { Alert } from '@/components/ui'

/**
 * Runtime pricing.
 *
 * Prices are edited in MDL and stored as integer bani — `tariffSchema` does the
 * conversion, so no float ever reaches the database. Every row here is read by the
 * nightly billing job on its next run; nothing needs a deploy.
 *
 * A key that has no row yet falls back to DEFAULT_TARIFFS, which is why the table lists
 * the defaults as editable rows rather than hiding them until somebody creates one.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.admin.tariffs} — ${t.admin.title}`,
    robots: { index: false, follow: false },
  }
}

interface TariffRow {
  key: string
  priceBani: number
  unit: string
  isActive: boolean
  updatedAt: Date | null
  /** True when the value still comes from the code defaults, not from a row. */
  isDefault: boolean
}

export default async function AdminTariffsPage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireAdmin(locale)

  const [stored, billingEnabled] = await Promise.all([
    db.tariff.findMany({ orderBy: { key: 'asc' } }),
    isEnabled('BILLING_ENABLED'),
  ])

  const byKey = new Map(stored.map((row) => [row.key, row]))
  const keys = [...new Set([...Object.keys(DEFAULT_TARIFFS), ...byKey.keys()])].sort()

  const rows: TariffRow[] = keys.map((key) => {
    const row = byKey.get(key)
    const fallback = DEFAULT_TARIFFS[key]
    return {
      key,
      priceBani: row?.priceBani ?? fallback?.priceBani ?? 0,
      unit: row?.unit ?? fallback?.unit ?? 'DAY',
      isActive: row?.isActive ?? true,
      updatedAt: row?.updatedAt ?? null,
      isDefault: row === undefined,
    }
  })

  const promos = t.pricing.promos as Record<string, string | undefined>

  function label(key: string): string {
    if (key === 'LISTING_DAILY') return t.pricing.listingTitle
    const promoKey = key.startsWith('PROMO_') ? key.slice('PROMO_'.length) : key
    return promos[promoKey] ?? key
  }

  const columns: DataColumn<TariffRow>[] = [
    {
      key: 'tariff',
      header: t.admin.tariffKey,
      primary: true,
      cell: (row) => (
        <div className="min-w-0">
          <span className="font-medium">{label(row.key)}</span>
          <p className="font-mono text-caption text-muted-foreground">{row.key}</p>
        </div>
      ),
    },
    {
      key: 'unit',
      header: t.admin.tariffUnit,
      cell: (row) => <span className="text-sm text-muted-foreground">{row.unit}</span>,
    },
    {
      key: 'updated',
      header: t.common.date,
      hideOnMobile: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.updatedAt ? formatDateTime(row.updatedAt, locale) : '—'}
        </span>
      ),
    },
    {
      key: 'form',
      header: t.admin.tariffPrice,
      cell: (row) => (
        <TariffForm
          tariffKey={row.key}
          price={baniToMdl(row.priceBani).toFixed(2)}
          isActive={row.isActive}
        />
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {!billingEnabled ? <Alert variant="info">{t.admin.billingWarning}</Alert> : null}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.key}
        empty={t.admin.empty}
        caption={t.admin.tariffs}
      />
    </div>
  )
}
