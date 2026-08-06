import 'server-only'
import { PrismaClient } from '@prisma/client'
import { env, isProduction } from '@/env'

/**
 * Prisma client singleton.
 *
 * Next.js hot-reloads modules in development; without the global cache every edit
 * would open a fresh connection pool and eventually exhaust the database's
 * max_connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['error', 'warn'],
    datasources: { db: { url: env.DATABASE_URL } },
  })

if (!isProduction) globalForPrisma.prisma = db

/**
 * Runs `fn` inside a transaction.
 *
 * Wrapped rather than used directly so the isolation level stays in one place: money
 * movements (ledger + balance cache) and offer acceptance must not interleave.
 * SQLite has a single writer and ignores the option, which is why it is set
 * conditionally instead of unconditionally passed.
 */
export function transaction<T>(
  fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (env.DATABASE_PROVIDER === 'postgresql') {
    return db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15_000 })
  }
  return db.$transaction(fn)
}

export type Db = typeof db
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
