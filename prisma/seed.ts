/**
 * Database seed for Product.md.
 *
 * Runs as `npm run db:seed`, and as the second half of `npm run db:reset`. It is
 * idempotent by construction: every table is emptied in foreign-key order before a
 * single row is written, so running it twice produces exactly the same database as
 * running it once. That matters more than it sounds — a demo dataset that can only
 * be applied to a virgin schema is a dataset nobody re-runs.
 *
 * The client is created locally rather than imported from `src/server/db`: that
 * module starts with `import 'server-only'` and throws the moment it is loaded
 * outside a Next.js server context, which is exactly what a plain tsx script is.
 *
 * The demo module still reaches into `src/server/auth/password` for the real hashing
 * routine, and that file carries the same `server-only` marker. Rather than stub it,
 * `npm run db:seed` passes `--conditions=react-server`, which is the condition the
 * package itself publishes for exactly this case — it then resolves to a no-op. The
 * Next build keeps the guard intact because it never sets that flag for client code.
 */

/* eslint-disable no-console -- this is a CLI script; its report *is* the output */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { DISTRICTS, LOCALITIES } from './seed/geo'
import { seedCategories } from './seed/categories'
import { seedDemo, TEST_ACCOUNTS, TEST_ACCOUNT_PASSWORD } from './seed/demo'

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Minimal .env reader. The Prisma CLI loads .env for us, but `tsx prisma/seed.ts`
 * is not the CLI — without this the script would fail on a missing DATABASE_URL
 * with a message that explains nothing.
 */
function loadEnvFile(): void {
  const file = join(ROOT, '.env')
  if (!existsSync(file)) return

  for (const rawLine of readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile()

if (!process.env.DATABASE_URL) {
  throw new Error('seed: DATABASE_URL is not set — copy .env.example to .env first')
}

const db = new PrismaClient({ log: ['error'] })

// ---------------------------------------------------------------------------
// Wipe
// ---------------------------------------------------------------------------

/**
 * Children before parents. Several relations deliberately have no `onDelete:
 * Cascade` (a Deal must not vanish because a listing was removed), so the order
 * below is load-bearing rather than cosmetic.
 */
async function wipe(): Promise<void> {
  await db.messageAttachment.deleteMany()
  await db.message.deleteMany()
  await db.conversationParticipant.deleteMany()
  await db.conversation.deleteMany()

  await db.reviewReply.deleteMany()
  await db.review.deleteMany()

  await db.dealEvent.deleteMany()
  await db.deal.deleteMany()
  await db.offer.deleteMany()

  await db.requestAttachment.deleteMany()
  await db.requestAttributeValue.deleteMany()
  await db.purchaseRequest.deleteMany()

  await db.productStatDaily.deleteMany()
  await db.productDocument.deleteMany()
  await db.productAttributeValue.deleteMany()
  await db.priceTier.deleteMany()
  await db.productPhoto.deleteMany()
  await db.promotion.deleteMany()
  await db.favorite.deleteMany()
  await db.product.deleteMany()

  await db.documentHistory.deleteMany()
  await db.document.deleteMany()

  await db.categoryAttributeOptionTranslation.deleteMany()
  await db.categoryAttributeOption.deleteMany()
  await db.categoryAttributeTranslation.deleteMany()
  await db.categoryAttribute.deleteMany()
  await db.categorySynonym.deleteMany()
  await db.categoryTranslation.deleteMany()
  // Category is self-referential: delete the deepest level first, otherwise a
  // parent can be removed while one of its children still points at it.
  const deepest = await db.category.aggregate({ _max: { level: true } })
  for (let level = deepest._max.level ?? 0; level >= 0; level -= 1) {
    await db.category.deleteMany({ where: { level } })
  }

  await db.verificationBadge.deleteMany()
  await db.companyPhoto.deleteMany()
  await db.companyMember.deleteMany()
  await db.ledgerEntry.deleteMany()
  await db.payment.deleteMany()
  await db.company.deleteMany()

  await db.locality.deleteMany()
  await db.district.deleteMany()

  await db.savedSearch.deleteMany()
  await db.notification.deleteMany()
  await db.notificationPreference.deleteMany()
  await db.notificationDelivery.deleteMany()

  await db.moderationTask.deleteMany()
  await db.complaint.deleteMany()
  await db.auditLog.deleteMany()

  await db.session.deleteMany()
  await db.verificationToken.deleteMany()
  await db.loginAttempt.deleteMany()
  await db.rateLimitHit.deleteMany()
  await db.user.deleteMany()

  await db.webhookEvent.deleteMany()
  await db.tariff.deleteMany()
  await db.featureFlag.deleteMany()
  await db.setting.deleteMany()
  await db.searchQueryLog.deleteMany()
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

async function seedGeo(): Promise<{ districts: number; localities: number }> {
  await db.district.createMany({
    data: DISTRICTS.map((district) => ({
      id: district.id,
      nameRu: district.nameRu,
      nameRo: district.nameRo,
      kind: district.kind,
      latitude: district.latitude,
      longitude: district.longitude,
    })),
  })

  await db.locality.createMany({
    data: LOCALITIES.map((locality) => ({
      id: locality.id,
      districtId: locality.districtId,
      nameRu: locality.nameRu,
      nameRo: locality.nameRo,
      kind: locality.kind,
      latitude: locality.latitude,
      longitude: locality.longitude,
      isMajor: locality.isMajor,
    })),
  })

  return { districts: DISTRICTS.length, localities: LOCALITIES.length }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printSummary(rows: Record<string, number>): void {
  const label = (key: string): string =>
    key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())

  const width = Math.max(...Object.keys(rows).map((key) => label(key).length))
  for (const [key, count] of Object.entries(rows)) {
    console.log(`  ${label(key).padEnd(width)}  ${String(count).padStart(6)}`)
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now()

  console.log('Product.md — seeding database')
  console.log(`  provider: ${process.env.DATABASE_PROVIDER ?? 'sqlite'}`)
  console.log('')

  console.log('Wiping existing data…')
  await wipe()

  console.log('Seeding geography…')
  const geo = await seedGeo()

  console.log('Seeding categories…')
  const categories = await seedCategories(db)

  console.log('Seeding demo dataset…')
  const demo = await seedDemo(db)

  console.log('')
  console.log('Seeded:')
  printSummary({ ...geo, ...categories, ...demo })

  console.log('')
  console.log('Test accounts (password for all four):')
  console.log(`  ${TEST_ACCOUNT_PASSWORD}`)
  console.log('')
  const emailWidth = Math.max(...TEST_ACCOUNTS.map((account) => account.email.length))
  const roleWidth = Math.max(...TEST_ACCOUNTS.map((account) => account.role.length))
  for (const account of TEST_ACCOUNTS) {
    console.log(
      `  ${account.email.padEnd(emailWidth)}  ${account.role.padEnd(roleWidth)}  ${account.note}`,
    )
  }

  console.log('')
  console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`)
}

main()
  .catch((error: unknown) => {
    console.error('')
    console.error('Seed failed:')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
