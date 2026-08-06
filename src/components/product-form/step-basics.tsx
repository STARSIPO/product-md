'use client'

import { Field, Input, Textarea } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { CategoryPicker, type PickedCategory } from '@/components/category/category-picker'
import { translate } from '@/app/[locale]/login/login-form'
import type { StepProps } from './product-wizard'

/**
 * Step 1 — «Основная информация».
 *
 * The category field comes first, before the title, and the seller cannot leave this
 * step until they confirm one. Everything downstream depends on it: which
 * characteristics step 4 asks for, the default unit on step 3, and which buyers ever
 * see the listing.
 */
export function StepBasics({
  form,
  values,
  category,
  onCategoryChange,
  categoryError,
}: StepProps & {
  category: PickedCategory | null
  onCategoryChange: (category: PickedCategory | null) => void
  categoryError?: string
}) {
  const { t } = useI18n()
  const { errors } = form.formState

  return (
    <div className="space-y-5">
      <CategoryPicker
        value={category}
        onChange={onCategoryChange}
        label={t.productForm.whatSelling}
        placeholder={t.productForm.whatSellingPlaceholder}
        hint={t.productForm.whatSellingHint}
        error={categoryError}
        appliesTo="PRODUCT"
        autoFocus
      />

      <Field
        label={t.productForm.title}
        htmlFor="product-title"
        hint={t.productForm.titleHint}
        required
        error={translate(t, errors.title?.message)}
      >
        <Input
          id="product-title"
          placeholder={t.productForm.titlePlaceholder}
          autoComplete="off"
          enterKeyHint="next"
          maxLength={160}
          invalid={Boolean(errors.title)}
          {...form.register('title')}
        />
      </Field>

      <Field
        label={t.productForm.description}
        htmlFor="product-description"
        hint={t.productForm.descriptionHint}
        error={translate(t, errors.description?.message)}
      >
        <Textarea
          id="product-description"
          rows={6}
          maxLength={8000}
          placeholder={t.productForm.descriptionPlaceholder}
          invalid={Boolean(errors.description)}
          {...form.register('description')}
        />
      </Field>

      <p className="text-caption text-muted-foreground">
        {values.description.trim().length} / 8000
      </p>
    </div>
  )
}
