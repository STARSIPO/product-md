'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Trash2 } from 'lucide-react'
import { Alert, Button, CheckboxField, Field, Input, Select, Switch, useToast } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { documentSchema } from '@/lib/validation'
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from '@/lib/constants'
import { resolveErrorMessage, translate } from '@/app/[locale]/login/login-form'
import { deleteDocument, setDocumentVisibility, uploadDocument } from '@/server/actions/documents'

/**
 * Uploading a verification document.
 *
 * The file never leaves this form as anything but bytes: the server mints its own
 * storage key, sniffs the format and stores the object privately. Nothing here knows
 * or shows a key.
 *
 * "Show on the public page" is a deliberate, per-document opt-in that starts OFF. A
 * registration certificate carries an address and a director's name; the thing buyers
 * are entitled to see is the badge that says it was checked.
 */

type DocumentValues = z.input<typeof documentSchema>

const MAX_MB = Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024))

export function DocumentUploadForm() {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()

  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DocumentValues>({
    // `raw: true` keeps the resolver working on the values the inputs actually hold;
    // the schema's coercions (dates, checkbox) belong to the server round trip.
    resolver: zodResolver(documentSchema, undefined, { raw: true }),
    defaultValues: {
      type: 'REGISTRATION',
      number: '',
      issuedAt: '',
      expiresAt: '',
      // Private by default. This is the whole point of the control.
      isPublic: false,
    },
  })

  function onSubmit(values: DocumentValues) {
    setFormError(null)
    setFileError(null)

    if (!file) {
      setFileError(t.validation.required)
      return
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      setFileError(fmt(t.errors.fileTooLarge, { size: MAX_MB }))
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', String(values.type))
    if (values.number) formData.append('number', String(values.number))
    if (values.issuedAt) formData.append('issuedAt', String(values.issuedAt))
    if (values.expiresAt) formData.append('expiresAt', String(values.expiresAt))
    formData.append('isPublic', values.isPublic ? 'true' : 'false')

    startTransition(async () => {
      const result = await uploadDocument(formData)

      if (!result.ok) {
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }

      reset()
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      toast({ title: t.verification.submitted, variant: 'success' })
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div aria-live="polite">
        {formError ? <Alert variant="destructive">{formError}</Alert> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t.verification.documentType}
          htmlFor="document-type"
          required
          error={errors.type ? translate(t, errors.type.message) : undefined}
        >
          <Select id="document-type" invalid={Boolean(errors.type)} {...register('type')}>
            {DOCUMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {t.verification.docTypes[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={t.verification.documentNumber}
          htmlFor="document-number"
          error={errors.number ? translate(t, errors.number.message) : undefined}
        >
          <Input id="document-number" maxLength={80} {...register('number')} />
        </Field>

        <Field label={t.verification.issuedAt} htmlFor="document-issued-at">
          <Input id="document-issued-at" type="date" {...register('issuedAt')} />
        </Field>

        <Field label={t.verification.expiresAt} htmlFor="document-expires-at">
          <Input id="document-expires-at" type="date" {...register('expiresAt')} />
        </Field>
      </div>

      <Field
        label={t.verification.file}
        htmlFor="document-file"
        required
        hint={fmt(t.verification.fileHint, { size: MAX_MB })}
        error={fileError ?? undefined}
      >
        <input
          ref={fileInput}
          id="document-file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            setFileError(null)
          }}
          className="block w-full cursor-pointer rounded-md border border-input bg-card px-3 py-2.5 text-sm file:mr-3 file:min-h-[32px] file:rounded file:border-0 file:bg-muted file:px-3 file:text-sm file:text-foreground"
        />
      </Field>

      <CheckboxField
        id="document-is-public"
        label={t.verification.makePublic}
        hint={t.verification.makePublicHint}
        {...register('isPublic')}
      />

      <Button type="submit" loading={pending}>
        {t.verification.uploadDocument}
      </Button>
    </form>
  )
}

/**
 * Per-document controls: publish/unpublish, and delete.
 *
 * Both send only the document id; the server re-scopes it to the caller's company, so
 * an id from another company resolves to nothing at all.
 */
export function DocumentActions({
  documentId,
  isPublic,
}: {
  documentId: string
  isPublic: boolean
}) {
  const { t, fmt } = useI18n()
  const router = useRouter()
  const { toast } = useToast()

  const [publicNow, setPublicNow] = useState(isPublic)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Switch
        id={`document-public-${documentId}`}
        checked={publicNow}
        disabled={pending}
        label={publicNow ? t.verification.isPublicOn : t.verification.isPublicOff}
        onCheckedChange={(next) => {
          setPublicNow(next)
          startTransition(async () => {
            const result = await setDocumentVisibility(documentId, next)
            if (!result.ok) {
              setPublicNow(!next)
              setMessage(resolveErrorMessage(t, result, fmt))
              return
            }
            setMessage(t.verification.visibilityUpdated)
            router.refresh()
          })
        }}
      />

      <Button
        variant="ghost"
        size="sm"
        loading={pending}
        className="min-h-[44px] text-destructive"
        onClick={() => {
          if (!window.confirm(t.verification.deleteConfirm)) return
          startTransition(async () => {
            const result = await deleteDocument(documentId)
            if (!result.ok) {
              setMessage(resolveErrorMessage(t, result, fmt))
              return
            }
            toast({ title: t.verification.deleted, variant: 'success' })
            router.refresh()
          })
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        <span className="sr-only sm:not-sr-only sm:inline">{t.verification.deleteDocument}</span>
      </Button>

      <p aria-live="polite" className="sr-only">
        {message ?? ''}
      </p>
    </div>
  )
}
