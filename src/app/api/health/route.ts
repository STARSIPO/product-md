import { NextResponse } from 'next/server'
import { db } from '@/server/db'
import { env } from '@/env'

export const dynamic = 'force-dynamic'

/**
 * Liveness + readiness probe for the container orchestrator and uptime monitoring.
 *
 * Reports which adapters are active so an operator can tell at a glance that a
 * deployment is still running the mock payment or console mail driver. It deliberately
 * exposes driver NAMES only — never endpoints, keys or connection strings.
 */
export async function GET() {
  const startedAt = Date.now()

  let database: 'up' | 'down' = 'down'
  let databaseError: string | null = null

  try {
    await db.$queryRaw`SELECT 1`
    database = 'up'
  } catch (error) {
    databaseError = error instanceof Error ? error.message : 'unknown error'
  }

  const healthy = database === 'up'

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - startedAt,
      checks: {
        database: { status: database, provider: env.DATABASE_PROVIDER, error: databaseError },
      },
      adapters: {
        storage: env.STORAGE_DRIVER,
        mail: env.MAIL_DRIVER,
        sms: env.SMS_DRIVER,
        payments: env.PAYMENT_DRIVER,
      },
      environment: env.NODE_ENV,
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
