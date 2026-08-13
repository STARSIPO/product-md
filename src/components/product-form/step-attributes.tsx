'use client'

import { ChevronDown } from 'lucide-react'

import { Field, Input, Select, Textarea } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { SUPPLY_REGULARITY } from '@/lib/constants'
import {
  AttributeFields,
  type AttributeValue,
  type ResolvedAttribute,
} from '@/components/category/attribute-fields'
import { translate } from '@/app/[locale]/login/login-form'
import type { StepProps } from './product-wizard'

/**
 * Step 4 — «Характеристики».
 *
 * The top half is generated from the chosen category, so the form for chilled beef is
 * genuinely not the form for cardboard packaging and no code changes when an admin adds
 * an attribute.
 *
 * The bottom half is the long tail — batch number, allergens, storage temperature.
 * Every one of them matters to somebody and none of them matter to most sellers, so
 * they live behind a disclosure rather than in front of the eighty percent who will
 * skip them.
 */
export function StepAttributes({
  form,
  attributes,
  attributesLoading,
  attributeValues,
  onAttributeChange,
}: StepProps & {
  attributes: ResolvedAttribute[]
  attributesLoading: boolean
  attributeValues: Record<string, AttributeValue>
  onAttributeChange: (attributeId: string, value: AttributeValue | undefined) => void
}) {
  const { t } = useI18n()
  const { errors } = form.formState

  return (
    <div className="space-y-6">
      {!attributesLoading && attributes.length === 0 ? (
        <p className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          {t.productForm.attributesEmpty}
        </p>
      ) : (
        <AttributeFields
          attributes={attributes}
          loading={attributesLoading}
          values={attributeValues}
          onChange={onAttributeChange}
        />
      )}

      <details className="surface-muted group rounded-md">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-sm font-medium marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <span className="min-w-0">
            <span className="block">{t.productForm.advanced}</span>
            <span className="mt-0.5 block text-caption font-normal text-muted-foreground">
              {t.productForm.advancedHint}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="space-y-4 border-t border-border p-3.5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.product.origin}
              htmlFor="product-origin"
              error={translate(t, errors.originCountry?.message)}
            >
              <Input
                id="product-origin"
                autoComplete="country-name"
                placeholder={t.productForm.originCountryPlaceholder}
                invalid={Boolean(errors.originCountry)}
                {...form.register('originCountry')}
              />
            </Field>

            <Field
              label={t.product.productionPlace}
              htmlFor="product-production-place"
              error={translate(t, errors.productionPlace?.message)}
            >
              <Input
                id="product-production-place"
                placeholder={t.productForm.productionPlacePlaceholder}
                invalid={Boolean(errors.productionPlace)}
                {...form.register('productionPlace')}
              />
            </Field>

            <Field
              label={t.product.manufacturer}
              htmlFor="product-manufacturer"
              error={translate(t, errors.manufacturer?.message)}
            >
              <Input
                id="product-manufacturer"
                placeholder={t.productForm.manufacturerPlaceholder}
                invalid={Boolean(errors.manufacturer)}
                {...form.register('manufacturer')}
              />
            </Field>

            <Field
              label={t.product.batchNumber}
              htmlFor="product-batch"
              error={translate(t, errors.batchNumber?.message)}
            >
              <Input
                id="product-batch"
                autoComplete="off"
                placeholder={t.productForm.batchNumberPlaceholder}
                invalid={Boolean(errors.batchNumber)}
                {...form.register('batchNumber')}
              />
            </Field>

            <Field
              label={t.product.producedAt}
              htmlFor="product-produced-at"
              error={translate(t, errors.producedAt?.message)}
            >
              <Input
                id="product-produced-at"
                type="date"
                invalid={Boolean(errors.producedAt)}
                {...form.register('producedAt')}
              />
            </Field>

            <Field
              label={t.product.bestBefore}
              htmlFor="product-best-before"
              error={translate(t, errors.bestBefore?.message)}
            >
              <Input
                id="product-best-before"
                type="date"
                invalid={Boolean(errors.bestBefore)}
                {...form.register('bestBefore')}
              />
            </Field>

            <Field
              label={t.product.storageTemp}
              htmlFor="product-storage-temp"
              error={translate(t, errors.storageTempC?.message)}
            >
              <Input
                id="product-storage-temp"
                placeholder={t.productForm.storageTempPlaceholder}
                invalid={Boolean(errors.storageTempC)}
                {...form.register('storageTempC')}
              />
            </Field>

            <Field
              label={t.product.supplyRegularity}
              htmlFor="product-supply-regularity"
              error={translate(t, errors.supplyRegularity?.message)}
            >
              <Select
                id="product-supply-regularity"
                invalid={Boolean(errors.supplyRegularity)}
                {...form.register('supplyRegularity')}
              >
                <option value="">{t.validation.selectOption}</option>
                {SUPPLY_REGULARITY.map((code) => (
                  <option key={code} value={code}>
                    {t.regularity[code]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label={t.product.storageConditions}
            htmlFor="product-storage-conditions"
            error={translate(t, errors.storageConditions?.message)}
          >
            <Textarea
              id="product-storage-conditions"
              rows={2}
              maxLength={500}
              placeholder={t.productForm.storageConditionsPlaceholder}
              invalid={Boolean(errors.storageConditions)}
              {...form.register('storageConditions')}
            />
          </Field>

          <Field
            label={t.product.allergens}
            htmlFor="product-allergens"
            error={translate(t, errors.allergens?.message)}
          >
            <Textarea
              id="product-allergens"
              rows={2}
              maxLength={500}
              placeholder={t.productForm.allergensPlaceholder}
              invalid={Boolean(errors.allergens)}
              {...form.register('allergens')}
            />
          </Field>

          <Field
            label={t.product.composition}
            htmlFor="product-composition"
            error={translate(t, errors.composition?.message)}
          >
            <Textarea
              id="product-composition"
              rows={2}
              maxLength={1000}
              placeholder={t.productForm.compositionPlaceholder}
              invalid={Boolean(errors.composition)}
              {...form.register('composition')}
            />
          </Field>

          <Field
            label={t.product.packaging}
            htmlFor="product-packaging"
            error={translate(t, errors.packaging?.message)}
          >
            <Textarea
              id="product-packaging"
              rows={2}
              maxLength={300}
              placeholder={t.productForm.packagingPlaceholder}
              invalid={Boolean(errors.packaging)}
              {...form.register('packaging')}
            />
          </Field>
        </div>
      </details>
    </div>
  )
}
