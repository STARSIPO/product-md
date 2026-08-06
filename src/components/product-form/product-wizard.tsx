'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, type Path, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, ChevronRight, Loader2, Save } from 'lucide-react'

import { Alert, Button, ProgressSteps, useToast } from '@/components/ui'
import { useI18n } from '@/lib/i18n/provider'
import { formatTime } from '@/lib/i18n/format'
import { productSchema } from '@/lib/validation'
import { MAX_PRODUCT_PHOTOS, UNITS, type Unit, type Availability } from '@/lib/constants'
import { CategoryPicker, type PickedCategory } from '@/components/category/category-picker'
import {
  useCategoryAttributes,
  toAttributeArray,
  type AttributeValue,
} from '@/components/category/attribute-fields'
import { publishProduct, saveProductDraft, updateProductAction } from '@/server/actions/products'
import { resolveErrorMessage } from '@/app/[locale]/login/login-form'

import { StepBasics } from './step-basics'
import { StepPricing } from './step-pricing'
import { StepAttributes } from './step-attributes'
import { StepDelivery } from './step-delivery'
import { StepMedia } from './step-media'
import { StepPreview } from './step-preview'

/**
 * The seller listing wizard.
 *
 * A wholesale listing carries around forty fields. Asked for all at once it is
 * abandoned, so the form is cut into seven steps, the rarely-used half of step 4 is
 * folded into a collapsible, and the whole thing autosaves to localStorage — a seller
 * who loses signal on a phone in a warehouse comes back to what they typed.
 *
 * Validation is per step and runs the *real* `productSchema`, picked down to the fields
 * of that step. Nobody reaches the preview only to be told the price on step 3 was
 * malformed.
 *
 * Money never becomes a float here: the seller's raw "95,50" travels as a string and
 * `productSchema` turns it into integer bani — on the server, every time.
 */

// --- shared shapes -----------------------------------------------------------

/** An image already uploaded through /api/uploads/product-photo. */
export interface PhotoDraft {
  key: string
  url: string
}

/** One wholesale price break, still in the seller's own text. */
export interface TierDraft {
  minQty: string
  maxQty: string
  priceBani: string
}

export interface WizardValues {
  title: string
  description: string
  priceBani: string
  currency: string
  unit: Unit
  minOrderQty: string
  availableQty: string
  availability: Availability
  priceTiers: TierDraft[]
  originCountry: string
  productionPlace: string
  manufacturer: string
  batchNumber: string
  producedAt: string
  bestBefore: string
  storageConditions: string
  storageTempC: string
  allergens: string
  composition: string
  packaging: string
  supplyRegularity: string
  deliveryTerms: string
  deliveryPriceBani: string
  pickupAvailable: boolean
  deliveryRegions: string[]
  videoUrl: string
  photos: PhotoDraft[]
  documentIds: string[]
}

export interface DistrictOption {
  id: string
  name: string
}

export interface DocumentOption {
  id: string
  type: string
  number: string | null
  expiresAt: string | null
  isPublic: boolean
}

export interface StepProps {
  form: UseFormReturn<WizardValues>
  values: WizardValues
}

export function emptyWizardValues(): WizardValues {
  return {
    title: '',
    description: '',
    priceBani: '',
    currency: 'MDL',
    unit: 'KG',
    minOrderQty: '',
    availableQty: '',
    availability: 'IN_STOCK',
    priceTiers: [],
    originCountry: '',
    productionPlace: '',
    manufacturer: '',
    batchNumber: '',
    producedAt: '',
    bestBefore: '',
    storageConditions: '',
    storageTempC: '',
    allergens: '',
    composition: '',
    packaging: '',
    supplyRegularity: '',
    deliveryTerms: '',
    deliveryPriceBani: '',
    pickupAvailable: false,
    deliveryRegions: [],
    videoUrl: '',
    photos: [],
    documentIds: [],
  }
}

function isUnit(value: string): value is Unit {
  return (UNITS as readonly string[]).includes(value)
}

// --- payload -----------------------------------------------------------------

function optional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Turns the form state into the object `productSchema` expects.
 *
 * Empty strings become `undefined` rather than travelling as "": an optional field the
 * seller skipped must reach the database as NULL, not as an empty value that later
 * renders as a blank row on the listing.
 */
function buildPayload(
  values: WizardValues,
  categoryId: string,
  attributes: AttributeValue[],
): Record<string, unknown> {
  return {
    title: values.title.trim(),
    description: optional(values.description),
    categoryId,
    priceBani: values.priceBani.trim(),
    unit: values.unit,
    minOrderQty: optional(values.minOrderQty),
    availableQty: optional(values.availableQty),
    availability: values.availability,
    originCountry: optional(values.originCountry),
    productionPlace: optional(values.productionPlace),
    manufacturer: optional(values.manufacturer),
    batchNumber: optional(values.batchNumber),
    producedAt: optional(values.producedAt),
    bestBefore: optional(values.bestBefore),
    storageConditions: optional(values.storageConditions),
    storageTempC: optional(values.storageTempC),
    allergens: optional(values.allergens),
    composition: optional(values.composition),
    packaging: optional(values.packaging),
    supplyRegularity: optional(values.supplyRegularity),
    deliveryTerms: optional(values.deliveryTerms),
    deliveryPriceBani: optional(values.deliveryPriceBani),
    pickupAvailable: values.pickupAvailable,
    deliveryRegions: values.deliveryRegions,
    videoUrl: optional(values.videoUrl),
    priceTiers: values.priceTiers
      .filter((tier) => tier.minQty.trim() !== '' || tier.priceBani.trim() !== '')
      .map((tier) => ({
        minQty: tier.minQty.trim(),
        maxQty: optional(tier.maxQty),
        priceBani: tier.priceBani.trim(),
      })),
    attributes,
    photos: values.photos.slice(0, MAX_PRODUCT_PHOTOS).map((photo) => ({ key: photo.key })),
    documentIds: values.documentIds,
  }
}

// --- per-step validation -----------------------------------------------------

/** Which `productSchema` fields belong to which step. */
function schemaForStep(step: number): z.ZodTypeAny | null {
  switch (step) {
    case 0:
      return productSchema.pick({ title: true, description: true })
    case 2:
      return productSchema.pick({
        priceBani: true,
        unit: true,
        minOrderQty: true,
        availableQty: true,
        availability: true,
        priceTiers: true,
      })
    case 3:
      return productSchema.pick({
        originCountry: true,
        productionPlace: true,
        manufacturer: true,
        batchNumber: true,
        producedAt: true,
        bestBefore: true,
        storageConditions: true,
        storageTempC: true,
        allergens: true,
        composition: true,
        packaging: true,
        supplyRegularity: true,
        attributes: true,
      })
    case 4:
      return productSchema.pick({
        deliveryTerms: true,
        deliveryPriceBani: true,
        pickupAvailable: true,
        deliveryRegions: true,
      })
    case 5:
      return productSchema.pick({ videoUrl: true })
    default:
      return null
  }
}

/** Where a failing field lives, so a late error can send the seller to the right step. */
const FIELD_STEP: Record<string, number> = {
  title: 0,
  description: 0,
  categoryId: 1,
  priceBani: 2,
  unit: 2,
  minOrderQty: 2,
  availableQty: 2,
  availability: 2,
  priceTiers: 2,
  originCountry: 3,
  productionPlace: 3,
  manufacturer: 3,
  batchNumber: 3,
  producedAt: 3,
  bestBefore: 3,
  storageConditions: 3,
  storageTempC: 3,
  allergens: 3,
  composition: 3,
  packaging: 3,
  supplyRegularity: 3,
  attributes: 3,
  deliveryTerms: 4,
  deliveryPriceBani: 4,
  pickupAvailable: 4,
  deliveryRegions: 4,
  videoUrl: 5,
}

/** Fields that exist on the form and can therefore carry an inline error. */
const FORM_FIELDS: readonly string[] = [
  'title',
  'description',
  'priceBani',
  'unit',
  'minOrderQty',
  'availableQty',
  'availability',
  'priceTiers',
  'originCountry',
  'productionPlace',
  'manufacturer',
  'batchNumber',
  'producedAt',
  'bestBefore',
  'storageConditions',
  'storageTempC',
  'allergens',
  'composition',
  'packaging',
  'supplyRegularity',
  'deliveryTerms',
  'deliveryPriceBani',
  'pickupAvailable',
  'deliveryRegions',
  'videoUrl',
]

const AUTOSAVE_DELAY_MS = 1000
const STEP_COUNT = 7

interface DraftSnapshot {
  savedAt: number
  values: WizardValues
  category: PickedCategory | null
  attributes: Record<string, AttributeValue>
}

export interface ProductWizardProps {
  mode: 'create' | 'edit'
  /** Present in edit mode; also set after the first successful save of a new listing. */
  productId?: string
  districts: DistrictOption[]
  documents: DocumentOption[]
  /** REQUIRE_MODERATION — decides whether the primary action reads "publish" or "send". */
  requireModeration: boolean
  company: { displayName: string; location: string | null }
  initialCategory: PickedCategory | null
  initialValues: WizardValues
  initialAttributes: Record<string, AttributeValue>
}

export function ProductWizard({
  mode,
  productId,
  districts,
  documents,
  requireModeration,
  company,
  initialCategory,
  initialValues,
  initialAttributes,
}: ProductWizardProps) {
  const { t, fmt, locale, href } = useI18n()
  const router = useRouter()
  const { toast } = useToast()

  const [step, setStep] = useState(0)
  const [category, setCategory] = useState<PickedCategory | null>(initialCategory)
  const [categoryError, setCategoryError] = useState<string | undefined>(undefined)
  const [attributes, setAttributes] = useState<Record<string, AttributeValue>>(initialAttributes)
  const [tierErrors, setTierErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [restored, setRestored] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [pending, startTransition] = useTransition()

  /** Set once a new listing has been written, so a second save updates instead of duplicating. */
  const savedIdRef = useRef<string | undefined>(productId)
  const lastSnapshotRef = useRef<string>('')
  const headingRef = useRef<HTMLDivElement>(null)

  const form = useForm<WizardValues>({ defaultValues: initialValues, mode: 'onSubmit' })
  const values = form.watch()

  const { attributes: resolvedAttributes, loading: attributesLoading } = useCategoryAttributes(
    category?.id ?? null,
    'PRODUCT',
  )

  const storageKey = useMemo(() => `pmd:product-draft:${productId ?? 'new'}`, [productId])

  const steps = useMemo(
    () => [
      { id: 'basics', label: t.productForm.step1 },
      { id: 'category', label: t.productForm.step2 },
      { id: 'pricing', label: t.productForm.step3 },
      { id: 'attributes', label: t.productForm.step4 },
      { id: 'delivery', label: t.productForm.step5 },
      { id: 'media', label: t.productForm.step6 },
      { id: 'preview', label: t.productForm.step7 },
    ],
    [t],
  )

  // --- autosave: restore -----------------------------------------------------

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw !== null) {
        const snapshot = JSON.parse(raw) as Partial<DraftSnapshot>
        if (snapshot.values) {
          form.reset({ ...emptyWizardValues(), ...snapshot.values })
          setCategory(snapshot.category ?? null)
          setAttributes(snapshot.attributes ?? {})
          setSavedAt(snapshot.savedAt ?? null)
          setRestored(true)
        }
      }
    } catch {
      // A corrupt or unreadable snapshot must never block the form.
    }
    setHydrated(true)
    // Runs once per draft key; `form` is stable for the lifetime of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  // --- autosave: write -------------------------------------------------------

  useEffect(() => {
    if (!hydrated) return

    const snapshot = JSON.stringify({ values, category, attributes })
    if (snapshot === lastSnapshotRef.current) return

    const timer = window.setTimeout(() => {
      lastSnapshotRef.current = snapshot
      const now = Date.now()
      const payload: DraftSnapshot = { savedAt: now, values, category, attributes }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(payload))
        setSavedAt(now)
      } catch {
        // Private mode or a full quota — autosave is a convenience, not a contract.
      }
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [values, category, attributes, storageKey, hydrated])

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
    lastSnapshotRef.current = ''
    setSavedAt(null)
    setRestored(false)
  }, [storageKey])

  // --- validation ------------------------------------------------------------

  const applyIssues = useCallback(
    (issues: readonly z.ZodIssue[]): number | null => {
      const nextTierErrors: Record<string, string> = {}
      let firstStep: number | null = null

      for (const issue of issues) {
        const head = issue.path[0]
        if (typeof head !== 'string') continue

        const owningStep = FIELD_STEP[head]
        if (owningStep !== undefined && (firstStep === null || owningStep < firstStep)) {
          firstStep = owningStep
        }

        if (head === 'categoryId') {
          setCategoryError(t.productForm.categoryRequired)
          continue
        }

        if (head === 'priceTiers') {
          const index = issue.path[1]
          const field = issue.path[2]
          if (typeof index === 'number' && typeof field === 'string') {
            nextTierErrors[`${index}.${field}`] = issue.message
            continue
          }
        }

        if (FORM_FIELDS.includes(head)) {
          form.setError(head as Path<WizardValues>, { type: 'manual', message: issue.message })
        }
      }

      setTierErrors(nextTierErrors)
      return firstStep
    },
    [form, t],
  )

  const validateStep = useCallback(
    (index: number): boolean => {
      setFormError(null)

      if (index <= 1 && !category) {
        setCategoryError(t.productForm.categoryRequired)
        setFormError(t.productForm.categoryRequired)
        return false
      }
      setCategoryError(undefined)

      const schema = schemaForStep(index)
      if (!schema) return true

      const payload = buildPayload(
        form.getValues(),
        category?.id ?? '',
        toAttributeArray(attributes),
      )
      const parsed = schema.safeParse(payload)

      if (!parsed.success) {
        applyIssues(parsed.error.issues)
        setFormError(t.productForm.stepInvalid)
        return false
      }

      setTierErrors({})
      return true
    },
    [applyIssues, attributes, category, form, t],
  )

  const goTo = useCallback((index: number) => {
    setStep(Math.min(Math.max(index, 0), STEP_COUNT - 1))
    setFormError(null)
    // Put the reading position back at the top of the form instead of leaving the
    // viewport wherever the previous step happened to end.
    window.requestAnimationFrame(() => headingRef.current?.scrollIntoView({ block: 'start' }))
  }, [])

  const goNext = useCallback(() => {
    form.clearErrors()
    if (!validateStep(step)) return
    goTo(step + 1)
  }, [form, goTo, step, validateStep])

  // --- submit ----------------------------------------------------------------

  const submit = useCallback(
    (publish: boolean) => {
      setFormError(null)
      form.clearErrors()

      const payload = buildPayload(
        form.getValues(),
        category?.id ?? '',
        toAttributeArray(attributes),
      )

      const parsed = productSchema.safeParse(payload)
      if (!parsed.success) {
        const firstStep = applyIssues(parsed.error.issues)
        setFormError(t.errors.validation)
        if (firstStep !== null) goTo(firstStep)
        return
      }

      startTransition(async () => {
        const existingId = savedIdRef.current
        const result = existingId
          ? await updateProductAction(existingId, payload, { publish })
          : publish
            ? await publishProduct(payload)
            : await saveProductDraft(payload)

        if (!result.ok) {
          let firstStep: number | null = null
          for (const [field, message] of Object.entries(result.fields ?? {})) {
            const head = field.split('.')[0] ?? field
            const owningStep = FIELD_STEP[head]
            if (owningStep !== undefined && (firstStep === null || owningStep < firstStep)) {
              firstStep = owningStep
            }
            if (FORM_FIELDS.includes(head) && head !== 'priceTiers') {
              form.setError(head as Path<WizardValues>, { type: 'manual', message })
            }
          }
          if (firstStep !== null) goTo(firstStep)
          setFormError(resolveErrorMessage(t, result, fmt))
          return
        }

        savedIdRef.current = result.data.id

        if (publish) {
          clearDraft()
          toast({
            variant: 'success',
            title:
              mode === 'edit'
                ? t.productForm.updated
                : result.data.status === 'ACTIVE'
                  ? t.productForm.createdActive
                  : t.productForm.createdPending,
          })
          router.push(href('products', result.data.slug))
          router.refresh()
          return
        }

        toast({ variant: 'success', title: t.common.saveDraft, description: t.productForm.updated })

        // A draft saved from the create route has to become an edit route, otherwise a
        // reload would restore the same local snapshot and create the listing twice.
        if (existingId === undefined) {
          clearDraft()
          router.replace(href('products', result.data.slug, 'edit'))
        }
        router.refresh()
      })
    },
    [applyIssues, attributes, category, clearDraft, fmt, form, goTo, href, mode, router, t, toast],
  )

  // --- render ----------------------------------------------------------------

  const stepProps: StepProps = { form, values }
  const currentLabel = steps[step]?.label ?? ''
  const summary = fmt(t.productForm.stepOf, { current: step + 1, total: STEP_COUNT })

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
      <div ref={headingRef} className="scroll-mt-20">
        <h1 className="text-h2">
          {mode === 'edit' ? t.productForm.editTitle : t.productForm.createTitle}
        </h1>
      </div>

      <ProgressSteps
        className="mt-5"
        steps={steps}
        current={step}
        onStepClick={goTo}
        summary={summary}
        label={t.productForm.progressLabel}
      />

      {/* Announces the step change to a screen reader without stealing focus. */}
      <p aria-live="polite" className="sr-only">
        {`${summary}. ${currentLabel}`}
      </p>

      <div className="mt-6 space-y-5">
        {restored ? (
          <Alert variant="info">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{t.productForm.draftRestored}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearDraft()
                  form.reset(initialValues)
                  setCategory(initialCategory)
                  setAttributes(initialAttributes)
                  goTo(0)
                }}
              >
                {t.productForm.discardDraft}
              </Button>
            </div>
          </Alert>
        ) : null}

        {formError ? <Alert variant="destructive">{formError}</Alert> : null}

        <form
          noValidate
          onSubmit={(event) => {
            // Enter never submits a seven-step form; it advances one step, which is what
            // `enterKeyHint="next"` promises on a phone keyboard.
            event.preventDefault()
            if (step < STEP_COUNT - 1) goNext()
          }}
        >
          {step === 0 ? (
            <StepBasics
              {...stepProps}
              category={category}
              onCategoryChange={(next) => {
                setCategory(next)
                setCategoryError(undefined)
                // A different category means a different attribute set; keeping the old
                // values would silently file beef data under packaging.
                setAttributes({})
                if (next && isUnit(next.defaultUnit)) form.setValue('unit', next.defaultUnit)
              }}
              categoryError={categoryError}
            />
          ) : null}

          {step === 1 ? (
            <CategoryStep
              category={category}
              onCategoryChange={(next) => {
                setCategory(next)
                setCategoryError(undefined)
                setAttributes({})
                if (next && isUnit(next.defaultUnit)) form.setValue('unit', next.defaultUnit)
              }}
              error={categoryError}
            />
          ) : null}

          {step === 2 ? <StepPricing {...stepProps} tierErrors={tierErrors} /> : null}

          {step === 3 ? (
            <StepAttributes
              {...stepProps}
              attributes={resolvedAttributes}
              attributesLoading={attributesLoading}
              attributeValues={attributes}
              onAttributeChange={(attributeId, value) =>
                setAttributes((current) => {
                  const next = { ...current }
                  if (value === undefined) delete next[attributeId]
                  else next[attributeId] = value
                  return next
                })
              }
            />
          ) : null}

          {step === 4 ? <StepDelivery {...stepProps} districts={districts} /> : null}

          {step === 5 ? <StepMedia {...stepProps} documents={documents} /> : null}

          {step === 6 ? (
            <StepPreview
              values={values}
              category={category}
              attributes={resolvedAttributes}
              attributeValues={attributes}
              districts={districts}
              documents={documents}
              company={company}
            />
          ) : null}
        </form>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-border pt-5">
        <p className="text-caption text-muted-foreground">
          {savedAt === null
            ? t.productForm.autosaveHint
            : fmt(t.productForm.draftSaved, { time: formatTime(new Date(savedAt), locale) })}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => goTo(step - 1)}>
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              {t.common.back}
            </Button>
          ) : null}

          {step < STEP_COUNT - 1 ? (
            <Button type="button" onClick={goNext} className="flex-1 sm:flex-none">
              {t.common.next}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                loading={pending}
                onClick={() => submit(true)}
                className="flex-1 sm:flex-none"
              >
                {requireModeration ? t.productForm.submitForReview : t.productForm.publishNow}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => submit(false)}
              >
                <Save aria-hidden="true" className="h-4 w-4" />
                {t.common.saveDraft}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// --- step 2: confirm or refine the category ----------------------------------

interface TreeItem extends PickedCategory {
  parentId: string | null
  hasChildren: boolean
}

/**
 * Step 1 already got a category out of the seller; this step is where they either
 * accept it or go one level deeper. Precision matters commercially — "Мясо" and
 * "Мясо → Говядина → Охлаждённая" reach very different buyers — so the children of the
 * chosen node are offered explicitly instead of being buried in the picker.
 */
function CategoryStep({
  category,
  onCategoryChange,
  error,
}: {
  category: PickedCategory | null
  onCategoryChange: (category: PickedCategory | null) => void
  error?: string
}) {
  const { t, locale } = useI18n()
  const [children, setChildren] = useState<TreeItem[]>([])
  const [loading, setLoading] = useState(false)

  const categoryId = category?.id ?? null

  useEffect(() => {
    if (categoryId === null) {
      setChildren([])
      return
    }

    let cancelled = false
    setLoading(true)

    void fetch(`/api/categories/tree?locale=${locale}&parent=${categoryId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { items?: TreeItem[] } | null) => {
        if (!cancelled) setChildren(data?.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setChildren([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [categoryId, locale])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-h3">{t.productForm.categoryStepTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.productForm.categoryStepHint}</p>
      </div>

      <CategoryPicker
        value={category}
        onChange={onCategoryChange}
        label={t.productForm.whatSelling}
        placeholder={t.productForm.whatSellingPlaceholder}
        hint={t.productForm.whatSellingHint}
        error={error}
        appliesTo="PRODUCT"
      />

      {category ? (
        <section aria-labelledby="refine-category">
          <h3 id="refine-category" className="mb-1 text-sm font-medium">
            {t.productForm.refineCategory}
          </h3>
          <p className="mb-2 text-caption text-muted-foreground">
            {t.productForm.refineCategoryHint}
          </p>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              {t.common.loading}
            </p>
          ) : children.length === 0 ? (
            <p className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
              {t.productForm.noSubcategories}
            </p>
          ) : (
            <ul className="space-y-1">
              {children.map((child) => (
                <li key={child.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onCategoryChange({
                        id: child.id,
                        name: child.name,
                        trail: child.trail,
                        defaultUnit: child.defaultUnit,
                      })
                    }
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md border border-border px-3 text-left text-sm transition-colors hover:border-primary hover:bg-primary-soft"
                  >
                    <span className="min-w-0 break-words">{child.name}</span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  )
}
