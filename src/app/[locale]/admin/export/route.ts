import { NextResponse, type NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { resolveLocale } from '@/lib/i18n'
import { baniToMdl } from '@/lib/money'
import { requireAdmin } from '@/server/auth/guards'
import { db } from '@/server/db'
import { listAudit, recordAudit, requestIp } from '@/server/services/audit'
import { encodeJson } from '@/lib/json'

/**
 * CSV export for every admin list.
 *
 * A route handler rather than a server action: the response *is* the file, so the
 * browser's own download machinery handles it, no JavaScript is involved, and the URL —
 * filters included — can be bookmarked or pasted to a colleague. It lives inside the
 * admin segment so the path speaks for itself; layouts do not apply to route handlers,
 * so `requireAdmin` is repeated here rather than inherited.
 *
 * Two deliberate choices about the file itself:
 *   - a UTF-8 BOM, because Excel on a Russian or Romanian Windows opens a BOM-less UTF-8
 *     CSV as cp1251 and turns every name into mojibake
 *   - `;` as the separator, for the same audience: those Excel locales treat `,` as the
 *     decimal mark and put the whole row into one cell
 *
 * Money is written in MDL with two decimals — the file is read by people, not by us —
 * while everything internal stays integer bani.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Bounded so an export cannot become an accidental denial of service. */
const MAX_ROWS = 5000

const ENTITIES = [
  'users',
  'companies',
  'products',
  'requests',
  'deals',
  'ledger',
  'payments',
  'audit',
] as const

type Entity = (typeof ENTITIES)[number]

function isEntity(value: string | null): value is Entity {
  return value !== null && (ENTITIES as readonly string[]).includes(value)
}

interface Sheet {
  header: readonly string[]
  rows: readonly (readonly (string | number | null | undefined)[])[]
}

/** RFC 4180 quoting: always quote, double any embedded quote. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""'
  return `"${String(value).replace(/"/g, '""')}"`
}

function toCsv(sheet: Sheet): string {
  const lines = [sheet.header.map(cell).join(';')]
  for (const row of sheet.rows) {
    lines.push(row.map(cell).join(';'))
  }
  return `﻿${lines.join('\r\n')}\r\n`
}

function money(bani: number): string {
  return baniToMdl(bani).toFixed(2)
}

function iso(date: Date | null | undefined): string {
  return date ? date.toISOString() : ''
}

function param(request: NextRequest, key: string): string | undefined {
  const value = request.nextUrl.searchParams.get(key)?.trim()
  return value ? value : undefined
}

async function buildSheet(entity: Entity, request: NextRequest): Promise<Sheet> {
  const q = param(request, 'q')
  const status = param(request, 'status')

  switch (entity) {
    case 'users': {
      const role = param(request, 'role')
      const where: Prisma.UserWhereInput = {
        deletedAt: null,
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { email: { contains: q.toLowerCase() } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      }

      const rows = await db.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true,
          companies: { select: { company: { select: { displayName: true } } }, take: 1 },
        },
      })

      return {
        header: [
          'id',
          'name',
          'email',
          'phone',
          'role',
          'status',
          'company',
          'emailVerifiedAt',
          'phoneVerifiedAt',
          'lastLoginAt',
          'createdAt',
        ],
        rows: rows.map((row) => [
          row.id,
          row.name,
          row.email,
          row.phone,
          row.role,
          row.status,
          row.companies[0]?.company.displayName ?? '',
          iso(row.emailVerifiedAt),
          iso(row.phoneVerifiedAt),
          iso(row.lastLoginAt),
          iso(row.createdAt),
        ]),
      }
    }

    case 'companies': {
      const where: Prisma.CompanyWhereInput = {
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { displayName: { contains: q } },
                { legalName: { contains: q } },
                { idno: { contains: q } },
              ],
            }
          : {}),
      }

      const rows = await db.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          id: true,
          displayName: true,
          legalName: true,
          idno: true,
          orgType: true,
          status: true,
          isBuyer: true,
          isSeller: true,
          balanceBani: true,
          trialEndsAt: true,
          ratingAvg: true,
          dealsCompleted: true,
          createdAt: true,
        },
      })

      return {
        header: [
          'id',
          'displayName',
          'legalName',
          'idno',
          'orgType',
          'status',
          'isBuyer',
          'isSeller',
          'balanceMDL',
          'trialEndsAt',
          'ratingAvg',
          'dealsCompleted',
          'createdAt',
        ],
        rows: rows.map((row) => [
          row.id,
          row.displayName,
          row.legalName,
          row.idno,
          row.orgType,
          row.status,
          row.isBuyer ? '1' : '0',
          row.isSeller ? '1' : '0',
          money(row.balanceBani),
          iso(row.trialEndsAt),
          row.ratingAvg.toFixed(2),
          row.dealsCompleted,
          iso(row.createdAt),
        ]),
      }
    }

    case 'products': {
      const where: Prisma.ProductWhereInput = {
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(q ? { title: { contains: q } } : {}),
      }

      const rows = await db.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          priceBani: true,
          unit: true,
          viewsCount: true,
          contactsCount: true,
          publishedAt: true,
          createdAt: true,
          company: { select: { displayName: true } },
          category: { select: { path: true } },
        },
      })

      return {
        header: [
          'id',
          'slug',
          'title',
          'company',
          'category',
          'status',
          'priceMDL',
          'unit',
          'views',
          'contacts',
          'publishedAt',
          'createdAt',
        ],
        rows: rows.map((row) => [
          row.id,
          row.slug,
          row.title,
          row.company.displayName,
          row.category.path,
          row.status,
          money(row.priceBani),
          row.unit,
          row.viewsCount,
          row.contactsCount,
          iso(row.publishedAt),
          iso(row.createdAt),
        ]),
      }
    }

    case 'requests': {
      const where: Prisma.PurchaseRequestWhereInput = {
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(q ? { title: { contains: q } } : {}),
      }

      const rows = await db.purchaseRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          quantity: true,
          unit: true,
          visibility: true,
          offersCount: true,
          offersDeadlineAt: true,
          createdAt: true,
          company: { select: { displayName: true } },
        },
      })

      return {
        header: [
          'id',
          'slug',
          'title',
          'company',
          'status',
          'quantity',
          'unit',
          'visibility',
          'offers',
          'offersDeadlineAt',
          'createdAt',
        ],
        rows: rows.map((row) => [
          row.id,
          row.slug,
          row.title,
          row.company.displayName,
          row.status,
          row.quantity,
          row.unit,
          row.visibility,
          row.offersCount,
          iso(row.offersDeadlineAt),
          iso(row.createdAt),
        ]),
      }
    }

    case 'deals': {
      const where: Prisma.DealWhereInput = {
        ...(status ? { status } : {}),
        ...(q ? { OR: [{ number: { contains: q } }, { title: { contains: q } }] } : {}),
      }

      const rows = await db.deal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          totalBani: true,
          createdAt: true,
          completedAt: true,
          cancelledAt: true,
          buyerCompany: { select: { displayName: true } },
          sellerCompany: { select: { displayName: true } },
        },
      })

      return {
        header: [
          'id',
          'number',
          'title',
          'buyer',
          'seller',
          'status',
          'totalMDL',
          'createdAt',
          'completedAt',
          'cancelledAt',
        ],
        rows: rows.map((row) => [
          row.id,
          row.number,
          row.title,
          row.buyerCompany.displayName,
          row.sellerCompany.displayName,
          row.status,
          money(row.totalBani),
          iso(row.createdAt),
          iso(row.completedAt),
          iso(row.cancelledAt),
        ]),
      }
    }

    case 'ledger': {
      const companyId = param(request, 'company')
      const type = param(request, 'type')

      const rows = await db.ledgerEntry.findMany({
        where: {
          ...(companyId ? { companyId } : {}),
          ...(type ? { type } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          id: true,
          type: true,
          amountBani: true,
          balanceBeforeBani: true,
          balanceAfterBani: true,
          description: true,
          idempotencyKey: true,
          createdAt: true,
          company: { select: { id: true, displayName: true } },
        },
      })

      return {
        header: [
          'id',
          'companyId',
          'company',
          'type',
          'amountMDL',
          'balanceBeforeMDL',
          'balanceAfterMDL',
          'description',
          'idempotencyKey',
          'createdAt',
        ],
        rows: rows.map((row) => [
          row.id,
          row.company.id,
          row.company.displayName,
          row.type,
          money(row.amountBani),
          money(row.balanceBeforeBani),
          money(row.balanceAfterBani),
          row.description,
          row.idempotencyKey,
          iso(row.createdAt),
        ]),
      }
    }

    case 'payments': {
      const rows = await db.payment.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          id: true,
          provider: true,
          providerRef: true,
          amountBani: true,
          status: true,
          failureCode: true,
          createdAt: true,
          completedAt: true,
          company: { select: { displayName: true } },
        },
      })

      return {
        header: [
          'id',
          'company',
          'provider',
          'providerRef',
          'amountMDL',
          'status',
          'failureCode',
          'createdAt',
          'completedAt',
        ],
        rows: rows.map((row) => [
          row.id,
          row.company.displayName,
          row.provider,
          row.providerRef,
          money(row.amountBani),
          row.status,
          row.failureCode,
          iso(row.createdAt),
          iso(row.completedAt),
        ]),
      }
    }

    case 'audit': {
      // `entity` already names the export itself, so the audit filter travels under
      // `entityType` — the two would otherwise collide on the same query string.
      const page = await listAudit({
        actorId: param(request, 'actor'),
        entityType: param(request, 'entityType'),
        pageSize: 100,
        page: 1,
      })

      return {
        header: [
          'id',
          'createdAt',
          'actor',
          'action',
          'entityType',
          'entityId',
          'oldValue',
          'newValue',
          'reason',
          'ip',
        ],
        rows: page.items.map((row) => [
          row.id,
          iso(row.createdAt),
          row.actor?.name ?? '',
          row.action,
          row.entityType,
          row.entityId,
          encodeJson(row.oldValue),
          encodeJson(row.newValue),
          row.reason,
          row.ip,
        ]),
      }
    }
  }
}

export async function GET(request: NextRequest, { params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  // Route handlers do not run the segment's layout, so the guard is repeated rather
  // than inherited. A non-admin gets the same 404 the pages give them.
  const actor = await requireAdmin(locale)

  const entity = request.nextUrl.searchParams.get('entity')
  if (!isEntity(entity)) {
    return NextResponse.json({ error: 'notFound' }, { status: 404 })
  }

  const sheet = await buildSheet(entity, request)
  const stamp = new Date().toISOString().slice(0, 10)

  // An export is not a mutation, but it copies personal data out of the platform, so
  // who took what and when is exactly the kind of question the audit log exists for.
  await recordAudit({
    actorId: actor.id,
    action: 'admin.export.csv',
    entityType: 'EXPORT',
    entityId: entity,
    newValue: {
      rows: sheet.rows.length,
      filters: Object.fromEntries(request.nextUrl.searchParams.entries()),
    },
    ip: requestIp(),
  })

  return new NextResponse(toCsv(sheet), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="product-md-${entity}-${stamp}.csv"`,
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
