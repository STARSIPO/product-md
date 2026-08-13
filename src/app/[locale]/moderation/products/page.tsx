import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, PackageSearch } from 'lucide-react'
import { getDictionary, fmt, resolveLocale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/config'
import { formatDateTime } from '@/lib/i18n/format'
import { formatMoney, formatQuantity } from '@/lib/money'
import { parsePage, buildQuery } from '@/lib/utils'
import { PRODUCT_STATUSES } from '@/lib/constants'
import { requireModerator } from '@/server/auth/guards'
import {
  findTaskFor,
  getProductForReview,
  listModerationProducts,
} from '@/server/services/moderation'
import { listAudit } from '@/server/services/audit'
import { DataTable, TableToolbar, type DataColumn } from '@/components/admin/data-table'
import { DecisionPanel } from '@/components/admin/decision-dialog'
import {
  Badge,
  EmptyState,
  Input,
  Pagination,
  Select,
  StatusBadge,
  buttonVariants,
} from '@/components/ui'

/**
 * Listing review.
 *
 * Without `?id` this is the worklist; with it, the page splits into the submitted
 * listing on the left and the decision panel on the right. Reviewing a food listing
 * against a checklist in another tab is how mistakes happen, so everything the moderator
 * has to judge — composition, allergens, storage, origin, photos — sits next to the
 * verdict form.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  const t = await getDictionary(params.locale)
  return {
    title: `${t.moderation.products} — ${t.moderation.title}`,
    robots: { index: false, follow: false },
  }
}

/** Local keys need the /uploads prefix; seeded absolute URLs are already complete. */
function photoSrc(key: string): string {
  return key.startsWith('http') || key.startsWith('/') ? key : `/uploads/${key}`
}

type ProductRow = Awaited<ReturnType<typeof listModerationProducts>>['items'][number]

export default async function ModerationProductsPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const locale = resolveLocale(params.locale)
  const t = await getDictionary(locale)
  await requireModerator(locale)

  const basePath = localePath(locale, 'moderation', 'products')
  const id = typeof searchParams.id === 'string' ? searchParams.id : undefined
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined
  const q = typeof searchParams.q === 'string' ? searchParams.q : undefined
  const page = parsePage(typeof searchParams.page === 'string' ? searchParams.page : undefined)

  const productStatuses = t.productStatus as Record<string, string | undefined>
  const units = t.units as Record<string, string | undefined>

  // --- single item: content beside the decision panel ------------------------
  if (id) {
    const [product, task, history] = await Promise.all([
      getProductForReview(id),
      findTaskFor('PRODUCT', id),
      listAudit({ entityType: 'PRODUCT', entityId: id, pageSize: 10 }),
    ])

    if (!product) {
      return (
        <EmptyState
          className="surface"
          title={t.states.notFoundTitle}
          description={t.states.notFoundText}
          action={
            <Link href={basePath} className={buttonVariants({ variant: 'outline' })}>
              {t.moderation.backToList}
            </Link>
          }
        />
      )
    }

    const unitLabel = units[product.unit] ?? product.unit

    const facts: { label: string; value: string }[] = [
      {
        label: t.product.price,
        value: fmt(t.product.pricePerUnit, {
          price: formatMoney(product.priceBani, locale),
          unit: unitLabel,
        }),
      },
      {
        label: t.product.minOrder,
        value: formatQuantity(product.minOrderQty, unitLabel, locale),
      },
      { label: t.product.supplier, value: product.company.displayName },
      { label: t.filters.category, value: product.category.path },
      { label: t.common.date, value: formatDateTime(product.updatedAt, locale) },
    ]

    const details: { label: string; value: string | null }[] = [
      { label: t.product.origin, value: product.originCountry },
      { label: t.product.manufacturer, value: product.manufacturer },
      { label: t.product.composition, value: product.composition },
      { label: t.product.allergens, value: product.allergens },
      { label: t.product.storageConditions, value: product.storageConditions },
      { label: t.product.packaging, value: product.packaging },
    ]

    return (
      <div className="space-y-4">
        <Link
          href={basePath}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded text-sm text-primary hover:text-primary-hover"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t.moderation.backToList}
        </Link>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ------------------------------------------- submitted material */}
          <article className="surface min-w-0 space-y-4 p-5">
            <header>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={product.status}
                  label={productStatuses[product.status] ?? product.status}
                />
                {task?.assignedTo ? (
                  <Badge variant="primary" size="sm">
                    {fmt(t.moderation.assignedTo, { name: task.assignedTo.name })}
                  </Badge>
                ) : null}
              </div>
              <h2 className="mt-2 text-h2">{product.title}</h2>
            </header>

            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {facts.map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="text-caption text-muted-foreground">{fact.label}</dt>
                  <dd className="text-sm font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>

            {product.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed">{product.description}</p>
            ) : null}

            {details.some((row) => row.value) ? (
              <dl className="grid gap-x-4 gap-y-2 pt-1 sm:grid-cols-2">
                {details
                  .filter((row) => row.value)
                  .map((row) => (
                    <div key={row.label} className="min-w-0">
                      <dt className="text-caption text-muted-foreground">{row.label}</dt>
                      <dd className="text-sm">{row.value}</dd>
                    </div>
                  ))}
              </dl>
            ) : null}

            {product.photos.length > 0 ? (
              <ul className="flex flex-wrap gap-2 pt-1">
                {product.photos.map((photo) => (
                  <li key={photo.key}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoSrc(photo.key)}
                      alt={photo.alt ?? product.title}
                      loading="lazy"
                      className="h-28 w-28 rounded-md border border-border object-cover"
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            {product.moderatorComment ? (
              <p className="surface-muted rounded-md p-3.5 text-sm">
                <span className="block text-caption text-muted-foreground">
                  {t.moderation.comment}
                </span>
                {product.moderatorComment}
              </p>
            ) : null}
          </article>

          {/* ------------------------------------------------ decision panel */}
          <div className="space-y-4">
            <DecisionPanel kind="product" entityId={product.id} />

            <section className="surface p-5">
              <h2 className="text-h3">{t.moderation.decisionLog}</h2>
              <ol className="mt-2 space-y-2">
                {history.items.length === 0 ? (
                  <li className="text-sm text-muted-foreground">{t.admin.auditEmpty}</li>
                ) : (
                  history.items.map((entry) => (
                    <li key={entry.id} className="text-sm">
                      <span className="font-mono text-caption text-primary">{entry.action}</span>
                      <span className="ml-2 text-caption text-muted-foreground">
                        {formatDateTime(entry.createdAt, locale)}
                        {entry.actor ? ` · ${entry.actor.name}` : ''}
                      </span>
                      {entry.reason ? (
                        <p className="text-muted-foreground">{entry.reason}</p>
                      ) : null}
                    </li>
                  ))
                )}
              </ol>
            </section>
          </div>
        </div>
      </div>
    )
  }

  // --- worklist --------------------------------------------------------------
  const result = await listModerationProducts({ status, q, page })

  const columns: DataColumn<ProductRow>[] = [
    {
      key: 'title',
      header: t.moderation.item,
      primary: true,
      cell: (row) => (
        <Link
          href={`${basePath}?id=${encodeURIComponent(row.id)}`}
          className="rounded font-medium text-primary hover:text-primary-hover"
        >
          {row.title}
        </Link>
      ),
    },
    {
      key: 'company',
      header: t.product.supplier,
      cell: (row) => <span className="text-sm">{row.company.displayName}</span>,
    },
    {
      key: 'price',
      header: t.product.price,
      align: 'right',
      cell: (row) => <span className="tnum text-sm">{formatMoney(row.priceBani, locale)}</span>,
    },
    {
      key: 'status',
      header: t.common.status,
      cell: (row) => (
        <StatusBadge status={row.status} label={productStatuses[row.status] ?? row.status} />
      ),
    },
    {
      key: 'updated',
      header: t.common.date,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(row.updatedAt, locale)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t.common.actions,
      align: 'right',
      cell: (row) => (
        <Link
          href={`${basePath}?id=${encodeURIComponent(row.id)}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          {t.moderation.review}
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <TableToolbar
        action={basePath}
        label={t.common.filters}
        submitLabel={t.filters.apply}
        resetHref={basePath}
        resetLabel={t.filters.reset}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.search}</span>
          <Input name="q" defaultValue={q ?? ''} placeholder={t.product.single} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{t.common.status}</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">{t.admin.filterAll}</option>
            {PRODUCT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {productStatuses[value] ?? value}
              </option>
            ))}
          </Select>
        </label>
      </TableToolbar>

      <div>
        <p className="mb-3 tnum text-sm text-muted-foreground">
          {fmt(t.admin.totalRows, { count: result.total })}
        </p>

        {result.items.length === 0 ? (
          <EmptyState
            className="surface"
            icon={<PackageSearch aria-hidden />}
            title={t.moderation.empty}
            description={t.moderation.emptyText}
          />
        ) : (
          <>
            <DataTable
              rows={result.items}
              columns={columns}
              rowKey={(row) => row.id}
              empty={t.moderation.empty}
              caption={t.moderation.products}
            />
            <Pagination
              className="mt-6"
              page={result.page}
              pageCount={result.pageCount}
              buildHref={(target) =>
                `${basePath}${buildQuery({ q, status, page: target > 1 ? target : undefined })}`
              }
              labels={{
                previous: t.a11y.previousPage,
                next: t.a11y.nextPage,
                pagination: t.a11y.pagination,
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
