import Link from 'next/link'
import { ArrowRight, ClipboardList, Handshake, ShieldCheck, Store } from 'lucide-react'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { db } from '@/server/db'
import { getCategoryTree, getSubtreeIds } from '@/server/services/categories'
import { getCurrentUser } from '@/server/auth/session'
import { PRODUCT_CARD_SELECT, REQUEST_CARD_SELECT } from '@/server/services/search'
import { ProductCard } from '@/components/product/product-card'
import { RequestCard } from '@/components/request/request-card'
import { CompanyCard } from '@/components/company/company-card'
import { PromoStrip, type PromoItem } from '@/components/home/promo-strip'
import { CategoryRail, type CategoryRailItem } from '@/components/home/category-rail'
import { CatalogSearch } from '@/components/search/catalog-search'
import { buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Homepage — a marketplace entry point, not a landing page.
 *
 * The ordering is deliberate: a visitor arrives wanting to find or sell a specific
 * product, so the first screen is search + the full category list + real listings. The
 * promo rail sits above them but renders only when something is actually promoted;
 * pitch and explanation live at the bottom, for the people who scroll that far.
 */

export const revalidate = 120

export default async function HomePage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  const user = await getCurrentUser()

  const [roots, promoted, products, requests, suppliers, stats] = await Promise.all([
    getCategoryTree(),
    // Promotions are optional: this list is usually empty at launch, and the strip
    // simply does not render in that case.
    db.product.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        company: { status: 'ACTIVE' },
        OR: [{ isHomepagePinned: true }, { promotedUntil: { gt: new Date() } }],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        priceBani: true,
        unit: true,
        photos: { select: { key: true, alt: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
        company: { select: { displayName: true } },
      },
      orderBy: [{ promotedUntil: 'desc' }, { publishedAt: 'desc' }],
      take: 4,
    }),
    db.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null, company: { status: 'ACTIVE' } },
      select: PRODUCT_CARD_SELECT,
      orderBy: [{ bumpedAt: 'desc' }, { publishedAt: 'desc' }],
      take: 12,
    }),
    db.purchaseRequest.findMany({
      where: {
        status: { in: ['ACTIVE', 'RECEIVING_OFFERS'] },
        visibility: 'PUBLIC',
        deletedAt: null,
        company: { status: 'ACTIVE' },
      },
      select: REQUEST_CARD_SELECT,
      orderBy: [{ isUrgent: 'desc' }, { createdAt: 'desc' }],
      take: 4,
    }),
    db.company.findMany({
      where: {
        status: 'ACTIVE',
        isSeller: true,
        badges: { some: { type: { in: ['TRUSTED_SUPPLIER', 'DOCUMENTS'] }, status: 'APPROVED' } },
      },
      include: {
        district: true,
        locality: true,
        badges: { where: { status: 'APPROVED' }, select: { type: true } },
        _count: { select: { products: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: [{ ratingAvg: 'desc' }, { dealsCompleted: 'desc' }],
      take: 4,
    }),
    Promise.all([
      db.company.count({ where: { status: 'ACTIVE', isSeller: true } }),
      db.product.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      db.purchaseRequest.count({
        where: { status: { in: ['ACTIVE', 'RECEIVING_OFFERS'] }, visibility: 'PUBLIC' },
      }),
    ]),
  ])

  const [supplierCount, productCount, requestCount] = stats

  // Counts are per subtree, so «Мясо» includes everything filed under chilled beef.
  const grouped = await db.product.groupBy({
    by: ['categoryId'],
    where: { status: 'ACTIVE', deletedAt: null },
    _count: { categoryId: true },
  })
  const countByCategory = new Map(grouped.map((row) => [row.categoryId, row._count.categoryId]))

  const categories: CategoryRailItem[] = await Promise.all(
    roots.map(async (root) => {
      const subtree = await getSubtreeIds(root.id)
      const count = subtree.reduce((sum, id) => sum + (countByCategory.get(id) ?? 0), 0)
      return {
        id: root.id,
        name: root.names[locale],
        slug: root.slugs[locale],
        count,
        icon: root.icon,
      }
    }),
  )

  return (
    <>
      {/* ------------------------------------------------- search + pitch band */}
      {/*
        No bottom rule: this band and the header form one continuous white top zone,
        and the catalogue below it separates itself by sitting on the page background.
      */}
      <section className="bg-card">
        <div className="container pb-8 pt-7 md:pb-9 md:pt-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-h2">{t.home.heroTitle}</h1>
            <p className="text-sm text-muted-foreground">{t.home.heroSubtitle}</p>
          </div>

          <div className="mt-5">
            <CatalogSearch
              categories={categories.map(({ id, name, slug }) => ({ id, name, slug }))}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-caption text-muted-foreground">
            <span className="tnum">
              <strong className="text-sm font-semibold text-foreground">{productCount}</strong>{' '}
              {t.home.statProducts}
            </span>
            <span className="tnum">
              <strong className="text-sm font-semibold text-foreground">{supplierCount}</strong>{' '}
              {t.home.statSuppliers}
            </span>
            <span className="tnum">
              <strong className="text-sm font-semibold text-foreground">{requestCount}</strong>{' '}
              {t.home.statRequests}
            </span>

            <span className="ml-auto flex flex-wrap gap-2">
              <Link
                href={localePath(locale, 'requests', 'new')}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <ClipboardList className="mr-1.5 h-4 w-4" aria-hidden />
                {t.home.ctaRequest}
              </Link>
              {!user?.isSeller ? (
                <Link
                  href={localePath(locale, 'products', 'new')}
                  className={buttonVariants({ size: 'sm' })}
                >
                  {t.home.ctaSupplier}
                </Link>
              ) : null}
            </span>
          </div>
        </div>
      </section>

      {/* ----------------------------------- promotions (only when they exist) */}
      <PromoStrip items={promoted as PromoItem[]} locale={locale} t={t} />

      {/* -------------------------------------------- catalogue rail + listings */}
      <div className="container grid gap-6 py-8 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
        <CategoryRail categories={categories} locale={locale} t={t} />

        <div className="min-w-0 space-y-10">
          <section>
            <SectionHeading
              title={t.home.newProducts}
              href={localePath(locale, 'products')}
              linkLabel={t.common.showAll}
            />
            {products.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
                {products.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    locale={locale}
                    t={t}
                    showFavorite={user !== null}
                    priority={index < 4}
                  />
                ))}
              </div>
            ) : (
              <EmptyRow text={t.home.emptyProducts} />
            )}
          </section>

          <section>
            <SectionHeading
              title={t.home.freshRequests}
              href={localePath(locale, 'requests')}
              linkLabel={t.common.showAll}
            />
            {requests.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 md:gap-4">
                {requests.map((request) => (
                  <RequestCard key={request.id} request={request} locale={locale} t={t} />
                ))}
              </div>
            ) : (
              <EmptyRow text={t.home.emptyRequests} />
            )}
          </section>

          {suppliers.length > 0 ? (
            <section>
              <SectionHeading
                title={t.home.verifiedSuppliers}
                href={localePath(locale, 'suppliers')}
                linkLabel={t.common.showAll}
              />
              <div className="grid gap-3 sm:grid-cols-2 md:gap-4">
                {suppliers.map((company) => (
                  <CompanyCard key={company.id} company={company} locale={locale} t={t} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------ explanation, low down */}
      <section className="bg-card">
        <div className="container py-10">
          <h2 className="text-h2">{t.home.howItWorks}</h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
            <Step
              index={1}
              icon={<ClipboardList className="h-5 w-5" aria-hidden />}
              title={t.home.howBuyerStep1Title}
              text={t.home.howBuyerStep1Text}
            />
            <Step
              index={2}
              icon={<Store className="h-5 w-5" aria-hidden />}
              title={t.home.howBuyerStep2Title}
              text={t.home.howBuyerStep2Text}
            />
            <Step
              index={3}
              icon={<Handshake className="h-5 w-5" aria-hidden />}
              title={t.home.howBuyerStep3Title}
              text={t.home.howBuyerStep3Text}
            />
          </ol>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
            {[
              t.home.safetyPoint1,
              t.home.safetyPoint2,
              t.home.safetyPoint3,
              t.home.safetyPoint4,
            ].map((point) => (
              <p key={point} className="surface-muted flex gap-2.5 rounded-md p-4 text-sm">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                {point}
              </p>
            ))}
          </div>
        </div>
      </section>

      {!user ? (
        <section className="container py-10">
          <div className="flex flex-col items-center gap-5 rounded-lg bg-primary-soft px-6 py-8 text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left">
            <div>
              <h2 className="text-h3">{t.home.ctaTitle}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.home.ctaText}</p>
            </div>
            <Link
              href={localePath(locale, 'register')}
              className={cn(buttonVariants({ size: 'lg' }), 'shrink-0')}
            >
              {t.home.ctaButton}
            </Link>
          </div>
        </section>
      ) : null}
    </>
  )
}

function SectionHeading({
  title,
  href,
  linkLabel,
}: {
  title: string
  href: string
  linkLabel: string
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="text-h3">{title}</h2>
      <Link
        href={href}
        className="shrink-0 rounded-sm text-sm font-medium text-primary transition-colors hover:text-primary-hover"
      >
        {linkLabel}
        <ArrowRight className="ml-1 inline h-4 w-4" aria-hidden />
      </Link>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="surface-muted px-4 py-10 text-center text-sm text-muted-foreground">{text}</p>
  )
}

function Step({
  index,
  icon,
  title,
  text,
}: {
  index: number
  icon: React.ReactNode
  title: string
  text: string
}) {
  return (
    <li className="surface-muted p-5">
      <div className="flex items-center gap-2.5">
        <span className="icon-chip h-10 w-10">{icon}</span>
        <span className="tnum text-caption font-semibold text-muted-foreground">0{index}</span>
      </div>
      <h3 className="mt-3.5 text-base font-medium">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
    </li>
  )
}
