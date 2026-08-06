'use client'

import { Checkbox, Field, Input } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { formatDateShort } from '@/lib/i18n/format'
import { MAX_PRODUCT_PHOTOS } from '@/lib/constants'
import { translate } from '@/app/[locale]/login/login-form'
import { PhotoUploader } from './photo-uploader'
import type { DocumentOption, StepProps } from './product-wizard'

/**
 * Step 6 — «Фото и документы».
 *
 * Only documents a moderator has already approved can be attached. A seller cannot
 * upload a certificate here and have it appear next to the price as if it had been
 * checked — verification happens once, on the company, and listings borrow the result.
 */
export function StepMedia({
  form,
  values,
  documents,
}: StepProps & { documents: DocumentOption[] }) {
  const { t, fmt, locale } = useI18n()
  const { errors } = form.formState

  const docTypes = t.verification.docTypes as Record<string, string | undefined>
  const selected = new Set(values.documentIds)

  function toggleDocument(id: string): void {
    const next = selected.has(id)
      ? values.documentIds.filter((documentId) => documentId !== id)
      : [...values.documentIds, id]
    form.setValue('documentIds', next, { shouldDirty: true })
  }

  return (
    <div className="space-y-6">
      <PhotoUploader
        photos={values.photos}
        onChange={(photos) => form.setValue('photos', photos, { shouldDirty: true })}
        max={MAX_PRODUCT_PHOTOS}
      />

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-medium text-foreground">
          {t.productForm.documents}
        </legend>
        <p className="mb-3 text-caption text-muted-foreground">{t.productForm.documentsHint}</p>

        {documents.length === 0 ? (
          <p className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            {t.productForm.documentsEmpty}
          </p>
        ) : (
          <ul className="space-y-1">
            {documents.map((document) => {
              const id = `document-${document.id}`
              return (
                <li key={document.id}>
                  <label
                    htmlFor={id}
                    className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-1 text-sm"
                  >
                    <Checkbox
                      id={id}
                      checked={selected.has(document.id)}
                      onChange={() => toggleDocument(document.id)}
                    />
                    <span className="min-w-0">
                      <span className="block break-words font-medium">
                        {docTypes[document.type] ?? document.type}
                      </span>
                      <span className="block text-caption text-muted-foreground">
                        {[
                          document.number,
                          document.expiresAt
                            ? fmt(t.productForm.documentExpires, {
                                date: formatDateShort(document.expiresAt, locale),
                              })
                            : null,
                        ]
                          .filter((part): part is string => Boolean(part))
                          .join(' · ')}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </fieldset>

      <Field
        label={t.productForm.videoUrl}
        htmlFor="product-video"
        hint={t.productForm.videoUrlHint}
        error={translate(t, errors.videoUrl?.message)}
      >
        <Input
          id="product-video"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder={t.productForm.videoUrlPlaceholder}
          invalid={Boolean(errors.videoUrl)}
          {...form.register('videoUrl')}
        />
      </Field>
    </div>
  )
}
