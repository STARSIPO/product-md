'use client'

import { useState } from 'react'
import { Check, FileCheck2, MapPin, Truck } from 'lucide-react'

import { Alert } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { formatDateShort } from '@/lib/i18n/format'
import { formatMoney, formatQuantity, parseAmountToBani, resolveTierPriceBani, tierDiscountPercent } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { PickedCategory } from '@/components/category/category-picker'
import type { AttributeValue, ResolvedAttribute } from '@/components/category/attribute-fields'
import type { DistrictOption, DocumentOption, WizardValues } from './product-wizard'

/**
 * Step 7 — «Предпросмотр».
 *
 * Rendered from the same numbers the buyer's listing page will use — bani through
 * `formatMoney`, the ladder through `resolveTierPriceBani` — so what the seller
 * approves here is what gets published, not an approximation of it.
 */
export function StepPreview({
  values,
  category,
  attributes,
  attributeValues,
  districts,
  documents,
  company,
}: {
  values: WizardValues
  category: PickedCategory | null
  attributes: ResolvedAttribute[]
  attributeValues: Record<string, AttributeValue>
  districts: DistrictOption[]
  documents: DocumentOption[]
  company: { displayName: string; location: string | null }
}) {
  const { t, fmt, locale } = useI18n()
  const [active, setActive] = useState(0)

  const unitLabel = t.units[values.unit]
  const priceBani = parseAmountToBani(values.priceBani.trim())
  const deliveryBani = parseAmountToBani(values.deliveryPriceBani.trim())
  const minOrderQty = Number(values.minOrderQty.replace(',', '.'))
  const availableQty = Number(values.availableQty.replace(',', '.'))

  const tiers = values.priceTiers
    .map((tier) => ({
      minQty: Number(tier.minQty.replace(',', '.')),
      maxQty: tier.maxQty.trim() === '' ? null : Number(tier.maxQty.replace(',', '.')),
      priceBani: parseAmountToBani(tier.priceBani.trim()),
    }))
    .filter(
      (tier): tier is { minQty: number; maxQty: number | null; priceBani: number } =>
        Number.isFinite(tier.minQty) && tier.priceBani !== null,
    )

  const effectiveBani =
    priceBani !== null && Number.isFinite(minOrderQty) && minOrderQty > 0
      ? resolveTierPriceBani(minOrderQty, priceBani, tiers)
      : priceBani

  const cover = values.photos[active] ?? values.photos[0]

  const specs: { label: string; value: string }[] = []

  for (const attribute of attributes) {
    const value = attributeValues[attribute.id]
    if (!value) continue
    const rendered = renderAttribute(attribute, value, t.common.yes, t.common.no, locale)
    if (rendered) {
      specs.push({
        label: attribute.unit ? `${attribute.label}, ${attribute.unit}` : attribute.label,
        value: rendered,
      })
    }
  }

  const advanced: { label: string; value: string }[] = [
    { label: t.product.origin, value: values.originCountry },
    { label: t.product.productionPlace, value: values.productionPlace },
    { label: t.product.manufacturer, value: values.manufacturer },
    { label: t.product.batchNumber, value: values.batchNumber },
    {
      label: t.product.producedAt,
      value: values.producedAt ? formatDateShort(values.producedAt, locale) : '',
    },
    {
      label: t.product.bestBefore,
      value: values.bestBefore ? formatDateShort(values.bestBefore, locale) : '',
    },
    { label: t.product.storageConditions, value: values.storageConditions },
    { label: t.product.storageTemp, value: values.storageTempC },
    { label: t.product.allergens, value: values.allergens },
    { label: t.product.composition, value: values.composition },
    { label: t.product.packaging, value: values.packaging },
    {
      label: t.product.supplyRegularity,
      value: isRegularity(values.supplyRegularity) ? t.regularity[values.supplyRegularity] : '',
    },
  ].filter((row) => row.value.trim() !== '')

  const regionNames = districts
    .filter((district) => values.deliveryRegions.includes(district.id))
    .map((district) => district.name)

  const attachedDocuments = documents.filter((document) =>
    values.documentIds.includes(document.id),
  )
  const docTypes = t.verification.docTypes as Record<string, string | undefined>

  return (
    <div className="space-y-5">
      <Alert variant="info" title={t.productForm.previewTitle}>
        {t.productForm.previewHint}
      </Alert>

      <article className="overflow-hidden rounded-lg border border-border bg-card">
        {/* --- gallery --- */}
        {cover ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover.url}
              alt={values.title}
              className="aspect-[4/3] w-full bg-muted object-cover"
            />
            {values.photos.length > 1 ? (
              <ul className="flex gap-2 overflow-x-auto p-3">
                {values.photos.map((photo, index) => (
                  <li key={photo.key}>
                    <button
                      type="button"
                      onClick={() => setActive(index)}
                      aria-label={fmt(t.product.photoOf, {
                        current: index + 1,
                        total: values.photos.length,
                      })}
                      className={cn(
                        'block h-14 w-14 overflow-hidden rounded border-2',
                        index === active ? 'border-primary' : 'border-transparent',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt="" className="h-full w-full object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="grid aspect-[4/3] w-full place-items-center bg-muted text-sm text-muted-foreground">
            {t.product.noPhoto}
          </div>
        )}

        <div className="space-y-5 p-4 sm:p-5">
          {/* --- headline --- */}
          <div>
            {category ? (
              <p className="text-caption text-muted-foreground">{category.trail}</p>
            ) : null}
            <h2 className="mt-1 text-h3 break-words">{values.title || t.productForm.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.availability[values.availability]}
            </p>
          </div>

          {/* --- price --- */}
          <div className="rounded-md bg-muted/60 p-3.5">
            <p className="text-h3">
              {priceBani === null
                ? '—'
                : fmt(t.product.pricePerUnit, {
                    price: formatMoney(priceBani, locale),
                    unit: unitLabel,
                  })}
            </p>
            {effectiveBani !== null && priceBani !== null && effectiveBani !== priceBani ? (
              <p className="mt-1 text-sm text-success">
                {`${formatMoney(effectiveBani, locale)} / ${unitLabel} · ${fmt(
                  t.product.tierDiscount,
                  { percent: tierDiscountPercent(priceBani, effectiveBani) },
                )}`}
              </p>
            ) : null}

            <dl className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t.product.minOrder}:</dt>
                <dd className="font-medium">
                  {Number.isFinite(minOrderQty) && minOrderQty > 0
                    ? formatQuantity(minOrderQty, unitLabel, locale)
                    : formatQuantity(1, unitLabel, locale)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t.product.available}:</dt>
                <dd className="font-medium">
                  {Number.isFinite(availableQty) && availableQty > 0
                    ? formatQuantity(availableQty, unitLabel, locale)
                    : t.product.availableUnlimited}
                </dd>
              </div>
            </dl>
          </div>

          {/* --- wholesale ladder --- */}
          {tiers.length > 0 && priceBani !== null ? (
            <section>
              <h3 className="text-sm font-semibold">{t.product.priceTiers}</h3>
              <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                {tiers.map((tier, index) => {
                  const discount = tierDiscountPercent(priceBani, tier.priceBani)
                  return (
                    <li
                      key={index}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                    >
                      <span>
                        {tier.maxQty === null
                          ? fmt(t.product.tierFrom, {
                              min: formatQuantity(tier.minQty, unitLabel, locale),
                            })
                          : fmt(t.product.tierRange, {
                              min: formatQuantity(tier.minQty, unitLabel, locale),
                              max: formatQuantity(tier.maxQty, unitLabel, locale),
                            })}
                      </span>
                      <span className="flex items-center gap-2 font-medium">
                        {formatMoney(tier.priceBani, locale)}
                        {discount > 0 ? (
                          <span className="rounded-full bg-success-soft px-2 py-0.5 text-caption font-semibold text-success">
                            {fmt(t.product.tierDiscount, { percent: discount })}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {/* --- description --- */}
          <section>
            <h3 className="text-sm font-semibold">{t.product.description}</h3>
            <p className="mt-1.5 whitespace-pre-line text-sm text-foreground/90">
              {values.description.trim() || t.productForm.previewNoDescription}
            </p>
          </section>

          {/* --- characteristics --- */}
          {specs.length > 0 || advanced.length > 0 ? (
            <section>
              <h3 className="text-sm font-semibold">{t.product.attributes}</h3>
              <dl className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
                {[...specs, ...advanced].map((row) => (
                  <div key={row.label} className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 py-2">
                    <dt className="min-w-[40%] text-muted-foreground">{row.label}</dt>
                    <dd className="min-w-0 flex-1 break-words">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {/* --- delivery --- */}
          <section>
            <h3 className="text-sm font-semibold">{t.product.delivery}</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {values.deliveryTerms.trim() ? (
                <li className="flex gap-2">
                  <Truck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="whitespace-pre-line">{values.deliveryTerms.trim()}</span>
                </li>
              ) : null}
              <li className="flex gap-2">
                <Truck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  {`${t.product.deliveryPrice}: ${
                    deliveryBani === null
                      ? t.product.deliveryNegotiable
                      : deliveryBani === 0
                        ? t.product.deliveryFree
                        : formatMoney(deliveryBani, locale)
                  }`}
                </span>
              </li>
              {values.pickupAvailable ? (
                <li className="flex gap-2">
                  <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{t.product.pickup}</span>
                </li>
              ) : null}
              {regionNames.length > 0 ? (
                <li className="flex gap-2">
                  <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{`${t.product.deliveryRegions}: ${regionNames.join(', ')}`}</span>
                </li>
              ) : null}
            </ul>
          </section>

          {/* --- documents --- */}
          {attachedDocuments.length > 0 ? (
            <section>
              <h3 className="text-sm font-semibold">{t.product.documents}</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {attachedDocuments.map((document) => (
                  <li key={document.id} className="flex gap-2">
                    <FileCheck2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{docTypes[document.type] ?? document.type}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* --- supplier --- */}
          <section className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{t.product.supplier}</h3>
            <p className="mt-1 text-sm">{company.displayName}</p>
            {company.location ? (
              <p className="text-caption text-muted-foreground">{company.location}</p>
            ) : null}
          </section>
        </div>
      </article>
    </div>
  )
}

const REGULARITY_VALUES: readonly string[] = [
  'ONE_TIME',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'SEASONAL',
  'CONSTANT',
]

function isRegularity(
  value: string,
): value is 'ONE_TIME' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'SEASONAL' | 'CONSTANT' {
  return REGULARITY_VALUES.includes(value)
}

function renderAttribute(
  attribute: ResolvedAttribute,
  value: AttributeValue,
  yes: string,
  no: string,
  locale: 'ru' | 'ro',
): string {
  if (attribute.type === 'BOOL') return value.valueBool ? yes : no

  if (attribute.type === 'SELECT' || attribute.type === 'MULTISELECT') {
    const option = attribute.options.find((candidate) => candidate.id === value.optionId)
    return option?.label ?? ''
  }

  if (attribute.type === 'NUMBER') {
    return value.valueNumber === undefined ? '' : String(value.valueNumber)
  }

  if (attribute.type === 'DATE') {
    return value.valueText ? formatDateShort(value.valueText, locale) : ''
  }

  return value.valueText ?? ''
}
