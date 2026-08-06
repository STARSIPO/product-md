import { PrismaClient } from '@prisma/client'
import { normalize, slugify } from '@/lib/normalize'

/**
 * Minimal fixtures for integration tests.
 *
 * Deliberately thin: each factory creates only what a foreign key demands, so a test
 * failure points at the rule under test rather than at fixture noise.
 */

export const prisma = new PrismaClient()

let counter = 0
function uid(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`
}

export async function resetDatabase(): Promise<void> {
  // Children before parents — SQLite enforces foreign keys.
  await prisma.dealEvent.deleteMany()
  await prisma.review.deleteMany()
  await prisma.deal.deleteMany()
  await prisma.offer.deleteMany()
  await prisma.requestAttributeValue.deleteMany()
  await prisma.requestAttachment.deleteMany()
  await prisma.purchaseRequest.deleteMany()
  await prisma.priceTier.deleteMany()
  await prisma.productAttributeValue.deleteMany()
  await prisma.productPhoto.deleteMany()
  await prisma.product.deleteMany()
  await prisma.ledgerEntry.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.companyMember.deleteMany()
  await prisma.verificationBadge.deleteMany()
  await prisma.company.deleteMany()
  await prisma.session.deleteMany()
  await prisma.user.deleteMany()
  await prisma.categorySynonym.deleteMany()
  await prisma.categoryTranslation.deleteMany()
  await prisma.categoryAttributeOptionTranslation.deleteMany()
  await prisma.categoryAttributeOption.deleteMany()
  await prisma.categoryAttributeTranslation.deleteMany()
  await prisma.categoryAttribute.deleteMany()
  await prisma.category.deleteMany()
  await prisma.featureFlag.deleteMany()
  await prisma.tariff.deleteMany()
}

export async function createUser(overrides: { name?: string; email?: string } = {}) {
  const id = uid('user')
  return prisma.user.create({
    data: {
      name: overrides.name ?? `User ${id}`,
      email: overrides.email ?? `${id}@example.test`,
      emailVerifiedAt: new Date(),
      acceptedTermsAt: new Date(),
      onboardedAt: new Date(),
    },
  })
}

export async function createCompany(
  options: { isBuyer?: boolean; isSeller?: boolean; name?: string; balanceBani?: number } = {},
) {
  const user = await createUser()
  const name = options.name ?? uid('Company')

  const company = await prisma.company.create({
    data: {
      slug: slugify(`${name}-${Math.random().toString(36).slice(2, 6)}`),
      legalName: `SRL ${name}`,
      displayName: name,
      isBuyer: options.isBuyer ?? false,
      isSeller: options.isSeller ?? false,
      balanceBani: options.balanceBani ?? 0,
      status: 'ACTIVE',
      members: { create: { userId: user.id, role: 'OWNER' } },
    },
  })

  return { company, user }
}

export async function createCategory(name = 'Мясо') {
  const slug = slugify(`${name}-${Math.random().toString(36).slice(2, 6)}`)

  return prisma.category.create({
    data: {
      slug,
      path: slug,
      level: 0,
      defaultUnit: 'KG',
      translations: {
        create: [
          { locale: 'ru', name, slug },
          { locale: 'ro', name: `${name} ro`, slug: `${slug}-ro` },
        ],
      },
    },
  })
}

export async function createRequest(
  companyId: string,
  categoryId: string,
  overrides: Partial<{
    status: string
    visibility: string
    verifiedOnly: boolean
    offersDeadlineAt: Date | null
    title: string
  }> = {},
) {
  const title = overrides.title ?? 'Требуется 20 кг охлаждённой говядины'

  return prisma.purchaseRequest.create({
    data: {
      companyId,
      categoryId,
      slug: slugify(`${title}-${Math.random().toString(36).slice(2, 6)}`),
      title,
      quantity: 20,
      unit: 'KG',
      status: overrides.status ?? 'ACTIVE',
      visibility: overrides.visibility ?? 'PUBLIC',
      verifiedOnly: overrides.verifiedOnly ?? false,
      offersDeadlineAt: overrides.offersDeadlineAt ?? null,
      searchText: normalize(title),
    },
  })
}

export async function createProduct(
  companyId: string,
  categoryId: string,
  overrides: Partial<{ priceBani: number; title: string; status: string; minOrderQty: number }> = {},
) {
  const title = overrides.title ?? 'Говядина охлаждённая'

  return prisma.product.create({
    data: {
      companyId,
      categoryId,
      slug: slugify(`${title}-${Math.random().toString(36).slice(2, 6)}`),
      title,
      priceBani: overrides.priceBani ?? 9500,
      unit: 'KG',
      minOrderQty: overrides.minOrderQty ?? 1,
      status: overrides.status ?? 'ACTIVE',
      publishedAt: new Date(),
      searchText: normalize(title),
    },
  })
}
