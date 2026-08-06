'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Paperclip, Trash2 } from 'lucide-react'
import {
  Alert,
  Button,
  CheckboxField,
  Field,
  Input,
  ProgressSteps,
  RadioGroup,
  Select,
  Textarea,
  useToast,
} from '@/components/ui'
import { CategoryPicker, type PickedCategory } from '@/components/category/category-picker'
import {
  AttributeFields,
  toAttributeArray,
  useCategoryAttributes,
  type AttributeValue,
} from '@/components/category/attribute-fields'
import { useI18n } from '@/lib/i18n/provider'
import { formatMoney, parseAmountToBani } from '@/lib/money'
import { formatDateShort } from '@/lib/i18n/format'
import { purchaseRequestSchema } from '@/lib/validation'
import { REQUEST_FREQUENCY, REQUEST_VISIBILITY, UNITS } from '@/lib/constants'
import { resolveErrorMessage, translate } from '@/app/[locale]/login/login-form'
import {
  createRequestAction,
  deleteRequestAttachment,
  updateRequestAction,
  uploadRequestAttachments,
  type RequestFormInput,
} from '@/server/actions/requests'

/**
 * The five-step purchase-request wizard.
 *
 * A buyer describing a need is the scarce side of this marketplace, so the form is built
 * to be finished: one decision per screen, the category picked from free text rather
 * than a tree, category-dependent fields appearing only once the category is known, and
 * an autosaved draft so a phone call in the middle does not cost the whole form.
 */

export interface LocalityOption {
  id: string
  districtId: string
  name: string
}

export interface DistrictOption {
  id: string
  name: string
}

export interface ExistingAttachment {
  id: string
  fileName: string
  sizeByte: number
}

export interface RequestDraftValues {
  id: string
  slug: string
  status: string
  category: PickedCategory
  title: string
  description: string
  quantity: string
  unit: string
  desiredPrice: string
  maxBudget: string
  isRecurring: boolean
  frequency: string
  firstDeliveryAt: string
  offersDeadlineAt: string
  documentRequirements: string
  packagingRequirements: string
  storageConditions: string
  allowPartial: boolean
  verifiedOnly: boolean
  isUrgent: boolean
  visibility: string
  deliveryDistrictId: string
  deliveryLocalityId: string
  deliveryAddress: string
  supplierRadiusKm: string
  attributes: Record<string, AttributeValue>
}

type Draft = Omit<RequestDraftValues, 'id' | 'slug' | 'status' | 'category'> & {
  category: PickedCategory | null
}

const EMPTY_DRAFT: Draft = {
  category: null,
  title: '',
  description: '',
  quantity: '',
  unit: 'KG',
  desiredPrice: '',
  maxBudget: '',
  isRecurring: false,
  frequency: 'WEEKLY',
  firstDeliveryAt: '',
  offersDeadlineAt: '',
  documentRequirements: '',
  packagingRequirements: '',
  storageConditions: '',
  allowPartial: false,
  verifiedOnly: false,
  isUrgent: false,
  visibility: 'PUBLIC',
  deliveryDistrictId: '',
  deliveryLocalityId: '',
  deliveryAddress: '',
  supplierRadiusKm: '',
  attributes: {},
}

const STEP_COUNT = 5

/** Which step owns which schema field — a server error jumps the user to the right one. */
const FIELD_STEPS: Record<string, number> = {
  categoryId: 0,
  title: 0,
  description: 0,
  quantity: 1,
  unit: 1,
  desiredPriceBani: 1,
  maxBudgetBani: 1,
  frequency: 1,
  firstDeliveryAt: 1,
  offersDeadlineAt: 1,
  documentRequirements: 2,
  packagingRequirements: 2,
  storageConditions: 2,
  attributes: 2,
  deliveryLocalityId: 3,
  deliveryAddress: 3,
  supplierRadiusKm: 3,
  visibility: 4,
}

function storageKey(requestId: string | undefined): string {
  return `pmd:request-draft:${requestId ?? 'new'}`
}

export function RequestWizard({
  districts,
  localities,
  existing,
  attachments,
}: {
  districts: readonly DistrictOption[]
  localities: readonly LocalityOption[]
  existing: RequestDraftValues | null
  attachments: readonly ExistingAttachment[]
}) {
  const { t, fmt, locale, href } = useI18n()
  const router = useRouter()
  const { toast } = useToast()

  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(() => (existing ? toDraft(existing) : EMPTY_DRAFT))
  const [files, setFiles] = useState<File[]>([])
  const [savedAttachments, setSavedAttachments] = useState<readonly ExistingAttachment[]>(
    attachments,
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [pending, startTransition] = useTransition()

  const hydrated = useRef(false)
  const key = storageKey(existing?.id)

  const { attributes, loading: attributesLoading } = useCategoryAttributes(
    draft.category?.id ?? null,
    'REQUEST',
  )

  // --- autosave -------------------------------------------------------------
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Draft>
        setDraft((current) => ({ ...current, ...parsed }))
        setRestored(true)
      }
    } catch {
      // A corrupt draft must never block the form.
    }
    hydrated.current = true
  }, [key])

  useEffect(() => {
    if (!hydrated.current) return
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(draft))
      } catch {
        // Private mode / quota — autosave is a convenience, never a requirement.
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [draft, key])

  const update = useCallback(<K extends keyof Draft>(field: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }, [])

  const localityOptions = useMemo(
    () =>
      draft.deliveryDistrictId
        ? localities.filter((locality) => locality.districtId === draft.deliveryDistrictId)
        : [],
    [localities, draft.deliveryDistrictId],
  )

  const payload = useMemo<RequestFormInput>(() => toPayload(draft), [draft])

  const steps = [
    { id: 'what', label: t.requestForm.step1 },
    { id: 'volume', label: t.requestForm.step2 },
    { id: 'requirements', label: t.requestForm.step3 },
    { id: 'delivery', label: t.requestForm.step4 },
    { id: 'preview', label: t.requestForm.step5 },
  ]

  function validateStep(index: number): boolean {
    const errors: Record<string, string> = {}

    if (index === 0) {
      if (!draft.category) errors['categoryId'] = t.productForm.categoryRequired
      if (draft.title.trim().length < 3) errors['title'] = t.validation.minLength
    }

    if (index === 1) {
      const quantity = Number(draft.quantity)
      if (!draft.quantity || !Number.isFinite(quantity) || quantity <= 0) {
        errors['quantity'] = t.validation.positive
      }
      if (draft.isRecurring && !draft.frequency) errors['frequency'] = t.validation.selectOption
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  function goNext() {
    if (!validateStep(step)) return
    setStep((current) => Math.min(current + 1, STEP_COUNT - 1))
  }

  function submit(publish: boolean) {
    setFormError(null)

    const parsed = purchaseRequestSchema.safeParse(payload)
    if (!parsed.success) {
      const errors: Record<string, string> = {}
      let firstStep = STEP_COUNT - 1

      for (const issue of parsed.error.issues) {
        const path = String(issue.path[0] ?? '')
        if (path && !errors[path]) errors[path] = translate(t, issue.message) ?? issue.message
        const owner = FIELD_STEPS[path]
        if (owner !== undefined && owner < firstStep) firstStep = owner
      }

      setFieldErrors(errors)
      setFormError(t.errors.validation)
      setStep(firstStep)
      return
    }

    startTransition(async () => {
      const result = existing
        ? await updateRequestAction(existing.id, payload, { publish })
        : await createRequestAction(payload, { publish })

      if (!result.ok) {
        if (result.fields) {
          const errors: Record<string, string> = {}
          for (const [field, messageKey] of Object.entries(result.fields)) {
            errors[field] = translate(t, messageKey) ?? messageKey
          }
          setFieldErrors(errors)
        }
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }

      if (files.length > 0) {
        const formData = new FormData()
        for (const file of files) formData.append('files', file)

        const upload = await uploadRequestAttachments(result.data.id, formData)
        if (!upload.ok) {
          setFormError(resolveErrorMessage(t, upload, fmt))
          return
        }
      }

      try {
        window.localStorage.removeItem(key)
      } catch {
        // ignore
      }

      toast({
        title: existing ? t.requestForm.updated : t.requestForm.created,
        variant: 'success',
      })
      router.push(href('requests', result.data.slug))
      router.refresh()
    })
  }

  function discardDraft() {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // ignore
    }
    setDraft(existing ? toDraft(existing) : EMPTY_DRAFT)
    setRestored(false)
    setStep(0)
  }

  function removeSavedAttachment(id: string) {
    startTransition(async () => {
      const result = await deleteRequestAttachment(id)
      if (!result.ok) {
        setFormError(resolveErrorMessage(t, result, fmt))
        return
      }
      setSavedAttachments((current) => current.filter((attachment) => attachment.id !== id))
    })
  }

  return (
    <div className="space-y-6">
      <ProgressSteps
        steps={steps}
        current={step}
        onStepClick={(index) => setStep(index)}
        summary={fmt(t.requestForm.stepOf, { current: step + 1, total: STEP_COUNT })}
        label={t.requestForm.createTitle}
      />

      <Alert variant="info" icon={<Lock aria-hidden="true" className="h-[18px] w-[18px]" />}>
        {t.requestForm.privacyNotice}
      </Alert>

      {restored ? (
        <Alert variant="warning">
          {t.requestForm.draftRestored}{' '}
          <button type="button" onClick={discardDraft} className="font-medium underline">
            {t.requestForm.discardDraft}
          </button>
        </Alert>
      ) : null}

      {formError ? <Alert variant="destructive">{formError}</Alert> : null}

      {/* ------------------------------------------------------------ step 1 */}
      {step === 0 ? (
        <div className="space-y-5">
          <CategoryPicker
            value={draft.category}
            onChange={(category) => {
              setDraft((current) => ({
                ...current,
                category,
                unit: category?.defaultUnit ?? current.unit,
                attributes: category?.id === current.category?.id ? current.attributes : {},
              }))
            }}
            label={t.requestForm.whatNeeded}
            placeholder={t.requestForm.whatNeededPlaceholder}
            hint={t.requestForm.whatNeededHint}
            error={fieldErrors['categoryId']}
            appliesTo="REQUEST"
            autoFocus
          />

          <Field
            label={t.requestForm.title}
            htmlFor="request-title"
            required
            error={fieldErrors['title']}
          >
            <Input
              id="request-title"
              value={draft.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder={t.requestForm.titlePlaceholder}
              invalid={Boolean(fieldErrors['title'])}
              maxLength={160}
            />
          </Field>

          <Field
            label={t.requestForm.description}
            htmlFor="request-description"
            error={fieldErrors['description']}
          >
            <Textarea
              id="request-description"
              value={draft.description}
              onChange={(event) => update('description', event.target.value)}
              placeholder={t.requestForm.descriptionPlaceholder}
              rows={5}
            />
          </Field>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ step 2 */}
      {step === 1 ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.requestForm.quantity}
              htmlFor="request-quantity"
              required
              error={fieldErrors['quantity']}
            >
              <div className="flex gap-2">
                <Input
                  id="request-quantity"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className="flex-1"
                  value={draft.quantity}
                  onChange={(event) => update('quantity', event.target.value)}
                  invalid={Boolean(fieldErrors['quantity'])}
                />
                <Select
                  aria-label={t.requestForm.unit}
                  wrapperClassName="w-32 shrink-0"
                  value={draft.unit}
                  onChange={(event) => update('unit', event.target.value)}
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {t.units[unit]}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>

            <Field
              label={t.requestForm.desiredPrice}
              htmlFor="request-desired-price"
              error={fieldErrors['desiredPriceBani']}
            >
              <Input
                id="request-desired-price"
                inputMode="decimal"
                placeholder="95.50"
                value={draft.desiredPrice}
                onChange={(event) => update('desiredPrice', event.target.value)}
                invalid={Boolean(fieldErrors['desiredPriceBani'])}
              />
            </Field>

            <Field
              label={t.requestForm.maxBudget}
              htmlFor="request-max-budget"
              error={fieldErrors['maxBudgetBani']}
            >
              <Input
                id="request-max-budget"
                inputMode="decimal"
                placeholder="20000"
                value={draft.maxBudget}
                onChange={(event) => update('maxBudget', event.target.value)}
                invalid={Boolean(fieldErrors['maxBudgetBani'])}
              />
            </Field>
          </div>

          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-2 text-sm font-medium">{t.requestForm.purchaseType}</legend>
            <RadioGroup
              name="purchase-type"
              columns={2}
              value={draft.isRecurring ? 'recurring' : 'one-time'}
              onChange={(value) => update('isRecurring', value === 'recurring')}
              options={[
                { value: 'one-time', label: t.requestForm.oneTime },
                { value: 'recurring', label: t.requestForm.recurring },
              ]}
            />
          </fieldset>

          {draft.isRecurring ? (
            <Field
              label={t.requestForm.frequency}
              htmlFor="request-frequency"
              required
              error={fieldErrors['frequency']}
            >
              <Select
                id="request-frequency"
                value={draft.frequency}
                onChange={(event) => update('frequency', event.target.value)}
                invalid={Boolean(fieldErrors['frequency'])}
              >
                {REQUEST_FREQUENCY.map((value) => (
                  <option key={value} value={value}>
                    {t.frequency[value]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.requestForm.firstDelivery}
              htmlFor="request-first-delivery"
              error={fieldErrors['firstDeliveryAt']}
            >
              <Input
                id="request-first-delivery"
                type="date"
                value={draft.firstDeliveryAt}
                onChange={(event) => update('firstDeliveryAt', event.target.value)}
                invalid={Boolean(fieldErrors['firstDeliveryAt'])}
              />
            </Field>

            <Field
              label={t.requestForm.offersDeadline}
              htmlFor="request-deadline"
              error={fieldErrors['offersDeadlineAt']}
            >
              <Input
                id="request-deadline"
                type="date"
                value={draft.offersDeadlineAt}
                onChange={(event) => update('offersDeadlineAt', event.target.value)}
                invalid={Boolean(fieldErrors['offersDeadlineAt'])}
              />
            </Field>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ step 3 */}
      {step === 2 ? (
        <div className="space-y-5">
          {draft.category ? (
            <section aria-labelledby="request-attributes">
              <h2 id="request-attributes" className="mb-3 text-h3">
                {t.request.attributes}
              </h2>
              <AttributeFields
                attributes={attributes}
                loading={attributesLoading}
                values={draft.attributes}
                onChange={(attributeId, value) =>
                  setDraft((current) => {
                    const next = { ...current.attributes }
                    if (value === undefined) delete next[attributeId]
                    else next[attributeId] = value
                    return { ...current, attributes: next }
                  })
                }
              />
            </section>
          ) : null}

          <Field label={t.request.documentRequirements} htmlFor="request-documents">
            <Textarea
              id="request-documents"
              value={draft.documentRequirements}
              onChange={(event) => update('documentRequirements', event.target.value)}
              rows={3}
            />
          </Field>

          <Field label={t.request.packagingRequirements} htmlFor="request-packaging">
            <Textarea
              id="request-packaging"
              value={draft.packagingRequirements}
              onChange={(event) => update('packagingRequirements', event.target.value)}
              rows={3}
            />
          </Field>

          <Field label={t.request.storageConditions} htmlFor="request-storage">
            <Textarea
              id="request-storage"
              value={draft.storageConditions}
              onChange={(event) => update('storageConditions', event.target.value)}
              rows={2}
            />
          </Field>

          <div className="space-y-1">
            <CheckboxField
              id="request-allow-partial"
              label={t.requestForm.allowPartial}
              checked={draft.allowPartial}
              onChange={(event) => update('allowPartial', event.target.checked)}
            />
            <CheckboxField
              id="request-verified-only"
              label={t.requestForm.verifiedOnly}
              checked={draft.verifiedOnly}
              onChange={(event) => update('verifiedOnly', event.target.checked)}
            />
            <CheckboxField
              id="request-urgent"
              label={t.requestForm.urgent}
              checked={draft.isUrgent}
              onChange={(event) => update('isUrgent', event.target.checked)}
            />
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ step 4 */}
      {step === 3 ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.company.district} htmlFor="request-district">
              <Select
                id="request-district"
                value={draft.deliveryDistrictId}
                onChange={(event) => {
                  const districtId = event.target.value
                  setDraft((current) => ({
                    ...current,
                    deliveryDistrictId: districtId,
                    deliveryLocalityId: '',
                  }))
                }}
              >
                <option value="">{t.validation.selectOption}</option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={t.requestForm.deliveryLocality}
              htmlFor="request-locality"
              error={fieldErrors['deliveryLocalityId']}
            >
              <Select
                id="request-locality"
                value={draft.deliveryLocalityId}
                disabled={localityOptions.length === 0}
                onChange={(event) => update('deliveryLocalityId', event.target.value)}
              >
                <option value="">{t.validation.selectOption}</option>
                {localityOptions.map((locality) => (
                  <option key={locality.id} value={locality.id}>
                    {locality.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label={t.requestForm.deliveryAddress}
            htmlFor="request-address"
            error={fieldErrors['deliveryAddress']}
          >
            <Input
              id="request-address"
              value={draft.deliveryAddress}
              onChange={(event) => update('deliveryAddress', event.target.value)}
              maxLength={250}
            />
          </Field>

          <Field
            label={t.requestForm.supplierRadius}
            htmlFor="request-radius"
            hint={t.requestForm.supplierRadiusHint}
            error={fieldErrors['supplierRadiusKm']}
          >
            <Input
              id="request-radius"
              type="number"
              inputMode="numeric"
              min="1"
              max="1000"
              value={draft.supplierRadiusKm}
              onChange={(event) => update('supplierRadiusKm', event.target.value)}
              invalid={Boolean(fieldErrors['supplierRadiusKm'])}
            />
          </Field>

          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-2 text-sm font-medium">{t.requestForm.visibility}</legend>
            <RadioGroup
              name="visibility"
              columns={2}
              value={draft.visibility}
              onChange={(value) => update('visibility', value)}
              options={REQUEST_VISIBILITY.map((value) => ({
                value,
                label:
                  value === 'PUBLIC'
                    ? t.requestForm.visibilityPublic
                    : t.requestForm.visibilityPrivate,
                hint:
                  value === 'PUBLIC'
                    ? t.requestForm.visibilityPublicHint
                    : t.requestForm.visibilityPrivateHint,
              }))}
            />
          </fieldset>

          <Field label={t.requestForm.attachments} htmlFor="request-files" hint={t.requestForm.attachmentsHint}>
            <input
              id="request-files"
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              className="block w-full cursor-pointer rounded-md border border-input bg-card px-3 py-2.5 text-sm file:mr-3 file:min-h-[32px] file:rounded file:border-0 file:bg-muted file:px-3 file:text-sm file:text-foreground"
            />
          </Field>

          {files.length > 0 ? (
            <ul className="space-y-1.5">
              {files.map((file) => (
                <li key={file.name} className="flex items-center gap-2 text-sm">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{file.name}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {savedAttachments.length > 0 ? (
            <ul className="space-y-1.5">
              {savedAttachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center gap-2 text-sm">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{attachment.fileName}</span>
                  <button
                    type="button"
                    onClick={() => removeSavedAttachment(attachment.id)}
                    aria-label={`${t.common.delete}: ${attachment.fileName}`}
                    className="ml-auto grid h-11 w-11 shrink-0 place-items-center rounded text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------------------ step 5 */}
      {step === 4 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-h3">{t.requestForm.previewTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.requestForm.previewHint}</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-h3">{draft.title}</h3>
            {draft.category ? (
              <p className="mt-1 text-caption text-muted-foreground">{draft.category.trail}</p>
            ) : null}
            {draft.description ? (
              <p className="mt-3 whitespace-pre-line text-sm">{draft.description}</p>
            ) : null}

            <dl className="mt-4 grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
              <Summary label={t.request.quantity}>
                {draft.quantity} {t.units[draft.unit as keyof typeof t.units] ?? draft.unit}
              </Summary>
              {draft.desiredPrice ? (
                <Summary label={t.request.desiredPrice}>
                  {formatMoney(parseAmountToBani(draft.desiredPrice) ?? 0, locale)}
                </Summary>
              ) : null}
              {draft.maxBudget ? (
                <Summary label={t.request.budget}>
                  {formatMoney(parseAmountToBani(draft.maxBudget) ?? 0, locale)}
                </Summary>
              ) : null}
              <Summary label={t.request.frequency}>
                {draft.isRecurring
                  ? (t.frequency[draft.frequency as keyof typeof t.frequency] ?? draft.frequency)
                  : t.request.badgeOneTime}
              </Summary>
              {draft.firstDeliveryAt ? (
                <Summary label={t.request.deliveryDate}>
                  {formatDateShort(draft.firstDeliveryAt, locale)}
                </Summary>
              ) : null}
              <Summary label={t.request.deadline}>
                {draft.offersDeadlineAt
                  ? formatDateShort(draft.offersDeadlineAt, locale)
                  : t.request.deadlineNone}
              </Summary>
              {draft.deliveryLocalityId ? (
                <Summary label={t.requestForm.deliveryLocality}>
                  {localities.find((locality) => locality.id === draft.deliveryLocalityId)?.name ??
                    ''}
                </Summary>
              ) : null}
              {draft.deliveryAddress ? (
                <Summary label={t.request.deliveryAddress}>{draft.deliveryAddress}</Summary>
              ) : null}
              <Summary label={t.requestForm.visibility}>
                {draft.visibility === 'PUBLIC'
                  ? t.requestForm.visibilityPublic
                  : t.requestForm.visibilityPrivate}
              </Summary>
            </dl>
          </div>

          <p className="text-caption text-muted-foreground">{t.requestForm.autosaveHint}</p>
        </div>
      ) : null}

      {/* --------------------------------------------------------- navigation */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {step > 0 ? (
          <Button variant="outline" onClick={() => setStep((current) => current - 1)}>
            {t.common.back}
          </Button>
        ) : null}

        {step < STEP_COUNT - 1 ? (
          <Button onClick={goNext}>{t.common.next}</Button>
        ) : (
          <Button loading={pending} onClick={() => submit(true)}>
            {t.requestForm.publishRequest}
          </Button>
        )}

        <Button
          variant="ghost"
          className="ml-auto"
          loading={pending}
          onClick={() => submit(false)}
        >
          {t.common.saveDraft}
        </Button>
      </div>
    </div>
  )
}

function Summary({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  )
}

function toDraft(values: RequestDraftValues): Draft {
  const { id: _id, slug: _slug, status: _status, ...draft } = values
  return draft
}

/** Raw strings in, schema input out — the server parses this exact object again. */
function toPayload(draft: Draft): RequestFormInput {
  return {
    title: draft.title,
    description: draft.description || undefined,
    categoryId: draft.category?.id ?? '',
    quantity: Number(draft.quantity),
    unit: draft.unit as RequestFormInput['unit'],
    desiredPriceBani: draft.desiredPrice || undefined,
    maxBudgetBani: draft.maxBudget || undefined,
    isRecurring: draft.isRecurring,
    frequency: draft.isRecurring
      ? (draft.frequency as RequestFormInput['frequency'])
      : undefined,
    firstDeliveryAt: draft.firstDeliveryAt || undefined,
    offersDeadlineAt: draft.offersDeadlineAt || undefined,
    deliveryLocalityId: draft.deliveryLocalityId || undefined,
    deliveryAddress: draft.deliveryAddress || undefined,
    supplierRadiusKm: draft.supplierRadiusKm ? Number(draft.supplierRadiusKm) : undefined,
    documentRequirements: draft.documentRequirements || undefined,
    packagingRequirements: draft.packagingRequirements || undefined,
    storageConditions: draft.storageConditions || undefined,
    allowPartial: draft.allowPartial,
    verifiedOnly: draft.verifiedOnly,
    isUrgent: draft.isUrgent,
    visibility: draft.visibility as RequestFormInput['visibility'],
    attributes: toAttributeArray(draft.attributes),
  }
}
