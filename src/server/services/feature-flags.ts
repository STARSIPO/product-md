import 'server-only'
import { db } from '@/server/db'
import { DEFAULT_FEATURE_FLAGS, type FeatureFlagKey } from '@/lib/constants'

/**
 * Runtime feature flags.
 *
 * Monetisation is the reason these exist: the launch plan is free listings, then
 * 1 MDL/day once there is enough supply — and the ability to switch billing back off
 * for everyone, immediately, without a deploy. `BILLING_ENABLED` is read by the daily
 * billing job and by every price-facing screen.
 *
 * Unknown or missing rows fall back to DEFAULT_FEATURE_FLAGS, so a fresh database
 * behaves correctly before the seed runs.
 */

const CACHE_TTL_MS = 30 * 1000

let cache: { value: Record<string, boolean>; expiresAt: number } | null = null

export function invalidateFeatureFlags(): void {
  cache = null
}

async function loadFlags(): Promise<Record<string, boolean>> {
  if (cache && cache.expiresAt > Date.now()) return cache.value

  const rows = await db.featureFlag.findMany().catch(() => [])

  const value: Record<string, boolean> = { ...DEFAULT_FEATURE_FLAGS }
  for (const row of rows) {
    value[row.key] = row.enabled
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export async function isEnabled(key: FeatureFlagKey): Promise<boolean> {
  const flags = await loadFlags()
  return flags[key] ?? DEFAULT_FEATURE_FLAGS[key]
}

export async function getFlags(): Promise<Record<FeatureFlagKey, boolean>> {
  const flags = await loadFlags()
  const out = {} as Record<FeatureFlagKey, boolean>
  for (const key of Object.keys(DEFAULT_FEATURE_FLAGS) as FeatureFlagKey[]) {
    out[key] = flags[key] ?? DEFAULT_FEATURE_FLAGS[key]
  }
  return out
}

export async function setFlag(key: FeatureFlagKey, enabled: boolean): Promise<void> {
  await db.featureFlag.upsert({
    where: { key },
    create: { key, enabled },
    update: { enabled },
  })
  invalidateFeatureFlags()
}
