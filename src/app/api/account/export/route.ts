import { NextResponse } from 'next/server'
import { db } from '@/server/db'
import { getCurrentUser } from '@/server/auth/session'
import { decodeStringArray } from '@/lib/json'
import { chisinauDayKey } from '@/lib/utils'

/**
 * "Download a copy of my data".
 *
 * Scoped to the caller and nothing else: every query below is filtered by the user id
 * resolved from the session, or by the company that session belongs to. There is no
 * id parameter to tamper with, because the route accepts none.
 *
 * Storage keys and signed URLs are deliberately absent. A document's metadata is the
 * user's data; the key is a capability, and an export lands in mailboxes, chat threads
 * and backup folders — none of which should carry one.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const account = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      locale: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      acceptedTermsAt: true,
      onboardedAt: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })

  if (!account) {
    return NextResponse.json({ error: 'notFound' }, { status: 404 })
  }

  const companyId = user.companyId

  const [company, products, requests, offers, deals, documents, ledger, notifications] =
    await Promise.all([
      companyId
        ? db.company.findUnique({
            where: { id: companyId },
            select: {
              id: true,
              slug: true,
              legalName: true,
              displayName: true,
              idno: true,
              orgType: true,
              description: true,
              phone: true,
              email: true,
              website: true,
              contactPerson: true,
              address: true,
              workingHours: true,
              paymentMethods: true,
              languages: true,
              deliveryZones: true,
              deliveryTerms: true,
              minOrderBani: true,
              pickupAvailable: true,
              isBuyer: true,
              isSeller: true,
              balanceBani: true,
              trialEndsAt: true,
              status: true,
              createdAt: true,
              district: { select: { id: true, nameRu: true, nameRo: true } },
              locality: { select: { id: true, nameRu: true, nameRo: true } },
            },
          })
        : null,
      companyId
        ? db.product.findMany({
            where: { companyId, deletedAt: null },
            select: {
              id: true,
              slug: true,
              title: true,
              description: true,
              priceBani: true,
              unit: true,
              status: true,
              viewsCount: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      companyId
        ? db.purchaseRequest.findMany({
            where: { companyId, deletedAt: null },
            select: {
              id: true,
              slug: true,
              title: true,
              quantity: true,
              unit: true,
              status: true,
              offersCount: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      companyId
        ? db.offer.findMany({
            where: { sellerCompanyId: companyId },
            select: {
              id: true,
              priceBani: true,
              quantity: true,
              unit: true,
              totalBani: true,
              status: true,
              createdAt: true,
              request: { select: { title: true } },
            },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      companyId
        ? db.deal.findMany({
            where: { OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }] },
            select: {
              id: true,
              number: true,
              title: true,
              quantity: true,
              unit: true,
              totalBani: true,
              status: true,
              createdAt: true,
              completedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      companyId
        ? db.document.findMany({
            where: { companyId },
            // No fileKey: an export is a document that travels, and a key is a
            // capability rather than a fact about the user.
            select: {
              id: true,
              type: true,
              number: true,
              fileName: true,
              mimeType: true,
              sizeByte: true,
              status: true,
              isPublic: true,
              issuedAt: true,
              expiresAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      companyId
        ? db.ledgerEntry.findMany({
            where: { companyId },
            select: {
              id: true,
              amountBani: true,
              type: true,
              balanceBeforeBani: true,
              balanceAfterBani: true,
              description: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      db.notification.findMany({
        where: { userId: user.id },
        select: { id: true, type: true, params: true, readAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ])

  const payload = {
    exportedAt: new Date().toISOString(),
    format: 'product.md/account-export@1',
    // Money is bani everywhere in this file, exactly as it is in the database.
    currency: 'MDL',
    amountsIn: 'bani',
    account,
    company: company
      ? {
          ...company,
          paymentMethods: decodeStringArray(company.paymentMethods),
          languages: decodeStringArray(company.languages),
          deliveryZones: decodeStringArray(company.deliveryZones),
        }
      : null,
    products,
    requests,
    offers,
    deals,
    documents,
    ledger,
    notifications,
  }

  const fileName = `product-md-export-${chisinauDayKey()}.json`

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
